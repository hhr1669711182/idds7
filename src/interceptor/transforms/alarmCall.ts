import { MESSAGE_EVENT_KEY, MESSAGE_SUBSCRIBE_TOPIC } from '@/const/const.message.type'
import type { AlarmCallAnswerStatusData } from '@/controller/core/protocol/LegacyMessageProtocol'
import type { MessageInterceptor, NormalizedMessage } from '../types'
import { matchesMessageRoute } from '../matcher'
import { getFrameMetadata, getMessagePayload, isPlainObject, unwrapMessageFrames } from '../unwrap'

export const normalizeAlarmCallFrames = (
  frame: unknown,
  nativeOnly = false,
): NormalizedMessage<AlarmCallAnswerStatusData>[] => {
  const results: NormalizedMessage<AlarmCallAnswerStatusData>[] = []
  const seen = new Set<object>()
  for (const body of unwrapMessageFrames(frame)) {
    if (!matchesMessageRoute(body, MESSAGE_SUBSCRIBE_TOPIC.ALARM_CALL)) continue
    const content = getMessagePayload(body)
    if (
      nativeOnly &&
      (!isPlainObject(body.value.customContent) ||
        !(
          content.eventName === 'AlarmCallAnswerStatusChanged' ||
          body.topics.some(
            (topic) =>
              topic.type === 'CUSTOM' &&
              topic.customType === 'ALARM_CALL' &&
              topic.key?.toUpperCase() === 'ANSWER_STATUS_CHANGED',
          ) ||
          (String(body.raw.notifyType ?? '').toUpperCase() === 'ALARM_CALL' &&
            String(body.raw.notifySubType ?? '').toUpperCase() === 'ANSWER_STATUS_CHANGED')
        ))
    )
      continue
    const data = isPlainObject(content.data) ? content.data : content
    if (typeof data.callId !== 'string' || !data.callId || seen.has(data)) continue
    if (
      !body.notifyType &&
      !body.topics.some((topic) => topic.type === 'CUSTOM') &&
      !content.eventName &&
      data.answered === undefined &&
      data.ended === undefined &&
      data.newState === undefined
    )
      continue
    seen.add(data)
    const meta = getFrameMetadata(body)
    if (typeof content.eventId === 'string') meta.eventId = content.eventId
    if (typeof content.eventName === 'string') meta.eventName = content.eventName
    if (typeof content.source === 'string') meta.source = content.source
    meta.topicKey = MESSAGE_SUBSCRIBE_TOPIC.ALARM_CALL.key
    results.push({
      eventKey: MESSAGE_EVENT_KEY.ALARM_CALL_ANSWER_STATUS_CHANGED,
      data: data as AlarmCallAnswerStatusData,
      meta,
    })
    break
  }
  return results
}

export const normalizeAlarmCallFrame = (frame: unknown) => normalizeAlarmCallFrames(frame)[0] ?? null

export const alarmCallInterceptor: MessageInterceptor = {
  id: 'topic:alarm-call',
  priority: 130,
  describe: '来电应答状态',
  subscribe: MESSAGE_SUBSCRIBE_TOPIC.ALARM_CALL,
  transform: (ctx) => {
    const results = normalizeAlarmCallFrames(ctx.raw)
    return { matched: results.length > 0, results, stop: true }
  },
}
