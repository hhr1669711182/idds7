/**
 * 检索面板（input-panel）与路径规划面板的跨层 DTO。
 * 坐标系统一 WGS84 [lng, lat]，仅路径规划结果需在渲染前由 GCJ-02 转换。
 */

/** 结果数据源 tab */
export type SearchSourceTab = 'address' | 'resource'

/** 检索模式 */
export type SearchMode = 'keyword' | 'circle'

/** 结果条目来源 */
export type SearchItemSource = 'amap' | 'wfs'

/** 检索结果条目 */
export interface SearchResultItem {
  /** 唯一键：`${source}:${id}` */
  key: string
  /** 数据来源 */
  source: SearchItemSource
  /** 结果标识（高德 POI id 或 GeoServer 要素 id） */
  id: string
  /** 主标题（POI 名称 / 要素 name） */
  title: string
  /** 副标题（地址 / 所属分类 / 图层中文名） */
  subtitle?: string
  /** 图层中文名（仅 GIS 资源结果有值，用于列表分组展示） */
  layerName?: string
  /** GeoServer typeName（仅 GIS 资源结果有值，是唯一数据依据） */
  typeName?: string
  /** WGS84 坐标；无坐标时为 null（列表置灰不可点） */
  lngLat: [number, number] | null
  /** 是否可定位（无坐标为 false） */
  locatable: boolean
}

/** 单个 tab 的结果集合 */
export interface SearchResultBucket {
  items: SearchResultItem[]
  /** 是否已截断（命中 1 万条上限） */
  truncated: boolean
  /** 失败图层数（GIS 资源 tab 用） */
  failedLayers?: number
}

/** 面板打开时需要展示的检索载荷 */
export interface SearchPayload {
  tab: SearchSourceTab
  address: SearchResultBucket
  resource: SearchResultBucket
}

/** 检索请求参数 */
export interface SearchQueryParams {
  keyword: string
  /** 选中的视图 id（GeoServer typeName）；有值时只查该图层 */
  typeName?: string
  /** 显式指定参与查询的图层（圈选等已知图层集合的场景）；与 typeName 二选一 */
  typeNames?: string[]
  /** 当前地图视口范围（WGS84）；有值时叠加 BBOX 约束 */
  viewport?: [number, number, number, number]
  /** 圈选中心与半径（WGS84 + 米） */
  circle?: { center: [number, number]; radiusMeters: number }
  /** 结果上限 */
  maxFeatures?: number
}

/** 视图下拉可选项（取自 LAYER_SOURCE_CONFIGS） */
export interface SearchViewOption {
  /** 展示用中文名，仅用于页面效果 */
  name: string
  /** GeoServer typeName，唯一数据依据 */
  id: string
}

/** 路径规划车型 */
export type RouteVehicleType = 'car' | 'truck'

/** 货车条件 */
export interface RouteTruckConstraints {
  /** 载重 */
  load?: string
  /** 限高 */
  height?: string
  /** 限宽 */
  width?: string
}

/** 路径规划起终点 */
export interface RouteEndpoint {
  /** 输入框文本 */
  text: string
  /** WGS84 坐标（选中后才有） */
  lngLat: [number, number] | null
}

/** 路径规划表单 */
export interface RoutePlanForm {
  vehicle: RouteVehicleType
  start: RouteEndpoint
  end: RouteEndpoint
  truck: RouteTruckConstraints
  /** 是否为手动触发（小汽车实时、货车点分析） */
  manualTrigger: boolean
}

/** 检索结果上限 */
export const SEARCH_MAX_FEATURES = 10000

/** 检索 + 上图所需的 CQL 条件对 */
export interface ResourceFilterSet {
  /** 参与查询的图层 typeName 列表（顺序与 filters 一一对应） */
  typeNames: string[]
  /** 每个图层对应的 CQL filter */
  filters: string[]
}