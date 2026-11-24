/**
 * 消息发送出口 —— 宿主系统（system = host）
 *
 * 约束见 map.ts 文件头说明；channel 固定为 postMessage（与宿主页面的 iframe/postMessage 通道）。
 */

import { useMessageStore } from '@/store/useMessageStore'
import type { FixedPublishOptions } from './types.ts'
import { MESSAGE_CHANNEL, MESSAGE_EVENT_KEY, MESSAGE_SYSTEM } from '@/const/const.message.type'
import type {
  GeoPickerJurisdictionResult,
  GeoPickerPointResult,
  GeoPickerReadyEvent,
} from '@/controller/core/protocol/GeoPickerProtocol'

/** 本文件固定发送配置：宿主走 postMessage 通道 */
const OPTS: FixedPublishOptions = {
  system: MESSAGE_SYSTEM.HOST,
  channel: MESSAGE_CHANNEL.POST_MESSAGE,
}

/** 地址 POI 拾取结果回传宿主（system=host, channel=postMessage） */
export const publishAddrPoiPick = <T>(data: T): boolean =>
  useMessageStore().publish(MESSAGE_EVENT_KEY.ADDR_POI_PICK, data, OPTS)

/** GeoPicker 地图就绪通知宿主 */
export const publishGeoPickerReady = (data: GeoPickerReadyEvent): boolean =>
  useMessageStore().publish(MESSAGE_EVENT_KEY.GEO_PICKER_READY, data, OPTS)

/** GeoPicker 画点结果回传宿主（WGS84 经纬度） */
export const publishGeoPickerPoint = (data: GeoPickerPointResult): boolean =>
  useMessageStore().publish(MESSAGE_EVENT_KEY.GEO_PICKER_POINT, data, OPTS)

/** GeoPicker 画辖区结果回传宿主（GeoJSON Polygon coordinates，WGS84） */
export const publishGeoPickerJurisdiction = (data: GeoPickerJurisdictionResult): boolean =>
  useMessageStore().publish(MESSAGE_EVENT_KEY.GEO_PICKER_JURISDICTION, data, OPTS)

/** GeoPicker 清除绘制后通知宿主 */
export const publishGeoPickerCleared = (): boolean =>
  useMessageStore().publish(MESSAGE_EVENT_KEY.GEO_PICKER_CLEARED, {}, OPTS)
