/**
 * useBaseMapLayer — 底图 TileLayer 组合式 API
 *
 * 设计：
 * - 注册一次、全应用共享：同一 (activeId, night) 组合只创建一次 XYZ 实例，
 *   多 map 通过 sourcePool 共享；切换 activeId 时所有使用方同步 setSource。
 * - 夜间模式解耦：只 watch activeId，主题（日夜）切换不触发底图源重建；
 *   底图滤镜由调色盘系统独立控制（tileLoadFunction 读取 CSS 变量实时生效）。
 * - 切换防抖：activeId 连续快速变化时，停止变化 switchDebounce 毫秒后
 *   才执行一次 setSource，避免瓦片请求反复发起又被取消。
 * - 支持多实例：每个组件调用一次 useBaseMapLayer() 即获得独立 TileLayer，
 *   共享同一 source，不重复创建 XYZ。
 *
 * 使用前提：必须在 Vue 组件 setup 上下文中调用（watch / onUnmounted 自动随组件卸载清理）
 */
import { computed, onUnmounted, watch } from 'vue'
import TileLayer from 'ol/layer/Tile.js'
import type XYZ from 'ol/source/XYZ.js'
// import { storeToRefs } from 'pinia'
import { createBaseSourceSource, getBaseSourceById } from './baseSource.ts'
import { LAYER_NAMES } from './layers.ts'
import { useBaseSourceStore } from '@/store/useBaseSourceStore'
// import { THEME_COLOR } from '@/const/const.common'

// ── 全局 source 单例缓存池 ──────────────────────────────────────────
// 同一 (activeId, night) 只创建一次 XYZ；多 map 共享，GC 自然回收
// 对不支持 night 的 source，key 固定为 activeId（不区分日夜，避免重复创建）
const sourcePool = new Map<string, { source: XYZ; maxZoom: number }>()

const poolKey = (activeId: string, night: boolean): string => {
  const option = getBaseSourceById(activeId)
  if (option?.supportsNightMode) return `${activeId}:${night ? 1 : 0}`
  return activeId
}

const getSharedSource = (activeId: string, night: boolean) => {
  const key = poolKey(activeId, night)
  let entry = sourcePool.get(key)
  if (!entry) {
    const option = getBaseSourceById(activeId)
    const source = createBaseSourceSource(activeId, { night })
    entry = { source, maxZoom: option?.maxZoom ?? 20 }
    sourcePool.set(key, entry)
  }
  return entry
}

export interface UseBaseMapLayerOptions {
  /** 图层 className（默认 LAYER_NAMES.AMAP_LAYER；Swiper / WeatherTools / MaskTools 按此查找图层） */
  layerName?: string
  /** 瓦片预加载数（默认 4） */
  preload?: number
  /** 底图背景色（默认 '#fcf9f2'，与原 AMAP_LAYER 一致） */
  background?: string
  /**
   * 源切换防抖时间（毫秒）。
   * activeId 连续快速变化时，停止变化后才执行一次 setSource，
   * 避免中间态瓦片请求反复发起又被取消。传 0 关闭防抖（立即切换）。
   * 默认 150。
   */
  switchDebounce?: number
  /** 源切换回调（初始创建 + 每次 activeId 变化且防抖结束后），参数为新源 maxZoom */
  onMaxZoomChange?: (maxZoom: number) => void
  /** 源切换副作用回调（初始创建 + 每次 activeId 变化且防抖结束后），可用于条件设置 background 等 */
  onSourceChange?: (layer: TileLayer, activeId: string) => void
}

/**
 * 创建与全局底图缓存池共享的 TileLayer。
 * 切换 useBaseSourceStore.activeId 时自动（防抖）setSource，无需手动 sync；
 * 主题日夜切换不触发底图源重建（底图滤镜独立走调色盘）。
 * 必须在 Vue setup 上下文中调用。
 */
export const useBaseMapLayer = (options?: UseBaseMapLayerOptions): TileLayer => {
  const {
    layerName,
    preload = 4,
    background = '#fcf9f2',
    switchDebounce = 150,
    onMaxZoomChange,
    onSourceChange,
  } = options ?? {}

  const baseSourceStore = useBaseSourceStore()
  // const commonStore = useCommonStore()
  // const { themeColor } = storeToRefs(commonStore)
  // 夜间模式与底图滤镜暂时不做联动，night 恒为 false（即所有 source 走日版）
  // const night = computed(() => themeColor.value === THEME_COLOR.NIGHT)
  // 后续如需联动再恢复
  const night = computed(() => false)

  // 初始装配
  const initial = getSharedSource(baseSourceStore.activeId, night.value)
  onMaxZoomChange?.(initial.maxZoom)

  const layer = new TileLayer({
    source: initial.source,
    className: layerName ?? LAYER_NAMES.AMAP_LAYER,
    preload,
    background,
  })
  onSourceChange?.(layer, baseSourceStore.activeId)

  let switchTimer: number | undefined

  const applySource = () => {
    switchTimer = undefined
    const entry = getSharedSource(baseSourceStore.activeId, night.value)
    layer.setSource(entry.source)
    onMaxZoomChange?.(entry.maxZoom)
    onSourceChange?.(layer, baseSourceStore.activeId)
  }

  // 只 watch activeId：主题（night）变化不触发底图源重建，日夜与底图滤镜保持独立
  watch(
    () => baseSourceStore.activeId,
    () => {
      if (switchDebounce <= 0) {
        applySource()
        return
      }
      // 防抖：activeId 快速连续变化时取消前一次 setSource，
      // 避免中间态瓦片请求反复发起又被取消（浏览器/OL 会 abort 在途请求）
      clearTimeout(switchTimer)
      switchTimer = window.setTimeout(applySource, switchDebounce)
    },
  )

  onUnmounted(() => {
    if (switchTimer !== undefined) {
      clearTimeout(switchTimer)
      switchTimer = undefined
    }
  })

  return layer
}
