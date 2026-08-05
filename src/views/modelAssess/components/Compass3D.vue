<!--
  @Description: 指南针 + 三维视角调节（与 ThreeViewer 主警情相机联动）
  @FilePath: \ids-gis-web\src\views\modelAssess\components\Compass3D.vue
-->
<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useModelAssessStore } from '@/store/useModelAssessStore'
import { useThreeController } from '../composables/useThreeController'

const store = useModelAssessStore()
const { pitchAngle, rotationAngle } = storeToRefs(store)

const { state: ctrlState, updatePitchRotation, resetView } = useThreeController()
const is3DReady = computed(() => ctrlState.hasController)

/** 滑块 input → 同时更新 store（用于显示） + 调用控制器（驱动 3D 相机） */
const onPitch = (e: Event) => {
  const v = Number((e.target as HTMLInputElement).value)
  store.setPitchAngle(v)
  updatePitchRotation(v, rotationAngle.value)
}
const onRotation = (e: Event) => {
  const v = Number((e.target as HTMLInputElement).value)
  store.setRotationAngle(v)
  updatePitchRotation(pitchAngle.value, v)
}

const onReset = () => {
  // 1) 复位 store（用于 slider 显示）
  store.resetView()
  // 2) 复位 3D 相机（包含位置 + 视角）
  resetView()
}
</script>

<template>
  <div class="compass-3d">
    <div class="compass">
      <div class="needle" :style="{ transform: `rotate(${rotationAngle}deg)` }"></div>
    </div>
    <div style="font-size: 10px; color: #8a96b0">旋转角 {{ rotationAngle }}°</div>

    <div class="view-control">
      <div class="item">
        <div class="label">
          <span>📐 俯仰角 (Pitch)</span>
          <span class="val">{{ pitchAngle }}°</span>
        </div>
        <input
          type="range"
          min="0"
          max="80"
          :value="pitchAngle"
          :disabled="!is3DReady"
          @input="onPitch"
        />
      </div>
      <div class="item">
        <div class="label">
          <span>🧭 方位角 (Rotation)</span>
          <span class="val">{{ rotationAngle }}°</span>
        </div>
        <input
          type="range"
          min="-180"
          max="180"
          :value="rotationAngle"
          :disabled="!is3DReady"
          @input="onRotation"
        />
      </div>
      <button
        class="reset-btn"
        :disabled="!is3DReady"
        :title="is3DReady ? '复位到 3D 模型默认视角' : '3D 模型加载中...'"
        @click="onReset"
      >
        ↺ 复位视角
      </button>
      <div v-if="!is3DReady" class="hint">⏳ 等待 3D 模型加载...</div>
    </div>
  </div>
</template>

<style lang="less" scoped>
@import '../styles/model-assess.less';

.reset-btn {
  background: transparent;
  border: 1px solid #1f2940;
  color: #8a96b0;
  padding: 4px 8px;
  font-size: 11px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.2s;
}

.reset-btn:hover:not(:disabled) {
  color: #ff7a00;
  border-color: #ff7a00;
}

.reset-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hint {
  font-size: 10px;
  color: #5b6478;
  text-align: center;
  padding: 2px 0;
}
</style>
