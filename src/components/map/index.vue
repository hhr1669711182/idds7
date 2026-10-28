<!--
 * @Author: hhr
 * @Date: 2026-05-21 19:13:51
 * @LastEditTime: 2026-09-21 16:53:04
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\components\map\index.vue
-->
<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import { nextTick, onActivated, onMounted, onUnmounted, shallowRef } from "vue";
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

import OpenlayersMap from "../../baseComponent/OpenlayersMap/map.vue";
import {
  useMapConfigStore,
  useMapStore,
  usePanelStore,
} from "@/store/index.ts";
import { useLayersStore } from "@/store/useLayersStore";
import { useTabsStore } from "@/store/useTabsStore";
import { PANEL_TYPES } from "../../const/const.panel.ts";
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

const { type, ssrkPanelOpen } = storeToRefs(PanelStore);
const openLayersMapRef = shallowRef<OpenlayersMapExpose | null>(null);
const { feature } = storeToRefs(mapConfigStore);
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
