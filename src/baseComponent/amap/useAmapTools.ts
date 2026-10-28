import { driving, multiWaypoint, type PoiFeatureCollection, type RouteResult } from '@/apis/amap'
import { alovaMapProxyInstance } from '@/service/alovaMapProxy'
import { markRaw } from 'vue'
import Map from 'ol/Map'
import View from 'ol/View'
import Feature from 'ol/Feature'
import { LineString, Point, Polygon } from 'ol/geom'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style'
import { unByKey } from 'ol/Observable'
import { asArray } from 'ol/color'
import type { EventsKey } from 'ol/events'
import * as olProj from 'ol/proj'
import Overlay from 'ol/Overlay'
// import { EventBus } from "@/utils/mitt.ts";
import { useDispatchStore } from '@/store/useDispatchStore' // useTabsStore,
import {
  createSelectedTmcLineStyle, 





  
  getStyle,
  MAP_ICON_SRC,
} from '@/baseComponent/OpenlayersMap/style'
import { createDispatchVehicleLabel } from './dispatchVehicleLabel'
import {
  normalizeRouteResults,
  selectRouteAlternatives,
  getSelectedRoute,
  type RouteAlternative,
  type StationRouteAlternatives,
} from './routeAlternatives'
import { extractFirstCongestionPoints } from './routeCongestion'
import type { JRAlarmData } from './mapData'
import { mountPointLayer } from '@/baseComponent/OpenlayersMap/mountPointLayer.ts'
import { createRouteMetricsWorker } from '@/hooks/useRouteMetricsWorker'
import { computeEtaSpeedMps, formatCountdownSeconds } from './routeMetrics'
import { MAP_LAYER_Z_INDEX } from '@/baseComponent/OpenlayersMap/layerOrder'
import type { RouteMetrics } from './routeMetrics'
import {
  parseMultiPolyline,
  parsePolyline,
  parseWgs84Coordinates,
  type LngLat,
  toRouteProxyLngLatString,
} from './amapCoordinate.ts'
import { createRouteArrowFeatures, createRouteDirectionOverlay, createRouteTmcFeatures } from '@/baseComponent/tools/routeBase'

export {
  parseAmapLocation,
  parseMultiPolyline,
  parsePolyline,
  parseWgs84Coordinates,
  toAmapGcj02,
  toAmapLngLatString,
} from './amapCoordinate.ts'
export type { LngLat } from './amapCoordinate.ts'

export const NAV_FINISHED_EVENT = 'amap:nav:finished'

export type NavFinishedPayload = {
  origin?: LngLat
  destination?: LngLat
  endPoint?: LngLat
  finishedAt: number
}

export type RouteVideoCheckpointStatus = 'pending' | 'playing' | 'played'

export type RouteVideoCheckpointEvent = {
  routeIndex: number
  checkpointIndex: number
  lngLat: LngLat
  secondsUntilArrival: number
  /** 触发车辆标识（仅用于诊断；监控点在一次调派周期内仍只播放一次） */
  vehicleKey?: string
}

export type RouteDispatchVehicleInfo = {
  vehicleId: string
  plateNo?: string
  vehicleTypeName?: string
}

const ROUTE_VIDEO_CHECKPOINT_COUNT = 10
const ROUTE_VIDEO_FIRST_CHECKPOINT_SECONDS = 15
const ROUTE_VIDEO_LEAD_SECONDS = 10
const ROUTE_NETWORK_SAMPLE_METERS = 30
const ROUTE_NETWORK_MERGE_TOLERANCE_METERS = 22
const ROUTE_NETWORK_DIRECTION_TOLERANCE_RAD = Math.PI / 4
const ROUTE_VIDEO_CHECKPOINT_COLORS: Record<RouteVideoCheckpointStatus, string> = {
  pending: '#22c55e',
  playing: '#facc15',
  played: '#ef4444',
}

const createRouteVideoCheckpointStyle = (status: RouteVideoCheckpointStatus) =>
  new Style({
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({ color: ROUTE_VIDEO_CHECKPOINT_COLORS[status] }),
      stroke: new Stroke({ color: '#ffffff', width: 2 }),
    }),
    zIndex: 300,
  })

// 本文件已导入 OpenLayers Map，键值表必须显式使用原生 globalThis.Map，避免名称遮蔽。
type RouteCheckpointArrivalMap = globalThis.Map<number, number>

type RouteNetworkChunk = {
  point: number[]
  bearing: number
  length: number
  arrivals: RouteCheckpointArrivalMap
}

const directionDifference = (left: number, right: number) => {
  const difference = Math.abs(left - right) % Math.PI
  return Math.min(difference, Math.PI - difference)
}

export type FireStationPoint = {
  lng: number
  lat: number
  title: string
  address?: string
  phone?: string
  deviceTotal?: number
  deviceGoouts?: number
}

export type AlarmData = {
  id?: string
  province?: string
  city?: string
  county?: string
  town?: string
  community?: string
  adcode?: number
  road?: string
  road_no?: string
  type?: string
  aoi?: string
  sub_aoi?: string | null
  building?: string
  address?: string
  aoi_id?: string
  building_id?: string
  x?: number
  y?: number
  bg_id?: string | null
  md5_id?: string
  md5_parent_id?: string
  areausage_id?: number
  areausag_name?: string
  areausage_tag?: boolean
  info?: any
}

/** 按队站数据（重新）填充矢量源，样式逻辑与初始建层保持一致 */
export const populateFireStationSource = (
  source: VectorSource,
  stations: FireStationPoint[],
  iconSrc: string,
  view?: View,
  usageVisibleZoom = 14,
) => {
  source.clear()
  const iconOnlyStyle = getStyle('fireStation', { iconSrc, scale: 0.8 })

  for (const s of stations) {
    if (!Number.isFinite(s.lng) || !Number.isFinite(s.lat)) continue
    const f = new Feature({
      geometry: new Point(olProj.fromLonLat([s.lng, s.lat])),
    })
    f.set('data', s)
    const usageStyle = getStyle('fireStation', {
      iconSrc,
      scale: 0.8,
      deviceGoouts: s.deviceGoouts,
      deviceTotal: s.deviceTotal,
    })
    f.setStyle((_, resolution) => {
      const zoom = view?.getZoomForResolution(resolution) ?? view?.getZoom() ?? usageVisibleZoom
      return zoom >= usageVisibleZoom ? usageStyle : iconOnlyStyle
    })
    source.addFeature(f)
  }
}

// 调派路线层为 1002，消防队站点位和 WMS 应盖在路线之上。
export const FIRE_STATION_LAYER_Z_INDEX = MAP_LAYER_Z_INDEX.fireStation

export const createFireStationsLayer = (
  stations: FireStationPoint[],
  iconSrc: string,
  layerName = 'FIRE_STATIONS_LAYER',
  options?: {
    view?: View
    usageVisibleZoom?: number
    visible?: boolean
  },
) => {
  const source = new VectorSource()
  const layer = new VectorLayer({
    source,
    className: layerName,
    zIndex: FIRE_STATION_LAYER_Z_INDEX,
    visible: options?.visible ?? false,
  })
  const usageVisibleZoom = options?.usageVisibleZoom ?? 14
  populateFireStationSource(source, stations, iconSrc, options?.view, usageVisibleZoom)

  return layer
}

export const mountFireStations = (params: {
  map: Map
  stations: FireStationPoint[]
  iconSrc: string
  popupElement: HTMLElement
  visible?: boolean
  onSelect: (data: FireStationPoint) => void
  onClose: () => void
}) => {
  const layer = createFireStationsLayer(params.stations, params.iconSrc, undefined, {
    view: params.map.getView(),
    usageVisibleZoom: 14,
    visible: params.visible ?? false,
  })
  params.map.addLayer(layer)

  const overlay = new Overlay({
    element: params.popupElement,
    positioning: 'bottom-center',
    offset: [10, -14],
    stopEvent: true,
  })
  params.map.addOverlay(overlay)

  const clickKey: EventsKey = params.map.on('singleclick', (evt) => {
    let hit = false
    params.map.forEachFeatureAtPixel(
      evt.pixel,
      (feature, l) => {
        if (l !== layer) return false
        const data = (feature as any).get('data') as FireStationPoint | undefined
        if (!data) return false
        params.onSelect(data)
        overlay.setPosition(evt.coordinate)
        hit = true
        return true
      },
      { hitTolerance: 6 },
    )
    if (!hit) {
      params.onClose()
      overlay.setPosition(undefined)
    }
  })

  const hide = () => {
    params.onClose()
    overlay.setPosition(undefined)
  }

  const setVisible = (visible: boolean) => {
    layer.setVisible(visible)
    if (!visible) hide()
  }

  /** WFS 队站数据异步到达后，重新填充图层 */
  const setStations = (stations: FireStationPoint[]) => {
    populateFireStationSource(layer.getSource()!, stations, params.iconSrc, params.map.getView())
  }

  const destroy = () => {
    unByKey(clickKey)
    params.map.removeOverlay(overlay)
    params.map.removeLayer(layer)
  }

  return {
    layer,
    overlay,
    hide,
    setVisible,
    isVisible: () => layer.getVisible(),
    setStations,
    destroy,
  }
}

export const createJRAlarmLayer = (
  alarms: JRAlarmData[],
  layerName = 'JR_ALARM_LAYER',
  options?: {
    visible?: boolean
  },
) => {
  const source = new VectorSource()
  const layer = new VectorLayer({
    source,
    className: layerName,
    zIndex: 55,
    visible: options?.visible ?? false,
  })
  populateJRAlarmSource(source, alarms)
  return layer
}

const populateJRAlarmSource = (source: VectorSource, alarms: JRAlarmData[]) => {
  alarms.forEach((alarm) => {
    if (!Number.isFinite(alarm.lng) || !Number.isFinite(alarm.lat)) return
    const feature = new Feature({
      geometry: new Point(olProj.fromLonLat([alarm.lng, alarm.lat])),
    })
    feature.set('data', alarm)
    feature.setStyle(getStyle('commonAlarm', { type: alarm.type, colorType: alarm.colorType }))
    source.addFeature(feature)
  })
}

export const mountJRAlarmLayer = (params: {
  map: Map
  alarms: JRAlarmData[]
  /** 不传则不创建内置弹窗（调用方自行实现统一点击弹窗时使用） */
  popupElement?: HTMLElement
  visible?: boolean
  onSelect?: (data: JRAlarmData) => void
  onClose?: () => void
}) => {
  // 复用通用点位图层工厂；未结案警情按 incidentId 去重，样式用类型/状态着色的 commonAlarm。
  return mountPointLayer<JRAlarmData>({
    map: params.map,
    items: params.alarms,
    popupElement: params.popupElement,
    visible: params.visible ?? false,
    onSelect: params.onSelect,
    onClose: params.onClose,
    className: 'JR_ALARM_LAYER',
    zIndex: 55,
    keyGetter: (alarm) => alarm.incidentId,
    coordinateGetter: (alarm) => [alarm.lng, alarm.lat],
    styleGetter: (alarm) => getStyle('commonAlarm', { type: alarm.type, colorType: alarm.colorType }),
  })
}

export type AmapDistrictQuery = {
  key: string
  keywords: string
  subdistrict?: number
  extensions?: 'base' | 'all'
}

export type AmapDrivingQuery = {
  key?: string
  origin: LngLat
  destination: LngLat
  waypoints?: LngLat[]
  strategy?: number
  extensions?: 'base' | 'all'
}

export type AmapTmcStatus = 'unknown' | 'smooth' | 'slow' | 'jam' | 'serious_jam'

export type AmapTmcSegment = {
  status: AmapTmcStatus
  polyline: LngLat[]
}

export type AmapDrivingResult = {
  fullPath: LngLat[]
  tmcs: AmapTmcSegment[]
  /** 每个 properties 中第一次出现“拥堵”的 TMC 起点。 */
  congestionPoints: LngLat[]
  distanceMeters: number
  durationSeconds: number
}

export type AmapInputTip = {
  id?: string
  name: string
  address?: string
  district?: string
  adcode?: string
  location?: LngLat
}

export type AmapInputTipsQuery = {
  key: string
  keywords: string
  city?: string
  citylimit?: boolean
}

export type AmapRegeoQuery = {
  key: string
  location: LngLat
  radius?: number
}

const AMAP_V3_DISTRICT_URL = 'https://restapi.amap.com/v3/config/district'

const buildUrl = (baseUrl: string, params: Record<string, string>) => {
  const url = new URL(baseUrl)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && `${v}`.length) {
      url.searchParams.set(k, `${v}`)
    }
  })
  return url.toString()
}

const jsonpRequest = <T = any>(url: string, timeoutMs = 15000): Promise<T> => {
  return new Promise((resolve, reject) => {
    const callbackName = '__amap_jsonp_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36)

    const script = document.createElement('script')
    let timeoutId: number | null = null

    const cleanup = () => {
      if (timeoutId) window.clearTimeout(timeoutId)
      timeoutId = null
      script.onerror = null
      if (script.parentNode) script.parentNode.removeChild(script)
      try {
        delete (window as any)[callbackName]
      } catch {
        ;(window as any)[callbackName] = undefined
      }
    }

    ;(window as any)[callbackName] = (data: T) => {
      cleanup()
      resolve(data)
    }

    timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('AMap JSONP timeout'))
    }, timeoutMs)

    script.onerror = () => {
      cleanup()
      reject(new Error('AMap JSONP network error'))
    }

    const sep = url.includes('?') ? '&' : '?'
    script.src = `${url}${sep}callback=${callbackName}`
    document.head.appendChild(script)
  })
}

export const fetchInputTips = async (query: AmapInputTipsQuery): Promise<AmapInputTip[]> => {
  const params = new URLSearchParams()
  params.set('keywords', query.keywords)
  if (query.city) {
    params.set('city', query.city)
  }
  const data = await alovaMapProxyInstance.Get<PoiFeatureCollection>(`/api/amap/poi/input-tips?${params.toString()}`)
  const features = data?.features ?? []
  return features
    .map((f) => {
      const coords = f?.geometry?.coordinates as LngLat | undefined
      const location = coords && Number.isFinite(coords[0]) && Number.isFinite(coords[1]) ? coords : undefined
      return {
        id: `${f?.properties?.id ?? ''}`.trim() || undefined,
        name: `${f?.properties?.name ?? ''}`.trim(),
        address: `${f?.properties?.address ?? ''}`.trim() || undefined,
        district: `${f?.properties?.district ?? ''}`.trim() || undefined,
        adcode: `${f?.properties?.adcode ?? ''}`.trim() || undefined,
        location,
      } as AmapInputTip
    })
    .filter((t) => t.name)
}

export const fetchRegeo = async (query: AmapRegeoQuery): Promise<{ formattedAddress: string; poiName?: string }> => {
  const params = new URLSearchParams()
  params.set('location', toRouteProxyLngLatString(query.location))
  params.set('extensions', 'all')
  if (query.radius != null) {
    params.set('radius', `${query.radius}`)
  }
  const data = await alovaMapProxyInstance.Get<PoiFeatureCollection & { formatAddress?: string }>(
    `/api/amap/geo/regeo?${params.toString()}`,
  )
  const formattedAddress = `${data?.formatAddress ?? ''}`.trim()
  const poiName = `${data?.features?.[0]?.properties?.name ?? ''}`.trim() || undefined
  return { formattedAddress, poiName }
}

export const fetchDistrictBoundary = async (query: AmapDistrictQuery): Promise<LngLat[][]> => {
  const url = buildUrl(AMAP_V3_DISTRICT_URL, {
    key: query.key,
    keywords: query.keywords,
    subdistrict: `${query.subdistrict ?? 0}`,
    extensions: query.extensions ?? 'all',
    output: 'JSON',
  })

  const data = await jsonpRequest<any>(url)
  if (data?.status === '0') {
    throw new Error(`${data?.info || 'AMap district failed'}`)
  }
  const districts = data?.districts
  const boundary = districts?.[0]?.polyline as string | undefined
  return boundary ? parseMultiPolyline(boundary) : []
}

const normalizeStatus = (status: unknown): AmapTmcStatus => {
  const s = String(status ?? '')
    .trim()
    .toLowerCase()
  if (s === '畅通' || s === 'smooth') return 'smooth'
  if (s === '缓行' || s === 'slow') return 'slow'
  if (s === '拥堵' || s === 'jam') return 'jam'
  if (s === '严重拥堵' || s === 'serious_jam') return 'serious_jam'
  return 'unknown'
}

/**
 * 代理的 GeoJSON geometry 已是 WGS84；只有高德原始 TMC polyline 仍是 GCJ-02。
 * 两种字段必须分别处理，避免 geometry 被二次纠偏。
 */
export const toDrivingResult = (route: RouteResult): AmapDrivingResult => {
  const fullPath = route.routes.flatMap((r) =>
    r.features.flatMap((feature) => parseWgs84Coordinates(feature.geometry.coordinates)),
  )
  if (fullPath.length < 2) throw new Error('未获取到可用路线')
  const tmcs: AmapTmcSegment[] = route.routes.flatMap((r) =>
    r.features.flatMap((feature) => {
      const segments: AmapTmcSegment[] = (feature.properties?.tmcs ?? []).flatMap((tmc) => {
        const polyline = parsePolyline(tmc.polyline ?? '')
        return polyline.length >= 2 ? [{ status: normalizeStatus(tmc.status), polyline }] : []
      })
      if (segments.length) return segments
      // 某一步没有可用 TMC 时，保留该步路线并以未知路况绘制。
      const polyline = parseWgs84Coordinates(feature.geometry.coordinates)
      return polyline.length >= 2 ? [{ status: 'unknown', polyline }] : []
    }),
  )
  const primaryPlan = route.routes[0]
  return {
    fullPath,
    tmcs,
    congestionPoints: extractFirstCongestionPoints(route),
    distanceMeters: Number(primaryPlan?.totalDistance) || 0,
    durationSeconds: Number(primaryPlan?.totalTime) || 0,
  }
}

/**
 * 驾车路径规划。strategy=11 时代理返回多条候选路线（RoutePlan[]），
 * 消费方式参考 multiWaypoint + fetchRoutesAndEta：把数组里的每条 RoutePlan
 * 归一为独立的 AmapDrivingResult，一条候选路线对应一个结果。
 * 立案阶段可渲染全部结果；调派阶段由调用方只取选中的一条（默认 results[0]）。
 */
export const fetchDrivingRoutes = async (query: AmapDrivingQuery): Promise<AmapDrivingResult[]> => {
  const routes = await driving({
    origin: toRouteProxyLngLatString(query.origin),
    destination: toRouteProxyLngLatString(query.destination),
    strategy: 11,
  })
  const results = normalizeRouteResults(routes).flatMap((route) =>
    (route.routes ?? []).flatMap((plan) => {
      try {
        return [toDrivingResult({ ...route, routes: [plan] })]
      } catch {
        return []
      }
    }),
  )
  if (!results.length) {
    throw new Error('未获取到可用路线')
  }
  return results
}

/** 车辆轨迹 ETA：多起点、单终点批量查询。 */
export const fetchVehicleArrivalTimes = async (origins: LngLat[], destination: LngLat): Promise<number[]> => {
  if (!origins.length) return []
  const routes = await multiWaypoint({
    origins: origins.map(toRouteProxyLngLatString),
    destinations: [toRouteProxyLngLatString(destination)],
    // strategy: 11,
  })
  const singleOrigin = origins.length === 1
  if (!Array.isArray(routes) || routes.length !== (singleOrigin ? 2 : origins.length)) {
    throw new Error('预计到达时间返回数量与车辆数量不一致')
  }
  // 单起点请求重复两次，单车只使用第一条 ETA。
  return (singleOrigin ? routes.slice(0, 1) : routes).map((route) => {
    const plan = route.routes?.[0]
    const seconds = Number(plan?.totalTime)
    if (plan?.totalTime == null || String(plan.totalTime).trim() === '' || !Number.isFinite(seconds) || seconds <= 0) {
      throw new Error('预计到达时间无效')
    }
    return seconds
  })
}

export const buildMaskFeature = (holesLngLat: LngLat[][]): Feature<Polygon> => {
  const outerRing: LngLat[] = [
    [73.0, 3.0],
    [136.0, 3.0],
    [136.0, 54.0],
    [73.0, 54.0],
    [73.0, 3.0],
  ]

  const coordinates = [
    outerRing.map((p) => olProj.fromLonLat(p)),
    ...holesLngLat.map((ring) => ring.map((p) => olProj.fromLonLat(p))),
  ]

  return new Feature({
    geometry: new Polygon(coordinates),
  })
}

export const buildBoundaryFeature = (ringsLngLat: LngLat[][]) => {
  const ring = ringsLngLat[0] ?? []
  const coords = ring.map((p) => olProj.fromLonLat(p))
  return new Feature({
    geometry: new LineString(coords),
  })
}

export const buildTmcFeatures = (tmcs: AmapTmcSegment[]) => {
  // 统一委托路线底座，避免与 OpenlayersMap 消费方各写一套 TMC 建线
  return createRouteTmcFeatures(tmcs)
}

/**
 * 沿多条完整路线生成全局等距方向箭头。
 * 所有路线共用同一间距并从终点反向对齐，合流道路上的箭头按位置去重，
 * 既保证分支上的方向提示，也避免终点附近因多条路线叠加而变密。
 */
export const buildRouteDirectionFeatures = (routeCoordinates: number[][][], resolution = 1): Feature<Point>[] => {
  // 统一委托路线底座（分级密度 + 合流去重），与 OpenlayersMap 消费方共用同一实现
  return createRouteArrowFeatures(routeCoordinates, resolution)
}

/** 缩放时分级增减固定锚点上的箭头，避免沿路线滑动；实现下沉路线底座，与 OpenlayersMap 消费方共用。 */
export { createRouteDirectionOverlay, getRouteArrowResolution } from '@/baseComponent/tools/routeBase'

const interpolateOnLine = (coords: number[][], distances: number[], targetDistance: number) => {
  if (!coords.length) return { point: null as number[] | null, bearing: 0 }
  if (targetDistance <= 0) {
    const bearing = coords.length >= 2 ? safeBearingRad(coords, 1) : 0
    return { point: coords[0], bearing }
  }
  const total = distances[distances.length - 1] ?? 0
  if (targetDistance >= total) {
    const last = coords[coords.length - 1]
    // @ts-expect-error TS6133: 引用处已注释，保留备用
    const prev = coords[coords.length - 2] ?? last
    return { point: last, bearing: safeBearingRad(coords, coords.length - 1) }
  }

  let i = 1
  while (i < distances.length && distances[i] < targetDistance) i++
  const d0 = distances[i - 1]
  const d1 = distances[i]
  const t = d1 === d0 ? 0 : (targetDistance - d0) / (d1 - d0)
  const [x0, y0] = coords[i - 1]
  const [x1, y1] = coords[i]
  const x = x0 + (x1 - x0) * t
  const y = y0 + (y1 - y0) * t
  return { point: [x, y], bearing: safeBearingRad(coords, i) }
}

/** 截取路线起点到指定累计里程，用于绘制车辆已经驶过的灰色路段。 */
const sliceLineAtDistance = (coords: number[][], distances: number[], targetDistance: number) => {
  if (!coords.length || !distances.length || targetDistance <= 0) return []
  const { point } = interpolateOnLine(coords, distances, targetDistance)
  if (!point) return []
  let endIndex = 1
  while (endIndex < distances.length && distances[endIndex] < targetDistance) endIndex++
  const passedCoords = coords.slice(0, Math.max(1, endIndex))
  const last = passedCoords[passedCoords.length - 1]
  if (!last || last[0] !== point[0] || last[1] !== point[1]) passedCoords.push(point)
  return passedCoords.length >= 2 ? passedCoords : []
}

const createPassedRouteStyle = () =>
  new Style({
    zIndex: 100,
    stroke: new Stroke({
      color: '#94a3b8',
      width: 7,
    }),
  })

const bearingRad = (a: number[], b: number[]) => {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  return Math.atan2(dy, dx)
}

const isSameCoord = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1]

const safeBearingRad = (coords: number[][], endIndex: number) => {
  if (coords.length < 2) return 0
  let i = Math.max(1, Math.min(endIndex, coords.length - 1))

  let a = coords[i - 1]
  let b = coords[i]

  if (!isSameCoord(a, b)) return bearingRad(a, b)

  let j = i + 1
  while (j < coords.length) {
    b = coords[j]
    if (!isSameCoord(a, b)) return bearingRad(a, b)
    j++
  }

  j = i - 2
  b = coords[i]
  while (j >= 0) {
    a = coords[j]
    if (!isSameCoord(a, b)) return bearingRad(a, b)
    j--
  }

  return 0
}

const normalizeAngleNear = (angle: number, reference: number | null) => {
  if (reference === null) return angle
  let a = angle
  while (a - reference > Math.PI) a -= Math.PI * 2
  while (a - reference < -Math.PI) a += Math.PI * 2
  return a
}

const clampNumber = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** ETA 不可用时的默认速度策略：按 nominalSpeed 推导时长并钳制，再把速度钳制到 [min, max]。 */
const computeSpeedMps = (totalMeters: number, opt: AmapRealtimeNavOptions) => {
  const minSpeed = opt.minSpeedMps ?? 4
  const maxSpeed = opt.maxSpeedMps ?? 35
  const minDuration = opt.minDurationSec ?? 20
  const maxDuration = opt.maxDurationSec ?? 180
  const nominalSpeed = opt.nominalSpeed ?? 1000

  let speed = opt.speedMps
  if (!speed || !Number.isFinite(speed) || speed <= 0) {
    const duration = clampNumber(totalMeters / nominalSpeed, minDuration, maxDuration)
    speed = duration > 0 ? totalMeters / duration : nominalSpeed
  }

  return clampNumber(speed, minSpeed, maxSpeed)
}

export type AmapRealtimeNavOptions = {
  amapKey: string
  xzKeywords?: string
  refreshMs?: number
  speedMps?: number
  minSpeedMps?: number
  maxSpeedMps?: number
  minDurationSec?: number
  maxDurationSec?: number
  nominalSpeed?: number
  vehicleHeadingOffsetRad?: number
  loop?: boolean
  vehicleIconSrc: string
}

export class AmapRealtimeNav {
  private map: Map
  private options: AmapRealtimeNavOptions
  private clickKey: EventsKey | null = null
  private picking: 'idle' | 'start' | 'end' = 'idle'
  private pickStart: LngLat | null = null
  private pickEnd: LngLat | null = null
  private timerId: number | null = null
  private rafId: number | null = null
  private routeMetricsWorker = createRouteMetricsWorker()
  private vehicleFeatures: Feature<Point>[] = []
  private routeProjectedCoordsMulti: number[][][] = []
  private routeEtaSeconds = 0
  private routeEtaSecondsMulti: number[] = []
  private routeDistancesMulti: number[][] = []
  private routeMetricsMulti: RouteMetrics[] = []
  private currentDistances: number[] = []
  private lastVehicleRotations: (number | null)[] = []
  /** 同一路线上的追加车辆（二次调派同队站加车时使用），每辆车独立维护当前距离与朝向 */
  private extraVehicles: {
    feature: Feature<Point>
    routeIndex: number
    currentDistance: number
    lastRotation: number | null
    /** 本车已触发过的监控点 index：替代监控点全局 status 做每车去重，
     *  避免同一监控点被首车触发后追加车辆无法再触发，或在 lead 窗口内逐帧重复触发 */
    firedCheckpoints: Set<number>
  }[] = []
  /** 最近一次全量路线结果，供追加路线后重建全局监控点 */
  private lastRouteResults: AmapDrivingResult[] = []
  private lastRouteMetrics: RouteMetrics[] = []

  private vehicleFeature: Feature<Point> | null = null
  private routeProjectedCoords: number[][] = []
  private routeDistances: number[] = []
  private routeMetrics: RouteMetrics | null = null
  private animationStartTs = 0
  private currentDistance = 0
  private lastVehicleRotation: number | null = null
  private navFinishedEmitted = false
  private routeLayer: VectorLayer<VectorSource> | null = null
  private routeProgressLayer: VectorLayer<VectorSource> | null = null
  private routeArrowLayer: VectorLayer<VectorSource> | null = null
  private vehicleLayer: VectorLayer<VectorSource> | null = null
  private routeVehicleGroups: RouteDispatchVehicleInfo[][] = []
  private vehicleLabels = new globalThis.Map<Feature<Point>, ReturnType<typeof createDispatchVehicleLabel>>()
  private routeProgressFeatures: Feature<LineString>[] = []
  private routeProgressFeature: Feature<LineString> | null = null
  private checkpointLayer: VectorLayer<VectorSource> | null = null
  private checkpointFeatures: Feature<Point>[] = []
  private checkpointArrivals: RouteCheckpointArrivalMap[] = []
  private checkpointDueHandler: ((event: RouteVideoCheckpointEvent) => void) | null = null
  /** 当前调派周期内已经触发过视频的点位（EPSG:3857）。
   *  二次调派新增路线会重新计算全局 10 个点，使用空间位置继承已播放状态，避免旧视频再次弹出。 */
  private consumedCheckpointPoints: number[][] = []
  private maskLayer: VectorLayer<VectorSource> | null = null
  private pointLayer: VectorLayer<VectorSource> | null = null
  private startMarker: Feature<Point> | null = null
  public endMarker: Feature<Point> | null = null
  private alarmMarker: Feature<Point> | null = null
  private alarmData: AlarmData | null = null
  // @ts-expect-error TS6133: 引用处已注释，保留备用
  private originLngLat: LngLat | null = null
  // @ts-expect-error TS6133: 引用处已注释，保留备用
  private destinationLngLat: LngLat | null = null
  private boundRoutesplanroad: ((origins: LngLat[], destination: LngLat) => Promise<AmapDrivingResult[]>) | null = null

  constructor(map: Map, options: AmapRealtimeNavOptions) {
    this.map = map
    this.options = {
      xzKeywords: '珠海市',
      refreshMs: 15000,
      vehicleHeadingOffsetRad: Math.PI / 2,
      loop: false,
      ...options,
    }
    this.ensureLayers()

    // 暴露测试方法到 window，供控制台直接调用路径规划与渲染
    this.boundRoutesplanroad = this.routesplanroad.bind(this)
    ;(window as any).routesplanroad = this.boundRoutesplanroad
  }

  setKey(amapKey: string) {
    this.options.amapKey = amapKey
  }

  setRegionKeywords(keywords: string) {
    ;(this.options as any).xzKeywords = keywords
  }

  async loadMask(boundaryRings?: LngLat[][]) {
    const rings =
      boundaryRings?.length && boundaryRings[0]?.length
        ? boundaryRings
        : await fetchDistrictBoundary({
            key: this.options.amapKey,
            keywords: this.options.xzKeywords ?? '',
            subdistrict: 0,
            extensions: 'all',
          })

    if (!rings?.length) return

    const mask = buildMaskFeature(rings)
    mask.setStyle(getStyle('mask'))

    const boundary: any = buildBoundaryFeature(rings)
    boundary.setStyle(getStyle('boundary'))

    const source = this.maskLayer!.getSource()!
    source.clear()
    source.addFeature(mask)
    source.addFeature(boundary)

    // const extent = boundary.getGeometry().getExtent();
    // this.map.getView().fit(extent, { padding: [40, 40, 40, 40], duration: 300 });
  }

  startPickPoints() {
    this.stop()
    this.ensureLayers()
    this.clearEndpoints()
    this.picking = 'start'
    this.pickStart = null
    this.pickEnd = null

    const targetEl = this.map.getTargetElement()
    if (targetEl) targetEl.style.cursor = 'crosshair'

    this.clickKey = this.map.on('singleclick', (evt) => {
      const lngLat = olProj.toLonLat(evt.coordinate) as LngLat
      if (this.picking === 'start') {
        this.pickStart = lngLat
        this.setEndpoint('start', lngLat)
        this.picking = 'end'
        return
      }
      if (this.picking === 'end') {
        this.pickEnd = lngLat
        this.setEndpoint('end', lngLat)
        this.picking = 'idle'
        this.exitPickingMode()
        void this.planAndStart(this.pickStart!, this.pickEnd!)
      }
    })
  }

  async pickAddressPoint(type: 'start' | 'end') {
    if (!this.options.amapKey) return null
    this.exitPickingMode()

    const targetEl = this.map.getTargetElement()
    if (targetEl) targetEl.style.cursor = 'crosshair'

    return await new Promise<{ lngLat: LngLat; address: string } | null>((resolve) => {
      this.clickKey = this.map.on('singleclick', async (evt) => {
        this.exitPickingMode()
        const lngLat = olProj.toLonLat(evt.coordinate) as LngLat
        try {
          const { formattedAddress, poiName } = await fetchRegeo({
            key: this.options.amapKey,
            location: lngLat,
          })
          const address = poiName ? `${poiName}（${formattedAddress}）` : formattedAddress
          this.setEndpoint(type, lngLat)
          resolve({ lngLat, address })
        } catch {
          this.setEndpoint(type, lngLat)
          resolve({ lngLat, address: `${lngLat[0]},${lngLat[1]}` })
        }
      })
    })
  }

  async reverseGeocode(lngLat: LngLat) {
    if (!this.options.amapKey) return null
    const { formattedAddress, poiName } = await fetchRegeo({
      key: this.options.amapKey,
      location: lngLat,
    })

    const address = poiName ? `${poiName}（${formattedAddress}）` : formattedAddress

    return address
  }

  cancelPick() {
    this.exitPickingMode()
    this.clearEndpoints()
  }

  stop() {
    if (this.timerId) {
      window.clearInterval(this.timerId)
      this.timerId = null
    }
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.animationStartTs = 0
    this.currentDistance = 0
    this.lastVehicleRotation = null
    this.navFinishedEmitted = false
    this.routeProjectedCoords = []
    this.routeDistances = []
    this.routeMetrics = null
    this.routeProjectedCoordsMulti = []
    this.routeDistancesMulti = []
    this.routeMetricsMulti = []
    this.vehicleFeatures = []
    this.extraVehicles = []
    this.routeVehicleGroups = []
    this.clearVehicleLabels()
    this.currentDistances = []
    this.lastVehicleRotations = []
    this.lastRouteResults = []
    this.lastRouteMetrics = []
    this.originLngLat = null
    this.destinationLngLat = null
    this.vehicleFeature = null
    this.routeLayer?.getSource()?.clear()
    this.routeArrowLayer?.getSource()?.clear()
    this.routeProgressLayer?.getSource()?.clear()
    this.vehicleLayer?.getSource()?.clear()
    this.clearRouteVideoCheckpoints()
    this.exitPickingMode()
  }

  destroy() {
    this.stop()
    this.routeMetricsWorker.destroy()
    this.map.removeLayer(this.routeLayer!)
    this.map.removeLayer(this.routeProgressLayer!)
    this.map.removeLayer(this.routeArrowLayer!)
    this.map.removeLayer(this.vehicleLayer!)
    this.map.removeLayer(this.checkpointLayer!)
    this.map.removeLayer(this.maskLayer!)
    this.map.removeLayer(this.pointLayer!)
    this.routeLayer = null
    this.routeProgressLayer = null
    this.routeArrowLayer = null
    this.vehicleLayer = null
    this.checkpointLayer = null
    this.maskLayer = null
    this.pointLayer = null
    if (this.boundRoutesplanroad && (window as any).routesplanroad === this.boundRoutesplanroad) {
      delete (window as any).routesplanroad
    }
    this.boundRoutesplanroad = null
  }

  private exitPickingMode() {
    if (this.clickKey) {
      unByKey(this.clickKey)
      this.clickKey = null
    }
    this.picking = 'idle'
    const targetEl = this.map.getTargetElement()
    if (targetEl) targetEl.style.cursor = ''
  }

  /**
   * 检测鼠标是否点击车辆详情标签。
   * 根据当前 OpenLayers Text 的实际文字和偏移量计算屏幕区域。
   */
  private clearVehicleLabels() {
    this.vehicleLabels.forEach(({ overlay }) => this.map.removeOverlay(overlay))
    this.vehicleLabels.clear()
  }

  private ensureLayers() {
    if (!this.routeLayer) {
      this.routeLayer = markRaw(
        new VectorLayer({
          source: new VectorSource(),
          zIndex: MAP_LAYER_Z_INDEX.route,
          // 路线层在交互时更新,拖拽地图不影响车辆运行
          updateWhileInteracting: true,
          updateWhileAnimating: true,
        }),
      )
      this.map.addLayer(this.routeLayer)
    }
    if (!this.routeProgressLayer) {
      this.routeProgressLayer = markRaw(
        new VectorLayer({
          source: new VectorSource(),
          zIndex: MAP_LAYER_Z_INDEX.routeProgress,
          updateWhileInteracting: true,
          updateWhileAnimating: true,
        }),
      )
      this.map.addLayer(this.routeProgressLayer)
    }
    if (!this.routeArrowLayer) {
      this.routeArrowLayer = markRaw(
        new VectorLayer({
          source: new VectorSource(),
          // 箭头独立于路况底线，始终在灰色行驶进度线（30）上方。
          zIndex: MAP_LAYER_Z_INDEX.routeArrow,
          updateWhileInteracting: true,
          updateWhileAnimating: true,
        }),
      )
      this.map.addLayer(this.routeArrowLayer)
    }
    if (!this.vehicleLayer) {
      this.vehicleLayer = markRaw(
        new VectorLayer({
          source: new VectorSource(),
          // 高于辖区高亮面（59）与警情点位（60），避免倒计时文字/车辆图标被辖区填充遮挡
          zIndex: MAP_LAYER_Z_INDEX.vehicle,
          updateWhileInteracting: true,
          updateWhileAnimating: true,
        }),
      )
      this.map.addLayer(this.vehicleLayer)
    }
    if (!this.checkpointLayer) {
      this.checkpointLayer = markRaw(
        new VectorLayer({
          source: new VectorSource(),
          // 高于路线，低于警情/重点单位等业务点图层。
          zIndex: MAP_LAYER_Z_INDEX.routeCheckpoint,
          updateWhileInteracting: true,
          updateWhileAnimating: true,
        }),
      )
      this.map.addLayer(this.checkpointLayer)
    }
    if (!this.maskLayer) {
      this.maskLayer = markRaw(
        new VectorLayer({
          source: new VectorSource(),
          zIndex: 10,
        }),
      )
      this.map.addLayer(this.maskLayer)
    }
    if (!this.pointLayer) {
      this.pointLayer = markRaw(
        new VectorLayer({
          source: new VectorSource(),
          zIndex: MAP_LAYER_Z_INDEX.routeEndpoint,
        }),
      )
      this.map.addLayer(this.pointLayer)
    }
  }

  private clearPoints() {
    this.pointLayer?.getSource()?.clear()
  }

  clearEndpoints() {
    this.startMarker = null
    this.endMarker = null
    this.alarmMarker = null
    this.alarmData = null
    this.clearPoints()
  }

  setEndpoint(type: 'start' | 'end' | 'alarm', lngLat: LngLat, options?: { alarmData?: AlarmData }) {
    this.ensureLayers()
    const coordinate = olProj.fromLonLat(lngLat)
    const f = new Feature({ geometry: new Point(coordinate) })
    if (type === 'alarm') {
      f.setStyle(getStyle('alarm', { iconSrc: MAP_ICON_SRC.alarm, scale: 0.9 }))
      this.alarmData = options?.alarmData ?? null
      f.set('alarmData', this.alarmData)
    } else {
      f.setStyle(getStyle('endpoint', { type }))
    }
    const src = this.pointLayer!.getSource()!
    if (type === 'start') {
      if (this.startMarker) src.removeFeature(this.startMarker)
      this.startMarker = f
    } else if (type === 'end') {
      if (this.endMarker) src.removeFeature(this.endMarker)
      this.endMarker = f
    } else if (type === 'alarm') {
      if (this.alarmMarker) src.removeFeature(this.alarmMarker)
      this.alarmMarker = f
    }
    src.addFeature(f)
  }

  mountAlarmOverlay(params: {
    element: HTMLElement
    onUpdate: (data: AlarmData | null) => void
    /**
     * 是否由本方法内部绑定 singleclick 命中警情点（默认 true）。
     * 调用方需要多个业务图层（警情规划/今日灾情/警情定位）共用这一个弹窗时，
     * 传 false 并使用返回的 overlay 自行实现统一的点击命中，避免多个监听器互相覆盖。
     */
    attachClick?: boolean
  }) {
    const overlay = new Overlay({
      element: params.element,
      positioning: 'bottom-center',
      offset: [0, -58],
      stopEvent: true,
    })
    this.map.addOverlay(overlay)

    // attachClick 默认 true，保持既有调用方（map.vue）行为不变
    const clickKey: EventsKey | null =
      params.attachClick === false
        ? null
        : this.map.on('singleclick', (evt) => {
            let hit = false
            this.map.forEachFeatureAtPixel(
              evt.pixel,
              (feature, layer) => {
                if (layer !== this.pointLayer) return false
                if (feature !== this.alarmMarker) return false
                const data = (feature as any).get('alarmData') as AlarmData | null
                params.onUpdate(data)
                overlay.setPosition(evt.coordinate)
                hit = true
                return true
              },
              { hitTolerance: 6 },
            )

            if (!hit) {
              params.onUpdate(null)
              overlay.setPosition(undefined)
            }
          })

    const showAtAlarm = () => {
      if (!this.alarmMarker) return
      const geom = this.alarmMarker.getGeometry()
      const coord = (geom as Point).getCoordinates()
      params.onUpdate(this.alarmData)
      overlay.setPosition(coord)
    }

    const hide = () => {
      params.onUpdate(null)
      overlay.setPosition(undefined)
    }

    const destroy = () => {
      if (clickKey) unByKey(clickKey)
      this.map.removeOverlay(overlay)
    }

    return { overlay, showAtAlarm, hide, destroy }
  }

  async planAndStartMulti(origins: LngLat[], destination: LngLat, d?: any) {
    this.stop()
    if (origins.length === 0) return
    this.pickStart = origins[0]
    this.pickEnd = destination
    this.originLngLat = origins[0]
    this.destinationLngLat = destination

    const updateRoute = async (preserveDistance: boolean) => {
      const { results, etaSeconds, metrics } = await this.fetchRoutesAndEta(origins, destination)
      this.routeEtaSecondsMulti = etaSeconds

      // 路径数据和（临时）警情位置
      useDispatchStore().setDispatch({
        ...d,
        navPathPlanData: {
          [destination.join(',').toString()]: results,
        },
        alarmData: {
          ...d?.alarmData,
          gisX: destination[0],
          gisY: destination[1],
        },
      })

      this.renderRouteMulti(results, metrics, preserveDistance)
    }

    await updateRoute(false)

    if (this.options.refreshMs && this.options.refreshMs > 0) {
      this.timerId = window.setInterval(() => {
        void updateRoute(true)
      }, this.options.refreshMs)
    }
  }

  /**
   * 批量获取驾车路线 + ETA + 距离指标，不渲染、不写 dispatch store。
   * 仅调用一次 multiWaypoint（多起点单终点）接口，返回路径 geometry、TMC 路况、ETA、距离指标。
   * 供 planAndStartMulti 及警情定位路径规划共用。
   */
  async fetchRoutesAndEta(
    origins: LngLat[],
    destination: LngLat,
  ): Promise<{
    results: AmapDrivingResult[]
    etaSeconds: number[]
    metrics: RouteMetrics[]
  }> {
    console.info('[alarm-message] 批量获取驾车路线 + ETA + 距离指标：', { origins, destination })
    const routes = await multiWaypoint({
      origins: origins.map(toRouteProxyLngLatString),
      destinations: [toRouteProxyLngLatString(destination)],
      // strategy: 11,
    })

    if (!Array.isArray(routes) || routes.length === 0) {
      throw new Error('未获取到可用路线')
    }
    // 单起点场景服务端要求重复传参，返回两条，取第一条。
    const effectiveRoutes = origins.length === 1 ? routes.slice(0, 1) : routes
    if (effectiveRoutes.length !== origins.length) {
      throw new Error('路径规划返回数量与车辆数量不一致')
    }

    const results = effectiveRoutes.map(toDrivingResult)
    const etaSeconds = effectiveRoutes.map((r) => {
      const plan = r.routes?.[0]
      const s = Number(plan?.totalTime)
      if (!Number.isFinite(s) || s <= 0) {
        throw new Error('预计到达时间无效')
      }
      return s
    })
    const metrics = await Promise.all(results.map((r) => this.routeMetricsWorker.compute(r.fullPath)))
    return { results, etaSeconds, metrics }
  }

  /** 单个起点请求多方案：strategy=11 返回的每条候选路线独立归一，避免把不同方案首尾拼接。 */
  async fetchRouteAlternatives(origin: LngLat, destination: LngLat): Promise<RouteAlternative[]> {
    let results: AmapDrivingResult[] = []
    try {
      results = await fetchDrivingRoutes({ origin, destination, extensions: 'all' })
    } catch (error) {
      console.warn('[route] 候选路线获取失败，尝试多起点接口兜底', error)
      results = []
    }
    let choices = selectRouteAlternatives(results)
    if (!choices.length) {
      // 代理不支持多策略时复用现有多起点接口，至少返回一条默认可用路线。
      const fallback = await this.fetchRoutesAndEta([origin], destination)
      choices = selectRouteAlternatives(fallback.results)
    }
    if (!choices.length) throw new Error('高德未返回可用候选路线')
    return Promise.all(
      choices.map(async (choice) => ({
        ...choice,
        etaSeconds: choice.result.durationSeconds,
        metrics: await this.routeMetricsWorker.compute(choice.result.fullPath),
      })),
    )
  }

  renderRouteAlternatives(stations: StationRouteAlternatives[], fitView = false) {
    const selected = stations.map(getSelectedRoute).filter((route): route is RouteAlternative => !!route)
    // 直接保留每条路线生成的要素；VectorSource.getFeatures() 不保证返回顺序。
    const featuresByRoute = this.renderRoutesOnly(
      selected.map((route) => route.result),
      fitView,
    )
    const source = this.routeLayer!.getSource()!
    const allSelectedFeatures = featuresByRoute.flat()
    const highlightedFeatures = new Set<Feature<LineString>>()
    let routeIndex = 0
    stations.forEach((station) => {
      const active = getSelectedRoute(station)
      if (!active) return
      const routeFeatures = featuresByRoute[routeIndex++]
      if (station.manualSelected) {
        routeFeatures.forEach((feature) => {
          const status = (feature.get('tmcStatus') ?? 'unknown') as AmapTmcStatus
          feature.setStyle(createSelectedTmcLineStyle(status, 6))
          highlightedFeatures.add(feature)
        })
      }
    })

    const inactiveFeatures: Feature<LineString>[] = []
    stations.forEach((station) => {
      const active = getSelectedRoute(station)
      station.alternatives
        .filter((route) => route !== active)
        .forEach((route) => {
          buildTmcFeatures(route.result.tmcs).forEach((feature) => {
            const status = (feature.get('tmcStatus') ?? 'unknown') as AmapTmcStatus
            const original = getStyle('tmcLine', { status, width: 6 })
            // 必须克隆缓存样式，避免将选中路线一起改成半透明。
            const styles = (Array.isArray(original) ? original : [original]).map((style) => {
              const copy = style.clone()
              const stroke = copy.getStroke()
              const color = stroke?.getColor()
              if (stroke && color) {
                const rgba = asArray(color as string | number[]).slice()
                rgba[3] = (rgba[3] ?? 1) * 0.3 //路线透明度，0~1，0为全透明，1为不透明
                stroke.setColor(rgba)
              }
              copy.setZIndex((copy.getZIndex() ?? 0) - 10)
              return copy
            })
            feature.setStyle(styles)
            inactiveFeatures.push(feature)
          })
        })
    })

    // 临时注释：同图层内按 未选候选 → 默认选中(白描边) → 点击选中(荧光蓝) 顺序加入，点击路线始终置顶。
    // const clickedSet = new Set(clickedFeatures);
    // source.clear();
    // inactiveFeatures.forEach((feature) => source.addFeature(feature));
    // allSelectedFeatures.forEach((feature) => {
    //   if (!clickedSet.has(feature)) source.addFeature(feature);
    // });
    // clickedFeatures.forEach((feature) => source.addFeature(feature));

    // 无高亮时保持原顺序：未选候选（半透明）先加入，选中路线（白描边）后加入，自然置于上层。
    source.clear()
    inactiveFeatures.forEach((feature) => source.addFeature(feature))
    allSelectedFeatures.forEach((feature) => {
      if (!highlightedFeatures.has(feature)) source.addFeature(feature)
    })
    highlightedFeatures.forEach((feature) => source.addFeature(feature))
  }

  /**
   * 仅渲染路线（TMC 路况彩线）并适配视图，不启动车辆动画。
   * 供 renderRouteMulti 及警情定位路径渲染共用，按输入路线顺序返回各路线的要素。
   */
  renderRoutesOnly(results: AmapDrivingResult[], fitView = true) {
    this.ensureLayers()
    const source = this.routeLayer!.getSource()!
    source.clear()

    let allCoords: number[][] = []

    const projectedPaths: number[][][] = []
    const featuresByRoute: Feature<LineString>[][] = []
    results.forEach((result) => {
      const tmcFeatures = buildTmcFeatures(result.tmcs)
      featuresByRoute.push(tmcFeatures)
      for (const f of tmcFeatures) {
        const status = (f.get('tmcStatus') ?? 'unknown') as AmapTmcStatus
        f.setStyle(getStyle('tmcLine', { status, width: 6 }))
        source.addFeature(f)
      }
      const projectedPath = result.fullPath.map((p) => olProj.fromLonLat(p))
      projectedPaths.push(projectedPath)
      allCoords = allCoords.concat(projectedPath)
    })
    this.renderRouteArrows(projectedPaths)

    if (fitView && allCoords.length >= 2) {
      const extent = new LineString(allCoords).getExtent()
      this.map.getView().fit(extent, { padding: [100, 380, 180, 150], duration: 300 })
    }
    return featuresByRoute
  }

  private renderRouteArrows(paths: number[][][]) {
    const source = this.routeArrowLayer!.getSource()!
    source.clear()
    source.addFeature(createRouteDirectionOverlay(paths))
  }

  /** 清空路线图层（不停止动画定时器等其它状态），供点位移除时调用 */
  clearRoutes() {
    this.routeLayer?.getSource()?.clear()
    this.routeArrowLayer?.getSource()?.clear()
    this.routeProgressLayer?.getSource()?.clear()
    this.vehicleLayer?.getSource()?.clear()
    this.clearRouteVideoCheckpoints()
    this.routeProjectedCoordsMulti = []
    this.routeDistancesMulti = []
    this.routeMetricsMulti = []
    this.routeEtaSecondsMulti = []
    this.vehicleFeatures = []
    this.extraVehicles = []
    this.routeVehicleGroups = []
    this.clearVehicleLabels()
    this.routeProgressFeatures = []
    this.currentDistances = []
    this.lastVehicleRotations = []
    this.lastRouteResults = []
    this.lastRouteMetrics = []
  }

  /** 每条路线首点位于出发约 15 秒处，剩余名额在合并后的后续路段上等距分布。 */
  setRouteVideoCheckpoints(
    results: AmapDrivingResult[],
    metrics: RouteMetrics[],
    onDue: (event: RouteVideoCheckpointEvent) => void,
    preservePlaybackState = false,
  ) {
    this.ensureLayers()
    // 首次调派清空历史；只有二次调派扩展路线网络时才继承已播放状态。
    this.clearRouteVideoCheckpoints(!preservePlaybackState)
    this.checkpointDueHandler = onDue
    const source = this.checkpointLayer!.getSource()!
    const networkChunks: RouteNetworkChunk[] = []
    const firstChunks: RouteNetworkChunk[] = []
    const firstDistances = new globalThis.Map<number, number>()

    results.forEach((result, routeIndex) => {
      const coords = result.fullPath.map((point) => olProj.fromLonLat(point))
      const distances = metrics[routeIndex]?.distanceIndexMeters ?? []
      const total = distances[distances.length - 1] ?? 0
      if (coords.length < 2 || distances.length !== coords.length || total <= 0) return

      const speed =
        Number.isFinite(result.durationSeconds) && result.durationSeconds > 0
          ? computeEtaSpeedMps(total, result.durationSeconds)
          : computeSpeedMps(total, this.options)
      const firstDistance = Math.min(total, speed * ROUTE_VIDEO_FIRST_CHECKPOINT_SECONDS)
      const first = interpolateOnLine(coords, distances, firstDistance)
      if (first.point) {
        firstDistances.set(routeIndex, firstDistance)
        const sharedFirst = firstChunks.find(
          (chunk) =>
            Math.hypot(chunk.point[0] - first.point![0], chunk.point[1] - first.point![1]) <=
              ROUTE_NETWORK_MERGE_TOLERANCE_METERS &&
            directionDifference(chunk.bearing, first.bearing) <= ROUTE_NETWORK_DIRECTION_TOLERANCE_RAD,
        )
        if (sharedFirst) sharedFirst.arrivals.set(routeIndex, firstDistance)
        else
          firstChunks.push({
            point: first.point,
            bearing: first.bearing,
            length: 0,
            arrivals: new globalThis.Map([[routeIndex, firstDistance]]),
          })
      }

      for (let startDistance = 0; startDistance < total; startDistance += ROUTE_NETWORK_SAMPLE_METERS) {
        const endDistance = Math.min(total, startDistance + ROUTE_NETWORK_SAMPLE_METERS)
        const midpointDistance = (startDistance + endDistance) / 2
        const { point, bearing } = interpolateOnLine(coords, distances, midpointDistance)
        if (!point) continue

        // 允许不同路线的折点采样位置略有错位；距离和方向都接近即视为同一公共道路段。
        const mergedChunk = networkChunks.find(
          (chunk) =>
            !chunk.arrivals.has(routeIndex) &&
            Math.hypot(chunk.point[0] - point[0], chunk.point[1] - point[1]) <= ROUTE_NETWORK_MERGE_TOLERANCE_METERS &&
            directionDifference(chunk.bearing, bearing) <= ROUTE_NETWORK_DIRECTION_TOLERANCE_RAD,
        )
        if (mergedChunk) {
          mergedChunk.arrivals.set(routeIndex, midpointDistance)
        } else {
          networkChunks.push({
            point,
            bearing,
            length: endDistance - startDistance,
            arrivals: new globalThis.Map([[routeIndex, midpointDistance]]),
          })
        }
      }
    })

    // 后续点不能落在任何关联路线的首点之前，也避免紧贴首点重复生成。
    const remainingChunks = networkChunks.filter(
      (chunk) =>
        Array.from(chunk.arrivals).every(
          ([routeIndex, distance]) => distance > (firstDistances.get(routeIndex) ?? 0) + ROUTE_NETWORK_SAMPLE_METERS,
        ) &&
        !firstChunks.some(
          (first) =>
            Math.hypot(chunk.point[0] - first.point[0], chunk.point[1] - first.point[1]) <=
            ROUTE_NETWORK_MERGE_TOLERANCE_METERS,
        ),
    )
    const networkLength = remainingChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const checkpointCount = Math.max(ROUTE_VIDEO_CHECKPOINT_COUNT, firstChunks.length)
    const remainingCount = checkpointCount - firstChunks.length
    const selectedChunks: RouteNetworkChunk[] = [...firstChunks]
    for (let checkpointIndex = 0; checkpointIndex < remainingCount && networkLength > 0; checkpointIndex++) {
      const targetLength = (networkLength * (checkpointIndex + 0.5)) / remainingCount
      let accumulated = 0
      const chunk =
        remainingChunks.find((candidate) => {
          accumulated += candidate.length
          return accumulated >= targetLength
        }) ?? remainingChunks[remainingChunks.length - 1]
      if (!selectedChunks.includes(chunk)) selectedChunks.push(chunk)
    }
    for (const chunk of remainingChunks) {
      if (selectedChunks.length >= checkpointCount) break
      if (!selectedChunks.includes(chunk)) selectedChunks.push(chunk)
    }

    // 等距结果极端情况下可能只落在一种路段上；强制保证合并前和合并后的道路均有点。
    const ensureChunkCategory = (shared: boolean) => {
      if (selectedChunks.some((chunk) => chunk.arrivals.size > 1 === shared)) return
      const candidate = remainingChunks.find((chunk) => chunk.arrivals.size > 1 === shared)
      if (!candidate) return
      const replaceIndex = selectedChunks.findIndex(
        (chunk, index) =>
          index >= firstChunks.length &&
          selectedChunks.filter((item) => item.arrivals.size > 1 === chunk.arrivals.size > 1).length > 1,
      )
      if (replaceIndex >= 0) selectedChunks[replaceIndex] = candidate
    }
    ensureChunkCategory(false)
    ensureChunkCategory(true)

    selectedChunks.forEach((chunk, checkpointIndex) => {
      // 二次调派重建点位时：已经触发过的视频，以及已有车辆已经驶过的位置，
      // 均直接继承为 played，不能在下一帧重新触发。
      const alreadyConsumed =
        preservePlaybackState &&
        (this.isCheckpointConsumed(chunk.point) ||
          Array.from(chunk.arrivals).some(
            ([routeIndex, arrivalDistance]) => (this.currentDistances[routeIndex] ?? 0) >= arrivalDistance,
          ))
      const status: RouteVideoCheckpointStatus = alreadyConsumed ? 'played' : 'pending'
      const feature = new Feature({ geometry: new Point(chunk.point) })
      feature.setProperties({
        routeVideoCheckpoint: true,
        checkpointIndex,
        sharedRouteSegment: chunk.arrivals.size > 1,
        status,
      })
      feature.setStyle(createRouteVideoCheckpointStyle(status))
      source.addFeature(feature)
      this.checkpointFeatures.push(feature)
      this.checkpointArrivals.push(chunk.arrivals)
    })
    console.info('[route-video-checkpoints] 全局点位生成完成', {
      routeCount: results.length,
      networkLengthMeters: Math.round(networkLength),
      checkpointCount: this.checkpointFeatures.length,
      beforeMergeCount: this.checkpointArrivals.filter((arrivals) => arrivals.size === 1).length,
      afterMergeCount: this.checkpointArrivals.filter((arrivals) => arrivals.size > 1).length,
    })
  }

  setRouteVideoCheckpointStatus(checkpointIndex: number, status: RouteVideoCheckpointStatus) {
    const feature = this.checkpointFeatures[checkpointIndex]
    if (!feature) return
    feature.set('status', status)
    feature.setStyle(createRouteVideoCheckpointStyle(status))
  }

  private isCheckpointConsumed(point: number[]): boolean {
    return this.consumedCheckpointPoints.some(
      (consumedPoint) =>
        Math.hypot(consumedPoint[0] - point[0], consumedPoint[1] - point[1]) <= ROUTE_NETWORK_MERGE_TOLERANCE_METERS,
    )
  }

  private rememberCheckpointConsumed(point: number[]) {
    if (!this.isCheckpointConsumed(point)) {
      this.consumedCheckpointPoints.push([...point])
    }
  }

  clearRouteVideoCheckpoints(clearPlaybackHistory = true) {
    this.checkpointLayer?.getSource()?.clear()
    this.checkpointFeatures = []
    this.checkpointArrivals = []
    this.checkpointDueHandler = null
    if (clearPlaybackHistory) {
      this.consumedCheckpointPoints = []
    }
  }

  /**
   * 对已规划路线启动沿路线的车辆模拟动画（内部走 renderRouteMulti 全套：
   * 重渲染路线 + 创建车辆 marker + 匀速行进到终点）。
   * etaSeconds 为各路线的预估到达秒数（fetchRoutesAndEta 返回的 etaSeconds），
   * 同时用于计算动画速度（路线距离 / ETA）和车顶倒计时。
   * fitView 为 false 时只重渲染路线、不再 fit 全路线 extent，供外部已自行定位视野后调用。
   * 供模拟调派等外部演示场景在 renderRoutesOnly 之后复用。
   */
  startRouteVehicleAnimation(
    results: AmapDrivingResult[],
    metrics: RouteMetrics[],
    etaSeconds: number[] = [],
    fitView = true,
  ) {
    if (!Array.isArray(results) || !results.length) return
    this.routeEtaSecondsMulti = results.map((result, index) => {
      const eta = Number(etaSeconds[index])
      return Number.isFinite(eta) && eta > 0 ? eta : result.durationSeconds
    })
    this.renderRouteMulti(results, metrics, false, fitView)
  }

  /** 当前已规划路线数量（二次调派判断队站是否已有路径用） */
  getRouteCount(): number {
    return this.routeProjectedCoordsMulti.length
  }

  /**
   * 追加渲染单条路线（TMC 路况彩线），不清空已有路线。
   * 供二次调派新增队站时，在已有路线基础上叠加新路线。
   */
  appendRouteOnly(result: AmapDrivingResult, fitView = true) {
    this.ensureLayers()
    const source = this.routeLayer!.getSource()!
    const tmcFeatures = buildTmcFeatures(result.tmcs)
    for (const f of tmcFeatures) {
      const status = (f.get('tmcStatus') ?? 'unknown') as AmapTmcStatus
      f.setStyle(getStyle('tmcLine', { status, width: 6 }))
      source.addFeature(f)
    }
    // 新路线加入后，基于当前完整路线集合统一重排箭头，避免合流段重复叠加。
    const arrowRoutes = (this.lastRouteResults.length ? this.lastRouteResults : [result]).map((route) =>
      route.fullPath.map((point) => olProj.fromLonLat(point)),
    )
    this.renderRouteArrows(arrowRoutes)
    if (fitView) {
      const allCoords = result.fullPath.map((p) => olProj.fromLonLat(p))
      if (allCoords.length >= 2) {
        const extent = new LineString(allCoords).getExtent()
        this.map.getView().fit(extent, { padding: [40, 40, 40, 40], duration: 300 })
      }
    }
  }

  /**
   * 二次调派：新增一条队站路线并创建首车。
   * 规划新起点→终点的路线，追加到内部路线数组、渲染上图、创建首车 marker，
   * 然后以 preserveDistance=true 重启动画（已有车辆位置保持不变）。
   * @returns 新路线在内部数组中的 routeIndex 及路线数据
   */
  async addRoute(
    origin: LngLat,
    destination: LngLat,
    selectedRoute?: RouteAlternative,
  ): Promise<{
    routeIndex: number
    result: AmapDrivingResult
    metrics: RouteMetrics
    etaSeconds: number
  }> {
    this.ensureLayers()
    const { results, etaSeconds, metrics } = selectedRoute
      ? { results: [selectedRoute.result], etaSeconds: [selectedRoute.etaSeconds], metrics: [selectedRoute.metrics] }
      : await this.fetchRoutesAndEta([origin], destination)
    const result = results[0]
    const metrics0 = metrics[0]
    const eta = etaSeconds[0]

    const routeIndex = this.routeProjectedCoordsMulti.length
    this.routeProjectedCoordsMulti.push(result.fullPath.map((p) => olProj.fromLonLat(p)))
    this.routeDistancesMulti.push(metrics0.distanceIndexMeters ?? [])
    this.routeMetricsMulti.push(metrics0)
    this.routeEtaSecondsMulti.push(eta)
    this.lastRouteResults = [...this.lastRouteResults, result]
    this.lastRouteMetrics = [...this.lastRouteMetrics, metrics0]

    // 渲染新路线（不清空已有路线）
    this.appendRouteOnly(result, true)

    // 新路线首车
    const vehicleSource = this.vehicleLayer!.getSource()!
    const vehicle = new Feature({ geometry: new Point([0, 0]) })
    vehicle.setProperties({
      dispatchRouteIndex: routeIndex,
      dispatchDetailsExpanded: false,
    })
    this.vehicleFeatures.push(vehicle)
    sourceAddOnce(vehicleSource, vehicle)

    // 新路线进度线
    const progressSource = this.routeProgressLayer!.getSource()!
    const progressFeature = new Feature({ geometry: new LineString([]) })
    progressFeature.setStyle(createPassedRouteStyle())
    this.routeProgressFeatures.push(progressFeature)
    sourceAddOnce(progressSource, progressFeature)

    this.currentDistances.push(0)
    this.lastVehicleRotations.push(null)

    // 追加路线后重建全局监控点（包含新路线与已有路线的重合段）
    if (this.checkpointDueHandler) {
      this.setRouteVideoCheckpoints(this.lastRouteResults, this.lastRouteMetrics, this.checkpointDueHandler, true)
      // 监控点集合已按新网络整体重排，索引含义变化；每车索引记录可清空，
      // 但全局播放历史由 setRouteVideoCheckpoints 按空间位置和车辆进度继承。
      this.extraVehicles.forEach((v) => v.firedCheckpoints.clear())
    }

    // 以保留距离模式重启动画：已有车辆保持当前位置，新路线首车从队站起点出发
    this.startVehicleAnimationMulti(true)

    return { routeIndex, result, metrics: metrics0, etaSeconds: eta }
  }

  /**
   * 二次调派：在已有队站路线上追加一辆车（同队站再次调派）。
   * 新车辆从该路线队站起点（distance=0）出发，按该路线 ETA 速度独立运行。
   * @returns 新建的车辆 feature
   */
  addVehicleToRoute(routeIndex: number, vehicles: RouteDispatchVehicleInfo[] = []): Feature<Point> {
    if (routeIndex < 0 || routeIndex >= this.routeProjectedCoordsMulti.length) {
      throw new Error(`[AmapRealtimeNav] addVehicleToRoute: 无效 routeIndex ${routeIndex}`)
    }
    const vehicleSource = this.vehicleLayer!.getSource()!
    const feature = new Feature({ geometry: new Point([0, 0]) })
    feature.setProperties({
      dispatchRouteIndex: routeIndex,
      dispatchDetailsExpanded: false,
      // 每批追加车辆保留自己的详情，避免复用首批或后续批次的信息。
      dispatchVehicles: this.dedupeRouteVehicles(vehicles),
    })
    this.extraVehicles.push({
      feature,
      routeIndex,
      currentDistance: 0,
      lastRotation: null,
      firedCheckpoints: new Set<number>(),
    })
    sourceAddOnce(vehicleSource, feature)
    // 始终以保留距离模式重启循环：已有车辆保持当前位置，
    // 新车辆从队站起点（currentDistance=0）按该路线 ETA 速度出发。
    this.startVehicleAnimationMulti(true)
    return feature
  }

  setRouteVehicleGroups(groups: RouteDispatchVehicleInfo[][]) {
    this.routeVehicleGroups = groups.map((vehicles) => this.dedupeRouteVehicles(vehicles))
    this.routeVehicleGroups.forEach((_, routeIndex) => this.refreshRouteVehicleLabel(routeIndex))
  }

  setRouteVehicles(routeIndex: number, vehicles: RouteDispatchVehicleInfo[]) {
    this.routeVehicleGroups[routeIndex] = this.dedupeRouteVehicles(vehicles)
    this.refreshRouteVehicleLabel(routeIndex)
  }

  addRouteVehicle(routeIndex: number, vehicle: RouteDispatchVehicleInfo) {
    this.setRouteVehicles(routeIndex, [...(this.routeVehicleGroups[routeIndex] ?? []), vehicle])
  }

  private dedupeRouteVehicles(vehicles: RouteDispatchVehicleInfo[]) {
    const seen = new Set<string>()
    return vehicles.filter((vehicle) => {
      const vehicleId = String(vehicle.vehicleId ?? '').trim()
      if (!vehicleId || seen.has(vehicleId)) return false
      seen.add(vehicleId)
      return true
    })
  }

  private refreshRouteVehicleLabel(routeIndex: number, feature = this.vehicleFeatures[routeIndex]) {
    if (!feature) return
    const remainingSeconds = Number(feature.get('dispatchRemainingSeconds'))
    const remainingMeters = Number(feature.get('dispatchRemainingMeters'))
    const rotation = Number(feature.get('dispatchVehicleRotation'))
    const styleId = String(feature.get('dispatchVehicleStyleId') ?? `multi-${routeIndex}`)
    if (![remainingSeconds, remainingMeters, rotation].every(Number.isFinite)) return
    this.applyDispatchVehicleStyle(feature, routeIndex, remainingSeconds, remainingMeters, rotation, styleId)
  }

  private applyDispatchVehicleStyle(
    feature: Feature<Point>,
    routeIndex: number,
    remainingSeconds: number,
    remainingMeters: number,
    rotation: number,
    styleId: string,
  ) {
    const vehicles: RouteDispatchVehicleInfo[] =
      feature.get('dispatchVehicles') ?? this.routeVehicleGroups[routeIndex] ?? []
    const expanded = Boolean(feature.get('dispatchDetailsExpanded'))
    feature.setStyle(
      getStyle('vehicle', {
        src: this.options.vehicleIconSrc,
        rotation,
        scale: 0.65,
        countdownText: '',
        styleId,
      }),
    )
    let label = this.vehicleLabels.get(feature)
    if (!label) {
      label = createDispatchVehicleLabel(() => {
        feature.set('dispatchDetailsExpanded', !feature.get('dispatchDetailsExpanded'))
        this.refreshRouteVehicleLabel(routeIndex, feature)
      })
      this.vehicleLabels.set(feature, label)
      this.map.addOverlay(label.overlay)
    }
    label.update({
      elapsed: formatCountdownSeconds(Number(feature.get('dispatchElapsedSeconds')) || 0),
      eta: formatCountdownSeconds(remainingSeconds),
      distance: (remainingMeters / 1000).toFixed(1),
      expanded,
      vehicles: vehicles.map(
        (vehicle) => `${vehicle.plateNo?.trim() || '--'} | ${vehicle.vehicleTypeName?.trim() || '--'}`,
      ),
    })
    label.overlay.setPosition(feature.getGeometry()?.getCoordinates())
    feature.setProperties({
      dispatchRemainingSeconds: remainingSeconds,
      dispatchRemainingMeters: remainingMeters,
      dispatchVehicleRotation: rotation,
      dispatchVehicleStyleId: styleId,
    })
  }

  /**
   * 测试用：多起点 + 单终点路径规划并渲染路线（TMC 路况彩线），不启动车辆动画、不写 dispatch store。
   * 实例化时会挂载到 window.routesplanroad，供控制台直接调用。
   *
   * @param origins 多个起点坐标（WGS84 [lng, lat]）
   * @param destination 终点坐标（WGS84 [lng, lat]）
   * @returns 各起点到终点的路径规划结果
   */
  async routesplanroad(origins: LngLat[], destination: LngLat): Promise<AmapDrivingResult[]> {
    console.log('[routesplanroad] 开始执行', { origins, destination, amapKey: this.options.amapKey })
    if (!Array.isArray(origins) || origins.length === 0) {
      throw new Error('[routesplanroad] origins 不能为空')
    }
    if (!this.options.amapKey) {
      throw new Error('[routesplanroad] amapKey 未设置')
    }
    const { results, etaSeconds, metrics } = await this.fetchRoutesAndEta(origins, destination)
    console.log('[routesplanroad] 路径规划完成', {
      routeCount: results.length,
      etaSeconds,
      distances: metrics.map((m) => m.distanceIndexMeters?.[m.distanceIndexMeters.length - 1]),
    })
    this.renderRoutesOnly(results)
    console.log('[routesplanroad] 渲染完成')
    return results
  }

  private renderRouteMulti(
    results: AmapDrivingResult[],
    metrics: RouteMetrics[],
    preserveDistance: boolean,
    fitView = true,
  ) {
    // 先渲染路线（TMC 彩线 + 视图适配），再叠加车辆动画
    this.renderRoutesOnly(results, fitView)

    this.routeProjectedCoordsMulti = []
    this.routeDistancesMulti = []
    this.routeMetricsMulti = metrics
    this.lastRouteResults = results
    this.lastRouteMetrics = metrics

    results.forEach((result, index) => {
      const fullProjected = result.fullPath.map((p) => olProj.fromLonLat(p))
      this.routeProjectedCoordsMulti.push(fullProjected)
      this.routeDistancesMulti.push(metrics[index]?.distanceIndexMeters ?? [])
    })

    if (!preserveDistance) {
      this.lastVehicleRotations = results.map(() => null)
      this.currentDistances = results.map(() => 0)
    }

    this.navFinishedEmitted = false

    const vehicleSource = this.vehicleLayer!.getSource()!
    vehicleSource.clear()
    this.vehicleFeatures = []
    this.extraVehicles = []
    this.routeVehicleGroups = []
    this.clearVehicleLabels()
    this.ensureVehicles(vehicleSource, results.length)
    const progressSource = this.routeProgressLayer!.getSource()!
    progressSource.clear()
    this.routeProgressFeatures = []
    this.ensureRouteProgressFeatures(progressSource, results.length)
    this.startVehicleAnimationMulti(preserveDistance)
  }

  private ensureVehicles(source: VectorSource, count: number) {
    if (this.vehicleFeatures.length > count) {
      this.vehicleFeatures.splice(count)
    }
    while (this.vehicleFeatures.length < count) {
      this.vehicleFeatures.push(new Feature({ geometry: new Point([0, 0]) }))
    }
    for (let i = 0; i < count; i++) {
      this.vehicleFeatures[i].setProperties({
        dispatchRouteIndex: i,
        dispatchDetailsExpanded: false,
      })
      sourceAddOnce(source, this.vehicleFeatures[i])
    }
  }

  private ensureRouteProgressFeatures(source: VectorSource, count: number) {
    if (this.routeProgressFeatures.length > count) {
      this.routeProgressFeatures.splice(count)
    }
    while (this.routeProgressFeatures.length < count) {
      const feature = new Feature({ geometry: new LineString([]) })
      feature.setStyle(createPassedRouteStyle())
      this.routeProgressFeatures.push(feature)
    }
    for (let index = 0; index < count; index++) {
      ;(this.routeProgressFeatures[index].getGeometry() as LineString).setCoordinates([])
      sourceAddOnce(source, this.routeProgressFeatures[index])
    }
  }

  /**
   * 在指定路线上按目标距离更新车辆 marker 位置、朝向与倒计时样式。
   * 供首车与同路线追加车辆复用，避免动画 tick 内逻辑重复。
   * @returns 是否仍未到达终点（用于判断动画是否结束）
   */
  private applyVehicleMarker(
    vehicleFeature: Feature<Point>,
    routeIndex: number,
    targetDist: number,
    coords: number[][],
    dists: number[],
    total: number,
    lastRotationRef: { current: number | null },
    styleId: string,
  ): boolean {
    const { point, bearing } = interpolateOnLine(coords, dists, targetDist)
    if (point) {
      ;(vehicleFeature.getGeometry() as Point).setCoordinates(point)
      const offset = this.options.vehicleHeadingOffsetRad ?? Math.PI / 2
      const desiredRotation = -bearing + offset
      const rotation = normalizeAngleNear(desiredRotation, lastRotationRef.current)
      lastRotationRef.current = rotation
      const remainingMeters = Math.max(0, total - targetDist)
      const remainingSeconds = ((this.routeEtaSecondsMulti[routeIndex] ?? 0) * remainingMeters) / total
      // 使用每辆车自己的出发时钟，二次调派和动画重启不会重置已有车辆计时。
      const now = performance.now()
      let startedAt = vehicleFeature.get('dispatchStartedAt') as number | undefined
      if (startedAt === undefined) {
        startedAt = now
        vehicleFeature.set('dispatchStartedAt', startedAt)
      }
      if (!vehicleFeature.get('dispatchArrived')) {
        vehicleFeature.set('dispatchElapsedSeconds', Math.max(0, (now - startedAt) / 1000))
      }
      vehicleFeature.set('dispatchArrived', !(this.options.loop ?? false) && targetDist >= total)
      this.applyDispatchVehicleStyle(vehicleFeature, routeIndex, remainingSeconds, remainingMeters, rotation, styleId)
    }
    const loop = this.options.loop ?? false
    return loop || targetDist < total
  }

  private startVehicleAnimationMulti(preserveDistance: boolean) {
    if (this.vehicleFeatures.length === 0 && this.extraVehicles.length === 0) return
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    const now = performance.now()

    const loop = this.options.loop ?? false
    const speeds = this.routeDistancesMulti.map((dists, index) => {
      const total = dists[dists.length - 1] ?? 0
      const eta = this.routeEtaSecondsMulti[index]
      // 有真实 ETA 时按 ETA 计算匀速速度，使动画时长等于 ETA；否则回退到默认速度策略
      if (Number.isFinite(eta) && eta > 0) {
        return computeEtaSpeedMps(total, eta)
      }
      return computeSpeedMps(total, this.options)
    })
    const startingDistances = preserveDistance ? [...this.currentDistances] : speeds.map(() => 0)
    // 追加车辆的起始距离：保留距离模式下复用各自已行进距离，否则从队站起点（0）出发
    const extraStartingDistances = preserveDistance
      ? this.extraVehicles.map((v) => v.currentDistance)
      : this.extraVehicles.map(() => 0)

    if (preserveDistance) {
      this.animationStartTs = now
    } else {
      this.currentDistances = speeds.map(() => 0)
      this.animationStartTs = now
      this.lastVehicleRotations = speeds.map(() => null)
      this.navFinishedEmitted = false
      this.extraVehicles.forEach((v) => {
        v.currentDistance = 0
        v.lastRotation = null
      })
    }

    const tick = (ts: number) => {
      const elapsed = (ts - this.animationStartTs) / 1000
      let allFinished = true
      let reachedLastMile = false

      // 首车：每条路线一辆，驱动进度线与监控点触发
      this.vehicleFeatures.forEach((vehicleFeature, index) => {
        const speed = speeds[index]
        const dists = this.routeDistancesMulti[index]
        const coords = this.routeProjectedCoordsMulti[index]
        const metrics = this.routeMetricsMulti[index]
        const total = dists[dists.length - 1] ?? 0

        if (!total || !speed || coords.length < 2) return

        const rawDist = elapsed * speed + (startingDistances[index] ?? 0)
        const targetDist = loop ? rawDist % total : Math.min(rawDist, total)
        this.currentDistances[index] = targetDist
        const passedCoords = sliceLineAtDistance(coords, dists, targetDist)
        ;(this.routeProgressFeatures[index]?.getGeometry() as LineString | undefined)?.setCoordinates(passedCoords)

        this.checkpointArrivals.forEach((arrivals, checkpointIndex) => {
          const checkpointDistance = arrivals.get(index)
          const feature = this.checkpointFeatures[checkpointIndex]
          if (checkpointDistance === undefined) return
          if (!feature || feature.get('status') !== 'pending') return
          const secondsUntilArrival = Math.max(0, checkpointDistance - targetDist) / speed
          if (secondsUntilArrival > ROUTE_VIDEO_LEAD_SECONDS) return
          // 先标记为已派发，避免 requestAnimationFrame 重复入队；真正播放时由调用方改为黄色。
          feature.set('status', 'queued')
          const coordinate = (feature.getGeometry() as Point).getCoordinates()
          this.rememberCheckpointConsumed(coordinate)
          this.checkpointDueHandler?.({
            routeIndex: index,
            checkpointIndex,
            lngLat: olProj.toLonLat(coordinate) as LngLat,
            secondsUntilArrival,
          })
        })

        const lastRotationRef = { current: this.lastVehicleRotations[index] }
        const notFinished = this.applyVehicleMarker(
          vehicleFeature,
          index,
          targetDist,
          coords,
          dists,
          total,
          lastRotationRef,
          `multi-${index}`,
        )
        this.lastVehicleRotations[index] = lastRotationRef.current

        const lastMileStartDistance = metrics?.lastMileStartDistanceMeters ?? Math.max(0, total - 1000)
        if (!loop && targetDist >= lastMileStartDistance) {
          reachedLastMile = true
        }

        if (notFinished) {
          allFinished = false
        }
      })

      // 同路线追加车辆（二次调派同队站加车）：从队站起点按该路线 ETA 速度独立运行
      this.extraVehicles.forEach((extra, ei) => {
        const routeIndex = extra.routeIndex
        const speed = speeds[routeIndex]
        const dists = this.routeDistancesMulti[routeIndex]
        const coords = this.routeProjectedCoordsMulti[routeIndex]
        const total = dists[dists.length - 1] ?? 0
        if (!total || !speed || coords.length < 2) return

        const rawDist = elapsed * speed + (extraStartingDistances[ei] ?? 0)
        const targetDist = loop ? rawDist % total : Math.min(rawDist, total)
        extra.currentDistance = targetDist

        // 途径监控点检测：同一调派周期内一个点只播放一次。
        // firedCheckpoints 防止本车逐帧重复检查，全局 status 防止不同车辆重复播放。
        this.checkpointArrivals.forEach((arrivals, checkpointIndex) => {
          if (extra.firedCheckpoints.has(checkpointIndex)) return
          const checkpointDistance = arrivals.get(routeIndex)
          if (checkpointDistance === undefined) return
          const feature = this.checkpointFeatures[checkpointIndex]
          if (!feature || feature.get('status') !== 'pending') {
            extra.firedCheckpoints.add(checkpointIndex)
            return
          }
          const secondsUntilArrival = Math.max(0, checkpointDistance - targetDist) / speed
          if (secondsUntilArrival > ROUTE_VIDEO_LEAD_SECONDS) return
          extra.firedCheckpoints.add(checkpointIndex)
          feature.set('status', 'queued')
          const coordinate = (feature?.getGeometry() as Point | undefined)?.getCoordinates()
          if (!coordinate) return
          this.rememberCheckpointConsumed(coordinate)
          this.checkpointDueHandler?.({
            routeIndex,
            checkpointIndex,
            lngLat: olProj.toLonLat(coordinate) as LngLat,
            secondsUntilArrival,
            vehicleKey: `extra-${routeIndex}-${ei}`,
          })
        })

        const lastRotationRef = { current: extra.lastRotation }
        const notFinished = this.applyVehicleMarker(
          extra.feature,
          routeIndex,
          targetDist,
          coords,
          dists,
          total,
          lastRotationRef,
          `multi-extra-${routeIndex}-${ei}`,
        )
        extra.lastRotation = lastRotationRef.current

        if (notFinished) {
          allFinished = false
        }
      })

      if (reachedLastMile && !this.navFinishedEmitted) {
        this.navFinishedEmitted = true
        if (this.timerId) {
          window.clearInterval(this.timerId)
          this.timerId = null
        }
        // useTabsStore().setActiveTab(2);
      }

      if (allFinished) {
        this.rafId = null
      } else {
        this.rafId = window.requestAnimationFrame(tick)
      }
    }
    this.rafId = window.requestAnimationFrame(tick)
  }

  async planAndStart(origin: LngLat, destination: LngLat, d?: any) {
    this.stop()
    this.pickStart = origin
    this.pickEnd = destination
    this.originLngLat = origin
    this.destinationLngLat = destination

    const updateRoute = async (preserveDistance: boolean) => {
      // 调派阶段单车只跟踪选中的第一条候选（与 multiWaypoint 单起点取首条语义一致）。
      const results = await fetchDrivingRoutes({
        key: this.options.amapKey,
        origin,
        destination,
        extensions: 'all',
      })
      const result = results[0]
      if (!result) throw new Error('未获取到可用路线')
      ;[this.routeEtaSeconds] = await fetchVehicleArrivalTimes([origin], destination)
      const metrics = await this.routeMetricsWorker.compute(result.fullPath)
      // 路径数据和（临时）警情位置
      useDispatchStore().setDispatch({
        ...d,
        navPathPlanData: {
          [destination.join(',').toString()]: result,
        },
        alarmData: {
          ...d?.alarmData,
          gisX: destination[0],
          gisY: destination[1],
        },
      })

      this.renderRoute(result, metrics, preserveDistance)
    }

    await updateRoute(false)

    if (this.options.refreshMs && this.options.refreshMs > 0) {
      this.timerId = window.setInterval(() => {
        void updateRoute(true)
      }, this.options.refreshMs)
    }
  }

  private renderRoute(result: AmapDrivingResult, metrics: RouteMetrics, preserveDistance: boolean) {
    const source = this.routeLayer!.getSource()!
    source.clear()

    const tmcFeatures = buildTmcFeatures(result.tmcs)
    for (const f of tmcFeatures) {
      const status = (f.get('tmcStatus') ?? 'unknown') as AmapTmcStatus
      f.setStyle(getStyle('tmcLine', { status, width: 6 }))
      source.addFeature(f)
    }

    const fullProjected = result.fullPath.map((p) => olProj.fromLonLat(p))
    this.renderRouteArrows([fullProjected])
    this.routeProjectedCoords = fullProjected
    this.routeMetrics = metrics
    this.routeDistances = metrics.distanceIndexMeters
    this.lastVehicleRotation = null
    this.navFinishedEmitted = false

    if (fullProjected.length >= 2) {
      const extent = new LineString(fullProjected).getExtent()
      this.map.getView().fit(extent, { padding: [40, 40, 40, 40], duration: 300 })
    }

    const vehicleSource = this.vehicleLayer!.getSource()!
    vehicleSource.clear()
    this.ensureVehicle(vehicleSource)
    const progressSource = this.routeProgressLayer!.getSource()!
    progressSource.clear()
    this.ensureRouteProgressFeature(progressSource)
    this.startVehicleAnimation(preserveDistance)
  }

  private ensureVehicle(source: VectorSource) {
    if (!this.vehicleFeature) {
      this.vehicleFeature = new Feature({ geometry: new Point([0, 0]) })
    }
    sourceAddOnce(source, this.vehicleFeature)
  }

  private ensureRouteProgressFeature(source: VectorSource) {
    if (!this.routeProgressFeature) {
      this.routeProgressFeature = new Feature({ geometry: new LineString([]) })
      this.routeProgressFeature.setStyle(createPassedRouteStyle())
    }
    ;(this.routeProgressFeature.getGeometry() as LineString).setCoordinates([])
    sourceAddOnce(source, this.routeProgressFeature)
  }

  private startVehicleAnimation(preserveDistance: boolean) {
    if (!this.vehicleFeature) return
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    const now = performance.now()

    const total = this.routeDistances[this.routeDistances.length - 1] ?? 0
    if (!total || this.routeProjectedCoords.length < 2) return

    // 有真实 ETA 时按 ETA 计算匀速速度，使动画时长等于 ETA；否则回退到默认速度策略
    const speed =
      Number.isFinite(this.routeEtaSeconds) && this.routeEtaSeconds > 0
        ? computeEtaSpeedMps(total, this.routeEtaSeconds)
        : computeSpeedMps(total, this.options)

    if (preserveDistance) {
      this.animationStartTs = now - (this.currentDistance / speed) * 1000
    } else {
      this.currentDistance = 0
      this.animationStartTs = now
      this.lastVehicleRotation = null
      this.navFinishedEmitted = false
    }

    const loop = this.options.loop ?? false

    const tick = (ts: number) => {
      const elapsed = (ts - this.animationStartTs) / 1000
      const rawDist = elapsed * speed
      const targetDist = loop ? rawDist % total : Math.min(rawDist, total)
      this.currentDistance = targetDist
      const passedCoords = sliceLineAtDistance(this.routeProjectedCoords, this.routeDistances, targetDist)
      ;(this.routeProgressFeature?.getGeometry() as LineString | undefined)?.setCoordinates(passedCoords)
      const { point, bearing } = interpolateOnLine(this.routeProjectedCoords, this.routeDistances, targetDist)
      if (point) {
        ;(this.vehicleFeature!.getGeometry() as Point).setCoordinates(point)
        const offset = this.options.vehicleHeadingOffsetRad ?? Math.PI / 2
        const desiredRotation = -bearing + offset
        const rotation = normalizeAngleNear(desiredRotation, this.lastVehicleRotation)
        this.lastVehicleRotation = rotation
        const remainingMeters = Math.max(0, total - targetDist)
        const remainingSeconds = (this.routeEtaSeconds * remainingMeters) / total
        const countdownText = `剩余时间：${formatCountdownSeconds(remainingSeconds)}\n剩余距离：${(remainingMeters / 1000).toFixed(1)} 千米`
        this.vehicleFeature!.setStyle(
          getStyle('vehicle', {
            src: this.options.vehicleIconSrc,
            rotation,
            scale: 0.65,
            countdownText,
            styleId: 'single',
          }),
        )
      }
      const lastMileStartDistance = this.routeMetrics?.lastMileStartDistanceMeters ?? Math.max(0, total - 1000)
      if (!loop && targetDist >= lastMileStartDistance && !this.navFinishedEmitted) {
        this.navFinishedEmitted = true
        if (this.timerId) {
          window.clearInterval(this.timerId)
          this.timerId = null
        }
        // tabs切换地图模式
        // useTabsStore().setActiveTab(2);
      }
      if (!loop && targetDist >= total) {
        this.rafId = null
        return
      }
      this.rafId = window.requestAnimationFrame(tick)
    }
    this.rafId = window.requestAnimationFrame(tick)
  }
}

const sourceAddOnce = (source: VectorSource, feature: Feature) => {
  if (source.getFeatures().includes(feature)) return
  source.addFeature(feature)
}
