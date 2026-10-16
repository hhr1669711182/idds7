/**
 * 公共订阅匹配器
 *
 * 输入：归一后的 NormalizeResult（见 unwrap.ts）
 *   - topics: 大写归一的对象数组
 *   - customContent / content: 一定是对象或 null（字符串已 JSON.parse）
 *   - notifyType / notifySubType: 大写字符串
 *
 * 命中策略：
 *   1. topics[] 精确匹配 {type, customType?, key?}
 *   2. notifyType/notifySubType 兜底（仅 CUSTOM）
 *   3. customContent.eventName 兜底（仅 CUSTOM，自动按 {Type}{Key 驼峰}+Event 推导）
 *   4. 无冲突路由时才允许业务载荷兜底（仅 CUSTOM）
 *
 * SEAT 订阅只做 topics 匹配；命中后由 transform 自行二次分发到内部 eventKey。
 */

import type { InterceptorContext, SubscribeRule } from './types'
import {
  getContentPayload,
  getMessagePayload,
  isPlainObject,
  unwrapMessageFrames,
  type NormalizeResult,
} from './unwrap'

/** topics[] 单条是否命中订阅 */
const topicHit = (topic: NormalizeResult['topics'][number], sub: SubscribeRule): boolean => {
  if (topic.type !== String(sub.type ?? '').toUpperCase()) return false
  if (sub.customType !== undefined && topic.customType !== String(sub.customType).toUpperCase()) {
    const legacyGps =
      topic.customType === undefined &&
      String(sub.customType).toUpperCase() === 'GPS_MSG' &&
      String(topic.key ?? '').toLowerCase() === 'car-location-broadcast-all'
    if (!legacyGps) return false
  }
  if (sub.key !== undefined && sub.key !== null) {
    const keyUpper = String(sub.key).toUpperCase()
    if (String(topic.key ?? '').toUpperCase() !== keyUpper) return false
  }
  return true
}

/** notifyType / notifySubType 兜底匹配（仅 CUSTOM） */
const notifyHit = (m: NormalizeResult, sub: SubscribeRule): boolean => {
  if (sub.type !== 'CUSTOM') return false
  const t = m.notifyType
  if (!t) return false
  if (sub.customType && t !== String(sub.customType).toUpperCase()) return false
  if (sub.key) {
    const merged = `${t}_${m.notifySubType}`
    if (
      merged !== String(sub.key).toUpperCase() &&
      merged !== `${String(sub.customType).toUpperCase()}_${String(sub.key).toUpperCase()}`
    ) {
      return false
    }
  }
  return true
}

/** customContent.eventName 兜底（仅 CUSTOM） */
const eventNameFromSubscription = (sub: SubscribeRule): string | null => {
  if (sub.type !== 'CUSTOM' || !sub.customType || !sub.key) return null
  const camel = [sub.customType, sub.key]
    .map((part) =>
      String(part)
        .toLowerCase()
        .split('_')
        .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : ''))
        .join(''),
    )
    .join('')
  return `${camel}Event`
}

/** 数据结构兜底：customContent.data 必须存在且为对象（仅 CUSTOM） */
const hasCustomData = (m: NormalizeResult): boolean =>
  m.customContent !== null && typeof m.customContent.data === 'object' && m.customContent.data !== null

const getRoutePayload = (frame: NormalizeResult, sub: SubscribeRule) =>
  sub.customType === 'GPS_MSG' || sub.customType === 'POSITION_SYNC'
    ? (getContentPayload(frame, sub.customType === 'GPS_MSG') ?? {})
    : getMessagePayload(frame)

export const matchesMessageRoute = (frame: NormalizeResult, sub: SubscribeRule): boolean => {
  const businessTopics = frame.topics.filter((topic) => topic.type !== 'SEAT')
  if (businessTopics.length && !businessTopics.some((topic) => topicHit(topic, sub))) return false
  if (frame.notifyType) {
    const allowed = [String(sub.customType ?? '').toUpperCase()]
    if (sub.customType === 'GPS_MSG') allowed.push('CAR_LOCATION_SYNC')
    if (!allowed.includes(frame.notifyType)) return false
    if (frame.notifySubType && sub.key && frame.notifySubType !== String(sub.key).toUpperCase()) return false
  }
  const payload = getRoutePayload(frame, sub)
  const eventName = payload.eventName ?? frame.raw.eventName
  const expectedName = eventNameFromSubscription(sub)
  if (
    typeof eventName === 'string' &&
    eventName &&
    eventName !== expectedName &&
    eventName !== expectedName?.replace(/Event$/, '')
  )
    return false
  if (typeof frame.raw.type === 'string' && frame.raw.type.startsWith('ids:')) {
    return (
      sub.customType === 'GPS_MSG' &&
      frame.raw.type.toLowerCase() === 'ids:carlocation:location-sync' &&
      String(frame.raw.source ?? '').toLowerCase() === 'ids:carlocation'
    )
  }
  return true
}

/**
 * 通用匹配入口：
 *   - CUSTOM：topics / notify / eventName / data 四级兜底
 *   - SEAT：  仅 topics 匹配
 *   - 其他：  返回 false，由 transform 自行处理
 */
export const matchSubscription = (ctx: InterceptorContext, sub: SubscribeRule): boolean => {
  return unwrapMessageFrames(ctx.raw).some((m) => {
    if (sub.type === 'SEAT') return m.topics.some((topic) => topicHit(topic, sub))
    if (sub.type !== 'CUSTOM') return false
    if (!sub.customType) {
      if (m.topics.length) return m.topics.some((topic) => topicHit(topic, sub))
      if (m.notifyType) return notifyHit(m, sub)
      return hasCustomData(m)
    }
    if (!matchesMessageRoute(m, sub)) return false
    const payload = getRoutePayload(m, sub)
    return (
      m.topics.some((topic) => topicHit(topic, sub)) ||
      notifyHit(m, sub) ||
      typeof payload.eventName === 'string' ||
      hasCustomData(m) ||
      isPlainObject(m.raw.data) ||
      m.content !== null ||
      ['datas', 'callId', 'incidentId', 'slotChanges', 'slots'].some((key) => payload[key] !== undefined)
    )
  })
}
