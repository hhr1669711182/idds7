<script setup lang="ts">
/**
 * 独立 Demo 入口：自带 mock map，挂载 MarkDrawSurface
 */
import { onMounted, onBeforeUnmount, ref, shallowRef } from "vue";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import { fromLonLat } from "ol/proj";
import MarkDrawSurface from "../components/MarkDrawSurface.vue";

const mapEl = ref<HTMLDivElement | null>(null);
const olMap = shallowRef<Map | null>(null);

onMounted(() => {
  if (!mapEl.value) return;
  const map = new Map({
    target: mapEl.value,
    layers: [new TileLayer({ source: new OSM() })],
    view: new View({ center: fromLonLat([114.3, 30.6]), zoom: 12 }),
  });
  olMap.value = map;
});

onBeforeUnmount(() => {
  olMap.value?.setTarget(undefined);
});
</script>

<template>
  <div class="md-demo">
    <div ref="mapEl" class="md-demo-map" />
    <MarkDrawSurface v-if="olMap" :map="olMap" />
  </div>
</template>

<style scoped>
.md-demo {
  position: relative;
  width: 100%;
  height: 100vh;
}
.md-demo-map {
  position: absolute;
  inset: 0;
}
</style>
