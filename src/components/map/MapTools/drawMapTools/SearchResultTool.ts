import { markRaw } from 'vue'
import ImageLayer from 'ol/layer/Image'
import ImageWMS from 'ol/source/ImageWMS'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Feature from 'ol/Feature'
import { LineString, Point } from 'ol/geom'
import { Style, Circle as StyleCircle, Stroke, Fill, Icon } from 'ol/style'
import { fromLonLat } from 'ol/proj'
import type Map from 'ol/Map'

import { geoserverApi } from '@/apis/geoserver'
import { LAYER_NAMES } from '@/baseComponent/OpenlayersMap/layers'
import { getSVGForSrcById } from '@/utils'

import { isOlMap } from '@/utils/mapTool'
import { cssVar, themeAccent, withAlpha } from '@/utils/themeColor'
import {
  createRouteDirectionOverlay,
  createRouteLineFeature,
  createRouteOverlayLayer,
  createRouteTmcFeatures,
  dimRouteStyle,
  projectCoords,
} from '@/baseComponent/tools/routeBase'
import { buildRouteAnalysis } from '@/baseComponent/tools/routeAnalysis'
import type { RouteAnalysisDTO, RoutePlanOption } from '@/types/routeAnalysis'
import type { LngLat } from '@/utils/coordTransform'
import type { ResourceFilterSet } from '@/types/search'
import startImg from '@/assets/icons-svg/map/start.svg'
import endImg from '@/assets/icons-svg/map/end.svg'
/** A congestion segment along the route, used for per-segment coloring */
export interface RouteCongestionSegment {
  /** WGS84 coordinates for this segment */
  coords: [number, number][]
  /** AMap traffic status: unknown / smooth / slow / congested / severe */
  status: string | number
}

/**
/** Path line color, aligned with the existing path planning tool (routePlan.vue) */
const ROUTE_LINE_COLOR = '#25C2F2'

/**
 * 高德路况等级 → 颜色。高德 tmcs.status 是数字编码：
 * 0=未知 1=畅通 2=缓行 3=拥堵 4=严重拥堵（部分版本用 5=极度拥堵）
 * 同时兼容返回中文/英文文案的情况。
 */
const congestionColor = (status: string | number): string => {
  const raw = String(status ?? '').trim()
  const key = raw.toUpperCase()
  // 优先按数字编码匹配
  switch (raw) {
    case '1':
      return '#3BA55D'
    case '2':
      return '#F2C744'
    case '3':
      return '#F08A24'
    case '4':
    case '5':
      return '#E64545'
    default:
      break
  }
  if (key.includes('严重') || key.includes('极度') || key.includes('SEVERE')) return '#E64545'
  if (key.includes('拥堵') || key.includes('CONGEST')) return '#F08A24'
  if (key.includes('缓行') || key.includes('SLOW')) return '#F2C744'
  if (key.includes('畅通') || key.includes('SMOOTH')) return '#3BA55D'
  return themeAccent(ROUTE_LINE_COLOR)
}
export interface SearchResultToolOptions {
  map: Map
  /** 聚焦时的目标 zoom（缺省按当前 zoom + 2） */
  focusZoom?: number
  focusPadding?: number[]
}

/**
 * 检索结果上图工具。
 *
 * 分工：
 * - 资源：走 WMS 服务端出图（与 CircleQueryTool 一致），前端不持有要素几何，
 *   因此不受 1 万条结果规模影响。
 * - 地址 POI / 列表点选：前端渲染少量要素（点 + 路径线），提供聚焦特效。
 */
export class SearchResultTool {
  private map: Map
  private options: Required<Pick<SearchResultToolOptions, 'focusZoom' | 'focusPadding'>>

  private wmsLayer!: ImageLayer<ImageWMS>
  private focusLayer!: VectorLayer<VectorSource>
  private routeLayer!: VectorLayer<VectorSource>
  private endpointLayer!: VectorLayer<VectorSource>
  private focusPulseTimer: ReturnType<typeof setInterval> | null = null
  private focusPulseFeature: Feature | null = null
  /** 最近一次上图路线的统一分析结果（P01）；无路况数据时 tmc 覆盖度为 0，忠实反映展示态 */
  private routeAnalysis: RouteAnalysisDTO | null = null

  constructor(options: SearchResultToolOptions) {
    // MapStore 的 map 初值是空对象 / null，必须校验后再建层
    if (!isOlMap(options.map)) {
      throw new TypeError('[SearchResultTool] options.map 不是有效的 OpenLayers Map 实例')
    }
    this.map = options.map
    this.options = {
      focusZoom: options.focusZoom ?? 17,
      focusPadding: options.focusPadding ?? [80, 80, 80, 80],
    }
    this.initLayers()
  }

  /** 供调用方比对是否为同一个地图实例（路由切换会重建） */
  getMap(): Map {
    return this.map
  }

  /** 最近一次上图路线的统一分析结果（P01）；未上图时返回 null */
  getRouteAnalysis(): RouteAnalysisDTO | null {
    return this.routeAnalysis
  }

  private initLayers() {
    this.focusLayer = markRaw(
      new VectorLayer({
        source: markRaw(new VectorSource()),
        className: LAYER_NAMES.SEARCH_FOCUS_LAYER,
        zIndex: 120,
      }),
    )
    this.routeLayer = markRaw(
      createRouteOverlayLayer({
        source: markRaw(new VectorSource()),
        className: LAYER_NAMES.SEARCH_ROUTE_LAYER,
        zIndex: 110,
      }),
    )

    this.endpointLayer = markRaw(
      new VectorLayer({
        source: markRaw(new VectorSource()),
        className: LAYER_NAMES.SEARCH_ROUTE_ENDPOINT_LAYER,
        zIndex: 130,
      }),
    )

    this.map.addLayer(this.routeLayer)
    this.map.addLayer(this.endpointLayer)
    this.map.addLayer(this.focusLayer)
  }

  /** WMS 资源出图：LAYERS 逗号拼接，CQL_FILTER 分号分隔且顺序一一对应 */
  showResources(filter: ResourceFilterSet) {
    const { typeNames, filters } = filter
    if (!typeNames.length) {
      this.clearResources()
      return
    }

    const params = {
      LAYERS: typeNames.join(','),
      VERSION: '1.1.0',
      FORMAT: 'image/png',
      TRANSPARENT: true,
      CQL_FILTER: filters.join(';'),
    }

    if (!this.wmsLayer) {
      this.wmsLayer = markRaw(
        new ImageLayer({
          source: markRaw(
            new ImageWMS({
              url: geoserverApi.getWMSServiceUrl('gis'),
              params,
              serverType: 'geoserver',
              crossOrigin: 'anonymous',
              ratio: 1.5,
            }),
          ),
          className: LAYER_NAMES.ES_WMS_LAYER,
          zIndex: 100,
        }),
      ) as ImageLayer<ImageWMS>
      this.map.addLayer(this.wmsLayer)
      return
    }

    // 已存在则只更新参数，避免重建图层造成闪烁
    this.wmsLayer.getSource()?.updateParams(params)
  }

  /** 无检索结果时显式返回空图，而不是保留上一次的过滤结果 */
  clearResources() {
    if (!this.wmsLayer) return
    this.wmsLayer.getSource()?.updateParams({ CQL_FILTER: '1=0' })
  }

  /**
   * 地址 POI 结果上图：高德坐标已是 WGS84，直接投影后渲染。
   * 条数受高德单页限制（≤20），前端渲染无压力。
   */
  showAddressPoints(lngLats: [number, number][]) {
    const source = this.focusLayer.getSource()
    source?.clear()
    this.stopPulse()

    lngLats.forEach((lngLat, index) => {
      if (!lngLat) return
      const feature = new Feature({
        id: `search-address-${index}`,
        geometry: new Point(fromLonLat(lngLat)),
      })
      feature.setStyle(
        new Style({
          image: new Icon({
            src: getSVGForSrcById({ symbolId: 'icon-poi-1', color: themeAccent() }),
            anchor: [0.5, 1],
            scale: 1,
          }),
        }),
      )
      source?.addFeature(feature)
    })

    if (lngLats.length) this.fitTo(lngLats)
  }

  /** 列表点选定位：单点聚焦 + 脉冲特效 */
  focusPoint(lngLat: [number, number] | null) {
    const source = this.focusLayer.getSource()
    source?.clear()
    this.stopPulse()
    if (!lngLat) return

    // 地址标点固定显示，聚焦圈单独作为脉冲图层元素，避免脉冲重绘覆盖标点图标
    const marker = new Feature({ geometry: new Point(fromLonLat(lngLat)) })
    marker.setStyle(
      new Style({
        image: new Icon({
          src: getSVGForSrcById({ symbolId: 'icon-poi-1', color: themeAccent() }),
          anchor: [0.5, 1],
          scale: 1,
        }),
        zIndex: 3,
      }),
    )
    source?.addFeature(marker)

    const focusFeature = new Feature({ geometry: new Point(fromLonLat(lngLat)) })
    focusFeature.setStyle(this.createFocusStyle(10, 0.45))
    source?.addFeature(focusFeature)

    this.startPulse(focusFeature)
    this.fitTo([lngLat])
  }

  private createFocusStyle(radius: number, opacity: number) {
    return new Style({
      zIndex: 2,
      image: new StyleCircle({
        radius,
        stroke: new Stroke({ color: cssVar('--text-primary', '#ffffff'), width: 3 }),
        fill: new Fill({ color: withAlpha(themeAccent(), opacity) }),
      }),
    })
  }

  /**
   * 聚焦特效：脉冲动画只播放 1 秒，随后固定为一个淡半透明聚焦圈。
   *
   * 旧实现监听 postrender 并在每帧 setStyle，会触发该图层再次渲染，
   * 形成「渲染→样式变更→重渲染」反馈循环，导致地图上的所有覆盖物跟着闪烁。
   * 现改为定时器驱动：动画结束后不再回调 setStyle，只保留固定样式的聚焦圈。
   */
  private startPulse(feature: Feature) {
    this.stopPulse()
    this.focusPulseFeature = feature

    const startedAt = performance.now()
    const duration = 1000

    this.focusPulseTimer = setInterval(() => {
      const elapsed = performance.now() - startedAt
      if (elapsed >= duration || !this.focusLayer) {
        // 动画结束：先落定固定样式，再停表；stopPulse 会清空 focusPulseFeature
        if (this.focusPulseFeature && this.focusLayer) {
          feature.setStyle(this.createFocusStyle(12, 0.28))
          this.focusLayer.changed()
        }
        this.stopPulse()
        return
      }

      // 1 秒内做 2 个完整脉冲：半径 8→28 往复，透明度同步起伏
      const progress = elapsed / duration
      const phase = (progress * 2) % 1
      const wave = Math.sin(phase * Math.PI)
      feature.setStyle(this.createFocusStyle(8 + wave * 20, 0.45 + wave * 0.35))
      this.focusLayer.changed()
    }, 1000 / 30)
  }

  private stopPulse() {
    if (this.focusPulseTimer) {
      clearInterval(this.focusPulseTimer)
      this.focusPulseTimer = null
    }
    this.focusPulseFeature = null
  }

  /**
   * 路径线。segments 用于按拥堵等级分段着色；缺省时整条线用主题强调色。
   */
  showRoute(coords: [number, number][], segments?: RouteCongestionSegment[]) {
    const source = this.routeLayer.getSource()
    source?.clear()
    if (!coords || coords.length < 2) return

    // P01：统一产出 RouteAnalysisDTO（路径 + 路况分段），供上层只读分析，不改变下图绘制行为
    this.routeAnalysis = buildRouteAnalysis({
      path: coords as LngLat[],
      tmcs: segments?.map((segment) => ({ status: segment.status, polyline: segment.coords as LngLat[] })),
    })

    if (!segments || segments.length < 1) {
      const feature = createRouteLineFeature(coords as LngLat[])
      feature.setStyle(this.routeLineStyle())
      source?.addFeature(feature)
      this.drawRouteArrows(coords)
      return
    }

    // 按拥堵等级分段：每段独立 Feature + 独立颜色，段边界轻微重叠避免缝隙
    segments.forEach((segment) => {
      if (!segment.coords || segment.coords.length < 2) return
      const feature = createRouteLineFeature(segment.coords as LngLat[])
      feature.setStyle(
        new Style({
          stroke: new Stroke({ color: congestionColor(segment.status), width: 7 }),
          zIndex: 1,
        }),
      )
      source?.addFeature(feature)
    })
    this.drawRouteArrows(coords)
  }

  /**
   * 在路径线上绘制方向箭头，指示起点→终点行进方向
   * 箭头尺寸与线宽对齐（5px），密度按路线长度自适应
   */
  private drawRouteArrows(coords: [number, number][]) {
    const source = this.routeLayer.getSource()
    if (!source || coords.length < 2) return
    // 统一走路线底座的缩放分级箭头 overlay（resolution 样式函数），与 dispatch1 共用；
    // 缩放时按 2^n 级别增减箭头，锚点不滑动，交互/动画中实时生效
    source.addFeature(createRouteDirectionOverlay([projectCoords(coords as LngLat[])]))
  }

  /**
   * 多方案上图。
   * 选中方案用原色 + 完整路况分段；备选方案半透明置底，避免与选中路线等权重叠。
   * 每个方案的方向箭头独立生成，属性带 routePlanIndex 便于后续按方案裁剪。
   */
  showRouteOptions(options: RoutePlanOption[], selectedIndex: number) {
    const source = this.routeLayer.getSource()
    source?.clear()
    if (!options.length) return

    const selected = options[selectedIndex] ?? options[0]
    this.routeAnalysis = buildRouteAnalysis({
      path: selected.coords as LngLat[],
      tmcs: selected.tmcs,
      distanceMeters: selected.distanceMeters,
      durationSeconds: selected.durationSeconds,
      candidateRank: selected.index,
    })

    options.forEach((option) => {
      const alternative = option.index !== selected.index
      const tmcFeatures = createRouteTmcFeatures(
        option.tmcs.map((tmc) => ({ status: String(tmc.status), polyline: tmc.polyline as LngLat[] })),
      )
      if (tmcFeatures.length) {
        tmcFeatures.forEach((feature, index) => {
          feature.setId(`search_route_option_${option.index}_${index}`)
          feature.set('routePlanIndex', option.index)
          feature.set('routeAlternative', alternative)
          const style = new Style({
            stroke: new Stroke({ color: congestionColor(option.tmcs[index]?.status ?? ''), width: 7 }),
            zIndex: 1,
          })
          feature.setStyle(alternative ? dimRouteStyle(style) : style)
        })
        tmcFeatures.forEach((feature) => source?.addFeature(feature))
      } else {
        const feature = createRouteLineFeature(option.coords as LngLat[])
        feature.setId(`search_route_option_${option.index}_0`)
        feature.set('routePlanIndex', option.index)
        feature.set('routeAlternative', alternative)
        const style = new Style({
          stroke: new Stroke({ color: themeAccent(ROUTE_LINE_COLOR), width: 7 }),
          zIndex: 1,
        })
        feature.setStyle(alternative ? dimRouteStyle(style) : style)
        source?.addFeature(feature)
      }

      const overlay = createRouteDirectionOverlay([projectCoords(option.coords as LngLat[])])
      overlay.set('routePlanIndex', option.index)
      overlay.set('routeAlternative', alternative)
      source?.addFeature(overlay)
    })
  }
  /** Path line style: consistent with the existing route planning tool (routePlan.vue) */
  private routeLineStyle() {
    return new Style({
      stroke: new Stroke({ color: themeAccent(ROUTE_LINE_COLOR), width: 7 }),
      zIndex: 1,
    })
  }

  /**
   * Start/end markers use the existing path-planning assets (start.svg / end.svg), with the same visual language.
   * Independent layer from the path line; drawing a route does not clear the markers.
   */
  showRouteEndpoints(start: [number, number] | null, end: [number, number] | null) {
    const source = this.endpointLayer.getSource()
    if (!source) return
    source.clear()
    const mark = (lngLat: [number, number] | null, img: string) => {
      if (!lngLat) return
      const feature = new Feature({ geometry: new Point(fromLonLat(lngLat)) })
      feature.setStyle(
        new Style({
          image: new Icon({
            src: img,
            anchor: [0.5, 1],
            scale: 0.75,
          }),
          zIndex: 3,
        }),
      )
      source.addFeature(feature)
    }
    mark(start, startImg)
    mark(end, endImg)
  }

  /** Clear only the endpoint markers; the route line and focus effects are unaffected */
  clearRouteEndpoints() {
    this.endpointLayer?.getSource()?.clear()
  }
  /** Fit all points into the viewport without animation offset (used when selecting the end point) */
  fitPoints(lngLats: [number, number][]) {
    this.fitTo(lngLats)
  }

  /**
   * 定位到路线上的某一段（转向指引点击）。
   * 视野 fit 到该路段范围，并在其上叠加一条高亮描边，让用户看清当前选中的是哪一段；
   * 高亮画在 focusLayer，不影响路线图层自身的分色。
   */
  focusRouteSegment(coords: [number, number][]) {
    const valid = coords.filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    if (!valid.length) return
    if (valid.length === 1) {
      this.focusPoint(valid[0])
      return
    }

    const source = this.focusLayer.getSource()
    source?.clear()
    this.stopPulse()

    const feature = new Feature({
      geometry: new LineString(projectCoords(valid as LngLat[])),
    })
    feature.setStyle(
      new Style({
        stroke: new Stroke({ color: themeAccent(ROUTE_LINE_COLOR), width: 9 }),
        zIndex: 4,
      }),
    )
    source?.addFeature(feature)

    this.fitTo(valid)
  }

  private fitTo(lngLats: [number, number][]) {
    const valid = lngLats.filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    if (!valid.length) return
    const points = valid.map((lngLat) => fromLonLat(lngLat))
    const xs = points.map((p) => p[0])
    const ys = points.map((p) => p[1])
    const extent: [number, number, number, number] = [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ]
    this.map.getView().fit(extent, {
      padding: this.options.focusPadding as [number, number, number, number],
      duration: 400,
      maxZoom: this.options.focusZoom,
    })
  }

  clearFocus() {
    this.focusLayer?.getSource()?.clear()
    this.stopPulse()
  }

  clearRoute() {
    this.routeLayer?.getSource()?.clear()
    this.endpointLayer?.getSource()?.clear()
    this.routeAnalysis = null
  }

  clear() {
    this.clearFocus()
    this.clearRoute()
    this.clearResources()
  }

  /** 幂等销毁：允许重复调用，也允许在地图实例已被替换后调用 */
  destroy() {
    this.stopPulse()
    const detach = (layer?: { dispose?: () => void } | null) => {
      if (!layer) return
      if (isOlMap(this.map)) this.map.removeLayer(layer as never)
      layer.dispose?.()
    }
    this.wmsLayer?.getSource()?.dispose?.()
    detach(this.wmsLayer)
    detach(this.focusLayer)
    detach(this.routeLayer)
    detach(this.endpointLayer)
    this.wmsLayer = null as unknown as ImageLayer<ImageWMS>
    this.focusLayer = null as unknown as VectorLayer<VectorSource>
    this.routeLayer = null as unknown as VectorLayer<VectorSource>
    this.endpointLayer = null as unknown as VectorLayer<VectorSource>
  }
}
