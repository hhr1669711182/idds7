/*
 * @Author: huanghuanrong
 * @Date: 2026-05-06 16:45:28
 * @LastEditTime: 2026-07-10 10:02:50
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\store\useLayersStore.ts
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  DEFAULT_CHECKED_IDS,
  DEFAULT_TOOLBAR_LAYER_CONFIGS,
  LAYER_MODE_DEFAULT_CHECKED_IDS,
  LAYER_MODE_HIDDEN_LAYER_IDS,
  type LayerConfig,
  type LayerViewMode,
} from '@/config/layers'

const normalizeLayerIds = (ids: string[], configs: LayerConfig[]) => {
  const layerIdSet = new Set(configs.map((config) => config.id))
  const next: string[] = []
  ids.forEach((id) => {
    if (layerIdSet.has(id) && !next.includes(id)) {
      next.push(id)
    }
  })
  return next
}

export const useLayersStore = defineStore(
  'layers',
  () => {
    const checkedIds = ref<string[]>([...DEFAULT_CHECKED_IDS])
    const layerConfigs = ref<LayerConfig[]>([...DEFAULT_TOOLBAR_LAYER_CONFIGS])

    const visibleIds = computed(() => new Set(checkedIds.value))
    const layerIdSet = computed(() => new Set(layerConfigs.value.map((config) => config.id)))

    const items = computed(() =>
      layerConfigs.value.map((config) => ({
        ...config,
        disabled: false,
      })),
    )

    const setCheckedIds = (ids: string[]) => {
      checkedIds.value = normalizeLayerIds(ids, layerConfigs.value)
    }

    const setLayerConfigs = (configs: LayerConfig[], options: { checkedIds?: string[] } = {}) => {
      const seen = new Set<string>()
      layerConfigs.value = configs.filter((config) => {
        if (seen.has(config.id)) return false
        seen.add(config.id)
        return true
      })

      setCheckedIds(options.checkedIds ?? checkedIds.value)
    }

    const setLayerVisible = (id: string, visible: boolean) => {
      if (!layerIdSet.value.has(id)) return

      const set = new Set(checkedIds.value)
      if (visible) set.add(id)
      else set.delete(id)

      setCheckedIds(Array.from(set))
    }

    const toggle = (id: string) => {
      if (!layerIdSet.value.has(id)) return
      setLayerVisible(id, !visibleIds.value.has(id))
    }

    const toggleAll = (checked: boolean) => {
      setCheckedIds(checked ? layerConfigs.value.map((config) => config.id) : [])
    }

    const isChecked = (id: string) => visibleIds.value.has(id)

    const getConfig = (id: string): LayerConfig | undefined => layerConfigs.value.find((config) => config.id === id)

    // ===== 图层工具栏展示模式（LayerViewMode）=====
    // 业务真值在 useUserStore（shared.mode / MapMode），此处为工具栏投影：
    // 只决定"当前按哪个隐藏表过滤工具栏磁贴 + 无选择时落哪套默认集"。
    const activeMode = ref<LayerViewMode>('onDuty')

    /**
     * 切换展示模式：按该模式隐藏表过滤当前勾选（保留交集）；
     * 交集为空 → 落该模式默认集。
     * 不持久化 activeMode（挂载时由驱动方 immediate 对齐当前共享态，避免恢复错位）。
     */
    const setMode = (mode: LayerViewMode) => {
      if (mode === activeMode.value) return
      activeMode.value = mode
      const hidden = new Set(LAYER_MODE_HIDDEN_LAYER_IDS[mode])
      const kept = checkedIds.value.filter((id) => !hidden.has(id))
      setCheckedIds(kept.length ? kept : LAYER_MODE_DEFAULT_CHECKED_IDS[mode])
    }

    setCheckedIds(checkedIds.value)

    return {
      checkedIds,
      visibleIds,
      layerConfigs,
      items,
      activeMode,
      setCheckedIds,
      setLayerConfigs,
      setLayerVisible,
      toggle,
      toggleAll,
      isChecked,
      getConfig,
      setMode,
    }
  },
  {
    persist: {
      storage: sessionStorage,
      pick: ['checkedIds'],
    },
  },
)
