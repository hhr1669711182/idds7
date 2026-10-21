<script setup>
import gridControl from "./gridControl.vue";
import waterMarkerControl from "./waterMarkerControl.vue";
import swipeControl from "./swipeControl.vue";
import { useResponsive } from "../../../composables/useResponsive.ts";

const { isMobile } = useResponsive();
</script>

<template>
  <div class="drag-panel" :class="{ 'is-mobile': isMobile }">
    <gridControl />
    <waterMarkerControl />
    <swipeControl />
  </div>
</template>

<style scoped lang="less">
.drag-panel {
  position: absolute;
  background: var(--widget-bg);
  border: 1px solid var(--widget-border);
  border-radius: var(--radius-md);
  top: 5px;
  right: 80px;
  color: var(--widget-text);
  padding: 2px 6px;
  font-size: 12px;
  line-height: 20px;
  z-index: 5;
  display: flex;
  backdrop-filter: blur(var(--glass-blur));
  > div {
    margin-right: 20px;
  }
}

/* 移动端适配 */
.drag-panel.is-mobile {
  top: 10px;
  right: 80px;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 8px;
  border-radius: var(--radius-md);
  box-shadow: var(--panel-shadow);
}

.drag-panel.is-mobile > div {
  margin-right: 0;
  margin-bottom: 0;
}

/* 响应式调整 */
@media (max-width: 480px) {
  .drag-panel.is-mobile {
    padding: 6px;
    gap: 8px;
  }
}
</style>
