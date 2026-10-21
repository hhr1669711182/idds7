import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VectorSource from 'ol/source/Vector'
import VectorLayer from 'ol/layer/Vector'
import Point from 'ol/geom/Point'
import { fromLonLat } from 'ol/proj'
import { Style } from 'ol/style'
import View from 'ol/View'
import { TrackingController } from '@/controller/core/business/TrackingController'
import { AddressRobotController } from '@/controller/core/business/AddressRobotController'
import { createVehicleManager } from '@/baseComponent/OpenlayersMap/VehicleRenderer'
import { AddressRobotRenderer } from '@/baseComponent/OpenlayersMap/AddressRobotRenderer'
import { createDispatchT1InitialState } from '@/store/useDispatchT1Store'
import type { BusinessMapPort } from '@/controller/core/protocol/BusinessMapPort'
import type { AddressRobotGisSearchData } from '@/controller/core/protocol/BusinessProtocol'
import type { CarLocationBatch } from '@/controller/core/protocol/LegacyMessageProtocol'
import type { GenericController } from '@/controller/core/generic'
import { EventBus } from '@/utils/mitt'

vi.mock('@/baseComponent/OpenlayersMap/style', () => ({
  getStyle: () => new Style(),
  MAP_ICON_SRC: { car: 'car.png' },
}))

const createPort = (): BusinessMapPort => ({
  ready: true,
  view: {
    locate: vi.fn(),
    layerToggle: vi.fn(),
    layerRefresh: vi.fn(),
    simulateClick: vi.fn(),
    overlay3D: vi.fn(),
    fitBounds: vi.fn(),
    poiLocation: vi.fn(),
  },
  geometry: {
    addMarker: vi.fn(),
    addText: vi.fn(),
    drawPolygon: vi.fn(),
    drawLine: vi.fn(),
    drawRouteCandidates: vi.fn(),
    setFeatureVisible: vi.fn(),
    removeFeature: vi.fn(),
    clearByBusinessId: vi.fn(),
  },
  spatial: { calcBuffer: vi.fn(() => null), calcRoute: vi.fn(async () => []), esQuery: vi.fn(async () => []) },
  kinematic: { smoothMove: vi.fn(), appendTrack: vi.fn(), playTrack: vi.fn() },
  trackingVehicleGpsUpdate: vi.fn(),
  addressRobotGisSearch: vi.fn(async () => undefined),
  addressRobotClear: vi.fn(),
})

const gpsBatch = (longitude = 114, gpsTime = '2026-10-15 10:00:00'): CarLocationBatch => ({
  datas: [{ carId: 'car-1', plateNumber: '粤B12345', longitude, latitude: 22, gpsTime }],
})

const searchData = (name = '道路'): AddressRobotGisSearchData => ({
  gis_search: { raw_text: name },
  overall_confidence: 0.9,
  highlight_entities: [1, 2].map((identifier) => ({
    anchor_id: String(identifier),
    name,
    attributes: {
      id: identifier,
      source_table: 'loi_road',
      cn_name: name,
      geom: {
        type: 'LineString',
        coordinates: [
          [114, 22],
          [114.01, 22.01],
        ],
      },
    },
  })),
})

const createGeneric = (view?: View) => {
  const layers = new Map<string, VectorLayer<VectorSource>>()
  const fit = vi.fn()
  const map = { getView: vi.fn(() => view ?? { fit, animateInternal: vi.fn(), cancelAnimations: vi.fn() }) }
  const clearByBusinessId = vi.fn()
  const removeLayer = vi.fn((layer: VectorLayer<VectorSource>) => {
    if (layers.get(layer.get('name')) === layer) layers.delete(layer.get('name'))
  })
  const generic = {
    map,
    geometry: { clearByBusinessId },
    getVectorLayer: (name: string) => layers.get(name),
    addLayer: (layer: VectorLayer<VectorSource>) => layers.set(layer.get('name'), layer),
    removeLayer,
  } as unknown as GenericController
  return { generic, map, layers, fit, clearByBusinessId, removeLayer }
}

const createView = () => {
  const view = new View({ center: fromLonLat([113, 21]), zoom: 10 })
  view.setViewportSize([1024, 768])
  return view
}

describe('F6/F7 引擎边界（回归 2026-10-15 Control 迁移）', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    EventBus.all.clear()
  })

  it('Given 协议端口与真实GPS批次 When tracking更新 Then 原样委托且不刷新undefined图层', () => {
    const port = createPort()
    const batch = gpsBatch()
    new TrackingController(port).trackingVehicleGpsUpdate(batch)
    expect(port.trackingVehicleGpsUpdate).toHaveBeenCalledExactlyOnceWith(batch)
    expect(port.view.layerToggle).not.toHaveBeenCalled()
    expect(port.view.layerRefresh).not.toHaveBeenCalled()
  })

  it('Given 协议端口 When 地址搜索和清理 Then 数据与businessId完整委托且无引擎访问', async () => {
    const port = createPort()
    const controller = new AddressRobotController(port)
    const data = searchData()
    const options = { businessId: 'search-1' }
    await controller.addressRobotGisSearch(data, options)
    controller.addressRobotClear(options)
    expect(port.addressRobotGisSearch).toHaveBeenCalledExactlyOnceWith(data, options)
    expect(port.addressRobotClear).toHaveBeenCalledExactlyOnceWith(options)
    expect(port.geometry.clearByBusinessId).not.toHaveBeenCalled()
  })

  it('Given 新地图车辆渲染器 When 首帧与过期帧GPS到达 Then WGS84投影落位且过期帧不覆盖', async () => {
    const vehicleSource = new VectorSource()
    const renderer = createVehicleManager({
      routeSource: new VectorSource(),
      vehicleSource,
      getState: createDispatchT1InitialState,
    })
    expect(renderer.updateVehicleLocations(gpsBatch())).toBe(1)
    const feature = vehicleSource.getFeatures()[0]
    expect((feature.getGeometry() as Point).getCoordinates()).toEqual(fromLonLat([114, 22]))
    expect(renderer.updateVehicleLocations(gpsBatch(115, '2026-10-15 09:59:00'))).toBe(0)
    expect(vehicleSource.getFeatures()).toHaveLength(1)
    expect(feature.get('longitude')).toBe(114)
    renderer.clearTrackedVehicles()
  })

  it('Given 正在GPS插值的车辆 When clear Then 动画与车辆轨迹全部撤销', async () => {
    const routeSource = new VectorSource()
    const vehicleSource = new VectorSource()
    const renderer = createVehicleManager({ routeSource, vehicleSource, getState: createDispatchT1InitialState })
    renderer.updateVehicleLocations(gpsBatch())
    renderer.updateVehicleLocations(gpsBatch(114.01, '2026-10-15 10:00:05'))
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    renderer.clearTrackedVehicles()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(10000)
    expect(vehicleSource.getFeatures()).toHaveLength(0)
    expect(routeSource.getFeatures()).toHaveLength(0)
  })

  it('Given 地址搜索数据 When renderer上图 Then 保留面板置信度道路标签投影和fit语义', async () => {
    const { generic, layers, fit } = createGeneric()
    const panel = vi.fn()
    EventBus.on('gis_search', panel)
    const renderer = new AddressRobotRenderer(generic)
    const completion = renderer.addressRobotGisSearch(searchData())
    const layer = layers.get('address_robot_default')!
    const features = layer.getSource()!.getFeatures()
    expect(panel).toHaveBeenCalledWith({ raw_text: '道路', confidence: 0.9 })
    expect(layer.getVisible()).toBe(true)
    expect(features).toHaveLength(2)
    expect(features[0].get('cn_name')).toBe('道路')
    expect(features[1].get('cn_name')).toBeUndefined()
    expect(fit).toHaveBeenCalledWith(
      layer.getSource()!.getExtent(),
      expect.objectContaining({
        duration: 1200,
        padding: [80, 80, 80, 80],
        minZoom: 10,
        maxZoom: 20,
      }),
    )
    await vi.advanceTimersByTimeAsync(1500)
    await completion
    expect(vi.getTimerCount()).toBe(2)
    await vi.advanceTimersByTimeAsync(3000)
    expect(vi.getTimerCount()).toBe(0)
    renderer.dispose()
  })

  it.each(['clear', 'dispose', 'replace'] as const)(
    'Given 等待flash的旧搜索 When %s Then promise收敛且旧feature不再写入',
    async (action) => {
      const { generic, layers } = createGeneric()
      const renderer = new AddressRobotRenderer(generic)
      const completion = renderer.addressRobotGisSearch(searchData())
      const layer = layers.get('address_robot_default')!
      const writes = vi.spyOn(layer.getSource()!.getFeatures()[0], 'setStyle')
      let replacement: Promise<void> | undefined
      if (action === 'clear') renderer.addressRobotClear()
      if (action === 'dispose') renderer.dispose()
      if (action === 'replace') replacement = renderer.addressRobotGisSearch(searchData('新道路'))
      await vi.advanceTimersByTimeAsync(6000)
      await completion
      await replacement
      expect(writes).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
      if (action !== 'replace') expect(layer.getSource()!.getFeatures()).toHaveLength(0)
      renderer.dispose()
    },
  )

  it('Given 正在闪烁的业务A和B When 只清理A Then A计时器撤销且B继续显示', async () => {
    const { generic, layers, clearByBusinessId } = createGeneric()
    const renderer = new AddressRobotRenderer(generic)
    const first = renderer.addressRobotGisSearch(searchData(), { businessId: 'A' })
    const second = renderer.addressRobotGisSearch(searchData(), { businessId: 'B' })
    await vi.advanceTimersByTimeAsync(2000)
    await Promise.all([first, second])
    const feature = layers.get('A')!.getSource()!.getFeatures()[0]
    const writes = vi.spyOn(feature, 'setStyle')
    renderer.addressRobotClear({ businessId: 'A' })
    expect(clearByBusinessId).toHaveBeenCalledWith('A')
    expect(layers.get('A')!.getVisible()).toBe(false)
    expect(layers.get('B')!.getVisible()).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(writes).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    renderer.dispose()
    renderer.dispose()
    expect(layers.size).toBe(0)
    await renderer.addressRobotGisSearch(searchData())
    expect(layers.size).toBe(0)
  })

  it.each(['dispose', 'clear', 'replace'] as const)(
    'Given 真实OL View正在搜索fit When %s Then center停止更新（回归P2动画泄漏）',
    async (action) => {
      const view = createView()
      const { generic } = createGeneric(view)
      const renderer = new AddressRobotRenderer(generic)
      const search = renderer.addressRobotGisSearch(searchData())
      await vi.advanceTimersByTimeAsync(300)
      expect(view.getAnimating()).toBe(true)
      const center = view.getCenter()!.slice()
      if (action === 'dispose') renderer.dispose()
      if (action === 'clear') renderer.addressRobotClear()
      if (action === 'replace') await renderer.addressRobotGisSearch({ ...searchData(), highlight_entities: [] })
      await vi.advanceTimersByTimeAsync(2000)
      await search
      expect(view.getCenter()).toEqual(center)
      expect(view.getAnimating()).toBe(false)
      renderer.dispose()
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it.each(['animate', 'fit'] as const)(
    'Given 搜索fit后其他业务启动%s When renderer.dispose Then 后来动画完整到达目标（回归P2误取消）',
    async (method) => {
      const view = createView()
      const { generic } = createGeneric(view)
      const renderer = new AddressRobotRenderer(generic)
      const search = renderer.addressRobotGisSearch(searchData())
      await vi.advanceTimersByTimeAsync(200)
      const destination = fromLonLat([115, 23])
      if (method === 'animate') view.animate({ center: destination, duration: 1000 })
      else
        view.fit([destination[0] - 1000, destination[1] - 1000, destination[0] + 1000, destination[1] + 1000], {
          duration: 1000,
        })
      await vi.advanceTimersByTimeAsync(200)
      renderer.dispose()
      expect(view.getAnimating()).toBe(true)
      await vi.advanceTimersByTimeAsync(2000)
      await search
      expect(view.getCenter()).toEqual(destination)
      expect(view.getAnimating()).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
    },
  )

  it('Given 同renderer在两个View启动自有fit When dispose Then 所有旧View均停止更新（回归P2动画遗漏）', async () => {
    const firstView = createView()
    const secondView = createView()
    const { generic, map } = createGeneric(firstView)
    const renderer = new AddressRobotRenderer(generic)
    const first = renderer.addressRobotGisSearch(searchData(), { businessId: 'A' })
    map.getView.mockReturnValue(secondView)
    const second = renderer.addressRobotGisSearch(searchData(), { businessId: 'B' })
    await vi.advanceTimersByTimeAsync(300)
    const firstCenter = firstView.getCenter()!.slice()
    const secondCenter = secondView.getCenter()!.slice()
    renderer.dispose()
    await vi.advanceTimersByTimeAsync(2000)
    await Promise.all([first, second])
    expect(firstView.getCenter()).toEqual(firstCenter)
    expect(secondView.getCenter()).toEqual(secondCenter)
    expect(vi.getTimerCount()).toBe(0)
  })
})
