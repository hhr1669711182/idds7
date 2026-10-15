/**
 * @Description: 警情定位 HTTP 接入来源。
 * 监听 seat-shared-state 中 currentAlarm.incidentId 的变化，
 * 切换到新警情时通过 GET /bff-client/api/v1/inquiry/profiles/by-incident/{incidentId}
 * 拉取画像全量 slots（slotCode -> filledValue），转为 AddressUpdatedData 后
 * 回交 handlers.onAddressUpdated，与 WS 增量消息走同一 cache.merge → store 流程。
 * HTTP 负责警情切换时的初始全量快照，WS 负责后续 slot 变更，两者并存。
 * @FilePath: src/Control/incidentLocationProfileSync.ts
 */
import { SEAT_SHARED_STATE_KEY, applySharedAuthTraceHeaders } from '@/Control/seatSharedState'
import { alovaInstance } from '@/service/alova'
import type { AddressUpdatedData } from '@/Control/incidentLocationMessage'
import type { MessageEnvelope } from '@/types/message'
import { MESSAGE_CHANNEL, MESSAGE_EVENT_KEY, MESSAGE_SYSTEM } from '@/const/const.message.type'
import { useIncidentLocationStore } from '@/store/useIncidentLocationStore'

/** slots 中指定主管队站（辖区）的 slotCode，值对应 gis:view_juris_zone.zone_id */
const PRIMARY_STATION_SLOT_CODE = 'm_org_id'

/** 接口返回的单个 slot（alova 已解包 data，此处只保留需要的字段） */
type ProfileSlot = {
  slotCode?: string
  filledValue?: string | null
}

/** GET 通过警情id获取警情定位by-incident/{incidentId} 返回的 data（已解包） */
type IncidentProfileData = {
  disasterProfileId?: string | null
  inquiryId?: string | null
  incidentId?: string | null
  version?: number
  slots?: ProfileSlot[]
}

/** 将接口全量 slots 数组按 slotCode 转映射；filledValue 为 null 表示未填充/清空 */
const parseProfileSlots = (slots: ProfileSlot[] = []) => {
  const slotMap: Record<string, string | null> = {}
  slots.forEach((slot) => {
    const code = String(slot?.slotCode ?? '').trim()
    if (!code) return
    slotMap[code] = slot.filledValue === null || slot.filledValue === undefined
      ? null
      : String(slot.filledValue)
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
    primaryStationId: slotMap[PRIMARY_STATION_SLOT_CODE]?.trim() || null,
  }
}

/** 接口 data -> AddressUpdatedData（与 WS normalizeAddressUpdatedFrame 输出同构） */
const toAddressUpdatedData = (data: IncidentProfileData): AddressUpdatedData => {
  const parsed = parseProfileSlots(data.slots ?? [])
  return {
    eventId: undefined,
    occurredAt: null,
    disasterProfileId: data.disasterProfileId ?? null,
    incidentId: data.incidentId ?? null,
    inquiryId: data.inquiryId ?? null,
    version: Number(data.version) || 0,
    address: parsed.address,
    longitude: parsed.longitude,
    latitude: parsed.latitude,
    primaryStationId: parsed.primaryStationId,
    slots: parsed.slots,
  }
}

/** 从 localStorage 读取 seat-shared-state.currentAlarm.incidentId */
const readCurrentIncidentId = (): string | null => {
  try {
    const state = JSON.parse(localStorage.getItem(SEAT_SHARED_STATE_KEY) || 'null')
    const incidentId = state?.currentAlarm?.incidentId
    return typeof incidentId === 'string' && incidentId.trim() ? incidentId.trim() : null
  } catch {
    return null
  }
}

/**
 * 创建警情定位 HTTP 同步。
 * 监听 currentAlarm.incidentId 变化，切换警情时拉取画像全量定位，
 * 构造 MessageEnvelope<AddressUpdatedData> 后回交 onProfile（handlers.onAddressUpdated），
 * 与 WS 增量消息共用同一 cache.merge 与 store 流程，享受阶段门控与版本去重。
 * 返回清理函数：解绑 storage 监听并标记停止后续请求。
 */
export const createIncidentLocationProfileSync = (
  onProfile: (envelope: MessageEnvelope<AddressUpdatedData>) => void,
): (() => void) => {
  let lastIncidentId: string | null = readCurrentIncidentId()
  let disposed = false
  let inFlight: Promise<void> | null = null

  const fetchProfile = (incidentId: string) => {
    if (inFlight) return inFlight
    inFlight = (async () => {
      try {
        // 在已有请求头上追加 X-Trace-Id / Tenantid（值由受理席写入 seat-shared-state.auth，每次请求实时读取）
        const headers = applySharedAuthTraceHeaders({})
        const data = await alovaInstance.Get<IncidentProfileData>(
          `/bff-client/api/v1/inquiry/profiles/by-incident/${incidentId}`,
          {
            cacheFor: 0,
            meta: { showError: false },
            headers,
          },
        )
        if (disposed || !data) return
        // 切换警情：先清除上一次的显示结果（警情点位/主管辖区/支撑辖区/队站过滤/路径/版本号），
        useIncidentLocationStore().clearAll()
        const addressData = toAddressUpdatedData(data)
        if (!addressData.incidentId && !addressData.disasterProfileId) return
        onProfile({
          id: `profile-sync-${incidentId}-${Date.now()}`,
          timestamp: Date.now(),
          channel: MESSAGE_CHANNEL.WS,
          system: MESSAGE_SYSTEM.IDS_SEAT_WEB,
          eventKey: MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED,
          data: addressData,
        })
      } catch (error) {
        console.warn('[incident-location-profile] 拉取画像定位失败', { incidentId, error })
      } finally {
        inFlight = null
      }
    })()
    return inFlight
  }

  const checkAndFetch = () => {
    if (disposed) return
    const next = readCurrentIncidentId()
    if (next === lastIncidentId) return
    lastIncidentId = next
    if (!next) return
    console.info('[alarm-message] 切换警情：', { incidentId: next })

    // 拉取新警情全量快照。WS 与 HTTP 不会并发，clearAll 后不会被 WS 增量重新建点。
    void fetchProfile(next)
  }

  // 启动时若已有 incidentId（F5 刷新 /dispatch1 场景）立即拉取一次
  checkAndFetch()

  // 监听坐席窗口写入的 seat-shared-state 变化（本窗口写入不触发本窗口事件）
  const onStorage = (event: StorageEvent) => {
    if (disposed) return
    if (event.storageArea !== localStorage) return
    if (event.key !== SEAT_SHARED_STATE_KEY && event.key !== null) return
    checkAndFetch()
  }
  window.addEventListener('storage', onStorage)

  return () => {
    disposed = true
    window.removeEventListener('storage', onStorage)
  }
}
