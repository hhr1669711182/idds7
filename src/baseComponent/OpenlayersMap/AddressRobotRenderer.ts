import Feature from 'ol/Feature'
import type OlMap from 'ol/Map'
import type View from 'ol/View'
import GeoJSON from 'ol/format/GeoJSON'
import type { Extent } from 'ol/extent'
import { Point } from 'ol/geom'
import VectorLayer from 'ol/layer/Vector'
import { fromLonLat } from 'ol/proj'
import VectorSource from 'ol/source/Vector'
import type { GenericController } from '@/controller/core/generic'
import type { AddressRobotGisSearchData } from '@/controller/core/protocol/BusinessProtocol'
import { EventBus } from '@/utils/mitt'
import { getStyle } from '@/baseComponent/amap/featureStyle'
import {
  createDisplayStyleFunction,
  createFlashStyleFunction,
  createSearchStyleFunction,
} from './AddressRobotUtils/searchFeatureStyle'
import { featureRenderOrder } from './AddressRobotUtils/featureRenderOrder'

type SearchRenderState = {
  layer: VectorLayer<VectorSource>
  generation: number
  delay?: ReturnType<typeof setTimeout>
  resolveDelay?: () => void
  interval?: ReturnType<typeof setInterval>
  flashEnd?: ReturnType<typeof setTimeout>
  cancelFit?: () => void
}

const fitAnimationOwners = new WeakMap<View, () => void>()

export class AddressRobotRenderer {
  private readonly searches = new Map<string, SearchRenderState>()
  private disposed = false
  private readonly owner = {}

  constructor(private readonly genericController: GenericController) {}

  public async addressRobotGisSearch(
    data: AddressRobotGisSearchData,
    options?: { businessId?: string },
  ): Promise<void> {
    if (this.disposed) return
    const businessId = options?.businessId ?? 'address_robot_default'
    const previous = this.searches.get(businessId)
    if (previous) this.cancelTimers(previous)

    let layer = this.genericController.getVectorLayer(businessId)
    if (!layer) {
      layer = new VectorLayer({
        source: new VectorSource(),
        style: createDisplayStyleFunction(),
        renderOrder: featureRenderOrder,
        declutter: true,
        zIndex: 20,
        properties: { name: businessId },
      })
      this.genericController.addLayer(layer)
    }
    layer.set('addressRobotRendererOwner', this.owner)
    const state: SearchRenderState = {
      layer,
      generation: (previous?.generation ?? 0) + 1,
    }
    this.searches.set(businessId, state)
    const generation = state.generation
    const isCurrent = () =>
      !this.disposed &&
      this.searches.get(businessId) === state &&
      state.generation === generation &&
      layer.get('addressRobotRendererOwner') === this.owner &&
      this.genericController.getVectorLayer(businessId) === layer

    const { gis_search, highlight_entities, overall_confidence } = data
    EventBus.emit('gis_search', { ...gis_search, confidence: overall_confidence })
    if (!isCurrent()) return
    layer.getSource()?.clear()
    layer.setVisible(false)
    const features: Feature[] = []
    const format = new GeoJSON()
    ;(highlight_entities ?? []).forEach((item, index) => {
      const { geom, ...attrs } = item.attributes
      if ((index + 1) % 2 === 0 && attrs.source_table === 'loi_road') {
        attrs.cn_name = undefined
      }
      features.push(
        ...format.readFeatures(
          {
            type: 'Feature',
            geometry: geom,
            properties: attrs,
          },
          {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857',
          },
        ),
      )
      const { source_table, latitude, longitude } = attrs
      if (source_table === 'poi_3' && latitude && longitude) {
        const feature = new Feature({ geometry: new Point(fromLonLat([longitude, latitude])) })
        feature.setStyle(getStyle('alarm'))
        feature.setProperties({ alarm: 'alarm', ...attrs })
        features.push(feature)
      }
    })
    layer.getSource()?.addFeatures(features)
    layer.setVisible(true)
    const extent: Extent | null | undefined = layer.getSource()?.getExtent()
    if (!extent || extent.length < 4 || !extent.every(Number.isFinite)) return
    const map = (this.genericController as unknown as { map?: OlMap }).map
    const view = map?.getView()
    if (view) this.fitToExtent(view, extent, state)
    await new Promise<void>((resolve) => {
      state.resolveDelay = resolve
      state.delay = setTimeout(() => {
        state.delay = undefined
        state.resolveDelay = undefined
        resolve()
      }, 1500)
    })
    if (!isCurrent()) return
    let isShow = false
    state.interval = setInterval(() => {
      if (!isCurrent()) {
        this.cancelTimers(state)
        return
      }
      isShow = !isShow
      features.forEach((feature) => feature.setStyle(createFlashStyleFunction(feature, isShow)))
    }, 500)
    state.flashEnd = setTimeout(() => {
      this.cancelTimers(state)
      if (!isCurrent()) return
      features.forEach((feature) => feature.setStyle(createFlashStyleFunction(feature, false)))
    }, 3000)
  }

  public addressRobotClear(options: { businessId?: string } = {}): void {
    if (this.disposed) return
    const businessId = options.businessId ?? 'address_robot_default'
    const state = this.searches.get(businessId)
    if (state) {
      state.generation += 1
      this.cancelTimers(state)
      if (state.layer.get('addressRobotRendererOwner') === this.owner) {
        state.layer.getSource()?.clear()
        state.layer.setVisible(false)
      }
    }
    this.genericController.geometry.clearByBusinessId(businessId)
  }

  public dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.searches.forEach((state, businessId) => {
      state.generation += 1
      this.cancelTimers(state)
      if (state.layer.get('addressRobotRendererOwner') !== this.owner) return
      state.layer.getSource()?.clear()
      state.layer.setVisible(false)
      if (this.genericController.getVectorLayer(businessId) === state.layer) {
        this.genericController.removeLayer(state.layer)
      }
    })
    this.searches.clear()
  }

  private cancelTimers(state: SearchRenderState): void {
    state.cancelFit?.()
    if (state.delay !== undefined) clearTimeout(state.delay)
    if (state.interval !== undefined) clearInterval(state.interval)
    if (state.flashEnd !== undefined) clearTimeout(state.flashEnd)
    state.delay = undefined
    state.interval = undefined
    state.flashEnd = undefined
    state.resolveDelay?.()
    state.resolveDelay = undefined
  }

  private fitToExtent(view: View, extent: Extent, state: SearchRenderState): void {
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
    const fitOptions = {
      duration: 1200,
      padding: [80, 80, 80, 80],
      minZoom: 10,
      maxZoom: 20,
      callback: release,
    }
    try {
      view.fit(extent, fitOptions)
    } catch (error) {
      cancel()
      throw error
    } finally {
      starting = false
    }
  }

  public getSearchStyleFunction = createSearchStyleFunction
}
