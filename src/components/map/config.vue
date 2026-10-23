<template>
  <button class="cfg-toggle" type="button" @click="togglePanel">
    <Icon icon="streamline-plump-color:map-fold" :size="24" />
  </button>

  <section v-if="configOpen" class="cfg-panel">
    <div class="cfg-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        class="cfg-tab"
        :class="{ active: activeTab === tab.value }"
        type="button"
        @click="activeTab = tab.value"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="activeTab === 'feature'" class="cfg-feature">
      <div v-for="item in featureSliders" :key="item.key" class="cfg-slider">
        <span class="cfg-label">{{ item.label }}</span>
        <div class="cfg-slider-body">
          <span>{{ feature[item.key] }}</span>
          <el-slider
            :model-value="feature[item.key]"
            :min="item.min"
            :max="item.max"
            :step="item.step"
            :show-tooltip="false"
            @update:modelValue="updateFeature(item.key, $event)"
          />
          <span>{{ item.max }}</span>
        </div>
      </div>

      <div class="cfg-options">
        <div v-for="group in featureFieldGroups" :key="group.title" class="cfg-group">
          <div class="cfg-group-label">{{ group.title }}</div>
          <div class="cfg-group-fields">
            <div
              v-for="item in group.fields"
              :key="item.key"
              class="cfg-option"
              :class="{ 'cfg-option--radio': item.kind === 'radio', 'cfg-option--number': item.kind === 'number' }"
            >
              <span class="cfg-label">{{ item.label }}</span>
              <el-switch
                v-if="item.kind === 'switch'"
                :model-value="feature[item.key]"
                size="small"
                @update:modelValue="updateFeature(item.key, $event)"
              />
              <el-radio-group
                v-else-if="item.kind === 'radio'"
                :model-value="feature[item.key]"
                @update:modelValue="updateFeature(item.key, $event)"
              >
                <el-radio v-for="opt in item.options" :key="String(opt.value)" :value="opt.value">
                  {{ opt.label }}
                </el-radio>
              </el-radio-group>
              <div v-else class="cfg-number">
                <el-input-number
                  :model-value="feature[item.key]"
                  :min="item.min"
                  :max="item.max"
                  :step="item.step"
                  :precision="item.precision"
                  size="small"
                  @update:modelValue="updateFeature(item.key, $event)"
                />
                <span>{{ item.unit }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="cfg-layer">
      <div class="cfg-top">
        <label class="cfg-field">
          <span class="cfg-label">分组名称:</span>
          <el-select :model-value="selected.groupId" size="small" :teleported="false" @update:modelValue="selectGroup">
            <el-option v-for="group in groups" :key="group.id" :label="group.name" :value="group.id" />
          </el-select>
        </label>
        <label class="cfg-field">
          <span class="cfg-label">图层组顺序:</span>
          <span class="cfg-inline">
            <el-select
              :model-value="currentGroup.order"
              size="small"
              :teleported="false"
              @update:modelValue="setGroupOrder"
            >
              <el-option v-for="n in groupOrderOptions" :key="n" :label="String(n)" :value="n" />
            </el-select>
            <el-switch v-model="currentGroup.visible" size="small" @change="setGroupVisible" />
          </span>
        </label>
      </div>

      <div class="cfg-body">
        <div class="cfg-card">
          <div class="cfg-card-label">选择大类</div>
          <div class="cfg-list">
            <div v-for="cat in currentGroup.categories" :key="cat.id" class="cfg-row">
              <button class="cfg-radio" type="button" @click="selectCategory(cat.id)">
                <span class="cfg-dot" :class="{ on: cat.id === selectedCategoryId }" />
                <span>{{ cat.name }}</span>
              </button>
              <el-switch v-model="cat.visible" size="small" @change="setCategoryVisible(cat)" />
            </div>
          </div>
        </div>

        <div class="cfg-card">
          <div class="cfg-card-label">选择细类资源</div>
          <div class="cfg-items">
            <div v-for="resource in currentCategory.resources" :key="resource.id" class="cfg-row cfg-item">
              <label class="cfg-check">
                <el-checkbox v-model="resource.enabled" size="small" @change="setResourceEnabled(resource)" />
                <span>{{ resource.name }}</span>
              </label>
              <el-switch
                v-model="resource.visible"
                size="small"
                :disabled="!resource.enabled"
                @change="syncDraftState"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="cfg-footer">
      <el-button size="small" @click="cancel">取消</el-button>
      <el-button size="small" type="primary" :loading="saving" :disabled="!isDirty" @click="save"> 保存 </el-button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";

import { useMapConfigStore, usePanelStore } from "@/store/index.ts";
import {
  createDefaultMapConfig,
  FEATURE_ZOOM_LIMITS,
  normalizeMapConfig,
  type ConfigTab,
  type FeatureSettings,
  type MapConfigPayload,
  type MapLayerCategory,
  type MapLayerGroup,
  type MapLayerResource,
  type MapMode,
} from "@/config/mapConfig.ts";

type SliderKey = "minZoom" | "maxZoom" | "alarmZoom";
type SwitchKey = Exclude<keyof FeatureSettings, SliderKey | "bufferKm" | "mapMode">;
type FeatureValue = FeatureSettings[keyof FeatureSettings];

type SliderField = {
  key: SliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
};

type SwitchField = {
  kind: "switch";
  key: SwitchKey;
  label: string;
};

type RadioField = {
  kind: "radio";
  key: "mapMode";
  label: string;
  options: { label: string; value: MapMode }[];
};

type NumberField = {
  kind: "number";
  key: "bufferKm";
  label: string;
  unit: string;
  min: number;
  max?: number;
  step: number;
  precision: number;
};

type FeatureField = SwitchField | RadioField | NumberField;

type FeatureGroup = {
  title: string;
  fields: FeatureField[];
};

const props = defineProps<{ modelValue?: MapConfigPayload; defaultTab?: ConfigTab }>();
const emit = defineEmits<{
  (e: "save", payload: MapConfigPayload): void;
  (e: "cancel"): void;
  (e: "update:modelValue", payload: MapConfigPayload): void;
}>();

const panelStore = usePanelStore();
const mapConfigStore = useMapConfigStore();
const { configOpen } = storeToRefs(panelStore);
const { config, saving } = storeToRefs(mapConfigStore);

const tabs: { label: string; value: ConfigTab }[] = [
  { label: "功能配置", value: "feature" },
  { label: "图层配置", value: "layer" },
];

const featureSliders: SliderField[] = [
  { key: "minZoom", label: "最小缩放比例:", ...FEATURE_ZOOM_LIMITS.minZoom, step: 1 },
  { key: "maxZoom", label: "最大缩放比例:", ...FEATURE_ZOOM_LIMITS.maxZoom, step: 1 },
  { key: "alarmZoom", label: "警情定位比例:", min: 0, max: 21, step: 1 },
];

const featureFieldGroups: FeatureGroup[] = [
  {
    title: "地图工具",
    fields: [
      { kind: "switch", key: "showNav", label: "导航组件" },
      { kind: "switch", key: "showDraw", label: "绘制组件" },
      { kind: "switch", key: "showOther", label: "其它组件" },
    ],
  },
  {
    title: "地图控件",
    fields: [
      { kind: "switch", key: "showEagleEye", label: "鹰眼" },
      { kind: "switch", key: "showCompass", label: "指北针" },
      { kind: "switch", key: "showScaleLine", label: "比例尺" },
    ],
  },
  {
    title: "数据服务",
    fields: [
      { kind: "switch", key: "showWeather", label: "天气面板" },
      { kind: "switch", key: "showTraffic", label: "实时路况" },
      { kind: "switch", key: "showRoutePlan", label: "路径规划" },
      { kind: "switch", key: "showPopulation", label: "人口标绘" },
      { kind: "switch", key: "showTopic", label: "专题图" },
    ],
  },
  {
    title: "面板工具",
    fields: [
      { kind: "switch", key: "showClear", label: "清除/设置" },
      { kind: "switch", key: "showCoordinate", label: "经纬度" },
      { kind: "switch", key: "showLayerToolbar", label: "图层工具栏" },
      { kind: "switch", key: "showCircleQuery", label: "圈选查询" },
      { kind: "switch", key: "showPalette", label: "调色盘" },
    ],
  },
  {
    title: "地图参数",
    fields: [
      {
        kind: "radio",
        key: "mapMode",
        label: "地图",
        options: [
          { label: "接处警", value: "dispatch" },
          { label: "一张图", value: "oneMap" },
        ],
      },
      { kind: "number", key: "bufferKm", label: "缓冲范围", unit: "千米", min: 0, step: 0.1, precision: 1 },
      { kind: "switch", key: "queryCustomPoi", label: "自定义兴趣点" },
      { kind: "switch", key: "showCaseClosedStyle", label: "灾情结案样式" },
      { kind: "switch", key: "showUavTrack", label: "无人机轨迹" },
    ],
  },
];

const emptyGroup: MapLayerGroup = {
  id: "",
  name: "",
  order: 1,
  visible: false,
  categories: [],
};

const emptyCategory: MapLayerCategory = {
  id: "",
  name: "",
  order: 1,
  visible: false,
  resources: [],
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const normalize = (payload: MapConfigPayload) => normalizeMapConfig(clone(payload));
const sourceConfig = () => normalize(props.modelValue ?? config.value ?? createDefaultMapConfig());

const activeTab = ref<ConfigTab>(props.defaultTab ?? "layer");
const initial = ref<MapConfigPayload>(sourceConfig());
const draft = reactive<MapConfigPayload>(clone(initial.value));
const selected = reactive({ groupId: firstGroupId(initial.value), categoryId: firstCategoryId(initial.value) });

const groups = computed(() => draft.layer.groups);
const feature = computed(() => draft.feature);
const groupOrderOptions = computed(() => Array.from({ length: Math.max(groups.value.length, 1) }, (_, i) => i + 1));
const currentGroup = computed(() => groups.value.find((group) => group.id === selected.groupId) ?? groups.value[0] ?? emptyGroup);
const currentCategory = computed(
  () => currentGroup.value.categories.find((category) => category.id === selected.categoryId) ?? currentGroup.value.categories[0] ?? emptyCategory,
);
const selectedCategoryId = computed(() => currentCategory.value.id);
const isDirty = computed(() => snapshot(draft) !== snapshot(initial.value));

function snapshot(payload: MapConfigPayload) {
  return JSON.stringify(normalize(payload));
}

function firstGroupId(payload: MapConfigPayload) {
  return payload.layer.groups[0]?.id ?? "";
}

function firstCategoryId(payload: MapConfigPayload) {
  return payload.layer.groups[0]?.categories[0]?.id ?? "";
}

function resetDraft(payload: MapConfigPayload) {
  const next = normalize(payload);
  initial.value = clone(next);
  Object.assign(draft, next);
  selected.groupId = firstGroupId(next);
  selected.categoryId = firstCategoryId(next);
}

function syncDraftState() {
  Object.assign(draft, normalize(draft));
}

function updateFeature(key: keyof FeatureSettings, value: unknown) {
  if (value === null || value === undefined) return;
  (feature.value as Record<keyof FeatureSettings, FeatureValue>)[key] = value as FeatureValue;
  clampZoom();
}

function clampZoom() {
  if (feature.value.minZoom > feature.value.maxZoom) feature.value.maxZoom = feature.value.minZoom;
  feature.value.alarmZoom = Math.min(Math.max(feature.value.alarmZoom, feature.value.minZoom), feature.value.maxZoom);
}

function selectGroup(groupId: unknown) {
  const group = groups.value.find((item) => item.id === String(groupId));
  selected.groupId = group?.id ?? "";
  selected.categoryId = group?.categories[0]?.id ?? "";
}

function selectCategory(categoryId: string) {
  selected.categoryId = categoryId;
}

function setGroupOrder(orderValue: unknown) {
  const target = Math.max(Number(orderValue) - 1, 0);
  const source = groups.value.findIndex((group) => group.id === currentGroup.value.id);
  if (source < 0) return;

  const [group] = groups.value.splice(source, 1);
  groups.value.splice(Math.min(target, groups.value.length), 0, group);
  groups.value.forEach((item, index) => {
    item.order = index + 1;
  });
}

function setGroupVisible(value: string | number | boolean) {
  for (const category of currentGroup.value.categories) {
    category.resources.forEach((resource) => {
      resource.visible = resource.enabled && value === true;
    });
  }
  syncDraftState();
}

function setCategoryVisible(category: MapLayerCategory) {
  category.resources.forEach((resource) => {
    resource.visible = resource.enabled && category.visible;
  });
  syncDraftState();
}

function setResourceEnabled(resource: MapLayerResource) {
  if (!resource.enabled) resource.visible = false;
  syncDraftState();
}

async function save() {
  const saved = await mapConfigStore.saveConfig({
    ...normalize(draft),
    updatedAt: new Date().toISOString(),
  });
  resetDraft(saved);
  emit("update:modelValue", saved);
  emit("save", saved);
  panelStore.setConfigOpen(false);
}

function cancel() {
  resetDraft(initial.value);
  emit("cancel");
  panelStore.setConfigOpen(false);
}

function togglePanel() {
  panelStore.setConfigOpen(!configOpen.value);
}

watch(() => props.modelValue, (value) => value && resetDraft(value), { deep: true });
watch(() => [feature.value.minZoom, feature.value.maxZoom, feature.value.alarmZoom], clampZoom);

onMounted(async () => {
  if (!props.modelValue) resetDraft(await mapConfigStore.loadConfig());
});
</script>

<style scoped lang="less">
// 主题色统一取自 src/styles/night.less 的 CSS 变量，避免各面板各写一套。
@bg: var(--panel-bg);
@bg-top: var(--header-bg);
@text: var(--text-primary);
@cyan: var(--accent-cyan);
@cyan-soft: var(--accent-cyan-soft);
@cyan-line: var(--accent-cyan-soft);
@cyan-text: var(--accent-cyan-strong);
@gold: var(--accent-gold);
@gap: 10px;

.flex-center() {
  display: flex;
  align-items: center;
}

.grid-row(@right: 1fr) {
  display: grid;
  grid-template-columns: 1fr @right;
  align-items: center;
  gap: @gap;
}

.field-grid(@label: 96px) {
  display: grid;
  grid-template-columns: @label 1fr;
  align-items: center;
  gap: @gap;
}

.panel-card() {
  padding: 10px;
  background: rgba(2, 18, 30, 0.55);
  border: 1px solid @cyan-soft;
  border-radius: 8px;
}

.cfg-toggle {
  .flex-center();
  position: fixed;
  top: calc(var(--top-actions-center) - var(--top-actions-size) / 2);
  right: calc(
    var(--top-actions-right) + var(--weather-panel-width) + var(--top-actions-gap) +
      var(--top-actions-size) + var(--top-actions-gap)
  );
  justify-content: center;
  width: var(--top-actions-size);
  height: var(--top-actions-size);
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  z-index: 1000;
  color: var(--text-secondary);
  transition: color 0.15s ease;

  &:hover {
    color: var(--accent-cyan);
  }
}

.cfg-panel {
  position: absolute;
  z-index: 1100;
  /* 落在右上角操作簇下方，避免压住天气面板 */
  top: calc(var(--top-actions-center) + var(--top-actions-switch-height) / 2 + var(--space-sm));
  right: 20px;
  width: 520px;
  max-width: 90vw;
  max-height: calc(100vh - 120px);
  padding: 12px;
  color: @text;
  background: linear-gradient(180deg, @bg-top, @bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35) inset;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  :deep(.el-input__wrapper),
  :deep(.el-select__wrapper) {
    background: rgba(0, 0, 0, 0.22);
    box-shadow: 0 0 0 1px @cyan-soft inset;
  }

  :deep(.el-input__inner),
  :deep(.el-select__selected-item) {
    color: @text;
  }

  :deep(.el-switch) {
    --el-switch-on-color: @gold;
    --el-switch-off-color: var(--accent-cyan-soft);
  }

  :deep(.el-checkbox__inner) {
    border-color: var(--accent-cyan-soft);
    background-color: rgba(0, 0, 0, 0.25);
  }

  :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
    border-color: @gold;
    background-color: @gold;
  }

  :deep(.el-button--primary) {
    --el-button-bg-color: var(--accent-cyan);
    --el-button-border-color: var(--accent-cyan);
    --el-button-hover-bg-color: var(--accent-cyan-strong);
    --el-button-hover-border-color: var(--accent-cyan-strong);
  }

  :deep(.el-button.is-disabled.el-button--primary) {
    --el-button-bg-color: var(--accent-cyan-soft);
    --el-button-border-color: var(--accent-cyan-soft);
  }
}

.cfg-tabs,
.cfg-inline,
.cfg-check,
.cfg-radio,
.cfg-footer {
  .flex-center();
  flex-shrink: 0;
}

.cfg-tabs {
  gap: 8px;
  padding-bottom: 10px;
}

.cfg-tab {
  padding: 6px 14px;
  color: rgba(144, 246, 255, 0.95);
  font-size: 14px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--accent-cyan-soft);
  border-radius: 8px 8px 0 0;
  cursor: pointer;

  &.active {
    color: #fff;
    background: linear-gradient(180deg, rgba(246, 195, 107, 0.95), rgba(191, 140, 56, 0.95));
    border-color: rgba(255, 210, 140, 0.7);
  }
}

.cfg-feature,
.cfg-layer {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: @cyan-line;
    border-radius: 3px;
  }
}

.cfg-feature {
  display: grid;
  gap: @gap;
}

/* 功能字段分组 */
.cfg-options {
  display: grid;
  gap: @gap;
}

.cfg-group {
  display: grid;
  gap: 6px;
}

/* 图层 tab 的分类列表保留 grid 布局 */
.cfg-list {
  display: grid;
  gap: @gap;
}

.cfg-group-label {
  color: var(--text-secondary);
  font-size: 11px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  opacity: 0.7;
  padding-bottom: 2px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.2);
}

/* 6 列基础网格：switch 占 2 列（每行 3 个）；radio / number 各占 3 列（每行 2 个，各半） */
.cfg-group-fields {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px 12px;
}

/* 每个 option：label 左、控件右，单行排布 */
.cfg-option {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.14);

  .cfg-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/* switch 类占 2 列（每行 3 个） */
.cfg-option {
  grid-column: span 2;
}

/* radio / number 各占 3 列（每行 2 个，各半） */
.cfg-option--radio,
.cfg-option--number {
  grid-column: span 3;
}


.cfg-option--radio .el-radio-group {
  gap: 4px;
}

.cfg-slider {
  .field-grid(150px);
}

.cfg-slider-body {
  display: grid;
  grid-template-columns: 34px 1fr 36px;
  align-items: center;
  justify-items: center;
  gap: @gap 12px;
  color: @cyan-text;
  font-size: 12px;
}

.cfg-top {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: @gap;
  padding: 6px 0 10px;
}

.cfg-field {
  .field-grid(84px);
}

.cfg-body {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: @gap;
}

.cfg-card {
  .panel-card();
}

.cfg-label {
  color: @cyan-text;
  font-size: 13px;
}

.cfg-card-label {
  color: rgba(176, 247, 255, 0.92);
  font-size: 13px;
  margin-bottom: 8px;
}

.cfg-row {
  .grid-row();
  min-height: 30px;
}

.cfg-radio {
  gap: @gap;
  padding: 0;
  color: @cyan-text;
  font-size: 14px;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.cfg-dot {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 186, 72, 0.75);
  border-radius: 50%;

  &.on {
    background: @gold;
  }
}

.cfg-items {
  overflow: auto;
  padding-right: 4px;
}

.cfg-item {
  padding: 6px 0;
  border-top: 1px solid @cyan-line;

  &:first-child {
    border-top: 0;
  }
}

.cfg-check,
.cfg-number,
.cfg-inline {
  gap: 8px;
  color: @cyan-text;
  font-size: 14px;
}

.cfg-footer {
  justify-content: flex-end;
  padding-top: 12px;
}
</style>
