<script setup lang="ts">
/**
 * 量算结果条：显示最近一次量算结果（测距 / 测面 / 量角 / 方位角）
 * 结果不落库，仅作展示，可手动关闭。
 */
import { computed } from "vue";
import type { MarkDrawToolType, MeasurePayload } from "../engine/types";

const props = defineProps<{
  activeTool: MarkDrawToolType | null;
  measure: MeasurePayload | null;
}>();
const emit = defineEmits<{ (e: "close"): void }>();

const labelMap = {
  distance: "测距结果",
  area: "测面结果",
  angle: "量角结果",
  azimuth: "方位角结果",
} as const;

const label = computed(() =>
  props.measure ? labelMap[props.measure.kind] : ""
);

const visible = computed(() => props.measure !== null);
</script>

<template>
  <div v-if="visible" class="md-result">
    <span class="md-result__bar" />
    <div class="md-result__body">
      <span class="md-result__label">{{ label }}</span>
      <span class="md-result__value">{{ measure?.text }}</span>
    </div>
    <button class="md-result__close" title="关闭" @click="emit('close')">×</button>
  </div>
</template>

<style scoped>
.md-result {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 96px;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 60%;
  padding: 8px 10px;
  border-radius: var(--md-radius);
  background: var(--md-panel);
  border: 1px solid var(--md-border);
  box-shadow: var(--md-shadow);
  backdrop-filter: var(--md-blur);
  -webkit-backdrop-filter: var(--md-blur);
  color: var(--md-text);
  font-size: 12px;
}
.md-result__bar {
  width: 3px;
  align-self: stretch;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--md-accent-1), var(--md-accent-2));
}
.md-result__body {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}
.md-result__label {
  color: var(--md-text-2);
  white-space: nowrap;
}
.md-result__value {
  font-size: 14px;
  font-weight: 600;
  color: var(--md-accent-1);
  white-space: nowrap;
}
.md-result__close {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--md-text-3);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}
.md-result__close:hover {
  color: var(--md-danger);
}
</style>