/**
 * @Description: 通用点位图层工厂（非响应式 composable，按 OpenLayers 约定命名 mount*）。
 * 挂载矢量图层 + 可选 popup overlay + 点击命中，支持全量 setData 与按 key
 * 增量 upsert/remove，供未结案警情、画像地址变更等共用。
 * 样式、去重 key、坐标提取均由调用方注入，与具体业务解耦。
 * @FilePath: src/composables/mountPointLayer.ts
 */
import Map from 'ol/Map'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { unByKey } from 'ol/Observable'
import type { EventsKey } from 'ol/events'
import * as olProj from 'ol/proj'
import Overlay from 'ol/Overlay'
import type { Style, StyleLike } from 'ol/style'

/** 通用点位图层管理器：支持全量 setData 与按 key 增量 upsert/remove */
export type PointLayerManager<T> = {
  hide: () => void
  setVisible: (visible: boolean) => void
  setData: (items: T[]) => void
  upsert: (item: T) => void
  remove: (key: string) => void
  isVisible: () => boolean
  destroy: () => void
  layer: VectorLayer
  overlay: Overlay | null
}

export type MountPointLayerOptions<T> = {
  map: Map
  items: T[]
  /** 不传则不创建 popup overlay、不绑定点击命中，仅渲染点位 */
  popupElement?: HTMLElement
  visible?: boolean
  onSelect?: (data: T) => void
  onClose?: () => void
  className?: string
  zIndex?: number
  keyGetter: (item: T) => string
  /** 返回 [lng, lat]；返回 null/undefined 或非有限数时跳过该点位 */
  coordinateGetter: (item: T) => [number, number] | null | undefined
  styleGetter: (item: T) => StyleLike
}

/**
 * 通用点位图层工厂：挂载矢量图层 + 可选 popup overlay + 点击命中，
 * 支持按 key 增量 upsert/remove。
 */
export const mountPointLayer = <T>(
  params: MountPointLayerOptions<T>,
): PointLayerManager<T> => {
  const {
    map,
    items,
    popupElement,
    visible = false,
    onSelect,
    onClose,
    className = 'POINT_LAYER',
    zIndex = 50,
    keyGetter,
    coordinateGetter,
    styleGetter,
  } = params

  const source = new VectorSource()
  const layer = new VectorLayer({ source, className, zIndex, visible })
  map.addLayer(layer)

  const featureByKey = new Map<string, Feature>()

  const createFeature = (item: T): Feature | null => {
    const coord = coordinateGetter(item)
    if (!coord) return null
    const [lng, lat] = coord
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
    const feature = new Feature({
      geometry: new Point(olProj.fromLonLat([lng, lat])),
    })
    feature.set('data', item)
    feature.setStyle(styleGetter(item))
    return feature
  }

  const addItem = (item: T) => {
    const feature = createFeature(item)
    if (!feature) return
    const key = keyGetter(item)
    const old = featureByKey.get(key)
    if (old) source.removeFeature(old)
    featureByKey.set(key, feature)
    source.addFeature(feature)
  }

  items.forEach(addItem)

  const overlay = popupElement
    ? new Overlay({
        element: popupElement,
        positioning: 'bottom-center',
        offset: [0, -28],
        stopEvent: true,
      })
    : null
  if (overlay) map.addOverlay(overlay)

  const close = () => {
    onClose?.()
    overlay?.setPosition(undefined)
  }

  const clickKey: EventsKey | null = popupElement
    ? map.on('singleclick', (evt) => {
        if (!layer.getVisible()) return
        let hit = false
        map.forEachFeatureAtPixel(
          evt.pixel,
          (feature, targetLayer) => {
            if (targetLayer !== layer) return false
            const data = (feature as any).get('data') as T | undefined
            const geometry = feature.getGeometry() as Point | undefined
            if (data === undefined || !geometry) return false
            onSelect?.(data)
            overlay?.setPosition(geometry.getCoordinates())
            hit = true
            return true
          },
          { hitTolerance: 6 },
        )
        if (!hit) close()
      })
    : null

  const setVisible = (v: boolean) => {
    layer.setVisible(v)
    if (!v) close()
  }

  const setData = (next: T[]) => {
    source.clear()
    featureByKey.clear()
    next.forEach(addItem)
  }

  const upsert = (item: T) => addItem(item)

  const remove = (key: string) => {
    const old = featureByKey.get(key)
    if (old) source.removeFeature(old)
    featureByKey.delete(key)
  }

  const destroy = () => {
    if (clickKey) unByKey(clickKey)
    if (overlay) map.removeOverlay(overlay)
    map.removeLayer(layer)
  }

  return {
    layer,
    overlay,
    hide: close,
    setVisible,
    setData,
    upsert,
    remove,
    isVisible: () => layer.getVisible(),
    destroy,
  }
}

/** 仅为类型复用，避免调用方重复 import ol/style */
export type PointLayerStyle = Style
