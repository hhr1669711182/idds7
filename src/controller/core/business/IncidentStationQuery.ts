/**
 * @Description: 警情点位周边消防站及辖区查询（纯业务逻辑，无地图依赖）。
 * 从 DispatchT1.queryByCoordinate 中抽取，供 DispatchT1 和警情定位 store 共用。
 *
 * 完整流程：viewparams 查询附近警情点附近队站 → 按 forcedPrimaryStationId/辖区确定主管 → 取支撑队站 → 批量查辖区面
 * 消息强制指定主管站（forcedPrimaryStationId）时优先按 id 定位主管，主管未命中仍返回附近支撑队站。
 * 调用方可复用其中的单个步骤（如仅查辖区）。
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
/** 附近消防站查询的默认最大返回数 */
const DEFAULT_NEARBY_MAX_FEATURES = 5

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
  /**
   * 主管队站。常规路径必有值；强制主管路径下消防站图层（view_res_org_dept）
   * 未命中该 id 时为 null，此时 support 仍返回警情点附近的支撑队站。
   */
  primary: StationCandidate | null
  /** 支撑队站（按距离升序） */
  support: StationCandidate[]
  /** 各入选队站辖区面，key = stationId；辖区图层（view_juris_zone）未命中时为空 Map */
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
  /**
   * 强制主管队站 ID（对应 view_juris_zone.zone_id，即 view_res_org_dept.id）。
   * 优先级最高：主管 id 优先从警情点附近候选中取，不在附近范围时按 id 精确补查；
   * 主管站未命中时 primary 为 null，但仍返回警情点附近的支撑队站。
   */
  forcedPrimaryStationId?: string | null
  /** 为 true 时主管判定以命中辖区优先，且同时返回所有支撑辖区 */
  showAllJurisdictions?: boolean
  /** 支撑队站数量，默认 3 */
  supportCount?: number
  /** 半径步进（米），默认 10_000 */
  radiusStepMeters?: number
  /** 最大搜索半径（米），默认 40_000_000 */
  maxRadiusMeters?: number
}

type WFSFeature = {
  geometry?: any
  properties?: Record<string, any>
}

/** CQL 字符串字面量转义（单引号双写） */
export const cqlLiteral = (value: string): string =>
  `'${String(value).replace(/'/g, "''")}'`

/**
 * 查询消防站 WFS 要素（gis:view_res_org_dept）。
 * @param stationId 传入时按 id 字段过滤仅查该队站（避免全量查询），缺省查全量
 * @returns GeoJSON Feature 数组，调用方可缓存复用
 */
export const queryStationFeatures = async (stationId?: string | null): Promise<any[]> => {
  const data = await geoserverApi.getWFSFeatures(
    {
      typeName: STATION_LAYER_NAME,
      ...(stationId ? { cql_filter: `id=${cqlLiteral(stationId)}` } : null),
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
    },
    'gis',
  )
  return data?.features ?? []
}

/**
 * 按坐标空间查询附近消防站 WFS 要素（viewparams 距离过滤 + maxFeatures 限制）。
 * 用 viewparams 参数指定查询范围，只拉取警情周边少量要素，避免数据量过大。
 * @param coordinate 参照点 [经度, 纬度]（EPSG:4326）
 * @param options 半径（度）与最大返回数
 * @returns GeoJSON Feature 数组，由调用方经 toStationCandidates 排序取最近 N 个
 */
export const queryNearbyStationFeatures = async (
  coordinate: Coordinate,
  options?: { radiusDegrees?: number; maxFeatures?: number },
): Promise<any[]> => {
  const [longitude, latitude] = coordinate
  const maxFeatures = options?.maxFeatures ?? DEFAULT_NEARBY_MAX_FEATURES
   const viewparams = `longitude:${longitude};latitude:${latitude};limit:${5}`;
  const data = await geoserverApi.getWFSFeatures(
    {
      typeName: 'gis:view_sys_org_limit',
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
      maxFeatures,
      viewparams,
    },
    'gis',
  )

  // 过滤坐标无效或不可调派的要素
  const validFeatures = (data?.features ?? []).filter((feature: WFSFeature) => {
    const properties = feature?.properties ?? {}
    const DEPT_TYPES = ['4','5','6','7']; // 可调派队站类型
    return properties.longitude !== undefined && properties.latitude !== undefined
     && DEPT_TYPES.includes(properties.dept_type ?? '')
  })
  return validFeatures
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
 * 对候选列表按坐标去重（相同经纬度只保留一个）。
 * 重复坐标组中包含主管站（keepId）时优先保留主管站，否则保留距离最近的第一个。
 * @param candidates 按距离升序排列的候选列表
 * @param keepId 优先保留的队站 ID（通常为已确定的主管站），可为 null
 * @returns 去重后的候选列表（保持原距离排序）
 */
export const dedupeCandidatesByCoordinate = (
  candidates: StationCandidate[],
  keepId?: string | null,
): StationCandidate[] => {
  const byCoordinate = new Map<string, StationCandidate>()
  const removedNames: string[] = []
  for (const station of candidates) {
    const key = `${station.coordinate[0]},${station.coordinate[1]}`
    const current = byCoordinate.get(key)
    if (!current) {
      byCoordinate.set(key, station)
      continue
    }
    if (station.id === keepId && current.id !== keepId) {
      // 重复坐标组中后到的是主管站：替换保留对象为主管站
      removedNames.push(current.name)
      byCoordinate.set(key, station)
    } else {
      removedNames.push(station.name)
    }
  }
  if (removedNames.length) {
    console.log('候选队站存在相同经纬度的重复点位，已去重 org_name =', removedNames.join('、'))
  }
  const keptIds = new Set([...byCoordinate.values()].map((station) => station.id))
  return candidates.filter((station) => keptIds.has(station.id))
}

/**
 * 根据点位查询其所属辖区（gis:view_juris_zone）。
 * 用 OGC XML Filter（Intersects + 显式 srsName 的 GML Point）做精确点面包含判断：
 * 点几何自带坐标系，由 GeoServer 重投影到图层 CRS，规避 CQL 点字面量的轴序/缺省
 * SRS 解析问题，也比 BBOX 微小包围盒近似更准确。
 * 同一警情点可能命中多个辖区（maxFeatures 5），全部返回由调用方按业务规则筛选。
 * @param coordinate 点位 [经度, 纬度]（EPSG:4326）
 * @returns 所有命中辖区的 stationId / zoneName / geometry；未命中返回空数组
 */
export const queryJurisdictionAtPoint = async (
  coordinate: Coordinate,
): Promise<IncidentJurisdiction[]> => {
  const [longitude, latitude] = coordinate
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new Error('查询辖区失败：经纬度无效')
  }

  // urn:x-ogc:def:crs:EPSG:4326 轴序固定为 lat lon，与服务端轴序配置无关
  const filter = [
    '<Filter xmlns:gml="http://www.opengis.net/gml">',
    '<Intersects>',
    `<PropertyName>${JURISDICTION_GEOM_FIELD}</PropertyName>`,
    '<gml:Point srsName="urn:x-ogc:def:crs:EPSG:4326">',
    `<gml:pos>${latitude} ${longitude}</gml:pos>`,
    '</gml:Point>',
    '</Intersects>',
    '</Filter>',
  ].join('')

  const data = await geoserverApi.getWFSFeatures(
    {
      typeName: JURISDICTION_LAYER_NAME,
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
      maxFeatures: 1,
      filter,
    },
    'gis',
  )

  const result: IncidentJurisdiction[] = []
  for (const feature of (data?.features ?? []) as WFSFeature[]) {
    const stationId = String(feature?.properties?.zone_id ?? '').trim()
    if (!feature?.geometry || !stationId) continue
    result.push({
      stationId,
      zoneName: String(feature?.properties?.zone_name ?? ''),
      geometry: feature.geometry as GeoJSON.Geometry,
    })
  }
  return result
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
 * 按队站 ID 批量查询队站坐标（gis:view_res_org_dept，按 id 字段过滤）。
 * @param stationIds 队站 ID 列表（对应 gis:view_res_org_dept.id）
 * @returns Map<stationId, [经度, 纬度]>，未命中的 ID 不包含在结果中
 */
export const queryStationCoordinatesByIds = async (
  stationIds: string[],
): Promise<Map<string, Coordinate>> => {
  const result = new Map<string, Coordinate>()
  if (!stationIds.length) return result
  const cqlFilter = stationIds
    .map((id) => `id=${cqlLiteral(id)}`)
    .join(' OR ')
  const data = await geoserverApi.getWFSFeatures(
    {
      typeName: STATION_LAYER_NAME,
      cql_filter: cqlFilter,
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
    },
    'gis',
  )
  for (const feature of data?.features ?? []) {
    const properties = feature?.properties ?? {}
    const id = String(properties.id ?? '')
    const coordinates = feature?.geometry?.coordinates
    const longitude = Number(properties.longitude ?? coordinates?.[0])
    const latitude = Number(properties.latitude ?? coordinates?.[1])
    if (id && Number.isFinite(longitude) && Number.isFinite(latitude)) {
      result.set(id, [longitude, latitude])
    }
  }
  return result
}

/**
 * 警情点位队站/辖区完整查询：定位警情 → 查询主管/支撑队站及其辖区。
 *
 * 统一先以 incidentCoordinate 为中心 viewparams 查询附近消防站（替代全量查询），主管判定优先级：
 * - forcedPrimaryStationId（消息强制）：按 id 精确查询（主管站可能离警情点较远）；
 * - 否则 primaryStationId（画像指定）：按 id 精确查询；
 * - 两者均无：按报警点命中辖区的 zone_id 反查主管队站；
 * - 以上均未命中时，取附近候选中画像 id 同 id 者，否则取距离最近首站兜底。
 * 报警点命中辖区即为主管辖区时，以点查结果覆盖批量结果，保证主管辖区与警情严格对齐。
 *
 * @param incidentCoordinate 报警点 [经度, 纬度]（EPSG:4326）
 * @param options 可选配置（主管 ID、是否展示全部辖区等）
 * @param options?..primaryStationId 画像指定的主管队站 ID
 * @param options?..forcedPrimaryStationId 强制指定主管队站 ID（优先匹配画像指定的 primaryStationId，否则取候选首站兜底）
 * @param options?..showAllJurisdictions 是否展示所有辖区（默认 false）
 * * @returns 主管/支撑队站、辖区面、搜索半径
 * @throws 未查询到有效消防站、指定主管队站不存在等错误
 */
export const queryIncidentStations = async (
  incidentCoordinate: Coordinate,
  options?: QueryIncidentStationsOptions,
): Promise<IncidentStationResult> => {
  console.log('queryIncidentStations主管队站', incidentCoordinate, options)
  const forcedPrimaryStationId = options?.forcedPrimaryStationId?.trim() || null
  // 画像/警情指定的主管队站 ID（优先级低于 forcedPrimaryStationId，未命中辖区时回退）
  const primaryStationId = options?.primaryStationId?.trim() || null

  // 用 viewparams 参数指定查询范围，只拉取警情周边少量要素，避免数据量过大。
  const nearbyFeatures = await queryNearbyStationFeatures(incidentCoordinate)
  // WFS 按距离返回的第一个原始要素；最终未进入 primary/support（即不会在地图上使用和渲染）时输出便于排查
  const firstNearbyFeature = nearbyFeatures[0]
  const firstNearbyId = String(firstNearbyFeature?.properties?.id ?? '')
  const nearbyCandidates = toStationCandidates(nearbyFeatures, incidentCoordinate)

  // 警情点位附近消防站
  if (!nearbyCandidates.length) throw new Error('未查询到有效消防站')

  let primary: StationCandidate | null = null // 主管队站
  let incidentJurisdiction: IncidentJurisdiction | null = null // 报警点命中辖区
  let jurisdictionQueried = false // 是否已按点位命中辖区反查主管队站
  let primaryFeatures; // 主管队站（点）要素
  if (forcedPrimaryStationId) {
    // 1. 消息强制主管：按 id 精准查找（主管站可能离警情点较远）
    primaryFeatures = await queryStationFeatures(forcedPrimaryStationId)
  } else if (primaryStationId) {
    // 2. 画像指定主管：按 id 精准查找
    primaryFeatures = await queryStationFeatures(primaryStationId)
  }

  if (primaryFeatures && primaryFeatures.length) {
    // primary 必须包含位置信息：坐标无效的要素会被 toStationCandidates 过滤
    const candidates = toStationCandidates(primaryFeatures, incidentCoordinate)
    primary = candidates[0] ?? null
  }

  // 3. 均未指定：按点位命中辖区反查主管队站（辖区 zone_id 即主管队站 id）
  if (!primary) {
    jurisdictionQueried = true
    const incidentJurisdictions = await queryJurisdictionAtPoint(incidentCoordinate)
    incidentJurisdiction = incidentJurisdictions[0] ?? null
    if(incidentJurisdiction && incidentJurisdiction.stationId){
      // 3.1 按点位命中辖区反查主管队站（辖区 zone_id 即主管队站 id）
      primaryFeatures = await queryStationFeatures(incidentJurisdiction?.stationId)
      if(primaryFeatures && primaryFeatures.length){
        // primary 必须包含位置信息：坐标无效的要素会被 toStationCandidates 过滤
        const candidates = toStationCandidates(primaryFeatures, incidentCoordinate)
        primary = candidates[0] ?? null
      }
    }
  }

  // 按 id 或点位辖区都未确定主管时，取距离最近首站兜底
  if (!primary) {
    console.log('地图中未找到指定主管队站，请核对 primaryStationId')
    primary = nearbyCandidates[0] ?? null
  }

  // 通过点位查找主管队站所属辖区（点可能命中多个辖区，暂时先取返回的第一个）
  if (!jurisdictionQueried) {
    const incidentJurisdictions = await queryJurisdictionAtPoint(incidentCoordinate)
    incidentJurisdiction = incidentJurisdictions[0] ?? null
  }

  // 找到主管后再按坐标去重：重复坐标组优先保留主管站，避免去重误删主管
  const dedupedCandidates = dedupeCandidatesByCoordinate(nearbyCandidates, primary.id)

  // 支撑队站：排除主管站，按与主管站的直线距离升序
  const supportCandidates = dedupedCandidates
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
  // const selected = [primary, ...expanded.stations]

  // 辖区面已不展示，注释批量拉取避免无效 WFS 请求（返回契约保留空 Map）
  const jurisdictions = new Map<string, GeoJSON.Geometry>()
  // 报警点辖区覆盖批量结果的逻辑已随批量查询一并注释
  // if (incidentJurisdiction?.geometry && incidentJurisdiction.stationId === primary.id) {
  //   jurisdictions.set(primary.id, incidentJurisdiction.geometry)
  // }

  if (firstNearbyFeature && primary.id !== firstNearbyId
    && !expanded.stations.some((s) => s.id === firstNearbyId)) {
    console.info('[queryIncidentStations] nearbyFeatures 第一个队站未进入 primary/support，地图上不会使用和渲染', firstNearbyFeature)
  }

  return {
    primary,
    support: expanded.stations,
    jurisdictions,
    incidentJurisdiction,
    searchRadiusMeters: expanded.radius,
  }
}
