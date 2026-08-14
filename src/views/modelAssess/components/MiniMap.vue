<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, markRaw } from 'vue'
import OLMap from 'ol/Map'
import View from 'ol/View'
import * as olProj from 'ol/proj'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import { Style, Icon } from 'ol/style'
import { createBaseSourceSource } from '@/baseComponent/OpenlayersMap/baseSource'
import { useBaseSourceStore, useCommonStore } from '@/store'
import { THEME_COLOR } from '@/const/const.common'
import { storeToRefs } from 'pinia'

const props = withDefaults(defineProps<{
  mapId: string
  coordinates?: [number, number] // [lng, lat]
}>(), {
  coordinates: () => [113.9388, 22.5408] // 默认深圳市南山区软件园一期
})

let map: OLMap | null = null
let baseLayer: TileLayer | null = null
let markerLayer: VectorLayer<VectorSource> | null = null

const baseSourceStore = useBaseSourceStore()
const commonStore = useCommonStore()
const { themeColor } = storeToRefs(commonStore)

const syncBaseSourceLayer = () => {
  if (!baseLayer) return
  const source = createBaseSourceSource(baseSourceStore.activeId, {
    night: themeColor.value === THEME_COLOR.NIGHT,
  })
  baseLayer.setSource(source)
}

watch([() => baseSourceStore.activeId, () => themeColor.value], () => {
  syncBaseSourceLayer()
})

watch(() => props.coordinates, (newCoords) => {
  if (map && markerLayer) {
    const coords = olProj.fromLonLat(newCoords)
    map.getView().setCenter(coords)
    
    const source = markerLayer.getSource()
    source?.clear()
    const marker = new Feature({
      geometry: new Point(coords)
    })
    source?.addFeature(marker)
  }
}, { deep: true })

onMounted(() => {
  const center = olProj.fromLonLat(props.coordinates)

  baseLayer = new TileLayer({
    source: createBaseSourceSource(baseSourceStore.activeId, {
      night: themeColor.value === THEME_COLOR.NIGHT,
    }),
  })

  // 创建模拟的定位标记图层
  const markerFeature = new Feature({
    geometry: new Point(center)
  })
  
  markerLayer = new VectorLayer({
    source: new VectorSource({
      features: [markerFeature]
    }),
    style: new Style({
      image: new Icon({
        src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36"><path fill="%23ff4d4f" d="M12 0C5.373 0 0 5.373 0 12c0 8.5 12 24 12 24s12-15.5 12-24C24 5.373 18.627 0 12 0zm0 18c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z"/></svg>',
        anchor: [0.5, 1],
        anchorXUnits: 'fraction',
        anchorYUnits: 'fraction',
        scale: 1
      })
    })
  })

  map = markRaw(new OLMap({
    target: props.mapId,
    layers: [baseLayer, markerLayer],
    view: new View({
      center,
      zoom: 16,
      maxZoom: 20,
      minZoom: 3,
    }),
    controls: [], // 隐藏默认控件
    interactions: [] // 禁止交互
  }));
})

onUnmounted(() => {
  if (map) {
    map.setTarget(undefined)
    map = null
  }
})
</script>

<template>
  <div :id="mapId" class="mini-map-container"></div>
</template>

<style scoped>
.mini-map-container {
  width: 100%;
  height: 100%;
  background: #e6ebf5;
}
</style>