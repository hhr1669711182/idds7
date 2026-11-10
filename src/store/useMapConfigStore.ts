import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  createDefaultMapConfig,
  fetchMapConfig,
  getToolbarLayerConfigs,
  getVisibleLayerIds,
  normalizeMapConfig,
  saveMapConfig,
  type FeatureBoolKey,
  type FeatureSettings,
  type MapConfigPayload,
} from '@/config/mapConfig.ts'
import { useLayersStore } from './useLayersStore.ts'
import { LAYER_MODE_HIDDEN_TOOL_KEYS } from '@/config/layers.ts'
import { resolveLayerViewMode } from '@/baseComponent/OpenlayersMap/gisMapConfig.ts'

export const useMapConfigStore = defineStore('mapConfig', () => {
  const config = ref<MapConfigPayload>(createDefaultMapConfig())
  const loading = ref(false)
  const saving = ref(false)
  const loaded = ref(false)

  /** 功能配置（各组件显隐的唯一读取源；视图层只读，随 config 响应式更新） */
  const feature = computed<FeatureSettings>(() => config.value.feature)

  /**
   * 当前图层展示模式（MapPhase 6 阶段 + 'flood' 特灾轴），与图层工具栏同源。
   * 直接复用 gisMapConfig.resolveLayerViewMode（业务真值在 useUserStore），
   * 不自建第二套派生逻辑，避免与图层轴漂移。
   */
  const viewMode = computed(resolveLayerViewMode)

  /**
   * 派生配置：在 feature（用户真实配置）基础上，按展示模式强制隐藏指定工具开关。
   * 只读派生、不改写 feature 本身 → 切出调派后自动恢复为用户原值，零持久化副作用。
   * flood 当前隐藏表为空（特灾态工具隐藏清单待定），故特灾下等同 feature。
   */
  const effectiveFeature = computed<FeatureSettings>(() => {
    const hidden = LAYER_MODE_HIDDEN_TOOL_KEYS[viewMode.value]
    if (!hidden.length) return feature.value
    const mask: Partial<Record<FeatureBoolKey, boolean>> = {}
    for (const key of hidden) mask[key] = false
    return { ...feature.value, ...mask }
  })

  /** 工具入口显隐判定（模式强制 + 用户配置 双重门控）；供工具组件模板使用 */
  const showTool = (key: FeatureBoolKey): boolean => effectiveFeature.value[key]

  const syncLayers = (payload = config.value) => {
    const layersStore = useLayersStore()
    layersStore.setLayerConfigs(getToolbarLayerConfigs(payload), {
      checkedIds: getVisibleLayerIds(payload),
    })
  }

  const loadConfig = async () => {
    if (loading.value) return config.value

    loading.value = true
    try {
      config.value = normalizeMapConfig(await fetchMapConfig())
      loaded.value = true
      syncLayers(config.value)
      return config.value
    } finally {
      loading.value = false
    }
  }

  const saveConfig = async (payload: MapConfigPayload) => {
    saving.value = true
    try {
      config.value = normalizeMapConfig(await saveMapConfig(payload))
      loaded.value = true
      syncLayers(config.value)
      return config.value
    } finally {
      saving.value = false
    }
  }

  return {
    config,
    feature,
    effectiveFeature,
    viewMode,
    showTool,
    loaded,
    loading,
    saving,
    loadConfig,
    saveConfig,
    syncLayers,
  }
})
