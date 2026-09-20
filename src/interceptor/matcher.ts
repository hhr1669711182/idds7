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
 *   4. customContent.data 存在性兜底（仅 CUSTOM）
 *
 * SEAT 订阅只做 topics 匹配；命中后由 transform 自行二次分发到内部 eventKey。
 */

import type { InterceptorContext, SubscribeRule } from './types'
import { normalize, type NormalizeResult } from './unwrap'

/** topics[] 单条是否命中订阅 */
const topicHit = (topic: NormalizeResult['topics'][number], sub: SubscribeRule): boolean => {
  if (topic.type !== String(sub.type ?? '').toUpperCase()) return false
  if (sub.customType !== undefined && topic.customType !== String(sub.customType).toUpperCase()) return false
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
    if (merged !== String(sub.key).toUpperCase()
      && merged !== `${String(sub.customType).toUpperCase()}_${String(sub.key).toUpperCase()}`) {
      return false
    }
  }
  return true
}

/** customContent.eventName 兜底（仅 CUSTOM） */
const eventNameFromSubscription = (sub: SubscribeRule): string | null => {
  if (sub.type !== 'CUSTOM' || !sub.customType || !sub.key) return null
  const camel = [sub.customType, sub.key]
    .map(part => String(part).toLowerCase().split('_').map(s => s ? s[0].toUpperCase() + s.slice(1) : '').join(''))
    .join('')
  return `${camel}Event`
}

/** 数据结构兜底：customContent.data 必须存在且为对象（仅 CUSTOM） */
const hasCustomData = (m: NormalizeResult): boolean =>
  m.customContent !== null && typeof m.customContent.data === 'object' && m.customContent.data !== null

/**
 * 通用匹配入口：
 *   - CUSTOM：topics / notify / eventName / data 四级兜底
 *   - SEAT：  仅 topics 匹配
 *   - 其他：  返回 false，由 transform 自行处理
 */
export const matchSubscription = (ctx: InterceptorContext, sub: SubscribeRule): boolean => {
  const m = normalize(ctx.raw)
  if (!m) return false

  if (m.topics.some(t => topicHit(t, sub))) return true

  if (sub.type === 'CUSTOM') {
    if (notifyHit(m, sub)) return true
    const eventName = eventNameFromSubscription(sub)
    if (eventName && m.customContent && m.customContent.eventName === eventName) return true
    if (hasCustomData(m)) return true
  }
  return false
}