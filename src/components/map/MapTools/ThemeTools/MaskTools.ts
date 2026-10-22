/*
 * @Author: hhr
 * @Date: 2026-04-16 14:00:56
 * @LastEditTime: 2026-08-17 18:45:40
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\components\map\MapTools\ThemeTools\MaskTools.ts
 */
import Map from 'ol/Map'
import type Feature from 'ol/Feature'
import { GeoJSON } from 'ol/format'
import TileLayer from 'ol/layer/Tile'
import type MultiPolygon from 'ol/geom/MultiPolygon'
import Mask from 'ol-ext/filter/Mask'
import Crop from 'ol-ext/filter/Crop'
import { Fill } from 'ol/style'
import { LAYER_NAMES } from '../../../../baseComponent/OpenlayersMap/layers'
import geojson from '@/assets/map/geo/hongshang.json'

/**
 * 带 ol-ext 滤镜方法的瓦片图层。
 *
 * ol-ext 没有随包提供类型声明，`addFilter` / `removeFilter` 是它在运行时
 * 挂到 ol 图层原型上的扩展方法，OL 官方类型里查不到，故在此显式补上。
 */
type FilterableTileLayer = TileLayer & {
  addFilter: (filter: unknown) => void
  removeFilter: (filter: unknown) => void
}

export class MaskTools {
  map: Map
  mask: any
  crop: any
  layer: FilterableTileLayer
  constructor({ map }: { map: Map }) {
    this.map = map
    // addFilter / removeFilter 是 ol-ext 为瓦片图层扩展的方法，普通 BaseLayer 没有
    const layer = map
      .getLayers()
      .getArray()
      .find((i) => i.getClassName() == LAYER_NAMES.AMAP_LAYER) as FilterableTileLayer | undefined

    if (!layer) {
      throw new Error(`[MaskTools] 未找到底图图层 ${LAYER_NAMES.AMAP_LAYER}，无法挂载蒙版`)
    }
    this.layer = layer

    this.initMaskMAp()
  }
  initMaskMAp() {
    // readFeature 的返回类型是 Feature | Feature[]，此处数据确定是单个多边形
    var f = new GeoJSON().readFeature(geojson.features[0]) as Feature<MultiPolygon>
    // 蒙版数据是 MultiPolygon，getCoordinates 返回 [多边形][环][坐标点] 三层
    const polygon = f.getGeometry() as MultiPolygon
    const transformedCoords = polygon.getCoordinates().map((polygonCoords: number[][][]) =>
      polygonCoords.map((ring: number[][]) =>
        ring.map((coord: number[]) => {
          var longitude = coord[0],
            latitude = coord[1]
          var xValue = (longitude * 20037508.34) / 180
          var y = Math.log(Math.tan(((90 + latitude) * Math.PI) / 360)) / (Math.PI / 180)
          var yValue = (y * 20037508.34) / 180
          return [xValue, yValue]
        }),
      ),
    )

    // 更新 Feature 的坐标
    polygon.setCoordinates(transformedCoords)

    this.mask = new Mask({
      feature: f,
      wrapX: true,
      inner: false,
      fill: new Fill({ color: [255, 255, 255, 0.1] }),
    })
    this.crop = new Crop({
      feature: f,
      wrapX: true,
      inner: false,
    })

    this.layer.addFilter(this.mask)
    this.layer.addFilter(this.crop)
    this.map.getView().setZoom(11)
  }
  remove() {
    this.layer.removeFilter(this.mask)
    this.layer.removeFilter(this.crop)
    this.map.getView().setZoom(5)
  }
}
