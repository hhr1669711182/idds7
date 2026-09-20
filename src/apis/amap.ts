/*
 * @Author: hhr
 * @Date: 2026-08-27 10:09:42
 * @LastEditTime: 2026-08-28 17:15:57
 * @LastEditors: hhr
 * @Description: ids-address-query-client (高德代理) 接口客户端 - COLA 信封解包
 * @FilePath: \ids-gis-web\src\apis\amap.ts
 */
import { alovaMapProxyInstance } from '@/service/alovaMapProxy'
import { AppError } from '@/service/error'

export interface Response<T> {
  success: boolean
  data: T | T[]
  errCode: string
  errMessage: string
}

/** 通用坐标 */
export type LngLat = [number, number]

/** GeoJSON CRS */
export interface GeoJsonCrs {
  type: 'name'
  properties: { name: string }
}

// ----- POI -----
export interface PoiProperties {
  id: string
  name: string
  typeName: string
  typeCode: string
  address: string
  district: string
  city: string
  adcode: string
  /** 高德返回字符串类型 */
  longitude: string
  latitude: string
  /** 周边/多边形搜索时有值 */
  distance: string | null
  telNum: string[]
  preferred: boolean
}

export interface PoiFeature {
  type: 'Feature'
  id: string
  geometry: { type: 'Point'; coordinates: LngLat }
  properties: PoiProperties
}

export interface PoiFeatureCollection {
  type: 'FeatureCollection'
  /** 高德返回字符串 */
  totalFeatures: string
  crs: GeoJsonCrs
  features: PoiFeature[]
}

// ----- 逆地理编码 -----
export interface Regeocode {
  formatted_address?: string
  addressComponent?: Record<string, unknown>
  pois?: PoiFeature[]
  roads?: Array<Record<string, unknown>>
  aois?: Array<Record<string, unknown>>
}

export interface RegeoData {
  status?: string
  regeocode?: Regeocode
  /** 直通高德原始结构兜底 */
  [key: string]: unknown
}

// ----- 正地理编码 -----
export interface GeocodeData {
  status?: string
  geocodes?: Array<{
    formatted_address?: string
    location?: string
    adcode?: string
    [key: string]: unknown
  }>
  [key: string]: unknown
}

// ----- 地址语义分析 -----
export interface AnalyzeAddressData {
  status?: string
  [key: string]: unknown
}

// ----- 路径规划 -----
export interface RouteProperties {
  distance: string
  partDesc: string
  roadName: string | null
  tmcs?: Array<{
    distance: string
    status: string
    /** 高德 GCJ-02 坐标串 */
    polyline: string
    lcode?: unknown[]
  }>
}

export interface RouteFeature {
  type: 'Feature'
  id: string
  geometry: { type: 'LineString'; coordinates: LngLat[] }
  properties: RouteProperties
}

export interface RouteResult {
  type: string
  totalFeatures: string
  totalTime: string
  totalDistance: string
  trafficLights: string
  crs: GeoJsonCrs
  features: RouteFeature[]
}

// ----- 天气 -----
export interface AmapWeatherLive {
  province: string
  city: string
  adcode: string
  weather: string
  temperature: string
  winddirection: string
  windpower: string
  humidity: string
  reporttime: string
}

export interface AmapWeatherData {
  lives: AmapWeatherLive[]
}

/** 后端业务错误码（与代理服务 ids-address-query-client 约定一致） */
export const AMAP_ERROR_CODES = {
  /** 未配置 amap.key / amap.keys 环境变量 */
  KEY_NOT_CONFIGURED: 'AMAP_KEY_NOT_CONFIGURED',
  /** 调用高德接口网络异常 / 超时 */
  NETWORK_ERROR: 'AMAP_NETWORK_ERROR',
  /** 高德响应 JSON 解析失败 */
  RESPONSE_PARSE_ERROR: 'AMAP_RESPONSE_PARSE_ERROR',
  /** 高德未返回可用路径规划结果 */
  ROUTE_NOT_FOUND: 'AMAP_ROUTE_NOT_FOUND',
  /** 地址解析（geocode）未返回结果 */
  GEOCODE_NOT_FOUND: 'AMAP_GEOCODE_NOT_FOUND',
  /** 高德未返回天气数据 */
  WEATHER_NOT_FOUND: 'AMAP_WEATHER_NOT_FOUND',
  /** 其他未预期运行时异常（全局兜底：坐标解析失败、上游空响应体等） */
  UNKNOWN_ERROR: 'AMAP_UNKNOWN_ERROR',
} as const

export type AmapErrorCode = typeof AMAP_ERROR_CODES[keyof typeof AMAP_ERROR_CODES]


// ============================================================================
// amapApi（12 个方法，命名按文档英文路径转 camelCase）
// ============================================================================

/** POI 1. 关键字模糊查询 */
export const keywordSearch = (params: {
  keywords?: string
  types?: string
  city?: string
  cityLimit?: boolean
  offset?: number
  page?: number
}) => alovaMapProxyInstance.Get<PoiFeatureCollection>(
  '/api/amap/poi/keyword-search',
  { params },
)

/** POI 2. 周边查询 */
export const aroundSearch = (params: {
  location: string
  keywords?: string
  types?: string
  radius?: number
  sortrule?: 'distance' | 'weight'
  offset?: number
  page?: number
}) => alovaMapProxyInstance.Get<PoiFeatureCollection>(
  '/api/amap/poi/around-search',
  { params },
)

/** POI 3. 多边形查询 */
export const polygonSearch = (params: {
  polygon: string
  keywords?: string
  types?: string
  offset?: number
  page?: number
}) => alovaMapProxyInstance.Get<PoiFeatureCollection>(
  '/api/amap/poi/polygon-search',
  { params },
)

/** POI 4. 多边形范围详情 */
export const polygonDetail = (params: { polygon: string }) =>
  alovaMapProxyInstance.Get<PoiFeatureCollection>(
    '/api/amap/poi/polygon-detail',
    { params },
  )

/** POI 5. POI 详情 */
export const detail = (params: { id: string }) =>
  alovaMapProxyInstance.Get<PoiFeature>(
    '/api/amap/poi/detail',
    { params },
  )

/** POI 6. 输入提示 */
export const inputTips = (params: {
  keywords: string
  type?: string
  city?: string
  location?: string
}) => alovaMapProxyInstance.Get<PoiFeatureCollection>(
  '/api/amap/poi/input-tips',
  { params },
)

/** Geocode 1. 逆地理编码 */
export const regeo = (params: {
  location: string
  extensions?: 'base' | 'all'
  poitype?: string
  radius?: number
  batch?: boolean
}) => alovaMapProxyInstance.Get<RegeoData>(
  '/api/amap/geo/regeo',
  { params },
)

/** Geocode 2. 正地理编码 */
// export const geocode = (params: {
//   address: string
//   city?: string
// }) => alovaMapProxyInstance.Get<GeocodeData>(
//   '/api/amap/geo/geocode',
//   { params },
// )

/** Geocode 3. 地址语义分析（保留 GCJ-02） */
export const analyzeAddress = (params: { address: string }) =>
  alovaMapProxyInstance.Get<AnalyzeAddressData>(
    '/api/amap/geo/analyze-address',
    { params },
  )

/** Route 1. 驾车路径规划（v3 基础版） */
export const driving = (params: {
  origin: string
  destination: string
  strategy?: number
  waypoints?: string
  avoidpolygons?: string
  avoidroad?: string
  ferry?: number
  cartype?: number
}) => alovaMapProxyInstance.Get<RouteResult>(
  '/api/amap/route/driving',
  { params },
)

/** Route 2. 驾车路径规划（v5 增强版，含 road_name/step_distance） */
export const drivingV2 = (params: {
  origin: string
  destination: string
  strategy?: number
  waypoints?: string
  avoidpolygons?: string
  avoidroad?: string
  ferry?: number
  cartype?: number
  truckSize?: string
  truckHeight?: string
  truckWidth?: string
  truckLoad?: string
  truckWeight?: string
  height?: string
  width?: string
}) => alovaMapProxyInstance.Get<RouteResult>(
  '/api/amap/route/driving-v2',
  { params },
)

/** Route 3. 多起点、单终点路径规划 */
export const multiWaypoint = (params: {
  origins: string[]
  destination: string
  strategy?: number
}) => {
  const query = new URLSearchParams()
  // 单起点重复传参，兼容服务端坐标列表解析。
  const origins = params.origins.length === 1
    ? [params.origins[0], params.origins[0]]
    : params.origins
  origins.forEach(origin => query.append('origins', origin))
  query.set('destination', params.destination)
  query.set('strategy', String(params.strategy ?? 0))
  return alovaMapProxyInstance.Get<RouteResult[]>(
    '/api/amap/route/multi-waypoint?' + query.toString(),
    { cacheFor: 0 },
  )
}

/** Weather 1. 天气查询 */
export const weather = (params: { city: string }) =>
  alovaMapProxyInstance.Get<AmapWeatherData>(
    '/api/amap/weather',
    { params },
  )
 
export const amapApi = {
  keywordSearch,
  aroundSearch,
  polygonSearch,
  polygonDetail,
  detail,
  inputTips,
  regeo,
  // geocode,
  analyzeAddress,
  driving,
  drivingV2,
  multiWaypoint,
  weather,
}

export type AmapApi = typeof amapApi
