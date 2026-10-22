/*
 * @Description: 特殊地图模拟（临时演示模块）。
 *               假数据内聚于此，图上只按数据渲染，不做交互绘制。
 *               路径规划/渲染/车辆模拟复用 AmapRealtimeNav（与 dispatchMap 主流程同源），
 *               路线预览面板复用 DispatchRoutePreview.vue。
 * @FilePath: src\baseComponent\OpenlayersMap\specialMapMock.ts
 */
import type OlMap from 'ol/Map'
import { transform } from 'ol/proj'
import { Fill, Stroke, Style } from 'ol/style'
import { type LngLat, type AmapRealtimeNav } from '@/baseComponent/amap/useAmapTools'
import { getStyle, MAP_ICON_SRC } from '@/baseComponent/OpenlayersMap/style'
import { mountPointLayer, type PointLayerManager } from '@/baseComponent/OpenlayersMap/mountPointLayer'
import { mountPolygonLayer, type PolygonLayerManager } from '@/baseComponent/OpenlayersMap/mountPolygonLayer'
import { getSelectedRoute, type StationRouteAlternatives } from '@/baseComponent/amap/routeAlternatives'

/** 北京市中心经纬度 */
// @ts-expect-error TS6133: 引用处已注释，保留备用
const BEIJING_CENTER: LngLat = [116.4074, 39.9042]

/**
 * 特殊地图假数据：北京辖区多边形（EPSG:4326）、3 个固定起点、1 个终点。
 * 图上只按此数据渲染。
 */
const SPECIAL_MAP_MOCK_DATA = {
  jurisdiction: {
    type: 'Polygon',
    coordinates: [
      [
        [116.27008, 39.84081],
        [116.39508, 39.84081],
        [116.41071, 39.91906],
        [116.34821, 39.95031],
        [116.27008, 39.93469],
        [116.25446, 39.87219],
        [116.27008, 39.84081],
      ],
    ],
  } as GeoJSON.Polygon,
  starts: [
    {
      id: 'start-1',
      name: '起点1',
      lng: 116.30758,
      lat: 39.87606,
      plateNo: '京X5083',
      vehicleTypeName: '排涝车',
    },
    {
      id: 'start-2',
      name: '起点2',
      lng: 116.35758,
      lat: 39.85856,
      plateNo: '京X6182',
      vehicleTypeName: '抢险车',
    },
    {
      id: 'start-3',
      name: '起点3',
      lng: 116.34508,
      lat: 39.92106,
      plateNo: '京X1453',
      vehicleTypeName: '排涝车',
    },
  ] as Array<{ id: string; name: string; lng: number; lat: number; plateNo: string; vehicleTypeName: string }>,
  end: { id: 'end-1', name: '终点', lng: 116.33258, lat: 39.89606 },
}

export interface SpecialMapMock {
  /** 渲染假数据（辖区 + 起点 + 终点）并执行路径规划，返回候选路线供面板复用；进行中重复调用复用同一 promise */
  render: () => Promise<StationRouteAlternatives[]>
  /** 执行车辆模拟运行（沿选中路径从起点到终点）；未渲染/渲染中时先等渲染完成 */
  simulate: () => Promise<void>
  /** 清空特殊地图自身图层与 nav 路线/车辆 */
  clear: () => void
  destroy: () => void
  dispose: () => void
  getGeneration: () => number
  isCurrent: (generation: number) => boolean
}

/**
 * 创建特殊地图模拟实例。
 * 假数据固定内聚，图上仅根据数据渲染。
 * 路径渲染/车辆模拟复用 nav（AmapRealtimeNav），路线面板由 dispatchMap.vue 复用 DispatchRoutePreview.vue。
 */
export const createSpecialMapMock = (map: OlMap, nav: AmapRealtimeNav): SpecialMapMock => {
  let jurisdictionLayer: PolygonLayerManager<{ key: string }> | null = null
  let startLayer: PointLayerManager<{
    id: string
    name: string
    lng: number
    lat: number
    plateNo: string
    vehicleTypeName: string
  }> | null = null
  let endLayer: PointLayerManager<{ id: string; name: string; lng: number; lat: number }> | null = null
  let routeStations: StationRouteAlternatives[] = []
  /** 进行中的渲染任务：diaopaimoshi/diaopaitezai 同批到达时 simulate 等它完成 */
  let renderPromise: Promise<StationRouteAlternatives[]> | null = null

  let generation = 0
  let destroyed = false
  const isCurrent = (taskGeneration: number) => !destroyed && taskGeneration === generation

  const doRender = async (taskGeneration: number): Promise<StationRouteAlternatives[]> => {
    if (!isCurrent(taskGeneration)) return []

    // 1. 辖区多边形
    jurisdictionLayer = mountPolygonLayer<{ key: string }>({
      map,
      items: [{ key: 'beijing' }],
      visible: true,
      className: 'special_map_jurisdiction',
      zIndex: 40,
      keyGetter: (item) => item.key,
      geometryGetter: () => SPECIAL_MAP_MOCK_DATA.jurisdiction,
      styleGetter: () =>
        new Style({
          fill: new Fill({ color: 'rgba(37, 99, 235, 0.12)' }),
          stroke: new Stroke({ color: '#2563eb', width: 2 }),
        }),
    })

    // 2. 起点（poi.png）
    startLayer = mountPointLayer({
      map,
      items: SPECIAL_MAP_MOCK_DATA.starts,
      visible: true,
      className: 'special_map_starts',
      zIndex: 60,
      keyGetter: (item) => item.id,
      coordinateGetter: (item) => [item.lng, item.lat],
      styleGetter: () => getStyle('point'),
    })

    // 3. 终点（alarm.png）
    endLayer = mountPointLayer({
      map,
      items: [SPECIAL_MAP_MOCK_DATA.end],
      visible: true,
      className: 'special_map_end',
      zIndex: 61,
      keyGetter: (item) => item.id,
      coordinateGetter: (item) => [item.lng, item.lat],
      styleGetter: () => getStyle('icon', { iconSrc: MAP_ICON_SRC.endPoint }),
    })

    // 4. 定位到终点
    map.getView().animate({
      center: transform(
        [SPECIAL_MAP_MOCK_DATA.end.lng, SPECIAL_MAP_MOCK_DATA.end.lat],
        'EPSG:4326',
        map.getView().getProjection(),
      ),
      zoom: 12,
      duration: 400,
    })

    // 5. 逐起点请求候选路线（复用 nav.fetchRouteAlternatives）
    const destination: LngLat = [SPECIAL_MAP_MOCK_DATA.end.lng, SPECIAL_MAP_MOCK_DATA.end.lat]
    const stations = await Promise.all(
      SPECIAL_MAP_MOCK_DATA.starts.map(async (start): Promise<StationRouteAlternatives> => {
        const station: StationRouteAlternatives = {
          stationId: start.id,
          stationName: start.name,
          origin: [start.lng, start.lat],
          destination,
          alternatives: [],
          selectedId: '',
        }
        try {
          const alternatives = await nav.fetchRouteAlternatives([start.lng, start.lat], destination)
          if (!isCurrent(taskGeneration)) return station
          station.alternatives = alternatives
          station.selectedId = station.alternatives[0]?.id ?? ''
        } catch (error) {
          if (!isCurrent(taskGeneration)) return station
          station.error = '暂未获取到可用路线'
          console.warn(`[special-map] 起点${start.name}路径规划失败`, error)
        }
        return station
      }),
    )
    if (!isCurrent(taskGeneration)) return []
    routeStations = stations

    // 6. 渲染所有候选路线（复用 nav.renderRouteAlternatives，含 TMC/方向箭头/半透明候选）
    nav.renderRouteAlternatives(stations, true)

    return stations
  }

  /** 对外渲染入口：渲染中重复调用复用同一 promise，避免并发重绘 */
  const render = (): Promise<StationRouteAlternatives[]> => {
    if (destroyed) return Promise.resolve([])
    if (renderPromise) return renderPromise
    clear()
    const task = doRender(generation).finally(() => {
      if (renderPromise === task) renderPromise = null
    })
    renderPromise = task
    return task
  }

  const simulate = async (): Promise<void> => {
    // 渲染中先等渲染完成；从未渲染过（只发 diaopaitezai）则先渲染再模拟
    if (destroyed) return
    const task = renderPromise ?? (!routeStations.length ? render() : null)
    const taskGeneration = generation
    if (task) await task
    if (!isCurrent(taskGeneration)) return
    // 只取有选中路线的起点，避免部分规划失败时车辆组数量与路线数量不匹配
    const validStations = routeStations.filter((station) =>
      station.alternatives.some((route) => route.id === station.selectedId),
    )
    const selected = validStations.map(getSelectedRoute).filter((route): route is NonNullable<typeof route> => !!route)
    if (!selected.length) {
      console.warn('[special-map] 尚无选中路线，无法模拟')
      return
    }
    // 收起面板备选，只渲染选中路线（与 dispatchMap 模拟调派流程一致）
    const results = selected.map((route) => route.result)
    const metrics = selected.map((route) => route.metrics)
    const etaSeconds = selected.map((route) => route.etaSeconds)
    nav.renderRoutesOnly(results, false)
    if (!isCurrent(taskGeneration)) return
    nav.startRouteVehicleAnimation(results, metrics, etaSeconds, false)
    if (!isCurrent(taskGeneration)) return
    // 车辆组与选中路线严格一一对应：只为规划成功的起点创建车辆
    nav.setRouteVehicleGroups(
      validStations.map((station) => {
        const start = SPECIAL_MAP_MOCK_DATA.starts.find((s) => s.id === station.stationId)
        return [
          {
            vehicleId: `vehicle-${station.stationId}`,
            plateNo: start?.plateNo,
            vehicleTypeName: start?.vehicleTypeName,
          },
        ]
      }),
    )
  }

  const clear = (): void => {
    generation += 1
    renderPromise = null
    routeStations = []
    jurisdictionLayer?.destroy()
    jurisdictionLayer = null
    startLayer?.destroy()
    startLayer = null
    endLayer?.destroy()
    endLayer = null
    // 清空 nav 的路线/车辆层
    nav.clearRoutes()
  }

  const destroy = () => {
    if (destroyed) return
    destroyed = true
    clear()
  }

  return { render, simulate, clear, destroy, dispose: destroy, getGeneration: () => generation, isCurrent }
}
