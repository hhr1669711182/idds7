<!--
 * @Author: hhr
 * @Date: 2026-05-15 17:08:09
 * @LastEditTime: 2026-10-26 15:44:01
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\baseComponent\OpenlayersMap\ZoomLevelControl.vue
-->
<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  zoom?: number | null;
}>();

const displayZoom = computed(() => {
  if (!Number.isFinite(props.zoom)) return "-";

  const zoom = Math.round(Number(props.zoom) * 10) / 10;
  return Number.isInteger(zoom) ? String(zoom) : zoom.toFixed(0);
});
</script>

<template>
  <div class="zoom_level_control ol-unselectable" aria-label="当前缩放层级">
    <span class="zoom_level_value">{{ displayZoom }}</span>
  </div>
</template>

<style scoped>
.zoom_level_control {
  position: absolute;
  top: calc(100% - 180px);
  left: 0.5em;
  z-index: 1;
  border-radius: var(--radius-md);
  background-color: var(--widget-bg);
  backdrop-filter: blur(var(--glass-blur));
  pointer-events: auto;
}

.zoom_level_value {
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 36px;
  height: 36px;
  margin: 1px;
  border-radius: var(--radius-sm);
  border: 0;
  background-color: var(--panel-bg-solid);
  color: var(--text-secondary);
  font: bold 1.14em/1.375em sans-serif;
}

:global(.is-mobile) .zoom_level_control {
  top: calc(100% - 174px);
}

:global(.is-mobile) .zoom_level_value {
  width: 44px;
  height: 44px;
}
</style>
