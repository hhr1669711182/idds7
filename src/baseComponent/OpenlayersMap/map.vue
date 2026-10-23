<script setup lang="ts">
import { onMounted, nextTick, onUnmounted, ref, shallowRef, watch } from "vue";
import OLMap from "ol/Map";
import { waitForBaseMap } from "./startup.ts";
let cancelStartup: (() => void) | undefined;
let disposed = false;
import View from "ol/View";
import * as olProj from "ol/proj";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import TileLayer from "ol/layer/Tile";
import { ScaleLine, OverviewMap } from "ol/control";
import { readScaleLineUnit } from "../../config/scaleLine.ts";
// import { KeyboardPan } from "ol/interaction";
import { FeatureClickQuery } from "./FeatureClickQuery.ts";
// 限制视图范围 要保留 lint检查不清除
// import { useExtent } from "@/components/map/MapTools/commonTools/useExtent.ts";
import {
  GOOGLE_LAYER,
  TEMP_FRONTEND_LAYER_IDS,
  VECTOR_LAYER,
  isTempFrontendLayerId,
} from "./layers.ts";
import { useBaseMapLayer } from "./useBaseMapLayer.ts";
import { TrafficTools } from "../../components/map/MapTools";
import { ZOOM, CENTER } from "./const.map.ts";
import { useResponsive } from "../../composables/useResponsive.ts";
import {
  AmapRealtimeNav,
  FIRE_STATION_LAYER_Z_INDEX,
  mountFireStations,
  mountJRAlarmLayer,
} from "../amap/useAmapTools.ts";
import { mountCarFeatures } from "@/composables/useCarFeatures";
import { mountSSRKFeatures } from "@/composables/useSSRKFeatures";
import { mountIncomingCallFeatures } from "@/composables/useIncomingCallFeatures";
import amapData from "@/assets/map/config/data.json";
import carImg from "@/assets/map/icon/car.png";
import fireImg from "@/assets/map/icon/xfz.png";
import { useFireStations } from "@/composables/useFireStations";
import { useUnclosedIncidents } from "@/composables/useUnclosedIncidents";
// @ts-expect-error TS6133: NavPanel 已被 v-if="false" 隐藏，引用处保留备用
import { EventBus } from "@/utils/mitt.ts";
import AlarmDetailPopup from "./AlarmDetailPopup.vue";
import IncidentDetailDialog from "./IncidentDetailDialog.vue";
import ZoomLevelControl from "./ZoomLevelControl.vue";
import { useBaseSourceStore, useMapConfigStore } from "@/store"; // , useCommonStore
// import { THEME_COLOR } from "../../const/const.common.ts";

// import { storeToRefs } from "pinia";
import { GenericController } from "@/controller/core/generic";
import { getBusinessMessageRuntime } from '@/controller/core/io/BusinessMessageRuntime';
import { createBusinessMapPort } from './businessMapPort';
import TileWMS from "ol/source/TileWMS";
import { getWMSLayerOptions } from "@/apis/layers";
import { STATION_LAYER_NAME } from "@/controller/core/business/IncidentStationQuery";
import { useLayersStore } from "@/store/useLayersStore";

import NavPanel from "./NavPanel.vue";
import { useMapPopups, carTypeLabel, carStatusLabel } from "./useMapPopups.ts";
// import { getLayerByClassName } from "@/utils/mapTool.ts";

const props = withDefaults(defineProps<{ mapId?: string; }>(), { mapId: "map" });
const emit = defineEmits(["setMap"]);

const { isMobile } = useResponsive();

let map: OLMap | null = null;
const nav = shallowRef<AmapRealtimeNav | null>(null);
let zoomLevelChangeKey: EventsKey | null = null;
const mapZoomLevel = ref(ZOOM.INIT);

// @ts-expect-error TS6133: 引用处已注释，保留备用
const navPanelRef = ref<InstanceType<typeof NavPanel> | null>(null);

// == 抽离出的 Popups 管理 ==
const popups = useMapPopups();
const { carPopupRef } = popups;

const getCarPopupElement = () => {
  if (carPopupRef.value) return carPopupRef.value;
  const fallback = document.createElement('div');
  fallback.style.display = 'none';
  document.body.appendChild(fallback);
  carPopupRef.value = fallback;
  return fallback;
};

const showOnlineCarLayer = async () => {
  if (!carManager) return;
  carManager.setVisible(true);
  await carManager.fetch();
  carManager.fitToExtent();
};

let carManager: any = null;
let ssrkManager: any = null;
let incomingCallManager: any = null;
let fireManager: any = null;
let alarmOverlayManager: any = null;
let jrAlarmManager: any = null;
let featureClickQuery: FeatureClickQuery | null = null;
let detachBusinessMap: (() => void) | null = null;
let genericCtrl: GenericController | null = null;
let trafficTool: TrafficTools | null = null;
const overviewControl = shallowRef<OverviewMap | null>(null);
const scaleLineControl = shallowRef<ScaleLine | null>(null);

const layersStore = useLayersStore();
const baseSourceStore = useBaseSourceStore();
const mapConfigStore = useMapConfigStore();
// const commonStore = useCommonStore();
const {
  alarms: unclosedIncidents,
  fetch: fetchUnclosedIncidents,
} = useUnclosedIncidents();
const { load: loadFireStations } = useFireStations();
const wmsLayerMap = new globalThis.Map<string, TileLayer<TileWMS>>();
// 底图 TileLayer：跟随全局 baseSourceStore 切换，共享 source 缓存池
const baseLayer = useBaseMapLayer({
  onMaxZoomChange: (_mz: number) => nextTick(() => applyFeatureZoomLimits()),
  onSourceChange: (layer: TileLayer, activeId: string) => {
    if (activeId === 'thematic-road') layer.setBackground('#1c3863');
  },
});
const overviewLayer = useBaseMapLayer();

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

watch(
  () => baseSourceStore.trafficVisible,
  (v) => trafficTool?.setVisible(v),
);
watch(unclosedIncidents, (next) => jrAlarmManager?.setData?.(next));

// 鹰眼 / 比例尺 随功能配置显隐（底座读 store，控制实例已在 initMap 时挂到 overviewControl/scaleLineControl）
const syncConfiguredControls = () => {
  const m = map;
  if (!m || !overviewControl.value || !scaleLineControl.value) return;
  const feature = mapConfigStore.feature;
  const controls = m.getControls().getArray();
  const hasOverview = controls.some((c) => c === overviewControl.value);
  if (feature.showEagleEye && !hasOverview) m.addControl(overviewControl.value);
  if (!feature.showEagleEye && hasOverview) m.removeControl(overviewControl.value);
  const hasScale = controls.some((c) => c === scaleLineControl.value);
  if (feature.showScaleLine && !hasScale) m.addControl(scaleLineControl.value);
  if (!feature.showScaleLine && hasScale) m.removeControl(scaleLineControl.value);
};
watch(
  () => [mapConfigStore.feature.showEagleEye, mapConfigStore.feature.showScaleLine],
  syncConfiguredControls,
);

const addLayer = (id: string, visible?: boolean) => {
  if (!map) return;
  if (isTempFrontendLayerId(id)) return setTempFrontendLayerVisible(id, true);
  const config = layersStore.getConfig(id);
  if (!config || wmsLayerMap.has(id)) return;
  const options = getWMSLayerOptions(config);
  const wmsLayer = new TileLayer({
    source: new TileWMS({
      url: options.url,
      params: options.params,
      serverType: options.serverType,
      crossOrigin: options.crossOrigin,
    }),
    opacity: options.opacity,
    minZoom: config.minZoom,
    zIndex: id === STATION_LAYER_NAME ? FIRE_STATION_LAYER_Z_INDEX : undefined,
  });
  map.addLayer(wmsLayer);
  wmsLayer.set('id', id);
  wmsLayer.setVisible(visible ?? config.visible ?? true);
  wmsLayerMap.set(id, wmsLayer);
  return true;
};

const removeLayer = (id: string) => {
  if (!map) return false;
  if (isTempFrontendLayerId(id)) return setTempFrontendLayerVisible(id, false);
  const layer = wmsLayerMap.get(id);
  if (!layer) return;
  map.removeLayer(layer);
  layer.getSource()?.dispose();
  layer.dispose();
  wmsLayerMap.delete(id);
  return true;
};

const visibleLayer = (id: string, bol: boolean) => {
  if (!map) return;
  wmsLayerMap.get(id)?.setVisible(bol);
  // getLayerByClassName(map, id)?.setVisible(bol);
}

const syncLayers = (ids: string[], visible?: boolean) => {

  const targetIds = new Set(ids);

  Array.from(wmsLayerMap.keys()).forEach((id) => {
    if (!targetIds.has(id)) removeLayer(id);
  });

  Object.values(TEMP_FRONTEND_LAYER_IDS).forEach((id) =>
    targetIds.has(id) && setTempFrontendLayerVisible(id, targetIds.has(id)),
  );

  ids.forEach((id) => {
    if (!isTempFrontendLayerId(id)) addLayer(id, visible);
  });
};

defineExpose({ addLayer, removeLayer, syncLayers, visibleLayer });

const setTempFrontendLayerVisible = (id: string, visible: boolean) => {
  if (id === TEMP_FRONTEND_LAYER_IDS.ONLINE_CAR && carManager) {
    if (visible) void showOnlineCarLayer();
    else carManager.setVisible(false);
    return true;
  }

  const managerMap: Record<string, any> = {
    [TEMP_FRONTEND_LAYER_IDS.STATION]: fireManager,
    [TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER]: jrAlarmManager,
    [TEMP_FRONTEND_LAYER_IDS.ONLINE_CAR]: carManager,
    [TEMP_FRONTEND_LAYER_IDS.INCOMING_CALL]: incomingCallManager,
    [TEMP_FRONTEND_LAYER_IDS.SSRK]: ssrkManager,
  };
  const manager = managerMap[id];
  if(!manager) return false;

  if (visible && id === TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER) {
    void fetchUnclosedIncidents();
  }
  manager?.setVisible(visible);
  return !!manager;
};

const updateMapZoomLevel = () => {
  const zoom = map?.getView().getZoom();
  if (typeof zoom === "number") mapZoomLevel.value = zoom;
};

const configList = Array.isArray(amapData)
  ? (amapData as any[])
  : [amapData as any];
const regionCfg = (configList[0] || {}).data || configList[0];

const initMap = async () => {
  if (disposed) return;
  map =
    new OLMap({
      layers: [baseLayer, GOOGLE_LAYER, VECTOR_LAYER()],
      target: props.mapId,
      view: new View({
        center: olProj.fromLonLat(CENTER),
        zoom: ZOOM.INIT,
        minZoom: mapConfigStore.config.feature.minZoom,
        maxZoom: mapConfigStore.config.feature.maxZoom,
      }),
    });
  applyFeatureZoomLimits();

  const startup = waitForBaseMap(map);
  cancelStartup = startup.cancel;
  await startup.ready;
  if (disposed) return;

    // TODO: 使用注册中心 接收源（服务|辖区围栏around|机构围栏around|客户区划围栏around）extent变化
    // const extent = map.getView().calculateExtent(map.getSize());
    // const extent = [113.713367, 22.4543543, 114.633333, 22.8667432];  // 临时限制
    // useExtent(map, extent)

  // 全量预注册wms图层（需要预处理时开启）
  // layersStore.layerConfigs.forEach(({ id }) => {
  //     addLayer(id, false);
  // })

  genericCtrl = new GenericController(map);

  updateMapZoomLevel();
  zoomLevelChangeKey = map
    .getView()
    .on("change:resolution", updateMapZoomLevel);
  featureClickQuery = new FeatureClickQuery(map);
  featureClickQuery.activate();

  const feature = mapConfigStore.feature;
  overviewControl.value = new OverviewMap({
    layers: [overviewLayer],
    collapsed: false,
    collapsible: true,
  });
  scaleLineControl.value = new ScaleLine({ units: readScaleLineUnit() });
  // 鹰眼/比例尺：按功能配置控制显隐（默认全显，保持与既有行为一致）
  if (feature.showEagleEye) map.addControl(overviewControl.value);
  if (feature.showScaleLine) map.addControl(scaleLineControl.value);

  nav.value = new AmapRealtimeNav(map, {
    amapKey: "7405ae6dde247ee87be4e7d8021056f4",
    xzKeywords: (regionCfg?.adcode as string) || "",
    vehicleIconSrc: carImg,
  });
  (window as any).nav = nav.value;
  // nav.value.loadMask((regionCfg?.boundaries as any) || []).catch(() => {});

  if (popups.firePopupRef.value) {
    fireManager = mountFireStations({
      map,
      stations: [],
      iconSrc: fireImg,
      popupElement: popups.firePopupRef.value,
      visible: layersStore.checkedIds.includes(TEMP_FRONTEND_LAYER_IDS.STATION),
      onSelect: (d) => {
        popups.fireSelected.value = d;
        popups.firePopupVisible.value = true;
      },
      onClose: () => {
        popups.closeFirePopup();
      },
    });
    // 队站来自 WFS gis:view_res_org_dept（EPSG:4326），异步到达后填充图层
    void loadFireStations()
      .then((list) => fireManager?.setStations?.(list))
      .catch(() => {});
  }

  ssrkManager = mountSSRKFeatures({
    map,
    visible: layersStore.checkedIds.includes(TEMP_FRONTEND_LAYER_IDS.SSRK),
  });

  carManager = mountCarFeatures({
    map,
    popupElement: getCarPopupElement(),
    visible: layersStore.checkedIds.includes(TEMP_FRONTEND_LAYER_IDS.ONLINE_CAR),
    onSelect: (d) => {
      popups.carSelected.value = d;
      popups.carPopupVisible.value = true;
    },
    onClose: () => {
      popups.closeCarPopup();
    },
  });
  carManager.layer.set('id', TEMP_FRONTEND_LAYER_IDS.ONLINE_CAR);
  genericCtrl?.view.registerLayerToggleCallback(
    TEMP_FRONTEND_LAYER_IDS.ONLINE_CAR,
    (visible) => {
      if (visible) void showOnlineCarLayer();
      else carManager?.setVisible(false);
    },
  );
  genericCtrl?.view.registerLayerRefreshCallback(
    TEMP_FRONTEND_LAYER_IDS.ONLINE_CAR,
    () => {
      void carManager?.fetch();
    },
  );
  // genericCtrl?.view.registerLayerRefreshCallback(
  //   TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER,
  //   () => {
  //     void fetchUnclosedIncidents();
  //   },
  // );

  incomingCallManager = mountIncomingCallFeatures({
    map,
    visible: layersStore.checkedIds.includes(
      TEMP_FRONTEND_LAYER_IDS.INCOMING_CALL,
    ),
  });

  if (popups.alarmPopupRef.value && nav.value) {
    alarmOverlayManager = nav.value.mountAlarmOverlay({
      element: popups.alarmPopupRef.value,
      onUpdate: (d) => {
        popups.alarmData.value = d;
        popups.alarmPopupVisible.value = !!d;
      },
    });
  }

  if (popups.jrAlarmPopupRef.value) {
    jrAlarmManager = mountJRAlarmLayer({
      map,
      alarms: [],
      popupElement: popups.jrAlarmPopupRef.value,
      visible: layersStore.checkedIds.includes(
        TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER,
      ),
      onSelect: (d) => {
        popups.jrAlarmData.value = d;
        popups.jrAlarmPopupVisible.value = true;
      },
      onClose: () => {
        popups.closeJRAlarmPopup();
      },
    });
  }

  // syncLayers(layersStore.checkedIds);
  trafficTool = new TrafficTools(map);
  trafficTool.setVisible(baseSourceStore.trafficVisible);

  const attachment = createBusinessMapPort(genericCtrl);
  detachBusinessMap = getBusinessMessageRuntime().attachMap(attachment.port, { kind: 'map', dispose: attachment.dispose });

  emit("setMap", map);
};

const cleanup = () => {
  disposed = true;
  detachBusinessMap?.();
  detachBusinessMap = null;
  cancelStartup?.();
  if (zoomLevelChangeKey) {
    unByKey(zoomLevelChangeKey);
    zoomLevelChangeKey = null;
  }
  if (featureClickQuery) {
    featureClickQuery.destroy();
    featureClickQuery = null;
  }
  alarmOverlayManager?.destroy();
  jrAlarmManager?.destroy();
  carManager?.destroy();
  ssrkManager?.destroy();
  ssrkManager = null;
  incomingCallManager?.destroy();
  fireManager?.destroy();
  if (nav.value) {
    if ((window as any).nav === nav.value) delete (window as any).nav;
    nav.value.destroy();
    nav.value = null;
  }
  if (trafficTool) {
    trafficTool.remove();
    trafficTool = null;
  }
  if (map) {
    wmsLayerMap.forEach((layer) => {
      map?.removeLayer(layer);
      layer.getSource()?.dispose();
      layer.dispose();
    });
    wmsLayerMap.clear();
    // source 由 useBaseMapLayer 全局缓存池共享，卸载时只销毁图层，不 dispose 共享 source
    overviewLayer.dispose();
    baseLayer.dispose();
    map.dispose();
    map = null;
  }
};

onMounted(() => {
  nextTick(() => initMap());
});

onUnmounted(() => {
  cleanup();
});
</script>

<template>
  <div :id="props.mapId" :class="{ 'is-mobile': isMobile }" tabindex="2">
    <slot></slot>

    <ZoomLevelControl :zoom="mapZoomLevel" />

    <div ref="popups.firePopupRef" class="fire_popup" v-show="popups.firePopupVisible.value">
      <div class="fire_popup_header">
        <div class="fire_popup_title">
          {{ popups.fireSelected.value?.title }}
        </div>
        <button class="fire_popup_close" type="button" @click="popups.closeFirePopup">×</button>
      </div>
      <div class="fire_popup_body">
        <div v-if="popups.fireSelected.value?.address" class="fire_popup_row">
          <span class="fire_popup_k">地址</span
          ><span class="fire_popup_v">{{
            popups.fireSelected.value.address
          }}</span>
        </div>
        <div v-if="popups.fireSelected.value?.phone" class="fire_popup_row">
          <span class="fire_popup_k">电话</span
          ><span class="fire_popup_v">{{
            popups.fireSelected.value.phone
          }}</span>
        </div>
        <div class="fire_popup_row">
          <span class="fire_popup_k">坐标</span
          ><span class="fire_popup_v">{{ popups.fireSelected.value?.lng }}, {{ popups.fireSelected.value?.lat }}</span>
        </div>
      </div>
    </div>

    <div ref="popups.alarmPopupRef">
      <AlarmDetailPopup
        :visible="popups.alarmPopupVisible.value"
        :title="popups.alarmPopupTitle.value"
        :rows="popups.alarmPopupRows.value"
        detail-button-text="警情详情"
        @close="popups.closeAlarmPopup"
        @detail="popups.openIncidentDetailFromAlarm"
      />
    </div>

    <div
      :ref="(el) => {
        popups.jrAlarmPopupRef.value = el as HTMLElement | null;
      }"
    >
      <AlarmDetailPopup
        :visible="popups.jrAlarmPopupVisible.value"
        :title="popups.jrAlarmPopupTitle.value"
        :rows="popups.jrAlarmPopupRows.value"
        detail-button-text="警情详情"
        @close="popups.closeJRAlarmPopup"
        @detail="popups.openIncidentDetailFromJrAlarm"
      />
    </div>

    <!-- 警情详情固定弹窗（居中 Modal，小弹窗点"警情详情"打开） -->
    <IncidentDetailDialog
      v-model="popups.incidentDetailVisible.value"
      :data="popups.incidentDetailData.value"
      :loading="popups.incidentDetailLoading.value"
    />

    <div
      :ref="(el) => { carPopupRef = el as HTMLElement | null }"
      class="car_popup"
      v-show="popups.carPopupVisible.value"
    >
      <div class="car_popup_header">
        <div class="car_popup_title">
          {{ popups.carSelected.value?.plateNo }} -
          {{ popups.carSelected.value?.team }}
        </div>
        <button class="car_popup_close" type="button" @click="popups.closeCarPopup">×</button>
      </div>
      <div class="car_popup_body">
        <div class="car_popup_row">
          <span class="car_popup_k">车辆类型</span
          ><span class="car_popup_v">{{
            carTypeLabel(popups.carSelected.value?.carType)
          }}</span>
        </div>
        <div class="car_popup_row">
          <span class="car_popup_k">状态</span
          ><span class="car_popup_v">{{
            carStatusLabel(popups.carSelected.value?.status)
          }}</span>
        </div>
        <div v-if="popups.carSelected.value?.driver" class="car_popup_row">
          <span class="car_popup_k">司机</span
          ><span class="car_popup_v">{{
            popups.carSelected.value.driver
          }}</span>
        </div>
        <div class="car_popup_row">
          <span class="car_popup_k">坐标</span
          ><span class="car_popup_v">{{
            popups.formatCoordinateText(
              popups.carSelected.value?.lng,
              popups.carSelected.value?.lat,
            )
          }}</span>
        </div>
      </div>
    </div>

    <!-- 路径规划选点面板：暂时注释，保留组件与关联代码以便随时恢复 -->
    <!-- <NavPanel
      ref="navPanelRef"
      :nav="nav"
      :alarmData="popups.alarmData.value"
      @clear="
        popups.closeAlarmPopup();
        EventBus.emit('panelClose');
      "
    /> -->
  </div>
</template>

<style scoped lang="less">
@import "./map.less";
</style>
