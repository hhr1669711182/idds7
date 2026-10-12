/**
 * 检索查询编排：把「高德地址」与「GIS 资源」两个数据源、两种检索模式
 * 统一成同一份结果 DTO，并生成与 WMS 上图共用的 CQL 条件。
 * 本层只做数据编排，不含 UI，不持有 OL 实例。
 */
import { amapApi, type PoiFeature, type PoiFeatureCollection } from '@/apis/amap'
import { geoserverApi } from '@/service/geoserver'
import { LAYER_SOURCE_CONFIGS } from '@/config/layers'
import {
  SEARCH_MAX_FEATURES,
  type ResourceFilterSet,
  type SearchItemSource,
  type SearchQueryParams,
  type SearchResultBucket,
  type SearchResultItem,
  type SearchViewOption,
} from '@/types/search'

/** 可参与模糊检索的图层（name 仅展示，id 为唯一数据依据） */
export const SEARCHABLE_LAYERS = LAYER_SOURCE_CONFIGS

/** 视图下拉可选项：name 展示、id 查询 */
export const getSearchViewOptions = (): SearchViewOption[] =>
  SEARCHABLE_LAYERS.map((layer) => ({ name: layer.name, id: layer.id }))

/** 转义 CQL 字符串字面量中的单引号，避免注入与语法错误 */
const escapeCql = (value: string) => value.replace(/'/g, "''")

/** 把关键词转成大小写不敏感的 CQL LIKE 条件（字段统一为 name，不做字段探查） */
export const buildKeywordCql = (keyword: string) =>
  `strToLowerCase(name) LIKE '%${escapeCql(keyword.trim().toLowerCase())}%'`

/** 视口范围（BBOX）。GeoServer 的 BBOX 参数顺序为 minx,miny,maxx,maxy */
export const buildViewportCql = (viewport: [number, number, number, number]) =>
  `BBOX(geom, ${viewport[0]}, ${viewport[1]}, ${viewport[2]}, ${viewport[3]}, 'EPSG:4326')`

/** 圈选范围（DWITHIN），与 CircleQueryTool.updateWMSLayer 保持一致 */
export const buildCircleCql = (center: [number, number], radiusMeters: number) =>
  `DWITHIN(geom, Point(${center[0]} ${center[1]}),${radiusMeters},meters)`

/** 把多个条件用 AND 串成一个 CQL；空条件返回 1=1（不过滤） */
const combineCql = (...parts: (string | undefined)[]) => {
  const valid = parts.filter((part): part is string => !!part && part !== '1=1')
  return valid.length ? valid.join(' AND ') : '1=1'
}
/**
 * 构造检索条件集合：同一份 CQL（列表）与WMS（上图）共用，
 * 保证「图上有、列表无」不会发生。
 */
export const buildResourceFilter = (params: SearchQueryParams): ResourceFilterSet => {
  const { keyword, typeName, typeNames, viewport, circle } = params
  const keywordCql = keyword.trim() ? buildKeywordCql(keyword) : undefined
  const spatialCql = circle
    ? buildCircleCql(circle.center, circle.radiusMeters)
    : viewport
      ? buildViewportCql(viewport)
      : undefined
  const cql = combineCql(keywordCql, spatialCql)

  // 图层集合优先级：显式 typeNames > 单个 typeName > 全部可检索图层
  const targetIds = typeNames?.length
    ? typeNames
    : typeName
      ? SEARCHABLE_LAYERS.filter((layer) => layer.id === typeName).map((layer) => layer.id)
      : SEARCHABLE_LAYERS.map((layer) => layer.id)

  return {
    typeNames: targetIds,
    filters: targetIds.map(() => cql),
  }
}

/** 按 typeName 查中文名，供列表分组展示；未登记的图层回退用 id 本身 */
export const getLayerNameMap = (): Map<string, string> =>
  new Map(SEARCHABLE_LAYERS.map((layer) => [layer.id, layer.name]))

const isValidCoord = (value: unknown): value is [number, number] => {
  if (!Array.isArray(value) || value.length < 2) return false
  const [x, y] = value
  return Number.isFinite(Number(x)) && Number.isFinite(Number(y))
}

/** 高德 POI Feature → 检索结果条目（坐标已是 WGS84，直接使用） */
const mapPoiFeature = (feature: PoiFeature): SearchResultItem | null => {
  const props = feature?.properties
  const lngLat = feature?.geometry?.coordinates
  if (!props || !isValidCoord(lngLat)) return null
  return {
    key: `amap:${props.id ?? feature.id}`,
    source: 'amap' as SearchItemSource,
    id: String(props.id ?? feature.id ?? ''),
    title: props.name || props.address || '未命名地点',
    subtitle: [props.district, props.address].filter(Boolean).join(' '),
    lngLat: [Number(lngLat[0]), Number(lngLat[1])],
    locatable: true,
  }
}

/** 文本字段兜底：按优先级取第一个有值的字段 */
const pickText = (props: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = props[key]
    if (value !== null && value !== undefined && `${value}`.trim()) return `${value}`.trim()
  }
  return ''
}

/** 从 GeoJSON geometry 中提取代表点（点直接取，面/线取包络中心） */
const extractCoord = (geometry: Record<string, unknown> | null | undefined): [number, number] | null => {
  if (!geometry) return null
  const type = geometry.type as string | undefined
  const coordinates = geometry.coordinates
  if (type === 'Point' && isValidCoord(coordinates)) {
    return [Number(coordinates[0]), Number(coordinates[1])]
  }
  const flatten = (input: unknown, out: number[] = []): number[] => {
    if (Array.isArray(input)) {
      input.forEach((item) => flatten(item, out))
      return out
    }
    if (Number.isFinite(Number(input))) out.push(Number(input))
    return out
  }
  const flat = flatten(coordinates)
  if (flat.length < 4) return null
  const xs = flat.filter((_, i) => i % 2 === 0)
  const ys = flat.filter((_, i) => i % 2 === 1)
  const coord: [number, number] = [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ]
  return Number.isFinite(coord[0]) && Number.isFinite(coord[1]) ? coord : null
}

/** WFS GeoJSON Feature → 检索结果条目 */
const mapWfsFeature = (
  feature: Record<string, unknown>,
  layerName: string,
  typeName: string,
  maxFeatures: number,
): SearchResultItem | null => {
  const props = (feature?.properties ?? {}) as Record<string, unknown>
  const id = String(feature.id ?? props.id ?? '')
  const title = pickText(props, ['name', 'NAME', 'title', 'ORGNAME', 'RESNAME']) || `${layerName}`
  const lngLat = extractCoord(feature.geometry as Record<string, unknown> | undefined)
  return {
    key: `wfs:${typeName}:${id || `${maxFeatures}-${title}`}`,
    source: 'wfs' as SearchItemSource,
    id,
    title,
    subtitle: pickText(props, ['address', 'ADDRESS', 'remark']) || layerName,
    layerName,
    typeName,
    lngLat,
    locatable: lngLat !== null,
  }
}

const emptyBucket = (): SearchResultBucket => ({ items: [], truncated: false, failedLayers: 0 })

/** 地址信息 tab：高德模糊查询（返回已是 WGS84，不做坐标转换） */
export const searchAmapAddress = async (
  keyword: string,
  maxFeatures = SEARCH_MAX_FEATURES,
): Promise<SearchResultBucket> => {
  const bucket = emptyBucket()
  const text = keyword.trim()
  if (!text) return bucket
  try {
    // 高德单页上限远小于 1 万，这里按接口 offset 语义取合理页大小
    const response = await amapApi.keywordSearch({ keywords: text, offset: 20, page: 1 })
    const collection = response as PoiFeatureCollection | undefined
    const features = Array.isArray(collection?.features) ? collection.features : []
    bucket.items = features
      .map(mapPoiFeature)
      .filter((item): item is SearchResultItem => item !== null)
      .slice(0, maxFeatures)
  } catch (error) {
    console.warn('[searchQuery] searchAmapAddress failed:', error)
    bucket.items = []
  }
  return bucket
}

/** 消防资源 tab：WFS 并发查询多个图层，仅用于列表回显 */
export const searchGisResources = async (
  params: SearchQueryParams,
  layerNames: Map<string, string> = getLayerNameMap(),
  maxFeatures = SEARCH_MAX_FEATURES,
): Promise<SearchResultBucket> => {
  const bucket = emptyBucket()
  const { typeNames, filters } = buildResourceFilter(params)
  if (!typeNames.length) return bucket

  const perLayerLimit = Math.max(1, Math.floor(maxFeatures / typeNames.length))
  const settled = await Promise.allSettled(
    typeNames.map((typeName, index) =>
      geoserverApi
        .getWFSFeatures({
          typeName,
          cql_filter: filters[index],
          maxFeatures: perLayerLimit,
          outputFormat: 'application/json',
        })
        .then((response) => ({ typeName, response })),
    ),
  )

  const collected: SearchResultItem[] = []
  settled.forEach((outcome) => {
    if (outcome.status === 'rejected') {
      bucket.failedLayers = (bucket.failedLayers ?? 0) + 1
      return
    }
    const { typeName, response } = outcome.value
    const payload = response as {
      features?: Record<string, unknown>[]
      totalFeatures?: number | string
      numberMatched?: number | string
    }
    const features = Array.isArray(payload?.features) ? payload.features : []
    const matched = Number(payload?.totalFeatures ?? payload?.numberMatched ?? features.length)
    if (Number.isFinite(matched) && matched > features.length) bucket.truncated = true
    const layerName = layerNames.get(typeName) ?? typeName
    features.forEach((feature) => {
      const item = mapWfsFeature(feature, layerName, typeName, perLayerLimit)
      if (item) collected.push(item)
    })
  })

  if (collected.length > maxFeatures) bucket.truncated = true
  bucket.items = collected.slice(0, maxFeatures)
  return bucket
}

/** 同时检索两个数据源，互不阻塞（任一失败不影响另一方） */
export const runSearch = async (
  params: SearchQueryParams,
): Promise<{ address: SearchResultBucket; resource: SearchResultBucket; filter: ResourceFilterSet }> => {
  const maxFeatures = params.maxFeatures ?? SEARCH_MAX_FEATURES
  const [address, resource] = await Promise.all([
    params.typeName || params.typeNames?.length
      ? Promise.resolve(emptyBucket())
      : searchAmapAddress(params.keyword, maxFeatures),
    searchGisResources(params, getLayerNameMap(), maxFeatures),
  ])
  return { address, resource, filter: buildResourceFilter(params) }
}

