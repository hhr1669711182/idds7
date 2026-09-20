/**
 * 警情状态变更
 * subscribe 直接 spread MESSAGE_SUBSCRIBE_TOPIC.ALARM_INCIDENT，按需覆盖字段
 * 命中由 matchSubscription 统一处理；业务层只做数据归一
 */

import { MESSAGE_EVENT_KEY, MESSAGE_SUBSCRIBE_TOPIC } from '@/const/const.message.type'
import type { MessageInterceptor } from '../types'
import { matchSubscription } from '../matcher'
import { normalize } from '../unwrap'

const SUBSCRIBE = {
  ...MESSAGE_SUBSCRIBE_TOPIC.ALARM_INCIDENT,
} as const

const transform: MessageInterceptor['transform'] = (ctx) => {
  if (!matchSubscription(ctx, SUBSCRIBE)) return { matched: false }
  const m = normalize(ctx.raw)!
  const data = m.customContent?.data
  if (!data || typeof data !== 'object' || !data.incidentId) return { matched: false }
  const cc = m.customContent!

  return {
    matched: true,
    eventKey: MESSAGE_EVENT_KEY.ALARM_INCIDENT_STATE_CHANGED,
    data,
    meta: {
      recordId: m.raw.id,
      eventId: cc.eventId,
      eventName: cc.eventName,
      source: cc.source,
    },
    stop: true,
  }
}

export const alarmInterceptor: MessageInterceptor = {
  id: 'topic:alarm-incident',
  priority: 200,
  describe: '警情状态变更',
  subscribe: SUBSCRIBE,
  transform,
}