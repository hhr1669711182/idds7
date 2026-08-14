<script setup lang="ts">
import { onMounted, nextTick, onUnmounted, ref, computed, watch, markRaw } from "vue";
import OLMap from "ol/Map";
import View from "ol/View";
import * as olProj from "ol/proj";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import OSM from "ol/source/OSM.js";
import TileLayer from "ol/layer/Tile";
import {
  ZoomSlider,
  FullScreen,
  ScaleLine,
  ZoomToExtent,
  OverviewMap,
} from "ol/control";
import { KeyboardPan } from "ol/interaction";
import PrintDialog from "ol-ext/control/PrintDialog";
import jsPDF from "jspdf";
import { saveAs } from "file-saver";
import { v4 as uuidv4 } from "uuid";
import { FeatureClickQuery } from "./FeatureClickQuery.ts";
import {
  AMAP_LAYER,
  GOOGLE_LAYER,
  TEMP_FRONTEND_LAYER_IDS,
  VECTOR_LAYER,
  isTempFrontendLayerId,
} from "./layers.ts";
import { TrafficTools } from "../../components/map/MapTools";
import { EXTENT, ZOOM, CENTER } from "./const.map.ts";
import { useResponsive, useTouch } from "../../composables/useResponsive.ts";
import {
  AmapRealtimeNav,
  fetchInputTips,
  mountFireStations,
  mountJRAlarmLayer,
} from "../amap/useAmapTools.ts";
import {
  mountCarFeatures,
  type CarItem,
  type CarFeaturesManager,
} from '@/composables/useCarFeatures'
import {
  mountIncomingCallFeatures,
  type IncomingCallFeaturesManager,
} from '@/composables/useIncomingCallFeatures'
import amapData from "../amap/data.json";
import carImg from "../amap/imgs/car.png";
import fireImg from "../amap/imgs/xfz.png";
import {
  zhxfdzXYList,
  type JRAlarmData,
} from "../amap/mapData.ts";
import { useAlarmHotspot } from '@/composables/useAlarmHotspot'
import dayjs from 'dayjs'
import { getDistance } from "ol/sphere";
import { ElMessage } from "element-plus";
import { EventBus } from "../../util/mitt.ts";
import AlarmDetailPopup from "./AlarmDetailPopup.vue";
import type { AlarmData } from "../amap/useAmapTools.ts";
import ZoomLevelControl from "./ZoomLevelControl.vue";
import { THEME_COLOR } from "../../const/const.common.ts";
import { createBaseSourceSource } from "./baseSource.ts";
import ljImg from "@/assets/svg/lj.svg";
import xcImg from "@/assets/svg/xc.svg";
import zjImg from "@/assets/svg/jz.svg";
import { useDispatchMapStore } from "@/store";
import { storeToRefs } from "pinia";
import {
  addrCtrl,
  onPOIRequest,
  onRouteRequest,
} from "@/controller/map";
import TileWMS from "ol/source/TileWMS";
import { getWMSLayerOptions } from "@/apis/layers";
import { LAYER_SOURCE_CONFIGS } from "@/config/layers";
import { useBaseSourceStore, useCommonStore, useTabsStore } from "@/store";

const props = withDefaults(defineProps<{
  mapId?: string;
}>(), {
  mapId: "dispatch-map",
});

const emit = defineEmits(["setMap"]);

// 响应式检测
const { isMobile } = useResponsive();
const { isTouchDevice } = useTouch();

let map: OLMap | null = null;
let nav: AmapRealtimeNav | null = null;
let zoomLevelChangeKey: EventsKey | null = null;
const navPanelRef = ref<HTMLElement | null>(null);
const mapZoomLevel = ref(ZOOM.INIT);

const firePopupRef = ref<HTMLElement | null>(null);
const firePopupVisible = ref(false);
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
type AlarmDetailRow = {
  label: string;
  value?: string | number | null;
  visible?: boolean;
};
let fireManager: TempFrontendLayerManager | null = null;

/** 已添加到地图的 WMS 图层（id -> ol.layer.Tile） */
const baseSourceStore = useBaseSourceStore();
const commonStore = useCommonStore();
const { alarms: alarmHotspots, fetch: fetchAlarmHotspots } = useAlarmHotspot();
const { themeColor } = storeToRefs(commonStore);
const wmsLayerMap = new globalThis.Map<string, TileLayer<TileWMS>>();
let baseLayer: TileLayer | null = null;
let overviewLayer: TileLayer | null = null;
let trafficTool: TrafficTools | null = null;

let jrAlarmManager: TempFrontendLayerManager | null = null;


const syncBaseSourceLayer = () => {
  if (!baseLayer) return;
  const source = createBaseSourceSource(baseSourceStore.activeId, {
    night: themeColor.value === THEME_COLOR.NIGHT,
  }, (maxZoom: number) =>  nextTick(() => map?.getView().setMaxZoom(maxZoom)));
  
  baseLayer.setSource(source);
  if (overviewLayer) overviewLayer.setSource(source);
};

watch([() => baseSourceStore.activeId, () => themeColor.value], () => {
  syncBaseSourceLayer();
});

watch(() => baseSourceStore.trafficVisible, (visible) => {
  if (trafficTool) {
    trafficTool.setVisible(visible);
  }
});

watch(alarmHotspots, (next) => {
  if (jrAlarmManager?.setData) {
    console.log(next, 111);
    jrAlarmManager.setData(next);
  }
});

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
  }));

  map.addLayer(wmsLayer);
  wmsLayerMap.set(id, wmsLayer);
  return true;
};

const removeLayer = (id: string) => {
  if (!map) return false;
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

const alarmPopupRef = ref<HTMLElement | null>(null);
const alarmPopupVisible = ref(false);
const alarmData = ref<any>(null);
// const alarmData = ref<AlarmData | null>(null);
let alarmOverlayManager: {
  showAtAlarm: () => void;
  hide: () => void;
  destroy: () => void;
} | null = null;

let featureClickQuery: FeatureClickQuery | null = null;

const jrAlarmPopupRef = ref<HTMLElement | null>(null);
const jrAlarmPopupVisible = ref(false);
const jrAlarmData = ref<JRAlarmData | null>(null);

const joinText = (...values: Array<string | number | null | undefined>) =>
  values
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join("");

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

const alarmPopupTitle = computed(
  () => alarmData.value?.aoi || alarmData.value?.address || "警情详情",
);

const alarmPopupRows = computed<AlarmDetailRow[]>(() => {
  const data = alarmData.value;
  return [
    // { label: "地址", value: data?.address, visible: !!data?.address },
    // {
    //   label: "区域",
    //   value: joinText(data?.province, data?.city, data?.county, data?.town, data?.community),
    // },
    // { label: "坐标", value: formatCoordinateText(data?.x, data?.y) },
    // { label: "用途", value: data?.areausag_name, visible: !!data?.areausag_name },

    { label: "地址", value: data?.address },
    { label: "状态", value: data?.status },
    { label: "时间", value: data?.alarmTime },
    { label: "类型", value: data?.alarmType },
    { label: "燃烧物", value: data?.burningMaterial },
    { label: "重点单位", value: data?.keyUnit },
    { label: "辖区", value: joinText(data?.district, data?.street) },
    { label: "坐标", value: formatCoordinateText(data?.lng, data?.lat) },
    { label: "详情", value: data?.description },
  ];
});

const jrAlarmPopupTitle = computed(() => {
  const data = jrAlarmData.value;
  const left = data?.disasterTypeLabel ?? "警情";
  const right = data?.disasterGradeLabel ?? data?.disasterGrade ?? "";
  return right ? `${left} - ${right}` : left;
});

const jrAlarmPopupRows = computed<AlarmDetailRow[]>(() => {
  const data = jrAlarmData.value;
  return [
    { label: "警情类型", value: data?.disasterTypeLabel },
    {
      label: "报警时间",
      value: dayjs(data?.createdAt || '').format("YYYY-MM-DD HH:mm:ss"),
    },
    { label: "警情等级", value: data?.disasterGradeLabel ?? data?.disasterGrade },
    { label: "事发地址", value: data?.disasterAddress },
    { label: "警情编号", value: data?.incidentId },
    // { label: "问询编号", value: data?.inquiryId },
    { label: "主管队站", value: data?.mOrgIdLabel ?? data?.mOrgId },
    { label: "坐标", value: formatCoordinateText(data?.lng, data?.lat) },
  ];
});

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
      fetchAlarmHotspots();
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

const mapMessageUnsubscribers: Array<() => void> = [];

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

const queryStartTips = debounce(() => queryTips("start"), 220);
const queryEndTips = debounce(() => queryTips("end"), 220);

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

const getNearestFireStation = (target: [number, number]) => {
  let best: any = null;
  let bestDist = Infinity;
  for (const s of zhxfdzXYList as any[]) {
    if (!Number.isFinite(s?.lng) || !Number.isFinite(s?.lat)) continue;
    const d = getDistance(target, [s.lng, s.lat]);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best ? { station: best, distanceMeters: bestDist } : null;
};

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

    addrCtrl.send(picked);
  }
  activeDropdown.value = null;
};

const onFatherMessage = async (
  coord: [number, number],
  otherData: any,
  fireBrigade = [],
  d?: any, // 路径规划接口数据
) => {
  // tabs切换地图模式
  tabsStore.setActiveTab(1);

  endCoord.value = coord;
  alarmData.value = (otherData || null) as AlarmData | null;
  startSimulate(fireBrigade, d);
  // 逆地址解析，获取地址信息
  const address = await nav?.reverseGeocode(coord);
  endText.value = address || "";

  // 关闭模型
  EventBus.emit("panelClose");
};

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
      nearest = getNearestFireStation(endCoord.value);
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
  alarmPopupVisible.value = false;
  alarmData.value = null;
  alarmOverlayManager?.hide();
};

const closeJRAlarmPopup = () => {
  jrAlarmPopupVisible.value = false;
  jrAlarmData.value = null;
  jrAlarmManager?.hide();
};

const initMap = () => {
  baseLayer = AMAP_LAYER();
  overviewLayer = AMAP_LAYER();
  syncBaseSourceLayer();
  const googleLayer = GOOGLE_LAYER;
  const vectorLayer = VECTOR_LAYER();

  const overviewMapControl = new OverviewMap({
    layers: [overviewLayer!],
    collapsed: false,
    collapsible: true,
  });

  const keyboardPan = new KeyboardPan({
    pixelDelta: 100,
    duration: 200,
  });

  const mapInstance = markRaw(new OLMap({
    layers: [baseLayer!, googleLayer, vectorLayer],
    target: props.mapId,
    view: new View({
      center: olProj.fromLonLat(CENTER),
      zoom: ZOOM.INIT,
      minZoom: ZOOM.MIN,
      maxZoom: ZOOM.MAX,
    }),
  }));
  map = mapInstance;
  emit("setMap", mapInstance);
  updateMapZoomLevel();
  if (!mapInstance) return;
  
  zoomLevelChangeKey = mapInstance
    .getView()
    .on("change:resolution", updateMapZoomLevel);

  featureClickQuery = new FeatureClickQuery(mapInstance);
  featureClickQuery.activate();

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

  map.addControl(new ScaleLine());
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

  if (amapKey.value) {
    nav.loadMask((regionCfg?.boundaries as any) || []).catch(() => {});
  }

  if (firePopupRef.value) {
    fireManager = mountFireStations({
      map,
      stations: zhxfdzXYList as any,
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
    alarmOverlayManager = nav.mountAlarmOverlay({
      element: alarmPopupRef.value,
      onUpdate: (data) => {
        alarmData.value = data;
        alarmPopupVisible.value = !!data;
      },
    });
  }

  if (jrAlarmPopupRef.value) {
    jrAlarmManager = mountJRAlarmLayer({
      map,
      alarms: [],
      popupElement: jrAlarmPopupRef.value,
      visible: dispatchCheckedIds.value.includes(
        TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER,
      ),
      onSelect: (data) => {
        jrAlarmData.value = data;
        jrAlarmPopupVisible.value = true;
      },
      onClose: () => {
        jrAlarmPopupVisible.value = false;
        jrAlarmData.value = null;
      },
    });
  }

  syncLayers(dispatchCheckedIds.value);
  
  trafficTool = new TrafficTools(map);
  trafficTool.setVisible(baseSourceStore.trafficVisible);
};

/**
 * 清理资源
 */
const cleanup = () => {
  if (zoomLevelChangeKey) {
    unByKey(zoomLevelChangeKey);
    zoomLevelChangeKey = null;
  }
  if (featureClickQuery) {
    featureClickQuery.destroy();
    featureClickQuery = null;
  }
  alarmOverlayManager?.destroy();
  alarmOverlayManager = null;
  jrAlarmManager?.destroy();
  jrAlarmManager = null;
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
    map.dispose();
    map = null;
  }
  baseLayer = null;
};

// tabs 模型
const tabsStore = useTabsStore();
const { activeTab } = storeToRefs(tabsStore);
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

onMounted(() => {
  nextTick(() => {
    initMap();
  });
  document.addEventListener("click", handleDocumentClick, true);

  mapMessageUnsubscribers.push(
    onRouteRequest((d: any) =>
      onFatherMessage(
        [d.alarmData.gisX, d.alarmData.gisY],
        d.alarmData.info,
        d.fireBrigade,
        d,
      ),
    ),
    onPOIRequest((d: any) =>
      onDisasterSelect({ location: d.lngLat, value: d.markerLabel }),
    ),
    addrCtrl.receive(({ status }: { status: boolean }) => {
      if (typeof status !== "boolean") return;
      status ? pickOnMap("end") : clearNav();
    }),
  );
});

onUnmounted(() => {
  mapMessageUnsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
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
        <button class="fire_popup_close" type="button" @click="closeFirePopup">
          ×
        </button>
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
          <span class="fire_popup_v">
            {{ fireSelected?.lng }}, {{ fireSelected?.lat }}
          </span>
        </div>
      </div>
    </div>

    <!-- 警情弹窗（模板） -->
    <div ref="alarmPopupRef">
      <AlarmDetailPopup
        :visible="alarmPopupVisible"
        :title="alarmPopupTitle"
        :rows="alarmPopupRows"
        @close="closeAlarmPopup"
      />
    </div>

    <!-- 今日灾情弹窗 -->
    <div ref="jrAlarmPopupRef">
      <AlarmDetailPopup
        :visible="jrAlarmPopupVisible"
        :title="jrAlarmPopupTitle"
        :rows="jrAlarmPopupRows"
        @close="closeJRAlarmPopup"
      />
    </div>

    <!-- 在线车辆弹窗 -->
    <div ref="carPopupRef" class="car_popup" v-show="carPopupVisible">
      <div class="car_popup_header">
        <div class="car_popup_title">
          {{ carSelected?.plateNo }} - {{ carSelected?.team }}
        </div>
        <button
          class="car_popup_close"
          type="button"
          @click="carPopupVisible = false"
        >
          ×
        </button>
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
  background: url("@/assets/bottomBg.png") center no-repeat;
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
  color: #ffffff;
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
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(0, 0, 0, 0.12);
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
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(8px);
}

.fire_popup {
  position: absolute;
  min-width: 260px;
  max-width: 320px;
  padding: 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
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
  color: #111827;
  font-weight: 600;
  line-height: 1.2;
}

.fire_popup_close {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  background: rgba(255, 255, 255, 0.92);
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
  color: #111827;
}

.fire_popup_k {
  color: rgba(17, 24, 39, 0.7);
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
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
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
  color: #111827;
  font-weight: 600;
  line-height: 1.2;
}

.car_popup_close {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  background: rgba(255, 255, 255, 0.92);
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
  color: #111827;
}

.car_popup_k {
  color: rgba(17, 24, 39, 0.7);
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
  color: #111827;
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
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.18) inset;
  padding: 0 10px;
  height: 32px;
  background-color: transparent;
}

:deep(.nav_input_ep .el-input__wrapper.is-focus),
:deep(.nav_input_ep .el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.7) inset, 0 0 0 3px rgba(37, 99, 235, 0.15);
}

:deep(.nav_input_ep .el-input__inner) {
  font-size: 13px;
  height: 32px;
}

.nav_input {
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  padding: 0 10px;
  outline: none;
  font-size: 13px;
}

.nav_input:focus {
  border-color: rgba(37, 99, 235, 0.7);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.nav_pick {
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  background: rgba(17, 24, 39, 0.9);
  color: #ffffff;
  font-size: 13px;
  cursor: pointer;
}

.nav_pick:hover {
  background: rgba(17, 24, 39, 1);
}

.nav_dropdown {
  grid-column: 1 / -1;
  margin-top: 6px;
  max-height: 220px;
  overflow: auto;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.12);
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
  color: #111827;
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
  border: 1px solid rgba(0, 0, 0, 0.18);
  background: rgba(37, 99, 235, 0.92);
  color: #ffffff;
  font-size: 13px;
  cursor: pointer;
}

.nav_action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.nav_action_secondary {
  background: rgba(255, 255, 255, 0.92);
  color: #111827;
}

/* 基础控件样式 */
:global(.ol-control) {
  background-color: rgba(255, 255, 255, 0.8);
  border-radius: 4px;
}

:global(.ol-control button) {
  width: 36px;
  height: 36px;
  font-size: 16px;
}

/* 移动端适配 */
:global(.is-mobile .ol-control button) {
  width: 44px;
  height: 44px;
  font-size: 18px;
}

:global(.is-mobile .ol-scale-line) {
  font-size: 14px;
  padding: 2px 8px;
}

:global(.ol-overviewmap) {
  bottom: 1.7em;
  left: 0.5em;
  z-index: 1;
}

:deep(.ol-overviewmap .ol-overviewmap-map) {
  width: 180px !important;
  height: 120px !important;
  position: absolute;
  bottom: 0;
  left: calc(36px + 10px);
  button {
   display: inline-block;
  }
  
}

.ol-overviewmap:not(.ol-collapsed) button {
    bottom: 0;
    left: 0;
    position: absolute;
}

:global(.is-mobile .ol-overviewmap) {
  bottom: 5em;
  width: 120px;
  height: 120px;
}

/* 打印控件适配 */
:global(.ol-control.ol-print-dialog) {
  top: 0.5em;
  right: 7.5em;
}

:global(.is-mobile .ol-control.ol-print-dialog) {
  display: none;
}

/* 全屏控件适配 */
:global(.ol-rotate) {
  top: 3em;
  right: 0.5em;
}

:global(.is-mobile .ol-rotate) {
  top: 4em;
}

:global(.ol-scale-line) {
  bottom: 28px !important;
  left: 4em;
  // left: calc(100% - 300px);
}

/* 缩放控件适配 */
:global(.ol-zoom) {
  top: calc(100% - 140px) !important;
  left: 0.5em;
}

:global(.is-mobile .ol-zoom) {
  left: 0.5em;
  /* top: 0.5em; */
  top: calc(100% - 120px) !important;
}

:global(.ol-zoom button) {
  width: 36px;
  height: 36px;
}

:global(.is-mobile .ol-zoom button) {
  width: 44px;
  height: 44px;
}
</style>