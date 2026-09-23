<script setup lang="ts">
/**
 * 维护表单（玻璃风格自写）
 * - 展示选中要素的可编辑字段
 * - 支持颜色 / 宽度 / 透明度 / 名称 / 备注 / 类型
 * - 保存走 WFS-T（insert / update）
 * - 删除走 WFS-T（Delete）
 */
import { ref, watch, computed } from "vue";
import { useFeatureEditor } from "./useFeatureEditor";
import { isWritable } from "../view/layerConfig";
import { insertFeatures, updateFeatures, deleteFeatures } from "./wfst/transaction";
import { useMarkDrawStore } from "../store/useMarkDrawStore";
import { MdInput, MdTag } from "../ui";
import { MdMessage, MdMessageBox } from "../ui/MdMessage";
import type { MarkDrawFeature, MarkDrawLayer, StyleJson } from "../engine/types";
import type Feature from "ol/Feature";

const props = defineProps<{
  engine: import("../engine/createMarkDrawEngine").CreateMarkDrawEngineResult | null;
  selected: MarkDrawFeature | null;
  layer: MarkDrawLayer | null;
}>();

const editor = useFeatureEditor();
const store = useMarkDrawStore();
const idText = ref("");
const nameText = ref("");
const markText = ref("");
const typeText = ref("");
const colorText = ref("#ff0000");
const widthNum = ref(2);
const opacityNum = ref(0.6);
const geometryPreview = ref("");

const writable = computed(() => Boolean(props.layer && isWritable(props.layer)));

watch(
  () => props.selected,
  (sel) => {
    if (sel && sel.feature) {
      const feat = sel.feature as Feature;
      editor.loadFromFeature(feat, props.layer ?? undefined);
      const fp = (editor.state.properties ?? {}) as Record<string, unknown>;
      nameText.value = String(fp.name ?? "");
      markText.value = String(fp.mark ?? "");
      typeText.value = String(fp.type ?? "");
      idText.value = String(sel.id ?? "");
      const style = (fp.style ?? {}) as StyleJson;
      if (style.stroke) {
        const c = style.stroke.color || "#ff0000";
        colorText.value = c.startsWith("#") ? c : "#ff0000";
        widthNum.value = style.stroke.width ?? 2;
        if (style.stroke.color.startsWith("rgba")) {
          const m = style.stroke.color.match(/rgba\(([^)]+)\)/);
          if (m) {
            const parts = m[1].split(",").map((s) => s.trim());
            opacityNum.value = Number(parts[3] ?? "1");
          }
        }
      }
      if (style.fill?.color?.startsWith("rgba")) {
        const m = style.fill.color.match(/rgba\(([^)]+)\)/);
        if (m) {
          const parts = m[1].split(",").map((s) => s.trim());
          opacityNum.value = Number(parts[3] ?? "1");
        }
      }
      geometryPreview.value = JSON.stringify(sel.geometryLngLat).slice(0, 220);
    } else {
      editor.reset();
      nameText.value = "";
      markText.value = "";
      typeText.value = "";
      idText.value = "";
      geometryPreview.value = "";
      colorText.value = "#ff0000";
      widthNum.value = 2;
      opacityNum.value = 0.6;
    }
  },
  { immediate: true }
);

const applyStyle = (feat: Feature) => {
  const op = opacityNum.value;
  const c = colorText.value;
  const rgbaFill = `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${op})`;
  const style: StyleJson = {
    stroke: { color: c, width: widthNum.value },
    fill: { color: rgbaFill },
  };
  feat.set("style", style);
};

const onSave = async () => {
  if (!props.layer || !isWritable(props.layer)) {
    MdMessage.warning("当前图层为只读，无法保存");
    return;
  }
  if (!props.selected?.feature) return;
  const feat = props.selected.feature as Feature;
  feat.set("name", nameText.value);
  feat.set("mark", markText.value);
  if (typeText.value) feat.set("type", typeText.value);
  applyStyle(feat);

  try {
    if (editor.state.mode === "create") {
      const result = await insertFeatures(props.layer, [feat]);
      const newIds = result.insertedIds ?? [];
      if (newIds.length) feat.setId(String(newIds[0]));
      MdMessage.success("新增成功");
    } else {
      await updateFeatures(props.layer, [feat]);
      MdMessage.success("更新成功");
    }
    feat.set("_isDirty", false);
    editor.markDirty();
    store.setActiveTool(null);
  } catch (e) {
    MdMessage.error(`保存失败：${(e as Error).message}`);
  }
};

const onDelete = async () => {
  if (!props.layer || !isWritable(props.layer)) {
    MdMessage.warning("当前图层为只读");
    return;
  }
  if (!props.selected?.feature) return;
  const ok = await MdMessageBox.confirm("确认删除该要素？删除后无法恢复。", "删除确认", {
    type: "danger",
  });
  if (!ok) return;
  try {
    await deleteFeatures(props.layer, [props.selected.feature as Feature]);
    const id = props.selected.id;
    if (typeof id === "string" || typeof id === "number") {
      props.engine?.removeFeature(id);
    }
    MdMessage.success("删除成功");
    editor.reset();
  } catch (e) {
    MdMessage.error(`删除失败：${(e as Error).message}`);
  }
};
</script>

<template>
  <section class="md-card md-editor">
    <header class="md-card__head">
      <span class="md-card__bar" />
      <span class="md-card__title">维护表单</span>
      <MdTag v-if="layer" :variant="writable ? 'success' : 'info'">{{ writable ? '可写' : '只读' }}</MdTag>
    </header>
    <div v-if="selected" class="md-editor__body">
      <div class="md-editor__row">
        <label class="md-editor__label">图层</label>
        <span class="md-editor__value">{{ layer?.name ?? '未选择' }}</span>
      </div>
      <div class="md-editor__row">
        <label class="md-editor__label">ID</label>
        <MdInput v-model="idText" readonly />
      </div>
      <div class="md-editor__row">
        <label class="md-editor__label">名称</label>
        <MdInput v-model="nameText" :disabled="!writable" placeholder="要素名称" />
      </div>
      <div class="md-editor__row">
        <label class="md-editor__label">类型</label>
        <MdInput v-model="typeText" :disabled="!writable" placeholder="可选：消防/医疗…" />
      </div>
      <div class="md-editor__row">
        <label class="md-editor__label">备注</label>
        <MdInput v-model="markText" type="textarea" :rows="2" :disabled="!writable" placeholder="备注信息" />
      </div>
      <div class="md-editor__row md-editor__row--style">
        <label class="md-editor__label">颜色</label>
        <input
          type="color"
          class="md-color"
          v-model="colorText"
          :disabled="!writable"
        />
        <label class="md-editor__label md-editor__label--sm">宽度</label>
        <input
          type="number"
          class="md-num"
          min="1"
          max="20"
          v-model.number="widthNum"
          :disabled="!writable"
        />
        <label class="md-editor__label md-editor__label--sm">透明度</label>
        <input
          type="number"
          class="md-num"
          min="0"
          max="1"
          step="0.05"
          v-model.number="opacityNum"
          :disabled="!writable"
        />
      </div>
      <div class="md-editor__row md-editor__row--col">
        <label class="md-editor__label">几何（lng/lat）</label>
        <MdInput v-model="geometryPreview" type="textarea" :rows="3" readonly />
      </div>
      <div class="md-editor__actions">
        <button class="md-pbtn md-pbtn--primary" @click="onSave" :disabled="!writable">
          <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4zM12 19a3 3 0 110-6 3 3 0 010 6zm3-10H5V5h10v4z"/></svg>
          保存（WFS-T）
        </button>
        <button class="md-pbtn md-pbtn--danger" @click="onDelete" :disabled="!writable">
          <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
          删除
        </button>
      </div>
    </div>
    <div v-else class="md-editor__empty">未选中任何要素 — 列表点选或图上点击</div>
  </section>
</template>

<style scoped>
.md-editor__body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.md-editor__row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.md-editor__row--col {
  flex-direction: column;
  align-items: stretch;
}
.md-editor__row--style {
  flex-wrap: wrap;
}
.md-editor__label {
  width: 48px;
  font-size: 12px;
  color: var(--md-text-2);
  flex-shrink: 0;
}
.md-editor__label--sm {
  width: auto;
}
.md-editor__value {
  font-size: 13px;
  color: var(--md-text);
}
.md-color {
  width: 36px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--md-border);
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}
.md-num {
  width: 56px;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--md-border);
  border-radius: 6px;
  background: rgba(20, 30, 48, 0.5);
  color: var(--md-text);
  font-size: 12px;
  outline: none;
}
:root:not([data-theme="NIGHT"]) .md-num {
  background: rgba(255, 255, 255, 0.6);
}
.md-num:focus {
  border-color: var(--md-border-strong);
}
.md-editor__actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.md-pbtn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 12px;
  border-radius: var(--md-radius-sm);
  border: 1px solid var(--md-border);
  background: rgba(20, 30, 48, 0.5);
  color: var(--md-text);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
}
:root:not([data-theme="NIGHT"]) .md-pbtn {
  background: rgba(255, 255, 255, 0.6);
}
.md-pbtn:hover:not(:disabled) {
  border-color: var(--md-border-strong);
}
.md-pbtn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.md-pbtn--primary {
  background: linear-gradient(135deg, var(--md-accent-1), var(--md-accent-2));
  color: #0a1525;
  border-color: transparent;
  font-weight: 600;
}
.md-pbtn--primary:hover:not(:disabled) {
  box-shadow: 0 4px 14px var(--md-accent-glow);
}
.md-pbtn--danger {
  background: linear-gradient(135deg, var(--md-danger), var(--md-danger-2));
  color: #fff;
  border-color: transparent;
  font-weight: 600;
}
.md-pbtn--danger:hover:not(:disabled) {
  box-shadow: 0 4px 14px rgba(245, 54, 92, 0.35);
}
.md-editor__empty {
  padding: 18px 0;
  font-size: 12px;
  color: var(--md-text-3);
  text-align: center;
  border: 1px dashed var(--md-border);
  border-radius: var(--md-radius-sm);
}
</style>
