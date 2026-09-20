<!--
 * @Author: ljh
 * @Date: 2026-08-27 10:30:08
 * @LastEditTime: 2026-08-27 10:39:46
 * @LastEditors: ljh
 * @Description: Dispatch1 页面独立图层工具栏，图层选择状态与普通地图隔离。
 * @FilePath: src\components\dispatchMap1\Dispatch1Layers.vue
-->
<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useDispatch1MapStore } from '@/store/useDispatch1MapStore';
import { useLayersStore } from '@/store/useLayersStore';
import type { LayerConfig } from '@/config/layers';
import { TEMP_FRONTEND_LAYER_IDS } from '@/baseComponent/OpenlayersMap/layers';

const dispatch1MapStore = useDispatch1MapStore();
const layersStore = useLayersStore();
const { checkedIds } = storeToRefs(dispatch1MapStore);
const { items } = storeToRefs(layersStore);

type LayerToolbarItem = LayerConfig & {
  disabled?: boolean;
};

type ToolbarItem = LayerToolbarItem | {
  id: 'all';
  name: string;
  icon: string;
  disabled?: boolean;
};

const selectAllItem: ToolbarItem = {
  id: 'all',
  name: '全选',
  icon: 'mdi:checkbox-multiple-marked-outline',
};

const visibleItems = computed(() =>
  items.value.filter((item) => item.id !== TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER),
);
const toolbarItems = computed<ToolbarItem[]>(() =>
  visibleItems.value.length ? [...visibleItems.value, selectAllItem] : [],
);
const allIds = computed(() =>
  visibleItems.value.filter((item) => !item.disabled).map((item) => item.id),
);
const isAllSelected = computed(() =>
  allIds.value.length > 0
  && allIds.value.every((id) => checkedIds.value.includes(id)),
);
const isChecked = (id: string) =>
  id === 'all' ? isAllSelected.value : checkedIds.value.includes(id);

const toggleLayer = (id: string) => {
  const next = new Set(checkedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  dispatch1MapStore.setCheckedIds([...next]);
};

const onTileClick = (item: ToolbarItem) => {
  if (item.disabled) return;
  if (item.id === 'all') {
    dispatch1MapStore.setCheckedIds(isAllSelected.value ? [] : [...allIds.value]);
    return;
  }
  toggleLayer(item.id);
};
</script>

<template>
  <div
    v-if="toolbarItems.length"
    class="dispatch1-layer-toolbar"
    role="toolbar"
    aria-label="Dispatch1 图层工具栏"
  >
    <button
      v-for="item in toolbarItems"
      :key="item.id"
      class="tile"
      :class="{ checked: isChecked(item.id), disabled: !!item.disabled }"
      type="button"
      :disabled="!!item.disabled"
      @click="onTileClick(item)"
    >
      <span v-if="isChecked(item.id)" class="badge" role="img" aria-label="已选">
        <Icon icon="mdi:check" :size="12" />
      </span>
      <span class="icon">
        <Icon :icon="item.icon || 'mdi:layers-outline'" :size="20" />
      </span>
      <span class="label">{{ item.name }}</span>
    </button>
  </div>
</template>

<style scoped lang="less">
.dispatch1-layer-toolbar {
  position: absolute;
  bottom: 20px;
  left: 50%;
  z-index: 100;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 6px;
  border: 1px solid rgba(51, 220, 255, 0.35);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(10, 98, 120, 0.92), rgba(6, 42, 60, 0.92));
  box-shadow:
    0 8px 18px rgba(0, 0, 0, 0.35),
    0 0 0 1px rgba(0, 0, 0, 0.25) inset,
    0 0 16px rgba(51, 220, 255, 0.14) inset;
}

.tile {
  position: relative;
  width: 62px;
  height: 54px;
  border: 1px solid rgba(51, 220, 255, 0.28);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(10, 98, 120, 0.9), rgba(6, 42, 60, 0.9));
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25) inset;
  color: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 6px;
  user-select: none;

  &:hover { border-color: rgba(51, 220, 255, 0.45); }
  &:focus-visible {
    outline: 2px solid rgba(255, 205, 110, 0.75);
    outline-offset: 2px;
  }
  &.checked {
    font-weight: 600;
    border-color: rgba(255, 205, 110, 0.55);
    background: linear-gradient(180deg, rgba(160, 100, 40, 0.92), rgba(90, 55, 20, 0.92));
    box-shadow:
      0 0 0 1px rgba(255, 205, 110, 0.25) inset,
      0 0 16px rgba(255, 185, 85, 0.14) inset;
  }
  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.icon { line-height: 0; }
.label {
  font-size: 12px;
  line-height: 1;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
}
.badge {
  position: absolute;
  top: -4px;
  right: -2px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: rgba(255, 165, 35, 0.95);
  box-shadow:
    0 6px 14px rgba(0, 0, 0, 0.11),
    0 0 0 2px rgba(5, 20, 30, 0.24);
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.95);
}
</style>
