/**
 * 车辆 GPS 位置
 * subscribe 直接 spread MESSAGE_SUBSCRIBE_TOPIC.GPS_MSG，按需覆盖字段
 * 业务数据：content.datas（点位数组）
 */

import { MESSAGE_EVENT_KEY, MESSAGE_SUBSCRIBE_TOPIC } from '@/const/const.message.type'
import type { MessageInterceptor } from '../types'
import { matchSubscription } from '../matcher'
import { normalize } from '../unwrap'

const SUBSCRIBE = {
  ...MESSAGE_SUBSCRIBE_TOPIC.GPS_MSG,
} as const

const normalizePoint = (v: unknown): Record<string, unknown> | null => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const item = v as Record<string, any>
  const longitude = Number(item.longitude)
  const latitude = Number(item.latitude)
  const carId = String(item.carId ?? '').trim()
  const plateNumber = String(item.plateNumber ?? '').trim()
  if (
    (!carId && !plateNumber)
    || !Number.isFinite(longitude)
    || !Number.isFinite(latitude)
    || longitude < -180 || longitude > 180
    || latitude < -90 || latitude > 90
  ) return null
  return {
    carId,
    orgId: item.orgId ? String(item.orgId) : undefined,
    orgName: item.orgName ? String(item.orgName) : undefined,
    longitude,
    latitude,
    plateNumber,
    gpsTime: item.gpsTime ? String(item.gpsTime) : undefined,
  }
}

const transform: MessageInterceptor['transform'] = (ctx) => {
  if (!matchSubscription(ctx, SUBSCRIBE)) return { matched: false }
  const m = normalize(ctx.raw)!
  const datas = m.content?.datas
  if (!Array.isArray(datas)) return { matched: false }

  const points = (datas as unknown[])
    .map(normalizePoint)
    .filter((p): p is Record<string, unknown> => p !== null)
  if (!points.length) return { matched: false }

  return {
    matched: true,
    eventKey: MESSAGE_EVENT_KEY.TRACKING_VEHICLE_GPS_UPDATE,
    data: { datas: points },
    meta: {
      recordId: m.raw.id,
      source: m.raw.source,
      sourceEventType: m.raw.type,
      notifyType: m.raw.notifyType,
      notifySubType: m.raw.notifySubType,
      topics: m.topics,
    },
    stop: true,
  }
}

export const carLocationInterceptor: MessageInterceptor = {
  id: 'topic:car-location',
  priority: 200,
  describe: '车辆 GPS 位置',
  subscribe: SUBSCRIBE,
  transform,
}