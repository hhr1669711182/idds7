/**
 * 消息发送出口 —— 地图系统（system = map）
 *
 * 约束（见 herness/05-共享上下文/消息协议速查.md「publish 发送规范」）：
 * - system 固定为 MESSAGE_SYSTEM.MAP，调用方不需要也不允许传；
 * - 事件键必须来自 MESSAGE_EVENT_KEY，禁止字符串字面量；
 * - 只允许 useMessageStore().publish，禁止裸 WebSocket / postMessage；
 * - 载荷类型优先用 controller/core/protocol 的 interface，<T> 泛型仅作过渡。
 */

import { useMessageStore } from '@/store/useMessageStore'
import type { FixedPublishOptions } from './types.ts'
import {
  MESSAGE_CHANNEL,
  MESSAGE_EVENT_KEY,
  MESSAGE_SYSTEM,
} from '@/const/const.message.type'

/** 本文件固定发送配置：地图系统走 WebSocket 通道 */
const OPTS: FixedPublishOptions = {
  system: MESSAGE_SYSTEM.MAP,
  channel: MESSAGE_CHANNEL.WS,
}

/** 路径规划：批量下发多条路径（system=map, channel=ws） */
export const publishRoutePlanMultiple = <T>(data: T): boolean =>
  useMessageStore().publish(MESSAGE_EVENT_KEY.ROUTE_PLAN_MULTIPLE, data, OPTS)

/** 路径规划：取消指定路径（system=map, channel=ws） */
export const publishRoutePlanCancel = (routeId: string): boolean =>
  useMessageStore().publish(MESSAGE_EVENT_KEY.ROUTE_PLAN_CANCEL, { routeId }, OPTS)

/** 地图 POI 拾取结果回传（system=map, channel=ws） */
export const publishMapPoiPick = <T>(data: T): boolean =>
  useMessageStore().publish(MESSAGE_EVENT_KEY.MAP_POI_PICK, data, OPTS)