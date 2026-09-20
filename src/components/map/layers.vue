<script lang="ts">
import type { LayerConfig } from '@/config/layers'

export type LayerId = string

export type LayerToolbarItem = LayerConfig & {
  disabled?: boolean
}

export type LayerChangeHandler = (action: 'add' | 'remove', id: LayerId) => void
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useLayersStore } from '@/store/useLayersStore'

type ToolbarItem = LayerToolbarItem | {
  id: 'all'
  name: string
  icon: string
  disabled?: boolean
}

type CheckedChangePayload = {
  checkedIds: LayerId[]
  changedId: LayerId
  checked: boolean
}

type SelectAllPayload = {
  checkedIds: LayerId[]
  isAllSelected: boolean
}

const props = defineProps<{
  onLayerChange?: LayerChangeHandler
}>()

const emit = defineEmits<{
  (e: 'checked-change', payload: CheckedChangePayload): void
  (e: 'select-all', payload: SelectAllPayload): void
}>()

const layersStore = useLayersStore()
const { checkedIds, items } = storeToRefs(layersStore)

const selectAllItem: ToolbarItem = {
  id: 'all',
  name: '全选',
  icon: 'mdi:checkbox-multiple-marked-outline',
}

const toolbarItems = computed<ToolbarItem[]>(() =>
  items.value.length ? [...items.value, selectAllItem] : [],
)
const allIds = computed(() => items.value.filter((item) => !item.disabled).map((item) => item.id))

const isAllSelected = computed(() => {
  const ids = allIds.value
  return ids.length > 0 && ids.every((id) => checkedIds.value.includes(id))
})

const isChecked = (id: LayerId) => (id === 'all' ? isAllSelected.value : checkedIds.value.includes(id))

const notifyLayerChange = (action: 'add' | 'remove', id: LayerId) => {
  props.onLayerChange?.(action, id)
}

const toggleChecked = (item: ToolbarItem) => {
  if (item.disabled || item.id === 'all') return

  const wasChecked = checkedIds.value.includes(item.id)
  const checked = !wasChecked
  layersStore.setLayerVisible(item.id, checked)
  notifyLayerChange(checked ? 'add' : 'remove', item.id)
  emit('checked-change', {
    checkedIds: [...checkedIds.value],
    changedId: item.id,
    checked,
  })
}

const toggleAll = () => {
  const willCheck = !isAllSelected.value
  const previous = new Set(checkedIds.value)
  const next = willCheck ? allIds.value : []

  layersStore.setCheckedIds(next)

  if (willCheck) {
    next.forEach((id) => {
      if (!previous.has(id)) notifyLayerChange('add', id)
    })
  } else {
    allIds.value.forEach((id) => {
      if (previous.has(id)) notifyLayerChange('remove', id)
    })
  }

  emit('select-all', {
    checkedIds: [...checkedIds.value],
    isAllSelected: willCheck,
  })
}

const onTileClick = (item: ToolbarItem) => {
  if (item.id === 'all') toggleAll()
  else toggleChecked(item)
}
</script>

<template>
  <div v-if="toolbarItems.length" class="lt" role="toolbar" aria-label="图层工具栏">
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
.lt {
  z-index: 5;
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px;
  border-radius: 8px;
  border: 1px solid #364050;
  /* 完全不透明 —— 半透明父容器会让子元素 1px 边框做亚像素 alpha 混合导致发虚 */
  background: #1a1f2e;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.tile {
  position: relative;
  width: 62px;
  height: 54px;
  border-radius: 6px;
  border: 1px solid #364050;
  background: #2a3040;
  color: #ffffff;
  cursor: pointer;
  /* 强制 button 不使用浏览器默认样式 */
  appearance: none;
  padding: 0;
  margin: 0;
  outline: none;
  /* 提升独立 GPU layer，避免半透明叠加导致 subpixel 模糊 */
  transform: translateZ(0);
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 6px;
  user-select: none;
  transition: border-color 0.2s, background 0.2s;

  &:hover {
    border-color: #4a5a78;
    background: #3a4658;
  }

  &:focus-visible {
    outline: 2px solid var(--active-border);
    outline-offset: 2px;
  }

  &.checked {
    font-weight: 600;
    border-color: var(--active-border);
    background: #3a4a60;
    color: #ffffff;
  }

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.icon {
  line-height: 0;
}

.label {
  font-size: 12px;
  line-height: 1;
  color: #ffffff;
  /* text-shadow 让白字在暗背景上更锐利，避免 subpixel 渲染发虚 */
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
}

.badge {
  position: absolute;
  top: -4px;
  right: -2px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--active-border);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  display: grid;
  place-items: center;
  color: #ffffff;
}
</style>
