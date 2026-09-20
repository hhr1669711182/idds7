/*
 * @Author: hhr
 * @Date: 2026-04-29 18:16:57
 * @LastEditTime: 2026-08-20 10:55:18
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\service\geoserver.ts
 */
import { alovaGeoInstance } from './alovaGeo'
import { getGeoServerServiceUrl } from '@/config/env'

export interface WFSFeatureParams {
  typeName: string
  cql_filter?: string
  maxFeatures?: number
  outputFormat?: string
  [key: string]: any
}

export interface WMSFeatureInfoParams {
  layers: string
  query_layers: string
  bbox: string
  width?: number
  height?: number
  x: number
  y: number
  srs?: string  // 'EPSG:4326' | 'EPSG:3857'
  info_format?: string
  feature_count?: number
  cql_filter?: string
  [key: string]: any
}

export const geoserverApi = {
  /**
   * 获取 GeoServer WFS 要素 (GetFeature)
   * @param params WFS 查询参数
   * @param workspace 工作空间名称
   */
  getWFSFeatures: (params: WFSFeatureParams, workspace = 'gis') => {
    return alovaGeoInstance.Get<any>(getGeoServerServiceUrl(workspace, 'ows'), {
      params: {
        service: 'WFS',
        version: '1.1.0',
        request: 'GetFeature',
        outputFormat: 'application/json',
        ...params,
      },
    })
  },

  /**
   * 获取 WFS 图层字段描述 (DescribeFeatureType)
   * @param workspace 工作空间名称
   * @param typeName 图层名称 (workspace:layer)
   */
  describeFeatureType: (params: { typeName: string }, workspace = 'gis') => {
    return alovaGeoInstance.Get<any>(getGeoServerServiceUrl(workspace, 'ows'), {
      params: {
        service: 'WFS',
        version: '1.1.0',
        request: 'DescribeFeatureType',
        outputFormat: 'application/json',
        ...params, 
      },
    })
  },

  /**
   * WMS GetFeatureInfo (点击地图查询要素信息)
   * @param workspace 工作空间名称
   * @param params WMS 查询参数 (BBOX, X, Y, WIDTH, HEIGHT 等)
   */
  getWMSFeatureInfo: (workspace: string, params: WMSFeatureInfoParams) => {
    return alovaGeoInstance.Get<any>(getGeoServerServiceUrl(workspace, 'wms'), {
      params: {
        service: 'WMS',
        version: '1.1.0',
        request: 'GetFeatureInfo',
        info_format: 'application/json',
        srs: 'EPSG:3857',
        ...params,
      },
    })
  },

  /**
   * WFS-T 事务提交 (Transaction)
   * @param xml WFS Transaction 请求体（serialize 后的 XML 字符串）
   * @param workspace 工作空间名称
   */
  transaction: (xml: string, workspace = 'gis') => {
    return alovaGeoInstance.Post<any>(getGeoServerServiceUrl(workspace, 'ows'), xml, {
      headers: {
        'Content-Type': 'text/xml',
      },
    })
  },

  getWMSServiceUrl: (workspace: string) => getGeoServerServiceUrl(workspace, 'wms'),
}
