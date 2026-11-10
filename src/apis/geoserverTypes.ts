// 用途：GeoServer WFS / WMS 接口返回契约。
// 见 herness/02-技术设计/前端/GIS-W46-路径分析与GeoServer加固-技术方案.md §3

/**
 * GeoJSON 几何。
 * 直接复用 @types/geojson 的 Geometry，与 envArea / IncidentStationQuery 现有口径一致，
 * 避免接口层与业务层各持一套几何类型。
 */
export type GeoJsonGeometry = GeoJSON.Geometry | null

/** WFS 要素：properties 为图层自有属性表，键随图层变化。 */
export interface WfsFeature<TProperties = Record<string, unknown>> {
  /** 要素标识 */
  id?: string | number
  /** 几何 */
  geometry?: GeoJsonGeometry
  /** 属性表 */
  properties?: TProperties
}

/** WFS GetFeature 要素集合。 */
export interface WfsFeatureCollection<TProperties = Record<string, unknown>> {
  type?: string
  features?: WfsFeature<TProperties>[]
  /** 命中总数（GeoServer 1.0.0 返回 totalFeatures） */
  totalFeatures?: number
  /** 命中总数（WFS 1.1.0 返回 numberMatched） */
  numberMatched?: number
  /** 要素总数（numberReturned） */
  numberReturned?: number
}

/** DescribeFeatureType 的属性声明。 */
export interface DescribeFeatureTypeProperty {
  name?: string
  type?: string
  minOccurs?: number | string
  maxOccurs?: number | string
  nillable?: boolean
}

/** DescribeFeatureType 的图层描述。 */
export interface DescribeFeatureTypeFeatureType {
  typeName?: string
  title?: string
  abstract?: string
  properties?: DescribeFeatureTypeProperty[]
}

/** DescribeFeatureType 响应（JSON 形态）。 */
export interface DescribeFeatureTypeResponse {
  targetNamespace?: string
  featureTypes?: DescribeFeatureTypeFeatureType[]
  /** 部分环境返回原始 XSD 文本而非 JSON */
  data?: string
}

/** WMS GetFeatureInfo 响应。 */
export interface WmsFeatureInfoResponse<TProperties = Record<string, unknown>> {
  type?: string
  features?: WfsFeature<TProperties>[]
  totalFeatures?: number
  numberMatched?: number
}
