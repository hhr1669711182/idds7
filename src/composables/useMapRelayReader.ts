import { useMessageStore } from '@/store/useMessageStore'
import { useUserStore } from '@/store/useUserStore'
import {
  getIncidentLocationContextKey,
  normalizeIncidentLocationContent,
  readIncidentLocationContext,
} from '@/utils/incidentLocation'
import { getSharedMapStage } from '@/utils/seatSharedState'
import { normalizePositionFrames } from '@/interceptor/transforms/position'
import {
  MESSAGE_CHANNEL,
  MESSAGE_EVENT_KEY,
  MESSAGE_PROTOCOL_VERSION,
  MESSAGE_SYSTEM,
  type MessageEventKey,
} from '@/const/const.message.type'
import type { IncidentLocationSharedState } from '@/controller/core/protocol/IncidentLocationProtocol'
import type { MessageEnvelope } from '@/types/message'

export const RELAY_CHANNEL_NAME = 'ids-map-screen-relay'
export const HELLO_INTERVAL_MS = 30_000

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

export const createMapRelayReader = (): (() => void) => {
  const bus = useMessageStore()
  const user: IncidentLocationSharedState = useUserStore()
  let channel: BroadcastChannel
  let disposed = false
  let sequence = 0
  try {
    channel = new BroadcastChannel(RELAY_CHANNEL_NAME)
  } catch {
    return () => {}
  }

  const ingest = <Payload>(eventKey: MessageEventKey, data: Payload, extra: Record<string, unknown> = {}) => {
    const context = readIncidentLocationContext(user, getSharedMapStage(user.rawState, user.MapMode))
    const meta = {
      source: 'map-relay',
      sessionEpoch: context.sessionEpoch,
      contextKey: getIncidentLocationContextKey(context),
      ...extra,
    }
    const envelope: MessageEnvelope<Payload> = {
      v: MESSAGE_PROTOCOL_VERSION,
      id: `map-relay-${++sequence}`,
      timestamp: Date.now(),
      channel: MESSAGE_CHANNEL.BROADCAST_CHANNEL,
      system: MESSAGE_SYSTEM.IDS_SEAT_WEB,
      eventKey,
      data,
      meta,
    }
    bus.ingest(envelope, MESSAGE_CHANNEL.BROADCAST_CHANNEL, MESSAGE_SYSTEM.IDS_SEAT_WEB, meta)
  }

  const dispatch = (eventName: unknown, payload: unknown, extra: Record<string, unknown>) => {
    if (eventName === 'disaster_profile') {
      const normalized = normalizeIncidentLocationContent(payload)
      if (!normalized) return
      ingest(MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED, normalized.data, {
        ...extra,
        snapshotKind: normalized.snapshotKind,
      })
    } else if (eventName === 'POSITION_SYNC') {
      const position = record(payload)
      if (!position || position.lng == null || position.lat == null || position.lng === '' || position.lat === '')
        return
      const data = normalizePositionFrames({ notifyType: 'POSITION_SYNC', content: payload })[0]?.data
      if (data) ingest(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, data, extra)
    } else if (eventName === 'addressbot' && record(payload)?.event_type === 'AddressLocationUpdated') {
      ingest(MESSAGE_EVENT_KEY.ADDRESS_ROBOT_GIS_SEARCH, payload, extra)
    }
  }

  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (disposed) return
    const message = record(event.data)
    if (!message) return
    if (message.kind === 'map-relay-snapshot' && Array.isArray(message.events)) {
      for (const value of message.events) {
        const entry = record(value)
        if (entry) dispatch(entry.eventName, entry.payload, { sentAt: entry.sentAt ?? message.sentAt })
      }
    } else if (message.kind === 'map-relay-event') {
      dispatch(message.eventName, message.payload, { sentAt: message.sentAt, relaySequence: message.seq })
    } else if (message.kind === 'map-relay-bye') {
      return
    }
  }

  const hello = () => {
    if (disposed) return
    try {
      channel.postMessage({ kind: 'map-relay-hello' })
    } catch {}
  }
  hello()
  const timer = window.setInterval(hello, HELLO_INTERVAL_MS)
  return () => {
    if (disposed) return
    disposed = true
    window.clearInterval(timer)
    channel.onmessage = null
    channel.close()
  }
}

export const useMapRelayReader = createMapRelayReader
