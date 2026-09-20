/*
 * @Author: huanghuanrong
 * @Date: 2026-05-06 16:45:28
 * @LastEditTime: 2026-07-10 10:02:50
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\store\useLayersStore.ts
 */
import { defineStore } from 'pinia'
import { piniaSession } from './piniaPersist'
import { computed, ref } from 'vue'
import {
  DEFAULT_CHECKED_IDS,
  DEFAULT_TOOLBAR_LAYER_CONFIGS,
  type LayerConfig,
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

    const setLayerConfigs = (
      configs: LayerConfig[],
      options: { checkedIds?: string[] } = {},
    ) => {
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

    const getConfig = (id: string): LayerConfig | undefined =>
      layerConfigs.value.find((config) => config.id === id)

    setCheckedIds(checkedIds.value)

    return {
      checkedIds,
      visibleIds,
      layerConfigs,
      items,
      setCheckedIds,
      setLayerConfigs,
      setLayerVisible,
      toggle,
      toggleAll,
      isChecked,
      getConfig,
    }
  },
  {
    persist: {
      storage: piniaSession,
      pick: ['checkedIds'],
    },
  },
)
