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
import { useVehicleTrackStore } from '@/store/useVehicleTrackStore'
import { LAYER_MODE_HIDDEN_LAYER_IDS } from '@/config/layers'

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
const vehicleTrackStore = useVehicleTrackStore()
const { checkedIds, items, activeMode } = storeToRefs(layersStore)
const { buttonVisible: vehicleTrackButtonVisible, panelVisible: vehicleTrackPanelVisible } =
  storeToRefs(vehicleTrackStore)

const selectAllItem: ToolbarItem = {
  id: 'all',
  name: '全选',
  icon: 'mdi:checkbox-multiple-marked-outline',
}

/** 当前模式隐藏表过滤后的工具栏图层项 */
const visibleItems = computed(() => {
  const hidden = new Set(LAYER_MODE_HIDDEN_LAYER_IDS[activeMode.value])
  return items.value.filter((item) => !hidden.has(item.id))
})

const toolbarItems = computed<ToolbarItem[]>(() =>
  visibleItems.value.length ? [...visibleItems.value, selectAllItem] : [],
)
const allIds = computed(() => visibleItems.value.filter((item) => !item.disabled).map((item) => item.id))

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
  // 工具栏磁贴均支持取消勾选（checked 只是展示态）；
  // locked 图层的「enabled 恒 true」限制只作用于配置管理 cfg-check，不在这里拦截
  // if ((item as LayerToolbarItem).locked) return

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

/** 有轨迹时切换面板；暂无轨迹时按当前警情重新查询，成功后自动打开面板。 */
const onVehicleTrackClick = () => {
  if (vehicleTrackStore.points.length) {
    vehicleTrackStore.togglePanel()
    return
  }
  vehicleTrackStore.requestReload()
}
</script>

<template>
  <div v-if="toolbarItems.length || vehicleTrackButtonVisible" class="lt" role="toolbar" aria-label="图层工具栏">
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
    <!-- 车辆历史轨迹入口：终态警情查询到轨迹后才出现，再次点击即关闭回放面板 -->
    <button
      v-if="vehicleTrackButtonVisible"
      class="tile"
      :class="{ checked: vehicleTrackPanelVisible }"
      type="button"
      @click="onVehicleTrackClick"
    >
      <span class="icon">
        <Icon icon="mdi:car-outline" :size="20" />
      </span>
      <span class="label">车辆GPS</span>
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
  border-radius: var(--radius-md);
  border: 1px solid var(--toolbar-border);
  background: var(--toolbar-bg);
  box-shadow: var(--toolbar-shadow);
}

.tile {
  position: relative;
  width: 62px;
  height: 54px;
  border-radius: var(--radius-md);
  border: 1px solid var(--toolbar-tile-border);
  background: var(--toolbar-tile-bg);
  color: var(--toolbar-tile-text);
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
    border-color: var(--toolbar-tile-hover-border);
    background: var(--toolbar-tile-hover-bg);
  }

  &:focus-visible {
    outline: 2px solid var(--active-border);
    outline-offset: 2px;
  }

  &.checked {
    font-weight: 600;
    border-color: var(--toolbar-tile-active-border);
    background: var(--toolbar-tile-active-bg);
    color: var(--toolbar-tile-active-text);
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
  color: inherit;
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
  background: var(--toolbar-badge-bg);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  display: grid;
  place-items: center;
  color: #ffffff;
}
</style>
