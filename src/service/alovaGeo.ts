import { createAlova } from 'alova'
import VueHook from 'alova/vue'
import adapterFetch from 'alova/fetch'

/**
 * GeoServer 请求默认超时（毫秒）。
 * GeoServer 只服务业务图层，探活与图层查询都不应长时间挂起阻塞界面。
 */
export const GEOSERVER_REQUEST_TIMEOUT_MS = 10_000

export const alovaGeoInstance = createAlova({
  baseURL: '',
  statesHook: VueHook,
  requestAdapter: adapterFetch(),
  cacheLogger: false,
  timeout: GEOSERVER_REQUEST_TIMEOUT_MS,
  responded: async (response) => {
    if (!(response instanceof Response)) return response
    if (!response.ok) {
      throw new Error(`GeoServer HTTP ${response.status}`)
    }
    const text = await response.text()
    if (!text.trim()) return null
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  },
})