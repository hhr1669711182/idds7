/**
 * @Description: 警情定位（画像地址变更）消息协议层。
 * 负责 DISASTER_PROFILE / ADDRESS_UPDATED 主题的订阅报文构造与 WS 帧解析：
 * 识别 topics 或 notifyType/notifySubType，将 customContent.slotChanges 的
 * 变更清单按 slotCode -> afterValue 解析为地址/经纬度快照（afterValue=null 表示清空）。
 * 触发时机：画像的地址、经纬度或地址附属信息的正式值发生变化（含清空），
 * 仅 AI 候选变化不推送；订阅与消息服务其他主题共用同一个 WebSocket 通道。
 * @FilePath: src/Control/incidentLocationMessage.ts
 */
import { MESSAGE_EVENT_KEY } from '@/const/const.message.type'

/**
 * 画像地址/经纬度变更消息（DISASTER_PROFILE / ADDRESS_UPDATED）
 * 订阅与消息服务其他主题共用同一个 WebSocket 通道。
 */
export const ADDRESS_UPDATED_SUBSCRIPTION = {
  action: 'subscribe',
  type: 'CUSTOM',
  customType: 'DISASTER_PROFILE',
  key: 'UPDATED',
} as const

/** 规范化后的画像地址变更数据 */
export type AddressUpdatedData = {
  eventId?: string
  occurredAt?: string | null
  disasterProfileId?: string | null
  incidentId?: string | null
  inquiryId?: string | null
  version: number
  /** 灾害地址；filledValue 为 null/空串时为 null（清空） */
  address: string | null
  /** 经度；缺失或清空时为 null，业务侧应移除旧点位 */
  longitude: number | null
  /** 纬度；缺失或清空时为 null，业务侧应移除旧点位 */
  latitude: number | null
  /** slotChanges 净变化清单：slotCode -> afterValue（string|null） */
  slots: Record<string, string | null>
}

/** slotChanges 变更清单按 slotCode 转映射；afterValue 为字符串或 null（清空/移除） */
const parseSlotChanges = (changes: Array<Record<string, any>>) => {
  const slotMap: Record<string, string | null> = {}
  changes.forEach((change) => {
    const code = String(change?.slotCode ?? '').trim()
    if (!code) return
    slotMap[code] = change.afterValue === null || change.afterValue === undefined
      ? null
      : String(change.afterValue)
    if(slotMap[code] === null)
    slotMap[code] = change.beforeValue === null || change.beforeValue === undefined
      ? null
      : String(change.beforeValue)
  })
  const toCoordinate = (code: 'longitude' | 'latitude') => {
    const raw = slotMap[code]
    if (raw === null || raw === undefined || !raw.trim()) return null
    const num = Number(raw)
    return Number.isFinite(num) ? num : null
  }
  return {
    slots: slotMap,
    address: slotMap.disaster_address ?? null,
    longitude: toCoordinate('longitude'),
    latitude: toCoordinate('latitude'),
  }
}

/**
 * 识别 DISASTER_PROFILE/ADDRESS_UPDATED 帧并提取 customContent 中的地址快照。
 * 本地 Mock 可能直接下发 customContent 本体（slotChanges 位于帧根）。
 */
export const normalizeAddressUpdatedFrame = (frame: unknown) => {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) return null
  console.log('normalizeAddressUpdatedFrame')
  const root = frame as Record<string, any>
  const matchesTopic = Array.isArray(root.topics) && root.topics.some(
    (topic: Record<string, any>) =>
      String(topic?.type ?? '').toUpperCase() === 'CUSTOM'
      && String(topic?.customType ?? '').toUpperCase() === 'DISASTER_PROFILE'
      && String(topic?.key ?? '').toUpperCase() === 'UPDATED',
  )
  const matchesNotifyType = String(root.notifyType ?? '').toLowerCase() === 'disaster_profile'
    && String(root.notifySubType ?? '').toLowerCase() === 'updated'
  if (!matchesTopic && !matchesNotifyType) return null

  const content = root.customContent && typeof root.customContent === 'object'
    ? root.customContent as Record<string, any>
    : root
  if (!Array.isArray(content.slotChanges)) return null

  const parsed = parseSlotChanges(content.slotChanges)
  const data: AddressUpdatedData = {
    eventId: content.eventId ? String(content.eventId) : undefined,
    occurredAt: content.occurredAt ?? null,
    disasterProfileId: content.disasterProfileId ?? null,
    incidentId: content.incidentId ?? null,
    inquiryId: content.inquiryId ?? null,
    version: Number(content.version) || 0,
    address: parsed.address,
    longitude: parsed.longitude,
    latitude: parsed.latitude,
    slots: parsed.slots,
  }

  return {
    eventKey: MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED,
    data,
  }
}
