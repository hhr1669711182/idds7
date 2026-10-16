import { watch } from 'vue'
import { MESSAGE_EVENT_KEY, MOCK_CALL_LOCATION_ID, type MessageEventKey } from '@/const/const.message.type'
import { useUserStore } from '@/store/useUserStore'
import { usePendingCallLocationStore } from '@/store/usePendingCallLocationStore'
import { usePendingDispatchAlarmStore } from '@/store/usePendingDispatchAlarmStore'
import { createMessageStagePolicy, getSharedMapStage } from './messageStagePolicy'
import type { BusinessController } from '../business'
import type { BusinessMapPort } from '../protocol/BusinessMapPort'

export class InputController {
  private unsubscribers: Array<() => void> = []
  private policy: ReturnType<typeof createMessageStagePolicy> | null = null

  constructor(
    private port: BusinessMapPort,
    private business: BusinessController,
    private onMock: (eventKey: MessageEventKey, data: unknown) => void = () => {},
  ) {}

  public initSubscriptions() {
    if (this.policy) return
    this.policy = createMessageStagePolicy()
    const subscribe = this.policy.subscribeBusiness
    const user = useUserStore()
    const pendingCall = usePendingCallLocationStore()
    const scopeKey = () => JSON.stringify([user.userId, user.sessionId, user.seatNumber])
    if (pendingCall.location && pendingCall.contextKey !== scopeKey()) pendingCall.consume()
    const onShared = () => {
      if (getSharedMapStage(user.rawState, user.MapMode) !== 'onDuty') return
      pendingCall.consume()
      usePendingDispatchAlarmStore().consume()
      this.business.call.clearLocateCalls()
      this.business.incidentLocation.reset()
    }
    onShared()
    this.unsubscribers.push(watch(() => user.sharedStateRevision, onShared, { flush: 'sync' }))

    this.unsubscribers.push(
      subscribe(MESSAGE_EVENT_KEY.MAP_BASE_LOCATE, (envelope) => this.port.view.locate(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.MAP_BASE_LAYER_TOGGLE, (envelope) => this.port.view.layerToggle(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.MAP_BASE_CLICK, (envelope) => this.port.view.simulateClick(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.MAP_BASE_3D_OVERLAY, (envelope) => this.port.view.overlay3D(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.MAP_BASE_FIT_BOUNDS, (envelope) => this.port.view.fitBounds(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.MAP_BASE_POI_LOCATION, (envelope) => this.port.view.poiLocation(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.MAP_BASE_MARKER_ADD, (envelope) => this.port.geometry.addMarker(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.MAP_BASE_POLYGON_DRAW, (envelope) => this.port.geometry.drawPolygon(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.MAP_BASE_FEATURE_REMOVE, (envelope) =>
        this.port.geometry.removeFeature(envelope.data),
      ),
      subscribe(MESSAGE_EVENT_KEY.MAP_BASE_ES_QUERY, (envelope) => this.port.spatial.esQuery(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.MAP_BASE_BUFFER_CALC, (envelope) => this.port.spatial.calcBuffer(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.MAP_BASE_ROUTE_CALC, async (envelope) => {
        if (!this.port.ready) return
        const { spatial, geometry } = this.port
        const routes = await spatial.calcRoute(envelope.data)
        if (!routes.length) return
        const { start, end } = envelope.data
        geometry.drawRouteCandidates(
          'route_calc_' + start.join(',') + '_' + end.join(','),
          routes.map((route, index) => ({ coordinates: route.coordinates, selected: index === 0 })),
        )
      }),
      subscribe(MESSAGE_EVENT_KEY.MAP_BASE_SMOOTH_MOVE, (envelope) => this.port.kinematic.smoothMove(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.MAP_BASE_TRACK_APPEND, (envelope) => this.port.kinematic.appendTrack(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.MAP_BASE_TRACK_PLAY, (envelope) => this.port.kinematic.playTrack(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.CONFIG_LAYERS, (envelope) => this.business.config.configLayers(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.CONFIG_BASE, (envelope) => this.business.config.configBase(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.CONFIG_CLEAR_STRATEGY, (envelope) =>
        this.business.config.configClearStrategy(envelope.data),
      ),
      subscribe(MESSAGE_EVENT_KEY.ALARM_PROFILE_SYNC, (envelope) =>
        this.business.alarm.syncAlarmProfile(envelope.data),
      ),
      subscribe(MESSAGE_EVENT_KEY.ALARM_INCIDENT_STATE_CHANGED, (envelope) =>
        this.business.alarm.incidentStateChanged(envelope),
      ),
      subscribe(MESSAGE_EVENT_KEY.ALARM_CALL_ANSWER_STATUS_CHANGED, (envelope) =>
        this.business.call.answerStatusChanged(envelope.data),
      ),
      subscribe(MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED, (envelope) =>
        this.business.incidentLocation.receive(envelope),
      ),
      subscribe(MESSAGE_EVENT_KEY.LAYER_SET_VISIBLE, (envelope) => this.business.duty.layerSetVisible(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.MAP_VIEW_LOAD, (envelope) => this.business.duty.mapViewLoad(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, (envelope) =>
        this.business.call.receiveLocateCall(envelope.data, scopeKey()),
      ),
      subscribe(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL_REMOVE, (envelope) => {
        if (envelope.meta?.mock !== true || envelope.data?.id !== MOCK_CALL_LOCATION_ID) return
        pendingCall.consume(MOCK_CALL_LOCATION_ID)
        this.business.call.locateCallRemove({ id: MOCK_CALL_LOCATION_ID })
      }),
      subscribe(MESSAGE_EVENT_KEY.AOI_ES_QUERY, (envelope) => this.business.call.aoiEsQuery(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.AOI_ES_GISZONE, (envelope) => this.business.call.aoiEsGisZone(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.DISPATCH_VIEWPORT_FIT, (envelope) =>
        this.business.dispatch.dispatchViewportFit(envelope.data),
      ),
      subscribe(MESSAGE_EVENT_KEY.DISPATCH_RESOURCE_QUERY_HIGHLIGHT, (envelope) =>
        this.business.dispatch.dispatchResourceQueryHighlight(envelope.data),
      ),
      subscribe(MESSAGE_EVENT_KEY.DISPATCH_ROUTE_PLAN, (envelope) =>
        this.business.dispatch.dispatchRoutePlan(envelope.data),
      ),
      subscribe(MESSAGE_EVENT_KEY.DISPATCH_STATION_ETA_FILTER, (envelope) =>
        this.business.dispatch.dispatchStationEtaFilter(envelope.data),
      ),
      subscribe(MESSAGE_EVENT_KEY.DISPATCH_ROUTE_TOGGLE, (envelope) =>
        this.business.dispatch.dispatchRouteToggle(envelope.data),
      ),
      subscribe(MESSAGE_EVENT_KEY.TRACKING_VEHICLE_GPS_UPDATE, (envelope) =>
        this.business.tracking.trackingVehicleGpsUpdate(envelope.data),
      ),
      subscribe(MESSAGE_EVENT_KEY.LAYER_REFRESH, (envelope) => this.port.view.layerRefresh(envelope.data)),
      subscribe(MESSAGE_EVENT_KEY.MAP_VIEW_STAGECONFIG, (envelope) => {
        if (envelope.data.layerNames)
          this.business.config.configLayers({
            layers: envelope.data.layerNames.map((layer: { layerId: string; visible: boolean }) => ({
              id: layer.layerId,
              visible: layer.visible,
            })),
          })
      }),
      subscribe(MESSAGE_EVENT_KEY.ADDRESS_ROBOT_GIS_SEARCH, (envelope) =>
        this.business.addressRobot.addressRobotGisSearch(envelope.data),
      ),
    )
    for (const eventKey of [
      MESSAGE_EVENT_KEY.MOCK_DISPATCH_VEHICLES,
      MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_RENDER,
      MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_DISASTER_SITE,
      MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_SIMULATE,
      MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_CLEAR,
    ]) {
      this.unsubscribers.push(subscribe(eventKey, (envelope) => this.onMock(eventKey, envelope.data)))
    }
  }

  public destroy() {
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe())
    this.policy?.dispose()
    this.policy = null
  }
}
