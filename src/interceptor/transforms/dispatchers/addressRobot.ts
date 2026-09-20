/**
 * SEAT 通道 -> 地址机器人 GIS 搜索
 * 命中：notifyType === 'addressbot' 且 customContent.event_type === 'AddressLocationUpdated'
 * 业务数据：customContent 整体
 */

import { MESSAGE_EVENT_KEY } from '@/const/const.message.type'
import type { SeatDispatcher } from '../seat'

export const addressRobotDispatcher: SeatDispatcher = (m) => {
  if (m.notifyType !== 'ADDRESSBOT') return null
  const cc = m.customContent
  if (!cc || cc.event_type !== 'AddressLocationUpdated') return null

  return [{
    eventKey: MESSAGE_EVENT_KEY.ADDRESS_ROBOT_GIS_SEARCH,
    data: cc,
    meta: {
      seatDispatcher: 'address-robot',
      notifyType: m.raw.notifyType,
      eventType: cc.event_type,
      topics: m.topics,
    },
  }]
}