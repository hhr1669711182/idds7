import { useMessageStore } from '@/store/useMessageStore';
import { MESSAGE_EVENT_KEY } from '@/const/const.message.type';
import type { BusinessController } from '../business';
import type { GenericController } from '../generic';
import { usePendingCallLocationStore } from '@/store/usePendingCallLocationStore';
import {
  parseSharedMapStage,
  SEAT_SHARED_STATE_KEY,
} from '@/Control/seatSharedState';
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
        // 立案阶段：算路返回的候选路线全部上图，首条为推荐（选中）方案。
        const routes = await this.genericController.spatial.calcRoute(envelope.data);
        if (!routes.length) return;
        const { start, end } = envelope.data;
        const routeGroupId = `route_calc_${start.join(',')}_${end.join(',')}`;
        this.genericController.geometry.drawRouteCandidates(
          routeGroupId,
          routes.map((route, index) => ({
            coordinates: route.coordinates,
            selected: index === 0,
          })),
        );
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
        // 保留活动定位供 dispatch 地图切页后重建；不能在首次上图后立即消费。
        pendingCallLocation.queue(envelope.data);
        this.businessController.call.locateCall(envelope.data);
      }),
      store.subscribe(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL_REMOVE, () => {
        // 来电结束时保留粗定位圈；仅由有效 slotChanges 坐标替换并清除。
      }),
      store.subscribe(MESSAGE_EVENT_KEY.AOI_ES_QUERY, (envelope) => this.businessController.call.aoiEsQuery(envelope.data)),
      store.subscribe(MESSAGE_EVENT_KEY.AOI_ES_GISZONE, (envelope) => this.businessController.call.aoiEsGisZone(envelope.data))
    );

    const initialStage = parseSharedMapStage(localStorage.getItem(SEAT_SHARED_STATE_KEY));
    if (initialStage === 'onDuty') {
      pendingCallLocation.consume();
      // onDuty 清除持久化的来电定位快照，避免 F5 后切回非 onDuty 按旧快照重绘 TODO: 临时禁用，后续再优化。
      // store.clearLastByEventKey(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL);
    }
    // F5 刷新恢复：从 lastBySystem 读持久化的来电定位（真实 WS 与模拟 mockBridge 均经 recordInbox 落盘）TODO:  AI方案设计，尽量不混合逻辑
    const lastCallEnvelope = store.lastBySystem[MESSAGE_EVENT_KEY.MAP_LOCATE_CALL];
    if (lastCallEnvelope?.data && initialStage !== 'onDuty') {
      this.businessController.call.locateCall(lastCallEnvelope.data);
    }

    // 地图业务状态回到值守（stage === 'onDuty'，如来电挂断未立案）：清除图上的来电
    // 粗定位点位与圈，同时清空待处理缓存，避免要素残留或 F5 刷新后按旧缓存重绘。
    // inquiry/dispatch 阶段不清（接警问询、立案调派仍需沿用粗定位）。
    const onSharedStageStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      if (event.key !== SEAT_SHARED_STATE_KEY && event.key !== null) return;
      const stage = parseSharedMapStage(localStorage.getItem(SEAT_SHARED_STATE_KEY));
      if (stage === 'onDuty') {
        pendingCallLocation.consume();
        // store.clearLastByEventKey(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL);
        this.businessController.call.clearLocateCalls();
      }
    };
    window.addEventListener('storage', onSharedStageStorage);
    this.unsubscribers.push(() => {
      window.removeEventListener('storage', onSharedStageStorage);
    });

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
