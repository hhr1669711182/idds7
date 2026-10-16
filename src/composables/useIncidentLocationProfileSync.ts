import { watch } from 'vue'
import { useUserStore } from '@/store/useUserStore'
import { useMessageStore } from '@/store/useMessageStore'
import { useIncidentLocationStore } from '@/store/useIncidentLocationStore'
import { fetchIncidentLocationProfile } from '@/service/incidentLocationProfile'
import {
  getIncidentLocationContextKey,
  readIncidentLocationContext,
  toAddressUpdatedData,
} from '@/service/incidentLocation'
import {
  MESSAGE_CHANNEL,
  MESSAGE_EVENT_KEY,
  MESSAGE_PROTOCOL_VERSION,
  MESSAGE_SYSTEM,
} from '@/const/const.message.type'
import { getSharedMapStage } from '@/utils/seatSharedState'
import type { IncidentLocationSharedState } from '@/controller/core/protocol/IncidentLocationProtocol'
import type { MessageMetadata } from '@/types/message'

export const createIncidentLocationProfileSync = (): (() => void) => {
  const user: IncidentLocationSharedState = useUserStore()
  const bus = useMessageStore()
  const locations = useIncidentLocationStore()
  let disposed = false
  let sequence = 0
  let lastContextKey: string | null = null
  const readContext = () => readIncidentLocationContext(user, getSharedMapStage(user.rawState, user.MapMode))

  const stop = watch(
    () => user.sharedStateRevision,
    () => {
      const context = readContext()
      const contextKey = getIncidentLocationContextKey(context)
      if (disposed || lastContextKey === contextKey) return
      lastContextKey = contextKey
      const requestSequence = ++sequence
      if (!context.incidentId || context.stage !== 'dispatch') return
      const incidentId = context.incidentId
      const requestRevision = locations.acceptanceRevision
      const contextRevision = locations.contextRevision
      void (async () => {
        try {
          const response = await fetchIncidentLocationProfile(incidentId)
          if (disposed || requestSequence !== sequence || getIncidentLocationContextKey(readContext()) !== contextKey)
            return
          if (
            !response ||
            (response.incidentId && response.incidentId !== incidentId) ||
            (!response.incidentId && !response.disasterProfileId)
          )
            return
          const data = toAddressUpdatedData({ ...response, incidentId })
          if (!data) return
          const meta = {
            source: 'http-profile',
            snapshotKind: 'full',
            sessionEpoch: context.sessionEpoch,
            contextKey,
            contextRevision,
            requestSequence,
            requestRevision,
          } satisfies MessageMetadata
          bus.ingest(
            {
              v: MESSAGE_PROTOCOL_VERSION,
              id: `profile-sync-${incidentId}-${requestSequence}`,
              timestamp: Date.now(),
              channel: MESSAGE_CHANNEL.HTTP,
              system: MESSAGE_SYSTEM.IDS_SEAT_WEB,
              eventKey: MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED,
              data,
              meta,
            },
            MESSAGE_CHANNEL.HTTP,
            MESSAGE_SYSTEM.IDS_SEAT_WEB,
            meta,
          )
        } catch (error) {
          if (!disposed && requestSequence === sequence) {
            console.warn('[incident-location-profile] 拉取画像定位失败', { incidentId, error })
          }
        }
      })()
    },
    { immediate: true, flush: 'sync' },
  )

  return () => {
    if (disposed) return
    disposed = true
    sequence += 1
    stop()
  }
}

export const useIncidentLocationProfileSync = createIncidentLocationProfileSync
