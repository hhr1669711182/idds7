<script setup lang="ts">
import { onMounted, nextTick, onUnmounted, ref, computed, watch, markRaw } from "vue";
import OLMap from "ol/Map";
import { readScaleLineUnit } from "@/config/scaleLine.ts";
import { MAP_LAYER_Z_INDEX } from "./layerOrder";
import View from "ol/View";
import * as olProj from "ol/proj";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import type Overlay from "ol/Overlay";
// import OSM from "ol/source/OSM.js";  // TS6133: 未使用，import 保留备用
import TileLayer from "ol/layer/Tile";
import {
  // ZoomSlider,  // TS6133: 模板功能已注释，import 保留备用
  // FullScreen,  // TS6133: 模板功能已注释，import 保留备用
  ScaleLine,
  // ZoomToExtent,  // TS6133: 模板功能已注释，import 保留备用
  OverviewMap,
} from "ol/control";
import { KeyboardPan, Modify } from "ol/interaction";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import CircleGeom from "ol/geom/Circle";
import { fromLonLat, transform } from "ol/proj";
import PrintDialog from "ol-ext/control/PrintDialog";
import jsPDF from "jspdf";
import { saveAs } from "file-saver";
import { v4 as uuidv4 } from "uuid";
import {
  FeatureClickQuery,
  INCIDENT_PRIMARY_STATION_LAYER_CLASS,
  RESOURCE_CIRCLE_LAYER_CLASS,
} from "./FeatureClickQuery.ts";
import {
  GOOGLE_LAYER,
  TEMP_FRONTEND_LAYER_IDS,
  VECTOR_LAYER,
  isTempFrontendLayerId,
} from "./layers.ts";
import { useBaseMapLayer } from "./useBaseMapLayer.ts";
import { TrafficTools } from "@/components/map/MapTools";
import { ZOOM, CENTER } from "./const.map.ts";
// import { EXTENT } from "./const.map.ts";  // TS6133: 仅被注释代码引用，import 保留备用
import { useResponsive, useTouch } from "@/composables/useResponsive.ts";
import {
  AmapRealtimeNav,
  FIRE_STATION_LAYER_Z_INDEX,
  fetchInputTips,
  mountFireStations,
  mountJRAlarmLayer,
  type AmapDrivingResult,
  type LngLat,
  type RouteVideoCheckpointEvent,
} from "../amap/useAmapTools.ts";
import {
  mountCarFeatures,
  type CarItem,
  // type CarFeaturesManager,  // TS6133: 未使用，import 保留备用
} from '@/composables/useCarFeatures'
import {
  mountPointLayer,
  type PointLayerManager,
} from '@/baseComponent/OpenlayersMap/mountPointLayer.ts'
import {
  // mountPolygonLayer,  // TS6133: 功能已注释禁用，import 保留备用
  type PolygonLayerManager,
} from '@/baseComponent/OpenlayersMap/mountPolygonLayer.ts'
import { createSpecialMapMock, type SpecialMapMock } from '@/baseComponent/OpenlayersMap/specialMapMock.ts'
import { createIncidentRelocate, type IncidentRelocate } from '@/baseComponent/OpenlayersMap/incidentRelocate.ts'
import { Fill, Stroke, Style } from "ol/style";
import { getStyle, MAP_ICON_SRC } from '@/baseComponent/OpenlayersMap/style'
import {
  useIncidentLocationStore,
  type IncidentLocationMarker,
  type IncidentLocationZone,
  type IncidentPrimaryStation,
  type IncidentLocationRoutePlanRequest,
} from '@/store/useIncidentLocationStore'
import {
  useStationLayerStore,
  useNearbyResourceLayerStore,
  LOCATION_RESOURCE_OWNER_PREFIX,
  type NearbyResourceCircle,
} from '@/store/useStationLayerStore'
import {
  STATION_LAYER_NAME,
  cqlLiteral,
  queryStationCoordinatesByIds,
} from '@/controller/core/business/IncidentStationQuery'
import {
  FIRE_HYDRANT_LAYER_NAME,
  KEY_ENTERPRISE_LAYER_NAME,
  JURIS_ZONE_LAYER_NAME,
  BUILDING_LAYER_NAME,
  buildCircleIntersectsCql,
  queryIncidentNearbyResources,
} from '@/controller/core/business/IncidentNearbyResourceQuery'
import { IncidentVideoOverlayController } from '@/controller/core/business/IncidentVideoOverlayController'
import { getSharedMapStage } from '@/controller/core/io/messageStagePolicy'
import { useUserStore } from '@/store/useUserStore'
import { getBusinessMessageRuntime } from '@/controller/core/io/BusinessMessageRuntime'
import { createBusinessMapPort } from './businessMapPort'
import { MESSAGE_EVENT_KEY, MOCK_CALL_LOCATION_ID } from '@/const/const.message.type'
import { useMessageStore } from '@/store/useMessageStore'
import {
  INCOMING_CALL_FOCUS_ZOOM,
  usePendingCallLocationStore,
} from '@/store/usePendingCallLocationStore'
import { GenericController } from '@/controller/core/generic'
import type { CallController } from '@/controller/core/business/CallController'
import type { SharedDispatchVehicleMock } from '@/composables/useMockCallLocationBridge'
// import {
//   mountIncomingCallFeatures,
//   type IncomingCallFeaturesManager,
// } from '@/composables/useIncomingCallFeatures'
import amapData from "@/assets/map/config/data.json";
import carImg from "@/assets/map/icon/car.png";
import fireImg from "@/assets/map/icon/xfz.png";
import {
  type JRAlarmData,
} from "../amap/mapData.ts";
import { queryCarHistoryTrack } from "@/apis/carTrack";
import { useUnclosedIncidents } from '@/composables/useUnclosedIncidents'
import { useFireStations } from '@/composables/useFireStations'
import dayjs from 'dayjs'
import { ElMessage } from "element-plus";
import { EventBus } from "@/utils/mitt.ts";
import AlarmDetailPopup from "./AlarmDetailPopup.vue";
import IncidentDetailDialog from "./IncidentDetailDialog.vue";
import { fetchIncidentDetail } from "@/apis/incidentProfile";
import { extractLatestBatchFirstVehicleId } from "@/apis/carTrack";
import { createVehicleTrackRenderer, type VehicleTrackRenderer } from "./VehicleTrackRenderer";
import { useVehicleTrackStore } from "@/store/useVehicleTrackStore";
import { isTerminalIncidentState } from "@/utils/incidentState";
import { createLogger } from "@/utils/logger";
import {
  toIncidentDetailData,
  type IncidentDetailData,
  type IncidentDetailResponseData,
} from "./IncidentDetailDialog.vue";
import {
  buildUnifiedAlarmPopupRows,
  buildUnifiedAlarmPopupTitle,
  toAlarmPlanPopupFields,
  toJrAlarmPopupFields,
  type AlarmDetailRow,
  type UnifiedAlarmPopupFields,
} from "./useMapPopups";
import DispatchRoutePreview from './DispatchRoutePreview.vue';
import { getSelectedRoute, matchStationRoute, type RouteAlternative, type StationRouteAlternatives } from '../amap/routeAlternatives';
// import type { AlarmData } from "../amap/useAmapTools.ts";  // TS6133: 未使用，import 保留备用
import ZoomLevelControl from "./ZoomLevelControl.vue";

import ljImg from "@/assets/icons-svg/lj.svg";
import xcImg from "@/assets/icons-svg/xc.svg";
import zjImg from "@/assets/icons-svg/jz.svg";
import { useDispatchMapStore } from "@/store/useDispatchMapStore";
import { storeToRefs } from "pinia";
import TileWMS from "ol/source/TileWMS";
import { getWMSLayerOptions } from "@/apis/layers";
import { LAYER_SOURCE_CONFIGS } from "@/config/layers";
import { useMapConfigStore } from "@/store";
import { useBaseSourceStore } from "@/store/useBaseSourceStore";
import { useTabsStore } from "@/store/useTabsStore";

const props = withDefaults(defineProps<{
  mapId?: string;
}>(), {
  mapId: "dispatch-map",
});

const emit = defineEmits(["setMap"]);

// 响应式检测
const { isMobile } = useResponsive();
// @ts-expect-error TS6133: 模板功能已注释，变量保留备用
const { isTouchDevice } = useTouch();

let map: OLMap | null = null;
let nav: AmapRealtimeNav | null = null;
let zoomLevelChangeKey: EventsKey | null = null;
const navPanelRef = ref<HTMLElement | null>(null);
const mapZoomLevel = ref(ZOOM.INIT);

const firePopupRef = ref<HTMLElement | null>(null);
const firePopupVisible = ref(false);
// @ts-expect-error TS6133: 模板功能已注释，变量保留备用
const navVisible = ref(false);
const fireSelected = ref<any | null>(null);

const carPopupRef = ref<HTMLElement | null>(null);
const carPopupVisible = ref(false);
const carSelected = ref<CarItem | null>(null);
let carManager: any = null;
// let incomingCallManager: IncomingCallFeaturesManager | null = null;
type TempFrontendLayerManager = {
  hide: () => void;
  setVisible: (visible: boolean) => void;
  destroy: () => void;
  setData?: (alarms: JRAlarmData[]) => void;
  [key: string]: any;
};
let fireManager: TempFrontendLayerManager | null = null;

/** 已添加到地图的 WMS 图层（id -> ol.layer.Tile） */
const baseSourceStore = useBaseSourceStore();
const mapConfigStore = useMapConfigStore();
const {
  alarms: unclosedIncidents,
  fetch: fetchUnclosedIncidents,
} = useUnclosedIncidents();
const { stations: fireStations, load: loadFireStations, getNearestFireStation } = useFireStations();
/** WFS 全量队站原始列表；主管队站改由独立 zhu.png 图标上图，fireManager 填充时排除主管 id 避免图标重叠 */
let allFireStations: typeof fireStations.value = [];
const wmsLayerMap = new globalThis.Map<string, TileLayer<TileWMS>>();
// 底图 TileLayer：跟随全局 baseSourceStore 切换，共享 source 缓存池
const baseLayer = useBaseMapLayer({
  onMaxZoomChange: (_mz: number) => nextTick(() => applyFeatureZoomLimits()),
});
const overviewLayer = useBaseMapLayer();
let trafficTool: TrafficTools | null = null;

const applyFeatureZoomLimits = () => {
  if (!map) return;
  const { minZoom, maxZoom } = mapConfigStore.config.feature;
  const effectiveMaxZoom = maxZoom;
  const view = map.getView();
  view.setMinZoom(minZoom);
  view.setMaxZoom(effectiveMaxZoom);

  const zoom = view.getZoom();
  if (typeof zoom === "number") {
    view.setZoom(Math.min(Math.max(zoom, minZoom), effectiveMaxZoom));
  }
};

watch(
  () => [mapConfigStore.config.feature.minZoom, mapConfigStore.config.feature.maxZoom],
  applyFeatureZoomLimits,
);

let jrAlarmManager: TempFrontendLayerManager | null = null;

/** 画像地址变更（警情定位）点位图层：数据来自 useIncidentLocationStore，始终可见 */
const incidentLocationStore = useIncidentLocationStore();
const messageStore = useMessageStore();
const userStore = useUserStore();
const businessRuntime = getBusinessMessageRuntime();
let detachBusinessMap: (() => void) | null = null;
let mockMapGeneration = 0;
const pendingCallLocationStore = usePendingCallLocationStore();
let callLocationGenericController: GenericController | null = null;
let callLocationController: CallController | null = null;
let specialMapMock: SpecialMapMock | null = null;
/** 警情二次定位实例（受理席 mock 通道传入警情 id，激活地图选点确认后更新坐标） */
let incidentRelocate: IncidentRelocate | null = null;
/** 特殊地图激活标志：激活时 selectStationRoute 不写 lastRoutePlanResults，避免污染原有调派 */
let specialMapActive = false;

/** slotChanges 已形成有效警情点后，才结束来电粗定位圈。 */
const clearActiveCallLocation = () => {
  const active = pendingCallLocationStore.getActive();
  if (!active) return;
  callLocationController?.locateCallRemove({ id: active.id });
  pendingCallLocationStore.consume(active.id);
};
/**
 * 警情/调派主管+支撑队站过滤状态：警情定位与 DispatchT1 立案共用，
 * 地图侧对唯一 WMS 消防站图层（gis:view_res_org_dept）应用 CQL_FILTER。
 */
const stationLayerStore = useStationLayerStore();
/**
 * 警情定位周边资源范围圈状态：各警情点 500 米范围圈的并集，
 * 地图侧对消防栓/重点单位 WMS 图层应用 DWITHIN CQL_FILTER。
 */
const nearbyResourceLayerStore = useNearbyResourceLayerStore();
let incidentLocationManager: PointLayerManager<IncidentLocationMarker> | null = null;
/** 已渲染进图层的点位快照，用于与 store 数据 diff 出 upsert/remove */
let renderedMarkers = new globalThis.Map<string, IncidentLocationMarker>();
/** 主管队站独立图标图层（zhu.png）：数据来自 store.primaryStations（警情定位链路） */
let primaryStationManager: PointLayerManager<IncidentPrimaryStation> | null = null;
/** 已渲染进主管图层的点位快照，用于与 store.primaryStations diff 出 upsert/remove */
let renderedPrimaryStations = new globalThis.Map<string, IncidentPrimaryStation>();
const INCIDENT_LOCATION_LAYER_ZINDEX = MAP_LAYER_Z_INDEX.incident;
const INCIDENT_LOCATION_LAYER_CLASS = "INCIDENT_LOCATION_ALARM_LAYER";
/** 今日灾情点位图层 className（与 mountJRAlarmLayer 工厂内一致） */
const JR_ALARM_LAYER_CLASS = "JR_ALARM_LAYER";
const INCIDENT_LOCATION_FOCUS_ZOOM = 15;

/** 点位所属辖区面图层：数据来自 store.zones（WFS INTERSECTS 异步查询），始终可见 */
// @ts-expect-error TS6133: 模板功能已注释，变量保留备用
let incidentZoneManager: PolygonLayerManager<IncidentLocationZone> | null = null;
/** 灾情现场视频弹窗控制器：警情定位完成后在灾情点弹出 */
let incidentVideoController: IncidentVideoOverlayController | null = null;
/** 已渲染进辖区图层的快照，用于与 store.zones diff 出 upsert/remove */
// @ts-expect-error TS6133: 模板功能已注释，变量保留备用
let renderedZones = new globalThis.Map<string, IncidentLocationZone>();
// @ts-expect-error TS6133: 模板功能已注释，变量保留备用
const INCIDENT_LOCATION_ZONE_LAYER_ZINDEX = MAP_LAYER_Z_INDEX.jurisdiction;
// @ts-expect-error TS6133: 模板功能已注释，变量保留备用
const INCIDENT_LOCATION_ZONE_LAYER_CLASS = "INCIDENT_LOCATION_ZONE_LAYER";

/** 将地图视图定位到指定坐标（不低于 FOCUS_ZOOM） */
const focusMapView = (target: OLMap, point: { lng: number; lat: number }) => {
  if (!map) return;
  if (!point.lng || !point.lat) return;
  const view = target.getView();
  const minimumZoom = pendingCallLocationStore.getActive()
    ? INCOMING_CALL_FOCUS_ZOOM
    : INCIDENT_LOCATION_FOCUS_ZOOM;
  view.animate({
    center: olProj.fromLonLat([point.lng, point.lat]),
    zoom: Math.max(view.getZoom() ?? 0, minimumZoom),
    duration: 300,
  });
};

/**
 * 队站图层强制过滤的现场快照：警情/调派需要显示支撑队站时
 * （主管队站由独立 zhu.png 矢量图层显示，不在此层出图），
 * 复用图层开关控制的唯一 WMS 消防站图层，临时下 CQL_FILTER 并强制可见，
 * 业务释放后恢复开关原始状态。
 */
let forcedStationLayerSnapshot: {
  existed: boolean;
  prevVisible: boolean;
  hadCqlFilter: boolean;
  prevMinZoom: number;
} | null = null;

// 非调派状态下支撑队站不渲染；模拟调派期间通过该 owner 按调派支撑 id 过滤上图
const MOCK_DISPATCH_STATION_OWNER = "mockDispatch";

/**
 * 模拟调派期间主管队站图标（zhu.png）门控：
 * 非 null 时主管图层只放行集合内（本次参与路径规划）的主管站 id；
 * null 表示非调派期，主管图标恢复为 store 全量。
 */
let mockDispatchPrimaryGate: Set<string> | null = null;

const buildStationCqlFilter = (ids: string[]) =>
  ids.map((id) => `id=${cqlLiteral(id)}`).join(" OR ");

/**
 * 按共享队站 store 的并集对唯一 WMS 消防站图层应用/恢复 CQL_FILTER。
 * 主管队站改由独立 zhu.png 矢量图层上图，这里从并集中排除主管 id，
 * WMS 只渲染支撑队站，避免同一位置两个图标重叠。
 */
const syncStationLayerOverride = () => {
  if (!map) return;
  const primaryIds = new Set(
    stationLayerStore.primaryStationIds.map((id) => String(id).trim()),
  );
  const ids = stationLayerStore.selectedStationIds.filter(
    (id) => !primaryIds.has(String(id).trim()),
  );
  if (ids.length) {
    const existed = wmsLayerMap.has(STATION_LAYER_NAME);
    let layer = wmsLayerMap.get(STATION_LAYER_NAME);
    // 图层开关未开启时也需要临时上图显示支撑队站（主管由独立 zhu.png 图层显示）
    if (!layer) {
      if (!addLayer(STATION_LAYER_NAME)) return;
      layer = wmsLayerMap.get(STATION_LAYER_NAME);
    }
    if (!layer) return;
    const source = layer.getSource();
    if (!source) return;
    if (!forcedStationLayerSnapshot) {
      forcedStationLayerSnapshot = {
        existed,
        prevVisible: layer.getVisible(),
        hadCqlFilter: Object.prototype.hasOwnProperty.call(
          source.getParams(),
          "CQL_FILTER",
        ),
        prevMinZoom: layer.getMinZoom(),
      };
    }
    // 模拟调派期间：WMS 消防站图层只显示本次参与路径规划的支撑队站
    // （不取 store 并集，避免警情定位阶段声明的其他支撑站泄漏上图；
    // 主管 id 已在写入时拆分到 primaryEntries，这里再排除一次兜底）；
    // 本次调派没有支撑队站（仅主管）或非调派状态：整体过滤掉、不显示
    const dispatchIds =
      stationLayerStore.entries[MOCK_DISPATCH_STATION_OWNER]?.filter(
        (id) => !primaryIds.has(String(id).trim()),
      ) ?? [];
    if (dispatchIds.length) {
      source.updateParams({ CQL_FILTER: buildStationCqlFilter(dispatchIds) });
      // 过滤上图的视野可能低于图层 minZoom（如 fit maxZoom=14），临时解除缩放限制
      layer.setMinZoom(0);
      layer.setVisible(true);
    } else {
      source.updateParams({ CQL_FILTER: "1=2" });
      layer.setVisible(false);
    }
    return;
  }
  if (!forcedStationLayerSnapshot) return;
  const snapshot = forcedStationLayerSnapshot;
  forcedStationLayerSnapshot = null;
  const layer = wmsLayerMap.get(STATION_LAYER_NAME);
  const source = layer?.getSource();
  if (layer && source) {
    if (snapshot.hadCqlFilter) {
      source.updateParams({ CQL_FILTER: "1=1" });
    } else {
      const params = { ...source.getParams() };
      delete params.CQL_FILTER;
      source.updateParams(params);
    }
    layer.setVisible(snapshot.prevVisible);
    layer.setMinZoom(snapshot.prevMinZoom);
    // 原本未挂载（开关关闭）的临时图层直接移除，避免残留全量队站
    if (!snapshot.existed) removeLayer(STATION_LAYER_NAME);
  }
};

watch(
  () => [
    ...stationLayerStore.selectedStationIds,
    ...stationLayerStore.primaryStationIds,
  ],
  () => syncStationLayerOverride(),
);

/**
 * 警情定位周边资源 WMS 图层（消防栓 gis:env_fire_water、重点单位 gis:view_env_enterprises、
 * 队站辖区 gis:view_juris_zone、建筑 gis:view_env_building）强制过滤的现场快照，key = 图层名。
 * 复用图层开关控制的 WMS 图层，按各警情点范围圈并集下圆面相交 CQL_FILTER 并强制可见、
 * 临时解除 minZoom，业务释放后恢复开关原始状态。
 */
const NEARBY_RESOURCE_LAYER_NAMES = [
  FIRE_HYDRANT_LAYER_NAME,
  KEY_ENTERPRISE_LAYER_NAME,
  JURIS_ZONE_LAYER_NAME,
  BUILDING_LAYER_NAME,
] as const;
const forcedResourceLayerSnapshots = new globalThis.Map<string, {
  existed: boolean;
  prevVisible: boolean;
  hadCqlFilter: boolean;
  prevMinZoom: number;
}>();

/** 各周边资源图层空间过滤的几何字段名（辖区为 zone_geom，其余为 geom） */
const RESOURCE_LAYER_GEOM_FIELDS: Record<string, string> = {
  [FIRE_HYDRANT_LAYER_NAME]: 'geom',
  [KEY_ENTERPRISE_LAYER_NAME]: 'geom',
  [JURIS_ZONE_LAYER_NAME]: 'zone_geom',
  [BUILDING_LAYER_NAME]: 'geom',
};

/**
 * 多个警情点范围圈拼"圆面相交"OR 过滤（按图层几何字段名拼，带 SRID=4326 前缀）。
 * 与 WFS 查询共用 buildCircleIntersectsCql（turf 测地圆），保证 WMS 出图与查询口径一致。
 */
const buildResourceCircleCqlFilter = (
  circles: NearbyResourceCircle[],
  geomField: string,
) =>
  circles
    .map((circle) =>
      buildCircleIntersectsCql(
        geomField,
        [circle.lng, circle.lat],
        circle.radiusMeters,
      ),
    )
    .join(" OR ");

/** 对单个周边资源 WMS 图层按范围圈并集应用/恢复 CQL_FILTER（与消防站图层同一快照恢复模式） */
const syncOneResourceLayerOverride = (layerName: string) => {
  if (!map) return;
  const circles = nearbyResourceLayerStore.circles;
  if (circles.length) {
    const existed = wmsLayerMap.has(layerName);
    let layer = wmsLayerMap.get(layerName);
    // 图层开关未开启（消防栓默认关闭）时也需要临时上图显示圈内资源
    if (!layer) {
      if (!addLayer(layerName)) return;
      layer = wmsLayerMap.get(layerName);
    }
    if (!layer) return;
    const source = layer.getSource();
    if (!source) return;
    if (!forcedResourceLayerSnapshots.has(layerName)) {
      forcedResourceLayerSnapshots.set(layerName, {
        existed,
        prevVisible: layer.getVisible(),
        hadCqlFilter: Object.prototype.hasOwnProperty.call(
          source.getParams(),
          "CQL_FILTER",
        ),
        prevMinZoom: layer.getMinZoom(),
      });
    }
    const geomField = RESOURCE_LAYER_GEOM_FIELDS[layerName] ?? 'geom';
    source.updateParams({ CQL_FILTER: buildResourceCircleCqlFilter(circles, geomField) });
    // 警情定位 zoom 可能低于图层 minZoom（消防栓 15.5、定位 zoom 15），临时解除缩放限制
    layer.setMinZoom(0);
    layer.setVisible(true);
    return;
  }
  const snapshot = forcedResourceLayerSnapshots.get(layerName);
  if (!snapshot) return;
  forcedResourceLayerSnapshots.delete(layerName);
  const layer = wmsLayerMap.get(layerName);
  const source = layer?.getSource();
  if (layer && source) {
    if (snapshot.hadCqlFilter) {
      source.updateParams({ CQL_FILTER: "1=1" });
    } else {
      const params = { ...source.getParams() };
      delete params.CQL_FILTER;
      source.updateParams(params);
    }
    layer.setVisible(snapshot.prevVisible);
    layer.setMinZoom(snapshot.prevMinZoom);
    // 原本未挂载（开关关闭）的临时图层直接移除，避免残留全量资源
    if (!snapshot.existed) removeLayer(layerName);
  }
};

/** 范围圈填充色（淡橙），与来电定位圈（蓝 rgba(0,100,255,*)）区分 */
const RESOURCE_CIRCLE_FILL = 'rgba(255, 140, 0, 0.12)';
const RESOURCE_CIRCLE_STROKE = 'rgba(255, 140, 0, 0.9)';
/** 范围圈 feature id 前缀（与来电定位圈区分，互不干扰） */
const RESOURCE_CIRCLE_FEATURE_ID = 'nearby_resource_circle';
/**
 * 范围圈图层 zIndex：位于警情点位（incident=1003.5）之下，
 * 保证警情图标始终在圈面之上、点击命中不被装饰面遮挡。
 */
const RESOURCE_CIRCLE_LAYER_Z_INDEX = MAP_LAYER_Z_INDEX.incident - 0.1;

/**
 * Web Mercator(EPSG:3857) 投影米 ↔ 地面米换算。
 * ol/geom/Circle 在 3857 坐标系下半径单位是投影米，同纬度下
 * 地面距离 = 投影距离 × cos(纬度)；直接把 500 地面米当投影半径画，
 * 在深圳纬度圈会偏小（约 462 地面米），与 turf 测地查询圆不一致。
 */
const mercatorMetersToGround = (projectedMeters: number, latDeg: number) =>
  projectedMeters * Math.cos((latDeg * Math.PI) / 180);
const groundMetersToMercator = (groundMeters: number, latDeg: number) =>
  groundMeters / Math.cos((latDeg * Math.PI) / 180);

/**
 * 警情点周边资源范围圈独立矢量图层。
 * 用 ol/geom/Circle（而非 turf buffer 的 Polygon 多边形）以便 Modify 交互拖拽边缘改半径；
 * 松开鼠标（modifyend）时从 Circle 几何读圆心+半径，更新 store 触发 WMS 重查 + 周边资源重查。
 */
let resourceCircleLayer: VectorLayer<VectorSource> | null = null;
/** Modify 交互实例，范围圈上图时激活、清除时移除 */
let resourceCircleModify: Modify | null = null;
/** 拖拽中标志：拖拽期间跳过 store→图层同步，避免循环更新 */
let resourceCircleDragging = false;

/** 创建范围圈独立矢量图层 + Modify 交互（懒初始化，地图就绪后首次画圈时创建） */
const ensureResourceCircleLayer = () => {
  if (!map || resourceCircleLayer) return;
  const source = markRaw(new VectorSource({ wrapX: false }));
  resourceCircleLayer = markRaw(new VectorLayer({
    source,
    className: RESOURCE_CIRCLE_LAYER_CLASS,
    zIndex: RESOURCE_CIRCLE_LAYER_Z_INDEX,
    style: new Style({
      fill: new Fill({ color: RESOURCE_CIRCLE_FILL }),
      stroke: new Stroke({ color: RESOURCE_CIRCLE_STROKE, width: 2 }),
    }),
  }));
  map.addLayer(resourceCircleLayer);
  // Modify 绑定本图层的 source，拖拽圈边缘改半径
  resourceCircleModify = markRaw(new Modify({
    source,
    pixelTolerance: 8,
    // 圆心与警情点图标重合：在警情点图层上按下时 Modify 不介入，
    // 保证点击图标能正常触发点位弹窗，同时禁用圆心拖动（仅允许拖圈边改半径）
    condition: (evt) =>
      !map!.hasFeatureAtPixel(evt.pixel, {
        hitTolerance: 6,
        layerFilter: (targetLayer) =>
          targetLayer.getClassName() === INCIDENT_LOCATION_LAYER_CLASS,
      }),
  }));
  map.addInteraction(resourceCircleModify);
  // 拖拽开始时设标志，跳过 store→图层同步避免循环
  resourceCircleModify.on('modifystart', () => {
    resourceCircleDragging = true;
  });
  // 松开鼠标时读 Circle 几何更新 store（触发 WMS 重查 + 周边资源重查）
  resourceCircleModify.on('modifyend', () => {
    resourceCircleDragging = false;
    if (!resourceCircleLayer) return;
    const source = resourceCircleLayer.getSource();
    if (!source) return;
    const feature = source.getFeatureById(RESOURCE_CIRCLE_FEATURE_ID);
    if (!feature) return;
    const geom = feature.getGeometry() as CircleGeom | null;
    if (!geom) return;
    const center = geom.getCenter(); // EPSG:3857
    const projectedRadius = geom.getRadius(); // EPSG:3857 投影米
    const centerLonLat = transform(center, 'EPSG:3857', 'EPSG:4326');
    // 投影半径 → 地面米（按圆心纬度），store/WFS/WMS 一律使用地面米
    const radius = mercatorMetersToGround(projectedRadius, centerLonLat[1]);
    if (!Number.isFinite(radius) || radius <= 0) return;
    // 更新 store：用拖拽后的圆心 + 半径替换范围圈，触发 WMS 重查 + 圈重画
    // 注：circles 是按 owner 分组的，这里只更新第一个 owner 的第一个圈
    const owners = Object.keys(nearbyResourceLayerStore.entries);
    if (!owners.length) return;
    nearbyResourceLayerStore.setCircles(owners[0], [{
      lng: centerLonLat[0],
      lat: centerLonLat[1],
      radiusMeters: radius,
    }]);
    // 触发周边资源重新查询（store 范围圈更新后 WMS 自动重查，但 WFS 查询需手动触发）
    const markerKey = owners[0].replace(LOCATION_RESOURCE_OWNER_PREFIX, '');
    const marker = incidentLocationStore.markers[markerKey];
    if (marker) {
      // 复用 fetchJurisdiction 的周边资源查询链路（竞态令牌 + WFS + 范围圈声明）
      void queryIncidentNearbyResources([centerLonLat[0], centerLonLat[1]], {
        radiusMeters: radius,
      }).then((result) => {
        incidentLocationStore.nearbyResources[markerKey] = {
          key: markerKey,
          radiusMeters: radius,
          fireHydrants: result.fireHydrants,
          keyEnterprises: result.keyEnterprises,
          jurisZones: result.jurisZones,
          buildings: result.buildings,
          version: marker.version,
        };
      }).catch((error) => {
        console.warn('[resource-circle] 拖拽后重新查询周边资源失败', { markerKey, error });
      });
    }
  });
};

/**
 * 同步范围圈独立矢量图层：store 范围圈变化时画/移/改圈几何。
 * - 新增：创建 ol/geom/Circle（EPSG:3857，半径米），画到独立图层
 * - 消失：移除 feature
 * - 变化（如拖拽松开后 store 更新）：原地更新几何，不重建（避免闪烁）
 * 拖拽中跳过同步，避免 modifyend 更新 store 后又回写图层导致循环。
 */
const syncResourceCircles = () => {
  const circles = nearbyResourceLayerStore.circles;
  if (!circles.length) {
    // 无范围圈：移除 feature（保留图层+交互，下次画时复用）
    if (resourceCircleLayer) {
      const source = resourceCircleLayer.getSource();
      const feature = source?.getFeatureById(RESOURCE_CIRCLE_FEATURE_ID);
      if (feature) source?.removeFeature(feature);
    }
    return;
  }
  if (resourceCircleDragging) return; // 拖拽中不同步，避免循环
  ensureResourceCircleLayer();
  if (!map || !resourceCircleLayer) return;
  const source = resourceCircleLayer.getSource();
  if (!source) return;
  // 只画第一个圈（当前单警情点场景）；多警情点拖拽需求出现时再扩展
  const circle = circles[0];
  const center3857 = fromLonLat([circle.lng, circle.lat]);
  // store 存地面米，ol/geom/Circle 需要投影米（按圆心纬度换算），
  // 保证视觉圈与 turf 测地查询圆/WMS 过滤圆一致
  const projectedRadius = groundMetersToMercator(circle.radiusMeters, circle.lat);
  const newGeom = new CircleGeom(center3857, projectedRadius);
  let feature = source.getFeatureById(RESOURCE_CIRCLE_FEATURE_ID) as Feature | undefined;
  if (feature) {
    feature.setGeometry(newGeom);
  } else {
    feature = markRaw(new Feature({ geometry: newGeom }));
    feature.setId(RESOURCE_CIRCLE_FEATURE_ID);
    source.addFeature(feature);
  }
};

/** 按共享周边资源 store 的范围圈并集，对消防栓/重点单位 WMS 图层统一应用/恢复 */
const syncResourceLayersOverride = () => {
  NEARBY_RESOURCE_LAYER_NAMES.forEach((layerName) =>
    syncOneResourceLayerOverride(layerName),
  );
  syncResourceCircles();
};

watch(
  () =>
    nearbyResourceLayerStore.circles
      .map((circle) => `${circle.lng},${circle.lat},${circle.radiusMeters}`)
      .join("|"),
  () => syncResourceLayersOverride(),
);

/**
 * 主管队站以独立 zhu.png 图标上图：全量消防站图层（fireManager / xfz.png）
 * 填充时排除各业务方声明的主管 id，避免同一位置两个队站图标重叠。
 * 队站 WFS 数据加载完成或主管集合变化时重新填充。
 */
const syncFireManagerStations = () => {
  if (!fireManager || !allFireStations.length) return;
  const excludedIds = new Set(
    stationLayerStore.primaryStationIds.map((id) => String(id).trim()),
  );
  const visibleStations = allFireStations.filter(
    (station) => !excludedIds.has(String(station.id).trim()),
  );
  fireManager.setStations?.(visibleStations);
};

watch(
  () => [...stationLayerStore.primaryStationIds],
  () => syncFireManagerStations(),
);

watch(() => baseSourceStore.trafficVisible, (visible) => {
  if (trafficTool) {
    trafficTool.setVisible(visible);
  }
});

watch(unclosedIncidents, (next) => {
  if (jrAlarmManager?.setData) {
    jrAlarmManager.setData(next);
  }
});

/** 画像地址变更点位：watch store 数据 diff 后增量 upsert/remove（新增/坐标或版本变化） */
watch(
  () => ({ ...incidentLocationStore.markers }),
  (next) => {
    // 立案消息也会创建 marker；只有 slotChanges 的正式坐标可以清除粗定位圈。
    if (Object.values(next).some((entry) => entry.coordinateSource === 'slotChanges')) {
      clearActiveCallLocation();
    }
    if (!incidentLocationManager) return;
    Object.values(next).forEach((entry) => {
      const old = renderedMarkers.get(entry.key);
      if (
        !old ||
        old.lng !== entry.lng ||
        old.lat !== entry.lat ||
        old.version !== entry.version
      ) {
        incidentLocationManager?.upsert(entry);
      }
    });
    renderedMarkers.forEach((_old, key) => {
      if (!(key in next)) incidentLocationManager?.remove(key);
    });
    renderedMarkers = new globalThis.Map(
      Object.values(next).map((entry) => [entry.key, entry]),
    );
  },
);

/**
 * 按模拟调派门控刷新主管图层（zhu.png）：
 * 调派期间仅显示本次参与路径规划的主管站，调派结束后恢复 store 全量主管站。
 */
const syncPrimaryStationVisibility = () => {
  if (!primaryStationManager) return;
  const items = Object.values(incidentLocationStore.primaryStations);
  primaryStationManager.setData(
    mockDispatchPrimaryGate
      ? items.filter((station) => mockDispatchPrimaryGate!.has(station.stationId))
      : items,
  );
};

/**
 * 模拟调派队站图标门控：在本次参与路径规划的队站中，
 * 命中 queryIncidentStations 判定主管（store.primaryStations）的显示主管图标 zhu.png，
 * 其余按支撑队站 WMS 图标显示；不参与本次路径规划的队站一律不显示。
 */
const applyMockDispatchStationIcons = (stationIds: string[]) => {
  const primaryIds = new Set(
    Object.values(incidentLocationStore.primaryStations).map(
      (station) => station.stationId,
    ),
  );
  const dispatchPrimaryIds = stationIds.filter((id) => primaryIds.has(id));
  const dispatchSupportIds = stationIds.filter((id) => !primaryIds.has(id));
  const store = useStationLayerStore();
  // 主管 id 进 primaryEntries（zhu.png 图层 + 全量消防站层排除），支撑 id 进 entries（WMS 过滤上图）
  store.setPrimaryStations(MOCK_DISPATCH_STATION_OWNER, dispatchPrimaryIds);
  store.setStations(MOCK_DISPATCH_STATION_OWNER, dispatchSupportIds);
  mockDispatchPrimaryGate = new Set(dispatchPrimaryIds);
  syncPrimaryStationVisibility();
};

/** 退出模拟调派：清除图标门控，恢复非调派期队站图层规则 */
const clearMockDispatchStationIcons = () => {
  mockDispatchPrimaryGate = null;
  useStationLayerStore().clearOwner(MOCK_DISPATCH_STATION_OWNER);
  syncPrimaryStationVisibility();
};

/** 主管队站点位：watch store.primaryStations diff 后增量 upsert/remove（zhu.png 独立图标） */
watch(
  () => ({ ...incidentLocationStore.primaryStations }),
  (next) => {
    if (!primaryStationManager) return;
    // 模拟调派期间：主管图层只保留本次参与路径规划的主管站，store 变化也不放行其他主管
    if (mockDispatchPrimaryGate) {
      primaryStationManager.setData(
        Object.values(next).filter((station) =>
          mockDispatchPrimaryGate!.has(station.stationId),
        ),
      );
      renderedPrimaryStations = new globalThis.Map(
        Object.values(next).map((station) => [station.key, station]),
      );
      return;
    }
    Object.values(next).forEach((station) => {
      const old = renderedPrimaryStations.get(station.key);
      if (
        !old ||
        old.lng !== station.lng ||
        old.lat !== station.lat ||
        old.stationId !== station.stationId ||
        old.version !== station.version
      ) {
        primaryStationManager?.upsert(station);
      }
    });
    renderedPrimaryStations.forEach((_old, key) => {
      if (!(key in next)) primaryStationManager?.remove(key);
    });
    renderedPrimaryStations = new globalThis.Map(
      Object.values(next).map((station) => [station.key, station]),
    );
  },
);

/* 辖区渲染已禁用：watcher 不再同步 store.zones 到图层
watch(
  () => ({ ...incidentLocationStore.zones }),
  (next) => {
    if (!incidentZoneManager) return;
    Object.values(next).forEach((zone) => {
      const old = renderedZones.get(zone.key);
      if (
        !old ||
        old.version !== zone.version ||
        old.geometry !== zone.geometry
      ) {
        incidentZoneManager?.upsert(zone);
      }
    });
    renderedZones.forEach((_old, key) => {
      if (!(key in next)) incidentZoneManager?.remove(key);
    });
    renderedZones = new globalThis.Map(
      Object.values(next).map((zone) => [zone.key, zone]),
    );
  },
);
*/

/** 路径规划请求：有 nav 时立即消费（fetchRoutesAndEta + renderRoutesOnly），无 nav 时保留待挂载 */
watch(
  () => incidentLocationStore.routePlanRequest,
  (req) => {
    if (!nav || !map) return;
    if (!req) {
      // 点位移除：清空已渲染的路线
      resetRouteVideoPlayback();
      nav.clearRoutes();
      routePreviewVisible.value = false;
      routePreviewLoading.value = false;
      routePreviewStations.value = [];
      lastRoutePlanResults = [];
      featureClickQuery?.close();
      return;
    }
    void processRoutePlan(req);
  },
);

/** 定位请求：有图层时立即消费并定位；无图层时保留，待挂载后消费 */
watch(
  () => incidentLocationStore.focusRequest,
  (req) => {
    if (!req || !incidentLocationManager || !map) return;
    incidentLocationStore.consumeFocus(req.seq);
    focusMapView(map, req);
  },
);

/**
 * 处理图层切换：index.vue 透传过来，执行实际的 addLayer/removeLayer
 * @param action 'add' | 'remove'
 * @param id 图层配置 ID
 */
const addLayer = (id: string) => {
  if (!map) return false;
  if (isTempFrontendLayerId(id)) {
    return setTempFrontendLayerVisible(id, true);
  }

  const config = LAYER_SOURCE_CONFIGS.find((c) => c.id === id);
  if (!config || wmsLayerMap.has(id)) return false;

  const options = getWMSLayerOptions(config);
  const wmsLayer = markRaw(new TileLayer({
    source: markRaw(new TileWMS({
      url: options.url,
      params: options.params,
      serverType: options.serverType,
      crossOrigin: options.crossOrigin,
    })),
    opacity: options.opacity,
    minZoom: config.minZoom,
    zIndex: id === STATION_LAYER_NAME ? FIRE_STATION_LAYER_Z_INDEX : undefined,
  }));

  map.addLayer(wmsLayer);
  wmsLayerMap.set(id, wmsLayer);
  return true;
};

const removeLayer = (id: string) => {
  if (!map) return false;
  // 警情/调派正在复用消防站 WMS 图层显示主管+支撑队站时，禁止开关移除
  if (
    id === STATION_LAYER_NAME
    && stationLayerStore.selectedStationIds.length
  ) {
    return false;
  }
  // 警情定位正在复用消防栓/重点单位/队站辖区/建筑 WMS 图层显示 500 米圈内资源时，禁止开关移除
  if (
    (id === FIRE_HYDRANT_LAYER_NAME || id === KEY_ENTERPRISE_LAYER_NAME || id === JURIS_ZONE_LAYER_NAME || id === BUILDING_LAYER_NAME)
    && nearbyResourceLayerStore.circles.length
  ) {
    return false;
  }
  if (isTempFrontendLayerId(id)) {
    return setTempFrontendLayerVisible(id, false);
  }

  const layer = wmsLayerMap.get(id);
  if (!layer) return false;

  map.removeLayer(layer);
  wmsLayerMap.delete(id);
  return true;
};

const dispatchMapStore = useDispatchMapStore();
const { checkedIds: dispatchCheckedIds } = storeToRefs(dispatchMapStore);

const syncLayers = (ids: string[]) => {
  const targetIds = new Set(ids);

  Object.values(TEMP_FRONTEND_LAYER_IDS).forEach((id) => {
    setTempFrontendLayerVisible(id, targetIds.has(id));
  });

  Array.from(wmsLayerMap.keys()).forEach((id) => {
    if (!targetIds.has(id)) removeLayer(id);
  });
  ids.forEach((id) => {
    if (!isTempFrontendLayerId(id)) addLayer(id);
  });
};

defineExpose({
  addLayer,
  removeLayer,
  syncLayers,
});

/**
 * 地图业务点位统一弹窗数据：警情规划(alarm)/今日灾情(jr)/警情定位(incident)
 * 三类点位共用同一个 alarmPopupRef DOM 与同一个 OL Overlay，
 * 由统一 singleclick 处理器按命中图层切换数据，避免多个 Overlay 抢占同一元素。
 */
type ActiveMapPopup =
  | { kind: 'alarm'; data: any }
  | { kind: 'jr'; data: JRAlarmData }
  | { kind: 'incident'; data: IncidentLocationMarker };

const alarmPopupRef = ref<HTMLElement | null>(null);
/** 当前弹窗数据（null 表示关闭）；三类点位互斥，同一时刻只显示一个 */
const activeMapPopup = ref<ActiveMapPopup | null>(null);
const alarmPopupVisible = computed(() => activeMapPopup.value !== null);
/** 警情规划数据：路径规划等其他链路直接使用，不随弹窗关闭清空 */
const alarmData = ref<any>(null);
let alarmOverlayManager: {
  overlay: Overlay;
  showAtAlarm: () => void;
  hide: () => void;
  destroy: () => void;
} | null = null;
/** 三类点位统一弹窗的 singleclick 监听 key，cleanup 时解绑 */
let unifiedPopupClickKey: EventsKey | null = null;

let featureClickQuery: FeatureClickQuery | null = null;

const hasText = (value: string | number | null | undefined) =>
  value !== null && value !== undefined && value !== "";

const formatCoordinateText = (
  lng?: string | number | null,
  lat?: string | number | null,
) => {
  if (!hasText(lng) && !hasText(lat)) return "";
  if (!hasText(lng)) return String(lat);
  if (!hasText(lat)) return String(lng);
  return `${lng}, ${lat}`;
};

const CAR_TYPE_LABELS: Record<CarItem['carType'], string> = {
  fireEngine: '消防车',
  rescue: '救援车',
  ladder: '云梯车',
  command: '指挥车',
};

const CAR_STATUS_LABELS: Record<NonNullable<CarItem['status']>, string> = {
  online: '在线',
  offline: '离线',
  maintenance: '维修中',
};

const carTypeLabel = (t?: CarItem['carType']) =>
  t ? CAR_TYPE_LABELS[t] ?? t : '';
const carStatusLabel = (s?: CarItem['status']) =>
  s ? CAR_STATUS_LABELS[s] ?? s : '';

/**
 * 将当前命中的点位归一化到统一弹窗字段：
 * 警情规划/今日灾情/警情定位三类点位展示完全一致的 7 行，
 * 数据源缺字段时留空（组件渲染 "-"）。
 */
const activePopupFields = computed<UnifiedAlarmPopupFields | null>(() => {
  const popup = activeMapPopup.value;
  if (!popup) return null;
  if (popup.kind === "jr") return toJrAlarmPopupFields(popup.data);
  if (popup.kind === "alarm") return toAlarmPlanPopupFields(popup.data);
  // 警情定位点：仅有地址与主管队站（主管名取同 key 派生物，未命中回退队站 ID）
  const marker = popup.data;
  return {
    disasterAddress: marker.address,
    mOrgIdLabel:
      incidentLocationStore.primaryStations[marker.key]?.name
      || marker.primaryStationId
      || null,
  };
});

const alarmPopupTitle = computed(() =>
  buildUnifiedAlarmPopupTitle(activePopupFields.value),
);

const alarmPopupRows = computed<AlarmDetailRow[]>(() =>
  buildUnifiedAlarmPopupRows(activePopupFields.value),
);

const setTempFrontendLayerVisible = (id: string, visible: boolean) => {
  const managerMap: Record<string, TempFrontendLayerManager | null> = {
    [TEMP_FRONTEND_LAYER_IDS.STATION]: fireManager,
    [TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER]: jrAlarmManager,
    [TEMP_FRONTEND_LAYER_IDS.ONLINE_CAR]: carManager,
    // [TEMP_FRONTEND_LAYER_IDS.INCOMING_CALL]: incomingCallManager as unknown as TempFrontendLayerManager,
  };

  const manager = managerMap[id];
  if (!manager) return false;
  manager.setVisible(visible);
  if (visible) {
    if (id === TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER) {
      fetchUnclosedIncidents();
    } else if (id === TEMP_FRONTEND_LAYER_IDS.ONLINE_CAR) {
      carManager?.fetch();
    }
  }
  return true;
};

const updateMapZoomLevel = () => {
  const zoom = map?.getView().getZoom();
  if (typeof zoom === "number") {
    mapZoomLevel.value = zoom;
  }
};


// 解析动态配置（支持数组与对象），优先 data 字段
const configList = Array.isArray(amapData)
  ? (amapData as any[])
  : [amapData as any];
const firstCfg = (configList[0] || {}) as any;
const regionCfg = firstCfg.data || firstCfg;

// const amapKey = ref<string>(
//   localStorage.getItem("AMAP_WEBSERVICE_KEY") ||
//     (amapData as any).amapWebServiceKey ||
//     ""
// );

const amapKey = ref<string>("7405ae6dde247ee87be4e7d8021056f4");

const ensureAmapKey = () => {
  if (amapKey.value) return amapKey.value;
  const input = window.prompt(
    "请输入高德 Web 服务 Key（用于行政区边界/路径规划）",
    "",
  );
  if (!input) return "";
  amapKey.value = input.trim();
  localStorage.setItem("AMAP_WEBSERVICE_KEY", amapKey.value);
  return amapKey.value;
};

/** 最近一次警情定位路径规划结果（TMC 路线 + 指标 + ETA），供模拟调派匹配后重放车辆动画 */
let lastRoutePlanResults: AmapDrivingResult[] = [];

const routePreviewStations = ref<StationRouteAlternatives[]>([]);
const routePreviewLoading = ref(false);
const routePreviewVisible = ref(false);
let pendingRoutePlan: Promise<void> | null = null;

const getStationRouteInfo = (stationId: string) => {
  if (!routePreviewVisible.value) return null;
  const station = routePreviewStations.value.find((item) => item.stationId === stationId);
  if (!station) return null;
  const route = getSelectedRoute(station);
  return route
    ? {
        etaText: `${Math.ceil(route.etaSeconds / 60)} 分钟`,
        distanceText: `${(route.result.distanceMeters / 1000).toFixed(1)} km`,
      }
    : { etaText: '正在计算', distanceText: '正在计算' };
};

const showRouteStationPopup = (station: StationRouteAlternatives) => {
  fireManager?.hide();
  const details = fireStations.value.find((item) => String(item.id) === station.stationId);
  featureClickQuery?.showStation({
    id: station.stationId,
    name: details?.title ?? station.stationName,
    address: details?.address ?? '暂无地址',
    coordinate: olProj.fromLonLat(station.origin),
  });
};

const syncSelectedRoutePlan = () => {
  const selected = routePreviewStations.value.map(getSelectedRoute)
    .filter((route): route is RouteAlternative => !!route);
  lastRoutePlanResults = selected.map(route => route.result);
};

const selectStationRoute = (stationId: string, routeId: string) => {
  if (!routePreviewVisible.value || routePreviewLoading.value) return;
  const station = routePreviewStations.value.find(item => item.stationId === stationId);
  if (!station?.alternatives.some(route => route.id === routeId)) return;
  station.selectedId = routeId;
  routePreviewStations.value.forEach(item => {
    item.manualSelected = item.stationId === stationId;
  });
  // 特殊地图激活时不写 lastRoutePlanResults，避免污染原有调派的 resolveMockDestination/resolveStationCoordinates
  if (!specialMapActive) syncSelectedRoutePlan();
  nav?.renderRouteAlternatives(routePreviewStations.value);
  showRouteStationPopup(station);
};

/** 地址更新后逐队站请求候选；旧地址的异步结果不得覆盖新地址。 */
const loadRoutePlan = async (req: IncidentLocationRoutePlanRequest) => {
  if (!nav || !map) return;
  // 正常调派启动时退出特殊地图模式，恢复 lastRoutePlanResults 写入
  specialMapActive = false;
  specialMapMock?.clear();
  resetRouteVideoPlayback();
  clearMockTrackingTimers();
  nav.stop();
  routePreviewStations.value = [];
  routePreviewVisible.value = true;
  routePreviewLoading.value = true;
  lastRoutePlanResults = [];
  const planner = nav;
  const generation = routeVideoGeneration;
  const stations = req.stations ?? req.origins.map((coordinate, index) => ({
    id: `origin-${index}`, name: `队站 ${index + 1}`, coordinate,
  }));
  routePreviewStations.value = stations.map((station) => ({
    stationId: station.id,
    stationName: station.name,
    origin: station.coordinate,
    destination: req.destination,
    alternatives: [],
    selectedId: '',
  }));
  if (routePreviewStations.value[0]) showRouteStationPopup(routePreviewStations.value[0]);
  try {
    const groups = await Promise.all(stations.map(async (station): Promise<StationRouteAlternatives> => {
      const group: StationRouteAlternatives = {
        stationId: station.id, stationName: station.name,
        origin: station.coordinate, destination: req.destination,
        alternatives: [], selectedId: '',
      };
      try {
        group.alternatives = await planner.fetchRouteAlternatives(station.coordinate, req.destination);
        group.selectedId = group.alternatives[0].id;
      } catch (error) {
        group.error = '暂未获取到可用路线，请更新地址重试';
        console.warn('[address-updated] 队站候选路线查询失败', { stationId: station.id, error });
      }
      return group;
    }));
    if (req.seq !== incidentLocationStore.routePlanRequest?.seq || nav !== planner
      || generation !== routeVideoGeneration) return;
    routePreviewStations.value = groups;
    syncSelectedRoutePlan();
    planner.renderRouteAlternatives(groups, true);
    if (groups[0]) showRouteStationPopup(groups[0]);
  } finally {
    if (req.seq === incidentLocationStore.routePlanRequest?.seq && generation === routeVideoGeneration) {
      routePreviewLoading.value = false;
    }
  }
};

const processRoutePlan = (req: IncidentLocationRoutePlanRequest) => {
  const task = loadRoutePlan(req).catch(error => {
    console.warn('[address-updated] 路线预览失败', error);
  });
  pendingRoutePlan = task;
  void task.finally(() => { if (pendingRoutePlan === task) pendingRoutePlan = null; });
  return task;
};

/** 模拟调派"先渲染路线、再定位起点、后启动跟踪"的分步计时器，卸载时清理 */
let mockTrackingTimers: number[] = [];
let routeVideoGeneration = 0;

const resetRouteVideoPlayback = () => {
  routeVideoGeneration += 1;
  incidentVideoController?.close();
  nav?.clearRouteVideoCheckpoints();
  // 模拟调派状态依赖 generation，重置后即失效，由下一次首次调派重新建立
  mockDispatchState = null;
  // 清除模拟调派队站图标门控，恢复非调派期 WMS 整体不显示、主管图层全量
  clearMockDispatchStationIcons();
};

const playRouteVideoCheckpoint = (event: RouteVideoCheckpointEvent, generation: number) => {
  if (generation !== routeVideoGeneration || !nav || !incidentVideoController) return;
  // 同一调派周期内每个监控点全局只播放一次，首车和追加车辆使用同一状态与会话 key。
  nav.setRouteVideoCheckpointStatus(event.checkpointIndex, "playing");
  // 正常在到点前 10 秒触发，因此显示 15 秒；若首点已来不及提前，则按实际剩余时间 + 5 秒关闭。
  const durationMs = Math.max(5, event.secondsUntilArrival + 5) * 1000;
  const checkpointKey = `${generation}:${event.checkpointIndex}`;
  void incidentVideoController
    .playSingle(checkpointKey, event.lngLat[0], event.lngLat[1], durationMs)
    .then(() => {
      if (generation === routeVideoGeneration) {
        nav?.setRouteVideoCheckpointStatus(event.checkpointIndex, "played");
      }
    });
};

const clearMockTrackingTimers = () => {
  mockTrackingTimers.forEach((t) => window.clearTimeout(t));
  mockTrackingTimers = [];
};

/** 模拟调派（mock 补丁通道，§7.2 注入型）：受理席调派成功后注入车辆清单。
 *  按 stationId 去重：同一消防队站无论调派多少辆车都只规划一条路线。
 *  起点来源：stationId 命中当前主管/辖区队站时复用警情定位已规划路线的起点坐标；
 *  未命中时按 stationId 查询 gis:view_res_org_dept 获取队站坐标。
 *  所有起点确定后统一规划路线至警情点：先渲染路线并适配视图（先看到路），
 *  再缩放定位至首车起点 zoom:16，最后启动模拟跟踪。
 *
 *  二次调派：若已有活跃模拟调派（generation 未失效且终点一致），则增量处理：
 *  - 同队站车辆：在已有路线上追加一辆车，从队站起点按该路线 ETA 运行；
 *  - 新队站车辆：规划新路线并渲染上图、创建首车。 */

/** 活跃模拟调派状态：队站 ID → nav 内部 routeIndex，及对应的警情终点与 generation */
let mockDispatchState: {
  generation: number;
  destination: LngLat;
  stationToRouteIndex: Map<string, number>;
  /** 首车动画是否已启动（首次调派 startRouteVehicleAnimation 后置 true） */
  started: boolean;
  /** 首车启动前到达的二次调派排队回调，启动后按序执行 */
  onStarted?: () => void;
} | null = null;

/** 解析模拟调派的警情终点（优先级：routePlanRequest → 已规划路线终点 → mock 坐标） */
const resolveMockDestination = (): LngLat | undefined => {
  const call = pendingCallLocationStore.getActive();
  const mockDestination: LngLat | undefined = call?.id === MOCK_CALL_LOCATION_ID
    ? [call.longitude, call.latitude] : undefined;
  return (
    incidentLocationStore.routePlanRequest?.destination
    ?? (lastRoutePlanResults[0]?.fullPath?.slice(-1)[0] as LngLat | undefined)
    ?? mockDestination
  );
};

/** 按 zones 命中 → gis 队站表 → POI 兜底的顺序，解析给定车辆所属队站的起点坐标 */
const resolveStationCoordinates = async (
  vehicles: SharedDispatchVehicleMock[],
  generation: number,
): Promise<Map<string, LngLat>> => {
  const zones = incidentLocationStore.zones;
  const markerKey = incidentLocationStore.routePlanRequest?.markerKey;
  const stationIdsByRouteIndex: string[] = [];
  if (markerKey && zones[markerKey]) {
    stationIdsByRouteIndex.push(zones[markerKey].zoneId);
  }
  Object.keys(zones).forEach((key) => {
    if (markerKey && key.startsWith(`${markerKey}::`)) {
      stationIdsByRouteIndex.push(zones[key].zoneId);
    }
  });

  const stationStartCoords = new Map<string, LngLat>();
  routePreviewStations.value.forEach(station => stationStartCoords.set(station.stationId, station.origin));
  stationIdsByRouteIndex.forEach((sid, idx) => {
    const start = lastRoutePlanResults[idx]?.fullPath?.[0];
    if (sid && start && !stationStartCoords.has(sid)) stationStartCoords.set(sid, start as LngLat);
  });

  const unmatchedStationIds = [
    ...new Set(
      vehicles
        .map((v) => String(v.stationId ?? "").trim())
        .filter((sid) => sid && !stationStartCoords.has(sid)),
    ),
  ];
  if (unmatchedStationIds.length) {
    const coordMap = await queryStationCoordinatesByIds(unmatchedStationIds);
    if (generation !== routeVideoGeneration) return stationStartCoords;
    coordMap.forEach((coord, sid) => stationStartCoords.set(sid, coord));

    const key = ensureAmapKey();
    const unresolved = vehicles.filter((vehicle) => {
      const stationId = String(vehicle.stationId ?? "").trim();
      return stationId && !stationStartCoords.has(stationId) && vehicle.stationName?.trim();
    });
    if (key && unresolved.length) {
      await Promise.all(unresolved.map(async (vehicle) => {
        const stationId = String(vehicle.stationId).trim();
        if (stationStartCoords.has(stationId)) return;
        try {
          const tips = await fetchInputTips({
            key,
            keywords: vehicle.stationName!.trim(),
            city: String(regionCfg?.adcode ?? "深圳市"),
            citylimit: true,
          });
          const stationName = vehicle.stationName!.trim();
          const matchedTip = tips.find((tip) => tip.name === stationName && tip.location)
            ?? tips.find((tip) => tip.name.includes("消防") && tip.location)
            ?? tips.find((tip) => tip.location);
          const coordinate = matchedTip?.location;
          if (coordinate) stationStartCoords.set(stationId, coordinate);
        } catch (error) {
          console.warn("[dispatchMap] 队站名称坐标兜底查询失败", {
            stationId,
            stationName: vehicle.stationName,
            error,
          });
        }
      }));
    }
  }
  return stationStartCoords;
};

/**
 * 二次调派：在已有活跃模拟调派基础上增量处理车辆。
 * 同队站 → 已有路线追加车辆；新队站 → 规划新路线并创建首车。
 */
const handleSecondaryDispatch = (
  vehicles: SharedDispatchVehicleMock[],
  destination: LngLat,
  state: NonNullable<typeof mockDispatchState>,
) => {
  const doSecondary = async () => {
      if (!nav || state.generation !== routeVideoGeneration) return;
      const planner = nav;
      const sameStationCount = vehicles.filter((v) => {
        const sid = String(v.stationId ?? "").trim();
        return sid && state.stationToRouteIndex.has(sid);
      }).length;

      // 同队站：每次推送追加一辆车；本次推送中 stationId 相同的车辆信息
      // 合并到这辆车的同一个标签中，后续推送则生成新的车辆与标签。
      const sameStationGroups = new Map<string, SharedDispatchVehicleMock[]>();
      vehicles.forEach((vehicle) => {
        const sid = String(vehicle.stationId ?? "").trim();
        if (!sid || !state.stationToRouteIndex.has(sid)) return;
        const group = sameStationGroups.get(sid) ?? [];
        group.push(vehicle);
        sameStationGroups.set(sid, group);
      });
      sameStationGroups.forEach((group, sid) => {
        const routeIndex = state.stationToRouteIndex.get(sid);
        if (routeIndex !== undefined) {
          planner.addVehicleToRoute(routeIndex, group);
        }
      });

      // 新队站：解析坐标 → 规划路线 → 渲染上图 → 创建首车
      const newStationVehicles = vehicles.filter((v) => {
        const sid = String(v.stationId ?? "").trim();
        return sid && !state.stationToRouteIndex.has(sid);
      });

      if (newStationVehicles.length) {
        const stationStartCoords = await resolveStationCoordinates(
          newStationVehicles,
          state.generation,
        );
        if (state.generation !== routeVideoGeneration || nav !== planner) return;
        const uniqueNewStationIds = [
          ...new Set(
            newStationVehicles
              .map((v) => String(v.stationId!).trim())
              .filter((sid): sid is string => Boolean(sid)),
          ),
        ];
        for (const sid of uniqueNewStationIds) {
          if (!nav || state.generation !== routeVideoGeneration) return;
          const origin = stationStartCoords.get(sid) ?? destination;
          try {
            const selected = matchStationRoute(routePreviewStations.value, sid, destination);
            const { routeIndex } = await nav.addRoute(origin, destination, selected);
            state.stationToRouteIndex.set(sid, routeIndex);
            nav.setRouteVehicles(
              routeIndex,
              newStationVehicles.filter((vehicle) => String(vehicle.stationId ?? "").trim() === sid),
            );
          } catch (error) {
            console.warn("[dispatchMap] 二次调派新队站路径规划失败", { sid, error });
          }
        }
        // 新队站并入后按全部调派队站（已有+新增）刷新图标门控：
        // 主管显示 zhu.png、新支撑队站 WMS 上图；不改动上方路径规划/车辆追加逻辑
        applyMockDispatchStationIcons([...state.stationToRouteIndex.keys()]);
      }

      console.info("[dispatchMap] 二次调派处理完成", {
        sameStationCount,
        newStationCount: newStationVehicles.length,
        totalRouteCount: nav.getRouteCount(),
      });
  };

  // 首车动画尚未启动（首次调派仍在"先看到路→定位起点"阶段），
  // 排队到首车启动后再追加，避免在车辆 marker 创建前启动动画。
  if (state.started) {
    doSecondary();
  } else {
    const prev = state.onStarted;
    state.onStarted = () => {
      prev?.();
      doSecondary();
    };
  }
};

const receiveMockDispatchVehicles = async (vehicles: SharedDispatchVehicleMock[]) => {
  if (!Array.isArray(vehicles) || !vehicles.length || !nav || !map) return;
  const planner = nav;
  const mapInstance = map;
  const generation = routeVideoGeneration;
  const isCurrent = (taskGeneration: number) => nav === planner && map === mapInstance
    && taskGeneration === routeVideoGeneration;

  // 调派可能与地址规划同时到达，等待当前地址候选完成再锁定选择。
  while (pendingRoutePlan) {
    const task = pendingRoutePlan;
    await task;
    if (!isCurrent(generation)) return;
    if (pendingRoutePlan === task) break;
  }
  if (!isCurrent(generation)) return;
  const destination = resolveMockDestination();
  if (!destination) {
    console.warn("[dispatchMap] 模拟调派缺少警情点坐标，跳过");
    return;
  }

  routePreviewVisible.value = false;
  featureClickQuery?.close();
  // 判断是否为二次调派：已有活跃模拟调派、generation 未失效、终点一致
  const isSecondary =
    !!mockDispatchState
    && mockDispatchState.generation === routeVideoGeneration
    && mockDispatchState.destination[0] === destination[0]
    && mockDispatchState.destination[1] === destination[1];

  if (isSecondary && mockDispatchState) {
    handleSecondaryDispatch(vehicles, destination, mockDispatchState);
    return;
  }

  // 首次调派：立即收起所有备选，只保留当前选中的路线。
  if (routePreviewStations.value.length) {
    planner.renderRoutesOnly(routePreviewStations.value.map(getSelectedRoute)
      .filter((route): route is RouteAlternative => !!route).map(route => route.result), false);
  }
  resetRouteVideoPlayback();
  const playbackGeneration = routeVideoGeneration;

  const stationStartCoords = await resolveStationCoordinates(vehicles, playbackGeneration);
  if (!isCurrent(playbackGeneration)) return;

  const uniqueStationIds = [
    ...new Set(
      vehicles
        .map((vehicle) => String(vehicle.stationId ?? "").trim())
        .filter((stationId): stationId is string => Boolean(stationId)),
    ),
  ];
  if (!uniqueStationIds.length) {
    console.warn("[dispatchMap] 模拟调派车辆均无 stationId，跳过路径规划");
    return;
  }

  // 调派期间只显示本次参与路径规划的队站图标：
  // 命中主管判定的显示 zhu.png，其余显示支撑队站 WMS 图标
  applyMockDispatchStationIcons(uniqueStationIds);

  // origins 与去重后的消防队站严格一一对应：一个 stationId 只产生一条路线。
  const missing: string[] = [];
  const origins: LngLat[] = uniqueStationIds.map((sid) => {
    const coord = stationStartCoords.get(sid);
    if (coord) return coord;
    missing.push(sid);
    return [...destination] as LngLat;
  });
  if (missing.length) {
    console.warn("[dispatchMap] 部分队站坐标缺失，以警情点为起点占位", missing);
  }
  console.info("[dispatchMap] 模拟调派车辆起点就绪", {
    vehicleCount: vehicles.length,
    uniqueStationCount: uniqueStationIds.length,
    originCount: origins.length,
    matchedCount: uniqueStationIds.length - missing.length,
  });

  // 按 stationId 复用已选方案；未参与预览的队站才补查默认时间最短方案。
  let selectedRoutes: RouteAlternative[];
  try {
    selectedRoutes = await Promise.all(uniqueStationIds.map(async (sid, index) =>
      matchStationRoute(routePreviewStations.value, sid, destination)
        ?? (await planner.fetchRouteAlternatives(origins[index], destination))[0],
    ));
  } catch (error) {
    if (!isCurrent(playbackGeneration)) return;
    console.warn('[dispatchMap] 调派路线获取失败', error);
    ElMessage.warning('部分调派队站暂无可用路线，请重试');
    // 调派未成功：清除队站图标门控，恢复非调派期图层规则
    clearMockDispatchStationIcons();
    if (isCurrent(playbackGeneration)) {
      routePreviewVisible.value = routePreviewStations.value.length > 0;
      planner.renderRouteAlternatives(routePreviewStations.value);
    }
    return;
  }
  if (!isCurrent(playbackGeneration)) return;
  const results = selectedRoutes.map(route => route.result);
  const metrics = selectedRoutes.map(route => route.metrics);
  const etaSeconds = selectedRoutes.map(route => route.etaSeconds);

  // 第一步：先渲染路线并适配视图（fit 全路线 extent，先看到整条路）
  planner.renderRoutesOnly(results);
  planner.setRouteVideoCheckpoints(results, metrics, (event) => {
    if (isCurrent(playbackGeneration)) playRouteVideoCheckpoint(event, playbackGeneration);
  });

  // 记录活跃模拟调派状态（stationId → routeIndex，与 origins/results 顺序一致）
  mockDispatchState = {
    generation: playbackGeneration,
    destination,
    stationToRouteIndex: new Map(
      uniqueStationIds.map((sid, idx) => [sid, idx] as const),
    ),
    started: false,
  };

  // 中心点：首车路线起点（队站坐标）
  const stationLngLat = results[0]?.fullPath?.[0];

  const startTracking = () => {
    // 调派车辆消息即确认选线并启动跟踪，无需额外等待阶段消息。
      if (!isCurrent(playbackGeneration)) return;
      // 路线已上图、视野已定位，启动动画时不再 fit 全路线，避免视野跳回
      planner.startRouteVehicleAnimation(results, metrics, etaSeconds, false);
      planner.setRouteVehicleGroups(
        uniqueStationIds.map((sid) => vehicles.filter(
          (vehicle) => String(vehicle.stationId ?? "").trim() === sid,
        )),
      );
      // 首车已启动，标记活跃状态并触发排队中的二次调派
      if (mockDispatchState && mockDispatchState.generation === playbackGeneration) {
        mockDispatchState.started = true;
        const onStarted = mockDispatchState.onStarted;
        mockDispatchState.onStarted = undefined;
        onStarted?.();
      }
  };

  // 分步调度：计时器触发后即从清理列表移除，避免误清复用 ID
  const schedule = (delay: number, fn: () => void) => {
    if (!isCurrent(playbackGeneration)) return;
    const id = window.setTimeout(() => {
      mockTrackingTimers = mockTrackingTimers.filter((t) => t !== id);
      if (isCurrent(playbackGeneration)) fn();
    }, delay);
    mockTrackingTimers.push(id);
  };

  clearMockTrackingTimers();
  if (stationLngLat) {
    // 第二步：等路径视野适配完成（fit 300ms）后，再定位至首车起点 zoom:16
    schedule(350, () => {
      mapInstance.getView().animate({
        center: olProj.fromLonLat(stationLngLat),
        zoom: 16,
        duration: 400,
      });
      // 第三步：定位动画完成后启动模拟跟踪
      schedule(450, startTracking);
    });
  } else {
    schedule(350, startTracking);
  }
};

let mockSpecialMapUnsubscribers: Array<() => void> = [];

type TipItem = {
  id?: string;
  name: string;
  address?: string;
  district?: string;
  adcode?: string;
  location?: [number, number];
};

const startText = ref("");
const endText = ref("");
const startTips = ref<TipItem[]>([]);
const endTips = ref<TipItem[]>([]);
const startCoord = ref<[number, number] | null>(null);
const endCoord = ref<[number, number] | null>(null);
const activeDropdown = ref<"start" | "end" | null>(null);
const isPlanning = ref(false);

// @ts-expect-error TS6133: 模板功能已注释，变量保留备用
const canStart = computed(() => !!endCoord.value && !isPlanning.value);

const formatTipText = (t: TipItem) => {
  const parts = [t.name, t.district, t.address].filter(Boolean);
  return parts.join(" ");
};

const debounce = <T extends (...args: any[]) => void>(
  fn: T,
  waitMs: number,
) => {
  let timer: number | null = null;
  return (...args: Parameters<T>) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), waitMs);
  };
};

const loadBeijingMaskIfReady = async () => {
  if (!nav || !amapKey.value) return;
  try {
    await nav.loadMask((regionCfg?.boundaries as any) || []);
  } catch {
    return;
  }
};

const queryTips = async (type: "start" | "end") => {
  if (!nav) return;
  const key = ensureAmapKey();
  if (!key) return;
  nav.setKey(key);
  await loadBeijingMaskIfReady();

  const keywords = (type === "start" ? startText.value : endText.value).trim();
  if (!keywords) {
    if (type === "start") startTips.value = [];
    else endTips.value = [];
    return;
  }

  const tips = (await fetchInputTips({
    key,
    keywords,
    city: (regionCfg?.city as string) || "",
    citylimit: true,
  })) as TipItem[];

  const filtered = tips.filter(
    (t) =>
      t.location &&
      Number.isFinite(t.location[0]) &&
      Number.isFinite(t.location[1]),
  );

  if (type === "start") startTips.value = filtered;
  else endTips.value = filtered;
};

// @ts-expect-error TS6133: 模板功能已注释，变量保留备用
const queryStartTips = debounce(() => queryTips("start"), 220);
// @ts-expect-error TS6133: 模板功能已注释，变量保留备用
const queryEndTips = debounce(() => queryTips("end"), 220);

// @ts-expect-error TS6133: 模板功能已注释，变量保留备用
const selectTip = (type: "start" | "end", tip: TipItem) => {
  if (!tip.location || !nav) return;
  const text = formatTipText(tip);
  if (type === "start") {
    startText.value = text;
    startCoord.value = tip.location;
    nav.setEndpoint("start", tip.location);
  } else {
    endText.value = text;
    endCoord.value = tip.location;
    nav.setEndpoint("end", tip.location);
  }
  activeDropdown.value = null;
};

// @ts-expect-error TS6133: 模板功能已注释，变量保留备用
const fetchDisasterSuggestions = async (
  queryString: string,
  cb: any,
): Promise<any> => {
  const q = (queryString || "").trim();
  if (!q) {
    cb([] as any);
    return;
  }
  if (!nav) {
    cb([] as any);
    return;
  }
  const key = ensureAmapKey();
  if (!key) {
    cb([] as any);
    return;
  }
  nav.setKey(key);
  await loadBeijingMaskIfReady();

  try {
    const tips = (await fetchInputTips({
      key,
      keywords: q,
      city: (regionCfg?.city as string) || "",
      citylimit: true,
    })) as TipItem[];

    const items = tips
      .filter(
        (t) =>
          t.location &&
          Number.isFinite(t.location[0]) &&
          Number.isFinite(t.location[1]),
      )
      .map((t) => ({
        ...t,
        value: formatTipText(t),
      }));

    cb(items as any);
  } catch {
    cb([] as any);
  }
};

// @ts-expect-error TS6133: 模板功能已注释，变量保留备用
const onDisasterSelect = (item: any) => {
  const loc = item?.location as [number, number] | undefined;
  if (!loc) {
    // if (!nav) return;
    // nav.endMarker = null;
    return;
  }
  endText.value = item?.value || formatTipText(item);
  endCoord.value = loc;
  if (map) {
    map.getView().animate({
      center: olProj.fromLonLat(loc),
      duration: 300,
    });
    // 标注点
    nav?.setEndpoint("end", loc);
  }
};

// @ts-expect-error TS6133: 模板功能已注释，变量保留备用
const pickOnMap = async (type: "start" | "end") => {
  if (!nav) return;
  const key = ensureAmapKey();
  if (!key) return;
  nav.setKey(key);
  await loadBeijingMaskIfReady();

  const picked = await nav.pickAddressPoint(type);
  if (!picked) return;

  if (type === "start") {
    startText.value = picked.address;
    startCoord.value = picked.lngLat;
  } else {
    endText.value = picked.address;
    endCoord.value = picked.lngLat;

  }
  activeDropdown.value = null;
};

// @ts-expect-error TS6133: 模板功能已注释，变量保留备用
const startSimulate = async (orgs?: any[], d?: any) => {
  if (!nav || !endCoord.value) return;
  const key = ensureAmapKey();
  if (!key) return;
  nav.setKey(key);
  await loadBeijingMaskIfReady();

  isPlanning.value = true;
  try {
    let nearests: any[] = [];
    let nearest = {} as any;
    if (orgs && orgs.length) {
      nearests = orgs;
    } else {
      nearest = await getNearestFireStation(endCoord.value);
    }

    const starts: [number, number][] = nearests.length
      ? nearests
          .filter(
            (org) => Number.isFinite(org?.gisX) && Number.isFinite(org?.gisY),
          )
          .map((org) => [org.gisX, org.gisY])
      : nearest?.station
        ? [[nearest.station.lng, nearest.station.lat]]
        : [];

    if (!starts.length) {
      ElMessage.warning("未找到可用的消防站坐标");
      return;
    }

    startCoord.value = starts[0];
    startText.value = nearests.length
      ? nearests.map((org) => org.orgName || org.title).join(", ")
      : nearest.station.title;

    starts.forEach((start, index) => {
      if (index === 0) {
        nav!.setEndpoint("start", start);
      } else {
        // 如果有多个起点，可以在地图上添加多个起点marker，但由于AmapRealtimeNav只有一个startMarker，
        // 我们可以只显示第一个或者修改AmapRealtimeNav以支持多个startMarker。这里暂且只显示第一个。
      }
    });

    nav.setEndpoint("alarm", endCoord.value, {
      alarmData: alarmData.value || undefined,
    });
    alarmOverlayManager?.showAtAlarm();

    if (starts.length > 1) {
      await nav.planAndStartMulti(starts, endCoord.value, d);
    } else {
      await nav.planAndStart(starts[0], endCoord.value, d);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "路径规划失败";
    ElMessage.error(msg);
  } finally {
    isPlanning.value = false;
  }
};

const clearNav = () => {
  resetRouteVideoPlayback();
  nav?.stop();
  nav?.clearEndpoints();
  closeAlarmPopup();
  EventBus.emit("panelClose");
  startText.value = "";
  endText.value = "";
  startTips.value = [];
  endTips.value = [];
  startCoord.value = null;
  endCoord.value = null;
  activeDropdown.value = null;
};

const handleDocumentClick = (e: MouseEvent) => {
  const el = navPanelRef.value;
  if (!el) return;
  if (!el.contains(e.target as Node)) {
    activeDropdown.value = null;
  }
};

const closeFirePopup = () => {
  firePopupVisible.value = false;
  fireSelected.value = null;
  if (fireManager) fireManager.hide();
};

const closeAlarmPopup = () => {
  activeMapPopup.value = null;
  alarmData.value = null;
  alarmOverlayManager?.hide();
};

/** 警情详情固定弹窗（与地图锚定小弹窗分离，居中 Modal 展示报警/接警两段信息） */
const incidentDetailVisible = ref(false);
const incidentDetailData = ref<IncidentDetailData | null>(null);
const incidentDetailLoading = ref(false);
/** 请求序号：弹窗可连续切换警情打开，仅最新一次请求允许回写数据 */
let incidentDetailRequestId = 0;

/** 从松散业务对象中按候选字段名取第一个非空值 */
const pickField = (
  data: Record<string, any> | null | undefined,
  keys: string[],
): string | null => {
  for (const key of keys) {
    const value = data?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value);
    }
  }
  return null;
};

/** 时间值格式化为 YYYY-MM-DD HH:mm:ss，空值/非法值返回 null */
const formatDetailTime = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const text = dayjs(value as string | number | Date);
  return text.isValid() ? text.format("YYYY-MM-DD HH:mm:ss") : null;
};

/** 将当前命中点位归一化为警情详情字段（缺失字段留空，弹窗渲染 "-"） */
const buildIncidentDetailData = (popup: ActiveMapPopup): IncidentDetailData => {
  if (popup.kind === "jr") {
    const d = popup.data;
    return {
      alarmOrderNo: d.incidentId || null,
      receiveTime: formatDetailTime(d.createdAt),
      disasterGrade: d.disasterGradeLabel ?? d.disasterGrade ?? null,
      keyUnitName: d.keyUnit ?? null,
      disasterAddress: d.disasterAddress ?? null,
      burningMaterial: d.burningMaterial ?? null,
      disasterType: d.disasterTypeLabel ?? d.disasterType ?? null,
    };
  }
  if (popup.kind === "alarm") {
    const d = popup.data as Record<string, any> | null;
    return {
      alarmOrderNo: pickField(d, ["alarmOrderNo", "orderNo", "incidentId", "inquiryId"]),
      callInTime: formatDetailTime(
        pickField(d, ["callInTime", "callTime", "alarmTime"]),
      ),
      accessType: pickField(d, ["accessType", "accessTypeLabel"]),
      callerPhone: pickField(d, ["callerPhone", "callerNumber", "phone"]),
      callerName: pickField(d, ["callerName", "ownerName"]),
      installAddress: pickField(d, ["installAddress", "installedAddress"]),
      seatNo: pickField(d, ["seatNo", "seatId"]),
      receiveTime: formatDetailTime(pickField(d, ["receiveTime", "createdAt"])),
      disasterGrade: pickField(d, ["disasterGradeLabel", "disasterGrade"]),
      keyUnitName: pickField(d, ["keyUnitName", "keyUnit"]),
      supplementary: pickField(d, ["supplementary", "isSupplementary"]),
      disasterAddress: pickField(d, ["disasterAddress", "address"]),
      burningMaterial: pickField(d, ["burningMaterial"]),
      alarmFlag: pickField(d, ["alarmFlag", "alarmFlagLabel"]),
      smokeSituation: pickField(d, ["smokeSituation", "smoke"]),
      trappedCount: pickField(d, ["trappedCount", "trappedPeopleCount"]),
      administrativeDivision: pickField(d, ["administrativeDivision", "district"]),
      disasterType: pickField(d, ["disasterTypeLabel", "disasterType", "alarmType"]),
    };
  }
  // 警情定位点：当前仅灾害地址（主管队站等字段后端补全后可在此扩展）
  return {
    disasterAddress: popup.data.address ?? null,
  };
};

/** 提取当前弹窗点位的警情 ID；取不到时详情弹窗仅展示本地快照 */
const pickPopupIncidentId = (popup: ActiveMapPopup): string | null => {
  if (popup.kind === "jr") return popup.data.incidentId || null;
  if (popup.kind === "alarm") {
    return pickField(popup.data, ["incidentId", "inquiryId", "orderNo"]);
  }
  return popup.data.incidentId || null;
};

/**
 * 点击小弹窗"警情详情"按钮：先用本地快照打开弹窗，再拉取详情接口覆盖。
 * 无 incidentId 时仅展示快照；接口失败提示并保留快照内容。
 */
const openIncidentDetail = () => {
  if (!activeMapPopup.value) return;
  const incidentId = pickPopupIncidentId(activeMapPopup.value);
  incidentDetailData.value = buildIncidentDetailData(activeMapPopup.value);
  incidentDetailVisible.value = true;
  if (!incidentId?.trim()) return;
  const requestId = ++incidentDetailRequestId;
  incidentDetailLoading.value = true;
  fetchIncidentDetail<IncidentDetailResponseData>(incidentId)
    .then((detail) => {
      if (requestId !== incidentDetailRequestId) return;
      incidentDetailData.value = toIncidentDetailData(detail);
    })
    .catch((error) => {
      console.warn("[incident-detail] 拉取警情详情失败", { incidentId, error });
      if (requestId === incidentDetailRequestId) {
        ElMessage.error("警情详情获取失败，当前展示点位已知信息");
      }
    })
    .finally(() => {
      if (requestId === incidentDetailRequestId) incidentDetailLoading.value = false;
    });
};

const initMap = () => {
  const googleLayer = GOOGLE_LAYER;
  const vectorLayer = VECTOR_LAYER();

  const overviewMapControl = new OverviewMap({
    layers: [overviewLayer],
    collapsed: false,
    collapsible: true,
  });

  // @ts-expect-error TS6133: 模板功能已注释，变量保留备用
  const keyboardPan = new KeyboardPan({
    pixelDelta: 100,
    duration: 200,
  });

  const mapInstance = markRaw(new OLMap({
    layers: [baseLayer, googleLayer, vectorLayer],
    target: props.mapId,
    view: new View({
      center: olProj.fromLonLat(CENTER),
      zoom: ZOOM.INIT,
      minZoom: mapConfigStore.config.feature.minZoom,
      maxZoom: mapConfigStore.config.feature.maxZoom,
    }),
  }));
  map = mapInstance;
  applyFeatureZoomLimits();
  emit("setMap", mapInstance);
  callLocationGenericController = new GenericController(mapInstance);
  callLocationController = businessRuntime.business.call;
  updateMapZoomLevel();
  if (!mapInstance) return;

  zoomLevelChangeKey = mapInstance
    .getView()
    .on("change:resolution", updateMapZoomLevel);

  featureClickQuery = new FeatureClickQuery(mapInstance, getStationRouteInfo);
  featureClickQuery.activate();

  // 灾情现场视频弹窗控制器（绑定到当前地图实例）
  incidentVideoController = new IncidentVideoOverlayController(mapInstance);

  // 添加键盘事件监听（仅在桌面端）
  if (!isMobile.value) {
    document.addEventListener("keydown", function (event) {
      console.log("Key pressed: ", event.key);
    });
  }

  // 添加地图控件，根据设备类型调整
  map.addControl(overviewMapControl);

  if (!isMobile.value) {
    // map.addControl(new ZoomSlider());
  }

  map.addControl(new ScaleLine({ units: readScaleLineUnit() }));
  // map.addControl(new FullScreen());
  // map.addControl(new ZoomToExtent({ extent: EXTENT }));

  // 打印控件（仅在桌面端）
  if (!isMobile.value) {
    const printControl = new PrintDialog({
      lang: "zh",
    });
    printControl.setSize("A4");
    // map.addControl(printControl);

    printControl.on(["print", "error"], (e: any) => {
      if (e.image) {
        const uuid = uuidv4().replace(/-/g, "");
        if (e.pdf) {
          const pdf = new jsPDF({
            orientation: e.print.orientation,
            unit: e.print.unit,
            format: e.print.size,
          });
          pdf.addImage(
            e.image,
            "JPEG",
            e.print.position[0],
            e.print.position[0],
            e.print.imageWidth,
            e.print.imageHeight,
          );
          pdf.save(e.print.legend ? "legend.pdf" : `openlayers_${uuid}.pdf`);
        } else {
          e.canvas.toBlob(
            (blob: any) => {
              const name =
                (e.print.legend ? "legend." : `map_${uuid}.`) +
                e.imageType.replace("image/", "");
              saveAs(blob, name);
            },
            e.imageType,
            e.quality,
          );
        }
      } else {
        console.warn("No canvas to export");
      }
    });
  }

  nav = new AmapRealtimeNav(map, {
    amapKey: amapKey.value,
    xzKeywords: (regionCfg?.adcode as string) || "",
    vehicleIconSrc: carImg,
  });
  (window as any).nav = nav;

  // 特殊地图模拟实例（受理席 mock 通道触发渲染/车辆模拟），需在 nav 初始化后创建
  specialMapMock = createSpecialMapMock(mapInstance, nav!);

  // 警情二次定位实例（受理席 mock 通道传入警情 id，激活地图选点确认后更新坐标），需 nav 做逆地址解析
  incidentRelocate = createIncidentRelocate(mapInstance, nav!);

  if (amapKey.value) {
    nav.loadMask((regionCfg?.boundaries as any) || []).catch(() => {});
  }

  if (firePopupRef.value) {
    fireManager = mountFireStations({
      map,
      stations: [],
      iconSrc: fireImg,
      popupElement: firePopupRef.value,
      visible: dispatchCheckedIds.value.includes(TEMP_FRONTEND_LAYER_IDS.STATION),
      onSelect: (data) => {
        fireSelected.value = data;
        firePopupVisible.value = true;
      },
      onClose: () => {
        firePopupVisible.value = false;
        fireSelected.value = null;
      },
    });
    // 队站来自 WFS gis:view_res_org_dept（EPSG:4326），异步到达后填充图层
    // （主管队站由独立 zhu.png 图层显示，填充时排除主管 id）
    void loadFireStations()
      .then((list) => {
        allFireStations = list;
        syncFireManagerStations();
        const openId = featureClickQuery?.getOpenStationId();
        const openStation = routePreviewStations.value.find((station) => station.stationId === openId);
        if (openStation) showRouteStationPopup(openStation);
      })
      .catch(() => {});
  }

  if (carPopupRef.value) {
    carManager = mountCarFeatures({
      map,
      popupElement: carPopupRef.value,
      visible: dispatchCheckedIds.value.includes(TEMP_FRONTEND_LAYER_IDS.ONLINE_CAR),
      onSelect: (data) => {
        carSelected.value = data;
        carPopupVisible.value = true;
      },
      onClose: () => {
        carPopupVisible.value = false;
        carSelected.value = null;
      },
    });
  }

  // incomingCallManager = mountIncomingCallFeatures({
  //   map,
  //   visible: dispatchCheckedIds.value.includes(TEMP_FRONTEND_LAYER_IDS.INCOMING_CALL),
  // });

  if (alarmPopupRef.value && nav) {
    // 弹窗 overlay 由本页统一 singleclick 处理器驱动（attachClick:false），
    // 警情规划/今日灾情/警情定位三类点位共用这一个 overlay 与弹窗 DOM
    alarmOverlayManager = nav.mountAlarmOverlay({
      element: alarmPopupRef.value,
      attachClick: false,
      onUpdate: (data) => {
        alarmData.value = data;
        // showAtAlarm/hide 时同步统一弹窗（data 为 null 关闭）
        activeMapPopup.value = data ? { kind: 'alarm', data } : null;
      },
    });
    unifiedPopupClickKey = map.on("singleclick", (evt) => {
      let next: ActiveMapPopup | null = null;
      // forEachFeatureAtPixel 按图层 zIndex 从高到低遍历，
      // 警情定位点(1003.5)在调派终点(1002.8)之上，重合时优先响应定位点
      map!.forEachFeatureAtPixel(
        evt.pixel,
        (feature, layer) => {
          const layerClass = layer?.getClassName();
          const itemData = feature.get("data");
          if (
            layerClass === INCIDENT_LOCATION_LAYER_CLASS &&
            itemData
          ) {
            next = {
              kind: "incident",
              data: itemData as IncidentLocationMarker,
            };
            return true;
          }
          if (layerClass === JR_ALARM_LAYER_CLASS && itemData) {
            next = { kind: "jr", data: itemData as JRAlarmData };
            return true;
          }
          // nav 警情规划终点：feature 上挂 alarmData（键存在即该点）
          const alarm = feature.get("alarmData");
          if (alarm !== undefined) {
            next = { kind: "alarm", data: alarm };
            return true;
          }
          return false;
        },
        { hitTolerance: 6 },
      );
      activeMapPopup.value = next;
      alarmOverlayManager?.overlay.setPosition(
        next ? evt.coordinate : undefined,
      );
    });
  }

  jrAlarmManager = mountJRAlarmLayer({
    map,
    alarms: [],
    // 弹窗统一由 alarmPopupRef + 统一点击处理器承载，本图层只负责渲染
    visible: dispatchCheckedIds.value.includes(
      TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER,
    ),
  });

  // 画像地址变更（警情定位）点位：初始数据取自 store，后续由 watcher 增量同步
  if (map) {
    // 刷新恢复门控：dispatch / dispatchTrack 阶段（/dispatch1 且业务状态为
    // 调派或调派跟踪）允许持久化点位上图；其他阶段清空缓存，避免旧警情残留。
    // dispatchTrack 需保留警情定位数据以供模拟调派跟踪复用路线起点/终点。
    // 终态警情只执行车辆历史轨迹：先判定，避免恢复持久化点位并重查主管队站/周边资源/路径。
    // 共享态 currentAlarm 依赖受理席写入 localStorage，可能滞后于 WS 推送的终态，
    // 因此刷新判定以持久化的终态标记为最高优先级，不再要求 currentAlarm 匹配。
    const stage = getSharedMapStage(userStore.rawState, userStore.MapMode);
    const terminalIncident = isTerminalIncidentState(vehicleTrackStore.terminalState);
    if (terminalIncident || (stage !== "dispatch" && stage !== "dispatchTrack")) {
      incidentLocationStore.clearAll();
    }

    incidentLocationManager = mountPointLayer<IncidentLocationMarker>({
      map,
      items: Object.values(incidentLocationStore.markers),
      visible: true,
      className: INCIDENT_LOCATION_LAYER_CLASS,
      zIndex: INCIDENT_LOCATION_LAYER_ZINDEX,
      // 弹窗统一由 alarmPopupRef + 统一点击处理器承载，本图层只负责渲染
      keyGetter: (entry) => entry.key,
      coordinateGetter: (entry) => [entry.lng, entry.lat],
      styleGetter: () =>
        getStyle("alarm", { iconSrc: MAP_ICON_SRC.alarm, scale: 0.9 }),
    });
    renderedMarkers = new globalThis.Map(
      Object.values(incidentLocationStore.markers).map((entry) => [
        entry.key,
        entry,
      ]),
    );

    // 主管队站独立图标图层（zhu.png）：初始数据取 store.primaryStations，后续由 watcher 增量同步
    primaryStationManager = mountPointLayer<IncidentPrimaryStation>({
      map,
      items: Object.values(incidentLocationStore.primaryStations),
      visible: true,
      className: INCIDENT_PRIMARY_STATION_LAYER_CLASS,
      zIndex: MAP_LAYER_Z_INDEX.incident,
      keyGetter: (station) => station.key,
      coordinateGetter: (station) => [station.lng, station.lat],
      styleGetter: () =>
        getStyle("icon", {
          iconSrc: MAP_ICON_SRC.primaryStation,
          scale: 0.9,
          anchor: [0.5, 0.5],
        }),
    });
    renderedPrimaryStations = new globalThis.Map(
      Object.values(incidentLocationStore.primaryStations).map((station) => [
        station.key,
        station,
      ]),
    );

    /* 辖区图层已禁用（主管/支撑辖区不再上图）
    incidentZoneManager = mountPolygonLayer<IncidentLocationZone>({
      map,
      items: Object.values(incidentLocationStore.zones),
      visible: true,
      className: INCIDENT_LOCATION_ZONE_LAYER_CLASS,
      zIndex: INCIDENT_LOCATION_ZONE_LAYER_ZINDEX,
      keyGetter: (zone) => zone.key,
      geometryGetter: (zone) => zone.geometry,
      styleGetter: (zone) =>
        zone.role === "primary"
          ? new Style({
              fill: new Fill({ color: "rgba(220, 38, 38, 0.18)" }),
              stroke: new Stroke({ color: "#dc2626", width: 3 }),
            })
          : new Style({
              fill: new Fill({ color: "rgba(37, 99, 235, 0.14)" }),
              stroke: new Stroke({ color: "#2563eb", width: 2.5 }),
            }),
    });
    renderedZones = new globalThis.Map(
      Object.values(incidentLocationStore.zones).map((zone) => [
        zone.key,
        zone,
      ]),
    );
    */

    // 消息先于地图挂载到达：消费积压的路径规划请求
    const pendingRoute = incidentLocationStore.routePlanRequest;
    if (pendingRoute) {
      void processRoutePlan(pendingRoute);
    }

    // 消息先于地图挂载到达：消费积压的定位请求
    const pending = incidentLocationStore.focusRequest;
    if (pending) {
      incidentLocationStore.consumeFocus(pending.seq);
      focusMapView(map, pending);
    }

    // 刷新恢复：持久化点位已直接上图，异步重建辖区面/队站过滤/路径规划等派生数据
    // 终态警情不重建，只由车辆历史轨迹链路接管
    if (!terminalIncident) incidentLocationStore.restoreOnMapMount();
  }

  syncLayers(dispatchCheckedIds.value);

  // 消息先于地图挂载到达时，按共享队站 store 现状对消防站 WMS 图层补做过滤
  syncStationLayerOverride();

  // 消息先于地图挂载到达时，按周边资源范围圈 store 现状对消防栓/重点单位 WMS 图层补做过滤
  syncResourceLayersOverride();

  const attachment = createBusinessMapPort(callLocationGenericController!);
  detachBusinessMap = businessRuntime.attachMap(attachment.port, {
    kind: 'dispatch',
    dispose: attachment.dispose,
    mock: {
      render: () => {
        mockMapGeneration += 1;
        specialMapActive = true;
        lastRoutePlanResults = [];
        callLocationController?.clearLocateCalls();
        incidentLocationStore.clearAll();
        clearNav();
        carManager?.setVisible(false);
        fireManager?.setVisible(false);
        incidentLocationManager?.setVisible(false);
        primaryStationManager?.setVisible(false);
        specialMapMock?.clear();
        routePreviewStations.value = [];
        routePreviewVisible.value = false;
      },
      disasterSite: async () => {
        const owner = specialMapMock;
        const generation = mockMapGeneration;
        if (!owner) return;
        callLocationController?.clearLocateCalls();
        const stations = await owner.render();
        if (owner !== specialMapMock || generation !== mockMapGeneration) return;
        routePreviewStations.value = stations;
        routePreviewLoading.value = false;
        routePreviewVisible.value = true;
      },
      simulate: async () => {
        const owner = specialMapMock;
        const generation = mockMapGeneration;
        routePreviewVisible.value = false;
        await owner?.simulate();
        if (owner !== specialMapMock || generation !== mockMapGeneration) return;
        routePreviewVisible.value = false;
      },
      clear: () => {
        mockMapGeneration += 1;
        resetRouteVideoPlayback();
        clearMockTrackingTimers();
        specialMapActive = false;
        specialMapMock?.clear();
        routePreviewStations.value = [];
        routePreviewVisible.value = false;
      },
      dispatchVehicles: async data => {
        if (!Array.isArray(data)) return;
        await receiveMockDispatchVehicles(data as SharedDispatchVehicleMock[]);
      },
    },
  });

  trafficTool = new TrafficTools(map);
  trafficTool.setVisible(baseSourceStore.trafficVisible);
};

/**
 * 清理资源
 */
const cleanup = () => {
  mockMapGeneration += 1;
  vehicleTrackRenderer?.dispose();
  vehicleTrackRenderer = null;
  detachBusinessMap?.();
  detachBusinessMap = null;
  resetRouteVideoPlayback();
  if (zoomLevelChangeKey) {
    unByKey(zoomLevelChangeKey);
    zoomLevelChangeKey = null;
  }
  if (featureClickQuery) {
    featureClickQuery.destroy();
    featureClickQuery = null;
  }
  if (unifiedPopupClickKey) {
    unByKey(unifiedPopupClickKey);
    unifiedPopupClickKey = null;
  }
  activeMapPopup.value = null;
  alarmOverlayManager?.destroy();
  alarmOverlayManager = null;
  jrAlarmManager?.destroy();
  jrAlarmManager = null;
  incidentLocationManager?.destroy();
  incidentLocationManager = null;
  // 清除周边资源范围圈独立矢量图层 + Modify 交互
  if (resourceCircleModify) {
    map?.removeInteraction(resourceCircleModify);
    resourceCircleModify = null;
  }
  if (resourceCircleLayer) {
    map?.removeLayer(resourceCircleLayer);
    resourceCircleLayer = null;
  }
  resourceCircleDragging = false;
  callLocationController = null;
  callLocationGenericController = null;
  renderedMarkers.clear();
  primaryStationManager?.destroy();
  primaryStationManager = null;
  renderedPrimaryStations.clear();
  /* 辖区图层已禁用，无需 destroy/clear
  incidentZoneManager?.destroy();
  incidentZoneManager = null;
  */
  incidentVideoController?.destroy();
  incidentVideoController = null;
  /* renderedZones.clear(); */
  carManager?.destroy();
  carManager = null;
  // incomingCallManager?.destroy();
  // incomingCallManager = null;
  fireManager?.destroy();
  fireManager = null;
  if (nav) {
    nav.destroy();
    nav = null;
  }
  if (trafficTool) {
    trafficTool.remove();
    trafficTool = null;
  }
  if (map) {
    wmsLayerMap.forEach((layer) => map?.removeLayer(layer));
    wmsLayerMap.clear();
    // source 由 useBaseMapLayer 全局缓存池共享，卸载时只销毁图层，不 dispose 共享 source
    overviewLayer.dispose();
    baseLayer.dispose();
    map.dispose();
    map = null;
  }
  // 快照随地图实例失效；下次挂载由 initMap 按 store 现状重建
  forcedStationLayerSnapshot = null;
};

// tabs 模型
const tabsStore = useTabsStore();
// @ts-expect-error TS6133: 模板功能已注释，变量保留备用
const { activeTab } = storeToRefs(tabsStore);
// @ts-expect-error TS6133: 模板功能已注释，变量保留备用
const tabs = ref([
  {
    label: "路径规划",
    name: 1,
    icon: ljImg,
  },
  {
    label: "现场态势",
    name: 2,
    icon: xcImg,
  },
  {
    label: "建筑剖面",
    name: 3,
    icon: zjImg,
  },
]);

/**
 * 车辆历史轨迹：终态警情到达后按调派车辆查询外部定位服务，
 * 面板显隐由 useVehicleTrackStore 驱动，地图侧只负责轨迹上图。
 */
const vehicleTrackStore = useVehicleTrackStore();
const vehicleTrackLogger = createLogger('vehicle-track');
let vehicleTrackRenderer: VehicleTrackRenderer | null = null;
let vehicleTrackUnsubscribe: (() => void) | null = null;
/** 查询序号，用于丢弃过期响应（警情快速切换时） */
let vehicleTrackRequestSeq = 0;

/** 共享态 currentAlarm.lifecycleStage（受理席写入，用于识别 closed 的历史轨迹链路） */
const readCurrentLifecycleStage = () => {
  const value = userStore.currentAlarm?.lifecycleStage;
  return typeof value === "string" ? value.trim().toLowerCase() : "";
};

const ensureVehicleTrackRenderer = () => {
  if (!map) return null;
  if (!vehicleTrackRenderer) vehicleTrackRenderer = createVehicleTrackRenderer(map);
  return vehicleTrackRenderer;
};

const syncVehicleTrackLayer = (fit: boolean) => {
  const renderer = ensureVehicleTrackRenderer();
  if (!renderer) return;
  if (!vehicleTrackStore.panelVisible || !vehicleTrackStore.points.length) {
    renderer.clear();
    return;
  }
  renderer.render(vehicleTrackStore.points, vehicleTrackStore.cursor, { fit });
};

/**
 * 终态警情上图前清理原有警情产物：路径规划、路线预览面板、模拟调派状态、
 * 警情点位与主管队站/周边资源声明。终态地图只保留车辆历史轨迹。
 */
const clearOriginalIncidentArtifacts = () => {
  resetRouteVideoPlayback();
  clearMockTrackingTimers();
  nav?.stop();
  nav?.clearRoutes();
  routePreviewVisible.value = false;
  routePreviewLoading.value = false;
  routePreviewStations.value = [];
  lastRoutePlanResults = [];
  pendingRoutePlan = null;
  featureClickQuery?.close();
  incidentLocationStore.clearAll();
};

/**
 * 按警情查询调派车辆与历史轨迹：查不到车辆或轨迹时按钮仍保留，仅提示；
 * 多车辆场景默认取最新批次第一辆车，后续按车辆所属消防站及车辆发车时间扩展。
 */
const loadVehicleTrack = async (incidentId: string, options?: { openPanel?: boolean }) => {
  const seq = ++vehicleTrackRequestSeq;
  vehicleTrackStore.loading = true;
  try {
    const detail = await fetchIncidentDetail<IncidentDetailResponseData>(incidentId);
    if (seq !== vehicleTrackRequestSeq) return;
    const vehicleId = extractLatestBatchFirstVehicleId(detail);
    vehicleTrackLogger.info('警情详情车辆', { incidentId, vehicleId });
    if (!vehicleId) {
      vehicleTrackStore.markUnavailable(incidentId);
      vehicleTrackLogger.info('按钮已显示但暂无调派车辆', { incidentId });
      ElMessage.warning('该警情暂无调派车辆，请重新选择');
      return;
    }
    // 查询车辆历史轨迹 '8aee87a783f84e21018432fe5e814311'
    const result = await queryCarHistoryTrack(vehicleId);
    if (seq !== vehicleTrackRequestSeq) return;
    const points = (Array.isArray(result) ? result : [])
      .filter((point) => Number.isFinite(point?.longitude) && Number.isFinite(point?.latitude))
      .sort((a, b) => String(a.gpsTime).localeCompare(String(b.gpsTime)));
    vehicleTrackLogger.info('历史轨迹查询结果', {
      incidentId,
      vehicleId,
      count: points.length,
    });
    if (!points.length) {
      vehicleTrackStore.markUnavailable(incidentId);
      vehicleTrackLogger.info('按钮已显示但暂无轨迹数据', { incidentId, vehicleId });
      ElMessage.warning('未查询到历史轨迹数据，请重新选择');
      return;
    }
    vehicleTrackStore.setTrack(points, vehicleId, incidentId, options);
  } catch (error) {
    if (seq !== vehicleTrackRequestSeq) return;
    vehicleTrackLogger.error('车辆历史轨迹查询失败', error);
    vehicleTrackStore.markUnavailable(incidentId);
    ElMessage.warning('未查询到历史轨迹数据，请重新选择');
  }
};

/** 终态警情：清理原有警情产物并切换到历史轨迹，重复触发时沿用已加载轨迹。 */
const beginVehicleTrack = (incidentId: string) => {
  // 仅当前警情终态才清理图上产物，避免其他警情的终态消息误清当前渲染
  const currentIncidentId = String(userStore.currentAlarm?.incidentId ?? "").trim();
  if (!currentIncidentId || currentIncidentId === incidentId) clearOriginalIncidentArtifacts();
  // 同一警情连续终态（到达→作业完成→返回…）保留已加载轨迹，避免反复清空
  if (vehicleTrackStore.incidentId === incidentId && vehicleTrackStore.points.length) {
    vehicleTrackLogger.info("同一警情终态重复到达，沿用已有轨迹", { incidentId });
    return;
  }
  if (vehicleTrackStore.incidentId === incidentId && vehicleTrackStore.loading) return;
  // 先让「车辆GPS」按钮出现，再异步查询轨迹；查询成功即打开面板并停在 0 点
  vehicleTrackStore.markUnavailable(incidentId);
  void loadVehicleTrack(incidentId, { openPanel: true });
};

/** 警情状态变更：终态转为历史轨迹并清理原有警情产物，非终态换警情时清空上一条轨迹。 */
const handleAlarmStateChanged = (envelope: { data?: unknown }) => {
  const data = envelope?.data as { incidentId?: string; newState?: string } | undefined;
  vehicleTrackLogger.info('收到 ALARM_INCIDENT/STATE_CHANGED', data);
  const incidentId = String(data?.incidentId ?? '').trim();
  const newState = String(data?.newState ?? '').trim().toUpperCase();
  if (!incidentId) return;
  if (!isTerminalIncidentState(newState)) {
    if (vehicleTrackStore.terminalIncidentId && vehicleTrackStore.terminalIncidentId !== incidentId)
      vehicleTrackStore.clearTerminal();
    if (vehicleTrackStore.incidentId && vehicleTrackStore.incidentId !== incidentId) {
      vehicleTrackRequestSeq += 1;
      vehicleTrackStore.reset();
      vehicleTrackRenderer?.clear();
    }
    return;
  }
  vehicleTrackStore.markTerminal(incidentId, newState);
  beginVehicleTrack(incidentId);
};

// 无轨迹时点击按钮：按当前警情重新查询，成功后自动打开面板
watch(
  () => vehicleTrackStore.reloadToken,
  () => {
    const incidentId = vehicleTrackStore.incidentId;
    if (!incidentId) return;
    vehicleTrackLogger.info('按钮点击重新查询', { incidentId });
    void loadVehicleTrack(incidentId, { openPanel: true });
  },
);

watch(
  () => vehicleTrackStore.panelVisible,
  (visible) => {
    if (!visible) {
      vehicleTrackRenderer?.clear();
      return;
    }
    syncVehicleTrackLayer(true);
  },
);

watch(
  () => vehicleTrackStore.cursor,
  (cursor) => {
    if (!vehicleTrackStore.panelVisible) return;
    vehicleTrackRenderer?.setCursor(cursor);
  },
);

// 共享态 currentAlarm 变为 closed（可能没有 WS 终态消息）：同步终态标记并切换到历史轨迹
watch(
  () =>
    JSON.stringify([
      String(userStore.currentAlarm?.incidentId ?? "").trim(),
      readCurrentLifecycleStage(),
    ]),
  (key) => {
    const [incidentId, lifecycleStage] = JSON.parse(key) as [string, string];
    if (!incidentId) return;
    // 监听新警情：删除旧警情的轨迹缓存与终态标记，避免旧标记拦截新警情的警情上图
    const staleTrackIds = [
      String(vehicleTrackStore.terminalIncidentId ?? "").trim(),
      String(vehicleTrackStore.incidentId ?? "").trim(),
    ].filter(Boolean);
    if (staleTrackIds.some((id) => id !== incidentId)) {
      vehicleTrackRequestSeq += 1;
      vehicleTrackStore.clearTerminal();
      vehicleTrackStore.reset();
    }
    if (lifecycleStage === "closed") {
      vehicleTrackStore.markTerminal(incidentId, lifecycleStage);
      beginVehicleTrack(incidentId);
      return;
    }
    // 共享态删除/未写 lifecycleStage：撤销 closed 同步出的终态标记与轨迹，避免刷新后继续回放
    if (
      !lifecycleStage &&
      vehicleTrackStore.terminalIncidentId === incidentId &&
      vehicleTrackStore.terminalState === "CLOSED"
    ) {
      vehicleTrackRequestSeq += 1;
      vehicleTrackStore.clearTerminal();
      vehicleTrackStore.reset();
    }
  },
  { flush: "sync" },
);

onMounted(() => {
  nextTick(() => {
    initMap();
    // 共享态已是 closed（无 WS 终态消息 / 首次打开）：同步终态标记后直接回放历史轨迹
    const sharedIncidentId = String(userStore.currentAlarm?.incidentId ?? "").trim();
    const sharedLifecycleStage = readCurrentLifecycleStage();
    // 监听新警情：共享态警情与残留的轨迹警情不一致时，先删除旧警情缓存
    const staleTrackIds = [
      String(vehicleTrackStore.terminalIncidentId ?? "").trim(),
      String(vehicleTrackStore.incidentId ?? "").trim(),
    ].filter(Boolean);
    if (sharedIncidentId && staleTrackIds.some((id) => id !== sharedIncidentId)) {
      vehicleTrackStore.clearTerminal();
      vehicleTrackStore.reset();
    }
    if (sharedIncidentId && sharedLifecycleStage === "closed") {
      vehicleTrackStore.markTerminal(sharedIncidentId, sharedLifecycleStage);
      beginVehicleTrack(sharedIncidentId);
      return;
    }
    // 共享态已撤销结案标记（删除 lifecycleStage）：先清残留标记，避免下面按终态回放旧轨迹
    if (
      sharedIncidentId &&
      !sharedLifecycleStage &&
      vehicleTrackStore.terminalIncidentId === sharedIncidentId &&
      vehicleTrackStore.terminalState === "CLOSED"
    ) {
      vehicleTrackStore.clearTerminal();
      vehicleTrackStore.reset();
    }
    // 刷新后按持久化终态标记判定（优先于可能滞后的共享态）：清理原有上图产物后直接回放历史轨迹
    const terminalIncidentId = String(vehicleTrackStore.terminalIncidentId ?? "").trim();
    if (!terminalIncidentId || !isTerminalIncidentState(vehicleTrackStore.terminalState)) return;
    clearOriginalIncidentArtifacts();
    vehicleTrackStore.markUnavailable(terminalIncidentId);
    void loadVehicleTrack(terminalIncidentId, { openPanel: true });
  });
  document.addEventListener("click", handleDocumentClick, true);
  // 受理席警情二次定位：传入警情 id + BroadcastChannel 关联标识，激活地图选点交互
  mockSpecialMapUnsubscribers.push(
    messageStore.subscribe(MESSAGE_EVENT_KEY.MOCK_INCIDENT_RELOCATE, (envelope) => {
      const d = envelope.data as { incidentId?: string; ownerId?: string; requestId?: string }
      if (!d?.incidentId || !incidentRelocate) return
      const token = d.ownerId && d.requestId ? { ownerId: d.ownerId, requestId: d.requestId } : undefined
      incidentRelocate.start(d.incidentId, token)
    }),
  );
  // 车辆历史轨迹：终态消息触发查询，订阅随地图实例销毁
  vehicleTrackUnsubscribe = messageStore.subscribe(
    MESSAGE_EVENT_KEY.ALARM_INCIDENT_STATE_CHANGED,
    (envelope) => handleAlarmStateChanged(envelope as { data?: unknown }),
  );

});

onUnmounted(() => {
  mockSpecialMapUnsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
  vehicleTrackUnsubscribe?.();
  vehicleTrackUnsubscribe = null;
  vehicleTrackStore.reset();
  specialMapActive = false;
  specialMapMock?.clear();
  specialMapMock = null;
  incidentRelocate?.dispose();
  incidentRelocate = null;
  clearMockTrackingTimers();
  cleanup();
  document.removeEventListener("click", handleDocumentClick, true);
});

// const ThreejsViewerRegion = defineAsyncComponent(
//   () => import("@/components/BIM/ThreejsViewerRegion.vue"),
// );
// const ThreejsViewerBuilding = defineAsyncComponent(
//   () => import("@/components/BIM/ThreejsViewerBuilding.vue"),
// );

// const activeThreeView = computed(() => {
//   if (activeTab.value === 2) return ThreejsViewerRegion;
//   if (activeTab.value === 3) return ThreejsViewerBuilding;
//   return null;
// });
</script>

<template>
  <!-- v-show="activeTab === 1" -->
  <div :id="props.mapId" :class="{ 'is-mobile': isMobile }" tabindex="2">
    <ZoomLevelControl :zoom="mapZoomLevel" />

    <!-- 队站弹窗 -->
    <div ref="firePopupRef" class="fire_popup" v-show="firePopupVisible">
      <div class="fire_popup_header">
        <div class="fire_popup_title">{{ fireSelected?.title }}</div>
        <button class="fire_popup_close" type="button" @click="closeFirePopup">×</button>
      </div>
      <div class="fire_popup_body">
        <div v-if="fireSelected?.address" class="fire_popup_row">
          <span class="fire_popup_k">地址</span>
          <span class="fire_popup_v">{{ fireSelected.address }}</span>
        </div>
        <div v-if="fireSelected?.phone" class="fire_popup_row">
          <span class="fire_popup_k">电话</span>
          <span class="fire_popup_v">{{ fireSelected.phone }}</span>
        </div>
        <div class="fire_popup_row">
          <span class="fire_popup_k">坐标</span>
          <span class="fire_popup_v"> {{ fireSelected?.lng }}, {{ fireSelected?.lat }} </span>
        </div>
      </div>
    </div>

    <!-- 业务点位统一弹窗：警情规划/今日灾情/警情定位共用 -->
    <div ref="alarmPopupRef">
      <AlarmDetailPopup
        :visible="alarmPopupVisible"
        :title="alarmPopupTitle"
        :rows="alarmPopupRows"
        detail-button-text="警情详情"
        @close="closeAlarmPopup"
        @detail="openIncidentDetail"
      />
    </div>

    <!-- 警情详情固定弹窗（居中 Modal，小弹窗点"警情详情"打开） -->
    <IncidentDetailDialog v-model="incidentDetailVisible" :data="incidentDetailData" :loading="incidentDetailLoading" />

    <!-- 在线车辆弹窗 -->
    <div ref="carPopupRef" class="car_popup" v-show="carPopupVisible">
      <div class="car_popup_header">
        <div class="car_popup_title">{{ carSelected?.plateNo }} - {{ carSelected?.team }}</div>
        <button class="car_popup_close" type="button" @click="carPopupVisible = false">×</button>
      </div>
      <div class="car_popup_body">
        <div class="car_popup_row">
          <span class="car_popup_k">车辆类型</span>
          <span class="car_popup_v">{{ carTypeLabel(carSelected?.carType) }}</span>
        </div>
        <div class="car_popup_row">
          <span class="car_popup_k">状态</span>
          <span class="car_popup_v">{{ carStatusLabel(carSelected?.status) }}</span>
        </div>
        <div v-if="carSelected?.driver" class="car_popup_row">
          <span class="car_popup_k">司机</span>
          <span class="car_popup_v">{{ carSelected.driver }}</span>
        </div>
        <div v-if="carSelected?.phone" class="car_popup_row">
          <span class="car_popup_k">电话</span>
          <span class="car_popup_v">{{ carSelected.phone }}</span>
        </div>
        <div class="car_popup_row">
          <span class="car_popup_k">速度</span>
          <span class="car_popup_v">{{ carSelected?.speed ?? 0 }} km/h</span>
        </div>
        <div class="car_popup_row">
          <span class="car_popup_k">航向</span>
          <span class="car_popup_v">{{ carSelected?.heading ?? 0 }}°</span>
        </div>
        <div class="car_popup_row">
          <span class="car_popup_k">坐标</span>
          <span class="car_popup_v">
            {{ formatCoordinateText(carSelected?.lng, carSelected?.lat) }}
          </span>
        </div>
        <div class="car_popup_row">
          <span class="car_popup_k">更新时间</span>
          <span class="car_popup_v">{{ carSelected?.updatedAt }}</span>
        </div>
      </div>
    </div>

    <DispatchRoutePreview
      v-if="routePreviewVisible"
      :stations="routePreviewStations"
      :loading="routePreviewLoading"
      @select="selectStationRoute"
    />

    <!-- 调派路径规划 -->
    <!-- <div ref="navPanelRef" class="nav_panel_new">
      <div class="nav_row">
        <el-button class="nav_pick" type="primary" @click="pickOnMap('end')">
          选点
        </el-button>

        <div class="nav_field">
          <el-autocomplete
            v-model="endText"
            class="nav_input_ep"
            placeholder="输入查询灾情位置"
            :fetch-suggestions="fetchDisasterSuggestions"
            :trigger-on-focus="false"
            clearable
            @select="onDisasterSelect"
          />
        </div>

        <div class="nav_actions">
          <el-button
            type="primary"
            :disabled="!canStart"
            @click="() => startSimulate()"
          >
            {{ isPlanning ? "规划中..." : "开始" }}
          </el-button>
          <el-button :disabled="isPlanning" @click="clearNav">清除</el-button>
        </div>
      </div>
    </div> -->
  </div>

  <!-- tab panel 模型 -->
  <!-- <IncomingCallOverlay
    :visible="incomingCallVisible"
    :call="incomingCall"
    @close="closeIncomingCall"
  /> -->

  <!-- <div class="bottom_nav_tab">
    <div
      v-for="tab in tabs"
      :key="tab.name"
      class="tab_item"
      :class="{ tab_item_active: tab.name == activeTab }"
      @click="tabsStore.setActiveTab(tab.name)"
    >
      <img :src="tab.icon" alt="" />
      {{ tab.label }}
    </div>
  </div>

  <div v-if="activeTab === 2">
    <ThreejsViewerRegion />
  </div>
  <div v-if="activeTab === 3">
    <ThreejsViewerBuilding />
  </div> -->
</template>

<style scoped lang="less">
.iframe_panel_iframe {
  width: 100%;
  height: 100vh;
  border: 0;
}

/* .bottom_nav_tab {
  position: absolute;
  bottom: 0.5em;
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  width: 100%;
  height: 40px;
  background: url("@/assets/ui/buttons/bottomBg.png") center no-repeat;
  background-size: 100% 100%;

  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}
.tab_item {
  font-family:
    PingFangSC,
    PingFang SC;
  font-weight: 500;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 20px;
  text-align: left;
  font-style: normal;
  opacity: 0.5;

  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;

  pointer-events: pointer;
  cursor: pointer;
}

.tab_item_active {
  opacity: 1;
}

.tab_item img {
  width: 20px;
  height: 20px;
} */

#map, #dispatch-map {
  height: 100%;
  width: 100%;
  touch-action: none; /* 优化触摸体验 */
}

:deep(.el-button + .el-button) {
  margin-left: 0px;
}

.nav_panel {
  position: absolute;
  top: 0.5em;
  /* left: 52px; */
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  width: 340px;
  padding: 12px;
  border-radius: 12px;
  background: var(--panel-bg);
  border: 1px solid color-mix(in srgb, #000 12%, transparent);
  backdrop-filter: blur(8px);
}

.nav_panel_new {
  position: absolute;
  top: 0.5em;
  /* left: 52px; */
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  display: flex;
  align-items: center;
  min-width: 450px;
  width: auto;
  padding: 12px;
  border-radius: 12px;
  background: var(--panel-bg);
  border: 1px solid color-mix(in srgb, #000 12%, transparent);
  backdrop-filter: blur(8px);
}

.fire_popup {
  position: absolute;
  min-width: 260px;
  max-width: 320px;
  padding: 10px;
  border-radius: 12px;
  background: var(--panel-bg);
  border: 1px solid color-mix(in srgb, #000 12%, transparent);
  box-shadow: 0 8px 28px color-mix(in srgb, #000 18%, transparent);
  pointer-events: auto;
}

.fire_popup_header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.fire_popup_title {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 600;
  line-height: 1.2;
}

.fire_popup_close {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, #000 14%, transparent);
  background: var(--panel-bg);
  cursor: pointer;
  line-height: 1;
}

.fire_popup_body {
  margin-top: 8px;
  display: grid;
  gap: 6px;
}

.fire_popup_row {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 8px;
  font-size: 12px;
  color: var(--text-primary);
}

.fire_popup_k {
  color: var(--text-secondary);
}

.fire_popup_v {
  word-break: break-all;
}

.car_popup {
  position: absolute;
  min-width: 260px;
  max-width: 320px;
  padding: 10px;
  border-radius: 12px;
  background: var(--panel-bg);
  border: 1px solid color-mix(in srgb, #000 12%, transparent);
  box-shadow: 0 8px 28px color-mix(in srgb, #000 18%, transparent);
  pointer-events: auto;
}

.car_popup_header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.car_popup_title {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 600;
  line-height: 1.2;
}

.car_popup_close {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, #000 14%, transparent);
  background: var(--panel-bg);
  cursor: pointer;
  line-height: 1;
}

.car_popup_body {
  margin-top: 8px;
  display: grid;
  gap: 6px;
}

.car_popup_row {
  display: grid;
  grid-template-columns: 70px 1fr;
  gap: 8px;
  font-size: 12px;
  color: var(--text-primary);
}

.car_popup_k {
  color: var(--text-secondary);
}

.car_popup_v {
  word-break: break-all;
}

.nav_row {
  width: 100%;
  display: grid;
  grid-template-columns: 50px 1fr auto;
  gap: 10px;
  align-items: center;
}

.nav_row + .nav_row {
  margin-top: 10px;
}

.nav_label {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 32px;
}

.nav_field {
  position: relative;
  display: grid;
  /* grid-template-columns: 1fr 56px; */
  gap: 8px;
}

.nav_input_ep {
  width: 100%;
}

:deep(.nav_input_ep .el-input__wrapper),
:deep(.nav_input_ep .el-select__wrapper) {
  border-radius: 10px;
  box-shadow: 0 0 0 1px color-mix(in srgb, #000 18%, transparent) inset;
  padding: 0 10px;
  height: 32px;
  background-color: transparent;
}

:deep(.nav_input_ep .el-input__wrapper.is-focus),
:deep(.nav_input_ep .el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-cyan) 70%, transparent) inset, 0 0 0 3px color-mix(in srgb, var(--accent-cyan) 15%, transparent);
}

:deep(.nav_input_ep .el-input__inner) {
  font-size: 13px;
  height: 32px;
}

.nav_input {
  height: 32px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, #000 18%, transparent);
  padding: 0 10px;
  outline: none;
  font-size: 13px;
}

.nav_input:focus {
  border-color: color-mix(in srgb, var(--accent-cyan) 70%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-cyan) 15%, transparent);
}

.nav_pick {
  height: 32px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, #000 18%, transparent);
  background: var(--panel-bg);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.nav_pick:hover {
  background: var(--panel-bg);
}

.nav_dropdown {
  grid-column: 1 / -1;
  margin-top: 6px;
  max-height: 220px;
  overflow: auto;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, #000 12%, transparent);
  background: rgba(255, 255, 255, 0.98);
}

.nav_option {
  width: 100%;
  text-align: left;
  padding: 10px 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  line-height: 1.2;
  color: var(--text-primary);
}

.nav_option:hover {
  background: rgba(37, 99, 235, 0.08);
}

.nav_actions {
  /* margin-top: 12px; */
  display: flex;
  gap: 10px;
}

.nav_action {
  flex: 1;
  height: 34px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, #000 18%, transparent);
  background: rgba(37, 99, 235, 0.92);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}

.nav_action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.nav_action_secondary {
  background: var(--panel-bg);
  color: var(--text-primary);
}

/* OL 控件外观与通用位置统一由 src/styles/ol-controls.less 管理；
   本文件只覆盖本页面专属的位置差异。 */

/* 调派图比例尺位置：底部抬高，避开左下角鹰眼缩略图 */
:global(#dispatch-map .ol-scale-line) {
  bottom: 28px !important;
  left: 4em !important;
}
</style>
