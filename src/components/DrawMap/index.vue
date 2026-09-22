<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import { nextTick, onActivated, onMounted, onUnmounted, shallowRef } from "vue";
import { storeToRefs } from "pinia";

import tlp from "@/components/map/compass.vue";
import trp from "@/components/map/trp.vue";
import card from "@/components/map/card.vue";
import clear from "@/components/map/clear.vue";
import brp from "@/components/map/brp.vue";
import topicLayerCard from "@/components/map/component/topicLayerCard.vue";
import baseSource from "@/components/map/component/baseSource.vue";
import bigPanel from "@/components/map/component/bigPanel.vue";
import config from "@/components/map/config.vue";
import layers from "@/components/map/layers.vue";
import ssrkPanel from "@/components/map/component/ssrkPanel.vue";

import OpenlayersMap from "@/baseComponent/OpenlayersMap/drawMap.vue";
import {
  useLayersStore,
  useMapConfigStore,
  useMapStore,
  usePanelStore,
  useTabsStore,
} from "@/store/index.ts";
import { PANEL_TYPES } from "@/const/const.panel.ts";
import type { LayerChangeHandler } from "@/components/map/layers.vue";

type OpenlayersMapExpose = {
  addLayer: (id: string) => boolean;
  removeLayer: (id: string) => boolean;
  syncLayers: (ids: string[], visible?: boolean) => void;
  visibleLayer: (id: string, bol: boolean) => void;
};

const MapStore = useMapStore();
const PanelStore = usePanelStore();
const tabsStore = useTabsStore();
const layersStore = useLayersStore();
const mapConfigStore = useMapConfigStore();

const { type, ssrkPanelOpen } = storeToRefs(PanelStore);
const openLayersMapRef = shallowRef<OpenlayersMapExpose | null>(null);
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
      map.renderSync();
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

    <!-- <topicLayerCard /> -->
    <baseSource />

    <clear />
    <card />
    <bigPanel />
    <!-- <config @save="handleConfigSave" /> -->
    <!-- <layers :onLayerChange="handleLayerChange" /> -->

    <ssrkPanel v-show="ssrkPanelOpen" />

    <WeatherPanel />
    <circleQueryPanel v-if="type == PANEL_TYPES.CIRCLE_QUERY" />
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
