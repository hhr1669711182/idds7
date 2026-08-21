<!--
 * @Author: hhr
 * @Date: 2026-05-21 19:13:51
 * @LastEditTime: 2026-08-20 12:22:14
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\components\map\index.vue
-->
<script setup lang="ts">
import { onMounted, shallowRef, onActivated } from "vue";
import { storeToRefs } from "pinia";

import tlp from "./compass.vue";
import trp from "./trp.vue";
import card from "./card.vue";
import clear from "./clear.vue";
import brp from "./brp.vue";
import topicLayerCard from "./component/topicLayerCard.vue";
import baseSource from "./component/baseSource.vue";
import routePlan from "./component/routePlan.vue";
import bigPanel from "./component/bigPanel.vue";
import config from "./config.vue";
import layers from "./layers.vue";
import ssrkPanel from "./component/ssrkPanel.vue";

import OpenlayersMap from "../../baseComponent/OpenlayersMap/map.vue";
import {
  useLayersStore,
  useMapConfigStore,
  useMapStore,
  usePanelStore,
  useTabsStore,
} from "@/store/index.ts";
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
const tabsStore = useTabsStore();
const layersStore = useLayersStore();
const mapConfigStore = useMapConfigStore();

const { type, ssrkPanelOpen } = storeToRefs(PanelStore);
const openLayersMapRef = shallowRef<OpenlayersMapExpose | null>(null);
// const mapInstanceRef = shallowRef<any>(null);

const getMap = (map: any) => {
  // mapInstanceRef.value = map;
  MapStore.setMap(map);
  openLayersMapRef.value?.syncLayers(layersStore.checkedIds, true);
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

onActivated(() => {
  // if (mapInstanceRef.value) {
  //   MapStore.setMap(mapInstanceRef.value);
  // }
});
</script>

<template>
  <OpenlayersMap ref="openLayersMapRef" @setMap="getMap" />

  <tlp />
  <brp />
  <trp />

  <routePlan v-if="type == PANEL_TYPES.ROUTE_PLAN" />
  <topicLayerCard />
  <baseSource />

  <clear />
  <card />
  <bigPanel />
  <config @save="handleConfigSave" />
  <layers :onLayerChange="handleLayerChange" />

  <ssrkPanel v-show="ssrkPanelOpen" />
</template>

<style scoped>
</style>
