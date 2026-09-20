import { MESSAGE_EVENT_KEY } from '@/const/const.message.type'

export const CAR_LOCATION_SUBSCRIPTION = {
  action: 'subscribe',
  type: 'CUSTOM',
  customType: "GPS_MSG",
  key: 'car-location-broadcast-all',
} as const

export type CarLocationPoint = {
  carId: string
  orgId?: string
  orgName?: string
  latitude: number
  longitude: number
  plateNumber: string
  gpsTime?: string
}

export type CarLocationBatch = {
  datas: CarLocationPoint[]
}

type AnyRecord = Record<string, any>

const parseContent = (content: unknown): AnyRecord | null => {
  if (typeof content === 'string') {
    try {
      return parseContent(JSON.parse(content))
    } catch {
      return null
    }
  }
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null
  return content as AnyRecord
}

const hasCarLocationTopic = (body: AnyRecord) =>
  Array.isArray(body.topics) && body.topics.some((topic: AnyRecord) =>
    String(topic?.type ?? '').toUpperCase() === 'CUSTOM'
    && String(topic?.key ?? '').toLowerCase() === 'car-location-broadcast-all',
  )

const isCarLocationBody = (body: AnyRecord, payload: AnyRecord) => {
  const notifyType = String(
    body.notifyTypeDto?.notifyType ?? body.notifyType ?? '',
  ).toUpperCase()
  const source = String(body.source ?? '').toLowerCase()
  const eventType = String(body.type ?? '').toLowerCase()

  return hasCarLocationTopic(body)
    || notifyType === 'CAR_LOCATION_SYNC'
    || (
      source === 'ids:carlocation'
      && eventType === 'ids:carlocation:location-sync'
    )
    // 兼容消息服务已剥离信封、只下发 content 的情况。
    || Array.isArray(payload.datas)
}

const normalizePoint = (value: unknown): CarLocationPoint | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const item = value as AnyRecord
  const longitude = Number(item.longitude)
  const latitude = Number(item.latitude)
  const carId = String(item.carId ?? '').trim()
  const plateNumber = String(item.plateNumber ?? '').trim()

  if (
    (!carId && !plateNumber)
    || !Number.isFinite(longitude)
    || !Number.isFinite(latitude)
    || longitude < -180
    || longitude > 180
    || latitude < -90
    || latitude > 90
  ) return null

  return {
    carId,
    orgId: String(item.orgId ?? '').trim() || undefined,
    orgName: String(item.orgName ?? '').trim() || undefined,
    longitude,
    latitude,
    plateNumber,
    gpsTime: String(item.gpsTime ?? '').trim() || undefined,
  }
}

/** 将消息服务或 CloudEvent 的车辆定位报文归一为内部 GPS 更新事件。 */
export const normalizeCarLocationFrames = (frame: unknown) => {
  console.log('normalizeCarLocationFrames', frame)
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) return []
  const root = frame as AnyRecord
  const rawBodies = Array.isArray(root.userMsgBodyList)
    ? root.userMsgBodyList
    : [root]
  const seen = new Set<string>()

  return rawBodies.flatMap((rawBody): Array<{
    eventKey: typeof MESSAGE_EVENT_KEY.TRACKING_VEHICLE_GPS_UPDATE
    data: CarLocationBatch
    meta: Record<string, any>
  }> => {
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) return []
    const body = rawBody as AnyRecord
    const payload = parseContent(body.content ?? body.data ?? body)
    if (!payload || !Array.isArray(payload.datas) || !isCarLocationBody(body, payload)) {
      return []
    }

    const datas = payload.datas.flatMap((item: unknown) => {
      const point = normalizePoint(item)
      if (!point) return []
      const key = [
        point.carId,
        point.plateNumber,
        point.gpsTime,
        point.longitude,
        point.latitude,
      ].join('|')
      if (seen.has(key)) return []
      seen.add(key)
      return [point]
    })
    if (!datas.length) return []

    return [{
      eventKey: MESSAGE_EVENT_KEY.TRACKING_VEHICLE_GPS_UPDATE,
      data: { datas },
      meta: {
        recordId: body.id ?? root.id,
        source: body.source,
        sourceEventType: body.type,
        notifyType: body.notifyTypeDto?.notifyType ?? body.notifyType,
        notifySubType: body.notifyTypeDto?.notifySubType ?? body.notifySubType,
        channel: body.request?.channel,
        topics: body.topics,
      },
    }]
  })
}
