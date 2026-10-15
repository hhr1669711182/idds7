/**
 * 消息发送出口 —— 三维系统（system = three）
 *
 * 约束见 map.ts 文件头说明。
 */

import { useMessageStore } from '@/store/useMessageStore'
import type { FixedPublishOptions } from './types.ts'
import {
  MESSAGE_CHANNEL,
  MESSAGE_EVENT_KEY,
  MESSAGE_SYSTEM,
} from '@/const/const.message.type'

/** 本文件固定发送配置：三维系统走 WebSocket 通道 */
const OPTS: FixedPublishOptions = {
  system: MESSAGE_SYSTEM.THREE,
  channel: MESSAGE_CHANNEL.WS,
}

/** 三维建筑物模型表单回传（system=three, channel=ws） */
export const publishThreeBuildFormSend = <T>(data: T): boolean =>
  useMessageStore().publish(MESSAGE_EVENT_KEY.THREE_BUILD_FORM_SEND, data, OPTS)