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
  MESSAGE_KIND,
  type MessageEventKey,
} from '@/const/const.message.type'
import { sendWire, registerRelayHandler, unregisterRelayHandler } from '@/composables/relayProtocol'
import type { IncidentLocationSharedState } from '@/controller/core/protocol/IncidentLocationProtocol'
import type { MessageEnvelope } from '@/types/message'

export const HELLO_INTERVAL_MS = 30_000

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

export const createMapRelayReader = (): (() => void) => {
  const bus = useMessageStore()
  const user: IncidentLocationSharedState = useUserStore()
  let disposed = false
  let sequence = 0

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

  /** 入向：由 relayProtocol.handleRawRelayMessage 按 kind 路由到此处 */
  const onRelayMessage = (msg: Record<string, unknown>) => {
    if (disposed) return
    if (msg.kind === MESSAGE_KIND.RELAY_SNAPSHOT && Array.isArray(msg.events)) {
      for (const value of msg.events) {
        const entry = record(value)
        if (entry) dispatch(entry.eventName, entry.payload, { sentAt: entry.sentAt ?? msg.sentAt })
      }
    } else if (msg.kind === MESSAGE_KIND.RELAY_EVENT) {
      dispatch(msg.eventName, msg.payload, { sentAt: msg.sentAt, relaySequence: msg.seq })
    }
  }
  registerRelayHandler(onRelayMessage)

  /** 出向：hello 即取 + 30s 刷新，经 bus BC 客户端直发 wire */
  const hello = () => {
    if (disposed) return
    sendWire({ kind: MESSAGE_KIND.RELAY_HELLO })
  }
  hello()
  const timer = window.setInterval(hello, HELLO_INTERVAL_MS)

  return () => {
    if (disposed) return
    disposed = true
    window.clearInterval(timer)
    unregisterRelayHandler()
  }
}

export const useMapRelayReader = createMapRelayReader
