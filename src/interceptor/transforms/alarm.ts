import { MESSAGE_EVENT_KEY, MESSAGE_SUBSCRIBE_TOPIC } from '@/const/const.message.type'
import type {
  AlarmIncidentCustomContent,
  AlarmIncidentStateData,
} from '@/controller/core/protocol/LegacyMessageProtocol'
import type { MessageInterceptor, NormalizedMessage } from '../types'
import { matchesMessageRoute } from '../matcher'
import { getFrameMetadata, getMessagePayload, isPlainObject, normalize, unwrapMessageFrames } from '../unwrap'

export const normalizeAlarmStateFrames = (
  frame: unknown,
  nativeOnly = false,
): NormalizedMessage<AlarmIncidentStateData>[] => {
  const results: NormalizedMessage<AlarmIncidentStateData>[] = []
  const seen = new Set<object>()
  const root = nativeOnly ? normalize(frame) : null
  const rootRoute =
    root?.topics.some(
      (topic) =>
        topic.type === 'CUSTOM' &&
        topic.customType === 'ALARM_INCIDENT' &&
        topic.key?.toUpperCase() === 'STATE_CHANGED',
    ) ||
    (String(root?.raw.notifyType ?? '').toUpperCase() === 'ALARM_INCIDENT' &&
      String(root?.raw.notifySubType ?? '').toUpperCase() === 'STATE_CHANGED')
  for (const body of unwrapMessageFrames(frame)) {
    if (!matchesMessageRoute(body, MESSAGE_SUBSCRIBE_TOPIC.ALARM_INCIDENT)) continue
    const content = getMessagePayload(body)
    if (
      nativeOnly &&
      (!isPlainObject(content.data) ||
        !(
          isPlainObject(body.value.customContent) ||
          (body.value.eventName === 'AlarmIncidentStateChangedEvent' && body.value.source === 'ids-alarm-client')
        ) ||
        (!rootRoute && content.eventName !== 'AlarmIncidentStateChangedEvent'))
    )
      continue
    const data = isPlainObject(content.data) ? content.data : content
    if (typeof data.incidentId !== 'string' || !data.incidentId || seen.has(data)) continue
    const routed =
      body.notifyType || body.topics.some((topic) => topic.type === 'CUSTOM') || content.eventName || body.raw.eventName
    if (!routed && typeof data.newState !== 'string') continue
    seen.add(data)
    const meta = getFrameMetadata(body)
    if (typeof content.eventId === 'string') meta.eventId = content.eventId
    if (typeof content.eventName === 'string') meta.eventName = content.eventName
    if (typeof content.source === 'string') meta.source = content.source
    results.push({
      eventKey: MESSAGE_EVENT_KEY.ALARM_INCIDENT_STATE_CHANGED,
      data: data as AlarmIncidentStateData,
      meta,
    })
    break
  }
  return results
}

export const normalizeAlarmStateFrame = (frame: unknown) => normalizeAlarmStateFrames(frame)[0] ?? null

export const findAlarmCustomContent = (frame: unknown): AlarmIncidentCustomContent | null => {
  for (const body of unwrapMessageFrames(frame)) {
    if (!matchesMessageRoute(body, MESSAGE_SUBSCRIBE_TOPIC.ALARM_INCIDENT)) continue
    const content = getMessagePayload(body)
    if (
      isPlainObject(content.data) &&
      typeof content.data.incidentId === 'string' &&
      typeof content.eventName === 'string' &&
      typeof content.source === 'string'
    ) {
      return content as unknown as AlarmIncidentCustomContent
    }
  }
  return null
}

export const alarmInterceptor: MessageInterceptor = {
  id: 'topic:alarm-incident',
  priority: 140,
  describe: '警情状态变更',
  subscribe: MESSAGE_SUBSCRIBE_TOPIC.ALARM_INCIDENT,
  transform: (ctx) => {
    const results = normalizeAlarmStateFrames(ctx.raw)
    return { matched: results.length > 0, results, stop: true }
  },
}
