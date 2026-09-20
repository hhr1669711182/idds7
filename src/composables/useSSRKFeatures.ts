﻿﻿﻿import { markRaw } from 'vue'
import type Map from 'ol/Map'
import Feature from 'ol/Feature'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Style, Fill, Stroke, Text } from 'ol/style'
import GeoJSON from 'ol/format/GeoJSON'
import { usePanelStore } from '@/store/usePanelStore'
import { TEMP_FRONTEND_LAYER_IDS } from '@/baseComponent/OpenlayersMap/layers'
import { geoserverApi } from '@/service/geoserver'
// import ssrkData from '@/data/ssrk.json'

export type SSRKItem = {
  zone_id: string
  zone_name: string
  met_population: number
  data_source?: string
  create_by?: string
  create_time?: string
  update_by?: string
  update_time?: string
  is_deleted?: boolean
  datafrom_by?: string
}

type SSRKFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: {
      type: 'MultiPolygon'
      coordinates: number[][][][]
    }
    properties: SSRKItem
  }>
}

const SSRK_LAYER_ZINDEX = 100

// 颜色渐变插值：蓝色 → 青色 → 绿色 → 黄色 → 红色 (0-1000)
const interpolateColor = (value: number, max: number = 1000): [number, number, number] => {
  const stops = [
    { pos: 0, color: [0, 0, 255] },      // 蓝色
    { pos: 0.25, color: [0, 255, 255] }, // 青色
    { pos: 0.5, color: [0, 128, 0] },   // 绿色
    { pos: 0.75, color: [255, 255, 0] }, // 黄色
    { pos: 1, color: [255, 0, 0] },      // 红色
  ]

  const ratio = Math.min(1, Math.max(0, value / max))

  let lower = stops[0]
  let upper = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (ratio >= stops[i].pos && ratio <= stops[i + 1].pos) {
      lower = stops[i]
      upper = stops[i + 1]
      break
    }
  }

  const range = upper.pos - lower.pos
  const localRatio = range === 0 ? 0 : (ratio - lower.pos) / range

  return [
    Math.round(lower.color[0] + (upper.color[0] - lower.color[0]) * localRatio),
    Math.round(lower.color[1] + (upper.color[1] - lower.color[1]) * localRatio),
    Math.round(lower.color[2] + (upper.color[2] - lower.color[2]) * localRatio),
  ]
}

// 根据人口数量获取填充颜色
const getColorByPopulation = (rksl: number): string => {
  const [r, g, b] = interpolateColor(rksl, 1000)
  return `rgba(${r}, ${g}, ${b}, 0.4)`
}

// 根据人口数量获取边框颜色
const getStrokeColorByPopulation = (met_population: number): string => {
  const [r, g, b] = interpolateColor(met_population, 1000)
  return `rgb(${r}, ${g}, ${b})`
}

// 创建区域样式
const createAreaStyle = (met_population: number, zone_name: string) => {
  return [
    new Style({
      fill: new Fill({
        color: getColorByPopulation(met_population),
      }),
      stroke: new Stroke({
        color: getStrokeColorByPopulation(met_population),
        width: 2,
      }),
      text: new Text({
        text: `${met_population}人` || '暂无数据',
        font: '16px Arial',
        fill: new Fill({
          color: '#374151',
        }),
        stroke: new Stroke({
          color: '#fff',
          width: 3,
        }),
      }),
    }),
    new Style({
      text: new Text({
        text: zone_name,
        font: '12px Arial',
        fill: new Fill({
          color: '#666666',
        }),
        stroke: new Stroke({
          color: '#fff',
          width: 1,
        }),
        offsetY: 18,
        textAlign: 'center',
      }),
    }),
  ]
}

const populateSSRKSource = (source: VectorSource, data: SSRKFeatureCollection) => {
  source.clear()
  const format = new GeoJSON({
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857',
  })

  data.features.forEach((featureData) => {
    const { properties } = featureData
    const { met_population, zone_name } = properties

    const feature = new Feature({
      geometry: format.readGeometry(featureData.geometry),
    })
    feature.set('data', properties)
    feature.setStyle(createAreaStyle(met_population, zone_name))
    source.addFeature(feature)
  })
}

const isValidExtent = (extent: number[]) =>
  extent.length === 4 && extent.every((value) => Number.isFinite(value))

export type MountSSRKFeaturesParams = {
  map: Map
  visible?: boolean
}

export type SSRKFeaturesManager = {
  layer: VectorLayer<VectorSource>
  setVisible: (visible: boolean) => void
  isVisible: () => boolean
  setData: (data: SSRKFeatureCollection) => void
  fetch: () => Promise<void>
  fitToExtent: () => void
  destroy: () => void
}

export const mountSSRKFeatures = (
  params: MountSSRKFeaturesParams,
): SSRKFeaturesManager => {
  const source = new VectorSource()
  const layer = markRaw(
    new VectorLayer({
      source,
      className: 'SSRK_LAYER',
      zIndex: SSRK_LAYER_ZINDEX,
      visible: params.visible ?? false,
      updateWhileAnimating: true,
      updateWhileInteracting: true,
    }),
  )
  layer.set('id', TEMP_FRONTEND_LAYER_IDS.SSRK);
  params.map.addLayer(layer)
  let destroyed = false
  let pending: Promise<void> | null = null
  const setData = (data: SSRKFeatureCollection) => {
    if (!destroyed) populateSSRKSource(source, data)
  }

  const fetch = (): Promise<void> => {
    if (destroyed) return Promise.resolve()
    if (pending) return pending
    pending = geoserverApi.getWFSFeatures({ typeName: 'gis:view_realtime_population', maxFeatures: 1000 })
      .then((data) => { setData(data) })
      .finally(() => { pending = null })
    return pending
  }

  const fitToExtent = () => {
    const extent: any = source.getExtent()
    if (!isValidExtent(extent)) return
    params.map.getView().fit(extent, {
      padding: [80, 80, 80, 80],
      duration: 600,
    })
  }

  const setVisible = (visible: boolean) => {
    visible && fetch()
    layer.setVisible(visible)
    usePanelStore().setSsrkPanelOpen(visible)
  }

  const destroy = () => {
    destroyed = true
    params.map.removeLayer(layer)
    source.clear(true)
    layer.dispose()
    source.dispose()
  }

  return {
    layer,
    setVisible,
    isVisible: () => layer.getVisible(),
    setData,
    fetch,
    fitToExtent,
    destroy,
  }
}