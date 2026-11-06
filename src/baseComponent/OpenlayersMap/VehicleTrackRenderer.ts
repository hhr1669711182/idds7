import Feature from 'ol/Feature'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import VectorSource from 'ol/source/Vector'
import OlMap from 'ol/Map'
import { Style, Stroke } from 'ol/style'
import { createRouteLineStyle, getStyle, MAP_ICON_SRC } from './style'
import { MAP_LAYER_Z_INDEX } from './layerOrder'
import { createRouteDirectionOverlay, createRouteOverlayLayer, projectCoords } from '@/baseComponent/tools/routeBase'
import type { CarTrackPoint } from '@/apis/carTrack'
import type { VehicleTrackEntry } from '@/store/useVehicleTrackStore'
import type { LngLat } from '@/utils/coordTransform'

export const VEHICLE_HISTORY_TRACK_LAYER_CLASS = 'VEHICLE_HISTORY_TRACK_LAYER'
export const VEHICLE_HISTORY_TRACK_LAYER_ZINDEX = MAP_LAYER_Z_INDEX.vehicle + 0.5

/** 已行驶段灰线，与实时轨迹的灰色 trail 视觉一致。 */
const TRAVELED_COLOR = 'rgba(136, 136, 136, 0.85)'
const TRAVELED_STYLE = new Style({
  // 高于全轨迹线的 zIndex 1，低于方向箭头的 zIndex 20
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

/** 单辆车的渲染组：一组 full/traveled/car/arrows feature，共用同一个 VectorSource。 */
type RenderGroup = {
  trackId: string
  routeKey: string
  vehicleId: string
  routeColor: string
  fullFeature: Feature<LineString>
  traveledFeature: Feature<LineString>
  carFeature: Feature<Point>
  arrows: Feature | null
  projected: number[][]
  rotation: number
  lastRenderedCoordinate: number[] | null
}

export interface VehicleTrackRenderer {
  /** 多组并行渲染：按 trackId 管理多辆车的轨迹。 */
  renderMulti(entries: VehicleTrackEntry[], options?: { fit?: boolean }): void
  /** 所有组同步推进到浮点索引 cursor（面板主游标驱动）。 */
  setCursorAll(cursor: number): void
  /** 隐藏图层并清空几何（面板关闭时调用，保留实例与 groups Map 复用）。 */
  clear(): void
  /** 移除图层并释放引用（地图卸载时调用）。 */
  dispose(): void
  /**
   * 单车渲染（向后兼容）。
   * 内部委托 renderMulti 生成单车单路线，外部旧调用不受影响。
   */
  render(points: CarTrackPoint[], cursor: number, options?: { fit?: boolean }): void
  /**
   * 单车单组游标更新（向后兼容）。
   * 内部等价于 setCursorAll，单车场景下效果一致。
   */
  setCursor(cursor: number): void
}

/**
 * 车辆历史轨迹渲染器（多组并行版）。
 * 按 trackId 管理多辆车的轨迹，共用同一个 VectorSource + Layer，
 * 颜色按 routeColor（同色系派生）区分，已行驶段统一灰色。
 * 面板主游标 setCursorAll 同步推进所有车辆 marker 与已行驶段。
 */
export const createVehicleTrackRenderer = (map: OlMap): VehicleTrackRenderer => {
  const source = new VectorSource()
  const layer = createRouteOverlayLayer({
    source,
    className: VEHICLE_HISTORY_TRACK_LAYER_CLASS,
    zIndex: VEHICLE_HISTORY_TRACK_LAYER_ZINDEX,
    renderOrder: (left, right) => Number(left.get('trackRank') ?? 0) - Number(right.get('trackRank') ?? 0),
  })
  map.addLayer(layer)

  /** trackId → RenderGroup，管理多辆车的渲染状态 */
  const groups = new Map<string, RenderGroup>()

  /** 懒创建单辆车的一组渲染 features */
  const createGroup = (entry: VehicleTrackEntry): RenderGroup => {
    const fullFeature = new Feature({ geometry: new LineString([]) })
    fullFeature.set('trackRank', TRACK_RANK_LINE)
    fullFeature.setStyle(createRouteLineStyle(entry.routeColor, 5))

    const traveledFeature = new Feature({ geometry: new LineString([]) })
    traveledFeature.set('trackRank', TRACK_RANK_TRAVELED)
    traveledFeature.setStyle(TRAVELED_STYLE)

    const carFeature = new Feature({ geometry: new Point([0, 0]) })
    carFeature.set('trackRank', TRACK_RANK_VEHICLE)
    carFeature.setStyle(
      getStyle('vehicle', {
        src: MAP_ICON_SRC.car,
        rotation: 0,
        scale: 0.65,
        styleId: `history-${entry.routeKey}-${entry.vehicleId}`,
        zIndex: 100,
      }) as Style,
    )

    source.addFeatures([fullFeature, traveledFeature, carFeature])

    return {
      trackId: entry.trackId,
      routeKey: entry.routeKey,
      vehicleId: entry.vehicleId,
      routeColor: entry.routeColor,
      fullFeature,
      traveledFeature,
      carFeature,
      arrows: null,
      projected: [],
      rotation: 0,
      lastRenderedCoordinate: null,
    }
  }

  /** 移除单组的 arrows overlay */
  const removeArrows = (group: RenderGroup) => {
    if (group.arrows) {
      source.removeFeature(group.arrows)
      group.arrows = null
    }
  }

  /** 为单组创建方向箭头 overlay（按 projected 多段生成） */
  const buildArrows = (group: RenderGroup) => {
    removeArrows(group)
    if (group.projected.length < 2) return
    const overlay = createRouteDirectionOverlay([group.projected])
    overlay.set('trackRank', TRACK_RANK_ARROW)
    group.arrows = overlay
    source.addFeature(overlay)
  }

  /** 游标取整前后两点之间线性插值出单组的车辆渲染坐标 */
  const pointAt = (group: RenderGroup, cursor: number): number[] => {
    if (!group.projected.length) return [0, 0]
    const index = Math.min(Math.max(cursor, 0), group.projected.length - 1)
    const lower = Math.floor(index)
    const upper = Math.min(lower + 1, group.projected.length - 1)
    const ratio = index - lower
    const from = group.projected[lower]
    const to = group.projected[upper]
    return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio]
  }

  /** 游标所在段的切向量（起点→终点）；退化段返回 null */
  const segmentVectorAt = (group: RenderGroup, lower: number): [number, number] | null => {
    if (group.projected.length < 2) return null
    const index = Math.min(Math.max(lower, 0), group.projected.length - 2)
    const from = group.projected[index]
    const to = group.projected[index + 1]
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    if (Math.abs(dx) <= 0.001 && Math.abs(dy) <= 0.001) return null
    return [dx, dy]
  }

  /** 更新单组：已行驶灰线 + 车辆 marker 位置 + 车头朝向 */
  const updateGroupCursor = (group: RenderGroup, cursor: number) => {
    if (!group.projected.length) return
    const clamped = Math.min(Math.max(cursor, 0), group.projected.length - 1)
    const lower = Math.floor(clamped)
    const coordinate = pointAt(group, clamped)

    const traveled = clamped <= 0 ? [] : [...group.projected.slice(0, lower + 1), coordinate]
    ;(group.traveledFeature.getGeometry() as LineString).setCoordinates(traveled)

    const tangent = segmentVectorAt(group, lower)
    let direction: [number, number] | null = null
    const previous = group.lastRenderedCoordinate
    if (previous) {
      const dx = coordinate[0] - previous[0]
      const dy = coordinate[1] - previous[1]
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) direction = [dx, dy]
    }
    if (direction && tangent && direction[0] * tangent[0] + direction[1] * tangent[1] < 0) direction = tangent
    if (!direction && tangent) direction = tangent
    if (direction) group.rotation = normalizeRotation(-Math.atan2(direction[1], direction[0]) + Math.PI / 2, group.rotation)
    group.lastRenderedCoordinate = coordinate

    ;(group.carFeature.getGeometry() as Point).setCoordinates(coordinate)
    group.carFeature.setStyle(
      getStyle('vehicle', {
        src: MAP_ICON_SRC.car,
        rotation: group.rotation,
        scale: 0.65,
        styleId: `history-${group.routeKey}-${group.vehicleId}`,
        zIndex: 100,
      }) as Style,
    )
  }

  const renderMulti = (entries: VehicleTrackEntry[], options?: { fit?: boolean }) => {
    // 1. 收集需要的 trackId
    const needed = new Set<string>()
    for (const entry of entries) needed.add(entry.trackId)

    // 2. 清掉旧 groups 中不需要的
    for (const [trackId, group] of groups) {
      if (needed.has(trackId)) continue
      removeArrows(group)
      source.removeFeatures([group.fullFeature, group.traveledFeature, group.carFeature])
      groups.delete(trackId)
    }

    // 3. 更新或创建所需的 groups
    for (const entry of entries) {
      let group = groups.get(entry.trackId)
      if (!group) {
        group = createGroup(entry)
        groups.set(entry.trackId, group)
      }
      // 颜色可能变化（理论上不会，但保险起见更新）
      group.routeColor = entry.routeColor
      group.fullFeature.setStyle(createRouteLineStyle(entry.routeColor, 5))
      // 投影计算
      group.projected = projectCoords(
        entry.points.map((p) => [p.longitude, p.latitude] as LngLat),
      )
      group.rotation = 0
      group.lastRenderedCoordinate = null
      ;(group.fullFeature.getGeometry() as LineString).setCoordinates(group.projected)
      // 清空已行驶段与车辆位置（将在 setCursorAll 0 时重建）
      ;(group.traveledFeature.getGeometry() as LineString).setCoordinates([])
      ;(group.carFeature.getGeometry() as Point).setCoordinates([0, 0])
      // 方向箭头
      removeArrows(group)
      buildArrows(group)
    }

    // 4. 统一定位到起点
    for (const group of groups.values()) updateGroupCursor(group, 0)

    layer.setVisible(true)

    // 5. fit：所有 fullFeature 合并 extent 后一次性定位
    if (options?.fit) {
      const extent = source.getExtent()
      if (extent) {
        map.getView().fit(extent, {
          padding: [80, 80, 180, 80],
          duration: 400,
          maxZoom: 17,
        })
      }
    }
  }

  const setCursorAll = (cursor: number) => {
    for (const group of groups.values()) updateGroupCursor(group, cursor)
  }

  const clear = () => {
    for (const group of groups.values()) {
      removeArrows(group)
      ;(group.fullFeature.getGeometry() as LineString).setCoordinates([])
      ;(group.traveledFeature.getGeometry() as LineString).setCoordinates([])
    }
    layer.setVisible(false)
  }

  const dispose = () => {
    clear()
    map.removeLayer(layer)
    source.clear()
    groups.clear()
  }

  // 向后兼容的单组接口（内部委托多组实现）
  const render = (points: CarTrackPoint[], cursor: number, options?: { fit?: boolean }) => {
    const entry: VehicleTrackEntry = {
      trackId: 'legacy:single',
      routeKey: 'legacy',
      routeColor: '#1D9BF0',
      vehicleId: 'legacy-car',
      plateNumber: null,
      startTime: null,
      endTime: null,
      stationId: null,
      stationName: null,
      points,
    }
    renderMulti([entry], options)
    setCursorAll(cursor)
  }

  const setCursor = (cursor: number) => setCursorAll(cursor)

  return { renderMulti, setCursorAll, clear, dispose, render, setCursor }
}
