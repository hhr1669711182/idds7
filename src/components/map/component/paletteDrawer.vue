<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useCommonStore, type PalettePreset } from "@/store/useCommonStore.ts";
import { getBasemapFilter, buildFilterString } from "@/utils/themeColor.ts";

const emit = defineEmits<{ (e: "filter-change"): void }>();

const commonStore = useCommonStore();
const { themeColor, palette, customPalette, filterOverride } = storeToRefs(commonStore);

const visible = ref(false);

const PRESET_OPTIONS: { value: PalettePreset; label: string; desc: string }[] = [
  { value: "NIGHT", label: "夜间科技", desc: "深空蓝底 + 青蓝主色" },
  { value: "DAY", label: "日间清爽", desc: "浅色底 + 科技蓝主色" },
  { value: "OCEAN", label: "深海蓝", desc: "偏冷的调试盘" },
  { value: "EMBER", label: "琥珀暖调", desc: "暖色调试盘" },
  { value: "GLASS", label: "毛玻璃", desc: "Apple 风格磨砂质感" },
];

/** 可自定义的调色盘 token（覆盖预设盘） */
const CUSTOM_VARS = [
  { name: "--accent-cyan", label: "主色" },
  { name: "--panel-bg", label: "面板底色" },
  { name: "--panel-border", label: "面板描边" },
  { name: "--text-primary", label: "主文字" },
  { name: "--text-secondary", label: "次文字" },
];

const filter = ref(getBasemapFilter());

const filterFields = [
  { key: "hueRotate", label: "色相旋转", min: 0, max: 360, step: 5, unit: "deg" },
  { key: "invert", label: "反相", min: 0, max: 100, step: 1, unit: "%" },
  { key: "saturate", label: "饱和度", min: 0, max: 2000, step: 50, unit: "%" },
  { key: "brightness", label: "亮度", min: 20, max: 140, step: 2, unit: "%" },
  { key: "contrast", label: "对比度", min: 20, max: 140, step: 2, unit: "%" },
] as const;

const filterPreview = computed(() => buildFilterString(filter.value));

/** 当前被自定义覆盖的 token 数量 */
const customCount = computed(() => Object.keys(customPalette.value).length);

function open() {
  visible.value = true;
  filter.value = getBasemapFilter();
}

function close() {
  visible.value = false;
}

function selectTheme(value: string | number | boolean | undefined) {
  if (typeof value !== "string") return;
  commonStore.setThemeColor(value);
}

function selectPalette(value: PalettePreset) {
  commonStore.setPalette(value);
  filter.value = getBasemapFilter();
  emit("filter-change");
}

/** 取某个 token 当前的实际生效值（用于颜色选择器初值） */
function currentVarValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || null;
}

function updateCustomVar(name: string, value: string | null) {
  if (!value) return;
  commonStore.setCustomPaletteVar(name, value);
  emit("filter-change");
}

/** 单项重置：移除该 token 的自定义值 */
function resetCustomVar(name: string) {
  commonStore.resetCustomPaletteVar(name);
  emit("filter-change");
}

/** 全部重置：清空自定义变量并回到默认盘 */
function resetAllCustom() {
  commonStore.resetCustomPalette();
  filter.value = getBasemapFilter();
  emit("filter-change");
}

function updateFilter(key: keyof typeof filter.value, value: number | number[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  if (next === undefined) return;
  filter.value = { ...filter.value, [key]: next };
  // 滤镜参数独立于调色盘：存成 override，不随预设盘切换被清掉
  commonStore.setFilterOverride({ ...filter.value });
  emit("filter-change");
}

function resetFilter() {
  commonStore.setFilterOverride(null);
  filter.value = getBasemapFilter();
  emit("filter-change");
}

watch(visible, (open) => {
  if (open) filter.value = getBasemapFilter();
});

defineExpose({ open, close });
</script>

<template>
  <button class="palette-toggle" type="button" title="调色盘" @click="open">
    <Icon icon="mdi:tune-variant" :size="20" />
  </button>

  <el-drawer v-model="visible" title="调色盘" direction="rtl" size="380px" append-to-body>
    <div class="palette-panel">
      <section class="palette-section">
        <h4 class="palette-section-title">主题</h4>
        <el-radio-group :model-value="themeColor" size="small" @update:modelValue="selectTheme">
          <el-radio-button value="DAY">日间</el-radio-button>
          <el-radio-button value="NIGHT">夜间</el-radio-button>
        </el-radio-group>
      </section>

      <section class="palette-section">
        <h4 class="palette-section-title">调色盘预设</h4>
        <div class="palette-preset-grid">
          <button
            v-for="item in PRESET_OPTIONS"
            :key="item.value"
            class="palette-preset"
            :class="{ active: palette === item.value }"
            type="button"
            @click="selectPalette(item.value)"
          >
            <span class="palette-preset-name">{{ item.label }}</span>
            <span class="palette-preset-desc">{{ item.desc }}</span>
          </button>
        </div>
      </section>

      <section class="palette-section">
        <div class="palette-section-head">
          <h4 class="palette-section-title">自定义变量</h4>
          <el-button v-if="customCount" size="small" text @click="resetAllCustom">全部重置</el-button>
        </div>
        <div v-for="item in CUSTOM_VARS" :key="item.name" class="palette-var-row">
          <span class="palette-var-label">{{ item.label }}</span>
          <el-color-picker
            :model-value="customPalette[item.name] ?? currentVarValue(item.name)"
            size="small"
            :predefine="['#22d3ee', '#3385ff', '#f59e0b', '#0a1628', '#1e293b', '#ffffff']"
            @update:modelValue="updateCustomVar(item.name, $event)"
          />
          <code class="palette-var-name">{{ item.name }}</code>
          <el-button
            v-if="customPalette[item.name]"
            size="small"
            text
            title="重置该项"
            @click="resetCustomVar(item.name)"
          >
            重置
          </el-button>
        </div>
        <p class="palette-tip">改自定义变量会自动切到「自定义」盘；单项可重置，全部可一键清空。</p>
      </section>

      <section class="palette-section">
        <div class="palette-section-head">
          <h4 class="palette-section-title">底图滤镜</h4>
          <el-button v-if="filterOverride" size="small" text @click="resetFilter">重置滤镜</el-button>
        </div>
        <div v-for="item in filterFields" :key="item.key" class="palette-filter-row">
          <span class="palette-var-label">{{ item.label }}</span>
          <el-slider
            :model-value="filter[item.key]"
            :min="item.min"
            :max="item.max"
            :step="item.step"
            size="small"
            @update:modelValue="updateFilter(item.key, $event)"
          />
          <span class="palette-filter-value">{{ filter[item.key] }}{{ item.unit }}</span>
        </div>
        <code class="palette-filter-preview">{{ filterPreview }}</code>
        <p class="palette-tip">滤镜独立于调色盘保存，切换预设盘不会丢失。</p>
      </section>
    </div>
  </el-drawer>
</template>

<style scoped lang="less">
.palette-toggle {
  position: fixed;
  /* 右上角操作簇：从右往左第 1 位 */
  top: calc(var(--top-actions-center) - var(--top-actions-size) / 2);
  right: calc(
    var(--top-actions-right) + var(--weather-panel-width) + var(--top-actions-gap)
  );
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--top-actions-size);
  height: var(--top-actions-size);
  padding: 0;
  border: 0;
  color: var(--text-secondary);
  background: transparent;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: var(--accent-cyan);
  }
}

.palette-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.palette-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.palette-section-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.palette-preset-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.palette-preset {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  text-align: left;
  background: var(--widget-bg);
  border: 1px solid var(--widget-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    border-color: var(--accent-cyan-soft);
  }

  &.active {
    border-color: var(--accent-cyan);
    box-shadow: var(--accent-glow);
  }
}

.palette-preset-name {
  font-size: 12px;
  color: var(--text-primary);
}

.palette-preset-desc {
  font-size: 11px;
  color: var(--text-muted);
}

.palette-var-row,
.palette-filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.palette-var-label {
  width: 72px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.palette-var-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
}

.palette-filter-row :deep(.el-slider) {
  flex: 1;
  margin-right: 0;
}

.palette-filter-value {
  width: 56px;
  flex-shrink: 0;
  font-size: 11px;
  text-align: right;
  color: var(--text-secondary);
}

.palette-filter-preview {
  display: block;
  margin-bottom: 8px;
  padding: 6px 8px;
  font-size: 10px;
  line-height: 1.5;
  word-break: break-all;
  color: var(--text-muted);
  background: var(--widget-bg);
  border-radius: var(--radius-sm);
}

.palette-tip {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-muted);
}
</style>
