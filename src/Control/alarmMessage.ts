import { MESSAGE_EVENT_KEY } from '@/const/const.message.type'
import { useUserStore } from '@/store/useUserStore'

const MESSAGE_CLIENT = 'ids-seat-web'
const WRAPPER_KEYS = [
  'request',
  'data',
  'body',
  'message',
  'payload',
  'userMsgBodyList',
] as const

export const ALARM_STATE_SUBSCRIPTION = {
  action: 'subscribe',
  type: 'CUSTOM',
  customType: 'ALARM_INCIDENT',
  key: 'STATE_CHANGED',
} as const

export type AlarmIncidentStateData = {
  incidentId: string
  previousState?: string | null
  previousStateName?: string | null
  newState: string
  newStateName?: string
  inquiryIds?: string[]
  primaryIncidentId?: string
  changedAt?: string | null
  dataSource?: string
  sourceId?: string
  reconciliation?: boolean
  ext?: Record<string, any>
  [key: string]: any
}

export type AlarmIncidentCustomContent = {
  eventId?: string
  eventName: string
  source: string
  data: AlarmIncidentStateData
}

type JwtClaims = {
  sub?: string
  sid?: string
  session_state?: string
  [key: string]: unknown
}

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  return decodeURIComponent(
    Array.from(atob(padded))
      .map(char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  )
}

/**
 * 读取 access_token 的 JWT claims。
 * access_token 由 seat-web 写入 seat-shared-state，再由 useUserStore 同步；
 * 本函数直接从 store 取，不再裸读 localStorage。
 */
export const readAccessTokenClaims = (): JwtClaims | null => {
  const token = useUserStore().accessToken
  if (!token) return null

  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    return JSON.parse(decodeBase64Url(payload)) as JwtClaims
  } catch {
    return null
  }
}

/**
 * 从 store 取消息会话信息（userId / sessionState / seatKey）。
 * 数据来源仍为 seat-shared-state.auth，但不再由本函数直接读 localStorage。
 */
export const getAlarmMessageSession = () => {
  const store = useUserStore()
  const userId = store.userId
  const sessionState = store.sessionId
  if (!userId || !sessionState) return null
  return { userId, sessionState, seatKey: store.seatNumber?.trim() ?? '' }
}

export const buildAlarmMessageWebSocketUrl = (
  serviceOrigin: string,
  userId: string,
  sessionState: string,
  client = MESSAGE_CLIENT,
) => {
  const origin = serviceOrigin.trim().replace(/\/+$/g, '')
  if (!origin) return ''

  const wsOrigin = origin
    .replace(/^https:/i, 'wss:')
    .replace(/^http:/i, 'ws:')
  const base = /\/message-client$/i.test(wsOrigin)
    ? wsOrigin
    : `${wsOrigin}/message-client`

  return `${base}/ws/${encodeURIComponent(client)}/${encodeURIComponent(userId)}/${encodeURIComponent(sessionState)}`
}

export const findAlarmCustomContent = (
  value: unknown,
  visited = new Set<object>(),
): AlarmIncidentCustomContent | null => {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAlarmCustomContent(item, visited)
      if (found) return found
    }
    return null
  }
  const objectValue = value as Record<string, any>
  if (visited.has(objectValue)) return null
  visited.add(objectValue)

  // 本地 Mock 或部分网关会直接下发 customContent 主体。
  if (
    objectValue.eventName === 'AlarmIncidentStateChangedEvent'
    && objectValue.source === 'ids-alarm-client'
    && objectValue.data
    && typeof objectValue.data === 'object'
  ) {
    return objectValue as AlarmIncidentCustomContent
  }

  const customContent = objectValue.customContent
  if (customContent && typeof customContent === 'object') {
    return customContent as AlarmIncidentCustomContent
  }

  for (const key of WRAPPER_KEYS) {
    const child = objectValue[key]
    const children = Array.isArray(child) ? child : [child]
    for (const item of children) {
      const found = findAlarmCustomContent(item, visited)
      if (found) return found
    }
  }

  return null
}

export const normalizeAlarmStateFrame = (frame: unknown) => {
  const content = findAlarmCustomContent(frame)
  const root = frame && typeof frame === 'object' && !Array.isArray(frame)
    ? frame as Record<string, any>
    : {}
  const matchesTopic = Array.isArray(root.topics) && root.topics.some(
    (topic: Record<string, any>) =>
      String(topic?.type ?? '').toUpperCase() === 'CUSTOM'
      && String(topic?.customType ?? '').toUpperCase() === 'ALARM_INCIDENT'
      && String(topic?.key ?? '').toUpperCase() === 'STATE_CHANGED',
  )
  const matchesNotifyType = String(root.notifyType ?? '').toLowerCase() === 'alarm_incident'
    && String(root.notifySubType ?? '').toLowerCase() === 'state_changed'
  const matchesEventName = content?.eventName === 'AlarmIncidentStateChangedEvent'

  if (
    !content
    || (!matchesTopic && !matchesNotifyType && !matchesEventName)
    || !content.data?.incidentId
  ) {
    return null
  }

  return {
    eventKey: MESSAGE_EVENT_KEY.ALARM_INCIDENT_STATE_CHANGED,
    data: content.data,
    meta: {
      recordId: root.id,
      eventId: content.eventId,
      eventName: content.eventName,
      source: content.source,
    },
  }
}

export const toDispatchAlarmProfile = (data: AlarmIncidentStateData) => {
  const ext = data.ext ?? {}
  const alarmAddr = ext.alarmAddr ?? ext.alarmAddress ?? {}
  const longitude = Number(alarmAddr.longitude ?? ext.longitude)
  const latitude = Number(alarmAddr.latitude ?? ext.latitude)

  return {
    ...ext,
    incidentId: data.incidentId,
    disaster_address: alarmAddr.fullAddr
      ?? alarmAddr.address
      ?? ext.disaster_address
      ?? ext.disasterAddress,
    longitude,
    latitude,
    disaster_type: ext.disaster_type ?? ext.disasterType ?? '警情',
    incidentState: data.newState,
    incidentStateName: data.newStateName,
    fireBrigade: Array.isArray(ext.fireBrigade) ? ext.fireBrigade : [],
    alarmState: data,
  }
}