import { watch } from 'vue'
import { MESSAGE_EVENT_KEY, type MessageEventKey } from '@/const/const.message.type'
import { useMessageStore } from '@/store/useMessageStore'
import { useUserStore } from '@/store/useUserStore'
import type { MessageEnvelope } from '@/types/message'
import { getSharedMapStage, type SharedMapStage } from '@/utils/seatSharedState'
import { createLogger } from '@/utils/logger'
import type * as Generic from '../protocol/GenericProtocol'
import type * as Business from '../protocol/BusinessProtocol'
import type * as IO from '../protocol/IOProtocol'
import type { AlarmCallAnswerStatusData, AlarmIncidentStateData } from '../protocol/LegacyMessageProtocol'
import type { AddressUpdatedData } from '../protocol/IncidentLocationProtocol'

export { getSharedMapStage, parseSharedMapStage } from '@/utils/seatSharedState'
export type { SharedMapStage } from '@/utils/seatSharedState'

type MessagePayloads = {
  [MESSAGE_EVENT_KEY.MAP_BASE_LOCATE]: Generic.LocateData
  [MESSAGE_EVENT_KEY.MAP_BASE_LAYER_TOGGLE]: Generic.LayerToggleData
  [MESSAGE_EVENT_KEY.MAP_BASE_CLICK]: Generic.ClickData
  [MESSAGE_EVENT_KEY.MAP_BASE_3D_OVERLAY]: Generic.Overlay3DData
  [MESSAGE_EVENT_KEY.MAP_BASE_FIT_BOUNDS]: Generic.FitBoundsData
  [MESSAGE_EVENT_KEY.MAP_BASE_POI_LOCATION]: Generic.PoiLocationData
  [MESSAGE_EVENT_KEY.MAP_BASE_MARKER_ADD]: Generic.MarkerAddData
  [MESSAGE_EVENT_KEY.MAP_BASE_POLYGON_DRAW]: Generic.PolygonDrawData
  [MESSAGE_EVENT_KEY.MAP_BASE_FEATURE_REMOVE]: Generic.FeatureRemoveData
  [MESSAGE_EVENT_KEY.MAP_BASE_ES_QUERY]: Generic.EsQueryData
  [MESSAGE_EVENT_KEY.MAP_BASE_BUFFER_CALC]: Generic.BufferCalcData
  [MESSAGE_EVENT_KEY.MAP_BASE_ROUTE_CALC]: Generic.RouteCalcData
  [MESSAGE_EVENT_KEY.MAP_BASE_SMOOTH_MOVE]: Generic.SmoothMoveData
  [MESSAGE_EVENT_KEY.MAP_BASE_TRACK_APPEND]: Generic.TrackAppendData
  [MESSAGE_EVENT_KEY.MAP_BASE_TRACK_PLAY]: Generic.TrackPlayData
  [MESSAGE_EVENT_KEY.CONFIG_LAYERS]: Business.ConfigLayersData
  [MESSAGE_EVENT_KEY.CONFIG_BASE]: Business.ConfigBaseData
  [MESSAGE_EVENT_KEY.CONFIG_CLEAR_STRATEGY]: Business.ConfigClearStrategyData
  [MESSAGE_EVENT_KEY.ALARM_PROFILE_SYNC]: Business.AlarmProfileSyncData
  [MESSAGE_EVENT_KEY.ALARM_INCIDENT_STATE_CHANGED]: AlarmIncidentStateData
  [MESSAGE_EVENT_KEY.ALARM_CALL_ANSWER_STATUS_CHANGED]: AlarmCallAnswerStatusData
  [MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED]: AddressUpdatedData
  [MESSAGE_EVENT_KEY.LAYER_SET_VISIBLE]: Business.LayerSetVisibleData
  [MESSAGE_EVENT_KEY.MAP_VIEW_LOAD]: Business.MapViewLoadData
  [MESSAGE_EVENT_KEY.MAP_LOCATE_CALL]: Business.LocateCallData
  [MESSAGE_EVENT_KEY.MAP_LOCATE_CALL_REMOVE]: Business.LocateCallRemoveData
  [MESSAGE_EVENT_KEY.AOI_ES_QUERY]: Business.AoiEsQueryData
  [MESSAGE_EVENT_KEY.AOI_ES_GISZONE]: Business.AoiEsGisZoneData
  [MESSAGE_EVENT_KEY.DISPATCH_VIEWPORT_FIT]: Business.DispatchViewportFitData
  [MESSAGE_EVENT_KEY.DISPATCH_RESOURCE_QUERY_HIGHLIGHT]: Business.DispatchResourceQueryHighlightData
  [MESSAGE_EVENT_KEY.DISPATCH_ROUTE_PLAN]: Business.DispatchRoutePlanData
  [MESSAGE_EVENT_KEY.DISPATCH_STATION_ETA_FILTER]: Business.DispatchStationEtaFilterData
  [MESSAGE_EVENT_KEY.DISPATCH_ROUTE_TOGGLE]: Business.DispatchRouteToggleData
  [MESSAGE_EVENT_KEY.TRACKING_VEHICLE_GPS_UPDATE]: Business.TrackingVehicleGpsUpdateData
  [MESSAGE_EVENT_KEY.LAYER_REFRESH]: IO.LayerRefreshData
  [MESSAGE_EVENT_KEY.MAP_VIEW_STAGECONFIG]: IO.MapViewStageConfigData
  [MESSAGE_EVENT_KEY.ADDRESS_ROBOT_GIS_SEARCH]: Business.AddressRobotGisSearchData
}

type MessagePayload<K extends MessageEventKey> = K extends keyof MessagePayloads ? MessagePayloads[K] : unknown

const logger = createLogger('message-stage')

const stages: Partial<Record<MessageEventKey, SharedMapStage>> = {
  [MESSAGE_EVENT_KEY.MAP_LOCATE_CALL]: 'popup',
  [MESSAGE_EVENT_KEY.ALARM_CALL_ANSWER_STATUS_CHANGED]: 'inquiry',
  [MESSAGE_EVENT_KEY.ALARM_INCIDENT_STATE_CHANGED]: 'dispatch',
  [MESSAGE_EVENT_KEY.ALARM_PROFILE_SYNC]: 'dispatch',
  [MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED]: 'dispatch',
  [MESSAGE_EVENT_KEY.TRACKING_VEHICLE_GPS_UPDATE]: 'dispatchTrack',
}

export const createMessageStagePolicy = (userStore = useUserStore()) => {
  const bus = useMessageStore()
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let epoch = userStore.sessionEpoch
  const subscriptions = new Set<() => void>()
  let pending: Array<{
    eventKey: MessageEventKey
    receivedAt: number
    epoch: number
    owner: () => void
    deliver: () => void
  }> = []

  const cancelTimer = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  const schedule = () => {
    cancelTimer()
    if (disposed || !pending.length) return
    const due = Math.max(pending[0].receivedAt, userStore.lastSharedReceiveAt) + 500
    timer = setTimeout(tick, Math.max(0, due - Date.now()))
  }

  const tick = () => {
    timer = undefined
    while (!disposed && pending.length) {
      const item = pending[0]
      if (Date.now() < Math.max(item.receivedAt, userStore.lastSharedReceiveAt) + 500) break
      pending.shift()
      if (item.epoch !== userStore.sessionEpoch) continue
      const stage = getSharedMapStage(userStore.rawState, userStore.MapMode)
      if (stage === stages[item.eventKey]) {
        item.deliver()
      } else {
        logger.info('忽略状态不匹配的消息', { eventKey: item.eventKey, stage })
      }
    }
    schedule()
  }

  const stopShared = watch(
    () => userStore.sharedStateRevision,
    () => {
      if (epoch !== userStore.sessionEpoch || userStore.rawState?.auth === null) pending = []
      epoch = userStore.sessionEpoch
      schedule()
    },
    { flush: 'sync' },
  )

  function subscribeBusiness<K extends MessageEventKey>(
    eventKey: K,
    handler: (envelope: MessageEnvelope<MessagePayload<K>>) => unknown,
  ): () => void
  function subscribeBusiness<K>(
    eventKey: MessageEventKey,
    handler: (envelope: MessageEnvelope<K>) => unknown,
  ): () => void
  function subscribeBusiness<K>(
    eventKey: MessageEventKey,
    handler: (envelope: MessageEnvelope<K>) => unknown,
  ): () => void {
    if (disposed) return () => {}
    let active = true
    const report = (error: unknown) =>
      logger.error('业务订阅执行失败', {
        eventKey,
        error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
      })
    const stop = bus.subscribe(eventKey, (envelope) => {
      if (disposed || !active) return
      const deliver = () => {
        if (disposed || !active) return
        try {
          const result = handler(envelope as MessageEnvelope<K>)
          void Promise.resolve(result).catch(report)
        } catch (error) {
          report(error)
        }
      }
      if (!stages[eventKey]) {
        deliver()
        return
      }
      pending.push({ eventKey, receivedAt: Date.now(), epoch: userStore.sessionEpoch, owner: unsubscribe, deliver })
      schedule()
    })
    const unsubscribe = () => {
      if (!active) return
      active = false
      stop()
      subscriptions.delete(unsubscribe)
      pending = pending.filter((item) => item.owner !== unsubscribe)
      schedule()
    }
    subscriptions.add(unsubscribe)
    return unsubscribe
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    stopShared()
    cancelTimer()
    pending = []
    subscriptions.forEach((unsubscribe) => unsubscribe())
  }

  return { subscribeBusiness, dispose }
}
