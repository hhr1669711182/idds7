/**
 * @Description: BC 多 kind 共通道的入向路由与出向 wire 发送。
 *               由 initMessage 集中绑定 bindBroadcastChannel(onRaw) 后，
 *               所有 ids-map-screen-relay 物理通道上的 raw 消息经本模块分流：
 *                 - map-relay-* → relayHandler（useMapRelayReader 注册）
 *                 - map-point-selection → pointHandler（useGisPointSelection 注册）
 *               出向统一经 sendWire() 通过 bus 的 BC 客户端直发 wire 对象，
 *               不经 publish()（wire 非标准 MessageEnvelope）。
 * @FilePath: \ids-gis-web\src\composables\relayProtocol.ts
 */
import { useMessageStore } from '@/store/useMessageStore'
import { MESSAGE_KIND, MESSAGE_SYSTEM } from '@/const/const.message.type'

/** 出向 wire 发送：通过 bus 的 BC 客户端直发，不经 publish()（wire 非标准信封） */
export const sendWire = (wire: Record<string, unknown>): boolean => {
  const bus = useMessageStore()
  const client = bus.bcClients.get(MESSAGE_SYSTEM.IDS_SEAT_WEB)
  if (!client) return false
  return client.send(wire)
}

// ─── 入向 kind 路由（由 initMessage.onRaw 注册） ───

type RelayHandler = (msg: Record<string, unknown>) => void
type PointHandler = (msg: Record<string, unknown>) => void

let relayHandler: RelayHandler | null = null
let pointHandler: PointHandler | null = null

export const registerRelayHandler = (fn: RelayHandler) => {
  relayHandler = fn
}
export const unregisterRelayHandler = () => {
  relayHandler = null
}
export const registerPointHandler = (fn: PointHandler) => {
  pointHandler = fn
}
export const unregisterPointHandler = () => {
  pointHandler = null
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * BC 原始消息入口：由 bindBroadcastChannel({ onRaw }) 注册。
 * 按 kind 字段分流：
 *   - map-point-selection → pointHandler
 *   - map-relay-* / 其他   → relayHandler
 * 无 kind 字段的消息（如标准 MessageEnvelope）静默忽略。
 */
export const handleRawRelayMessage = (data: unknown, _event: MessageEvent) => {
  if (!isRecord(data) || typeof data.kind !== 'string') return
  if (data.kind === MESSAGE_KIND.POINT_SELECTION) {
    pointHandler?.(data)
    return
  }
  relayHandler?.(data)
}
