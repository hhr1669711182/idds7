/**
 * 消息发送出口 —— 宿主系统（system = host）
 *
 * 约束见 map.ts 文件头说明；channel 固定为 postMessage（与宿主页面的 iframe/postMessage 通道）。
 */

import { useMessageStore } from '@/store/useMessageStore'
import type { FixedPublishOptions } from './types.ts'
import {
  MESSAGE_CHANNEL,
  MESSAGE_EVENT_KEY,
  MESSAGE_SYSTEM,
} from '@/const/const.message.type'

/** 本文件固定发送配置：宿主走 postMessage 通道 */
const OPTS: FixedPublishOptions = {
  system: MESSAGE_SYSTEM.HOST,
  channel: MESSAGE_CHANNEL.POST_MESSAGE,
}

/** 地址 POI 拾取结果回传宿主（system=host, channel=postMessage） */
export const publishAddrPoiPick = <T>(data: T): boolean =>
  useMessageStore().publish(MESSAGE_EVENT_KEY.ADDR_POI_PICK, data, OPTS)