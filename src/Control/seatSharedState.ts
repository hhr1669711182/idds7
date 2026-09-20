export const SEAT_SHARED_STATE_KEY = 'seat-shared-state'

/** §7 mock 补丁通道独立 key（演示/联调来电定位补位）。 */
export const SEAT_SHARED_STATE_MOCK_KEY = 'seat-shared-state-mock'

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
    console.info('[seat-shared-state] 地图业务状态', state.phase)
    switch (state.phase) {
      case 'onDuty': return 'onDuty'
      case 'popup': return 'popup'
      case 'dispatchTrack': return 'dispatchTrack'
      case 'inquiry':
        if (state.currentAlarm === null) return 'inquiry'
        return state.currentAlarm && typeof state.currentAlarm.incidentId === 'string'
          && state.currentAlarm.incidentId.trim() ? 'dispatch' : null
      default: return null
    }
  } catch {
    return null
  }
}
