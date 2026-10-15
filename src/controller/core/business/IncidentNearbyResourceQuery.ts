/**
 * @Description: 警情点位周边资源查询（纯业务逻辑，无地图依赖）。
 *
 * 以警情坐标为中心按半径（默认 500 米）做 WFS 空间过滤，目前查询四类资源：
 * - 消防栓：gis:env_fire_water（名称 water_name/symc/name，地址 address/sydz，点要素）
 * - 重点单位：gis:view_env_enterprises（名称 dept_name，地址 address_cn，类型 branch_type，点要素）
 * - 队站辖区：gis:view_juris_zone（名称 zone_name，ID zone_id，面要素，取质心算距离）
 * - 建筑：gis:view_env_building（名称 building_name/short_name，地址 address_name，ID building_id，面要素，取质心算距离）
 * 消防栓/重点单位/建筑几何字段为 geom，队站辖区为 zone_geom；坐标系 EPSG:4326 / WGS-84，入参经纬度顺序为 [经度, 纬度]。
 *
 * 空间过滤用 CQL INTERSECTS(几何字段, SRID=4326;<测地圆 POLYGON>)：
 * 用 @turf/circle 按半径生成测地圆多边形（64 边形，lon/lat 轴序），
 * 语义为"圆面与要素几何相交或包含"，与图上拖拽范围圈的视觉范围完全一致；
 * 加 SRID=4326 前缀强制 lon/lat 轴序，规避 WFS/WMS 1.1.0 的 lat/lon 默认轴序导致过滤失效。
 * 注：已实测该 GeoServer 的 DWITHIN(...meters) 距离计算不可靠
 * （500 米圈能命中 1.3 公里外的辖区、点图层甚至返回 0），故不用 DWITHIN。
 * 过滤后再由客户端用球面距离（ol/sphere.getDistance）升序排序。
 * 面要素（辖区/建筑）用 @turf/centroid 算质心后参与距离排序与坐标回传。
 * @FilePath: src/controller/core/business/IncidentNearbyResourceQuery.ts
 */
import { getDistance } from 'ol/sphere'
import { centroid, circle as turfCircle } from '@turf/turf'
import { geoserverApi } from '@/service/geoserver'
import type { Coordinate } from './IncidentStationQuery'

/** 消防栓图层（gis:env_fire_water），几何字段 geom，点要素 */
export const FIRE_HYDRANT_LAYER_NAME = 'gis:env_fire_water'
/** 重点单位图层（gis:view_env_enterprises），几何字段 geom，点要素 */
export const KEY_ENTERPRISE_LAYER_NAME = 'gis:view_env_enterprises'
/** 队站辖区图层（gis:view_juris_zone），几何字段 zone_geom，面要素（Polygon） */
export const JURIS_ZONE_LAYER_NAME = 'gis:view_juris_zone'
/** 建筑图层（gis:view_env_building），几何字段 geom，面要素（MultiPolygon） */
export const BUILDING_LAYER_NAME = 'gis:view_env_building'
/** 消防栓/重点单位图层统一的空间过滤几何字段名 */
const GEOM_FIELD = 'geom'
/** 队站辖区图层空间过滤几何字段名（不同于消防栓/重点单位） */
const JURIS_ZONE_GEOM_FIELD = 'zone_geom'

/** 默认周边资源搜索半径（米） */
export const DEFAULT_NEARBY_RESOURCE_RADIUS_METERS = 500
/** 单类资源默认最大返回数（圆面相交过滤后再客户端按距离排序） */
const DEFAULT_RESOURCE_MAX_FEATURES = 200

/** 周边资源类型 */
export type NearbyResourceKind = 'fireHydrant' | 'keyEnterprise' | 'jurisZone' | 'building'

/** 单个周边资源（含与警情点的球面距离） */
export type NearbyResource = {
  /** 要素 ID（properties.id 优先，回退 GeoJSON feature.id） */
  id: string
  /** 资源类型 */
  kind: NearbyResourceKind
  name: string
  address: string | null
  coordinate: Coordinate
  /** 与参照警情点的球面距离（米），升序排序依据 */
  distanceMeters: number
  /** 原始 GeoJSON Feature，供调用方取图层特有属性（如消防栓 sylx、重点单位 branch_type） */
  feature: Record<string, any>
}

/** 警情点周边资源查询结果（各自按距离升序） */
export type IncidentNearbyResourceResult = {
  /** 半径内消防栓 */
  fireHydrants: NearbyResource[]
  /** 半径内重点单位 */
  keyEnterprises: NearbyResource[]
  /** 半径内队站辖区 */
  jurisZones: NearbyResource[]
  /** 半径内建筑 */
  buildings: NearbyResource[]
}

/** queryIncidentNearbyResources 可选配置 */
export type QueryNearbyResourceOptions = {
  /** 搜索半径（米），默认 500 */
  radiusMeters?: number
  /** 消防栓最大返回数，默认 200 */
  fireHydrantMaxFeatures?: number
  /** 重点单位最大返回数，默认 200 */
  keyEnterpriseMaxFeatures?: number
  /** 队站辖区最大返回数，默认 200 */
  jurisZoneMaxFeatures?: number
  /** 建筑最大返回数，默认 200 */
  buildingMaxFeatures?: number
}

type WFSFeature = {
  id?: string
  geometry?: { type?: string; coordinates?: number[] | number[][] | number[][][] }
  properties?: Record<string, any>
}

/** 从要素属性中按候选字段名取第一个非空字符串 */
const pickString = (
  properties: Record<string, any>,
  candidates: string[],
): string | null => {
  for (const key of candidates) {
    const value = properties?.[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim()
    }
  }
  return null
}

/**
 * 读取要素坐标 [经度, 纬度]：
 * - Point：直接取 coordinates[0]/[1]
 * - Polygon/MultiPolygon：用 @turf/centroid 算质心（WGS-84），用于距离计算与弹窗定位
 * - 其他/无几何：回退属性中的 longitude/latitude，无效则返回 null
 */
const readFeatureCoordinate = (feature: WFSFeature): Coordinate | null => {
  const properties = feature?.properties ?? {}
  const geom = feature?.geometry
  if (geom?.type === 'Point') {
    const longitude = Number(geom.coordinates?.[0])
    const latitude = Number(geom.coordinates?.[1])
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
    return [longitude, latitude]
  }
  if (geom?.type === 'Polygon' || geom?.type === 'MultiPolygon') {
    try {
      const pt = centroid({ type: 'Feature', geometry: geom as any, properties: {} })
      const [longitude, latitude] = pt.geometry.coordinates
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
      return [longitude, latitude]
    } catch {
      // 质心计算失败，回退到属性
    }
  }
  const longitude = Number(properties.longitude)
  const latitude = Number(properties.latitude)
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  return [longitude, latitude]
}

/** 测地圆多边形边数（越多越接近圆，CQL 越长；64 与图上 turf 圈一致） */
const GEODESIC_CIRCLE_STEPS = 64

/**
 * 生成测地圆多边形的 WKT（EPSG:4326，lon/lat 轴序，首尾闭合），
 * 供 CQL INTERSECTS 与 GeoServer 空间过滤使用。turf circle 半径按球面距离计算。
 */
export const buildGeodesicCircleWkt = (
  coordinate: Coordinate,
  radiusMeters: number,
  steps: number = GEODESIC_CIRCLE_STEPS,
): string => {
  const circlePoly = turfCircle(coordinate, radiusMeters / 1000, {
    steps,
    units: 'kilometers',
  })
  const ring = circlePoly.geometry.coordinates[0]
    .map(([lng, lat]) => `${lng} ${lat}`)
    .join(', ')
  return `POLYGON((${ring}))`
}

/**
 * 拼接单个范围圈的 CQL INTERSECTS 条件（带 SRID=4326 前缀强制 lon/lat 轴序）。
 * 导出供地图侧 WMS 图层 CQL_FILTER 复用，保证 WFS/WMS 过滤口径一致。
 */
export const buildCircleIntersectsCql = (
  geomField: string,
  coordinate: Coordinate,
  radiusMeters: number,
): string =>
  `INTERSECTS(${geomField},SRID=4326;${buildGeodesicCircleWkt(coordinate, radiusMeters)})`

/**
 * 范围内 WFS 要素查询：以警情点为中心的测地圆与要素几何相交（相交或包含）。
 * @param typeName 图层名（workspace:layer）
 * @param coordinate 圆心 [经度, 纬度]（EPSG:4326）
 * @param radiusMeters 半径（米）
 * @param maxFeatures 最大返回数
 * @param geomField 空间过滤几何字段名（默认 geom；辖区图层为 zone_geom）
 */
const queryFeaturesWithin = async (
  typeName: string,
  coordinate: Coordinate,
  radiusMeters: number,
  maxFeatures: number,
  geomField: string = GEOM_FIELD,
): Promise<WFSFeature[]> => {
  const cqlFilter = buildCircleIntersectsCql(geomField, coordinate, radiusMeters)
  const data = await geoserverApi.getWFSFeatures(
    {
      typeName,
      cql_filter: cqlFilter,
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
      maxFeatures,
    },
    'gis',
  )
  return (data?.features ?? []) as WFSFeature[]
}

/**
 * 将范围内 WFS 要素转为周边资源列表：计算球面距离、按距离升序、同 ID 只保留最近的。
 * @param features 圆面 INTERSECTS 查询返回的原始要素
 * @param reference 参照警情点 [经度, 纬度]
 * @param kind 资源类型
 * @param nameFields 名称候选属性字段（按优先级）
 * @param addressFields 地址候选属性字段（按优先级）
 */
export const toNearbyResources = (
  features: WFSFeature[],
  reference: Coordinate,
  kind: NearbyResourceKind,
  nameFields: string[],
  addressFields: string[],
  idFields: string[] = ['id'],
): NearbyResource[] => {
  const unique = new Map<string, NearbyResource>()
  for (const feature of features) {
    const properties = feature?.properties ?? {}
    const coordinate = readFeatureCoordinate(feature)
    if (!coordinate) continue
    const id = pickString(properties, [...idFields, 'id']) ?? String(feature.id ?? '').trim()
    if (!id) continue
    const resource: NearbyResource = {
      id,
      kind,
      name: pickString(properties, nameFields) ?? '未命名',
      address: pickString(properties, addressFields),
      coordinate,
      distanceMeters: getDistance(reference, coordinate),
      feature: feature as Record<string, any>,
    }
    const current = unique.get(id)
    if (!current || resource.distanceMeters < current.distanceMeters) {
      unique.set(id, resource)
    }
  }
  return [...unique.values()].sort((a, b) => a.distanceMeters - b.distanceMeters)
}

/**
 * 查询警情点半径内消防栓（gis:env_fire_water），按距离升序返回。
 * @param coordinate 警情点 [经度, 纬度]（EPSG:4326）
 * @param radiusMeters 半径（米），默认 500
 * @param maxFeatures 最大返回数，默认 200
 */
export const queryNearbyFireHydrants = async (
  coordinate: Coordinate,
  radiusMeters: number = DEFAULT_NEARBY_RESOURCE_RADIUS_METERS,
  maxFeatures: number = DEFAULT_RESOURCE_MAX_FEATURES,
): Promise<NearbyResource[]> => {
  const features = await queryFeaturesWithin(
    FIRE_HYDRANT_LAYER_NAME,
    coordinate,
    radiusMeters,
    maxFeatures,
  )
  return toNearbyResources(features, coordinate, 'fireHydrant', ['water_name', 'symc', 'name'], ['address', 'sydz'])
}

/**
 * 查询警情点半径内重点单位（gis:view_env_enterprises），按距离升序返回。
 * @param coordinate 警情点 [经度, 纬度]（EPSG:4326）
 * @param radiusMeters 半径（米），默认 500
 * @param maxFeatures 最大返回数，默认 200
 */
export const queryNearbyKeyEnterprises = async (
  coordinate: Coordinate,
  radiusMeters: number = DEFAULT_NEARBY_RESOURCE_RADIUS_METERS,
  maxFeatures: number = DEFAULT_RESOURCE_MAX_FEATURES,
): Promise<NearbyResource[]> => {
  const features = await queryFeaturesWithin(
    KEY_ENTERPRISE_LAYER_NAME,
    coordinate,
    radiusMeters,
    maxFeatures,
  )
  return toNearbyResources(features, coordinate, 'keyEnterprise', ['dept_name', 'name'], ['address_cn', 'address'])
}

/**
 * 查询警情点半径内队站辖区（gis:view_juris_zone），按距离升序返回。
 * 辖区为面要素（MultiPolygon），圆面相交过滤后用质心参与距离排序与坐标回传。
 * @param coordinate 警情点 [经度, 纬度]（EPSG:4326）
 * @param radiusMeters 半径（米），默认 500
 * @param maxFeatures 最大返回数，默认 200
 */
export const queryNearbyJurisZones = async (
  coordinate: Coordinate,
  radiusMeters: number = DEFAULT_NEARBY_RESOURCE_RADIUS_METERS,
  maxFeatures: number = DEFAULT_RESOURCE_MAX_FEATURES,
): Promise<NearbyResource[]> => {
  const features = await queryFeaturesWithin(
    JURIS_ZONE_LAYER_NAME,
    coordinate,
    radiusMeters,
    maxFeatures,
    JURIS_ZONE_GEOM_FIELD,
  )
  return toNearbyResources(features, coordinate, 'jurisZone', ['zone_name'], [], ['zone_id'])
}

/**
 * 查询警情点半径内建筑（gis:view_env_building），按距离升序返回。
 * 建筑为面要素（MultiPolygon），圆面相交过滤后用质心参与距离排序与坐标回传。
 * @param coordinate 警情点 [经度, 纬度]（EPSG:4326）
 * @param radiusMeters 半径（米），默认 500
 * @param maxFeatures 最大返回数，默认 200
 */
export const queryNearbyBuildings = async (
  coordinate: Coordinate,
  radiusMeters: number = DEFAULT_NEARBY_RESOURCE_RADIUS_METERS,
  maxFeatures: number = DEFAULT_RESOURCE_MAX_FEATURES,
): Promise<NearbyResource[]> => {
  const features = await queryFeaturesWithin(
    BUILDING_LAYER_NAME,
    coordinate,
    radiusMeters,
    maxFeatures,
  )
  return toNearbyResources(features, coordinate, 'building', ['building_name', 'short_name'], ['address_name'], ['building_id'])
}

/**
 * 警情点位周边资源完整查询：并行查询半径内消防栓、重点单位、队站辖区与建筑。
 *
 * 四类资源互不影响：单个图层查询失败时仅告警，该类返回空列表，
 * 避免一类资源服务异常导致另一类也无法上图。入参经纬度无效时直接抛错。
 *
 * @param incidentCoordinate 警情点 [经度, 纬度]（EPSG:4326）
 * @param options 可选配置（半径、各类最大返回数）
 * @returns 半径内消防栓/重点单位/队站辖区/建筑列表（各自按距离升序）
 */
export const queryIncidentNearbyResources = async (
  incidentCoordinate: Coordinate,
  options?: QueryNearbyResourceOptions,
): Promise<IncidentNearbyResourceResult> => {
  const [longitude, latitude] = incidentCoordinate
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new Error('查询周边资源失败：经纬度无效')
  }
  const radiusMeters = options?.radiusMeters ?? DEFAULT_NEARBY_RESOURCE_RADIUS_METERS
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
    throw new Error('查询周边资源失败：半径无效')
  }

  const [hydrantResult, enterpriseResult, zoneResult, buildingResult] = await Promise.allSettled([
    queryNearbyFireHydrants(
      incidentCoordinate,
      radiusMeters,
      options?.fireHydrantMaxFeatures ?? DEFAULT_RESOURCE_MAX_FEATURES,
    ),
    queryNearbyKeyEnterprises(
      incidentCoordinate,
      radiusMeters,
      options?.keyEnterpriseMaxFeatures ?? DEFAULT_RESOURCE_MAX_FEATURES,
    ),
    queryNearbyJurisZones(
      incidentCoordinate,
      radiusMeters,
      options?.jurisZoneMaxFeatures ?? DEFAULT_RESOURCE_MAX_FEATURES,
    ),
    queryNearbyBuildings(
      incidentCoordinate,
      radiusMeters,
      options?.buildingMaxFeatures ?? DEFAULT_RESOURCE_MAX_FEATURES,
    ),
  ])

  if (hydrantResult.status === 'rejected') {
    console.warn('[queryIncidentNearbyResources] 查询周边消防栓失败', hydrantResult.reason)
  }
  if (enterpriseResult.status === 'rejected') {
    console.warn('[queryIncidentNearbyResources] 查询周边重点单位失败', enterpriseResult.reason)
  }
  if (zoneResult.status === 'rejected') {
    console.warn('[queryIncidentNearbyResources] 查询周边队站辖区失败', zoneResult.reason)
  }
  if (buildingResult.status === 'rejected') {
    console.warn('[queryIncidentNearbyResources] 查询周边建筑失败', buildingResult.reason)
  }

  return {
    fireHydrants: hydrantResult.status === 'fulfilled' ? hydrantResult.value : [],
    keyEnterprises: enterpriseResult.status === 'fulfilled' ? enterpriseResult.value : [],
    jurisZones: zoneResult.status === 'fulfilled' ? zoneResult.value : [],
    buildings: buildingResult.status === 'fulfilled' ? buildingResult.value : [],
  }
}
