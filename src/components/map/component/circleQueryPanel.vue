<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed } from "vue";
import Slider from "@/baseComponent/Slider.vue";
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

const RADIUS_MIN_KM = 0.2;
const RADIUS_MAX_KM = 5;

const radiusKm = computed({
  get: () => (data.value ? data.value.radiusMeters / 1000 : 0),
  set: (v: number) => {
    if (!data.value) return;
    const meters = Math.max(50, Math.round(v * 1000));
    emitPatch({ radiusMeters: meters });
  },
});

const selectedTypes = computed<string[]>({
  get: () => data.value?.resourceTypes ?? ALL_RESOURCE_TYPES.map((i) => i.key),
  set: (list) => emitPatch({ resourceTypes: list }),
});

const emitPatch = (patch: CircleQueryPatch) => {
  if (!currentTool) return;
  currentTool.applyPatch(patch);
};

const onToggleType = (key: string, checked: boolean) => {
  const cur = new Set(selectedTypes.value);
  if (checked) cur.add(key);
  else cur.delete(key);
  emitPatch({ resourceTypes: Array.from(cur) });
};

const handleClose = () => {
  if (currentTool) {
    currentTool.destroy();
    currentTool = null;
  }
  visible.value = false;
  data.value = null;
  panelStore.setPanelType(PANEL_TYPES.NULL);
};

onMounted(() => {
  EventBus.on(
    "circle-query:open",
    ((payload: unknown) => {
      const p = payload as { uuid: string; tool: AnyTool } | undefined;
      currentTool = p?.tool ?? null;
      if (currentTool && typeof currentTool.getSourceData === "function") {
        data.value = currentTool.getSourceData();
      }
      visible.value = true;
    }) as any,
  );

  EventBus.on(
    "circle-query:close",
    (() => {
      visible.value = false;
      data.value = null;
      currentTool = null;
    }) as any,
  );

  EventBus.on(
    "circle-query:update",
    ((payload: unknown) => {
      data.value = payload as CircleQuerySourceData;
    }) as any,
  );
});

onBeforeUnmount(() => {
  EventBus.off("circle-query:open");
  EventBus.off("circle-query:close");
  EventBus.off("circle-query:update");
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
          <div class="cq-section-title">搜索半径</div>
          <div class="cq-radius">
            <Slider
              :value="Number(radiusKm.toFixed(2))"
              :min="RADIUS_MIN_KM"
              :max="RADIUS_MAX_KM"
              :step="0.1"
              @change="(v: number) => (radiusKm = v)"
            />
            <div class="cq-radius-value">{{ radiusKm.toFixed(2) }} 千米</div>
          </div>
        </div>

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
            </label>
          </div>
        </div>

        <div class="cq-section">
          <div class="cq-section-title">圈内资源统计</div>
          <div class="cq-stats">
            <div class="cq-stats-total">
              <span class="cq-stats-num">{{ data?.stats.total ?? 0 }}</span>
              <span class="cq-stats-unit">个</span>
            </div>
            <div class="cq-stats-list">
              <div
                v-for="t in ALL_RESOURCE_TYPES"
                :key="t.key"
                class="cq-stats-row"
                :class="{ dim: !selectedTypes.includes(t.key) }"
              >
                <span class="cq-type-dot" :style="{ background: t.color }" />
                <span class="cq-stats-label">{{ t.label }}</span>
                <span class="cq-stats-count">{{ data?.stats.perType[t.key] ?? 0 }}</span>
              </div>
            </div>
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
  width: 280px;
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

.cq-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cq-section-title {
  background: var(--card-bg);
  border-left: 3px solid var(--accent-cyan);
  color: var(--text-secondary);
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 600;
}

.cq-radius {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 4px;
}

.cq-radius-value {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: right;
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
  gap: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  padding: 2px 0;
}

.cq-type.active .cq-type-label { color: var(--text-primary); }

.cq-type-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.cq-type-label {
  color: var(--text-secondary);
  flex: 1;
}

.cq-stats {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 4px 6px;
}

.cq-stats-total {
  display: flex;
  align-items: baseline;
  gap: 4px;
  color: var(--accent-cyan);
}

.cq-stats-num {
  font-size: 26px;
  font-weight: 700;
  line-height: 1;
}

.cq-stats-unit { font-size: 12px; color: var(--text-secondary); }

.cq-stats-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.cq-stats-row {
  display: grid;
  grid-template-columns: 12px 1fr auto;
  gap: 6px;
  align-items: center;
}

.cq-stats-row.dim {
  opacity: 0.45;
}

.cq-stats-label { color: var(--text-secondary); }
.cq-stats-count {
  color: var(--text-primary);
  font-weight: 600;
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
</style>
