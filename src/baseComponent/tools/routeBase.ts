// 路线上图公共底座：投影收口 + 建线 + 方向箭头 + 路况 + 候选置底。
// 地图专属（OL 类型入参）工具，供调派/跟踪/查询/历史轨迹共用，消除各消费方自写的重复路线上图逻辑。
import Feature, { type FeatureLike } from 'ol/Feature'
import { LineString, MultiLineString, Point } from 'ol/geom'
import VectorLayer from 'ol/layer/Vector'
import type VectorSource from 'ol/source/Vector'
import { fromLonLat } from 'ol/proj'
import type { Style } from 'ol/style'
import { asArray } from 'ol/color'

import type { LngLat } from '@/utils/coordTransform'
import { createRouteDirectionArrowStyle } from '@/baseComponent/OpenlayersMap/style'

/** 中性路况线段：amap 的 AmapTmcSegment 可兼容传入（status 为 string 子集）。 */
export interface RouteTmcSegment {
  status: string
  polyline: LngLat[]
}

// 方向箭头分级间距常量（像素），原 amap/useAmapTools 下沉至此作为全局标准。
const ROUTE_ARROW_SPACING_PIXELS = 40
const ROUTE_ARROW_MERGE_TOLERANCE_PIXELS = 8

/** WGS84 [lng,lat] 序列投影到地图坐标 [x,y]；业务层统一 WGS84，防二次纠偏。 */
export const projectCoords = (coords: LngLat[]): number[][] => coords.map((p) => fromLonLat(p))

/** 建线 Feature：投影后生成 LineString，可选设样式与业务属性。 */
export const createRouteLineFeature = (
  coords: LngLat[],
  props: Record<string, unknown> = {},
  style?: Style | Style[],
): Feature<LineString> => {
  const feature = new Feature({ geometry: new LineString(projectCoords(coords)), ...props }) as Feature<LineString>
  if (style) feature.setStyle(style)
  return feature
}

/** 把已投影坐标（[x,y][]）生成 LineString Feature；用于消费方已持有投影坐标的场景。 */
export const createLineFeature = (
  projected: number[][],
  props: Record<string, unknown> = {},
  style?: Style | Style[],
): Feature<LineString> => {
  const feature = new Feature({ geometry: new LineString(projected), ...props }) as Feature<LineString>
  if (style) feature.setStyle(style)
  return feature
}

/** 分辨率量化到最近 2^n：缩放中箭头按级增减、同级不重算，锚点不滑动。 */
export const getRouteArrowResolution = (resolution: number) => 2 ** Math.round(Math.log2(resolution))

/**
 * 沿多条完整路线生成全局等距方向箭头。
 * 所有路线共用同一间距并从终点反向对齐，合流道路上的箭头按位置去重，
 * 既保证分支上的方向提示，也避免终点附近因多条路线叠加而变密。
 * 入参为已投影坐标（[x,y][]）。
 */
export const createRouteArrowFeatures = (routeCoordinates: number[][][], resolution = 1): Feature<Point>[] => {
  if (!Number.isFinite(resolution) || resolution <= 0) return []
  type ArrowSegment = {
    from: number[]
    to: number[]
    length: number
    startDistance: number
  }
  const routes = routeCoordinates
    .map((coordinates) => {
      const segments: ArrowSegment[] = []
      let totalLength = 0
      for (let index = 1; index < coordinates.length; index += 1) {
        const from = coordinates[index - 1]
        const to = coordinates[index]
        const length = Math.hypot(to[0] - from[0], to[1] - from[1])
        if (length <= 0) continue
        segments.push({ from, to, length, startDistance: totalLength })
        totalLength += length
      }
      return { segments, totalLength }
    })
    .filter((route) => route.segments.length && route.totalLength > 0)
  if (!routes.length) return []

  // 分级调整密度，避免缩放的每一帧都沿路线移动箭头。
  // 相邻级别间距为两倍，已有锚点保留，只在中间增补或移除箭头。
  const arrowResolution = getRouteArrowResolution(resolution)
  const spacing = ROUTE_ARROW_SPACING_PIXELS * arrowResolution
  const mergeTolerance = ROUTE_ARROW_MERGE_TOLERANCE_PIXELS * arrowResolution
  const arrows: Feature<Point>[] = []
  const acceptedPoints: number[][] = []

  routes.forEach(({ segments, totalLength }) => {
    // 从终点向起点取样，使共享同一终点的路线在合流段天然对齐；
    // 使用距终点的整倍间距作为固定锚点，末端留一个间距。
    for (let distance = totalLength - spacing; distance >= 0; distance -= spacing) {
      const segment =
        segments.find((candidate) => distance <= candidate.startDistance + candidate.length) ??
        segments[segments.length - 1]
      const ratio = Math.min(1, Math.max(0, (distance - segment.startDistance) / segment.length))
      const point = [
        segment.from[0] + (segment.to[0] - segment.from[0]) * ratio,
        segment.from[1] + (segment.to[1] - segment.from[1]) * ratio,
      ]
      if (
        acceptedPoints.some((accepted) => Math.hypot(accepted[0] - point[0], accepted[1] - point[1]) <= mergeTolerance)
      )
        continue

      // 路线角度以朝上为基准；样式函数负责适配箭头素材的默认朝向。
      const rotation = -Math.atan2(segment.to[1] - segment.from[1], segment.to[0] - segment.from[0]) + Math.PI / 2
      const feature = new Feature({ geometry: new Point(point) }) as Feature<Point>
      feature.set('routeDirectionArrow', true)
      feature.setStyle(createRouteDirectionArrowStyle(rotation))
      arrows.push(feature)
      acceptedPoints.push(point)
    }
  })
  return arrows
}

/**
 * 缩放分级箭头 Overlay：单 Feature（MultiLineString）+ 带 resolution 的样式函数。
 *
 * OL 原生机制：setStyle 的函数签名在每次视图渲染时收到当前 resolution，
 * 量化到 2^n 级别后缓存，级别不变则复用 → 箭头锚点不滑动，只在跳变时增减。
 * 消费方在图层开启 updateWhileInteracting / updateWhileAnimating 后
 * 缩放动画中也能实时生效。
 *
 * 入参为已投影坐标（[x,y][]）。
 */
export const createRouteDirectionOverlay = (routeCoordinates: number[][][]): Feature<MultiLineString> => {
  const overlay = new Feature({ geometry: new MultiLineString(routeCoordinates) }) as Feature<MultiLineString>
  overlay.set('routeDirectionArrow', true)
  let cachedResolution: number | undefined
  let cachedStyles: Style[] = []
  overlay.setStyle((_feature, resolution) => {
    if (!Number.isFinite(resolution) || resolution <= 0) return []
    const arrowResolution = getRouteArrowResolution(resolution)
    if (arrowResolution !== cachedResolution) {
      cachedResolution = arrowResolution
      cachedStyles = createRouteArrowFeatures(routeCoordinates, arrowResolution).map((arrow) => {
        const style = arrow.getStyle() as Style
        style.setGeometry(arrow.getGeometry()!)
        return style
      })
    }
    return cachedStyles
  })
  return overlay
}

/** 路况分段 Feature（中性 status）：amap 的 buildTmcFeatures 下沉版，兼容传入 AmapTmcSegment。 */
export const createRouteTmcFeatures = (tmcs: RouteTmcSegment[]): Feature<LineString>[] => {
  return tmcs
    .map((t) => {
      const coords = projectCoords(t.polyline)
      if (coords.length < 2) return null
      const f = new Feature({ geometry: new LineString(coords) })
      f.set('tmcStatus', t.status)
      return f
    })
    .filter(Boolean) as Feature<LineString>[]
}

/**
 * 候选路线样式：克隆原样式后描边透明度降 70% 并置底，与选中方案区分。
 * 从 DispatchT1 提取，行为保持一致。支持单 Style 或 Style[]。
 */
export const dimRouteStyle = (style: Style | Style[]): Style | Style[] => {
  const styles = (Array.isArray(style) ? style : [style]).map((item) => {
    const copy = item.clone()
    const stroke = copy.getStroke()
    const color = stroke?.getColor()
    if (stroke && color) {
      const rgba = asArray(color as string | number[]).slice()
      rgba[3] = (rgba[3] ?? 1) * 0.7
      stroke.setColor(rgba)
    }
    copy.setZIndex((copy.getZIndex() ?? 0) - 10)
    return copy
  })
  return Array.isArray(style) ? styles : (styles[0] ?? ({} as Style))
}

/** 按谓词批量移除 source 中的路线 Feature（调派按 stationId、轨迹按 trackRank 等）。 */
export const removeRouteFeatures = (source: VectorSource, predicate: (feature: Feature) => boolean) => {
  source
    .getFeatures()
    .filter(predicate)
    .forEach((feature) => source.removeFeature(feature))
}

/**
 * 路线 / 方向箭头 overlay 专用图层工厂。
 *
 * 收口「带 resolution 样式函数」的隐性契约：overlay 机制（createRouteDirectionOverlay）
 * 依赖图层在交互 / 动画帧中持续渲染才会实时分级增减，故两个 flag 在此固定开启，
 * 消费方只传差异项（zIndex / className / style / renderOrder / properties），
 * 避免漏开 flag 导致箭头缩放不生效。
 */
export interface RouteOverlayLayerOptions {
  source: VectorSource
  zIndex?: number
  className?: string
  style?: (feature: FeatureLike, resolution: number) => Style | Style[]
  renderOrder?: (left: FeatureLike, right: FeatureLike) => number
  properties?: Record<string, unknown>
}

/**
 * 路线 / 方向箭头 overlay 专用图层工厂。
 *
 * 收口「带 resolution 样式函数」的隐性契约：overlay 机制（createRouteDirectionOverlay）
 * 依赖图层在交互 / 动画帧中持续渲染才会实时分级增减，故两个 flag 在此固定开启，
 * 消费方只传差异项（zIndex / className / style / renderOrder / properties），
 * 避免漏开 flag 导致箭头缩放不生效。
 */
export const createRouteOverlayLayer = (options: RouteOverlayLayerOptions): VectorLayer<VectorSource> => {
  return new VectorLayer({
    source: options.source,
    zIndex: options.zIndex,
    className: options.className,
    style: options.style,
    renderOrder: options.renderOrder,
    properties: options.properties,
    // overlay 契约：带 resolution 的样式函数须在交互 / 动画帧中生效
    updateWhileInteracting: true,
    updateWhileAnimating: true,
  })
}
