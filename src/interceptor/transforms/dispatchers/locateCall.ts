/*
 * @Author: hhr
 * @Date: 2026-09-17 17:06:22
 * @LastEditTime: 2026-09-18 14:20:50
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\interceptor\transforms\dispatchers\locateCall.ts
 */
/**
 * SEAT 通道 -> 来电定位
 * 命中：customContent.taskType === 'weizhiwang' 或 notifyType === 'POSITION_SYNC'
 * 业务数据：customContent（lng / lat / eventid / address / latLngType）
 */

import { MESSAGE_EVENT_KEY } from '@/const/const.message.type'
import type { SeatDispatcher } from '../seat'

export const locateCallDispatcher: SeatDispatcher = (m) => {
  const cc = m.content
  const hit = (cc && String(cc.taskType ?? '').toLowerCase() === 'weizhiwang')
    || m.notifyType === 'POSITION_SYNC'
  if (!hit || !cc) return null

  const lng = Number(cc.lng)
  const lat = Number(cc.lat)
  const callId = String(cc.eventid ?? cc.eventId ?? '').trim()
  if (!callId || !Number.isFinite(lng) || !Number.isFinite(lat)) return null

  const t = String(cc.latLngType ?? '').toUpperCase()
  const locationType = t.includes('GPS') ? 'gps'
    : t.includes('WL') ? 'wifi'
    : t.includes('JZ') ? 'cellId' : 'unknown'

  return [{
    eventKey: MESSAGE_EVENT_KEY.MAP_LOCATE_CALL,
    data: {
      id: callId,
      longitude: lng,
      latitude: lat,
      radius: 500,
      address: cc.address,
      Carrier_Loc: cc.Carrier_Loc || cc.address || `${locationType} 定位`,
      positionPayload: cc,
    },
    meta: {
      seatDispatcher: 'locate-call',
      notifyType: m.raw.notifyType,
      notifySubType: m.raw.notifySubType,
      topics: m.topics,
    },
  }]
}