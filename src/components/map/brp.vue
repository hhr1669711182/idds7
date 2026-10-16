<!--
 * @Author: huanghuanrong
 * @Date: 2026-04-16 14:00:56
 * @LastEditTime: 2026-10-14 20:05:00
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\components\map\brp.vue
-->
<script setup lang="ts">
import { onBeforeUnmount, toRaw, ref, watch } from "vue";
import { toLonLat } from "ol/proj";
import type { Coordinate } from "ol/coordinate";
import { useCurrentMap } from "@/composables/useCurrentMap";
import { CENTER } from "@/baseComponent/OpenlayersMap/const.map";
import { copyTextToClipboard } from "@/utils/clipboard";
import { formatLngLat, type LngLat } from "@/utils/coordTransform";

const { currentMap: MapInstance } = useCurrentMap();

/** 地图中心点兜底值：鼠标尚未移入地图时作为面板初始显示与复制来源 */
const DEFAULT_LNG_LAT: LngLat = [CENTER[0], CENTER[1]];

const coordinate = ref(
  `经度：${DEFAULT_LNG_LAT[0].toFixed(3)}°, 纬度: ${DEFAULT_LNG_LAT[1].toFixed(3)}°`,
);
/** 当前光标位置的经纬度，面板单击时作为复制来源 */
const currentLngLat = ref<LngLat>([...DEFAULT_LNG_LAT]);
let boundMap: any = null;

const handler = (evt: { coordinate: Coordinate }) => {
  const lngLat = toLonLat(evt.coordinate) as LngLat;
  currentLngLat.value = lngLat;
  coordinate.value = `经度：${lngLat[0].toFixed(3)}°, 纬度: ${lngLat[1].toFixed(3)}°`;
};

/** 单击面板：把当前显示的经纬度按 "经度,纬度" 复制到剪贴板 */
const copyCoordinate = () =>
  copyTextToClipboard(formatLngLat(currentLngLat.value));

// map 实例由父组件异步 setMap 写入 store，onMounted 时尚未就绪，故用 watch 等待
watch(
  MapInstance,
  (val) => {
    const map = toRaw(val) as any;
    if (!map || Object.keys(map).length === 0) return;
    if (boundMap === map) return; // 防止重复绑定
    if (boundMap) boundMap.un("pointermove", handler);
    map.on("pointermove", handler);
    boundMap = map;
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  boundMap?.un("pointermove", handler);
});
</script>

<template>
  <div class="brp" title="点击复制经纬度" @click="copyCoordinate">
    {{ coordinate }}
  </div>
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
  cursor: pointer;
  user-select: none;
}

html[data-theme="NIGHT"] {
  .brp {
    backdrop-filter: blur(4px);
  }
}
</style>
