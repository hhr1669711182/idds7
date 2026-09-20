/**
 * 来电应答状态
 * subscribe 直接 spread MESSAGE_SUBSCRIBE_TOPIC.ALARM_CALL，按需覆盖字段
 */

import { MESSAGE_EVENT_KEY, MESSAGE_SUBSCRIBE_TOPIC } from '@/const/const.message.type'
import type { MessageInterceptor } from '../types'
import { matchSubscription } from '../matcher'
import { normalize } from '../unwrap'

const SUBSCRIBE = {
  ...MESSAGE_SUBSCRIBE_TOPIC.ALARM_CALL,
} as const

const transform: MessageInterceptor['transform'] = (ctx) => {
  if (!matchSubscription(ctx, SUBSCRIBE)) return { matched: false }
  const m = normalize(ctx.raw)!
  const data = m.customContent?.data
  if (!data || typeof data !== 'object' || !data.callId) return { matched: false }
  const cc = m.customContent!

  return {
    matched: true,
    eventKey: MESSAGE_EVENT_KEY.ALARM_CALL_ANSWER_STATUS_CHANGED,
    data,
    meta: {
      recordId: m.raw.id,
      eventId: cc.eventId,
      eventName: cc.eventName,
      source: cc.source,
      topicKey: SUBSCRIBE.key,
    },
    stop: true,
  }
}

export const alarmCallInterceptor: MessageInterceptor = {
  id: 'topic:alarm-call',
  priority: 200,
  describe: '来电应答状态',
  subscribe: SUBSCRIBE,
  transform,
}