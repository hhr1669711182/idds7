/*
 * @Author: hhr
 * @Date: 2026-08-28 16:56:11
 * @LastEditTime: 2026-08-28 17:15:32
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\service\alovaMapProxy.ts
 */
import { createAlova } from 'alova'
import VueHook from 'alova/vue'
import adapterFetch from 'alova/fetch'
import { AppError, ERROR_CODES } from './error'
import { appEnv } from '@/config/env'
import { AMAP_ERROR_CODES } from '@/apis/amap'

/**
 * 高德代理实例：只转发第三方开放能力，不注入任何席位凭证。
 * 凭证统一由主实例 alova.ts 经 service/authHeaders 注入，两者互不共享头部逻辑。
 */
export const alovaMapProxyInstance = createAlova({
  baseURL: appEnv.amapApiBaseUrl,
  statesHook: VueHook,
  requestAdapter: adapterFetch(),
  cacheLogger: false,
  responded: {
    onSuccess: async (response) => {
      if (!(response instanceof Response)) return response as any
      if (!response.ok) {
        throw new AppError(AMAP_ERROR_CODES.NETWORK_ERROR, response.status, `HTTP ${response.status}`)
      }
      const text = await response.text()
      if (!text.trim()) {
        throw new AppError(AMAP_ERROR_CODES.UNKNOWN_ERROR, response.status, 'empty response body')
      }

      let body: any
      try {
        body = JSON.parse(text)
      } catch {
        throw new AppError(AMAP_ERROR_CODES.RESPONSE_PARSE_ERROR, response.status)
      }

      if (body && typeof body === 'object' && 'success' in body) {
        if (body.success) return body.data
        throw new AppError(
          body.errCode || AMAP_ERROR_CODES.UNKNOWN_ERROR,
          response.status,
          body.errMessage || '请求失败',
        )
      }
      return body
    },
    onError: async (err, method) => {
      const appErr =
        err instanceof AppError ? err : new AppError(AMAP_ERROR_CODES.UNKNOWN_ERROR, undefined, (err as Error)?.message)
      const meta = (method?.config?.meta ?? {}) as { silent?: boolean; showError?: boolean }
      if (meta.silent || meta.showError === false) throw appErr
      throw appErr
    },
  },
})
