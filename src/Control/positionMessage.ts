import { MESSAGE_EVENT_KEY } from '@/const/const.message.type'

export const buildPositionSubscription = (seatKey = '8001') => ({
  action: 'subscribe',
  type: 'SEAT',
  key: seatKey,
} as const)

type PositionPayload = {
  taskType?: string
  time?: string
  eventid?: string
  eventId?: string
  lng?: number | string
  lat?: number | string
  tel?: string
  ostype?: string
  latLngType?: string
  address?: string
  [key: string]: any
}

type MessageBody = {
  content?: unknown
  topics?: Array<{ type?: string; key?: string }>
  notifyTypeDto?: { notifyType?: string; notifySubType?: string }
  request?: { channel?: string }
}

const parseContent = (content: unknown): PositionPayload | null => {
  if (typeof content === 'string') {
    try {
      return parseContent(JSON.parse(content))
    } catch {
      return null
    }
  }
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null
  return content as PositionPayload
}

const isPositionBody = (body: MessageBody, payload: PositionPayload) => {
  const notifyType = body.notifyTypeDto?.notifyType?.toUpperCase()
  return payload.taskType?.toLowerCase() === 'weizhiwang'
    || notifyType === 'POSITION_SYNC'
}

export const normalizePositionFrames = (frame: unknown) => {
  if (!frame || typeof frame !== 'object') return []

  const root = frame as Record<string, any>
  console.log("🚀 ~ normalizePositionFrames ~ root:", root)
  const rawBodies = Array.isArray(root.userMsgBodyList)
    ? root.userMsgBodyList
    : [root]
  const seenCallIds = new Set<string>()

  return rawBodies.flatMap((rawBody): Array<{
    eventKey: typeof MESSAGE_EVENT_KEY.MAP_LOCATE_CALL
    data: Record<string, any>
    meta: Record<string, any>
  }> => {
    if (!rawBody || typeof rawBody !== 'object') return []
    const body = rawBody as MessageBody
    const payload = parseContent(body.content ?? rawBody)
    if (!payload || !isPositionBody(body, payload)) return []

    const lng = Number(payload.lng)
    const lat = Number(payload.lat)
    const callId = String(payload.eventid ?? payload.eventId ?? '').trim()
    if (!callId || !Number.isFinite(lng) || !Number.isFinite(lat)) return []
    // 消息服务可能在同一帧中同时携带 WEBSOCKET 与 MESSAGE_CENTER 投递体。
    if (seenCallIds.has(callId)) return []
    seenCallIds.add(callId)

    const latLngType = String(payload.latLngType ?? '')
    const locationType = latLngType.toUpperCase().includes('GPS')
      ? 'gps'
      : latLngType.toUpperCase().includes('WL')
        ? 'wifi'
        : latLngType.toUpperCase().includes('JZ')
          ? 'cellId'
          : 'unknown'

    return [{
      eventKey: MESSAGE_EVENT_KEY.MAP_LOCATE_CALL,
      data: {
        id: callId,
        longitude: lng,
        latitude: lat,
        radius: 500,
        address: payload.address,
        Carrier_Loc: payload.Carrier_Loc || payload.address || `${locationType} 定位`,
        positionPayload: payload,
      },
      meta: {
        notifyType: body.notifyTypeDto?.notifyType,
        notifySubType: body.notifyTypeDto?.notifySubType,
        channel: body.request?.channel,
        topics: body.topics,
      },
    }]
  })
}
