<script setup lang="ts">
/**
 * 工具栏：玻璃风格 + 发光激活态 + 自写 tooltip
 * 自带 SVG path 图标（不依赖外部 sprite）
 */
import { ref } from "vue";
import type { MarkDrawToolType } from "../engine/types";

interface ToolItem {
  type: MarkDrawToolType;
  label: string;
  /** SVG `d` 路径，渲染时统一 <path :d=…/> */
  d: string;
  group: "draw" | "measure" | "select" | "military";
}

const props = defineProps<{
  activeTool: MarkDrawToolType | null;
}>();
const emit = defineEmits<{
  (e: "tool-change", tool: MarkDrawToolType | null): void;
}>();

const tools: ToolItem[] = [
  // 标绘
  { type: "Point", label: "标点", group: "draw", d: "M12 2a7 7 0 017 7c0 5-7 13-7 13S5 14 5 9a7 7 0 017-7zm0 9.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" },
  { type: "LineString", label: "标线", group: "draw", d: "M3 17l5-5 4 4 4-7 5 5" },
  { type: "Polygon", label: "标面", group: "draw", d: "M4 6l8-3 8 6-3 11H7z" },
  { type: "Circle", label: "画圆", group: "draw", d: "M12 2a10 10 0 100 20 10 10 0 000-20zm0 4v12M2 12h20" },
  { type: "Rect", label: "画矩形", group: "draw", d: "M3 5h18v14H3z" },
  // 量算
  { type: "MEASUREDISTANCE", label: "测距", group: "measure", d: "M3 17l5-5 4 4 9-9m0 0v4m0-4h-4" },
  { type: "MEASUREANGLE", label: "量角", group: "measure", d: "M12 22a10 10 0 100-20 10 10 0 000 20zM3 12c4-6 14-6 18 0" },
  { type: "MEASUREPOLYGON", label: "测面", group: "measure", d: "M3 7h6v4H3zm9 0h9v4h-9zm0 6h9v4h-9zm-9 0h6v4H3z" },
  { type: "AZIMUTH", label: "方位角", group: "measure", d: "M5 12h14m-7-7v14m-4-2l8-10" },
  // 圈选 / 选择
  { type: "MEASURELENGTH", label: "框选放大", group: "select", d: "M5 3l4 4M19 3l-4 4M3 5l4-4M21 5l-4-4M5 21l4-4M19 21l-4-4M3 19l4 4M21 19l-4 4" },
  { type: "MEASUREAREA", label: "圈选查询", group: "select", d: "M12 2v6m0 8v6m-10-10h6m8 0h6" },
  { type: "POPULATION", label: "实时人口", group: "select", d: "M9 11a4 4 0 100-8 4 4 0 000 8zm6 0a3 3 0 100-6 3 3 0 000 6zm-9 9c0-3 1-7 6-7s6 4 6 7" },
  // 军标
  { type: "MILITARY_ARROW", label: "军标箭头", group: "military", d: "M3 12h13l-3-3m3 3l-3 3M16 6l5 6-5 6" },
  { type: "MILITARY_DOUBLE_LINE", label: "双线箭头", group: "military", d: "M3 17l4-10 4 10M7 17h6m2-10h6l-6 10" },
  { type: "MILITARY_CURVE", label: "曲线箭头", group: "military", d: "M3 18c4-12 14-12 18 0m0 0l-3-3m3 3l-3 3" },
  { type: "MILITARY_CLUSTER_ARROW", label: "聚集箭头", group: "military", d: "M3 4l7 14 2-7 7-2z" },
  { type: "MILITARY_TACTIC", label: "战术符号", group: "military", d: "M12 3l9 5v8l-9 5-9-5V8zm0 0v18M3 5h18M12 13l-9-5m9 5l9-5" },
];

const hoverIdx = ref<number | null>(null);

const onClick = (tool: MarkDrawToolType) => {
  emit("tool-change", props.activeTool === tool ? null : tool);
};
</script>

<template>
  <div class="md-toolbar">
    <button
      v-for="(t, idx) in tools"
      :key="t.type"
      class="md-tool"
      :class="{ active: activeTool === t.type }"
      @click="onClick(t.type)"
      @mouseenter="hoverIdx = idx"
      @mouseleave="hoverIdx = null"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path :d="t.d" fill="currentColor" />
      </svg>
      <span v-if="hoverIdx === idx" class="md-tool__tip">{{ t.label }}</span>
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
  gap: 4px;
  padding: 6px;
  border-radius: var(--md-radius);
  background: var(--md-panel);
  border: 1px solid var(--md-border);
  box-shadow: var(--md-shadow);
  backdrop-filter: var(--md-blur);
  -webkit-backdrop-filter: var(--md-blur);
}
.md-tool {
  position: relative;
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
.md-tool:hover {
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
</style>
