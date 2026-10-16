import { MESSAGE_EVENT_KEY, MESSAGE_SUBSCRIBE_TOPIC } from '@/const/const.message.type'
import type { CarLocationBatch, CarLocationPoint } from '@/controller/core/protocol/LegacyMessageProtocol'
import type { MessageInterceptor, NormalizedMessage } from '../types'
import { matchesMessageRoute } from '../matcher'
import { getContentPayload, getFrameMetadata, getLocationFrames, isPlainObject } from '../unwrap'

const normalizePoint = (value: unknown): CarLocationPoint | null => {
  if (!isPlainObject(value)) return null
  const longitude = Number(value.longitude)
  const latitude = Number(value.latitude)
  const carId = String(value.carId ?? '').trim()
  const plateNumber = String(value.plateNumber ?? '').trim()
  if (
    (!carId && !plateNumber) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  )
    return null
  return {
    carId,
    orgId: String(value.orgId ?? '').trim() || undefined,
    orgName: String(value.orgName ?? '').trim() || undefined,
    longitude,
    latitude,
    plateNumber,
    gpsTime: String(value.gpsTime ?? '').trim() || undefined,
  }
}

export const normalizeCarLocationFrames = (
  frame: unknown,
  nativeOnly = false,
): NormalizedMessage<CarLocationBatch>[] => {
  const seen = new Set<string>()
  const results: NormalizedMessage<CarLocationBatch>[] = []
  for (const body of getLocationFrames(frame, nativeOnly)) {
    if (!matchesMessageRoute(body, MESSAGE_SUBSCRIBE_TOPIC.GPS_MSG)) continue
    const payload = getContentPayload(body, true)
    if (!Array.isArray(payload?.datas)) continue
    const datas = payload.datas.flatMap((value) => {
      const point = normalizePoint(value)
      if (!point) return []
      const key = [point.carId, point.plateNumber, point.gpsTime, point.longitude, point.latitude].join('|')
      if (seen.has(key)) return []
      seen.add(key)
      return [point]
    })
    if (datas.length)
      results.push({
        eventKey: MESSAGE_EVENT_KEY.TRACKING_VEHICLE_GPS_UPDATE,
        data: { datas },
        meta: getFrameMetadata(body),
      })
  }
  return results
}

export const carLocationInterceptor: MessageInterceptor = {
  id: 'topic:car-location',
  priority: 120,
  describe: '车辆 GPS 位置',
  subscribe: MESSAGE_SUBSCRIBE_TOPIC.GPS_MSG,
  transform: (ctx) => {
    const results = normalizeCarLocationFrames(ctx.raw)
    return { matched: results.length > 0, results, stop: true }
  },
}
