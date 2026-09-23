<script setup lang="ts">
/**
 * MarkDrawSurface — 玻璃风格总容器
 * - 承载 Toolbar / Drawer / Panels / Importer / CircleQuery
 * - 自管 engine 实例；与父级 view 共享同一个 OLMap
 */
import { ref, shallowRef, watch, onMounted, onBeforeUnmount, computed } from "vue";
import { useMarkDrawStore } from "../store/useMarkDrawStore";
import { createMarkDrawEngine, type CreateMarkDrawEngineResult } from "../engine/createMarkDrawEngine";
import MarkDrawToolbar from "./MarkDrawToolbar.vue";
import LayerHierarchyPanel from "../view/LayerHierarchyPanel.vue";
import FeatureListPanel from "../view/FeatureListPanel.vue";
import FeatureEditorPanel from "../form/FeatureEditorPanel.vue";
import MarkDrawImporter from "./MarkDrawImporter.vue";
import CircleQueryPanel from "../view/CircleQueryPanel.vue";
import { getLayer } from "../view/layerConfig";
import { MdTag } from "../ui";
import { geometryToLngLat } from "../utils/proj";
import type {
  MarkDrawFeature,
  MarkDrawLayer,
  MarkDrawToolType,
} from "../engine/types";
import type OLMap from "ol/Map";
import "../styles/markdraw.less";
import "../styles/toast.less";

const props = defineProps<{ map: OLMap | null }>();

const store = useMarkDrawStore();
const engine = shallowRef<CreateMarkDrawEngineResult | null>(null);
const selected = ref<MarkDrawFeature | null>(null);
const currentLayer = ref<MarkDrawLayer | null>(null);
const activeTool = ref<MarkDrawToolType | null>(null);
const drawerCollapsed = ref(false);
const drawerSize = ref(380);

const writableTag = computed(() =>
  currentLayer.value
    ? currentLayer.value.writable
      ? { variant: "success" as const, label: "可写" }
      : { variant: "info" as const, label: "只读" }
    : null
);

const onToolChange = (t: MarkDrawToolType | null) => {
  engine.value?.setActiveTool(t);
};

const onLayerSelected = (layer: MarkDrawLayer) => {
  currentLayer.value = layer;
  store.setActiveLayer(layer.id);
  engine.value?.setActiveLayer(layer);
};

watch(
  () => store.activeLayerId,
  (id) => {
    if (!id) return;
    const layer = getLayer(id);
    if (layer) currentLayer.value = layer;
  },
  { immediate: true }
);

const buildSelected = (id: string | number): MarkDrawFeature | null => {
  if (!engine.value) return null;
  const feat = engine.value.getById(id);
  if (!feat) return null;
  const geom = feat.getGeometry();
  const coords3857 = (geom as unknown as { getCoordinates?: () => unknown })?.getCoordinates?.() as
    | number[][]
    | number[][][]
    | undefined;
  const g3857 = coords3857 ?? [];
  const layerId = (feat.get("_layerId") as string) ?? "";
  return {
    feature: feat,
    id,
    geometry3857: g3857,
    geometryLngLat: geometryToLngLat(g3857),
    properties: { ...feat.getProperties() },
    layerId,
    groupId: layerId.split(":")[0] === "mark" ? "markdraw" : layerId.split(":")[0],
    isDirty: !!feat.get("_isDirty"),
  };
};

onMounted(() => {
  if (!props.map) return;
  const e = createMarkDrawEngine(props.map);
  engine.value = e;
  activeTool.value = e.getActiveTool();
  e.on("tool:change", (t) => {
    activeTool.value = t;
    store.setActiveTool(t);
  });
  e.on("selection:change", (f) => {
    if (!f) {
      selected.value = null;
      return;
    }
    if (!currentLayer.value) {
      currentLayer.value = getLayer(f.layerId) ?? null;
    }
    selected.value = buildSelected(f.id) ?? f;
  });
});

onBeforeUnmount(() => {
  engine.value?.destroy();
});

const onFeatureIdSelected = (id: string | number | null) => {
  selected.value = id === null ? null : buildSelected(id);
};

const startResize = (e: MouseEvent) => {
  e.preventDefault();
  const startX = e.clientX;
  const startW = drawerSize.value;
  const move = (ev: MouseEvent) => {
    drawerSize.value = Math.max(320, Math.min(560, startW - (ev.clientX - startX)));
  };
  const up = () => {
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
};
</script>

<template>
  <div class="markdraw-root md-surface">
    <!-- 顶部信息条 -->
    <div class="md-topbar">
      <span class="md-topbar__logo">
        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3 17l5-5 4 4 9-9m0 0v4m0-4h-4"/></svg>
      </span>
      <span class="md-topbar__title">地图标绘工具</span>
      <span v-if="currentLayer" class="md-topbar__layer">
        <span class="md-topbar__sep">/</span>
        <span>{{ currentLayer.groupName }}</span>
        <span class="md-topbar__sep">·</span>
        <span>{{ currentLayer.name }}</span>
        <MdTag v-if="writableTag" :variant="writableTag.variant">{{ writableTag.label }}</MdTag>
      </span>
      <button
        class="md-topbar__collapse"
        @click="drawerCollapsed = !drawerCollapsed"
        :title="drawerCollapsed ? '展开面板' : '收起面板'"
      >
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path
            v-if="drawerCollapsed"
            fill="currentColor"
            d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"
          />
          <path
            v-else
            fill="currentColor"
            d="M19 13H5v-2h14z"
          />
        </svg>
      </button>
    </div>

    <!-- 工具栏 -->
    <MarkDrawToolbar :active-tool="activeTool" @tool-change="onToolChange" />

    <!-- 右侧抽屉 -->
    <transition name="md-drawer">
      <aside
        v-show="!drawerCollapsed"
        class="md-drawer"
        :style="{ width: drawerSize + 'px' }"
      >
        <div class="md-drawer__grip" @mousedown="startResize" />
        <div class="md-drawer__inner">
          <LayerHierarchyPanel @layer-selected="onLayerSelected" />
          <FeatureListPanel
            :engine="engine"
            :layer="currentLayer"
            @feature-selected="onFeatureIdSelected"
          />
          <FeatureEditorPanel :engine="engine" :selected="selected" :layer="currentLayer" />
          <CircleQueryPanel :engine="engine" />
          <MarkDrawImporter :engine="engine" />
        </div>
      </aside>
    </transition>
  </div>
</template>

<style scoped>
.md-surface {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.md-surface > * {
  pointer-events: auto;
}

/* 顶部信息条 */
.md-topbar {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px 0 8px;
  border-radius: 999px;
  background: var(--md-panel);
  border: 1px solid var(--md-border);
  box-shadow: var(--md-shadow);
  backdrop-filter: var(--md-blur);
  -webkit-backdrop-filter: var(--md-blur);
  color: var(--md-text);
  font-size: 12px;
  letter-spacing: 0.4px;
}
.md-topbar__logo {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--md-accent-1), var(--md-accent-2));
  color: #0a1525;
}
.md-topbar__title {
  font-weight: 600;
}
.md-topbar__layer {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--md-text-2);
}
.md-topbar__sep {
  color: var(--md-text-3);
}
.md-topbar__collapse {
  margin-left: 6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--md-border);
  background: transparent;
  color: var(--md-text-2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.md-topbar__collapse:hover {
  border-color: var(--md-border-strong);
  color: var(--md-accent-1);
}

/* 抽屉 */
.md-drawer {
  position: absolute;
  right: 12px;
  top: 56px;
  bottom: 12px;
  z-index: 7;
  border-radius: var(--md-radius);
  background: var(--md-panel);
  border: 1px solid var(--md-border);
  box-shadow: var(--md-shadow);
  backdrop-filter: var(--md-blur);
  -webkit-backdrop-filter: var(--md-blur);
  overflow: hidden;
}
.md-drawer__grip {
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  cursor: ew-resize;
  background: transparent;
  z-index: 2;
}
.md-drawer__grip:hover {
  background: linear-gradient(180deg, var(--md-accent-1), var(--md-accent-2));
}
.md-drawer__inner {
  position: absolute;
  inset: 0 0 0 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  overflow-y: auto;
}

.md-drawer-enter-active,
.md-drawer-leave-active {
  transition: transform 0.24s ease, opacity 0.24s ease;
}
.md-drawer-enter-from,
.md-drawer-leave-to {
  transform: translateX(20px);
  opacity: 0;
}

/* 通用卡片 */
.md-card {
  background: rgba(20, 30, 48, 0.55);
  border: 1px solid var(--md-border);
  border-radius: var(--md-radius);
  padding: 10px;
  color: var(--md-text);
  transition: border-color 0.18s ease;
}
:root:not([data-theme="NIGHT"]) .md-card {
  background: rgba(255, 255, 255, 0.55);
}
.md-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.md-card__bar {
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--md-accent-1), var(--md-accent-2));
  box-shadow: 0 0 8px var(--md-accent-glow);
}
.md-card__title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.4px;
}
</style>
