import { createAlova } from 'alova'
import VueHook from 'alova/vue'
import adapterFetch from 'alova/fetch'

export const alovaGeoInstance = createAlova({
  baseURL: '',
  statesHook: VueHook,
  requestAdapter: adapterFetch(),
  cacheLogger: false,
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
  }
})
