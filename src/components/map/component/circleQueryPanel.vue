<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { EventBus } from "@/utils/mitt";
import { usePanelStore } from "@/store";
import { PANEL_TYPES } from "@/const";
import {
  ALL_RESOURCE_TYPES,
  type CircleQuerySourceData,
  type CircleQueryPatch,
} from "../MapTools/drawMapTools/CircleQueryTool";
import type { CircleQueryTool } from "../MapTools/drawMapTools/CircleQueryTool";

type AnyTool = CircleQueryTool | any;

const panelStore = usePanelStore();

const visible = ref(false);
const data = ref<CircleQuerySourceData | null>(null);
let currentTool: AnyTool | null = null;

const RADIUS_MIN_METERS = 200;
const RADIUS_MAX_METERS = 5000;
const RADIUS_STEP_METERS = 100;

const radiusMeters = ref<number>(RADIUS_MIN_METERS);
const selectedTypes = ref<string[]>(ALL_RESOURCE_TYPES.map((i) => i.key));

const emitPatch = (patch: CircleQueryPatch) => {
  if (!currentTool) return;
  if (typeof currentTool.applyPatch === "function") {
    currentTool.applyPatch(patch);
  }
};

const onSliderChange = (val: any) => {
  const v = Math.round(val);
  if (!v || v < RADIUS_MIN_METERS || v > RADIUS_MAX_METERS) return;
  // 立即更新本地显示
  radiusMeters.value = v;
  // 同步更新 tool 状态
  if (currentTool) {
    currentTool._radiusMeters = v;
  }
  emitPatch({ radiusMeters: v });
};

const onToggleType = (key: string, checked: boolean) => {
  const cur = new Set(selectedTypes.value);
  if (checked) cur.add(key);
  else cur.delete(key);
  const next = ALL_RESOURCE_TYPES.map((t) => t.key).filter((k) => cur.has(k));
  selectedTypes.value = next;
  emitPatch({ resourceTypes: next });
};

const handleClose = () => {
  // 仅隐藏配置面板，不销毁圈选工具
  panelStore.clearCircleQueryTool();
  visible.value = false;
  data.value = null;
  panelStore.setPanelType(PANEL_TYPES.NULL);
};

const onToolUpdate = (payload: unknown) => {
  const next = payload as CircleQuerySourceData;
  data.value = next;
  if (next && typeof next.radiusMeters === "number" && next.radiusMeters > 0) {
    radiusMeters.value = Math.round(next.radiusMeters);
  }
  if (next && Array.isArray(next.resourceTypes)) {
    selectedTypes.value = [...next.resourceTypes];
  }
};

const onToolClose = () => {
  visible.value = false;
  data.value = null;
  currentTool = null;
  panelStore.clearCircleQueryTool();
};

const bind = (tool: AnyTool | null) => {
  currentTool = tool;
  if (currentTool && typeof currentTool.getSourceData === "function") {
    const snap = currentTool.getSourceData() as CircleQuerySourceData;
    data.value = snap;
    if (snap && typeof snap.radiusMeters === "number" && snap.radiusMeters > 0) {
      radiusMeters.value = Math.round(snap.radiusMeters);
    }
    if (snap && Array.isArray(snap.resourceTypes)) {
      selectedTypes.value = [...snap.resourceTypes];
    }
  } else {
    data.value = null;
  }
  visible.value = !!currentTool;
};

const stopWatchTool = watch(
  () => panelStore.circleQueryTool,
  (tool) => bind(tool ?? null),
  { immediate: true }
);

onMounted(() => {
  EventBus.on("circle-query:update", onToolUpdate as any);
  EventBus.on("circle-query:close", onToolClose as any);
  // 兜底：若在面板挂载前工具已发过 update，主动拉取一次
  if (currentTool && typeof currentTool.getSourceData === "function") {
    onToolUpdate(currentTool.getSourceData());
  }
});

onBeforeUnmount(() => {
  stopWatchTool();
  EventBus.off("circle-query:update");
  EventBus.off("circle-query:close");
});
</script>

<template>
  <transition name="cq-fade">
    <div v-if="visible" class="cq-panel">
      <div class="cq-header">
        <span class="cq-title">圈选查询</span>
        <span class="cq-close" role="img" tabindex="-1" @click="handleClose">
          <svg width="1em" height="1em" fill="currentColor" aria-hidden="true" focusable="false">
            <use xlink:href="#icon-close"></use>
          </svg>
        </span>
      </div>

      <div class="cq-body">
        <div class="cq-section">
          <div class="cq-section-header">
            <div class="cq-section-title">搜索半径</div>
            <div class="cq-radius-value">{{ (radiusMeters / 1000).toFixed(2) }} 公里</div>
          </div>
          <div class="cq-radius">
            <el-slider
              :model-value="radiusMeters"
              :min="RADIUS_MIN_METERS"
              :max="RADIUS_MAX_METERS"
              :step="RADIUS_STEP_METERS"
              :show-tooltip="true"
              :format-tooltip="(v: number) => `${(v / 1000).toFixed(2)} 公里`"
              @update:modelValue="onSliderChange"
            />
            <div class="cq-radius-labels">
              <span>{{ (RADIUS_MIN_METERS / 1000).toFixed(1) }}km</span>
              <span>{{ (RADIUS_MAX_METERS / 1000).toFixed(1) }}km</span>
            </div>
          </div>
        </div>

        <div class="cq-divider" />

        <div class="cq-section">
          <div class="cq-section-title">设施类型</div>
          <div class="cq-types">
            <label
              v-for="t in ALL_RESOURCE_TYPES"
              :key="t.key"
              class="cq-type"
              :class="{ active: selectedTypes.includes(t.key) }"
            >
              <el-checkbox
                :model-value="selectedTypes.includes(t.key)"
                @update:modelValue="(v: boolean | string | number) => onToggleType(t.key, Boolean(v))"
              />
              <span class="cq-type-dot" :style="{ background: t.color }" />
              <span class="cq-type-label">{{ t.label }}</span>
              <span class="cq-type-count" :class="{ dim: !selectedTypes.includes(t.key) }">
                {{ data?.stats.perType[t.key] ?? 0 }}
              </span>
            </label>
          </div>
        </div>

        <div class="cq-divider" />

        <div class="cq-section">
          <div class="cq-result">
            <span class="cq-result-label">查询结果</span>
            <span class="cq-result-num">{{ data?.stats.total ?? 0 }}</span>
            <span class="cq-result-unit">个</span>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped lang="less">
.cq-panel {
  position: absolute;
  left: 16px;
  top: 64px;
  width: 360px;
  z-index: 6;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  box-shadow: var(--panel-shadow);
  color: var(--text-primary);
  font-size: 13px;
  overflow: hidden;
}

.cq-header {
  background: var(--header-bg);
  color: var(--header-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 40px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.cq-title { letter-spacing: 1px; }
.cq-close { cursor: pointer; font-size: 16px; color: var(--header-text); }

.cq-body {
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cq-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0 -2px;
}

.cq-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cq-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.cq-section-title {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
}

.cq-radius {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 2px;
}

.cq-radius-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
}

.cq-radius-value {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: rgba(39, 210, 255, 0.25);
  padding: 2px 10px;
  border-radius: 4px;
}

.cq-types {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 2px;
}

.cq-type {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
}

.cq-type-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex: 0 0 auto;
}

.cq-type-label {
  color: var(--text-primary);
  flex: 1;
}

.cq-type-count {
  font-size: 16px;
  font-weight: 600;
  color: var(--accent-cyan);
}

.cq-type-count.dim {
  opacity: 0.45;
}

.cq-result {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(39, 210, 255, 0.08);
  border-radius: 6px;
}

.cq-result-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.cq-result-num {
  font-size: 26px;
  font-weight: 700;
  color: var(--accent-cyan);
  line-height: 1;
}

.cq-result-unit {
  font-size: 13px;
  color: var(--text-secondary);
}

html[data-theme="NIGHT"] {
  .cq-type :deep(.el-checkbox__inner) {
    border-color: rgba(39, 210, 255, 0.45);
    background: rgba(0, 0, 0, 0.25);
  }
  .cq-type :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
    border-color: var(--accent-cyan);
    background: var(--accent-cyan);
  }
}

.cq-fade-enter-active,
.cq-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.cq-fade-enter-from,
.cq-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

// 滑块样式优化
:deep(.el-slider__runway) {
  background: rgba(255, 255, 255, 0.1);
  height: 4px;
}

:deep(.el-slider__bar) {
  background: var(--accent-cyan);
  height: 4px;
}

:deep(.el-slider__button-wrapper) {
  .el-slider__button {
    width: 14px;
    height: 14px;
    border: 2px solid var(--accent-cyan);
    background: var(--panel-bg);
  }
}
</style>