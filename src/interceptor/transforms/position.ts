import { MESSAGE_EVENT_KEY } from '@/const/const.message.type'
import type { LocateCallData } from '@/controller/core/protocol/BusinessProtocol'
import type { PositionPayload } from '@/controller/core/protocol/LegacyMessageProtocol'
import type { MessageInterceptor, NormalizedMessage } from '../types'
import { matchesMessageRoute } from '../matcher'
import { getContentPayload, getFrameMetadata, getLocationFrames } from '../unwrap'

export const normalizePositionFrames = (frame: unknown, nativeOnly = false): NormalizedMessage<LocateCallData>[] => {
  const results: NormalizedMessage<LocateCallData>[] = []
  const seenCallIds = new Set<string>()
  for (const body of getLocationFrames(frame, nativeOnly)) {
    if (!matchesMessageRoute(body, { type: 'CUSTOM', customType: 'POSITION_SYNC' })) continue
    const payload = getContentPayload(body)
    if (!payload) continue
    if (String(payload.taskType ?? '').toLowerCase() !== 'weizhiwang' && body.notifyType !== 'POSITION_SYNC') continue
    const longitude = Number(payload.lng)
    const latitude = Number(payload.lat)
    const callId = String(payload.eventid ?? payload.eventId ?? '').trim()
    if (!callId || !Number.isFinite(longitude) || !Number.isFinite(latitude) || seenCallIds.has(callId)) continue
    seenCallIds.add(callId)
    const coordinateType = String(payload.latLngType ?? '').toUpperCase()
    const locationType = coordinateType.includes('GPS')
      ? 'gps'
      : coordinateType.includes('WL')
        ? 'wifi'
        : coordinateType.includes('JZ')
          ? 'cellId'
          : 'unknown'
    const address = typeof payload.address === 'string' ? payload.address : undefined
    results.push({
      eventKey: MESSAGE_EVENT_KEY.MAP_LOCATE_CALL,
      data: {
        id: callId,
        longitude,
        latitude,
        radius: 500,
        address,
        Carrier_Loc:
          (typeof payload.Carrier_Loc === 'string' && payload.Carrier_Loc) || address || `${locationType} 定位`,
        positionPayload: payload as PositionPayload,
      },
      meta: getFrameMetadata(body),
    })
  }
  return results
}

export const positionInterceptor: MessageInterceptor = {
  id: 'message:position',
  priority: 110,
  describe: '来电定位',
  subscribe: { type: 'RAW' },
  transform: (ctx) => {
    const results = normalizePositionFrames(ctx.raw)
    return { matched: results.length > 0, results, stop: true }
  },
}
