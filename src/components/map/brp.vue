<!--
 * @Author: huanghuanrong
 * @Date: 2026-04-16 14:00:56
 * @LastEditTime: 2026-08-31 15:25:54
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\components\map\brp.vue
-->
<script setup lang="ts">
import { onMounted, nextTick, toRaw, ref, markRaw } from "vue";
// import { onMounted, nextTick, toRaw, ref, markRaw } from "vue";
// import { storeToRefs } from "pinia";
import { transform } from "ol/proj";
import { useCurrentMap } from "@/composables/useCurrentMap";
// import { Coordinate } from "ol/coordinate";
import type { Coordinate } from "ol/coordinate";//T1调派修改

const { currentMap: MapInstance } = useCurrentMap();

const coordinate = ref("");

const initEvent = () => {
//     const mapInstance: any = markRaw(toRaw(MapInstance.value));
//  if(Object.keys(mapInstance).length==0){
//       return
//  }
  const mapInstance: any = toRaw(MapInstance.value);// T1调派修改
  if (!mapInstance || Object.keys(mapInstance).length === 0) return;// T1调派修改
  mapInstance?.on("pointermove", (evt: { coordinate: Coordinate; }) => {
    var lonLat = transform(evt.coordinate, "EPSG:3857", "EPSG:4326");
    if (lonLat && lonLat.length) {
      var lon = ((((lonLat[0] + 180) % 360) + 360) % 360) - 180;
      coordinate.value = `经度：${lon.toFixed(3)}°, 纬度: ${lonLat[1].toFixed(
        3
      )}°`;
    }
  });
};
onMounted(() => {
  nextTick(() => {
    initEvent();
  });
});
</script>

<template>
  <div class="brp">{{ coordinate }}</div>
</template>

<style scoped>
.brp {
  display: block;
  position: absolute;
  background: var(--widget-bg);
  border: 1px solid var(--widget-border);
  bottom: 8px;
  right: 8px;
  color: var(--widget-text);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 20px;
  z-index: 5;
}

html[data-theme="NIGHT"] {
  .brp {
    backdrop-filter: blur(4px);
  }
}
</style>