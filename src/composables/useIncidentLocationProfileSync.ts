import { watch } from 'vue'
import { useUserStore } from '@/store/useUserStore'
import { useMessageStore } from '@/store/useMessageStore'
import { useIncidentLocationStore } from '@/store/useIncidentLocationStore'
import { useVehicleTrackStore } from '@/store/useVehicleTrackStore'
import { isTerminalIncidentState } from '@/utils/incidentState'
import { fetchIncidentLocationProfile } from '@/apis/incidentProfile'
import {
  getIncidentLocationContextKey,
  readIncidentLocationContext,
  toAddressUpdatedData,
} from '@/utils/incidentLocation'
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
  /** 共享态 currentAlarm.lifecycleStage（受理席写入，用于区分 closed 的历史轨迹链路） */
  const readLifecycleStage = (): string => {
    const value = user.rawState?.currentAlarm?.lifecycleStage
    return typeof value === 'string' ? value.trim().toLowerCase() : ''
  }

  const stop = watch(
    () => user.sharedStateRevision,
    () => {
      const track = useVehicleTrackStore()
      const context = readContext()
      const contextKey = getIncidentLocationContextKey(context)
      const lifecycleStage = readLifecycleStage()
      // 监听新警情：共享态 incidentId 与已标记/已加载的轨迹警情不一致时，删除旧警情缓存，
      // 避免旧终态标记继续拦截新警情的画像补水
      const staleTrackIds = [
        String(track.terminalIncidentId ?? '').trim(),
        String(track.incidentId ?? '').trim(),
      ].filter(Boolean)
      if (context.incidentId && staleTrackIds.some((id) => id !== context.incidentId)) {
        track.clearTerminal()
        track.reset()
        lastContextKey = null
      }
      // 共享态已结案：与「警情上图」链路区分，只同步终态标记并交给车辆历史轨迹接管
      if (context.incidentId && lifecycleStage === 'closed') {
        track.markTerminal(context.incidentId, 'closed')
        lastContextKey = contextKey
        return
      }
      // 共享态删除/未写 lifecycleStage：撤销 closed 同步出的终态标记，避免刷新后仍回放轨迹
      if (
        context.incidentId &&
        !lifecycleStage &&
        track.terminalIncidentId === context.incidentId &&
        track.terminalState === 'CLOSED'
      ) {
        track.clearTerminal()
        track.reset()
        // 结案撤销后允许非终态链路重新补水（恢复警情上图）
        lastContextKey = null
      }
      // 终态警情只走车辆历史轨迹：共享态可能滞后于 WS 终态，终态标记有效时不拉画像补水，
      // 否则刷新后会把已清空的主管队站/周边资源/路径规划重新画回图上。
      if (String(track.terminalIncidentId ?? '').trim() && isTerminalIncidentState(track.terminalState)) return
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
