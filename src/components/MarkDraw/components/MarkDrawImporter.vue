<script setup lang="ts">
/**
 * GeoJSON 导入导出（玻璃风格自写）
 */
import { ref } from "vue";
import { MdInput } from "../ui";
import { MdMessage } from "../ui/MdMessage";
import type { CreateMarkDrawEngineResult } from "../engine/createMarkDrawEngine";

const props = defineProps<{
  engine: CreateMarkDrawEngineResult | null;
}>();

const text = ref("");
const fileName = ref("");

const onExport = () => {
  if (!props.engine) return;
  const json = props.engine.exportGeoJSON();
  text.value = json;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `markdraw-${Date.now()}.geojson`;
  a.click();
  URL.revokeObjectURL(url);
  MdMessage.success("已导出 GeoJSON");
};

const onImport = () => {
  if (!props.engine) return;
  if (!text.value.trim()) {
    MdMessage.warning("请先粘贴或导入 GeoJSON 文本");
    return;
  }
  try {
    const list = props.engine.importGeoJSON(text.value);
    MdMessage.success(`导入 ${list.length} 条要素`);
  } catch (e) {
    MdMessage.error(`导入失败：${(e as Error).message}`);
  }
};

const onClear = () => {
  text.value = "";
  fileName.value = "";
};

const onFile = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  fileName.value = file.name;
  const reader = new FileReader();
  reader.onload = () => {
    text.value = String(reader.result ?? "");
  };
  reader.readAsText(file);
  input.value = "";
};
</script>

<template>
  <section class="md-card md-importer">
    <header class="md-card__head">
      <span class="md-card__bar" />
      <span class="md-card__title">GeoJSON 导入/导出</span>
    </header>
    <div class="md-importer__row">
      <label class="md-filebtn">
        <input
          type="file"
          accept=".geojson,.json"
          class="md-filebtn__input"
          @change="onFile"
        />
        <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>
        <span>{{ fileName || '选择文件' }}</span>
      </label>
      <button class="md-pbtn md-pbtn--primary" @click="onImport">
        <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        导入
      </button>
      <button class="md-pbtn" @click="onExport">
        <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
        导出
      </button>
      <button class="md-pbtn md-pbtn--ghost" @click="onClear">清空</button>
    </div>
    <MdInput v-model="text" type="textarea" :rows="6" placeholder='{"type":"FeatureCollection","features":[…]}' />
  </section>
</template>

<style scoped>
.md-importer__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.md-filebtn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--md-radius-sm);
  background: rgba(20, 30, 48, 0.5);
  border: 1px solid var(--md-border);
  color: var(--md-text);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.18s ease;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:root:not([data-theme="NIGHT"]) .md-filebtn {
  background: rgba(255, 255, 255, 0.6);
}
.md-filebtn:hover {
  border-color: var(--md-border-strong);
  color: var(--md-accent-1);
}
.md-filebtn__input {
  display: none;
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
.md-pbtn--primary {
  background: linear-gradient(135deg, var(--md-accent-1), var(--md-accent-2));
  color: #0a1525;
  border-color: transparent;
  font-weight: 600;
}
.md-pbtn--primary:hover:not(:disabled) {
  box-shadow: 0 4px 14px var(--md-accent-glow);
}
.md-pbtn--ghost {
  background: transparent;
}
</style>
