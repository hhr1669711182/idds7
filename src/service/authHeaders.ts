/**
 * 请求凭证与链路头的唯一构造入口。
 *
 * 数据来源只有 useUserStore —— 由 initUserStore 统一监听 seat 共享键后写入，
 * 业务与请求层都不直接读 localStorage。高德代理等第三方实例不调用本模块。
 */
import { appEnv } from '@/config/env'
import { useUserStore } from '@/store/useUserStore'

type Headers = Record<string, string>

const clientId = () => appEnv.messageClient || 'ids-seat-web'

/** 仅链路追踪与租户，不含 Authorization。 */
export const applyTraceHeaders = (headers: Headers): Headers => {
  const store = useUserStore()
  if (store.traceId) headers['X-Trace-Id'] = store.traceId
  if (store.tenantId) headers.Tenantid = store.tenantId
  return headers
}

/** 凭证 + 链路头；无有效 token 时不写任何凭证字段。 */
export const applyAuthHeaders = (headers: Headers): Headers => {
  const store = useUserStore()
  if (store.accessToken) {
    headers.Authorization = `Bearer ${store.accessToken}`
    headers.clientid = clientId()
  }
  return applyTraceHeaders(headers)
}
