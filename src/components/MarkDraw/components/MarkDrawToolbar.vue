<script setup lang="ts">
/**
 * 工具栏：玻璃风格 + 发光激活态 + 自写 tooltip
 * 图标直接复用地图侧 sprite（public/icons.svg，App.vue 注入 #svgBase），不再自绘 SVG
 */
import { ref } from "vue";
import type { MarkDrawToolType } from "../engine/types";

interface ToolItem {
  type: MarkDrawToolType;
  label: string;
  /** sprite 符号 id，对应 #svgBase 内 <symbol id="icon-*"> */
  symbolId: string;
  group: "draw" | "measure" | "select" | "military";
}

const props = defineProps<{
  activeTool: MarkDrawToolType | null;
  /** 是否存在可清除的绘制要素 */
  hasElements?: boolean;
}>();
const emit = defineEmits<{
  (e: "tool-change", tool: MarkDrawToolType | null): void;
  (e: "clear"): void;
}>();

const tools: ToolItem[] = [
  // 标绘
  { type: "Point", label: "标点", group: "draw", symbolId: "icon-point" },
  { type: "LineString", label: "标线", group: "draw", symbolId: "icon-line" },
  { type: "Polygon", label: "标面", group: "draw", symbolId: "icon-polygon" },
  { type: "Circle", label: "画圆", group: "draw", symbolId: "icon-circle" },
  { type: "Rect", label: "画矩形", group: "draw", symbolId: "icon-rect" },
  // 量算
  { type: "MEASUREDISTANCE", label: "测距", group: "measure", symbolId: "icon-measure-distance" },
  { type: "MEASUREANGLE", label: "量角", group: "measure", symbolId: "icon-protractor" },
  { type: "MEASUREPOLYGON", label: "测面", group: "measure", symbolId: "icon-measure-polygon" },
  { type: "AZIMUTH", label: "方位角", group: "measure", symbolId: "icon-azimuth" },
  // 圈选 / 选择
  { type: "MEASURELENGTH", label: "框选放大", group: "select", symbolId: "icon-select-extent" },
  // 军标
  { type: "MILITARY_ARROW", label: "军标箭头", group: "military", symbolId: "icon-jiantou" },
  { type: "MILITARY_DOUBLE_LINE", label: "双线箭头", group: "military", symbolId: "icon-transfer" },
  { type: "MILITARY_CURVE", label: "曲线箭头", group: "military", symbolId: "icon-right-direction" },
  { type: "MILITARY_CLUSTER_ARROW", label: "聚集箭头", group: "military", symbolId: "icon-ascending-order" },
  { type: "MILITARY_TACTIC", label: "战术符号", group: "military", symbolId: "icon-cross" },
];

const hoverIdx = ref<number | null>(null);
const clearHover = ref(false);

/** 上一项与当前项不同组时，在其前面画一条分隔线 */
const needDivider = (idx: number) => idx > 0 && tools[idx].group !== tools[idx - 1].group;

const onClick = (tool: MarkDrawToolType) => {
  emit("tool-change", props.activeTool === tool ? null : tool);
};
</script>

<template>
  <div class="md-toolbar">
    <div class="md-toolbar__list">
      <template v-for="(t, idx) in tools" :key="t.type">
        <span v-if="needDivider(idx)" class="md-toolbar__divider" />
        <button
          class="md-tool"
          :class="{ active: activeTool === t.type }"
          @click="onClick(t.type)"
          @mouseenter="hoverIdx = idx"
          @mouseleave="hoverIdx = null"
        >
          <svg class="md-tool__icon" aria-hidden="true">
            <use :xlink:href="`#${t.symbolId}`" />
          </svg>
          <span v-if="hoverIdx === idx" class="md-tool__tip">{{ t.label }}</span>
        </button>
      </template>
    </div>

    <span class="md-toolbar__divider md-toolbar__divider--tail" />

    <!-- 清除元素：只清地图上的绘制与查询图元，不动数据库 -->
    <button
      class="md-tool md-tool--clear"
      :disabled="!hasElements"
      title="清除元素"
      @click="emit('clear')"
      @mouseenter="clearHover = true"
      @mouseleave="clearHover = false"
    >
      <svg class="md-tool__icon" aria-hidden="true">
        <use xlink:href="#icon-delete" />
      </svg>
      <span v-if="clearHover" class="md-tool__tip md-tool__tip--tail">清除元素</span>
    </button>
  </div>
</template>

<style scoped>
.md-toolbar {
  position: absolute;
  right: 12px;
  top: 12px;
  z-index: 8;
  display: flex;
  flex-direction: column;
  max-height: calc(100% - 24px);
  padding: 6px;
  border-radius: var(--md-radius);
  background: var(--md-panel);
  border: 1px solid var(--md-border);
  box-shadow: var(--md-shadow);
  backdrop-filter: var(--md-blur);
  -webkit-backdrop-filter: var(--md-blur);
}
/* 按钮列表可滚动，底部「清除元素」常驻可见 */
.md-toolbar__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}
.md-toolbar__list::-webkit-scrollbar {
  width: 4px;
}
.md-toolbar__list::-webkit-scrollbar-thumb {
  background: var(--md-border-strong);
  border-radius: 2px;
}
.md-toolbar__divider {
  display: block;
  flex-shrink: 0;
  height: 1px;
  margin: 3px 4px;
  background: var(--md-border);
}
.md-toolbar__divider--tail {
  margin: 6px 4px;
}
.md-tool {
  position: relative;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid transparent;
  background: rgba(20, 30, 48, 0.5);
  color: var(--md-text-2);
  cursor: pointer;
  transition: all 0.18s ease;
}
:root:not([data-theme="NIGHT"]) .md-tool {
  background: rgba(255, 255, 255, 0.55);
}
.md-tool:hover:not(:disabled) {
  border-color: var(--md-border-strong);
  color: var(--md-accent-1);
  transform: translateX(-2px);
  box-shadow: 0 4px 14px rgba(0, 212, 255, 0.18);
}
.md-tool.active {
  background: linear-gradient(135deg, var(--md-accent-1), var(--md-accent-2));
  color: #0a1525;
  border-color: transparent;
  box-shadow: 0 4px 18px var(--md-accent-glow), inset 0 0 8px rgba(255, 255, 255, 0.18);
}
.md-tool:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.md-tool--clear:hover:not(:disabled) {
  color: var(--md-danger);
  border-color: var(--md-danger);
  box-shadow: 0 4px 14px rgba(245, 54, 92, 0.25);
}
.md-tool__icon {
  width: 18px;
  height: 18px;
  fill: currentColor;
  pointer-events: none;
}
.md-tool__tip {
  position: absolute;
  right: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
  background: var(--md-panel-solid);
  border: 1px solid var(--md-border-strong);
  color: var(--md-text);
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  z-index: 10;
  animation: md-tool-tip-in 0.14s ease forwards;
}
.md-tool__tip::after {
  content: "";
  position: absolute;
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  border: 5px solid transparent;
  border-left-color: var(--md-border-strong);
}
.md-tool__tip--tail {
  top: auto;
  bottom: -2px;
  transform: none;
}
.md-tool__tip--tail::after {
  top: 50%;
}
@keyframes md-tool-tip-in {
  from {
    opacity: 0;
    transform: translate(4px, -50%);
  }
  to {
    opacity: 1;
    transform: translate(0, -50%);
  }
}
.md-tool__tip--tail {
  animation-name: md-tool-tip-in-tail;
}
@keyframes md-tool-tip-in-tail {
  from {
    opacity: 0;
    transform: translateX(4px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
