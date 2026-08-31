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
        <div v-for="item in featureFields" :key="item.key" class="cfg-option">
          <span class="cfg-label">{{ item.label }}</span>
          <el-radio-group
            v-if="item.kind === 'radio'"
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
            <el-select :model-value="currentGroup.order" size="small" :teleported="false" @update:modelValue="setGroupOrder">
              <el-option v-for="n in groupOrderOptions" :key="n" :label="String(n)" :value="n" />
            </el-select>
            <el-switch v-model="currentGroup.visible" size="small" @change="setGroupVisible" />
          </span>
        </label>
      </div>

      <div class="cfg-body">
        <div class="cfg-left">
          <div class="cfg-title">资源配置:</div>
          <div class="cfg-card">
            <div class="cfg-subtitle">选择大类:</div>
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
        </div>

        <div class="cfg-card">
          <div class="cfg-head">
            <span class="cfg-subtitle">选择细类资源:</span>
            <span class="cfg-subtitle">工具栏显示</span>
          </div>
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
      <el-button size="small" type="primary" :loading="saving" :disabled="!isDirty" @click="save">
        保存
      </el-button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";

import { useMapConfigStore, usePanelStore } from "@/store/index.ts";
import {
  createDefaultMapConfig,
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
type RadioKey = Exclude<keyof FeatureSettings, SliderKey | "bufferKm">;
type FeatureValue = FeatureSettings[keyof FeatureSettings];

type SliderField = {
  key: SliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
};

type RadioField = {
  kind: "radio";
  key: RadioKey;
  label: string;
  options: { label: string; value: boolean | MapMode }[];
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

type FeatureField = RadioField | NumberField;

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
  { key: "minZoom", label: "最小缩放比例:", min: 0, max: 22, step: 1 },
  { key: "maxZoom", label: "最大缩放比例:", min: 0, max: 22, step: 1 },
  { key: "alarmZoom", label: "警情定位比例:", min: 0, max: 22, step: 1 },
];

const featureFields: FeatureField[] = [
  { kind: "radio", key: "showNav", label: "地图工具导航组件:", options: visibleOptions() },
  { kind: "radio", key: "showDraw", label: "地图工具绘制组件:", options: visibleOptions() },
  { kind: "radio", key: "showOther", label: "地图工具其它组件:", options: visibleOptions() },
  { kind: "radio", key: "showEagleEye", label: "鹰眼:", options: visibleOptions() },
  {
    kind: "radio",
    key: "mapMode",
    label: "地图:",
    options: [
      { label: "接处警", value: "dispatch" },
      { label: "一张图", value: "oneMap" },
    ],
  },
  { kind: "number", key: "bufferKm", label: "缓冲范围:", unit: "千米", min: 0, step: 0.1, precision: 1 },
  {
    kind: "radio",
    key: "queryCustomPoi",
    label: "查询自定义兴趣点:",
    options: yesNoOptions(),
  },
  {
    kind: "radio",
    key: "showCaseClosedStyle",
    label: "灾情结案状态样式:",
    options: [
      { label: "显示", value: true },
      { label: "不显示", value: false },
    ],
  },
  {
    kind: "radio",
    key: "showUavTrack",
    label: "无人机实时轨迹:",
    options: [
      { label: "显示", value: true },
      { label: "不显示", value: false },
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

function visibleOptions() {
  return [
    { label: "隐藏", value: false },
    { label: "显示", value: true },
  ];
}

function yesNoOptions() {
  return [
    { label: "是", value: true },
    { label: "否", value: false },
  ];
}

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
@bg: #06131f;
@bg-top: #0b1b2a;
@text: rgba(235, 248, 255, 0.92);
@cyan: rgba(39, 210, 255, 0.55);
@cyan-soft: rgba(39, 210, 255, 0.25);
@cyan-line: rgba(39, 210, 255, 0.12);
@cyan-text: rgba(144, 246, 255, 0.92);
@gold: rgba(255, 155, 0, 0.9);
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
  top: 20px;
  left: 30px;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  z-index: 5;
}

.cfg-panel {
  position: absolute;
  z-index: 11;
  top: 50px;
  left: 20px;
  width: 520px;
  max-width: 90vw;
  padding: 12px;
  color: @text;
  background: linear-gradient(180deg, @bg-top, @bg);
  border: 2px solid @cyan;
  border-radius: 10px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35) inset;

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
    --el-switch-off-color: rgba(39, 210, 255, 0.35);
  }

  :deep(.el-checkbox__inner) {
    border-color: rgba(39, 210, 255, 0.35);
    background-color: rgba(0, 0, 0, 0.25);
  }

  :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
    border-color: @gold;
    background-color: @gold;
  }

  :deep(.el-button--primary) {
    --el-button-bg-color: rgba(39, 210, 255, 0.75);
    --el-button-border-color: rgba(39, 210, 255, 0.75);
    --el-button-hover-bg-color: rgba(39, 210, 255, 0.85);
    --el-button-hover-border-color: rgba(39, 210, 255, 0.85);
  }

  :deep(.el-button.is-disabled.el-button--primary) {
    --el-button-bg-color: rgba(39, 210, 255, 0.25);
    --el-button-border-color: rgba(39, 210, 255, 0.25);
  }
}

.cfg-tabs,
.cfg-inline,
.cfg-check,
.cfg-radio,
.cfg-footer {
  .flex-center();
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
  border: 1px solid rgba(39, 210, 255, 0.35);
  border-radius: 8px 8px 0 0;
  cursor: pointer;

  &.active {
    color: #fff;
    background: linear-gradient(180deg, rgba(246, 195, 107, 0.95), rgba(191, 140, 56, 0.95));
    border-color: rgba(255, 210, 140, 0.7);
  }
}

.cfg-feature,
.cfg-options,
.cfg-list {
  display: grid;
  gap: @gap;
}

.cfg-slider,
.cfg-option {
  .field-grid(150px);
}

.cfg-slider-body {
  display: grid;
  grid-template-columns: 34px 1fr 28px;
  align-items: center;
  gap: @gap;
  color: @cyan-text;
  font-size: 12px;
}

.cfg-top {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: @gap;
  padding: 6px 0 12px;
}

.cfg-field {
  .field-grid(84px);
}

.cfg-body {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 12px;
}

.cfg-card {
  .panel-card();
}

.cfg-label,
.cfg-title {
  color: @cyan-text;
  font-size: 13px;
}

.cfg-title {
  margin-bottom: 8px;
}

.cfg-subtitle {
  color: rgba(176, 247, 255, 0.92);
  font-size: 13px;
}

.cfg-head,
.cfg-row {
  .grid-row();
}

.cfg-head {
  padding-bottom: 10px;
}

.cfg-row {
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
  max-height: 260px;
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
  // gap: @gap;
  padding-top: 12px;
}
</style>
