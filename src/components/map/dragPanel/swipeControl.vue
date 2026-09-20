<!--
 * @Author: hhr
 * @Date: 2026-08-18 19:38:38
 * @LastEditTime: 2026-09-17 11:19:01
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\components\map\dragPanel\swipeControl.vue
-->
<script setup>
import { toRaw, markRaw } from "vue";
import { storeToRefs } from "pinia";
import { Graticule } from "ol/layer";
import { useMapStore } from "../../../store/index";
import {
  GRID_LAYER,
  LAYER_NAMES,
} from "../../../baseComponent/OpenlayersMap/layers";
import SwipeControl from "@/composables/Swiper/Swiper";

const mapStore = useMapStore();

const { showSwipe, map } = storeToRefs(mapStore);

let swipeLayer;

const getLayer = () => {
  const mapInstance = markRaw(toRaw(map.value));
  const layer = mapInstance
    .getLayers()
    .getArray()
    .find((i) => i.getClassName() == LAYER_NAMES.GOOGLE_LAYER);
  if (!layer) {
    new Error("未找到卷帘图层");
  }
  return layer;
};
const swiperControl = new SwipeControl();
const changeHandle = (visible) => {
  const mapInstance = markRaw(toRaw(map.value));
  if (!swipeLayer) {
    swipeLayer = getLayer();
  }
  swipeLayer.setVisible(visible);
  if (visible) {
    mapInstance.addControl(swiperControl);
  } else {
    mapInstance.removeControl(swiperControl);
  }
};
</script>

<template>
  <div>
    <el-checkbox label="卷帘" v-model="showSwipe" @change="changeHandle" />
  </div>
</template>

<style scoped></style>