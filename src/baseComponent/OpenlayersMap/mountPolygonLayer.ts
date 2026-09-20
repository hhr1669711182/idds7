/**
 * @Description: 通用面/区图层工厂（非响应式 composable，按 OpenLayers 约定命名 mount*）。
 * 挂载矢量面图层，支持全量 setData 与按 key 增量 upsert/remove，
 * 供警情定位辖区、队站辖区等 GeoJSON 面数据共用。
 * 入参几何统一为 EPSG:4326 的 GeoJSON.Geometry，工厂内部投影到地图视图坐标系；
 * 去重 key、几何提取、样式均由调用方注入，与具体业务解耦。
 * @FilePath: src/composables/mountPolygonLayer.ts
 */
import Map from 'ol/Map'
import Feature from 'ol/Feature'
import type Geometry from 'ol/geom/Geometry'
import GeoJSON from 'ol/format/GeoJSON'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import type { StyleLike } from 'ol/style'

/** 通用面图层管理器：支持全量 setData 与按 key 增量 upsert/remove */
export type PolygonLayerManager<T> = {
  setVisible: (visible: boolean) => void
  setData: (items: T[]) => void
  upsert: (item: T) => void
  remove: (key: string) => void
  isVisible: () => boolean
  destroy: () => void
  layer: VectorLayer
}

export type MountPolygonLayerOptions<T> = {
  map: Map
  items: T[]
  visible?: boolean
  className?: string
  zIndex?: number
  keyGetter: (item: T) => string
  /** 返回 EPSG:4326 的 GeoJSON 几何；返回 null/undefined 时跳过该要素 */
  geometryGetter: (item: T) => GeoJSON.Geometry | null | undefined
  styleGetter: (item: T) => StyleLike
}

/**
 * 通用面图层工厂：挂载矢量面图层，支持按 key 增量 upsert/remove。
 */
export const mountPolygonLayer = <T>(
  params: MountPolygonLayerOptions<T>,
): PolygonLayerManager<T> => {
  const {
    map,
    items,
    visible = false,
    className = 'POLYGON_LAYER',
    zIndex = 50,
    keyGetter,
    geometryGetter,
    styleGetter,
  } = params

  const source = new VectorSource<Feature<Geometry>>()
  const layer = new VectorLayer({ source, className, zIndex, visible })
  map.addLayer(layer)

  const format = new GeoJSON()
  const featureProjection = map.getView().getProjection()
  const featureByKey = new globalThis.Map<string, Feature<Geometry>>()

  const createFeature = (item: T): Feature<Geometry> | null => {
    const geometry = geometryGetter(item)
    if (!geometry) return null
    const feature = format.readFeature(
      { type: 'Feature', geometry, properties: {} },
      { dataProjection: 'EPSG:4326', featureProjection },
    ) as Feature<Geometry>
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
    map.removeLayer(layer)
  }

  return {
    layer,
    setVisible: (v: boolean) => layer.setVisible(v),
    setData,
    upsert,
    remove,
    isVisible: () => layer.getVisible(),
    destroy,
  }
}
