<!--
  @Description: 路线操作栏（重播路线 / 恢复全景视角 / 跟随车辆）
 * @FilePath: \ids-gis-web\src\views\modelAssess\components\RouteDebugPanel.vue
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useThreeController } from '../composables/useThreeController'

const {
  state: ctrlState,
  replayRouteAnimation,
  fitCameraToRoute,
  startFollowVehicle,
  stopFollowVehicle,
  isFollowVehicleEnabled,
} = useThreeController()

/* 跟随模式开关（轮询 500ms 同步 isFollowVehicleEnabled） */
const followEnabled = ref(false)
let pollTimer: number | null = null
onMounted(() => {
  pollTimer = window.setInterval(() => {
    followEnabled.value = isFollowVehicleEnabled()
  }, 500)
})
onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer)
})

const onReplay = () => replayRouteAnimation()
const onFitView = () => fitCameraToRoute()
const onToggleFollow = () => {
  if (isFollowVehicleEnabled()) {
    stopFollowVehicle()
  } else {
    startFollowVehicle()
  }
}
</script>

<template>
  <div class="route-op-bar">
    <button
      class="op-btn replay"
      :disabled="!ctrlState.hasController"
      title="重播车辆路线动画"
      @click="onReplay"
    >
      ▶ 重播路线
    </button>
    <button
      class="op-btn"
      :disabled="!ctrlState.hasController"
      title="相机自动框选到路线范围，恢复全景视角"
      @click="onFitView"
    >
      🌐 恢复全景视角
    </button>
    <button
      class="op-btn"
      :class="{ active: followEnabled }"
      :disabled="!ctrlState.hasController"
      :title="followEnabled ? '点击取消跟随' : '跟随第一辆车（动画结束后自动停止）'"
      @click="onToggleFollow"
    >
      {{ followEnabled ? '🎥 停止跟随' : '🎥 跟随车辆' }}
    </button>
  </div>
</template>

<style lang="less" scoped>
@import '../styles/model-assess.less';

.route-op-bar {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  gap: 6px;
  padding: 6px 8px;
  background: rgba(10, 14, 26, 0.85);
  border: 1px solid @ma-border;
  border-radius: 4px;
  z-index: 100;
  backdrop-filter: blur(4px);
}

.op-btn {
  background: transparent;
  border: 1px solid @ma-border;
  color: @ma-text;
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.op-btn:hover:not(:disabled) {
  border-color: @ma-orange;
  color: @ma-orange;
}
.op-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.op-btn.replay {
  background: linear-gradient(90deg, @ma-orange, #ff9500);
  border-color: @ma-orange;
  color: #fff;
  font-weight: 600;
}
.op-btn.replay:hover:not(:disabled) {
  box-shadow: 0 0 8px rgba(255, 122, 0, 0.6);
}
.op-btn.active {
  background: rgba(180, 100, 255, 0.15);
  border-color: #b464ff;
  color: #b464ff;
}
</style>
