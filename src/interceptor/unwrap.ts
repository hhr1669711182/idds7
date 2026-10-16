/**
 * 消息体归一（通用层）
 *
 * 唯一职责：把 WS / postMessage 上来的消息体转成统一的对象视图
 *   - customContent / content 是 JSON 字符串时自动 parse
 *   - topics / notifyType / notifySubType 字段大小写归一
 *
 * 业务判断（topics 命中 / eventName 推导 / data 兜底）由业务规则自行处理。
 */

import type { MessageMetadata } from '@/types/message'

type AnyRecord = Record<string, unknown>

export const isPlainObject = (v: unknown): v is AnyRecord => !!v && typeof v === 'object' && !Array.isArray(v)

const tryParse = (raw: unknown): unknown => {
  let value = raw
  while (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      if (parsed === value) break
      value = parsed
    } catch {
      break
    }
  }
  return value
}

const upper = (v: unknown) => String(v ?? '').toUpperCase()

export interface NormalizedTopic {
  type: string
  customType?: string
  key?: string
}

export interface NormalizeResult {
  raw: AnyRecord
  value: AnyRecord
  content: AnyRecord | null
  customContent: AnyRecord | null
  topics: NormalizedTopic[]
  notifyType: string
  notifySubType: string
  meta: MessageMetadata
}

const normalizeTopic = (t: unknown): NormalizedTopic | null => {
  if (typeof t === 'string' && t.includes('/')) {
    const [domain, ...parts] = t.split('/')
    return upper(domain) === 'SEAT'
      ? { type: 'SEAT', key: parts.join('/') }
      : { type: 'CUSTOM', customType: upper(domain), key: parts.join('/') }
  }
  if (!isPlainObject(t)) return null
  const topic: NormalizedTopic = { type: upper((t as AnyRecord).type) }
  const r = t as AnyRecord
  if (r.customType !== undefined) topic.customType = upper(r.customType)
  if (r.key !== undefined) topic.key = String(r.key)
  return topic
}

const normalizeRecord = (r: AnyRecord): NormalizeResult => {
  const contentRaw = tryParse(r.content)
  const content = isPlainObject(contentRaw) ? contentRaw : null

  const ccRaw = tryParse(r.customContent)
  const customContent = isPlainObject(ccRaw) ? ccRaw : null

  const rawTopics = Array.isArray(r.topics) ? r.topics : typeof r.topic === 'string' ? [r.topic] : []
  const topics = rawTopics.length ? rawTopics.map(normalizeTopic).filter((t): t is NormalizedTopic => t !== null) : []

  const notify = isPlainObject(r.notifyTypeDto) ? r.notifyTypeDto : {}

  return {
    raw: r,
    value: r,
    content,
    customContent,
    topics,
    notifyType: upper(notify.notifyType ?? r.notifyType),
    notifySubType: upper(notify.notifySubType ?? r.notifySubType),
    meta: isPlainObject(r.meta) ? r.meta : {},
  }
}

export const normalize = (raw: unknown): NormalizeResult | null => {
  if (!isPlainObject(raw)) return null
  try {
    return normalizeRecord(raw)
  } catch {
    return null
  }
}

const WRAPPER_KEYS = ['request', 'data', 'body', 'message', 'payload', 'userMsgBodyList'] as const
const ROUTING_KEYS = [
  'topics',
  'topic',
  'notifyType',
  'notifySubType',
  'notifyTypeDto',
  'source',
  'type',
  'id',
  'eventName',
] as const

export const unwrapMessageFrames = (frame: unknown, options: { skipT1Payloads?: boolean } = {}): NormalizeResult[] => {
  const pending: Array<{ value: unknown; inherited: AnyRecord; root?: boolean }> = [
    { value: frame, inherited: {}, root: true },
  ]
  const visited = new Set<object>()
  const frames: NormalizeResult[] = []
  while (pending.length) {
    const entry = pending.pop()!
    const value = tryParse(entry.value)
    if (!value || typeof value !== 'object' || visited.has(value)) continue
    visited.add(value)
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index--) {
        pending.push({ value: value[index], inherited: entry.inherited })
      }
      continue
    }
    const current = value as AnyRecord
    const isT1 = typeof current.eventType === 'string'
    if (options.skipT1Payloads && isT1 && !entry.root) continue
    const raw = { ...entry.inherited, ...current }
    raw.meta = {
      ...(isPlainObject(entry.inherited.meta) ? entry.inherited.meta : {}),
      ...(isPlainObject(current.meta) ? current.meta : {}),
    }
    if (current.notifyType !== undefined && current.notifyTypeDto === undefined) delete raw.notifyTypeDto
    const normalized = normalize(raw)
    if (!normalized) continue
    normalized.value = current
    frames.push(normalized)
    if (options.skipT1Payloads && isT1) continue
    const inherited: AnyRecord = { meta: getFrameMetadata(normalized) }
    for (const key of ROUTING_KEYS) {
      if (raw[key] !== undefined) inherited[key] = raw[key]
    }
    const request = isPlainObject(raw.request) ? raw.request : null
    if (request?.channel !== undefined) inherited.request = { channel: request.channel }
    else if (isPlainObject(entry.inherited.request)) inherited.request = entry.inherited.request
    for (let index = WRAPPER_KEYS.length - 1; index >= 0; index--) {
      pending.push({ value: current[WRAPPER_KEYS[index]], inherited })
    }
  }
  return frames
}

export const getMessagePayload = (frame: NormalizeResult): AnyRecord => {
  if (frame.customContent || frame.content) return frame.customContent ?? frame.content!
  if (typeof frame.value.eventName === 'string' || typeof frame.value.event_type === 'string') return frame.value
  return isPlainObject(frame.value.data) ? frame.value.data : frame.value
}

export const getContentPayload = (frame: NormalizeResult, includeData = false): AnyRecord | null => {
  const payload = tryParse(frame.value.content ?? (includeData ? frame.value.data : undefined) ?? frame.value)
  return isPlainObject(payload) ? payload : null
}

export const getLocationFrames = (frame: unknown, nativeOnly = false): NormalizeResult[] => {
  const frames = unwrapMessageFrames(frame, { skipT1Payloads: true })
  if (!nativeOnly) return frames
  if (!isPlainObject(frame)) return []
  const bodies = Array.isArray(frame.userMsgBodyList) ? frame.userMsgBodyList : [frame]
  return frames.filter((body) => bodies.includes(body.value))
}

export const getFrameMetadata = (frame: NormalizeResult): MessageMetadata => {
  const meta: MessageMetadata = { ...frame.meta }
  if (typeof frame.raw.id === 'string' || typeof frame.raw.id === 'number') meta.recordId = frame.raw.id
  if (typeof frame.raw.source === 'string') meta.source = frame.raw.source
  if (typeof frame.raw.type === 'string') meta.sourceEventType = frame.raw.type
  if (typeof frame.raw.eventId === 'string') meta.eventId = frame.raw.eventId
  if (typeof frame.raw.eventName === 'string') meta.eventName = frame.raw.eventName
  const notify = isPlainObject(frame.raw.notifyTypeDto) ? frame.raw.notifyTypeDto : frame.raw
  if (typeof notify.notifyType === 'string') meta.notifyType = notify.notifyType
  if (typeof notify.notifySubType === 'string') meta.notifySubType = notify.notifySubType
  if (frame.topics.length) meta.topics = frame.topics
  const request = isPlainObject(frame.raw.request) ? frame.raw.request : null
  if (typeof request?.channel === 'string') meta.channel = request.channel
  return meta
}
