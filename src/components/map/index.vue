<!--
 * @Author: hhr
 * @Date: 2026-05-21 19:13:51
 * @LastEditTime: 2026-11-03 17:30:00
 * @LastEditors: hhr
 * @Description: 主地图包装层（路线 Y 收口：恒渲染，调派面板由 isDispatchVariant 条件渲染）
 * @FilePath: \ids-gis-web\src\components\map\index.vue
-->
<script setup lang="ts">
import { defineAsyncComponent, nextTick, onActivated, onMounted, onUnmounted, shallowRef, watch, computed } from "vue";
import { storeToRefs } from "pinia";

import tlp from "./compass.vue";
import trp from "./trp.vue";
import card from "./card.vue";
import clear from "./clear.vue";
import brp from "./brp.vue";
import topicLayerCard from "./component/topicLayerCard.vue";
import baseSource from "./component/baseSource.vue";
const routePlan = defineAsyncComponent(() => import("./component/routePlan.vue"));
import bigPanel from "./component/bigPanel.vue";
import config from "./config.vue";
import paletteDrawer from "./component/paletteDrawer.vue";
import layers from "./layers.vue";
import ssrkPanel from "./component/ssrkPanel.vue";

import OpenlayersMap from "@/baseComponent/OpenlayersMap/map.vue";
import type OlMap from "ol/Map";
import DispatchT1Panel from "@/baseComponent/OpenlayersMap/DispatchT1.vue";
import type { DispatchT1State, DispatchT1VehicleCommand } from "@/baseComponent/OpenlayersMap/DispatchT1";
import { isDispatchVariant } from "@/baseComponent/OpenlayersMap/gisMapConfig";
import { TEMP_FRONTEND_LAYER_IDS } from "@/baseComponent/OpenlayersMap/layers";
import DispatchLayers from "@/components/dispatchMap/DispatchLayers.vue";
import VehicleTrackPanel from "@/components/dispatchMap/VehicleTrackPanel.vue";
import {
  useMapConfigStore,
  useMapStore,
  usePanelStore,
} from "@/store/index.ts";
import { useDispatchMapStore } from "@/store/useDispatchMapStore";
import { useLayersStore } from "@/store/useLayersStore";
import { useTabsStore } from "@/store/useTabsStore";
import { useVehicleTrackStore } from "@/store/useVehicleTrackStore";
import { usePendingDispatchAlarmStore } from "@/store/usePendingDispatchAlarmStore";
import { PANEL_TYPES } from "@/const/const.panel.ts";
import type { LayerChangeHandler } from "./layers.vue";

type OpenlayersMapExpose = {
  addLayer: (id: string) => boolean;
  removeLayer: (id: string) => boolean;
  syncLayers: (ids: string[], visible?: boolean) => void;
  visibleLayer: (id: string, bol: boolean) => void;
};

const MapStore = useMapStore();
const PanelStore = usePanelStore();
// @ts-expect-error TS6133: 引用处已注释，保留备用
const tabsStore = useTabsStore();
const layersStore = useLayersStore();
const mapConfigStore = useMapConfigStore();
const dispatchMapStore = useDispatchMapStore();
const pendingDispatchAlarmStore = usePendingDispatchAlarmStore();
const vehicleTrackStore = useVehicleTrackStore();

const { type, ssrkPanelOpen } = storeToRefs(PanelStore);
const openLayersMapRef = shallowRef<OpenlayersMapExpose | null>(null);
/** 路线 Y B-6c：本地 shallowRef 持裸 OL Map（避免 pinia 深度响应式 Proxy 破坏 OL 方法绑定），传给 DispatchT1Panel */
const dispatchOlMap = shallowRef<OlMap | null>(null);
const { feature } = storeToRefs(mapConfigStore);
const dispatchVariant = computed(() => isDispatchVariant());
let viewportRefreshFrame: number | null = null;

const refreshMapViewport = () => {
  if (viewportRefreshFrame !== null) {
    cancelAnimationFrame(viewportRefreshFrame);
  }
  viewportRefreshFrame = requestAnimationFrame(() => {
    viewportRefreshFrame = requestAnimationFrame(() => {
      viewportRefreshFrame = null;
      const map = MapStore.map;
      if (!map?.updateSize) return;
      map.updateSize();
      try { map.renderSync(); } catch { /* 地图过渡期 renderer 未就绪，忽略 */ }
    });
  });
};

const getMap = (map: any) => {
  MapStore.setMap(map);
  dispatchOlMap.value = map as OlMap;
  openLayersMapRef.value?.syncLayers(layersStore.checkedIds, true);
  refreshMapViewport();
};

const handleLayerChange: LayerChangeHandler = (action, id) => {
  // visible 显示隐藏
  // openLayersMapRef.value?.visibleLayer(id, action === "add");

  // 选项注册
  if (action === "add") {
    openLayersMapRef.value?.addLayer(id);
  } else {
    openLayersMapRef.value?.removeLayer(id);
  }
};

/** 调色盘 / 底图滤镜变更后重载瓦片，让新滤镜立即生效 */
const handleFilterChange = () => {
  const map = MapStore.map;
  if (!map || typeof map.getLayers !== "function") return;
  map.getLayers().forEach((layer: any) => {
    const source = layer.getSource?.();
    if (source && typeof source.refresh === "function") source.refresh();
  });
};

const handleConfigSave = () => {
  openLayersMapRef.value?.syncLayers(layersStore.checkedIds, true);
};

// ===== 路线 Y B-6c：调派变体面板（原 DispatchMapPage 迁入） =====
const getDispatchLayerIds = (ids: string[]) =>
  ids.filter((id) => id !== TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER);

watch(
  () => dispatchMapStore.checkedIds,
  (ids) => {
    // 调派图层与主图图层共用同一 OLMap，仅调派态允许改写图层集合
    if (!dispatchVariant.value) return;
    const nextIds = getDispatchLayerIds(ids);
    if (nextIds.length !== ids.length) {
      dispatchMapStore.setCheckedIds(nextIds);
      return;
    }
    openLayersMapRef.value?.syncLayers(nextIds);
  },
  { deep: true, immediate: true },
);


const handleDispatch = (command: DispatchT1VehicleCommand) => {
  console.info('[DispatchT1] 服务端已确认车辆调派', command);
};

const handleDispatchError = (error: unknown) => {
  console.error('[DispatchT1] 消防调派处理失败', error);
};

const handleQuerySuccess = (state: Readonly<DispatchT1State>) => {
  pendingDispatchAlarmStore.consume(state.incident?.id);
  nextTick(refreshMapViewport);
};

onMounted(async () => {
  await mapConfigStore.loadConfig();
  // openLayersMapRef.value?.syncLayers(layersStore.checkedIds);
});

onActivated(() => nextTick(refreshMapViewport));

onUnmounted(() => {
  if (viewportRefreshFrame !== null) {
    cancelAnimationFrame(viewportRefreshFrame);
    viewportRefreshFrame = null;
  }
});
</script>

<template>
  <OpenlayersMap ref="openLayersMapRef" @setMap="getMap">
    <tlp />
    <trp />

    <routePlan v-if="type == PANEL_TYPES.ROUTE_PLAN" />
    <topicLayerCard />
    <baseSource />

    <clear />
    <card />
    <bigPanel />
    <config @save="handleConfigSave" />
    <paletteDrawer v-if="feature.showPalette" @filter-change="handleFilterChange" />
    <layers v-if="feature.showLayerToolbar" :onLayerChange="handleLayerChange" />

    <ssrkPanel v-if="feature.showPopulation" v-show="ssrkPanelOpen" />

    <WeatherPanel v-if="feature.showWeather" />
    <circleQueryPanel v-if="feature.showCircleQuery" />

    <!-- 路线 Y B-6c：调派变体专属面板（原 DispatchMapPage 迁入，isDispatchVariant 响应式） -->
    <div v-if="dispatchVariant" class="dispatch-variant-ui">
      <DispatchT1Panel
        :map="dispatchOlMap"
        @dispatch="handleDispatch"
        @query-success="handleQuerySuccess"
        @error="handleDispatchError"
      />
      <DispatchLayers />
      <VehicleTrackPanel v-if="vehicleTrackStore.panelVisible" />
    </div>
  </OpenlayersMap>

  <brp />
</template>

<style scoped>
:global(#map .ol-scale-line) {
  left: 0.5em !important;
  bottom: 0 !important;
  z-index: 2;
}
</style>
