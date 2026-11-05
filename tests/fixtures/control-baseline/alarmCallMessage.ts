import { MESSAGE_EVENT_KEY } from '@/const/const.message.type'

export const ALARM_CALL_SUBSCRIPTION = {
  action: 'subscribe',
  type: 'CUSTOM',
  customType: 'ALARM_CALL',
  key: 'ANSWER_STATUS_CHANGED',
} as const

export type AlarmCallAnswerStatusData = {
  callId: string
  previousState?: string | null
  newState?: string | null
  answered?: boolean
  ended?: boolean
  changedAt?: string | null
  channel?: string | null
  [key: string]: any
}

type AnyRecord = Record<string, any>

const hasAnswerStatusTopic = (value: AnyRecord) =>
  Array.isArray(value.topics) && value.topics.some((topic: AnyRecord) =>
    String(topic?.type ?? '').toUpperCase() === 'CUSTOM'
    && String(topic?.customType ?? '').toUpperCase() === 'ALARM_CALL'
    && String(topic?.key ?? '').toUpperCase() === 'ANSWER_STATUS_CHANGED',
  )

const normalizeAlarmCallContent = (frame: unknown, inheritedProtocol = false, recordId?: unknown) => {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) return null
  const root = frame as AnyRecord
  const customContent = root.customContent
  if (!customContent || typeof customContent !== 'object') return null

  const data = customContent.data
  if (!data || typeof data !== 'object' || !data.callId) return null

  const matchesProtocol = inheritedProtocol || hasAnswerStatusTopic(root)
    || (
      String(root.notifyType ?? '').toLowerCase() === 'alarm_call'
      && String(root.notifySubType ?? '').toLowerCase() === 'answer_status_changed'
    )
    || customContent.eventName === 'AlarmCallAnswerStatusChanged'

  if (!matchesProtocol) return null

  return {
    eventKey: MESSAGE_EVENT_KEY.ALARM_CALL_ANSWER_STATUS_CHANGED,
    data: data as AlarmCallAnswerStatusData,
    meta: {
      recordId: root.id ?? recordId,
      eventId: customContent.eventId,
      eventName: customContent.eventName,
      source: customContent.source,
      topicKey: 'ANSWER_STATUS_CHANGED',
    },
  }
}

const WRAPPER_KEYS = ['request', 'data', 'body', 'message', 'payload', 'userMsgBodyList'] as const

/** 兼容消息服务包装层及数组；跳过无关消息，保留外层路由与记录标识。 */
export const normalizeAlarmCallFrame = (frame: unknown) => {
  const pending: Array<{ value: unknown; matchesProtocol: boolean; recordId?: unknown }> = [
    { value: frame, matchesProtocol: false },
  ]
  const visited = new Set<object>()
  while (pending.length) {
    const { value, matchesProtocol: inheritedProtocol, recordId } = pending.pop()!
    if (!value || typeof value !== 'object' || visited.has(value)) continue
    visited.add(value)
    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) {
        pending.push({ value: value[i], matchesProtocol: inheritedProtocol, recordId })
      }
      continue
    }
    const root = value as AnyRecord
    const matchesProtocol = inheritedProtocol || hasAnswerStatusTopic(root)
      || (String(root.notifyType ?? '').toLowerCase() === 'alarm_call'
        && String(root.notifySubType ?? '').toLowerCase() === 'answer_status_changed')
    const currentRecordId = root.id ?? recordId
    const normalized = normalizeAlarmCallContent(root, matchesProtocol, currentRecordId)
    if (normalized) return normalized
    for (let i = WRAPPER_KEYS.length - 1; i >= 0; i--) {
      pending.push({ value: root[WRAPPER_KEYS[i]], matchesProtocol, recordId: currentRecordId })
    }
  }
  return null
}
