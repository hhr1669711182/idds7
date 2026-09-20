/**
 * 消息体归一（通用层）
 *
 * 唯一职责：把 WS / postMessage 上来的消息体转成统一的对象视图
 *   - customContent / content 是 JSON 字符串时自动 parse
 *   - topics / notifyType / notifySubType 字段大小写归一
 *
 * 业务判断（topics 命中 / eventName 推导 / data 兜底）由业务规则自行处理。
 */

type AnyRecord = Record<string, any>

export const isPlainObject = (v: unknown): v is AnyRecord =>
  !!v && typeof v === 'object' && !Array.isArray(v)

const tryParse = (raw: unknown): unknown => {
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) } catch { return raw }
}

const upper = (v: unknown) => String(v ?? '').toUpperCase()

export interface NormalizedTopic {
  type: string
  customType?: string
  key?: string
}

export interface NormalizeResult {
  raw: AnyRecord
  content: AnyRecord | null
  customContent: AnyRecord | null
  topics: NormalizedTopic[]
  notifyType: string
  notifySubType: string
}

const normalizeTopic = (t: unknown): NormalizedTopic | null => {
  if (!isPlainObject(t)) return null
  const topic: NormalizedTopic = { type: upper((t as AnyRecord).type) }
  const r = t as AnyRecord
  if (r.customType !== undefined) topic.customType = upper(r.customType)
  if (r.key !== undefined) topic.key = String(r.key)
  return topic
}

export const normalize = (raw: unknown): NormalizeResult | null => {
  if (!isPlainObject(raw)) return null
  const r = raw as AnyRecord

  const contentRaw = tryParse(r.content)
  const content = isPlainObject(contentRaw) ? contentRaw : null

  const ccRaw = tryParse(r.customContent)
  const customContent = isPlainObject(ccRaw) ? ccRaw : null

  const topics = Array.isArray(r.topics)
    ? r.topics.map(normalizeTopic).filter((t): t is NormalizedTopic => t !== null)
    : []

  return {
    raw: r,
    content,
    customContent,
    topics,
    notifyType: upper(r.notifyType),
    notifySubType: upper(r.notifySubType),
  }
}