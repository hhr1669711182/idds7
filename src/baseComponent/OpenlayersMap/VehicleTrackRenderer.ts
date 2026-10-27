import Feature from 'ol/Feature'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import type Map from 'ol/Map'
import { Style, Stroke } from 'ol/style'
import {
  createRouteLineStyle,
  getStyle,
  MAP_ICON_SRC,
  VEHICLE_HISTORY_TRACK_COLOR,
} from './style'
import { MAP_LAYER_Z_INDEX } from './layerOrder'
import { createRouteArrowFeatures, projectCoords } from '@/baseComponent/tools/routeBase'
import type { CarTrackPoint } from '@/apis/carTrack'
import type { LngLat } from '@/utils/coordTransform'

export const VEHICLE_HISTORY_TRACK_LAYER_CLASS = 'VEHICLE_HISTORY_TRACK_LAYER'
export const VEHICLE_HISTORY_TRACK_LAYER_ZINDEX = MAP_LAYER_Z_INDEX.vehicle + 0.5

/** 已行驶段灰线，与实时轨迹的灰色 trail 视觉一致。 */
const TRAVELED_COLOR = 'rgba(136, 136, 136, 0.85)'
const TRAVELED_STYLE = new Style({
  // 高于全轨迹蓝线的 zIndex 1，低于方向箭头的 zIndex 20
  zIndex: 2,
  stroke: new Stroke({ color: TRAVELED_COLOR, width: 5 }),
})

/** 同一图层的绘制顺序：全轨迹线 → 已走灰线 → 方向箭头 → 车辆。 */
const TRACK_RANK_LINE = 0
const TRACK_RANK_TRAVELED = 1
const TRACK_RANK_ARROW = 2
const TRACK_RANK_VEHICLE = 3

/** 车辆朝向按渲染点相对上一确认点的方位角计算，并做 ±π 归一化避免翻转。 */
const normalizeRotation = (angle: number, reference: number): number => {
  let normalized = angle
  while (normalized - reference > Math.PI) normalized -= Math.PI * 2
  while (normalized - reference < -Math.PI) normalized += Math.PI * 2
  return normalized
}

export interface VehicleTrackRenderer {
  /** 全轨迹线 + 车辆 marker 上图，fit 时一次性定位到轨迹范围。 */
  render(points: CarTrackPoint[], cursor: number, options?: { fit?: boolean }): void
  /** 按浮点索引更新已行驶灰线与车辆位置。 */
  setCursor(cursor: number): void
  /** 隐藏图层并清空几何（面板关闭时调用，保留实例复用）。 */
  clear(): void
  /** 移除图层并释放引用（地图卸载时调用）。 */
  dispose(): void
}

/**
 * 车辆历史轨迹渲染器：复用车辆图标样式与路线描边样式，
 * 全轨迹为实线、已行驶段为灰线、车辆按游标位置插值移动。
 */
export const createVehicleTrackRenderer = (map: Map): VehicleTrackRenderer => {
  const source = new VectorSource()
  const layer = new VectorLayer({
    source,
    className: VEHICLE_HISTORY_TRACK_LAYER_CLASS,
    zIndex: VEHICLE_HISTORY_TRACK_LAYER_ZINDEX,
    renderOrder: (left, right) => Number(left.get('trackRank') ?? 0) - Number(right.get('trackRank') ?? 0),
  })
  map.addLayer(layer)

  const fullFeature = new Feature({ geometry: new LineString([]) })
  fullFeature.set('trackRank', TRACK_RANK_LINE)
  fullFeature.setStyle(createRouteLineStyle(VEHICLE_HISTORY_TRACK_COLOR, 5))
  const traveledFeature = new Feature({ geometry: new LineString([]) })
  traveledFeature.set('trackRank', TRACK_RANK_TRAVELED)
  traveledFeature.setStyle(TRAVELED_STYLE)
  const carFeature = new Feature({ geometry: new Point([0, 0]) })
  carFeature.set('trackRank', TRACK_RANK_VEHICLE)
  carFeature.setStyle(getStyle('vehicle', {
    src: MAP_ICON_SRC.car,
    rotation: 0,
    scale: 0.65,
    styleId: 'vehicle-history',
    zIndex: 100,
  }) as Style)
  source.addFeatures([fullFeature, traveledFeature, carFeature])

  let projected: number[][] = []
  let rotation = 0
  /** 上一次渲染坐标，朝向按「上一渲染位置 → 本次渲染位置」的位移计算（同警情上图链路） */
  let lastRenderedCoordinate: number[] | null = null
  let arrows: Feature<Point>[] = []

  /** 游标取整前后两点之间线性插值出车辆渲染坐标。 */
  const pointAt = (cursor: number): number[] => {
    if (!projected.length) return [0, 0]
    const index = Math.min(Math.max(cursor, 0), projected.length - 1)
    const lower = Math.floor(index)
    const upper = Math.min(lower + 1, projected.length - 1)
    const ratio = index - lower
    const from = projected[lower]
    const to = projected[upper]
    return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio]
  }

  /** 游标所在段的切向量（起点→终点）；停在末点时取最后一段，退化段返回 null。 */
  const segmentVectorAt = (lower: number): [number, number] | null => {
    if (projected.length < 2) return null
    const index = Math.min(Math.max(lower, 0), projected.length - 2)
    const from = projected[index]
    const to = projected[index + 1]
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    if (Math.abs(dx) <= 0.001 && Math.abs(dy) <= 0.001) return null
    return [dx, dy]
  }

  const removeArrows = () => {
    arrows.forEach((arrow) => source.removeFeature(arrow))
    arrows = []
  }

  /** 复用调派路线的方向箭头，按当前视图分辨率生成；缩放后随线等比变化。 */
  const buildArrows = () => {
    removeArrows()
    if (projected.length < 2) return
    const resolution = map.getView().getResolution() ?? 1
    const safeResolution = Number.isFinite(resolution) && resolution > 0 ? resolution : 1
    arrows = createRouteArrowFeatures([projected], safeResolution)
    arrows.forEach((arrow) => arrow.set('trackRank', TRACK_RANK_ARROW))
    source.addFeatures(arrows)
  }

  const setCursor = (cursor: number) => {
    if (!projected.length) return
    const clamped = Math.min(Math.max(cursor, 0), projected.length - 1)
    const lower = Math.floor(clamped)
    const coordinate = pointAt(clamped)

    // 已行驶段始终从轨迹起点连续绘制到当前渲染位置（与实时轨迹的 trail 一致），
    // 仅当游标停在起点时才为空，否则两点轨迹在第一段内也会画出灰线
    const traveled = clamped <= 0 ? [] : [...projected.slice(0, lower + 1), coordinate]
    ;(traveledFeature.getGeometry() as LineString).setCoordinates(traveled)

    const previous = lastRenderedCoordinate
    const tangent = segmentVectorAt(lower)
    let direction: [number, number] | null = null
    if (previous) {
      const dx = coordinate[0] - previous[0]
      const dy = coordinate[1] - previous[1]
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) direction = [dx, dy]
    }
    // 回拖滑块时位移反向：与当前段切线夹角大于 90° 时改用段切线，车头仍沿轨迹前进方向
    if (direction && tangent && direction[0] * tangent[0] + direction[1] * tangent[1] < 0) direction = tangent
    if (!direction && tangent) direction = tangent
    if (direction) rotation = normalizeRotation(-Math.atan2(direction[1], direction[0]) + Math.PI / 2, rotation)
    lastRenderedCoordinate = coordinate
    ;(carFeature.getGeometry() as Point).setCoordinates(coordinate)
    carFeature.setStyle(getStyle('vehicle', {
      src: MAP_ICON_SRC.car,
      rotation,
      scale: 0.65,
      styleId: 'vehicle-history',
      zIndex: 100,
    }) as Style)
  }

  const render = (points: CarTrackPoint[], cursor: number, options?: { fit?: boolean }) => {
    projected = projectCoords(points.map((point) => [point.longitude, point.latitude] as LngLat))
    ;(fullFeature.getGeometry() as LineString).setCoordinates(projected)
    rotation = 0
    lastRenderedCoordinate = null
    setCursor(cursor)
    buildArrows()
    layer.setVisible(true)
    if (options?.fit && projected.length) {
      const extent = source.getExtent()
      if (extent) {
        // 拟合结束后按最终缩放重建箭头，避免沿用打开面板前的旧分辨率
        map.getView().fit(extent, {
          padding: [80, 80, 180, 80],
          duration: 400,
          maxZoom: 17,
          callback: () => buildArrows(),
        })
      }
    }
  }

  const clear = () => {
    removeArrows()
    projected = []
    rotation = 0
    lastRenderedCoordinate = null
    ;(fullFeature.getGeometry() as LineString).setCoordinates([])
    ;(traveledFeature.getGeometry() as LineString).setCoordinates([])
    layer.setVisible(false)
  }

  const dispose = () => {
    clear()
    map.removeLayer(layer)
    source.clear()
  }

  return { render, setCursor, clear, dispose }
}
