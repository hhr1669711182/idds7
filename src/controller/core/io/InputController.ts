import { useMessageStore } from '@/store/useMessageStore';
import { MESSAGE_EVENT_KEY } from '@/const/const.message.type';
import type { BusinessController } from '../business';
import type { GenericController } from '../generic';
import { usePendingCallLocationStore } from '@/store/usePendingCallLocationStore';
import type { AddressRobotGisSearchData, AddressRobotGisCandidatesData, AddressRobotClearData } from '../protocol';

export class InputController {
  private unsubscribers: Array<() => void> = [];

  constructor(
    private genericController: GenericController,
    private businessController: BusinessController
  ) { }

  /**
   * 初始化所有地图控制协议的订阅监听
   */
  public initSubscriptions() {
    const store = useMessageStore();
    const pendingCallLocation = usePendingCallLocationStore();

    // =========================================================
    // 1. 通用控制层 (Generic Base Controls)
    // =========================================================

    this.unsubscribers.push(
      store.subscribe(MESSAGE_EVENT_KEY.MAP_BASE_LOCATE, (envelope) => this.genericController.view.locate(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.MAP_BASE_LAYER_TOGGLE, (envelope) => this.genericController.view.layerToggle(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.MAP_BASE_CLICK, (envelope) => this.genericController.view.simulateClick(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.MAP_BASE_3D_OVERLAY, (envelope) => this.genericController.view.overlay3D(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.MAP_BASE_FIT_BOUNDS, (envelope) => this.genericController.view.fitBounds(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.MAP_BASE_POI_LOCATION, (envelope) => this.genericController.view.poiLocation(envelope.data)),

      store.subscribe(MESSAGE_EVENT_KEY.MAP_BASE_MARKER_ADD, (envelope) => this.genericController.geometry.addMarker(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.MAP_BASE_POLYGON_DRAW, (envelope) => this.genericController.geometry.drawPolygon(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.MAP_BASE_FEATURE_REMOVE, (envelope) => this.genericController.geometry.removeFeature(envelope.data)),

      store.subscribe(MESSAGE_EVENT_KEY.MAP_BASE_ES_QUERY, async (envelope) => await this.genericController.spatial.esQuery(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.MAP_BASE_BUFFER_CALC, (envelope) => this.genericController.spatial.calcBuffer(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.MAP_BASE_ROUTE_CALC, async (envelope) => {
        await this.genericController.spatial.calcRoute(envelope.data);
      }),

      store.subscribe(MESSAGE_EVENT_KEY.MAP_BASE_SMOOTH_MOVE, (envelope) => this.genericController.kinematic.smoothMove(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.MAP_BASE_TRACK_APPEND, (envelope) => this.genericController.kinematic.appendTrack(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.MAP_BASE_TRACK_PLAY, (envelope) => this.genericController.kinematic.playTrack(envelope.data))
    );

    // =========================================================
    // 2. 业务应用控制层 (Business Application Controls)
    // =========================================================

    // 3.1 内部配置
    this.unsubscribers.push(
      store.subscribe(MESSAGE_EVENT_KEY.CONFIG_LAYERS, (envelope) => this.businessController.config.configLayers(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.CONFIG_BASE, (envelope) => this.businessController.config.configBase(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.CONFIG_CLEAR_STRATEGY, (envelope) => this.businessController.config.configClearStrategy(envelope.data))
    );

    // 3.2 警情画像同步
    this.unsubscribers.push(
      store.subscribe(MESSAGE_EVENT_KEY.ALARM_PROFILE_SYNC, (envelope) => this.businessController.alarm.syncAlarmProfile(envelope.data))
    );

    // 3.3 值守阶段
    this.unsubscribers.push(
      store.subscribe(MESSAGE_EVENT_KEY.LAYER_SET_VISIBLE, (envelope) => this.businessController.duty.layerSetVisible(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.MAP_VIEW_LOAD, (envelope) => this.businessController.duty.mapViewLoad(envelope.data))
    );

    // 3.4 来电阶段 / 问询阶段
    this.unsubscribers.push(
      store.subscribe(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, (envelope) => {
        this.businessController.call.locateCall(envelope.data);
        pendingCallLocation.consume(envelope.data?.id);
      }),
      store.subscribe(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL_REMOVE, (envelope) => {
        pendingCallLocation.consume(envelope.data?.id);
        this.businessController.call.locateCallRemove(envelope.data);
      }),
      store.subscribe(MESSAGE_EVENT_KEY.AOI_ES_QUERY, (envelope) => this.businessController.call.aoiEsQuery(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.AOI_ES_GISZONE, (envelope) => this.businessController.call.aoiEsGisZone(envelope.data))
    );

    const queuedCallLocation = pendingCallLocation.consume();
    if (queuedCallLocation) {
      this.businessController.call.locateCall(queuedCallLocation);
    }

    // 3.5 调派阶段
    this.unsubscribers.push(
      store.subscribe(MESSAGE_EVENT_KEY.DISPATCH_VIEWPORT_FIT, (envelope) => this.businessController.dispatch.dispatchViewportFit(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.DISPATCH_RESOURCE_QUERY_HIGHLIGHT, (envelope) => this.businessController.dispatch.dispatchResourceQueryHighlight(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.DISPATCH_ROUTE_PLAN, (envelope) => this.businessController.dispatch.dispatchRoutePlan(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.DISPATCH_STATION_ETA_FILTER, (envelope) => this.businessController.dispatch.dispatchStationEtaFilter(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.DISPATCH_ROUTE_TOGGLE, (envelope) => this.businessController.dispatch.dispatchRouteToggle(envelope.data))
    );

    // 3.6 跟踪阶段（GC-03）
    this.unsubscribers.push(
      store.subscribe(MESSAGE_EVENT_KEY.TRACKING_VEHICLE_GPS_UPDATE, (envelope) =>
        this.businessController.tracking.trackingVehicleGpsUpdate(envelope.data)
      )
    );

    // =========================================================
    // 3. I/O 阶段控制
    // =========================================================
    this.unsubscribers.push(
      store.subscribe(MESSAGE_EVENT_KEY.LAYER_REFRESH, (envelope) =>
        this.genericController.view.layerRefresh(envelope.data)
      ),
      store.subscribe(MESSAGE_EVENT_KEY.MAP_VIEW_STAGECONFIG, (envelope) => {
        console.log('[Input] 场景阶段同步', envelope.data.stage);
        if (envelope.data.layerNames) {
          this.businessController.config.configLayers({ layers: envelope.data.layerNames });
        }
      })
    );

    // 3.7 AddressRobot地址机器人
    this.unsubscribers.push(
      store.subscribe(MESSAGE_EVENT_KEY.ADDRESS_ROBOT_GIS_SEARCH, (envelope) => this.businessController.addressRobot.addressRobotGisSearch(envelope.data)),
    );
  }

  /**
   * 销毁所有订阅，防止内存泄漏
   */
  public destroy() {
    this.unsubscribers.forEach(unsubscribe => unsubscribe());
    this.unsubscribers = [];
  }
}
