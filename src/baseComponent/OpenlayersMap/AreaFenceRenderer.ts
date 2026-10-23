import Feature from 'ol/Feature'
import type OlMap from 'ol/Map'
import type View from 'ol/View'
import GeoJSON from 'ol/format/GeoJSON'
import type { Extent } from 'ol/extent'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Fill, Stroke, Style } from 'ol/style'
import type { GenericController } from '@/controller/core/generic'
import type { AreaFenceClearData, AreaFenceHighlightData } from '@/controller/core/protocol/BusinessProtocol'
import { themeAccent, withAlpha } from '@/utils/themeColor'

/** 默认业务分组：与业务侧一致，多业务并存时按 businessId 分图层 */
const DEFAULT_BUSINESS_ID = 'area_weather_default'
/** 闪烁间隔与总时长，与地址机器人的闪烁节奏保持一致 */
const FLASH_INTERVAL_MS = 500
const FLASH_DURATION_MS = 3000
/** 定位动画时长与边距 */
const FIT_DURATION_MS = 1200
const FIT_PADDING: [number, number, number, number] = [80, 80, 80, 80]

type FenceRenderState = {
  layer: VectorLayer<VectorSource>
  generation: number
  interval?: ReturnType<typeof setInterval>
  flashEnd?: ReturnType<typeof setTimeout>
  cancelFit?: () => void
}

const fitAnimationOwners = new WeakMap<View, () => void>()

/**
 * 行政区划围栏渲染器。
 * 选中区划后：定位到围栏 → 闪烁高亮 → 保留常驻描边。
 * 描边色跟随主题强调色，切换主题时实时取值。
 */
export class AreaFenceRenderer {
  private readonly fences = new Map<string, FenceRenderState>()
  private disposed = false

  constructor(private readonly genericController: GenericController) {}

  /** 高亮行政区划围栏：定位 + 闪烁 + 常驻描边 */
  public areaFenceHighlight(data: AreaFenceHighlightData, options?: { businessId?: string }): void {
    if (this.disposed) return
    if (!data?.geometry) return

    const businessId = options?.businessId ?? DEFAULT_BUSINESS_ID
    const previous = this.fences.get(businessId)
    if (previous) this.cancelTimers(previous)

    const layer = this.ensureLayer(businessId)
    const source = layer.getSource()
    if (!source) return

    const format = new GeoJSON()
    let feature: Feature | null = null
    try {
      const parsed = format.readFeature(
        { type: 'Feature', geometry: data.geometry },
        {
          dataProjection: 'EPSG:4326',
          featureProjection: this.getProjection(),
        },
      )
      feature = Array.isArray(parsed) ? (parsed[0] ?? null) : parsed
    } catch (error) {
      console.error('[AreaFenceRenderer] 围栏几何解析失败', error)
      return
    }
    if (!feature) return

    feature.setId(`area_fence_${data.areaCode}`)
    feature.setProperties({ areaCode: data.areaCode, areaName: data.areaName })
    feature.setStyle(this.buildStyle(data, false))

    source.clear()
    source.addFeature(feature)
    layer.setVisible(true)

    const state: FenceRenderState = {
      layer,
      generation: (previous?.generation ?? 0) + 1,
    }
    this.fences.set(businessId, state)
    const generation = state.generation
    const isCurrent = () => !this.disposed && this.fences.get(businessId) === state && state.generation === generation

    const extent = source.getExtent()
    if (extent && extent.length >= 4 && extent.every(Number.isFinite)) {
      this.fitToExtent(extent, state)
    }

    if (data.flash === false) return
    this.startFlash(feature, data, state, isCurrent)
  }

  /** 清除行政区划围栏 */
  public areaFenceClear(data?: AreaFenceClearData): void {
    if (this.disposed) return
    const businessId = data?.businessId ?? DEFAULT_BUSINESS_ID
    const state = this.fences.get(businessId)
    if (!state) return
    state.generation += 1
    this.cancelTimers(state)
    state.layer.getSource()?.clear()
    state.layer.setVisible(false)
    this.fences.delete(businessId)
  }

  public dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.fences.forEach((state, businessId) => {
      state.generation += 1
      this.cancelTimers(state)
      state.layer.getSource()?.clear()
      state.layer.setVisible(false)
      if (this.genericController.getVectorLayer(this.layerName(businessId)) === state.layer) {
        this.genericController.removeLayer(state.layer)
      }
    })
    this.fences.clear()
  }

  private layerName(businessId: string): string {
    return `area_fence_${businessId}`
  }

  private ensureLayer(businessId: string): VectorLayer<VectorSource> {
    const name = this.layerName(businessId)
    const existing = this.genericController.getVectorLayer(name)
    if (existing) return existing
    const layer = new VectorLayer({
      source: new VectorSource(),
      zIndex: 20,
      properties: { name },
    })
    this.genericController.addLayer(layer)
    return layer
  }

  private getProjection(): string | undefined {
    const map = (this.genericController as unknown as { map?: OlMap }).map
    return map?.getView()?.getProjection()?.getCode()
  }

  /** 描边色取主题强调色，保证日夜主题切换后围栏颜色同步 */
  private buildStyle(data: AreaFenceHighlightData, flashing: boolean): Style {
    const accent = data.strokeColor || themeAccent('#22d3ee')
    const width = data.strokeWidth ?? 3
    return new Style({
      fill: new Fill({ color: withAlpha(accent, flashing ? 0.35 : 0.16) }),
      stroke: new Stroke({ color: accent, width: flashing ? width + 2 : width }),
    })
  }

  private startFlash(
    feature: Feature,
    data: AreaFenceHighlightData,
    state: FenceRenderState,
    isCurrent: () => boolean,
  ): void {
    let visible = false
    state.interval = setInterval(() => {
      if (!isCurrent()) return
      visible = !visible
      feature.setStyle(this.buildStyle(data, visible))
    }, FLASH_INTERVAL_MS)
    state.flashEnd = setTimeout(() => {
      this.cancelTimers(state)
      if (!isCurrent()) return
      // 闪烁结束回落为常驻描边
      feature.setStyle(this.buildStyle(data, false))
    }, FLASH_DURATION_MS)
  }

  private cancelTimers(state: FenceRenderState): void {
    state.cancelFit?.()
    state.cancelFit = undefined
    if (state.interval !== undefined) clearInterval(state.interval)
    if (state.flashEnd !== undefined) clearTimeout(state.flashEnd)
    state.interval = undefined
    state.flashEnd = undefined
  }

  /** 视口动画定位到围栏范围 */
  private fitToExtent(extent: Extent, state: FenceRenderState): void {
    const map = (this.genericController as unknown as { map?: OlMap }).map
    const view = map?.getView()
    if (!view) return

    fitAnimationOwners.get(view)?.()
    view.cancelAnimations()
    const originalAnimate = view.animateInternal
    let starting = true
    let active = true
    const release = () => {
      if (!active) return
      active = false
      if (view.animateInternal === animateInternal) view.animateInternal = originalAnimate
      if (fitAnimationOwners.get(view) === cancel) fitAnimationOwners.delete(view)
      if (state.cancelFit === cancel) state.cancelFit = undefined
    }
    const cancel = () => {
      if (!active) return
      release()
      view.cancelAnimations()
    }
    const animateInternal: View['animateInternal'] = (...args) => {
      if (!starting) cancel()
      originalAnimate.apply(view, args)
    }
    fitAnimationOwners.set(view, cancel)
    state.cancelFit = cancel
    view.animateInternal = animateInternal
    try {
      view.fit(extent, {
        duration: FIT_DURATION_MS,
        padding: FIT_PADDING,
        maxZoom: 20,
        callback: release,
      })
    } catch (error) {
      cancel()
      throw error
    } finally {
      starting = false
    }
  }
}
