/*
 * @Description: GIS 地图选点 BroadcastChannel 模块（ids-gis-point-selection）。
 *               对接受理席 gis-point-selection 协议 V1.0：
 *               - 接收受理席 PICK_START → 投递 MOCK_INCIDENT_RELOCATE 事件（含 ownerId/requestId）
 *               - 回发 PICK_READY / PICK_RESULT / PICK_PONG / PICK_CANCEL
 *               - 接收 ACK（PICK_APPLIED / PICK_FAILED / PICK_CANCEL）→ 停止重试并清理
 *               - 维护当前会话 token（ownerId/requestId），保证消息关联正确
 * @FilePath: \ids-gis-web\src\Control\gisPointChannel.ts
 */
import { useMessageStore } from '@/store/useMessageStore'
import { MESSAGE_CHANNEL, MESSAGE_EVENT_KEY, MESSAGE_SYSTEM } from '@/const/const.message.type'
import type { MessageEnvelope } from '@/types/message'

// ─── 协议类型（与受理席 gis-point-selection V1.0 对齐） ───

export type GisPointInfo = {
  x: string
  y: string
  address: string
}

export type GisPointCancelReason =
  | 'user_cancel'
  | 'context_changed'
  | 'page_leave'
  | 'peer_timeout'
  | 'channel_failed'

export type GisPointFailureCode = 'invalid_point' | 'save_failed' | 'superseded'

/** 受理席 → GIS 的消息 */
export type SeatPickMessage =
  | { v: 1; type: 'PICK_START'; source: 'seat'; ownerId: string; requestId: string; incidentID: string; sentAt: number; pointInfo: GisPointInfo }
  | { v: 1; type: 'PICK_CANCEL'; source: 'seat'; ownerId: string; requestId: string; incidentID: string; sentAt: number; reason: GisPointCancelReason }
  | { v: 1; type: 'PICK_APPLIED'; source: 'seat'; ownerId: string; requestId: string; incidentID: string; sentAt: number; changed: boolean }
  | { v: 1; type: 'PICK_FAILED'; source: 'seat'; ownerId: string; requestId: string; incidentID: string; sentAt: number; code: GisPointFailureCode; message: string }
  | { v: 1; type: 'PICK_PING'; source: 'seat'; ownerId: string; requestId: string; incidentID: string; sentAt: number }

/** GIS → 受理席的消息 */
export type GisPickMessage =
  | { v: 1; type: 'PICK_READY'; source: 'gis'; ownerId: string; requestId: string; incidentID: string; sentAt: number }
  | { v: 1; type: 'PICK_RESULT'; source: 'gis'; ownerId: string; requestId: string; incidentID: string; sentAt: number; pointInfo: GisPointInfo }
  | { v: 1; type: 'PICK_CANCEL'; source: 'gis'; ownerId: string; requestId: string; incidentID: string; sentAt: number; reason: GisPointCancelReason }
  | { v: 1; type: 'PICK_PONG'; source: 'gis'; ownerId: string; requestId: string; incidentID: string; sentAt: number }

// ─── 模块实现 ───

/** 给 incidentRelocate 等消费者暴露的发送接口（回发 PICK_READY / PICK_RESULT / PICK_PONG） */
export type GisPointChannel = {
  send: (msg: GisPickMessage) => void
  onAck: (callback: (msg: SeatPickMessage) => void) => void
  /** 关闭通道并清理状态（pagehide / dispose 时调用） */
  close: () => void
}

/**
 * 单例实例：由 createGisPointChannel 初始化，getGisPointChannel 读取。
 * 必须共用同一实例——监听侧在 createGisPointChannel 的实例上，若 incidentRelocate
 * 另建实例注册 onAck，PICK_CANCEL / PICK_APPLIED 等 ACK 将无法触达选点模块。
 */
let cachedInstance: GisPointChannel | null = null

/**
 * 创建 GIS 地图选点 BroadcastChannel 实例。
 * 返回清理函数，App 卸载时调用。
 */
export const createGisPointChannel = (): (() => void) => {
  const msg = useMessageStore()
  const channelName = 'ids-gis-point-selection'

  let channel: BroadcastChannel | null = null
  // 当前活跃选点会话（由 incidentRelocate 通过 setActiveSession 注册）
  let activeSession: { ownerId: string; requestId: string; incidentID: string } | null = null
  // ACK 回调（incidentRelocate 注册，收到 APPLIED/FAILED/CANCEL 时触发）
  let ackCallback: ((msg: SeatPickMessage) => void) | null = null

  try {
    channel = new BroadcastChannel(channelName)
  } catch {
    console.warn('[gis-point-channel] BroadcastChannel 不可用')
    return () => {}
  }

  /** 校验消息是否为有效的 SeatPickMessage */
  const isSeatMessage = (value: unknown): value is SeatPickMessage => {
    if (!value || typeof value !== 'object') return false
    const m = value as Record<string, unknown>
    return m.v === 1
      && m.source === 'seat'
      && typeof m.ownerId === 'string' && m.ownerId.trim() !== ''
      && typeof m.requestId === 'string' && m.requestId.trim() !== ''
      && typeof m.incidentID === 'string' && m.incidentID.trim() !== ''
      && typeof m.sentAt === 'number' && Number.isFinite(m.sentAt)
  }

  /** 消息与当前会话是否匹配 */
  const matchesSession = (m: SeatPickMessage): boolean => {
    if (!activeSession) return false
    return m.ownerId === activeSession.ownerId
      && m.requestId === activeSession.requestId
      && m.incidentID === activeSession.incidentID
  }

  channel.addEventListener('message', (e: MessageEvent) => {
    const data = e.data
    if (!isSeatMessage(data)) return

    switch (data.type) {
      case 'PICK_START': {
        // 新选点请求：替换旧会话（若有）
        activeSession = { ownerId: data.ownerId, requestId: data.requestId, incidentID: data.incidentID }
        console.info('[gis-point-channel] 收到 PICK_START', activeSession)
        // 投递 MOCK_INCIDENT_RELOCATE 事件（含 token），dispatchMap 订阅后激活选点交互
        msg.ingest(
          {
            v: '1.0.0',
            id: `gis-pick-${data.requestId}-${Date.now()}`,
            timestamp: Date.now(),
            channel: MESSAGE_CHANNEL.BROADCAST_CHANNEL,
            system: MESSAGE_SYSTEM.IDS_SEAT_WEB,
            eventKey: MESSAGE_EVENT_KEY.MOCK_INCIDENT_RELOCATE,
            data: {
              incidentId: data.incidentID,
              ownerId: data.ownerId,
              requestId: data.requestId,
            },
          } as MessageEnvelope,
          MESSAGE_CHANNEL.BROADCAST_CHANNEL,
          MESSAGE_SYSTEM.IDS_SEAT_WEB,
          { source: 'gis-point-channel' },
        )
        break
      }
      case 'PICK_PING': {
        // 主屏存活检测：回复 PONG
        if (matchesSession(data)) {
          sendGisMessage({
            v: 1,
            type: 'PICK_PONG',
            source: 'gis',
            ownerId: data.ownerId,
            requestId: data.requestId,
            incidentID: data.incidentID,
            sentAt: Date.now(),
          })
        }
        break
      }
      case 'PICK_APPLIED':
      case 'PICK_FAILED':
      case 'PICK_CANCEL': {
        // ACK 消息：触发注册的回调（停止重试、清理）
        if (matchesSession(data) && ackCallback) {
          ackCallback(data)
        }
        if (data.type === 'PICK_CANCEL') {
          activeSession = null
          ackCallback = null
        }
        break
      }
    }
  })

  /** 发送 GIS 侧消息 */
  const sendGisMessage = (m: GisPickMessage) => {
    try {
      channel?.postMessage(m)
    } catch (error) {
      console.warn('[gis-point-channel] 发送失败', error)
    }
  }

  const instance: GisPointChannel = {
    send: sendGisMessage,
    onAck: (callback) => { ackCallback = callback },
    close: () => {
      channel?.close()
      channel = null
      activeSession = null
      ackCallback = null
      if (cachedInstance === instance) cachedInstance = null
    },
  }

  // 暴露给 getGisPointChannel()：incidentRelocate 与监听侧必须共用同一实例
  cachedInstance = instance

  return () => instance.close()
}

/** 获取已创建的 GisPointChannel 实例（incidentRelocate 等消费者使用）。
 *  需在 initMessage 中先调用 createGisPointChannel() 创建实例。 */
export const getGisPointChannel = (): GisPointChannel => {
  if (!cachedInstance) {
    // 惰性创建（不投递 MOCK_INCIDENT_RELOCATE，仅用于发送消息）
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel('ids-gis-point-selection')
    } catch { /* ignore */ }
    cachedInstance = {
      send: (m: GisPickMessage) => {
        try { channel?.postMessage(m) } catch { /* ignore */ }
      },
      onAck: () => {},
      close: () => {
        channel?.close()
        channel = null
        cachedInstance = null
      },
    }
  }
  return cachedInstance
}
