<script setup lang="ts">
/**
 * markDraw 路由页面：承载 MarkDraw 系统
 *
 * 底图共用主地图那一套（AMAP_LAYER / GOOGLE_LAYER / VECTOR_LAYER / CENTER / ZOOM，
 * 均来自 baseComponent/OpenlayersMap），不再自建 OSM mock 地图，
 * 以保证 VECTOR_LAYER 的 className 与 map 侧工具查找键一致。
 */
import { onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import OLMap from "ol/Map";
import View from "ol/View";
import * as olProj from "ol/proj";
import { ScaleLine } from "ol/control";
import { readScaleLineUnit } from "@/config/scaleLine";
import {
  AMAP_LAYER,
  GOOGLE_LAYER,
  VECTOR_LAYER,
} from "@/baseComponent/OpenlayersMap/layers";
import { CENTER, ZOOM } from "@/baseComponent/OpenlayersMap/const.map";
import MarkDrawSurface from "@/components/MarkDraw/components/MarkDrawSurface.vue";

const mapEl = ref<HTMLDivElement | null>(null);
const olMap = shallowRef<OLMap | null>(null);

onMounted(() => {
  if (!mapEl.value) return;
  const map = new OLMap({
    target: mapEl.value,
    // 与 map 页面完全相同的底图与矢量图层装配
    layers: [AMAP_LAYER(), GOOGLE_LAYER, VECTOR_LAYER()],
    view: new View({
      center: olProj.fromLonLat(CENTER),
      zoom: ZOOM.INIT,
      minZoom: ZOOM.MIN,
      maxZoom: ZOOM.MAX,
    }),
  });
  map.addControl(new ScaleLine({ units: readScaleLineUnit() }));
  olMap.value = map;
});

onBeforeUnmount(() => {
  olMap.value?.setTarget(undefined);
  olMap.value?.dispose();
  olMap.value = null;
});
</script>

<template>
  <div class="markdraw-view">
    <div ref="mapEl" class="markdraw-view__map" />
    <MarkDrawSurface v-if="olMap" :map="olMap" />
  </div>
</template>

<style scoped>
.markdraw-view {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.markdraw-view__map {
  position: absolute;
  inset: 0;
}
:deep(.ol-control) {
  background-color: rgba(255, 255, 255, 0.8);
  border-radius: 2px;
}
:deep(.ol-control button) {
  width: 36px;
  height: 36px;
  font-size: 16px;
}
/* 缩放控件放到左下角，避开右侧工具栏与顶部信息条 */
:deep(.ol-zoom) {
  top: auto !important;
  bottom: 44px;
  left: 0.5em;
}
:deep(.ol-scale-line) {
  bottom: 0;
  left: 0.5em;
  z-index: 2;
}
</style>
