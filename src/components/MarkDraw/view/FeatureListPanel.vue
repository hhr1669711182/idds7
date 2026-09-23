<script setup lang="ts">
/**
 * 三级面板第三级：feature 列表（玻璃风格自写）
 * - 行点击 → flyTo + 选中 + emit feature-selected
 * - 行双击 → flyTo（不强制 zoom）
 * - engine.feature:modified（来自 Select/Modify 拖拽）→ 自动 WFS-T Update
 *
 * 坐标系约定：
 *  - GeoServer GeoJSON 默认 4326，本组件读后转 3857 再上图
 */
import { ref, watch, computed, onMounted, onBeforeUnmount } from "vue";
import { geoserverApi } from "@/service/geoserver";
import { useMarkDrawStore } from "../store/useMarkDrawStore";
import { isWritable } from "./layerConfig";
import { deleteFeatures, updateFeatures } from "../form/wfst/transaction";
import { MdTable } from "../ui";
import { MdMessage, MdMessageBox } from "../ui/MdMessage";
import { readGeoJsonAsMercator } from "../utils/proj";
import Feature from "ol/Feature";
import type { MarkDrawLayer, MarkDrawFeature } from "../engine/types";
import type { CreateMarkDrawEngineResult } from "../engine/createMarkDrawEngine";

const props = defineProps<{
  engine: CreateMarkDrawEngineResult | null;
  layer: MarkDrawLayer | null;
}>();

const emit = defineEmits<{
  (e: "feature-selected", id: string | number | null): void;
  (e: "features-loaded", count: number): void;
}>();

const store = useMarkDrawStore();
const rows = ref<Record<string, unknown>[]>([]);
const loading = ref(false);
const multipleSelection = ref<Record<string, unknown>[]>([]);
const activeId = ref<string | number | null>(null);
const truncated = ref(false);

const writable = computed(() => Boolean(props.layer && isWritable(props.layer)));

const columns = computed(() => {
  const list = (props.layer?.displayFields ?? ["id", "name"]).slice(0, 4);
  return [
    { key: "__sel", label: "", width: "32px", type: "selection" as const },
    ...list.map((k) => ({ key: k, label: k, width: k === "id" ? "100px" : "1fr" })),
  ];
});

const load = async () => {
  if (!props.layer) {
    rows.value = [];
    return;
  }
  loading.value = true;
  truncated.value = false;
  try {
    const res = await geoserverApi.getWFSFeatures(
      {
        typeName: props.layer.typeName,
        outputFormat: "application/json",
        maxFeatures: 1000,
      },
      props.layer.workspace
    );
    const features = (res?.features ?? []) as Array<{
      id?: string | number;
      properties?: Record<string, unknown>;
      geometry?: unknown;
    }>;
    if (features.length >= 1000) truncated.value = true;
    rows.value = features.map((f) => ({ id: f.id ?? "", ...(f.properties ?? {}) }));

    if (props.engine) {
      const layerId = props.layer.id;
      // 清掉同 layer 的旧要素
      const toRemove: Array<string | number> = [];
      props.engine.getAll().forEach((feat) => {
        if (feat.get("_layerId") === layerId) toRemove.push(feat.getId() as string);
      });
      toRemove.forEach((id) => props.engine!.removeFeature(id));

      // 整体读 GeoJSON（4326 → 3857 一并完成）
      const geometries = readGeoJsonAsMercator(res);
      const layer = props.layer;
      features.forEach((f, idx) => {
        const geom = geometries[idx];
        if (!geom) return;
        const olFeat = new Feature();
        olFeat.setId(f.id ?? `tmp-${idx}`);
        olFeat.setProperties(f.properties ?? {});
        olFeat.set("_layerId", layer.id);
        olFeat.setGeometry(geom);
        props.engine!.addFeature(olFeat, layer);
      });
    }
    MdMessage.success(`已加载 ${rows.value.length} 条要素`);
    emit("features-loaded", features.length);
  } catch (e) {
    console.error(e);
    MdMessage.error(`加载失败：${(e as Error).message}`);
  } finally {
    loading.value = false;
  }
};

watch(
  () => props.layer?.id,
  () => {
    multipleSelection.value = [];
    activeId.value = null;
    load();
  },
  { immediate: true }
);

const onRowClick = (row: Record<string, unknown>) => {
  const id = row.id as string | number;
  activeId.value = id;
  const feat = props.engine?.getById(id);
  if (!feat) return;
  props.engine?.selectById(id);
  props.engine?.flyTo(feat);
  emit("feature-selected", id);
};

const onRowDblClick = (row: Record<string, unknown>) => {
  const id = row.id as string | number;
  const feat = props.engine?.getById(id);
  if (!feat) return;
  props.engine?.flyTo(feat);
};

const onDelete = async () => {
  if (!multipleSelection.value.length) {
    MdMessage.warning("请先选择要素");
    return;
  }
  if (!props.layer || !isWritable(props.layer)) {
    MdMessage.warning("当前图层为只读，无法删除");
    return;
  }
  const ok = await MdMessageBox.confirm(
    `确认删除所选 ${multipleSelection.value.length} 个要素？此操作不可撤销。`,
    "删除确认",
    { type: "danger" }
  );
  if (!ok) return;
  const feats: Feature[] = [];
  multipleSelection.value.forEach((row) => {
    const id = row.id as string | number;
    const f = props.engine?.getById(id);
    if (f) feats.push(f);
  });
  loading.value = true;
  try {
    await deleteFeatures(props.layer, feats);
    MdMessage.success("删除成功");
    await load();
  } catch (e) {
    MdMessage.error(`删除失败：${(e as Error).message}`);
  } finally {
    loading.value = false;
  }
};

const onAdd = () => {
  if (!writable.value) {
    MdMessage.warning("当前图层为只读，请在可写图层新增");
    return;
  }
  store.setActiveTool("Point");
};

const onRefresh = () => load();

// 图上拖拽 modify → 自动 WFS-T Update
const onEngineModified = async (payload: MarkDrawFeature) => {
  if (!props.layer || !isWritable(props.layer)) return;
  if (payload.layerId !== props.layer.id) return;
  const feat = props.engine?.getById(payload.id);
  if (!feat) return;
  loading.value = true;
  try {
    await updateFeatures(props.layer, [feat]);
    feat.set("_isDirty", false);
    MdMessage.success(`要素 ${payload.id} 已更新`);
  } catch (e) {
    MdMessage.error(`更新失败：${(e as Error).message}`);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  props.engine?.on("feature:modified", onEngineModified as never);
});

onBeforeUnmount(() => {
  props.engine?.off("feature:modified", onEngineModified as never);
});
</script>

<template>
  <section class="md-card md-flp">
    <header class="md-card__head">
      <div class="md-card__head-title">
        <span class="md-card__bar" />
        <span>要素列表</span>
        <span class="md-flp__count">{{ rows.length }}<span class="md-flp__cap">/1000</span></span>
      </div>
      <div class="md-flp__actions">
        <button class="md-iconbtn" @click="onRefresh" :disabled="loading">
          <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.3 0 6 2.7 6 6 0 1-.2 1.9-.7 2.7l1.5 1.5C19.5 15 20 13.5 20 12c0-4.4-3.6-8-8-8zm0 14c-3.3 0-6-2.7-6-6 0-1 .2-1.9.7-2.7L5.2 7.8C4.5 9 4 10.5 4 12c0 4.4 3.6 8 8 8v3l4-4-4-4v3z"/></svg>
        </button>
        <button
          class="md-iconbtn md-iconbtn--primary"
          @click="onAdd"
          :disabled="!writable"
          v-if="writable"
        >
          <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>
          新增
        </button>
        <button
          class="md-iconbtn md-iconbtn--danger"
          @click="onDelete"
          :disabled="!multipleSelection.length || !writable"
        >
          <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          删除
        </button>
      </div>
    </header>
    <div class="md-flp__body">
      <MdTable
        :columns="columns"
        :rows="rows"
        :active-id="activeId"
        :loading="loading"
        empty-text="暂无要素，请选择图层"
        @row-click="onRowClick"
        @row-dblclick="onRowDblClick"
        @selection-change="(v: Record<string, unknown>[]) => (multipleSelection = v)"
      />
    </div>
    <div v-if="truncated" class="md-flp__tip">
      ⚠ 命中达到 1000 上限，请缩小范围或加 CQL 过滤
    </div>
  </section>
</template>

<style scoped>
.md-flp {
  display: flex;
  flex-direction: column;
  height: 320px;
  min-height: 320px;
}
.md-card__head-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.md-flp__count {
  margin-left: 2px;
  font-size: 12px;
  color: var(--md-accent-1);
  font-weight: 600;
}
.md-flp__cap {
  color: var(--md-text-3);
  font-weight: 400;
  margin-left: 1px;
}
.md-flp__actions {
  display: flex;
  gap: 6px;
}
.md-iconbtn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px;
  border-radius: var(--md-radius-sm);
  background: rgba(20, 30, 48, 0.5);
  border: 1px solid var(--md-border);
  color: var(--md-text);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.18s ease;
}
:root:not([data-theme="NIGHT"]) .md-iconbtn {
  background: rgba(255, 255, 255, 0.6);
}
.md-iconbtn:hover:not(:disabled) {
  border-color: var(--md-border-strong);
  color: var(--md-accent-1);
}
.md-iconbtn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.md-iconbtn--primary {
  background: linear-gradient(135deg, var(--md-accent-1), var(--md-accent-2));
  color: #0a1525;
  border-color: transparent;
  font-weight: 600;
}
.md-iconbtn--primary:hover:not(:disabled) {
  box-shadow: 0 4px 14px var(--md-accent-glow);
}
.md-iconbtn--danger {
  background: linear-gradient(135deg, var(--md-danger), var(--md-danger-2));
  color: #fff;
  border-color: transparent;
  font-weight: 600;
}
.md-iconbtn--danger:hover:not(:disabled) {
  box-shadow: 0 4px 14px rgba(245, 54, 92, 0.35);
}
.md-flp__body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-radius: var(--md-radius-sm);
}
.md-flp__tip {
  margin-top: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: var(--md-warning);
  background: rgba(245, 166, 35, 0.1);
  border: 1px solid rgba(245, 166, 35, 0.3);
}
</style>
