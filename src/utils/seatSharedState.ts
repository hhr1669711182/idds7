import type { MapPhase, SharedMessageSession, SharedState } from '@/controller/core/protocol/SharedStateProtocol'

export type { SharedMessageSession, SharedState } from '@/controller/core/protocol/SharedStateProtocol'

export type SharedMapStage = MapPhase

export const getSharedMapStage = (
  snapshot: SharedState | null | undefined,
  mapMode: unknown = snapshot?.phase,
): SharedMapStage | null => {
  if (snapshot?.v !== 1 || !Number.isFinite(snapshot.updatedAt)) return null
  if (snapshot.auth === null) return 'loggedOut'
  if (!snapshot.auth || typeof snapshot.auth !== 'object' || Array.isArray(snapshot.auth)) return null
  if (!['onDuty', 'popup', 'inquiry', 'dispatchTrack'].includes(snapshot.phase ?? '')) return null
  switch (mapMode) {
    case 'onDuty':
      return 'onDuty'
    case 'popup':
      return 'popup'
    case 'dispatchTrack':
      return 'dispatchTrack'
    case 'inquiry': {
      const alarm = snapshot.currentAlarm
      if (alarm === null) return 'inquiry'
      return alarm &&
        typeof alarm === 'object' &&
        !Array.isArray(alarm) &&
        typeof alarm.incidentId === 'string' &&
        alarm.incidentId.trim()
        ? 'dispatch'
        : null
    }
    default:
      return null
  }
}

export const parseSharedMapStage = (raw: string | null): SharedMapStage | null => {
  try {
    return getSharedMapStage(JSON.parse(raw ?? 'null') as SharedState | null)
  } catch {
    return null
  }
}

export const SEAT_SHARED_STATE_KEY = 'seat-shared-state'
export const SEAT_SHARED_STATE_MOCK_KEY = 'seat-shared-state-mock'

/* ------------------------------------------------------------------ *
 * 以下为纯函数：只接收快照，不读 store、不读 localStorage。
 * 凭证读取统一走 useUserStore，请求头统一走 @/service/authHeaders。
 * ------------------------------------------------------------------ */

export const sharedAccessTokenFromSnapshot = (snapshot: SharedState | null): string | null => {
  const token = snapshot?.auth?.accessToken
  return typeof token === 'string' && token.trim() ? token.trim() : null
}

export const sharedTenantIdFromSnapshot = (snapshot: SharedState | null): string | null => {
  const tenantId = snapshot?.auth?.Tenantid
  return typeof tenantId === 'string' && tenantId.trim() ? tenantId.trim() : null
}

export const applySharedAuthTraceHeadersFromSnapshot = (
  headers: Record<string, string>,
  snapshot: SharedState | null,
): Record<string, string> => {
  const traceId = snapshot?.auth?.['X-Trace-Id']
  const tenantId = sharedTenantIdFromSnapshot(snapshot)
  if (typeof traceId === 'string' && traceId.trim()) headers['X-Trace-Id'] = traceId.trim()
  if (tenantId) headers.Tenantid = tenantId
  return headers
}

export const sharedMessageSessionFromSnapshot = (snapshot: SharedState | null): SharedMessageSession | null => {
  if (
    snapshot?.v !== 1 ||
    !Number.isFinite(snapshot.updatedAt) ||
    !snapshot.auth ||
    typeof snapshot.auth !== 'object' ||
    Array.isArray(snapshot.auth)
  )
    return null
  const userId = snapshot.user?.userId
  const sessionState = snapshot.auth.sessionId
  if (typeof userId !== 'string' || !userId.trim() || typeof sessionState !== 'string' || !sessionState.trim())
    return null
  const seatKey = typeof snapshot.seat?.seatNumber === 'string' ? snapshot.seat.seatNumber.trim() : ''
  return { userId, sessionState, seatKey }
}

export const parseSharedMessageSession = (raw: string | null): SharedMessageSession | null => {
  try {
    return sharedMessageSessionFromSnapshot(JSON.parse(raw ?? 'null') as SharedState | null)
  } catch {
    return null
  }
}
