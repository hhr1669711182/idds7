/*
 * @Author: ljh
 * @Date: 2026-08-27 10:30:08
 * @LastEditTime: 2026-08-27 10:39:46
 * @LastEditors: ljh
 * @Description: 消防调派的队站查询、辖区绘制、路径规划及车辆实时定位模块。
 * @FilePath: src\baseComponent\OpenlayersMap\DispatchT1.ts
 */
import Feature from 'ol/Feature';
import OlMap from 'ol/Map';
import type { EventsKey } from 'ol/events';
import { boundingExtent } from 'ol/extent';
import LineString from 'ol/geom/LineString';
import VectorLayer from 'ol/layer/Vector';
import { unByKey } from 'ol/Observable';
import { fromLonLat, transform } from 'ol/proj';
import TileWMS from 'ol/source/TileWMS';
import VectorSource from 'ol/source/Vector';
import { Fill, Stroke, Style } from 'ol/style';
import {
  buildTmcFeatures,
  fetchDrivingRoute,
  type AmapTmcStatus,
} from '@/baseComponent/amap/useAmapTools';
import { getStyle } from '@/baseComponent/amap/featureStyle';
import {
  mountPolygonLayer,
  type PolygonLayerManager,
} from '@/baseComponent/OpenlayersMap/mountPolygonLayer';
import type { CarLocationBatch } from '@/Control/carLocationMessage';
import {
  createVehicleManager,
  type VehicleManager,
} from '@/controller/core/business/vehicleManager.ts';
import {
  DispatchController1,
  createDispatchInitialState,
  type DispatchFlowState,
  type DispatchIncidentState,
  type DispatchRouteStatus,
  type DispatchStateListener,
  type DispatchStationRole,
  type DispatchStationState,
  type DispatchVehicleCommand,
  type DispatchVehicleState,
  type DispatchWorkflowStatus,
} from '@/controller/core/business/DispatchController1';
import {
  geoserverApi,
} from '@/service/geoserver';
import {
  listDispatchVehicles,
  dispatchVehiclesBatch,
  validateDispatchRequest,
  createCommandId,
  queryDispatchFormation,
  DISPATCH_FORMATION_VERSION,
  type DispatchVehiclesRequest,
} from '@/service/methods/dispatchVehicles';
import {
  STATION_LAYER_NAME as DISPATCH_T1_STATION_LAYER,
  JURISDICTION_LAYER_NAME as DISPATCH_T1_JURISDICTION_LAYER,
  cqlLiteral,
  queryStationFeatures,
  queryJurisdictionsByStationIds,
  queryIncidentStations,
  type StationCandidate,
  type Coordinate,
} from '@/controller/core/business/IncidentStationQuery';
import {
  DISPATCH_T1_STATION_OWNER,
  useIncidentLocationStore,
  useStationLayerStore,
} from '@/store/useIncidentLocationStore';

export { DISPATCH_T1_STATION_LAYER, DISPATCH_T1_JURISDICTION_LAYER };

const ROUTE_COLORS = ['#dc2626', '#2563eb', '#7c3aed', '#0891b2'];

export type DispatchT1StationRole = DispatchStationRole;
export type DispatchT1RouteStatus = DispatchRouteStatus;
export type DispatchT1WorkflowStatus = DispatchWorkflowStatus;
export type DispatchT1Incident = DispatchIncidentState;
export type DispatchT1Vehicle = DispatchVehicleState;
export type DispatchT1Station = DispatchStationState;
export type DispatchT1State = DispatchFlowState;

export interface DispatchT1AlarmProfileData {
  incidentId?: string;
  disaster_address?: string;
  longitude?: number;
  latitude?: number;
  disaster_type?: string;
  incidentState?: string;
  incidentStateName?: string;
  fireBrigade?: any[];
  [key: string]: any;
}

export interface DispatchT1EventMessage {
  eventType?: string;
  data?: DispatchT1AlarmProfileData;
  [key: string]: any;
}

export type DispatchT1WebSocketData =
  | DispatchT1AlarmProfileData
  | DispatchT1EventMessage
  | {
      label?: string;
      eventId?: string;
      delayMs?: number;
      payload?: DispatchT1EventMessage;
      [key: string]: any;
    };

export type DispatchT1VehicleCommand = DispatchVehicleCommand;

export interface DispatchT1Options {
  amapKey?: string;
  isLayerVisible?: (layerId: string) => boolean;
  onDispatch?: (
    command: DispatchT1VehicleCommand,
  ) => void | Promise<void>;
  /** 辖区查询完成（主管/支撑队站及辖区已定稿）回调，可用于在查询阶段结束后触发现场视频等 UI 展示。 */
  onQueryComplete?: (incident: DispatchT1Incident) => void;
}

export type DispatchT1StateListener = DispatchStateListener;

/** 辖区面图层渲染项，供 mountPolygonLayer 消费 */
type JurisdictionItem = {
  key: string;
  geometry: GeoJSON.Geometry;
  role: DispatchT1StationRole;
};

export const createDispatchT1InitialState = createDispatchInitialState;

/**
 * 独立消防调派地图模块。
 * 本文件负责查询、地图事件、绘制与算路，流程状态由 DispatchController1 管理。
 */
export class DispatchT1 {
  private readonly stateController = new DispatchController1();
  private readonly routeVersions = new globalThis.Map<string, number>();
  private readonly knownStationNames = new Set<string>();
  private stationFeaturesPromise: Promise<any[]> | null = null;
  private genericPopupObserver: MutationObserver | null = null;
  private genericFeaturePopupSuppressed = false;
  private requestVersion = 0;
  private dispatchPending = false;
  /** 本次业务操作的幂等键；同一警情同一次调派的重试复用，成功/换新警情后重置 */
  private commandId: string | null = null;
  private clickKey: EventsKey | null = null;
  /** 车辆实时定位与模拟跟踪逻辑（车牌/车辆ID索引表、最新定位缓存、动画句柄）均封装在该闭包内 */
  private readonly vehicleManager!: VehicleManager;

  /**
   * 仅用于构造 WMS GetFeatureInfo URL，不加入地图。
   * 队站显示统一复用地图侧唯一的 gis:view_res_org_dept WMS 图层（由 store 驱动过滤）。
   */
  private readonly stationQuerySource: TileWMS;
  private showAllJurisdictions = false;
  private jurisdictionManager!: PolygonLayerManager<JurisdictionItem>;
  /** 当前已渲染的辖区项（key = stationId），用于 removeSupportJurisdictions 等 diff 操作 */
  private readonly renderedJurisdictions = new globalThis.Map<string, JurisdictionItem>();
  private readonly routeSource = new VectorSource();
  private readonly routeLayer: VectorLayer<VectorSource>;

  constructor(
    private readonly map: OlMap,
    private readonly options: DispatchT1Options = {},
  ) {
    this.stationQuerySource = new TileWMS({
      url: geoserverApi.getWMSServiceUrl('gis'),
      params: {
        LAYERS: DISPATCH_T1_STATION_LAYER,
        VERSION: '1.1.0',
        FORMAT: 'image/png',
        TRANSPARENT: true,
      },
      serverType: 'geoserver',
      crossOrigin: 'anonymous',
    });

    this.jurisdictionManager = mountPolygonLayer<JurisdictionItem>({
      map: this.map,
      items: [],
      visible: true,
      className: 'dispatch_t1_jurisdictions',
      zIndex: 1000,
      keyGetter: (item) => item.key,
      geometryGetter: (item) => item.geometry,
      styleGetter: (item) => this.getJurisdictionStyle(item.role),
    });
    this.routeLayer = new VectorLayer({
      source: this.routeSource,
      zIndex: 1002,
      updateWhileAnimating: true,
      updateWhileInteracting: true,
      style: (feature) => new Style({
        stroke: new Stroke({
          color: String(feature.get('color') ?? '#2563eb'),
          width: 5,
        }),
      }),
      properties: { name: 'dispatch_t1_routes' },
    });

    this.map.addLayer(this.routeLayer);

    this.bindStationClick();
    this.observeGenericStationPopups();
    this.hideGenericFeaturePopups();
    this.vehicleManager = createVehicleManager({
      routeSource: this.routeSource,
      getState: () => this.getState(),
    });
    void this.getStationFeatures().then(() => {
      this.hideGenericFeaturePopups();
    }).catch((error) => {
      console.warn('[DispatchT1] 预加载消防站数据失败', error);
    });
  }

  public subscribe(listener: DispatchT1StateListener): () => void {
    return this.stateController.subscribe(listener);
  }

  public getState(): Readonly<DispatchT1State> {
    return this.stateController.getState();
  }

  /** 使用消息服务推送的 WGS84 实时坐标更新已调派车辆。 */
  public updateVehicleLocations(batch: CarLocationBatch): number {
    return this.vehicleManager.updateVehicleLocations(batch);
  }

  /**
   * 模拟跟踪：让本次已调派车辆沿各自队站的规划路线匀速行驶到报警点。
   * 仅用于无真实 GPS 推送时的演示；真实 GPS 到达、取消调派、重置或销毁时自动停止。
   * 返回成功启动模拟的车辆数量。
   */
  public simulateVehicleTracking(): number {
    return this.vehicleManager.simulateVehicleTracking();
  }

  /** 专用要素弹窗显示期间，隐藏通用要素弹窗，避免同一点出现两个弹窗。 */
  public setGenericFeaturePopupSuppressed(suppressed: boolean): void {
    this.genericFeaturePopupSuppressed = suppressed;
    if (suppressed) this.hideGenericFeaturePopups();
  }

  public async handleWebSocketMessage(
    message: DispatchT1WebSocketData,
  ): Promise<Readonly<DispatchT1State>> {
    const wrappedMessage = 'payload' in message && message.payload
      ? message.payload
      : message;
    const data = 'data' in wrappedMessage && wrappedMessage.data
      ? wrappedMessage.data
      : wrappedMessage as DispatchT1AlarmProfileData;
    const longitude = Number(data.longitude);
    const latitude = Number(data.latitude);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      throw new Error('警情数据缺少有效的 longitude/latitude 坐标');
    }
    return this.queryByCoordinate({
      incident: {
        id: String(data.incidentId ?? ''),
        // formationId 由 GET /dispatch/incidents/{incidentId}/formation 权威下发，
        // 此处仅保留 WS 画像透传作为失败兜底；formationVersion 由前端固定。
        formationId: data.formationId ?? data.manualPlanId ?? data.dispatchPlanId,
        primaryStationId: data.leadStationId ?? data.mOrgId ?? data.primaryStationId,
        longitude,
        latitude,
        name: data.incidentStateName
          ? `${data.disaster_type ?? '警情'}（${data.incidentStateName}）`
          : data.disaster_type,
        address: data.disaster_address,
      },
      fireBrigade: data.fireBrigade ?? [],
      showAllJurisdictions: String(data.incidentState ?? '').toUpperCase() === 'CREATED',
    });
  }

  public async simulateCoordinate(
    longitude: number,
    latitude: number,
  ): Promise<Readonly<DispatchT1State>> {
    return this.handleWebSocketMessage({
      incidentId: `MOCK-${Date.now()}`,
      longitude,
      latitude,
      disaster_type: '模拟消防警情',
      disaster_address: `模拟坐标：${longitude}, ${latitude}`,
      incidentState: 'DISPATCHED',
      incidentStateName: '已派警',
      formationId: 'MOCK-MANUAL-FORMATION',
      formationVersion: 0,
      fireBrigade: [],
    });
  }

  /**
   * 按报警坐标发起一次完整的 T1 调派查询：定位警情 → 查询主管/支撑队站及其辖区 → 预取主管队站车辆。
   *
   * 流程要点：
   * 1. requestVersion 自增作废在途旧请求；上一轮的 commandId 幂等键同步清空；
   * 2. 先绘制警情点并飞行定位，队站/辖区等网络请求不阻塞首屏位置展示；
   * 3. 主管队站以报警坐标命中的辖区为准，WS 画像的 primaryStationId 仅作回退
   *    （showAllJurisdictions 模式下命中辖区的优先级更高）；
   * 4. 支撑队站取主管之外的候选站，按与主管站的距离排序并按半径规则扩展；
   * 5. 展示辖区后为主管与支撑队站并行规划到警情点的驾车路线（不阻塞结果返回）；
   * 6. 查询完成后仅预取主管队站车辆，支撑队站车辆在展开弹窗时懒加载。
   * @param data.incident 当前警情（含报警坐标及画像中的主管队站/编队占位值）。
   * @param data.fireBrigade 预留：WS 画像携带的队站信息，当前以地图辖区查询为准。
   * @param data.showAllJurisdictions 为 true 时同时展示所有支撑队站辖区，且主管判定以命中辖区优先。
   * @returns 查询完成后的只读调派状态。
   * @throws 队站/辖区查询失败、指定主管队站在地图中不存在等错误（过期请求除外，静默返回最新状态）。
   */
  public async queryByCoordinate(data: {
    incident: DispatchT1Incident;
    fireBrigade?: any[];
    showAllJurisdictions?: boolean;
  }): Promise<Readonly<DispatchT1State>> {
    const version = ++this.requestVersion;
    // 新警情/新画像进入，上一轮调派命令上下文作废，重试幂等键随之失效。
    this.commandId = null;
    this.showAllJurisdictions = data.showAllJurisdictions === true;
    this.clearRenderedResults();
    this.stateController.beginQuery(data.incident);
    // 警情点位统一写入警情定位 store（与画像地址变更共用同一矢量点位图层），
    // 视图飞行仍由本模块控制；地址后续被画像消息修正时，同一要素原位更新。
    useIncidentLocationStore().upsertIncidentFromAlarm({
      incidentId: data.incident.id,
      lng: data.incident.longitude,
      lat: data.incident.latitude,
      address: data.incident.address,
    });
    // 报警点先进入视野，队站/辖区请求不能阻塞位置展示。
    this.map.getView().animate({
      center: transform(
        [data.incident.longitude, data.incident.latitude],
        'EPSG:4326',
        this.map.getView().getProjection(),
      ),
      zoom: 14,
      duration: 400,
    });
    console.info('[DispatchT1] 已定位警情，开始查询队站辖区', {
      incidentId: data.incident.id,
    });

    try {
      // 调派编队与队站辖区相互独立，提前并行发起，避免阻塞首屏定位。
      const formationPromise = queryDispatchFormation(data.incident.id);
      const stationFeatures = await this.getStationFeatures();
      this.assertCurrent(version);

      const incidentCoordinate: Coordinate = [
        data.incident.longitude,
        data.incident.latitude,
      ];
      // 队站/辖区查询的纯业务逻辑统一下沉到 IncidentStationQuery；
      // 此处只负责传入缓存队站要素与主管判定策略，复用同一份实现。
      const result = await queryIncidentStations(incidentCoordinate, {
        stationFeatures,
        primaryStationId: data.incident.primaryStationId,
        showAllJurisdictions: data.showAllJurisdictions,
      });
      this.assertCurrent(version);

      const selected = [result.primary, ...result.support];
      const primaryStation = this.toStation(
        result.primary,
        'primary',
        result.jurisdictions.get(result.primary.id),
      );
      const supportStations = result.support.map((station) =>
        this.toStation(
          station,
          'support',
          result.jurisdictions.get(station.id),
        ),
      );

      // 以编队接口的权威值覆盖 WS 画像/前端占位；缺失会在调派校验阶段明确拦截。
      try {
        const formation = await formationPromise;
        data.incident.formationId = formation.formationId;
        data.incident.formationVersion = formation.formationVersion;
      } catch (formationError) {
        console.warn('[DispatchT1] 调派编队查询失败，调派将不可用', formationError);
      }

      this.stateController.completeQuery({
        incident: data.incident,
        primaryStation,
        supportStations,
        searchRadiusMeters: result.searchRadiusMeters,
      });
      this.showStations(selected, incidentCoordinate);
      this.drawJurisdiction(primaryStation);
      if (this.showAllJurisdictions) {
        supportStations.forEach(station => this.drawJurisdiction(station));
      }
      // 警情状态展示辖区后，主管与支撑队站并行规划到警情点的路线；
      // 不阻塞查询结果返回，单站失败仅标记该站 routeStatus 由面板提示。
      [primaryStation, ...supportStations].forEach((station) => {
        void this.planRoute(station);
      });
      console.info('[DispatchT1] 辖区查询完成', {
        primaryJurisdiction: Boolean(primaryStation.jurisdiction),
        supportJurisdictions: supportStations.filter(station => station.jurisdiction).length,
      });
      // 辖区查询完成后触发现场视频等查询阶段后的 UI 展示（若调用方配置了回调）。
      this.options.onQueryComplete?.(data.incident);
      this.hideGenericFeaturePopups();
      // 主管队站车辆随查询结果预取；支撑队站车辆延后到弹窗展开时加载。
      await this.loadStationVehicles(result.primary.id);
      return this.getState();
    } catch (error) {
      // 被新查询取代的在途请求静默处理，仅当前请求标记失败并上抛。
      if (version !== this.requestVersion) return this.getState();
      this.stateController.fail(this.errorMessage(error, '消防站查询失败'));
      throw error;
    }
  }

  public activateStation(stationId: string): Readonly<DispatchT1State> {
    const station = this.stateController.activateStation(stationId);
    if (!station) return this.getState();
    if (!this.showAllJurisdictions) {
      this.removeSupportJurisdictions();
      if (station.role === 'support') this.drawJurisdiction(station);
    }
    void this.loadStationVehicles(stationId);
    return this.getState();
  }

  public async loadStationVehicles(stationId: string): Promise<void> {
    const state = this.getState();
    const station = state.stations.find(item => item.id === stationId);
    if (!station || station.vehiclesLoading || this.dispatchPending) return;
    // 现阶段隐藏车辆列表弹窗，待后续优化
    // const version = this.requestVersion;
    this.stateController.setStationVehicles(stationId, null);
    // try {
    //   const vehicles = await listDispatchVehicles(state.incident?.id || '', stationId); // 'f7742190d975473790fb816861846b2e'
    //   if (version !== this.requestVersion) return;
    //   this.stateController.setStationVehicles(stationId, vehicles.map(vehicle => ({
    //     id: vehicle.vehicleId || vehicle.plateNumber,
    //     name: vehicle.vehicleName || vehicle.plateNumber,
    //     plateNumber: vehicle.plateNumber, type: vehicle.vehicleType ?? undefined,
    //     status: vehicle.vehicleStatus ?? undefined,
    //     orgId: vehicle.orgId ?? null,
    //     orgName: vehicle.orgName ?? vehicle.organization ?? null,
    //     vehicleHeightMeters: vehicle.vehicleHeightCm != null
    //       ? vehicle.vehicleHeightCm / 100
    //       : vehicle.vehicleHeightMeters ?? null,
    //     etaSeconds: vehicle.eta ?? vehicle.etaSeconds ?? null,
    //     selected: false, dispatched: false,
    //   })));
    // } catch (error) {
    //   if (version === this.requestVersion) {
    //     this.stateController.setStationVehicles(stationId, null, this.errorMessage(error, '车辆列表加载失败'));
    //   }
    // }
  }

  /** 未传入报警点时，仅预览所点击队站的辖区，不进入调派流程。 */
  public async previewStationJurisdiction(stationId: string): Promise<void> {
    const jurisdictions = await queryJurisdictionsByStationIds([stationId]);
    const geometry = jurisdictions.get(stationId);
    this.renderedJurisdictions.clear();
    if (geometry) {
      this.renderedJurisdictions.set(stationId, {
        key: stationId,
        geometry,
        role: 'primary',
      });
    }
    this.jurisdictionManager.setData([...this.renderedJurisdictions.values()]);
  }

  public async toggleVehicle(
    stationId: string,
    vehicleId: string,
    selected: boolean,
  ): Promise<Readonly<DispatchT1State>> {
    const result = this.stateController.selectVehicle(
      stationId,
      vehicleId,
      selected,
    );
    if (!result) return this.getState();
    if (result.shouldPlanRoute) {
      await this.planRoute(result.station);
    } else if (result.shouldRemoveRoute) {
      this.cancelRoute(result.station.id);
      this.removeRoute(result.station.id);
    }
    return this.getState();
  }

  /**
   * 提交当前已勾选的车辆执行调派（POST /dispatch/incidents/{incidentId}/confirm）。
   *
   * 关键约定：
   * - 幂等：同一业务操作首次提交生成 commandId，接口失败重试时复用；调派成功、换新警情或重置后清空；
   * - 编队：formationId 优先用面板查询阶段预取的权威值，缺失时现场懒加载，仍缺失则前端拦截；
   * - 原子性：后端回声 commandId/incidentId 不一致或批次车辆数不符会直接判失败，禁止部分成功；
   * - 失败回滚：请求已发出但失败时，撤销本地调派态并刷新涉及队站的车辆列表，
   *   要求人工核实后重新选择，避免在状态不明时重复提交。
   * @returns 调派成功/已在途（被新请求取代）时返回调派命令；无选中车辆、无警情或重入时返回 null。
   * @throws 编队查询失败、请求体校验失败或后端确认失败时上抛错误。
   */
  public async dispatchSelectedVehicles(): Promise<DispatchT1VehicleCommand | null> {
    if (this.dispatchPending) return null;
    const incident = this.getState().incident;
    // 从各队站勾选状态聚合本次调派命令（车辆清单等），无勾选时返回 null。
    const command = this.stateController.beginDispatch();
    if (!command || !incident) return null;
    const version = this.requestVersion;
    // 调派编队优先用面板加载阶段预取的值；缺失时现场懒加载，保证调派前一定拿到 formationId。
    if (!incident.formationId?.trim()) {
      try {
        const formation = await queryDispatchFormation(incident.id);
        incident.formationId = formation.formationId;
        incident.formationVersion = formation.formationVersion;
      } catch (formationError) {
        this.stateController.fail(this.errorMessage(formationError, '调派编队查询失败'));
        throw formationError;
      }
    }
    // 同一业务操作首次提交时生成 commandId；失败后重新选择再提交仍复用，直到成功或换新警情。
    if (!this.commandId) this.commandId = createCommandId();
    const formationVersion = incident.formationVersion;
    // 组装 confirm 契约请求体；formationVersion 非法时回落到固定兜底值 1。
    const payload: DispatchVehiclesRequest = {
      incidentId: incident.id,
      commandId: this.commandId,
      formationId: incident.formationId || '',
      formationVersion: typeof formationVersion === 'number' && Number.isFinite(formationVersion) && formationVersion >= 0
        ? formationVersion
        : DISPATCH_FORMATION_VERSION,
      vehicles: command.vehicles.map(vehicle => ({
        vehicleId: vehicle.vehicleId,
        ...(vehicle.stationId ? { stationId: vehicle.stationId } : {}),
      })),
    };
    // 标记请求是否已真正发出：已发出后失败需要回滚本地状态并刷新车辆列表。
    let submitted = false;
    try {
      validateDispatchRequest(payload);
      this.dispatchPending = true;
      submitted = true;
      const result = await dispatchVehiclesBatch(payload);
      // 请求期间已换新警情/重置：不再回写状态，但后端已确认的命令仍返回给调用方。
      if (version !== this.requestVersion) return command;
      this.stateController.completeDispatch(command, result);
      // 调派已被后端确认，后续再次调派属于新业务操作，需要新的幂等键。
      this.commandId = null;
    } catch (error) {
      this.dispatchPending = false;
      if (version === this.requestVersion) {
        this.stateController.fail(this.errorMessage(error, '车辆调派失败'));
        if (submitted) {
          // 已发出的请求失败：本地勾选可能与后端实际状态不一致，先撤销调派态再重新拉取车辆实况。
          this.stateController.cancelDispatch();
          await Promise.all([...new Set(command.vehicles.map(item => item.stationId))]
            .map(id => this.loadStationVehicles(id)));
          if (version === this.requestVersion) this.stateController.fail(`${this.errorMessage(error, '车辆调派失败')}；车辆列表已刷新，请核实方案状态后重新选择，勿直接重复提交。`);
        }
      }
      throw error;
    } finally {
      this.dispatchPending = false;
    }
    // 地图展示异常不应把服务端已确认的调派标记为失败。
    try {
      this.vehicleManager.registerDispatchedVehicles(command);
      await this.options.onDispatch?.(command);
    } catch (error) { console.warn('[DispatchT1] 调派成功，展示更新失败', error); }
    return command;
  }

  /** 取消本次调派，保留火情、队站和辖区，只清除车辆、路线及勾选状态。 */
  public cancelDispatch(): Readonly<DispatchT1State> {
    if (this.dispatchPending) return this.getState();
    this.routeVersions.forEach((version, stationId) => {
      this.routeVersions.set(stationId, version + 1);
    });
    this.vehicleManager.clearTrackedVehicles();
    this.routeSource.clear();
    this.stateController.cancelDispatch();
    return this.getState();
  }

  public reset(): void {
    this.requestVersion += 1;
    this.commandId = null;
    this.clearRenderedResults();
    this.stateController.reset();
  }

  public destroy(): void {
    this.genericPopupObserver?.disconnect();
    this.genericPopupObserver = null;
    if (this.clickKey) {
      unByKey(this.clickKey);
      this.clickKey = null;
    }
    this.reset();
    this.stateController.destroy();
    this.jurisdictionManager.destroy();
    this.map.removeLayer(this.routeLayer);
  }

  private async planRoute(station: DispatchT1Station): Promise<void> {
    const incident = this.getState().incident;
    if (!incident || station.routeStatus === 'planning') return;
    const version = (this.routeVersions.get(station.id) ?? 0) + 1;
    this.routeVersions.set(station.id, version);
    this.stateController.setRoutePlanning(station.id);

    try {
      const result = await fetchDrivingRoute({
        origin: [station.longitude, station.latitude],
        destination: [incident.longitude, incident.latitude],
        strategy: 0,
        extensions: 'all',
      });
      if (this.routeVersions.get(station.id) !== version) return;
      if (!result.fullPath.length) throw new Error('未获取到可用路线');

      if (result.fullPath.length < 2 || result.distanceMeters <= 0) {
        throw new Error('路线距离无效');
      }

      this.removeRouteFeatures(station.id);
      const tmcFeatures = buildTmcFeatures(result.tmcs);
      if (tmcFeatures.length) {
        tmcFeatures.forEach((feature, index) => {
          const status = (feature.get('tmcStatus') ?? 'unknown') as AmapTmcStatus;
          feature.setId(`dispatch_t1_route_${station.id}_${index}`);
          feature.set('stationId', station.id);
          feature.setStyle(getStyle('tmcLine', { status, width: 6 }));
        });
        this.routeSource.addFeatures(tmcFeatures);
      } else {
        const feature = new Feature({
          geometry: new LineString(
            result.fullPath.map((point) => fromLonLat(point)),
          ),
        });
        feature.setId(`dispatch_t1_route_${station.id}`);
        feature.set('stationId', station.id);
        feature.set('color', this.routeColor(station.id));
        this.routeSource.addFeature(feature);
      }
      this.stateController.setRouteReady(
        station.id,
        result.distanceMeters,
        result.durationSeconds,
      );
    } catch (error) {
      if (this.routeVersions.get(station.id) !== version) return;
      this.stateController.setRouteError(
        station.id,
        this.errorMessage(error, '路径规划失败'),
      );
    }
  }

  private bindStationClick(): void {
    this.clickKey = this.map.on('singleclick', async (event) => {
      const dispatchStarted = Boolean(this.getState().incident);
      // 立案查询中：队站图层由 store 强制过滤显示主管+支撑，无候选时不响应点击
      if (dispatchStarted && !this.getState().stations.length) return;
      if (
        !dispatchStarted
        && this.options.isLayerVisible
        && !this.options.isLayerVisible(DISPATCH_T1_STATION_LAYER)
      ) return;
      try {
        const view = this.map.getView();
        // stationQuerySource 不挂载到地图，仅用于拼装 GetFeatureInfo 请求参数
        const url = this.stationQuerySource.getFeatureInfoUrl(
          event.coordinate,
          view.getResolution() ?? 0,
          view.getProjection(),
          { INFO_FORMAT: 'application/json', FEATURE_COUNT: 1 },
        );
        if (!url) return;
        // 立案查询中只允许点中本次的主管/支撑队站，过滤条件与地图 WMS 图层一致
        const dispatchCqlFilter = this.getState().stations
          .map((station) => `id=${cqlLiteral(station.id)}`)
          .join(' OR ');
        const urlObject = new URL(url, window.location.origin);
        const data = await geoserverApi.getWMSFeatureInfo('gis', {
          layers: DISPATCH_T1_STATION_LAYER,
          query_layers: DISPATCH_T1_STATION_LAYER,
          bbox: urlObject.searchParams.get('BBOX') ?? '',
          width: Number(urlObject.searchParams.get('WIDTH')),
          height: Number(urlObject.searchParams.get('HEIGHT')),
          x: Number(urlObject.searchParams.get('X') ?? urlObject.searchParams.get('I')),
          y: Number(urlObject.searchParams.get('Y') ?? urlObject.searchParams.get('J')),
          cql_filter: dispatchStarted
            ? (dispatchCqlFilter || '1=1')
            : '1=1',
          feature_count: 1,
          srs: view.getProjection().getCode(),
        });
        const stationId = String(data?.features?.[0]?.properties?.id ?? '');
        if (stationId) {
          if (dispatchStarted) {
            this.activateStation(stationId);
          } else {
            await this.previewStationJurisdiction(stationId);
          }
        }
      } catch (error) {
        console.error('[DispatchT1] 点击消防站失败', error);
      }
    });
  }

  /**
   * 报警点传入前，通用弹窗只保留消防队站；报警点传入后，
   * 队站点击由 DispatchT1 接管，通用要素弹窗全部隐藏。
   */
  private observeGenericStationPopups(): void {
    const target = this.map.getTargetElement();
    if (!target || typeof MutationObserver === 'undefined') return;
    this.genericPopupObserver = new MutationObserver(() => {
      this.hideGenericFeaturePopups();
    });
    this.genericPopupObserver.observe(target, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  private hideGenericFeaturePopups(): void {
    const dispatchStarted = Boolean(this.getState().incident);
    const stationNamesReady = this.knownStationNames.size > 0;

    this.map.getOverlays().getArray().forEach((overlay) => {
      const element = overlay.getElement();
      if (!element || element.querySelector('.dispatch-station-popup')) return;
      const popup = element.querySelector('.overlay_popup');
      if (!popup) return;

      if (dispatchStarted || this.genericFeaturePopupSuppressed) {
        overlay.setPosition(undefined);
        return;
      }

      // 队站目录尚在加载时先保留，加载完成后会再次执行过滤。
      if (!stationNamesReady) return;
      const popupText = this.normalizeName(popup.textContent);
      const isStationPopup = [...this.knownStationNames].some(
        (name) => popupText.includes(name),
      );
      if (!isStationPopup) overlay.setPosition(undefined);
    });
  }

  private getStationFeatures(): Promise<any[]> {
    if (!this.stationFeaturesPromise) {
      this.stationFeaturesPromise = queryStationFeatures().then((features) => {
        for (const feature of features) {
          const properties = feature?.properties ?? {};
          const names = [
            properties.org_name,
            properties.simple_org_name,
            properties.name,
          ];
          for (const name of names) {
            const normalized = this.normalizeName(name);
            if (normalized) this.knownStationNames.add(normalized);
          }
        }
        return features;
      }).catch((error) => {
        this.stationFeaturesPromise = null;
        throw error;
      });
    }
    return this.stationFeaturesPromise;
  }

  private toStation(
    candidate: StationCandidate,
    role: DispatchT1StationRole,
    jurisdiction: GeoJSON.Geometry | undefined,
  ): DispatchT1Station {
    return {
      id: candidate.id,
      name: candidate.name,
      address: candidate.address,
      longitude: candidate.coordinate[0],
      latitude: candidate.coordinate[1],
      distanceMeters: candidate.distanceMeters,
      role,
      jurisdiction: jurisdiction ?? null,
      detailsVisible: false,
      jurisdictionVisible: false,
      routeStatus: 'idle',
      vehicles: [],
    };
  }

  private drawJurisdiction(station: DispatchT1Station): void {
    if (!station.jurisdiction) return;
    const item: JurisdictionItem = {
      key: station.id,
      geometry: station.jurisdiction,
      role: station.role,
    };
    this.renderedJurisdictions.set(station.id, item);
    this.jurisdictionManager.upsert(item);
  }

  private removeSupportJurisdictions(): void {
    for (const [key, item] of this.renderedJurisdictions) {
      if (item.role === 'support') {
        this.jurisdictionManager.remove(key);
        this.renderedJurisdictions.delete(key);
      }
    }
  }

  /**
   * 将本次主管+支撑队站写入共享队站图层 store（地图侧对唯一 WMS 消防站图层
   * 做 CQL 过滤并强制显示），同时把视野缩放到警情点与候选队站范围。
   */
  private showStations(
    stations: StationCandidate[],
    incidentCoordinate: Coordinate,
  ): void {
    useStationLayerStore().setStations(
      DISPATCH_T1_STATION_OWNER,
      stations.map((station) => station.id),
    );
    const projection = this.map.getView().getProjection().getCode();
    const extent = boundingExtent(
      [incidentCoordinate, ...stations.map((station) => station.coordinate)]
        .map((coordinate) => transform(coordinate, 'EPSG:4326', projection)),
    );
    this.map.getView().fit(extent, {
      padding: [90, 90, 90, 430],
      duration: 600,
      maxZoom: 14,
    });
  }

  private clearRenderedResults(): void {
    this.vehicleManager.clearTrackedVehicles();
    this.routeVersions.clear();
    this.routeSource.clear();
    this.renderedJurisdictions.clear();
    this.jurisdictionManager.setData([]);
    // 释放本模块对共享 WMS 消防站图层的过滤声明，恢复图层开关控制
    useStationLayerStore().clearOwner(DISPATCH_T1_STATION_OWNER);
  }

  private removeRoute(stationId: string): void {
    this.removeRouteFeatures(stationId);
    this.stateController.clearRoute(stationId);
  }

  private removeRouteFeatures(stationId: string): void {
    this.routeSource.getFeatures()
      .filter((feature) => !feature.get('dispatchVehicle') && (
        feature.get('stationId') === stationId
        || feature.getId() === `dispatch_t1_route_${stationId}`
      ))
      .forEach((feature) => this.routeSource.removeFeature(feature));
  }

  private cancelRoute(stationId: string): void {
    this.routeVersions.set(stationId, (this.routeVersions.get(stationId) ?? 0) + 1);
  }

  private routeColor(stationId: string): string {
    const index = this.getState().stations.findIndex(
      (station) => station.id === stationId,
    );
    return ROUTE_COLORS[Math.max(0, index) % ROUTE_COLORS.length];
  }

  private getJurisdictionStyle(role: DispatchT1StationRole): Style {
    return role === 'primary'
      ? new Style({
          fill: new Fill({ color: 'rgba(220, 38, 38, 0.18)' }),
          stroke: new Stroke({ color: '#dc2626', width: 3 }),
        })
      : new Style({
          fill: new Fill({ color: 'rgba(37, 99, 235, 0.14)' }),
          stroke: new Stroke({ color: '#2563eb', width: 2.5 }),
        });
  }

  private assertCurrent(version: number): void {
    if (version !== this.requestVersion) throw new Error('查询已被新的火情替换');
  }

  private normalizeName(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, '').toLowerCase();
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
  }
}
