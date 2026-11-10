import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAlovaMockAdapter } from '@alova/mock'
import { alovaGeoInstance } from '@/service/alovaGeo'
import { getGeoServerServiceUrl } from '@/config/env'
import {
  DEFAULT_GEOSERVER_WORKSPACE,
  geoserverApi,
  resolveWorkspace,
  resolveWorkspaceFromTypeName,
} from '@/apis/geoserver'

/**
 * GeoServer 接口层契约：
 * 工作空间必须逐请求推导（显式入参 > `workspace:layer` 前缀 > 缺省兜底），
 * 不做全局单一配置入口——GeoServer 工作空间是服务端图层属性，不同图层可属不同工作空间
 * （如 gis:env_area 与 mark:mark_features）。
 * WMS 查询走 `(params, workspace?)` 参数顺序；WFS 查询按 WFS 契约透传参数。
 */

/** 记录真实发出的请求，供断言使用。 */
interface RecordedRequest {
  method: string
  /** 从请求路径捕获的工作空间段 */
  workspace: string
  query: Record<string, unknown>
  headers: Record<string, unknown>
  body: unknown
}

const recorded: RecordedRequest[] = []

/** 把服务地址里的工作空间段换成通配符，使同一条 mock 规则覆盖各工作空间。 */
const toWorkspaceTemplate = (url: string): string => {
  const segments = url.split('/')
  segments[segments.length - 2] = '{workspace}'
  return segments.join('/')
}

const owsTemplate = toWorkspaceTemplate(getGeoServerServiceUrl('gis', 'ows'))
const wmsTemplate = toWorkspaceTemplate(getGeoServerServiceUrl('gis', 'wms'))

/** 命中 mock 时记录请求并返回空要素集。 */
const record = (method: string) => (request: any) => {
  recorded.push({
    method,
    workspace: String(request.params?.workspace ?? ''),
    query: request.query ?? {},
    headers: request.headers ?? {},
    body: request.data,
  })
  return {
    status: 200,
    statusText: 'ok',
    body: { type: 'FeatureCollection', features: [], totalFeatures: 0, numberReturned: 0 },
  }
}

beforeAll(() => {
  alovaGeoInstance.options.requestAdapter = createAlovaMockAdapter(
    [
      {
        enable: true,
        data: {
          [owsTemplate]: record('GET'),
          [`[POST]${owsTemplate}`]: record('POST'),
          [wmsTemplate]: record('GET'),
        },
      },
    ],
    {
      delay: 0,
      mockRequestLogger: false,
      matchMode: 'methodurl',
      // 未命中即失败：测试不允许连真实 GeoServer
      httpAdapter: () => {
        throw new Error('GeoServer 请求未命中 mock，禁止访问真实服务')
      },
    },
  )
  // GET 默认缓存 5 分钟，会让断言读到上一次的响应，这里关掉
  alovaGeoInstance.options.cacheFor = { GET: 0 }
})

beforeEach(() => {
  recorded.length = 0
})

describe('apis/geoserver GeoServer 接口层', () => {
  it('工作空间解析：显式入参 > typeName 前缀 > 缺省兜底', () => {
    // Given 三种入参组合
    // When 解析工作空间
    const fromTypeName = resolveWorkspace(undefined, 'mark:mark_features')
    const fromExplicit = resolveWorkspace('custom', 'mark:mark_features')
    const fromFallback = resolveWorkspace(undefined, 'env_area')
    // Then 优先级为 显式 > 前缀 > 兜底
    expect(fromTypeName).toBe('mark')
    expect(fromExplicit).toBe('custom')
    expect(fromFallback).toBe(DEFAULT_GEOSERVER_WORKSPACE)
    // 前缀解析：非 workspace:layer 形态推导不出
    expect(resolveWorkspaceFromTypeName('env_area')).toBeNull()
    expect(resolveWorkspaceFromTypeName(':env_area')).toBeNull()
    expect(resolveWorkspaceFromTypeName('')).toBeNull()
    // 回归：GIS-W46 技术方案 §3-G03（工作空间不做全局单一配置入口）
  })

  it('WFS：工作空间由 typeName 前缀推导，不同图层各走各的工作空间', async () => {
    // Given 两个分属不同工作空间的图层
    // When 分别查询
    await geoserverApi.getWFSFeatures({ typeName: 'mark:mark_features', maxFeatures: 5 })
    await geoserverApi.getWFSFeatures({ typeName: 'gis:env_area', maxFeatures: 5 })
    // Then 两次请求分别落到各自的工作空间，而不是同一个全局值
    expect(recorded).toHaveLength(2)
    expect(recorded[0].workspace).toBe('mark')
    expect(recorded[1].workspace).toBe('gis')
  })

  it('WFS：显式工作空间优先于 typeName 前缀', async () => {
    // Given 同一图层 + 显式指定另一个工作空间
    // When 查询
    await geoserverApi.getWFSFeatures({ typeName: 'gis:env_area' }, 'custom')
    // Then 显式值胜出
    expect(recorded[0].workspace).toBe('custom')
  })

  it('WFS：推导不出工作空间时回落缺省兜底', async () => {
    // Given 不带工作空间前缀的图层名
    // When 查询
    await geoserverApi.getWFSFeatures({ typeName: 'env_area' })
    // Then 落到缺省兜底工作空间
    expect(recorded[0].workspace).toBe(DEFAULT_GEOSERVER_WORKSPACE)
  })

  it('WFS：按 WFS 契约透传查询参数并补齐固定参数', async () => {
    // Given 带 CQL 与裁剪属性的查询条件
    const params = {
      typeName: 'gis:env_area',
      cql_filter: "strToLowerCase(name) LIKE '%a''b%'",
      maxFeatures: 50,
      srsName: 'EPSG:4326',
      propertyName: 'name,code',
      outputFormat: 'application/json',
    }
    // When 查询
    await geoserverApi.getWFSFeatures(params)
    // Then 参数原样透传，且 WFS 固定参数补齐
    expect(recorded[0].query).toMatchObject({
      service: 'WFS',
      version: '1.0.0',
      request: 'GetFeature',
      ...params,
    })
  })

  it('WMS：工作空间由 layers 前缀推导，显式入参可覆盖', async () => {
    // Given WMS 查询条件（参数顺序为 params 在前、workspace 在后）
    const params = {
      layers: 'mark:mark_features',
      query_layers: 'mark:mark_features',
      bbox: '1,2,3,4',
      x: 100,
      y: 200,
    }
    // When 前缀推导查询
    await geoserverApi.getWMSFeatureInfo(params)
    // Then 请求落到 layers 前缀对应的工作空间
    expect(recorded[0].workspace).toBe('mark')
    expect(recorded[0].query).toMatchObject({
      service: 'WMS',
      version: '1.1.0',
      request: 'GetFeatureInfo',
      layers: 'mark:mark_features',
      query_layers: 'mark:mark_features',
      bbox: '1,2,3,4',
      x: 100,
      y: 200,
    })
    // When 显式指定工作空间再查一次
    await geoserverApi.getWMSFeatureInfo(params, 'custom')
    // Then 显式值胜出
    expect(recorded[1].workspace).toBe('custom')
  })

  it('探活：走 GetCapabilities，不解析完整能力文档', async () => {
    // When 探测 GeoServer
    await geoserverApi.pingGeoServer('mark')
    // Then 请求打到目标工作空间且只取能力文档
    expect(recorded[0].workspace).toBe('mark')
    expect(recorded[0].query).toMatchObject({
      service: 'WFS',
      request: 'GetCapabilities',
    })
  })

  it('事务：按 XML 提交到目标工作空间', async () => {
    // Given 一段 WFS-T 事务 XML
    const xml = '<wfs:Transaction xmlns:wfs="http://www.opengis.net/wfs"/></wfs:Transaction>'
    // When 提交
    await geoserverApi.transaction(xml, 'mark')
    // Then 请求打到目标工作空间，请求体原样送出，内容类型为 XML
    expect(recorded[0].method).toBe('POST')
    expect(recorded[0].workspace).toBe('mark')
    expect(recorded[0].body).toBe(xml)
    const contentType = Object.entries(recorded[0].headers).find(([key]) => key.toLowerCase() === 'content-type')
    expect(contentType?.[1]).toBe('text/xml')
  })

  it('图层描述：走 DescribeFeatureType 并按 1.1.0 发出', async () => {
    // When 查图层字段
    await geoserverApi.describeFeatureType({ typeName: 'mark:mark_features' })
    // Then 请求打到图层所属工作空间，版本为 1.1.0
    expect(recorded[0].workspace).toBe('mark')
    expect(recorded[0].query).toMatchObject({
      service: 'WFS',
      version: '1.1.0',
      request: 'DescribeFeatureType',
      typeName: 'mark:mark_features',
    })
  })
})
