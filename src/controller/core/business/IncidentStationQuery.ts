/**
 * @Description: 警情点位周边消防站及辖区查询（纯业务逻辑，无地图依赖）。
 * 从 DispatchT1.queryByCoordinate 中抽取，供 DispatchT1 和警情定位 store 共用。
 *
 * 完整流程：查询全量队站 → 转候选列表 → 查报警点辖区 → 确定主管/支撑队站 → 批量查辖区面
 * 调用方可通过传入 stationFeatures 复用缓存的队站数据，也可只用其中的单个步骤（如仅查辖区）。
 * 图层坐标系均为 EPSG:4326 / WGS-84，入参经纬度顺序为 [经度, 纬度]。
 * @FilePath: src/controller/core/business/IncidentStationQuery.ts
 */
import { getDistance } from 'ol/sphere'
import { geoserverApi } from '@/service/geoserver'

/** 消防站图层（gis:view_res_org_dept），几何字段 geom */
export const STATION_LAYER_NAME = 'gis:view_res_org_dept'
/** 辖区图层（gis:view_juris_zone），几何字段 zone_geom */
export const JURISDICTION_LAYER_NAME = 'gis:view_juris_zone'
/** 辖区图层中用于空间过滤的几何字段名 */
const JURISDICTION_GEOM_FIELD = 'zone_geom'

/** 默认支撑队站数量 */
const DEFAULT_SUPPORT_COUNT = 3
/** 默认半径步进（米） */
const DEFAULT_RADIUS_STEP_METERS = 10_000
/** 默认最大搜索半径（米） */
const DEFAULT_MAX_RADIUS_METERS = 40_000_000
/**
 * 点位转微小包围盒的容差（度，约 1m）。
 * WFS 1.1.0 / EPSG:4326 下 CQL 的 INTERSECTS(...,POINT(lon lat)) 点字面量不带
 * 坐标系，存在轴序/缺省 SRS 解析问题导致查不到；改用显式带 CRS 的 BBOX 包围点。
 */
const POINT_BBOX_TOLERANCE = 1e-5

/** [经度, 纬度]，EPSG:4326 */
export type Coordinate = [number, number]

/** 消防站候选（含与参照点的球面距离） */
export type StationCandidate = {
  id: string
  name: string
  address: string
  coordinate: Coordinate
  distanceMeters: number
}

/** 报警点命中的辖区信息（zone_id 即主管队站 ID） */
export type IncidentJurisdiction = {
  stationId: string
  zoneName: string
  geometry: GeoJSON.Geometry
}

/** 警情点位队站/辖区查询结果 */
export type IncidentStationResult = {
  /** 主管队站 */
  primary: StationCandidate
  /** 支撑队站（按距离升序） */
  support: StationCandidate[]
  /** 各入选队站辖区面，key = stationId */
  jurisdictions: Map<string, GeoJSON.Geometry>
  /** 报警点命中的辖区（可能为 null） */
  incidentJurisdiction: IncidentJurisdiction | null
  /** 本次支撑队站搜索半径（米） */
  searchRadiusMeters: number
}

/** queryIncidentStations 可选配置 */
export type QueryIncidentStationsOptions = {
  /** 画像/警情指定的主管队站 ID（未命中辖区时回退） */
  primaryStationId?: string | null
  /** 为 true 时主管判定以命中辖区优先，且同时返回所有支撑辖区 */
  showAllJurisdictions?: boolean
  /** 支撑队站数量，默认 3 */
  supportCount?: number
  /** 半径步进（米），默认 10_000 */
  radiusStepMeters?: number
  /** 最大搜索半径（米），默认 40_000_000 */
  maxRadiusMeters?: number
  /** 预取的队站 WFS 要素（传入则跳过 WFS 查询，用于缓存复用） */
  stationFeatures?: any[]
}

type WFSFeature = {
  geometry?: any
  properties?: Record<string, any>
}

/** CQL 字符串字面量转义（单引号双写） */
export const cqlLiteral = (value: string): string =>
  `'${String(value).replace(/'/g, "''")}'`

/**
 * 查询全量消防站 WFS 要素（gis:view_res_org_dept）。
 * 返回 GeoJSON Feature 数组，调用方可缓存复用。
 */
export const queryStationFeatures = async (): Promise<any[]> => {
  const data = await geoserverApi.getWFSFeatures(
    {
      typeName: STATION_LAYER_NAME,
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
    },
    'gis',
  )
  return data?.features ?? []
}

/**
 * 将 WFS 队站要素转为候选列表，按与参照点的球面距离升序排序。
 * 已删除（is_deleted）或坐标无效的要素被跳过；同 ID 只保留距离更近的。
 */
export const toStationCandidates = (
  features: any[],
  reference: Coordinate,
): StationCandidate[] => {
  const unique = new Map<string, StationCandidate>()
  for (const feature of features) {
    const properties = feature?.properties ?? {}
    if (properties.is_deleted === true) continue
    const id = String(properties.id ?? '')
    const coordinates = feature?.geometry?.coordinates
    const longitude = Number(properties.longitude ?? coordinates?.[0])
    const latitude = Number(properties.latitude ?? coordinates?.[1])
    if (!id || !Number.isFinite(longitude) || !Number.isFinite(latitude)) continue
    const coordinate: Coordinate = [longitude, latitude]
    const candidate: StationCandidate = {
      id,
      name: String(properties.org_name ?? properties.name ?? '未命名消防站'),
      address: String(properties.org_address ?? properties.address ?? '暂无地址'),
      coordinate,
      distanceMeters: getDistance(reference, coordinate),
    }
    const current = unique.get(id)
    if (!current || candidate.distanceMeters < current.distanceMeters) {
      unique.set(id, candidate)
    }
  }
  return [...unique.values()].sort((a, b) => a.distanceMeters - b.distanceMeters)
}

/**
 * 根据点位查询其所属辖区（gis:view_juris_zone）。
 * 使用显式带 CRS 的 BBOX 微小包围盒命中辖区面，规避 INTERSECTS 点字面量的轴序问题。
 * @param coordinate 点位 [经度, 纬度]（EPSG:4326）
 * @returns 命中辖区的 stationId / zoneName / geometry；未命中返回 null
 */
export const queryJurisdictionAtPoint = async (
  coordinate: Coordinate,
): Promise<IncidentJurisdiction | null> => {
  const [longitude, latitude] = coordinate
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new Error('查询辖区失败：经纬度无效')
  }

  const minX = longitude - POINT_BBOX_TOLERANCE
  const minY = latitude - POINT_BBOX_TOLERANCE
  const maxX = longitude + POINT_BBOX_TOLERANCE
  const maxY = latitude + POINT_BBOX_TOLERANCE

  const data = await geoserverApi.getWFSFeatures(
    {
      typeName: JURISDICTION_LAYER_NAME,
      cql_filter: `BBOX(${JURISDICTION_GEOM_FIELD},${minX},${minY},${maxX},${maxY},'EPSG:4326')`,
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
      maxFeatures: 1,
    },
    'gis',
  )

  const feature = data?.features?.[0] as WFSFeature | undefined
  const stationId = String(feature?.properties?.zone_id ?? '').trim()
  if (!feature?.geometry || !stationId) return null

  return {
    stationId,
    zoneName: String(feature?.properties?.zone_name ?? ''),
    geometry: feature.geometry as GeoJSON.Geometry,
  }
}

/**
 * 按队站 ID 批量查询辖区面（gis:view_juris_zone）。
 * @param stationIds 队站 ID 列表（对应 zone_id）
 * @returns Map<stationId, geometry>，未命中的 ID 不包含在结果中
 */
export const queryJurisdictionsByStationIds = async (
  stationIds: string[],
): Promise<Map<string, GeoJSON.Geometry>> => {
  const result = new Map<string, GeoJSON.Geometry>()
  if (!stationIds.length) return result
  const cqlFilter = stationIds
    .map((id) => `zone_id=${cqlLiteral(id)}`)
    .join(' OR ')
  const data = await geoserverApi.getWFSFeatures(
    {
      typeName: JURISDICTION_LAYER_NAME,
      cql_filter: cqlFilter,
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
    },
    'gis',
  )
  for (const feature of data?.features ?? []) {
    const id = String(feature?.properties?.zone_id ?? '')
    if (id && feature?.geometry) result.set(id, feature.geometry)
  }
  return result
}

/**
 * 按半径步进扩展支撑队站候选，直到达到目标数量或到达最大半径。
 * @param candidates 按距离升序排列的候选列表（不含主管站）
 * @returns 命中的支撑队站（截断至 count）和实际搜索半径
 */
export const expandSupportRadius = (
  candidates: StationCandidate[],
  options?: { count?: number; stepMeters?: number; maxMeters?: number },
): { stations: StationCandidate[]; radius: number } => {
  const count = options?.count ?? DEFAULT_SUPPORT_COUNT
  const step = options?.stepMeters ?? DEFAULT_RADIUS_STEP_METERS
  const maxRadius = options?.maxMeters ?? DEFAULT_MAX_RADIUS_METERS

  let radius = step
  let matches = candidates.filter((station) => station.distanceMeters <= radius)
  while (matches.length < count && radius < maxRadius) {
    radius += step
    matches = candidates.filter((station) => station.distanceMeters <= radius)
  }
  return { stations: matches.slice(0, count), radius }
}

/**
 * 警情点位队站/辖区完整查询：定位警情 → 查询主管/支撑队站及其辖区。
 *
 * 流程：查全量队站 → 转候选 → 查报警点辖区 → 确定主管/支撑 → 批量查辖区面
 * 主管判定：showAllJurisdictions 时以报警点命中辖区优先；否则以 primaryStationId 优先。
 * 报警点命中辖区即为主管辖区时，以点查结果覆盖批量结果，保证主管辖区与警情严格对齐。
 *
 * @param incidentCoordinate 报警点 [经度, 纬度]（EPSG:4326）
 * @param options 可选配置（主管 ID、是否展示全部辖区、预取要素等）
 * @returns 主管/支撑队站、辖区面、搜索半径
 * @throws 未查询到有效消防站、指定主管队站不存在等错误
 */
export const queryIncidentStations = async (
  incidentCoordinate: Coordinate,
  options?: QueryIncidentStationsOptions,
): Promise<IncidentStationResult> => {
  const stationFeatures = options?.stationFeatures ?? await queryStationFeatures()
  const candidates = toStationCandidates(stationFeatures, incidentCoordinate)
  if (!candidates.length) throw new Error('未查询到有效消防站')

  const incidentJurisdiction = await queryJurisdictionAtPoint(incidentCoordinate)

  // 主管判定：showAllJurisdictions 时命中辖区优先；否则 primaryStationId 优先
  const primaryStationId = options?.showAllJurisdictions
    ? incidentJurisdiction?.stationId || options?.primaryStationId || null
    : options?.primaryStationId || incidentJurisdiction?.stationId || null

  // 画像/辖区都未指定主管时，默认取候选首站兜底
  const primary = candidates.find((s) => s.id === primaryStationId) ?? candidates[0]
  if (primaryStationId && primary.id !== primaryStationId) {
    throw new Error('地图中未找到指定主管队站，请核对 primaryStationId')
  }

  // 支撑队站：排除主管站，按与主管站的直线距离升序
  const supportCandidates = candidates
    .filter((station) => station.id !== primary.id)
    .map((station) => ({
      ...station,
      distanceMeters: getDistance(primary.coordinate, station.coordinate),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)

  const expanded = expandSupportRadius(supportCandidates, {
    count: options?.supportCount,
    stepMeters: options?.radiusStepMeters,
    maxMeters: options?.maxRadiusMeters,
  })
  const selected = [primary, ...expanded.stations]

  // 批量拉取入选队站的辖区面
  const jurisdictions = await queryJurisdictionsByStationIds(
    selected.map((station) => station.id),
  )
  // 报警点命中的辖区即为主管辖区时，以点查结果覆盖批量结果
  if (incidentJurisdiction?.geometry && incidentJurisdiction.stationId === primary.id) {
    jurisdictions.set(primary.id, incidentJurisdiction.geometry)
  }

  return {
    primary,
    support: expanded.stations,
    jurisdictions,
    incidentJurisdiction,
    searchRadiusMeters: expanded.radius,
  }
}
