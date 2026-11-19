// 用途：行政区划（gis:env_area）层级查询与围栏几何查询。
import { geoserverApi } from '@/apis/geoserver'
import { gcj02ToWgs84, type LngLat } from '@/utils/coordTransform'

/** 行政区划层级（gis:env_area.addrlevel_id） */
export const AREA_LEVEL = {
  PROVINCE: 1,
  CITY: 2,
  DISTRICT: 3,
  STREET: 4,
} as const

/** 行政区划节点（gis:env_area 属性表，geometry 恒为 null，只有属性） */
export interface AreaNode {
  /** 行政区划编码，如 110000 / 230112 / 230112008 */
  areaCode: string
  /** 行政区划名称 */
  areaName: string
  /** 父级编码，根节点为 '0' */
  parentCode: string
  /** 层级：1省 2市 3区县 4街道乡镇 */
  level: number
  /** 同级排序号 */
  seq: number
}

/** 围栏几何（EPSG:4326 / WGS-84） */
export interface AreaFence {
  areaCode: string
  areaName: string
  geometry: GeoJSON.Geometry
}

/** 主管队站（gis:view_res_org_dept，EPSG:4326 / WGS-84） */
export interface JurisdictionStation {
  /** 队站 id */
  id: string
  /** 队站名称 */
  name: string
  /** 所属行政区划编码 */
  areaCode: string
  /** 所属行政区划名称（由 env_area 关联得到） */
  areaName: string
  /** 队站经纬度 [经度, 纬度] */
  lngLat: [number, number]
}

/** 队站辖区（gis:view_juris_zone，EPSG:4326 / WGS-84） */
export interface JurisdictionZone {
  /** 辖区 id，等于对应队站的 id */
  zoneId: string
  /** 辖区名称 */
  zoneName: string
  /** 所属行政区划编码 */
  areaCode: string
  /** 所属行政区划名称 */
  areaName: string
  /** 辖区围栏几何 */
  geometry: GeoJSON.Geometry
}

type WfsFeature = {
  id?: string | number
  geometry?: GeoJSON.Geometry | null
  properties?: Record<string, unknown>
}

type WfsFeatureCollection = {
  features?: WfsFeature[]
}

const AREA_LAYER = 'gis:env_area'
const AREA_FENCE_LAYER = 'gis:env_area_fence'
const ORG_DEPT_LAYER = 'gis:view_res_org_dept'
const JURIS_ZONE_LAYER = 'gis:view_juris_zone'
/** DataV GeoAtlas 行政区边界（GCJ-02），仅作为围栏缺失时的兜底 */
const DATAV_BOUNDARY_BASE = 'https://geo.datav.aliyun.com/areas_v3/bound'

const readString = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

const readNumber = (value: unknown): number => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const toAreaNode = (feature: WfsFeature): AreaNode | null => {
  const properties = feature?.properties ?? {}
  const areaCode = readString(properties.area_code)
  if (!areaCode) return null
  return {
    areaCode,
    areaName: readString(properties.area_name),
    parentCode: readString(properties.parent_code),
    level: readNumber(properties.addrlevel_id),
    seq: readNumber(properties.seq),
  }
}

/**
 * 按 area_code 精确获取单个行政区划（CQL 定向查询，1 条 WFS）。
 * @param areaCode 行政区划编码
 */
export const fetchAreaByCode = async (areaCode: string): Promise<AreaNode | null> => {
  if (!areaCode) return null
  const data = (await geoserverApi.getWFSFeatures(
    {
      typeName: AREA_LAYER,
      cql_filter: `area_code='${areaCode}'`,
      propertyName: 'area_code,area_name,parent_code,addrlevel_id,seq',
      outputFormat: 'application/json',
      maxFeatures: 1,
    },
    'gis',
  )) as WfsFeatureCollection

  const feature = (data?.features ?? [])[0]
  if (!feature) return null
  return toAreaNode(feature)
}

/**
 * 按 parent_code 获取下一级行政区划（CQL 定向查询，1 条 WFS）。
 * @param parentCode 父级 area_code
 */
export const fetchAreaChildren = async (parentCode: string): Promise<AreaNode[]> => {
  if (!parentCode) return []
  const data = (await geoserverApi.getWFSFeatures(
    {
      typeName: AREA_LAYER,
      cql_filter: `parent_code='${parentCode}'`,
      propertyName: 'area_code,area_name,parent_code,addrlevel_id,seq',
      outputFormat: 'application/json',
      maxFeatures: 100,
    },
    'gis',
  )) as WfsFeatureCollection

  return (data?.features ?? [])
    .map(toAreaNode)
    .filter((node): node is AreaNode => node !== null)
    .sort((a, b) => a.seq - b.seq)
}

/**
 * 拉取行政区划围栏几何。
 * 数据源 gis:env_area_fence 只有稀疏的少量数据（区县级为主），
 * 街道级普遍缺失，因此查不到时由调用方决定是否降级。
 */
export const fetchAreaFence = async (areaCode: string): Promise<AreaFence | null> => {
  if (!areaCode) return null
  const data = (await geoserverApi.getWFSFeatures(
    {
      typeName: AREA_FENCE_LAYER,
      cql_filter: `area_id='${areaCode}'`,
      outputFormat: 'application/json',
      maxFeatures: 1,
    },
    'gis',
  )) as WfsFeatureCollection

  const feature = (data?.features ?? []).find((item) => item?.geometry)
  if (!feature?.geometry) return null
  const properties = feature.properties ?? {}
  return {
    areaCode: readString(properties.area_id) || areaCode,
    areaName: readString(properties.area_name),
    geometry: feature.geometry,
  }
}

/** GeoJSON 坐标数组递归转 WGS-84（DataV 源为 GCJ-02） */
const convertCoordinates = (coordinates: unknown): unknown => {
  if (!Array.isArray(coordinates)) return coordinates
  if (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    const [lng, lat] = gcj02ToWgs84([coordinates[0], coordinates[1]] as LngLat)
    return [lng, lat]
  }
  return coordinates.map((item) => convertCoordinates(item))
}

/**
 * DataV GeoAtlas 行政区边界兜底（仅省/市/区县级有，街道级 404）。
 * 返回几何已从 GCJ-02 转 WGS-84，与地图底图坐标系一致。
 */
export const fetchAreaBoundary = async (areaCode: string): Promise<AreaFence | null> => {
  if (!areaCode) return null
  const response = await fetch(`${DATAV_BOUNDARY_BASE}/${areaCode}.json`)
  if (!response.ok) return null
  const body = (await response.json()) as {
    features?: Array<{ geometry?: GeoJSON.Geometry; properties?: Record<string, unknown> }>
  }
  const feature = (body?.features ?? []).find((item) => item?.geometry)
  if (!feature?.geometry) return null
  const properties = feature.properties ?? {}
  const geometry = feature.geometry as Exclude<GeoJSON.Geometry, GeoJSON.GeometryCollection>
  return {
    areaCode,
    areaName: readString(properties.name),
    geometry: {
      ...geometry,
      coordinates: convertCoordinates(geometry.coordinates) as GeoJSON.Position[],
    } as GeoJSON.Geometry,
  }
}

/**
 * 拉取指定区划编码列表下的主管队站。
 * 队站表按 area_id 关联行政区划；调用方传入 root + 直接下级的 area_code 列表做 IN 匹配。
 * @param codeList 区划编码列表（通常 1~10 条）
 * @param areaNames 区划编码 → 区划名映射，用于补全展示
 */
export const fetchJurisdictionStations = async (
  codeList: string[],
  areaNames?: Map<string, string>,
): Promise<JurisdictionStation[]> => {
  if (!codeList.length) return []

  const data = (await geoserverApi.getWFSFeatures(
    {
      typeName: ORG_DEPT_LAYER,
      cql_filter: `area_id IN (${codeList.map((code) => `'${code}'`).join(',')})`,
      propertyName: 'id,org_name,area_id,longitude,latitude',
      outputFormat: 'application/json',
      maxFeatures: 500,
    },
    'gis',
  )) as WfsFeatureCollection

  return (data?.features ?? [])
    .map((feature) => {
      const properties = feature?.properties ?? {}
      const id = readString(properties.id)
      const lng = Number(properties.longitude)
      const lat = Number(properties.latitude)
      if (!id || !Number.isFinite(lng) || !Number.isFinite(lat)) return null
      const stationAreaCode = readString(properties.area_id)
      return {
        id,
        name: readString(properties.org_name),
        areaCode: stationAreaCode,
        areaName: areaNames?.get(stationAreaCode) ?? '',
        lngLat: [lng, lat] as [number, number],
      }
    })
    .filter((item): item is JurisdictionStation => item !== null)
}

/**
 * 拉取指定区划编码列表下的队站辖区（队站的主管辖区面）。
 * view_juris_zone.zone_id 等于 view_res_org_dept.id，area_id 与队站一致。
 */
export const fetchJurisdictionZones = async (
  codeList: string[],
  areaNames?: Map<string, string>,
): Promise<JurisdictionZone[]> => {
  if (!codeList.length) return []

  const data = (await geoserverApi.getWFSFeatures(
    {
      typeName: JURIS_ZONE_LAYER,
      cql_filter: `area_id IN (${codeList.map((code) => `'${code}'`).join(',')})`,
      propertyName: 'zone_id,zone_name,area_id',
      outputFormat: 'application/json',
      maxFeatures: 500,
    },
    'gis',
  )) as WfsFeatureCollection

  return (data?.features ?? [])
    .map((feature) => {
      const properties = feature?.properties ?? {}
      const zoneId = readString(properties.zone_id)
      const geometry = feature?.geometry
      if (!zoneId || !geometry) return null
      const zoneAreaCode = readString(properties.area_id)
      return {
        zoneId,
        zoneName: readString(properties.zone_name),
        areaCode: zoneAreaCode,
        areaName: areaNames?.get(zoneAreaCode) ?? '',
        geometry,
      }
    })
    .filter((item): item is JurisdictionZone => item !== null)
}

/** 天气专用行政区划查询视图 */
const AREA_WEATHER_LAYER = 'gis:env_area_weather'

/** 经纬度反查行政区划结果（gis:env_area_weather 视图） */
export interface AreaWeatherMatch {
  /** 命中区划编码 */
  areaId: string
  /** 地址级别：1省 2市 3区县 4街道乡镇（>4 表示更细粒度） */
  addrlevelId: number
  /** 父级区划编码 */
  parentCode: string
  /** 区划名称 */
  areaName: string
}

/**
 * 按经纬度反查所在行政区划（gis:env_area_weather 专用视图），返回 area_id / addrlevel_id / parent_code。
 * 视图为点查专用，INTERSECTS 匹配多边形面片。
 * @param lng 经度（EPSG:4326）
 * @param lat 纬度（EPSG:4326）
 * @returns 命中区划信息；未命中或参数无效返回 null
 */
export const fetchAreaWeatherByPoint = async (lng: number, lat: number): Promise<AreaWeatherMatch | null> => {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  const data = (await geoserverApi.getWFSFeatures(
    {
      typeName: AREA_WEATHER_LAYER,
      cql_filter: `INTERSECTS(geom, SRID=4326;POINT(${lng} ${lat}))`,
      // propertyName: 'area_id,addrlevel_id,parent_code,area_name',
      outputFormat: 'application/json',
      maxFeatures: 1,
    },
    'gis',
  )) as WfsFeatureCollection

  const feature = (data?.features ?? []).find((item) => item?.properties?.area_id)
  if (!feature?.properties?.area_id) return null
  const properties = feature.properties
  return {
    areaId: readString(properties.area_id),
    addrlevelId: readNumber(properties.addrlevel_id),
    parentCode: readString(properties.parent_code),
    areaName: readString(properties.area_name),
  }
}

/**
 * 按队站 id 查询单条辖区几何（点击队站时按需加载，避免 init 预加载全量几何）。
 * view_juris_zone.zone_id 等于 view_res_org_dept.id。
 */
export const fetchJurisdictionZoneByStationId = async (
  stationId: string,
): Promise<JurisdictionZone | null> => {
  if (!stationId) return null
  const data = (await geoserverApi.getWFSFeatures(
    {
      typeName: JURIS_ZONE_LAYER,
      cql_filter: `zone_id='${stationId}'`,
      propertyName: 'zone_id,zone_name,area_id',
      outputFormat: 'application/json',
      maxFeatures: 1,
    },
    'gis',
  )) as WfsFeatureCollection

  const feature = (data?.features ?? [])[0]
  if (!feature) return null
  const properties = feature.properties ?? {}
  const zoneId = readString(properties.zone_id)
  const geometry = feature.geometry
  if (!zoneId || !geometry) return null
  return {
    zoneId,
    zoneName: readString(properties.zone_name),
    areaCode: readString(properties.area_id),
    areaName: '',
    geometry,
  }
}
