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
import { isDispatchVariant, resolveLayerViewMode } from "@/baseComponent/OpenlayersMap/gisMapConfig";
import { TEMP_FRONTEND_LAYER_IDS } from "@/baseComponent/OpenlayersMap/layers";
import VehicleTrackPanel from "@/components/dispatchMap/VehicleTrackPanel.vue";
import {
  useMapConfigStore,
  useMapStore,
  usePanelStore,
} from "@/store/index.ts";
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
  showLayer: (id: string) => boolean;
  hideLayer: (id: string) => boolean;
};

const MapStore = useMapStore();
const PanelStore = usePanelStore();
// @ts-expect-error TS6133: 引用处已注释，保留备用
const tabsStore = useTabsStore();
const layersStore = useLayersStore();
const mapConfigStore = useMapConfigStore();
const pendingDispatchAlarmStore = usePendingDispatchAlarmStore();
const vehicleTrackStore = useVehicleTrackStore();

const { type, ssrkPanelOpen } = storeToRefs(PanelStore);
const openLayersMapRef = shallowRef<OpenlayersMapExpose | null>(null);
/** 路线 Y B-6c：本地 shallowRef 持裸 OL Map（避免 pinia 深度响应式 Proxy 破坏 OL 方法绑定），传给 DispatchT1Panel */
const dispatchOlMap = shallowRef<OlMap | null>(null);
/** 派生工具显隐：用户配置(feature) ∧ 模式 overlay(effectiveFeature)。调派态下工具入口由模式层强制隐藏，切出自动恢复 */
const { effectiveFeature } = storeToRefs(mapConfigStore);
const dispatchVariant = computed(() => isDispatchVariant());
/** 图层工具栏展示模式（MapPhase 6 阶段 + flood 特灾轴），驱动 useLayersStore 的隐藏过滤与默认集回落 */
const layerMode = computed(resolveLayerViewMode);
watch(layerMode, (mode) => layersStore.setMode(mode), { immediate: true });
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
  if (action === "add") {
    openLayersMapRef.value?.showLayer(id);
  } else {
    openLayersMapRef.value?.hideLayer(id);
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
  ids.filter(
    (id) =>
      id !== TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER &&
      // 持久化的旧 id 可能已被后台下线，过滤掉避免「全选」恒为未选
      layersStore.items.some((item) => item.id === id),
  );

watch(
  () => layersStore.checkedIds,
  (ids) => {
    // 调派图层与主图图层共用同一 OLMap，仅调派态允许改写图层集合
    if (!dispatchVariant.value) return;
    const nextIds = getDispatchLayerIds(ids);
    if (nextIds.length !== ids.length) {
      layersStore.setCheckedIds(nextIds);
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
    <trp v-if="effectiveFeature.showDrawToolbar" />

    <routePlan v-if="type == PANEL_TYPES.ROUTE_PLAN && effectiveFeature.showRoutePlan" />
    <topicLayerCard v-if="effectiveFeature.showTopicCard" />
    <baseSource v-if="effectiveFeature.showBaseSource" />

    <clear v-if="effectiveFeature.showClear" />
    <card v-if="effectiveFeature.showCard" />
    <bigPanel v-if="effectiveFeature.showBigPanel" />
    <paletteDrawer v-if="effectiveFeature.showPalette" @filter-change="handleFilterChange" />
    <layers v-if="effectiveFeature.showLayerToolbar" :onLayerChange="handleLayerChange" />

    <ssrkPanel v-if="effectiveFeature.showPopulation" v-show="ssrkPanelOpen" />
    <config v-if="effectiveFeature.showConfig" @save="handleConfigSave" />
    <WeatherPanel v-if="effectiveFeature.showWeather" />
    <circleQueryPanel v-if="effectiveFeature.showCircleQuery" />

    <!-- 路线 Y B-6c：调派变体专属面板（原 DispatchMapPage 迁入，isDispatchVariant 响应式） -->
    <div v-if="dispatchVariant" class="dispatch-variant-ui">
      <DispatchT1Panel
        :map="dispatchOlMap"
        @dispatch="handleDispatch"
        @query-success="handleQuerySuccess"
        @error="handleDispatchError"
      />
      <!-- 图层工具栏已并入主图 <layers>（双变体共用，按 activeMode 隐藏表过滤），不再独立渲染 -->
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
