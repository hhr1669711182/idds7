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
import {
  parseSharedMapStage,
  SEAT_SHARED_STATE_KEY,
  type SharedMapStage,
} from '@/Control/seatSharedState'

/**
 * 画像地址/经纬度变更消息（DISASTER_PROFILE / ADDRESS_UPDATED）
 * 订阅与消息服务其他主题共用同一个 WebSocket 通道。
 */
export const ADDRESS_UPDATED_SUBSCRIPTION = {
  action: 'subscribe',
  topic: 'DISASTER_PROFILE/UPDATED',
} as const

/** slotChanges 中指定主管队站（辖区）的 slotCode，值对应 gis:view_juris_zone.zone_id */
const PRIMARY_STATION_SLOT_CODE = 'm_org_id'

/**
 * 影响警情点位上图/重新定位的槽位：经度、纬度、主管队站（m_org_id）。
 * 仅这些槽位出现在本条消息的 slotChanges 中时才重绘点位/定位/重查辖区；
 * 其余槽位（如 disaster_address）变更只合并缓存，不触发地图动作。
 */
export const LOCATION_RELEVANT_SLOT_CODES = [
  'longitude',
  'latitude',
  PRIMARY_STATION_SLOT_CODE,
] as const

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
  /** 消息指定的主管队站 ID（m_org_id，对应 gis:view_juris_zone.zone_id）；空串/缺失为 null */
  primaryStationId: string | null
  /** slotChanges 净变化清单：slotCode -> afterValue（string|null）；经缓存合并后为累计全量快照 */
  slots: Record<string, string | null>
}

/** 从（可能已累计合并的）slot 映射派生地址与经纬度；缺失/清空时为 null */
const deriveSlotSnapshot = (slots: Record<string, string | null>) => {
  const toCoordinate = (code: 'longitude' | 'latitude') => {
    const raw = slots[code]
    if (raw === null || raw === undefined || !raw.trim()) return null
    const num = Number(raw)
    return Number.isFinite(num) ? num : null
  }
  return {
    address: slots.disaster_address ?? null,
    longitude: toCoordinate('longitude'),
    latitude: toCoordinate('latitude'),
    primaryStationId: slots[PRIMARY_STATION_SLOT_CODE]?.trim() || null,
  }
}

/** 
 * @description slotChanges 变更清单按 slotCode 转映射；afterValue 为字符串或 null（清空/移除）
 * @param changes slotChanges 变更清单
 * @returns 规范化后的画像地址变更数据
 */
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
  return { slots: slotMap, ...deriveSlotSnapshot(slotMap) }
}

/**
 * 将全量 slots 数组按 slotCode 转映射；值字段名为 filledValue
 * （2026-09-22 抓包实证，非 value），filledValue 为 null/undefined 时记为 null。
 */
const parseFilledSlots = (
  slots: Array<Record<string, any>>,
): Record<string, string | null> => {
  const slotMap: Record<string, string | null> = {}
  slots.forEach((slot) => {
    if (!slot || typeof slot !== 'object') return
    const code = String(slot.slotCode ?? '').trim()
    if (!code) return
    const raw = slot.filledValue
    slotMap[code] = raw === null || raw === undefined ? null : String(raw)
  })
  return slotMap
}

/**
 * 画像扁平业务体（customContent 本体）→ AddressUpdatedData。
 * 三种接入方式的数据结构与处理逻辑完全一致，仅外层接入不同：
 * - WS：帧的 customContent（经 topics/notifyType 识别）；
 * - 地图屏实时转发通道（§8.3.1）：relay payload（扁平业务体，version 仲裁在读侧）；
 * - 本地 mock：customContent 直接位于帧根。
 *
 * 规则：
 * - slotChanges 存在时须命中位置相关槽位（经度/纬度/主管队站）才放行，
 *   afterValue=null（显式清空）同样命中；无位置槽位返回 null；
 * - slots 为全量快照（filledValue）时以其为底，slotChanges 的 afterValue 覆盖
 *   （undefined 不覆盖，null 显式清空），交下游 cache.replace 整体替换；
 * - 仅有 slotChanges 时按增量解析（afterValue 缺失回退 beforeValue），
 *   交下游 cache.merge 与同阶段历史快照合并；
 * - slotChanges 与 slots 均缺失时无法识别，返回 null。
 */
export const parseAddressUpdatedContent = (body: unknown): AddressUpdatedData | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const content = body as Record<string, any>
  const slotChanges: Array<Record<string, any>> | null = Array.isArray(content.slotChanges)
    ? content.slotChanges
    : null
  const fullSlots: Array<Record<string, any>> | null = Array.isArray(content.slots)
    ? content.slots
    : null
  if (!slotChanges && !fullSlots) return null

  if (slotChanges) {
    // 仅经度/纬度/主管队站槽位变化才影响警情点位上图与定位；其余槽位（如
    // disaster_address）变化直接忽略。只判断 slotCode 是否出现，afterValue=null
    // （显式清空）仍需放行。
    const hasLocationSlot = slotChanges.some(
      (change: Record<string, any>) =>
        (LOCATION_RELEVANT_SLOT_CODES as readonly string[]).includes(
          String(change?.slotCode ?? '').trim(),
        ),
    )
    if (!hasLocationSlot) return null
  }

  let slots: Record<string, string | null>
  let address: string | null
  let longitude: number | null
  let latitude: number | null
  let primaryStationId: string | null

  if (fullSlots) {
    // slots 自含全量快照（filledValue）为底，slotChanges 的 afterValue 覆盖
    const baseSlots = parseFilledSlots(fullSlots)
    // afterValue=undefined 不覆盖；afterValue=null 为显式清空
    const changeMap: Record<string, string | null> = {}
    slotChanges?.forEach((change) => {
      if (!change || typeof change !== 'object') return
      const code = String(change.slotCode ?? '').trim()
      if (!code) return
      if (change.afterValue === undefined) return
      changeMap[code] = change.afterValue === null ? null : String(change.afterValue)
    })
    // 将非空覆盖值写回 slots 快照，使下游 addressCache.replace →
    // deriveSlotSnapshot 也能读到覆盖后的值；null（显式清空）不写回——
    // slots 与 slotChanges 同源，已清空的槽位 filledValue 自身即为 null。
    slots = { ...baseSlots }
    for (const [code, value] of Object.entries(changeMap)) {
      if (value === null) continue
      slots[code] = value
    }
    const base = deriveSlotSnapshot(baseSlots)
    const pickOverride = (code: string, fallback: number | null): number | null => {
      if (!(code in changeMap)) return fallback
      const v = changeMap[code]
      if (v === null || v === undefined || !v.trim()) return null
      const num = Number(v)
      return Number.isFinite(num) ? num : null
    }
    address = 'disaster_address' in changeMap
      ? (changeMap.disaster_address?.trim() || null)
      : base.address
    longitude = pickOverride('longitude', base.longitude)
    latitude = pickOverride('latitude', base.latitude)
    primaryStationId = changeMap[PRIMARY_STATION_SLOT_CODE] !== undefined
      ? (changeMap[PRIMARY_STATION_SLOT_CODE]?.trim() || null)
      : base.primaryStationId
  } else {
    // 仅 slotChanges：增量解析，下游经 cache.merge 补齐未变更属性
    const parsed = parseSlotChanges(slotChanges as Array<Record<string, any>>)
    slots = parsed.slots
    address = parsed.address
    longitude = parsed.longitude
    latitude = parsed.latitude
    primaryStationId = parsed.primaryStationId
  }

  return {
    eventId: content.eventId ? String(content.eventId) : undefined,
    occurredAt: content.occurredAt ?? null,
    disasterProfileId: content.disasterProfileId ?? null,
    incidentId: content.incidentId ?? null,
    inquiryId: content.inquiryId ?? null,
    version: Number(content.version) || 0,
    address,
    longitude,
    latitude,
    primaryStationId,
    slots,
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
  // customContent 本体与地图屏转发通道 payload 为同一扁平业务体，复用同一解析
  const data = parseAddressUpdatedContent(content)
  if (!data) return null

  return {
    eventKey: MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED,
    data,
  }
}

/** 画像归并 key：与 useIncidentLocationStore 的点位 key 规则保持一致 */
const getAddressProfileKey = (data: AddressUpdatedData) =>
  String(data.incidentId || data.disasterProfileId || data.eventId || '').trim()

export type AddressUpdatedCache = {
  /**
   * 将本条消息的增量 slots 合并进同阶段缓存的完整快照后返回完整 data：
   * slotChanges 只携带被改变的属性，用本次值替换缓存旧值，未变更属性沿用缓存。
   * 地图业务阶段变化（或 reset）后缓存清空，本条消息作为新快照起点。
   */
  merge: (data: AddressUpdatedData) => AddressUpdatedData
  /**
   * 用全量 slots 直接替换该画像的缓存快照后返回完整 data：
   * HTTP 接口返回的是全量 slots，不与旧快照合并，避免已清空的 slot 残留旧值。
   */
  replace: (data: AddressUpdatedData) => AddressUpdatedData
  /** 强制清空缓存并以当前阶段为新起点（WS 重连等场景） */
  reset: () => void
  dispose: () => void
}

/**
 * 画像地址变更增量合并缓存。
 * 后端每条 ADDRESS_UPDATED 消息只通过 slotChanges 下发被改变的 slot，
 * 同一地图业务阶段（parseSharedMapStage）内需按画像累计 slots 后再进入后续流程，
 * 否则未随本次消息下发的 address/经纬度会被解析为 null，导致既有警情点位被误删；
 * 阶段切换（如 dispatch -> dispatchTrack -> 新警情 dispatch）时清空缓存，
 * 防止跨警情/跨会话的旧值残留。消息被阶段门控期间也通过 storage 事件感知切换。
 *
 * slots 快照与阶段同时持久化到 sessionStorage：F5 刷新（/dispatch1 且 stage=dispatch）
 * 后缓存不丢，首条增量消息仍能替换旧值而非整体覆盖；关闭标签页自动失效。
 */

/** 增量合并缓存在 sessionStorage 中的键名 */
export const ADDRESS_UPDATED_CACHE_STORAGE_KEY = 'incident-address-updated-cache'

type PersistedAddressCache = {
  stage: SharedMapStage | null
  snapshots: Record<string, Record<string, string | null>>
}

/**
 * 从 sessionStorage 加载画像地址变更增量合并缓存。
 * @param storage 存储缓存的 sessionStorage，默认从 window.sessionStorage 读取
 * @returns 画像地址变更增量合并缓存
 */
const loadPersistedCache = (
  storage: Storage,
): PersistedAddressCache => {
  try {
    const raw = storage.getItem(ADDRESS_UPDATED_CACHE_STORAGE_KEY)
    if (!raw) return { stage: null, snapshots: {} }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { stage: null, snapshots: {} }
    return {
      stage: typeof parsed.stage === 'string' ? parsed.stage as SharedMapStage : null,
      snapshots: parsed.snapshots && typeof parsed.snapshots === 'object'
        ? parsed.snapshots as Record<string, Record<string, string | null>>
        : {},
    }
  } catch {
    return { stage: null, snapshots: {} }
  }
}

/** 当前活跃缓存实例（App 级单例，由 createMapMessageHandlers 创建一次） */
let activeCache: AddressUpdatedCache | null = null

/**
 * 清空画像地址增量合并缓存（内存 + sessionStorage），保留实例与阶段监听。
 * 供离开调派页（dispatchMap 卸载，/dispatch1 -> /map）时调用。
 */
export const resetAddressUpdatedCache = () => {
  activeCache?.reset()
}

/**
 * 创建画像地址变更合并缓存实例
 * @description 用于缓存画像地址变更增量 slots，缓存能跨越 F5 页面刷新存活。
 * 地图业务阶段变化（或 reset）后缓存清空，本条消息作为新快照起点。
 * 供 createMapMessageHandlers 调用，App 级单例。
 * @param options 选项
 * @param options.read 读取当前地图业务阶段的函数，默认从 localStorage 读取 seat-shared-state
 * @param options.storage 存储缓存的 sessionStorage，默认从 window.sessionStorage 读取
 * 供 createMapMessageHandlers 调用，App 级单例。
 */
export const createAddressUpdatedCache = (options: {
  read?: () => string | null
  storage?: Storage
} = {}): AddressUpdatedCache => {
  const read = options.read ?? (() => localStorage.getItem(SEAT_SHARED_STATE_KEY))
  const storage = options.storage
    ?? (typeof sessionStorage !== 'undefined' ? sessionStorage : undefined)

  // 刷新恢复：从 sessionStorage 还原阶段与各画像 slots 快照
  const persisted = storage ? loadPersistedCache(storage) : { stage: null, snapshots: {} }
  let stage: SharedMapStage | null = persisted.stage
  /** profileKey -> 截至当前阶段累计合并的完整 slots 快照 */
  const snapshots = new Map<string, Record<string, string | null>>(
    Object.entries(persisted.snapshots),
  )

  const persist = () => {
    if (!storage) return
    try {
      const value: PersistedAddressCache = {
        stage,
        snapshots: Object.fromEntries(snapshots),
      }
      storage.setItem(
        ADDRESS_UPDATED_CACHE_STORAGE_KEY,
        JSON.stringify(value),
      )
    } catch {
      // 存储不可用（隐私模式/配额不足）时降级为纯内存缓存
    }
  }

  /** 地图业务状态发生变化时清空缓存；状态不变时保留累计快照 */
  const clearIfStageChanged = () => {
    const next = parseSharedMapStage(read())
    if (next !== stage) {
      snapshots.clear()
      stage = next
      persist()
    }
  }

  // 恢复后立即与当前阶段对齐：刷新时阶段已变化（如 dispatch -> dispatchTrack）
  // 则丢弃旧快照，避免跨阶段沿用
  clearIfStageChanged()

  const onStorage = (event: StorageEvent) => {
    if (event.storageArea !== localStorage) return
    if (event.key !== SEAT_SHARED_STATE_KEY && event.key !== null) return
    clearIfStageChanged()
  }
  window.addEventListener('storage', onStorage)

  const cache: AddressUpdatedCache = {
    merge(data) {
      clearIfStageChanged()
      const key = getAddressProfileKey(data)
      const previous = key ? snapshots.get(key) : undefined
      // slotChanges 仅携带被改变的属性：用本次值替换旧值，其余沿用缓存快照
      const mergedSlots = previous
        ? { ...previous, ...data.slots }
        : { ...data.slots }
      if (key) {
        snapshots.set(key, mergedSlots)
        persist()
      }
      return { ...data, ...deriveSlotSnapshot(mergedSlots), slots: mergedSlots }
    },
    replace(data) {
      clearIfStageChanged()
      const key = getAddressProfileKey(data)
      // HTTP 全量 slots：直接作为该画像的完整快照，不沿用旧 slot
      const slots = { ...data.slots }
      if (key) {
        snapshots.set(key, slots)
        persist()
      }
      return { ...data, ...deriveSlotSnapshot(slots), slots }
    },
    reset() {
      snapshots.clear()
      stage = parseSharedMapStage(read())
      persist()
    },
    dispose() {
      window.removeEventListener('storage', onStorage)
      snapshots.clear()
      if (activeCache === cache) activeCache = null
    },
  }
  activeCache = cache
  return cache
}
