// 用途：GeoServer WFS / WMS 请求的统一出口（全仓 GeoServer 调用均收口于此）。
// 见 herness/02-技术设计/前端/GIS-W46-路径分析与GeoServer加固-技术方案.md §5.1
import { alovaGeoInstance } from '@/service/alovaGeo'
import { getGeoServerServiceUrl } from '@/config/env'
import type {
  DescribeFeatureTypeResponse,
  WfsFeatureCollection,
  WmsFeatureInfoResponse,
} from '@/apis/geoserverTypes'

export interface WFSFeatureParams {
  /** 图层名，标准形式为 `workspace:layer` */
  typeName: string
  /** CQL 过滤条件，构造走 `@/utils/cql` */
  cql_filter?: string
  /** 最大返回要素数 */
  maxFeatures?: number
  /** 输出格式，默认 application/json */
  outputFormat?: string
  /** 要素投影坐标系，如 EPSG:4326 */
  srsName?: string
  /** 属性裁剪，逗号分隔的属性名 */
  propertyName?: string
  /** 服务端视图参数，格式 `key:value;key:value` */
  viewparams?: string
  /** OGC XML Filter（与 cql_filter 二选一）；XML 形态可显式指定 SRS，规避轴序歧义 */
  filter?: string
}

export interface WMSFeatureInfoParams {
  layers: string
  query_layers: string
  bbox: string
  width?: number
  height?: number
  x: number
  y: number
  srs?: string // 'EPSG:4326' | 'EPSG:3857'
  info_format?: string
  feature_count?: number
  cql_filter?: string
  viewparams?: string
  transparent?: boolean
  format?: string
}

/**
 * 工作空间缺省兜底值。
 * GeoServer 工作空间是服务端图层属性，不同图层可属不同工作空间
 * （如 gis:env_area 与 mark:mark_features），因此不做全局单一配置入口：
 * 优先从显式入参取，其次从 `workspace:layer` 形式的 typeName 推导，最后才回落到此值。
 */
export const DEFAULT_GEOSERVER_WORKSPACE = 'gis'

/**
 * 从 `workspace:layer` 形式的图层名推导工作空间。
 * 推导不出时返回 null，交由调用方决定缺省策略。
 */
export const resolveWorkspaceFromTypeName = (typeName?: string | null): string | null => {
  const raw = String(typeName ?? '').trim()
  if (!raw) return null
  const separatorIndex = raw.indexOf(':')
  if (separatorIndex <= 0) return null
  const workspace = raw.slice(0, separatorIndex).trim()
  return workspace || null
}

/**
 * 解析本次请求实际使用的工作空间。
 * 优先级：显式入参 > typeName 前缀推导 > 缺省兜底。
 */
export const resolveWorkspace = (explicit?: string | null, typeName?: string | null): string =>
  String(explicit ?? '').trim() || resolveWorkspaceFromTypeName(typeName) || DEFAULT_GEOSERVER_WORKSPACE

export const geoserverApi = {
  /**
   * 获取 GeoServer WFS 要素 (GetFeature)
   * @param params WFS 查询参数
   * @param workspace 工作空间名称；缺省时按 typeName 前缀推导
   */
  getWFSFeatures: <TProperties = Record<string, unknown>>(
    params: WFSFeatureParams,
    workspace?: string,
  ): Promise<WfsFeatureCollection<TProperties>> => {
    const targetWorkspace = resolveWorkspace(workspace, params.typeName)
    return alovaGeoInstance.Get<WfsFeatureCollection<TProperties>>(getGeoServerServiceUrl(targetWorkspace, 'ows'), {
      params: {
        service: 'WFS',
        version: '1.0.0',
        request: 'GetFeature',
        outputFormat: 'application/json',
        ...params,
      },
    })
  },

  /**
   * 获取 WFS 图层字段描述 (DescribeFeatureType)
   * @param params 图层名称 (workspace:layer)
   * @param workspace 工作空间名称；缺省时按 typeName 前缀推导
   */
  describeFeatureType: (
    params: { typeName: string },
    workspace?: string,
  ): Promise<DescribeFeatureTypeResponse | string> => {
    const targetWorkspace = resolveWorkspace(workspace, params.typeName)
    return alovaGeoInstance.Get<DescribeFeatureTypeResponse | string>(
      getGeoServerServiceUrl(targetWorkspace, 'ows'),
      {
        params: {
          service: 'WFS',
          version: '1.1.0',
          request: 'DescribeFeatureType',
          outputFormat: 'application/json',
          ...params,
        },
      },
    )
  },

  /**
   * WMS GetFeatureInfo (点击地图查询要素信息)
   * @param params WMS 查询参数 (BBOX, X, Y, WIDTH, HEIGHT 等)
   * @param workspace 工作空间名称；缺省时按 layers 前缀推导
   */
  getWMSFeatureInfo: <TProperties = Record<string, unknown>>(
    params: WMSFeatureInfoParams,
    workspace?: string,
  ): Promise<WmsFeatureInfoResponse<TProperties>> => {
    const targetWorkspace = resolveWorkspace(workspace, params.layers)
    return alovaGeoInstance.Get<WmsFeatureInfoResponse<TProperties>>(
      getGeoServerServiceUrl(targetWorkspace, 'wms'),
      {
        params: {
          service: 'WMS',
          version: '1.1.0',
          request: 'GetFeatureInfo',
          info_format: 'application/json',
          srs: 'EPSG:3857',
          ...params,
        },
      },
    )
  },

  /**
   * WFS-T 事务提交 (Transaction)
   * 响应为 XML 文本（失败时是 ows:ExceptionReport），由调用方自行判定。
   * @param xml WFS Transaction 请求体（serialize 后的 XML 字符串）
   * @param workspace 工作空间名称；缺省时回落兜底值
   */
  transaction: (xml: string, workspace?: string): Promise<unknown> => {
    const targetWorkspace = resolveWorkspace(workspace)
    return alovaGeoInstance.Post<unknown>(getGeoServerServiceUrl(targetWorkspace, 'ows'), xml, {
      headers: {
        'Content-Type': 'text/xml',
      },
    })
  },

  /**
   * GeoServer 探活：请求 GetCapabilities 拿服务版本。
   * 只用于判定服务可达性，不解析完整能力文档。
   * @param workspace 工作空间名称；缺省时回落兜底值
   */
  pingGeoServer: (workspace?: string): Promise<unknown> => {
    const targetWorkspace = resolveWorkspace(workspace)
    return alovaGeoInstance.Get<unknown>(getGeoServerServiceUrl(targetWorkspace, 'ows'), {
      params: {
        service: 'WFS',
        version: '1.0.0',
        request: 'GetCapabilities',
      },
    })
  },

  getWMSServiceUrl: (workspace: string) => getGeoServerServiceUrl(workspace, 'wms'),
}