/**
 * @Description: 地图屏实时消息转发通道读侧接入（契约 §8）。
 * 主壳屏（host）作为唯一写者，将白名单实时事件（§8.2）经 BroadcastChannel
 * `ids-map-screen-relay` 定向转发地图屏；地图屏只读，仅允许发送 `map-relay-hello`。
 *
 * 白名单事件（V2）：
 * - disaster_profile（§8.3.1）：画像更新，扁平业务体（无 type/data 包裹），slots 自含
 *   全量槽位（值字段名 filledValue，2026-09-22 抓包实证）+ 单调 version，按 version
 *   仲裁 + slotChanges 相关性过滤（仅经纬度/主管队站变化才上图）后整体替换，
 *   复用 handlers.onAddressUpdated（id 以 profile-sync- 开头触发现有 replace 分支，
 *   不走增量 merge）。
 * - POSITION_SYNC（§8.3.2）：来电定位同步，无 version，按到达顺序直接替换，
 *   复用 handlers.onLocateCall。
 *
 * host 侧已做相关性过滤（§8.2）与定位业务体解析（parsePositionSyncPayload），
 * 通道内均为有效业务体，地图屏无需再做 ID 归属匹配或信封解析。
 * 本通道与主契约 blob（localStorage）完全解耦：blob 承载状态投影，本通道承载实时事件流。
 * @FilePath: src/Control/mapRelayReader.ts
 */
import type { MessageEnvelope } from '@/types/message'
import {
  MESSAGE_CHANNEL,
  MESSAGE_EVENT_KEY,
  MESSAGE_PROTOCOL_VERSION,
  MESSAGE_SYSTEM,
  type MessageEventKey,
} from '@/const/const.message.type'
import { useMessageStore } from '@/store/useMessageStore'
import { parseAddressUpdatedContent } from '@/Control/incidentLocationMessage'
import type { LocateCallData } from '@/controller/core/protocol'

/** BroadcastChannel 名（契约 §8.1） */
const RELAY_CHANNEL_NAME = 'ids-map-screen-relay'

/** 白名单 eventName（契约 §8.2 V2） */
const RELAY_EVENT_DISASTER_PROFILE = 'disaster_profile'
const RELAY_EVENT_POSITION_SYNC = 'POSITION_SYNC'

/** 周期 hello 重取间隔（§8.6 先例 30s；主窗重载后缓存为空，自动重取快照） */
const HELLO_INTERVAL_MS = 30000

/**
 * §8.3.1 画像更新载荷即画像扁平业务体（customContent 本体，按 eventName 识别，
 * 无 type 判别字段）：slots 自含全量槽位（值字段名 filledValue，2026-09-22
 * 抓包实证）+ slotChanges 变更明细 + 单调 version。结构与 WS 帧的
 * customContent 完全一致，直接复用 parseAddressUpdatedContent 解析，
 * 此处不再重复定义字段类型与转换逻辑。
 */

/** §8.3.2 来电定位载荷（位置网业务体，字段名对侧原样保留，不转驼峰） */
type PositionSyncPayload = {
  taskType?: string
  time?: string
  eventid?: string
  eventId?: string
  lng?: number | string
  lat?: number | string
  tel?: string
  ostype?: string
  latLngType?: string
  address?: string
}

/** 通道协议消息（契约 §8.4） */
type RelayMessage =
  | { kind: 'map-relay-hello' }
  | {
    kind: 'map-relay-snapshot'
    sentAt: number
    events: Array<{ eventName: string; payload: unknown; sentAt: number }>
  }
  | {
    kind: 'map-relay-event'
    eventName: string
    payload: unknown
    seq: number
    sentAt: number
  }
  | { kind: 'map-relay-bye'; reason: 'logout' | 'shutdown' }

/** latLngType -> 定位类型标签（与 positionMessage.normalizePositionFrames 一致） */
const toLocationTypeLabel = (latLngType: string): string => {
  const upper = latLngType.toUpperCase()
  if (upper.includes('GPS')) return 'gps'
  if (upper.includes('WL')) return 'wifi'
  if (upper.includes('JZ')) return 'cellId'
  return 'unknown'
}

/** 来电定位载荷 -> LocateCallData（与 positionMessage.normalizePositionFrames 输出同构） */
const toLocateCallData = (p: PositionSyncPayload): LocateCallData | null => {
  const lng = Number(p.lng)
  const lat = Number(p.lat)
  const callId = String(p.eventid ?? p.eventId ?? '').trim()
  // host 侧 parsePositionSyncPayload 已过滤无效信封，此处防御性二次校验
  if (!callId || !Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return {
    id: callId,
    longitude: lng,
    latitude: lat,
    radius: 500,
    address: p.address,
    Carrier_Loc: p.address || `${toLocationTypeLabel(String(p.latLngType ?? ''))} 定位`,
  }
}

/**
 * 构造完整 MessageEnvelope（带 v=1.0.0，使 useMessageStore.isEnvelope 判真，
 * deliverIncoming 保留 envelope 原样含 id，不走 createEnvelope 重新生成 uid）。
 * 画像 id 以 profile-sync- 开头才能触发 onAddressUpdated 的 replace 分支。
 */
const buildEnvelope = <T>(
  id: string,
  eventKey: MessageEventKey,
  data: T,
): MessageEnvelope<T> => ({
  v: MESSAGE_PROTOCOL_VERSION,
  id,
  timestamp: Date.now(),
  channel: MESSAGE_CHANNEL.BROADCAST_CHANNEL,
  system: MESSAGE_SYSTEM.IDS_SEAT_WEB,
  eventKey,
  data,
})

/**
 * 创建地图屏实时消息转发通道读侧。
 * 打开 BroadcastChannel，发送 hello 取快照 + 周期重取，消费白名单事件后
 * 通过 msg.ingest 投递到消息 store（走阶段门控 → 分发给所有订阅者），
 * 使 handlers.onAddressUpdated / handlers.onLocateCall 与 InputController 的
 * subscribe（实际上图链路）都能收到，与 WS / mock bridge 路径行为一致。
 * 返回清理函数：停止周期 hello 并关闭通道。
 */
export const createMapRelayReader = (): (() => void) => {
  const msg = useMessageStore()
  // disasterProfileId -> 已见 version，按 §8.3.1 仲裁：丢弃 ≤ 已见 version 的消息
  const seenVersion = new Map<string, number>()
  let disposed = false

  let channel: BroadcastChannel | null = null
  try {
    channel = new BroadcastChannel(RELAY_CHANNEL_NAME)
  } catch {
    // BroadcastChannel 不可用（旧环境/隐私模式）：降级为不接入，不影响既有 WS 流程
    console.warn('[map-relay] BroadcastChannel 不可用，转发通道未接入')
    return () => { }
  }

  /**
   * 应用画像载荷：version 仲裁后复用 WS 同套扁平业务体解析
   * （parseAddressUpdatedContent：slotChanges 相关性过滤 + 全量 slots /
   * slotChanges 覆盖），再经 ingest 投递整体替换。
   */
  const applyDisasterProfile = (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return
    const p = payload as Record<string, any>
    const profileKey = String(p.disasterProfileId ?? '').trim()
    const version = Number(p.version) || 0
    if (profileKey) {
      const seen = seenVersion.get(profileKey)
      console.log('[map-relay] 对比version old:', seen, 'new:', version)
      // §8.3.1：丢弃回退/重复（version ≤ 已见），整体替换最新一条
      if (seen !== undefined && seen >= version) return
      seenVersion.set(profileKey, version)
    }
    // payload 与 WS 帧的 root.customContent 为同一扁平业务体，相关性过滤 +
    // slots/slotChanges 解析复用 parseAddressUpdatedContent，两条链路逻辑同源，
    // 仅接入方式不同（BroadcastChannel vs WS）；slotChanges 缺省时按 slots
    // 全量快照放行（整体替换幂等）。
    const data = parseAddressUpdatedContent(payload)
    if (!data) return
    // id 以 profile-sync- 开头触发 onAddressUpdated 的 replace 分支（全量 slots 不走 merge），
    // 与 incidentLocationProfileSync 的 HTTP 全量快照同路径
    // 经 msg.ingest 投递：走阶段门控 → 分发给 handlers.onAddressUpdated（写 store）
    // 与 dispatchMap.vue 的 watch（上图），与 WS 路径行为一致
    msg.ingest(
      buildEnvelope(
        `profile-sync-relay-${profileKey || 'unknown'}-${version}`,
        MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED,
        data,
      ),
      MESSAGE_CHANNEL.BROADCAST_CHANNEL,
      MESSAGE_SYSTEM.IDS_SEAT_WEB,
      { source: 'map-relay' },
    )
  }

  /** 应用来电定位载荷：无 version，按到达顺序直接替换（§8.3.2） */
  const applyPositionSync = (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return
    const data = toLocateCallData(payload as PositionSyncPayload)
    if (!data) return
    // 经 msg.ingest 投递：走阶段门控 → 分发给 handlers.onLocateCall（queue+导航）
    // 与 InputController 的 subscribe（businessController.call.locateCall 上图），
    // 与 WS / mock bridge 路径行为一致；直接调 handlers 会绕过 InputController 不上图
    msg.ingest(
      buildEnvelope(
        `relay-position-sync-${data.id}-${Date.now()}`,
        MESSAGE_EVENT_KEY.MAP_LOCATE_CALL,
        data,
      ),
      MESSAGE_CHANNEL.BROADCAST_CHANNEL,
      MESSAGE_SYSTEM.IDS_SEAT_WEB,
      { source: 'map-relay' },
    )
  }

  /** 按 eventName 分发白名单事件（白名单外事件防御性忽略，§8.2 保证不会出现） */
  const dispatchEvent = (eventName: string, payload: unknown) => {
    if (eventName === RELAY_EVENT_DISASTER_PROFILE) {
      applyDisasterProfile(payload)
    } else if (eventName === RELAY_EVENT_POSITION_SYNC) {
      applyPositionSync(payload)
    } else if (eventName === 'addressbot' && ((payload as Record<string, any>) as any).event_type === 'AddressLocationUpdated') {
      msg.ingest({ eventKey: MESSAGE_EVENT_KEY.ADDRESS_ROBOT_GIS_SEARCH, data: payload }, MESSAGE_CHANNEL.WS, MESSAGE_SYSTEM.IDS_SEAT_WEB)
    }
  }

  channel.onmessage = (e: MessageEvent) => {
    const slotChanges = e.data?.payload?.slotChanges
    if (
      Array.isArray(slotChanges)
      && slotChanges.some((c: any) => ['latitude', 'longitude', 'm_org_id'].includes(String(c?.slotCode ?? '').trim()))
    ) {
      // 临时验证：仅经纬度/主管队站槽位变更时直接打印 slotChanges
      console.log('[map-relay] 相关槽位变更 slotChanges', slotChanges)
    }
    else {
      console.log('[map-relay] 收到消息', e.data)
    }
    if (disposed) return
    const msg = e.data as RelayMessage | undefined
    if (!msg || typeof msg !== 'object') return
    switch (msg.kind) {
      case 'map-relay-snapshot':
        // 快照应答：events 逐条应用（payload 形状同 §8.3）
        if (Array.isArray(msg.events)) {
          msg.events.forEach((it) => {
            if (it && typeof it.eventName === 'string') {
              dispatchEvent(it.eventName, it.payload)
            }
          })
        }
        break
      case 'map-relay-event':
        // 增量转发：同 snapshot 的单条应用
        if (typeof msg.eventName === 'string') {
          dispatchEvent(msg.eventName, msg.payload)
        }
        break
      case 'map-relay-bye':
        // host 会话结束（logout/shutdown）。配合主契约 blob auth=null 双通道确认（§8.5），
        // 不主动清场；清 seenVersion 以便新会话恢复后重新仲裁
        console.info('[map-relay] host 会话结束', { reason: msg.reason })
        seenVersion.clear()
        break
      case 'map-relay-hello':
        // host 不发 hello，忽略（地图屏只读，仅自己发 hello）
        break
    }
  }

  // 打开即取快照 + 周期重取（§8.6：主窗重载后缓存为空，hello 应答可能暂缺某类事件，
  // 等下一次推送到达；3s 先例）
  channel.postMessage({ kind: 'map-relay-hello' })
  const helloTimer = window.setInterval(() => {
    if (disposed) return
    channel?.postMessage({ kind: 'map-relay-hello' })
  }, HELLO_INTERVAL_MS)

  return () => {
    disposed = true
    window.clearInterval(helloTimer)
    channel?.close()
    channel = null
    seenVersion.clear()
  }
}
