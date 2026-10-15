export const SEAT_SHARED_STATE_KEY = 'seat-shared-state'

/** §7 mock 补丁通道独立 key（演示/联调来电定位补位）。 */
export const SEAT_SHARED_STATE_MOCK_KEY = 'seat-shared-state-mock'
export const GIS_POINT_INFO_KEY = 'gis-point-info'

/**
 * 从 seat-shared-state 读取 accessToken（唯一凭证来源，不再使用 access_token 存储键）。
 * 无会话或凭证缺失时返回 null。
 */
export const getSharedAccessToken = (): string | null => {
  try {
    const token = JSON.parse(localStorage.getItem(SEAT_SHARED_STATE_KEY) || 'null')?.auth?.accessToken
    return typeof token === 'string' && token.trim() ? token : null
  } catch {
    return null
  }
}

/**
 * 从 seat-shared-state 读取租户 id（auth.Tenantid，与请求头 Tenantid 同源）。
 * 缺失或为空时返回 null；用于消息服务 V2 CONNECT 首帧的可选 tenantId。
 */
export const getSharedTenantId = (): string | null => {
  try {
    const tenantId = JSON.parse(localStorage.getItem(SEAT_SHARED_STATE_KEY) || 'null')?.auth?.Tenantid
    return typeof tenantId === 'string' && tenantId.trim() ? tenantId.trim() : null
  } catch {
    return null
  }
}

/**
 * 在传入的已有请求头对象上追加受理席写入的链路追踪与租户标识：
 * X-Trace-Id（来自 seat-shared-state.auth['X-Trace-Id']）、
 * Tenantid（来自 seat-shared-state.auth['Tenantid']）。
 * 原地写入并返回同一 headers 对象；字段缺失或解析异常时保持已有请求头不变。
 */
export const applySharedAuthTraceHeaders = (
  headers: Record<string, string>,
): Record<string, string> => {
  try {
    const auth = JSON.parse(localStorage.getItem(SEAT_SHARED_STATE_KEY) || 'null')?.auth
    const traceId = auth?.['X-Trace-Id']
    const tenantId = auth?.['Tenantid']
    if (typeof traceId === 'string' && traceId.trim()) headers['X-Trace-Id'] = traceId.trim()
    if (typeof tenantId === 'string' && tenantId.trim()) headers['Tenantid'] = tenantId.trim()
  } catch {
    // 忽略解析异常，保留已有请求头
  }
  return headers
}

export const parseSharedMessageSession = (raw: string | null) => {
  try {
    const state = JSON.parse(raw || 'null')
    if (state?.v !== 1 || !Number.isFinite(state.updatedAt) || !state.auth) return null
    const userId = state.user?.userId
    const sessionState = state.auth.sessionId
    if (typeof userId !== 'string' || !userId.trim()
      || typeof sessionState !== 'string' || !sessionState.trim()) return null
    const seatKey = typeof state.seat?.seatNumber === 'string'
      ? state.seat.seatNumber.trim() : ''
    return { userId, sessionState, seatKey }
  } catch {
    return null
  }
}

export type SharedMapStage = 'loggedOut' | 'onDuty' | 'popup' | 'inquiry' | 'dispatch' | 'dispatchTrack'

/** 只读 V1 投影；不读取、复制或打印凭证。 */
export const parseSharedMapStage = (raw: string | null): SharedMapStage | null => {
  if (!raw) return null
  try {
    const state = JSON.parse(raw)
    if (state?.v !== 1 || !Number.isFinite(state.updatedAt)) return null
    if (state.auth === null) return 'loggedOut'
    if (!state.auth || typeof state.auth !== 'object' || Array.isArray(state.auth)) return null
  
    let nowStage: SharedMapStage | null = null
    switch (state.phase) {
      case 'onDuty': nowStage = 'onDuty'
        break
      case 'popup': nowStage = 'popup'
        break
      case 'dispatchTrack': nowStage = 'dispatchTrack'
        break
      case 'inquiry':
        if (state.currentAlarm === null) nowStage = 'inquiry'
        else
        nowStage = state.currentAlarm && typeof state.currentAlarm.incidentId === 'string'
          && state.currentAlarm.incidentId.trim() ? 'dispatch' : null
        break
      default: nowStage = null
        break
    }
    console.info('[seat-shared-state] 地图业务状态', nowStage)
    return nowStage
  } catch {
    return null
  }
}

/**
 * 当 localStorage 中 seat-shared-state 的 phase 切换为 'dispatchTrack' 后执行回调。
 * - 若当前已是 'dispatchTrack'，立即执行；
 * - 否则监听 storage 事件，进入 'dispatchTrack' 时执行一次并自动解绑。
 * 返回取消函数，用于在回调触发前清理监听。
 */
export const whenDispatchTrack = (
  callback: () => void,
  options: { read?: () => string | null } = {},
): (() => void) => {
  const read = options.read ?? (() => localStorage.getItem(SEAT_SHARED_STATE_KEY))
  if (parseSharedMapStage(read()) === 'dispatchTrack') {
    callback()
    return () => {}
  }
  let disposed = false
  const onStorage = (event: StorageEvent) => {
    if (disposed) return
    if (event.storageArea !== localStorage) return
    if (event.key !== SEAT_SHARED_STATE_KEY && event.key !== null) return
    if (parseSharedMapStage(read()) === 'dispatchTrack') {
      disposed = true
      window.removeEventListener('storage', onStorage)
      callback()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    if (disposed) return
    disposed = true
    window.removeEventListener('storage', onStorage)
  }
}
