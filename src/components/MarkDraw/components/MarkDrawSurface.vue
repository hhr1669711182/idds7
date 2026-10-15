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
import MarkDrawResultBar from "./MarkDrawResultBar.vue";
import { MdMessage, MdMessageBox } from "../ui/MdMessage";
import { openContextMenu, type MdContextMenuHandle, type MdContextMenuItem } from "../ui/MdContextMenu";
import { getLayer } from "../view/layerConfig";
import { MdTag } from "../ui";
import { geometryToLngLat } from "../utils/proj";
import { copyTextToClipboard } from "@/utils/clipboard";
import { formatLngLat } from "@/utils/coordTransform";
import type {
  MarkDrawFeature,
  MarkDrawLayer,
  MarkDrawToolType,
  MarkDrawHistoryState,
  MarkDrawContextMenuPayload,
  MeasurePayload,
} from "../engine/types";
import type OLMap from "ol/Map";
import type { EventsKey } from "ol/events";
import { unByKey } from "ol/Observable";
import "../styles/markdraw.less";
import "../styles/toast.less";

const props = defineProps<{ map: OLMap | null }>();

const store = useMarkDrawStore();
const engine = shallowRef<CreateMarkDrawEngineResult | null>(null);
const selected = ref<MarkDrawFeature | null>(null);
const currentLayer = ref<MarkDrawLayer | null>(null);
const activeTool = ref<MarkDrawToolType | null>(null);
const measure = ref<MeasurePayload | null>(null);
const drawerCollapsed = ref(false);
const drawerSize = ref(380);
const hasElements = ref(false);
const sourceKeys: unknown[] = [];
const historyState = ref<MarkDrawHistoryState>({
  canUndo: false,
  canRedo: false,
  undoLabel: "",
  redoLabel: "",
  size: 0,
});
/** 右键菜单句柄：同一时刻只允许一个 */
let ctxMenu: MdContextMenuHandle | null = null;

const writableTag = computed(() =>
  currentLayer.value
    ? currentLayer.value.writable
      ? { variant: "success" as const, label: "可写" }
      : { variant: "info" as const, label: "只读" }
    : null
);

const onToolChange = (t: MarkDrawToolType | null) => {
  closeCtxMenu();
  engine.value?.setActiveTool(t);
  if (t !== null) {
    // 切换到新工具时清掉上一条量算结果
    measure.value = null;
  }
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
  // 量算 / 查询工具是直接往矢量图层加图元，不经过 feature:added，
  // 这里同时监听数据源，保证「清除元素」按钮的可用状态始终与图上元素一致
  const syncHasElements = () => {
    hasElements.value = e.getAll().length > 0;
  };
  const src = e.vectorLayer.getSource();
  if (src) {
    sourceKeys.push(src.on("addfeature", syncHasElements));
    sourceKeys.push(src.on("removefeature", syncHasElements));
    syncHasElements();
  }
  e.on("tool:change", (t) => {
    activeTool.value = t;
    store.setActiveTool(t);
    if (t !== null) measure.value = null;
  });
  e.on("feature:added", () => {
    hasElements.value = true;
    if (activeTool.value) {
      // 绘制完成回到待命态，工具栏高亮同步解除
      activeTool.value = null;
      store.setActiveTool(null);
      e.setActiveTool(null);
    }
  });
  e.on("feature:removed", () => {
    hasElements.value = e.getAll().length > 0;
  });
  // 地图侧几何变化（Modify 拖拽 / 撤销重做 / 右键贴边）后必须重建 selected：
  // MarkDrawFeature 里的 geometryLngLat 是选中那一刻的快照，
  // 不重建的话维护表单的 watch 不会触发，几何文本与保存按钮都会停在旧值。
  e.on("feature:modified", (f) => {
    if (selected.value && selected.value.id === f.id) {
      selected.value = buildSelected(f.id) ?? selected.value;
    }
  });
  e.on("measure:result", (payload) => {
    measure.value = payload;
    e.setActiveTool(null);
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
  e.on("history:change", (s) => {
    historyState.value = s;
  });
  e.on("contextmenu:open", (payload) => openFeatureMenu(payload));
});

/** 撤销 / 重做：引擎负责回滚几何，这里只补一句提示（引擎已发提示，避免双弹） */
const onUndo = () => {
  engine.value?.undo();
};
const onRedo = () => {
  engine.value?.redo();
};

/* ------------------------------------------------------------------ *
 * 右键操作菜单
 * ------------------------------------------------------------------ */

/** 通用 SVG path（viewBox 24x24），菜单项图标 */
const ICON = {
  zoom: "M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z",
  select: "M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7l3-7z",
  undo: "M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z",
  redo: "M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z",
  copy: "M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z",
  coord: "M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z",
  save: "M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zm-5 16a3 3 0 1 1 3-3 3 3 0 0 1-3 3zm3-10H5V5h10v4z",
  delete: "M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  target: "M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4zm0 6a2 2 0 1 1 2-2 2 2 0 0 1-2 2zm9-2a9 9 0 0 0-13.6-7.7L5.7 6v3H2V5.3l2.4-2.4A11 11 0 0 1 23 12zM3.4 12A9 9 0 0 0 17 19.7l1.7-1.7V15h3.6v3.7l-2.4 2.4A11 11 0 0 1 1 12z",
} as const;

/** 取要素几何类型对应的展示名 */
const geomTypeLabel = (f: MarkDrawFeature | null): string => {
  if (!f) return "";
  const depth = (() => {
    const g: unknown = f.geometry3857;
    let d = 0;
    let node: unknown = g;
    while (Array.isArray(node)) {
      d += 1;
      if (typeof node[0] === "number") break;
      node = node[0];
    }
    return d;
  })();
  return depth === 1 ? "点" : depth === 2 ? "线" : depth === 3 ? "面" : "复合面";
};

const copyText = (text: string, okMsg: string) =>
  copyTextToClipboard(text, {
    successText: okMsg,
    notify: (type, message) => (type === "success" ? MdMessage.success(message) : MdMessage.warning(message)),
  });

/** 右键菜单文案 */
const ctxMenuItemLabel = (f: MarkDrawFeature | null): string => {
  if (!f) return "要素";
  const name = String(f.properties.name ?? f.properties.zone_name ?? "");
  return name ? `要素「${name}」` : `要素 ${f.id}`;
};

const closeCtxMenu = () => {
  ctxMenu?.close();
  ctxMenu = null;
};

const openFeatureMenu = (payload: MarkDrawContextMenuPayload) => {
  closeCtxMenu();
  const e = engine.value;
  if (!e) return;
  const feat = e.getById(payload.featureId);
  if (!feat) return;
  const pub = buildSelected(payload.featureId);
  selected.value = pub;
  const kindLabel = geomTypeLabel(pub);
  const hs = payload.history;

  const items: MdContextMenuItem[] = [
    {
      key: "zoom",
      label: "缩放至要素",
      icon: ICON.zoom,
    },
    {
      key: "select",
      label: "设为当前编辑目标",
      icon: ICON.select,
    },
    { key: "d1", label: "", divider: true },
    {
      key: "undo",
      label: `撤销：${hs.undoLabel || "上一步"}`,
      icon: ICON.undo,
      disabled: !hs.canUndo,
    },
    {
      key: "redo",
      label: `重做：${hs.redoLabel || "下一步"}`,
      icon: ICON.redo,
      disabled: !hs.canRedo,
    },
    { key: "d2", label: "", divider: true },
    {
      key: "copyGeom",
      label: `复制几何（${kindLabel}）`,
      icon: ICON.copy,
    },
    {
      key: "copyCoord",
      label: "复制中心经纬度",
      icon: ICON.coord,
    },
    { key: "d3", label: "", divider: true },
    {
      key: "remove",
      label: "清除这个上图元素",
      icon: ICON.delete,
      danger: true,
    },
  ];

  ctxMenu = openContextMenu({
    x: payload.x,
    y: payload.y,
    items,
    onSelect: async (key) => {
      const f0 = engine.value?.getById(payload.featureId);
      if (!f0) return;
      if (key === "zoom") {
        engine.value?.flyTo(f0);
        return;
      }
      if (key === "select") {
        engine.value?.selectById(payload.featureId);
        return;
      }
      if (key === "undo") {
        onUndo();
        return;
      }
      if (key === "redo") {
        onRedo();
        return;
      }
      if (key === "copyGeom") {
        const g = f0.getGeometry();
        if (!g) return;
        const coords = (g as unknown as { getCoordinates?: () => unknown }).getCoordinates?.();
        await copyText(JSON.stringify(coords ?? null), "已复制几何坐标（EPSG:3857）");
        return;
      }
      if (key === "copyCoord") {
        const g = f0.getGeometry();
        const c =
          g && typeof (g as unknown as { getInteriorPoint?: () => { getCoordinates(): number[] } }).getInteriorPoint === "function"
            ? (g as unknown as { getInteriorPoint(): { getCoordinates(): number[] } }).getInteriorPoint().getCoordinates()
            : (g as unknown as { getFirstCoordinate?: () => number[] })?.getFirstCoordinate?.();
        if (!c) return;
        const [lon, lat] = geometryToLngLat(c as number[] as never) as number[];
        await copyText(formatLngLat([lon, lat]), "已复制中心经纬度");
        return;
      }
      if (key === "remove") {
        const ok = await MdMessageBox.confirm(
          `确认清除${ctxMenuItemLabel(pub)}？该操作不删除数据库记录。`,
          "清除上图元素",
          { type: "danger" }
        );
        if (!ok) return;
        const removedId = payload.featureId;
        e.removeFeature(removedId);
        selected.value = null;
        MdMessage.success("已清除该上图元素");
      }
    },
  });
};

onBeforeUnmount(() => {
  closeCtxMenu();
  sourceKeys.splice(0).forEach((k) => unByKey(k as EventsKey));
  engine.value?.destroy();
});

const onFeatureIdSelected = (id: string | number | null) => {
  selected.value = id === null ? null : buildSelected(id);
};

/** 清除元素：先退出工具态，再清空图上全部绘制 / 查询图元 */
const onClear = async () => {
  const e = engine.value;
  if (!e) return;
  const total = e.getAll().length;
  if (!total) {
    MdMessage.info("当前没有可清除的元素");
    return;
  }
  const ok = await MdMessageBox.confirm(`确认清除地图上的 ${total} 个元素？`, "清除元素", {
    type: "danger",
  });
  if (!ok) return;
  const removed = e.clearFeatures();
  hasElements.value = false;
  selected.value = null;
  measure.value = null;
  MdMessage.success(`已清除 ${removed} 个元素`);
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
    <MarkDrawToolbar
      :active-tool="activeTool"
      :has-elements="hasElements"
      :can-undo="historyState.canUndo"
      :can-redo="historyState.canRedo"
      :undo-label="historyState.undoLabel"
      :redo-label="historyState.redoLabel"
      @tool-change="onToolChange"
      @clear="onClear"
      @undo="onUndo"
      @redo="onRedo"
    />

    <!-- 量算 / 查询结果条 -->
    <MarkDrawResultBar
      :active-tool="activeTool"
      :measure="measure"
      @close="measure = null"
    />

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
  right: 82px;
  top: 12px;
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
  /* 各卡片内部自行滚动，这里只做单列纵向排版，避免嵌套滚动条 */
  scrollbar-gutter: stable;
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
