import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OlMap from 'ol/Map'
import View from 'ol/View'
import type VectorLayer from 'ol/layer/Vector'
import type VectorSource from 'ol/source/Vector'
import { Style } from 'ol/style'
import type { CarLocationBatch } from '@/controller/core/protocol/LegacyMessageProtocol'
import { useUserStore } from '@/store/useUserStore'
import { useDispatchT1Store } from '@/store/useDispatchT1Store'

const runtime = vi.hoisted(() => ({
  attachTracking: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
  instances: [] as Array<{
    updateVehicleLocations: ReturnType<typeof vi.fn>
    reset: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
    handleWebSocketMessage: ReturnType<typeof vi.fn>
    simulateCoordinate: ReturnType<typeof vi.fn>
  }>,
  realInstances: [] as Array<import('@/baseComponent/OpenlayersMap/DispatchT1').DispatchT1>,
  useRealService: false,
  queryStations: vi.fn(),
  handler: null as ((data: CarLocationBatch) => void) | null,
  latest: null as CarLocationBatch | null,
  disposals: [] as Array<ReturnType<typeof vi.fn>>,
}))

vi.mock('@/controller/core/io/BusinessMessageRuntime', () => ({ getBusinessMessageRuntime: () => runtime }))
vi.mock('@/store/useMessageStore', () => ({ useMessageStore: () => ({ subscribe: runtime.subscribe }) }))
vi.mock('@/baseComponent/OpenlayersMap/DispatchT1', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/baseComponent/OpenlayersMap/DispatchT1')>()
  return {
    ...actual,
    DispatchT1: vi.fn(function (
      map: OlMap,
      options: import('@/baseComponent/OpenlayersMap/DispatchT1').DispatchT1Options,
    ) {
      if (runtime.useRealService) {
        const instance = new actual.DispatchT1(map, options)
        runtime.realInstances.push(instance)
        return instance
      }
      const instance = {
        updateVehicleLocations: vi.fn(() => 1),
        reset: vi.fn(),
        destroy: vi.fn(),
        handleWebSocketMessage: vi.fn(),
        simulateCoordinate: vi.fn(),
      }
      runtime.instances.push(instance)
      return instance
    }),
  }
})
vi.mock('@/composables/useFireStations', async () => {
  const { ref } = await import('vue')
  return { useFireStations: () => ({ stations: ref([]), load: vi.fn(async () => undefined) }) }
})
vi.mock('@/service/geoserver', () => ({ geoserverApi: { getWMSServiceUrl: () => '/geoserver/wms' } }))
vi.mock('@/baseComponent/OpenlayersMap/FeatureClickQuery', () => ({
  DISPATCH_T1_PRIMARY_STATION_LAYER_CLASS: 'dispatch_t1_primary_station',
}))
vi.mock('@/baseComponent/amap/featureStyle', () => ({
  getStyle: () => new Style(),
  createRouteLineStyle: () => new Style(),
  MAP_ICON_SRC: { car: 'car.png' },
}))
vi.mock('@/baseComponent/amap/useAmapTools', () => ({
  buildRouteDirectionFeatures: vi.fn(() => []),
  buildTmcFeatures: vi.fn(() => []),
  fetchDrivingRoutes: vi.fn(async () => []),
}))
vi.mock('@/controller/core/business/IncidentStationQuery', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/controller/core/business/IncidentStationQuery')>()),
  queryStationFeatures: vi.fn(async () => []),
  queryIncidentStations: runtime.queryStations,
}))
vi.mock('@/service/methods/dispatchVehicles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/service/methods/dispatchVehicles')>()),
  queryDispatchFormation: vi.fn(async () => ({ formationId: 'formation-1', formationVersion: 1 })),
}))

const createMap = () => {
  const view = { getProjection: () => 'EPSG:3857', animate: vi.fn() }
  return {
    getView: () => view,
    addOverlay: vi.fn(),
    removeOverlay: vi.fn(),
    on: () => ({ target: new EventTarget(), type: 'singleclick', listener: vi.fn() }),
  } as unknown as OlMap
}

const sharedState = (
  phase = 'dispatchTrack',
  incidentId = 'incident-1',
  sessionId = 'session-1',
  userId = 'user-1',
  seatNumber = 'seat-1',
) =>
  JSON.stringify({
    v: 1,
    updatedAt: 1,
    phase,
    auth: { accessToken: 'test', sessionId },
    user: { userId },
    seat: { seatNumber },
    currentAlarm: { incidentId },
  })

const acceptedGps: CarLocationBatch = {
  datas: [{ carId: 'car-1', plateNumber: '粤B12345', longitude: 114, latitude: 22 }],
}

describe('DispatchT1 GPS运行时挂载（回归 2026-10-15 F6）', () => {
  let wrapper: VueWrapper | undefined
  const maps: OlMap[] = []
  beforeEach(() => {
    setActivePinia(createPinia())
    useUserStore().applySharedState(sharedState())
    runtime.instances.length = 0
    runtime.realInstances.length = 0
    runtime.useRealService = false
    runtime.queryStations.mockReset()
    runtime.disposals.length = 0
    runtime.handler = null
    runtime.latest = acceptedGps
    runtime.attachTracking.mockImplementation((handler: (data: CarLocationBatch) => void) => {
      expect(runtime.instances.length + runtime.realInstances.length).toBeGreaterThan(0)
      runtime.handler = handler
      if (runtime.latest) handler(runtime.latest)
      const dispose = vi.fn(() => {
        if (runtime.handler === handler) runtime.handler = null
      })
      runtime.disposals.push(dispose)
      return dispose
    })
  })
  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    maps.splice(0).forEach((map) => map.dispose())
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const realMap = () => {
    const map = new OlMap({ layers: [], view: new View({ center: [0, 0], zoom: 10 }) })
    vi.spyOn(map.getView(), 'animate').mockImplementation(() => {})
    vi.spyOn(map.getView(), 'fit').mockImplementation(() => {})
    maps.push(map)
    return map
  }
  const vehicleSource = (map: OlMap) =>
    (
      map
        .getLayers()
        .getArray()
        .find((layer) => layer.get('name') === 'dispatch_t1_vehicles') as VectorLayer<VectorSource>
    ).getSource()!
  const timedGps = (longitude: number, second: string): CarLocationBatch => ({
    datas: [{ ...acceptedGps.datas[0], longitude, gpsTime: `2026-10-15 10:00:${second}` }],
  })
  const changeIdentity = (field: string) =>
    useUserStore().applySharedState(
      sharedState(
        'dispatchTrack',
        'incident-1',
        field === 'session' ? 'session-2' : 'session-1',
        field === 'user' ? 'user-2' : 'user-1',
        field === 'seat' ? 'seat-2' : 'seat-1',
      ),
    )

  const show = async (map: OlMap | null) => {
    const component = (await import('@/baseComponent/OpenlayersMap/DispatchT1.vue')).default
    wrapper = mount(component, { props: { map } })
    return wrapper
  }

  it('Given 地图未就绪 When 组件挂载 Then 不attach且不直接订阅消息', async () => {
    await show(null)
    expect(runtime.attachTracking).not.toHaveBeenCalled()
    expect(runtime.subscribe).not.toHaveBeenCalled()
  })

  it('Given 最新accepted GPS已缓存 When 地图就绪 Then controller建好后attach并立即hydrate', async () => {
    const panel = await show(null)
    await panel.setProps({ map: createMap() })
    expect(runtime.attachTracking).toHaveBeenCalledTimes(1)
    expect(runtime.instances[0].updateVehicleLocations).toHaveBeenCalledExactlyOnceWith(acceptedGps)
    expect(runtime.subscribe).not.toHaveBeenCalled()
  })

  it('Given 已attach的地图 When map变为null再重建 Then 先解绑旧controller并只更新新controller', async () => {
    const panel = await show(createMap())
    const old = runtime.instances[0]
    await panel.setProps({ map: null })
    expect(runtime.disposals[0]).toHaveBeenCalledTimes(1)
    expect(old.destroy).toHaveBeenCalledTimes(1)
    expect(runtime.disposals[0].mock.invocationCallOrder[0]).toBeLessThan(old.destroy.mock.invocationCallOrder[0])
    expect(runtime.handler).toBeNull()
    await panel.setProps({ map: createMap() })
    const replacement = runtime.instances[1]
    expect(replacement.updateVehicleLocations).toHaveBeenCalledExactlyOnceWith(acceptedGps)
    runtime.handler?.(acceptedGps)
    expect(old.updateVehicleLocations).toHaveBeenCalledTimes(1)
    expect(replacement.updateVehicleLocations).toHaveBeenCalledTimes(2)
  })

  it('Given controller已attach When 组件卸载 Then dispose解绑并销毁controller', async () => {
    const panel = await show(createMap())
    panel.unmount()
    wrapper = undefined
    expect(runtime.disposals[0]).toHaveBeenCalledTimes(1)
    expect(runtime.instances[0].destroy).toHaveBeenCalledTimes(1)
    expect(runtime.handler).toBeNull()
  })

  it('Given 初始已dispatchTrack且GPS同步hydrate When 下一帧到达 Then 首次focus仅一次（回归P2聚焦重放）', async () => {
    const map = createMap()
    await show(map)
    expect(map.getView().animate).toHaveBeenCalledTimes(1)
    runtime.handler?.(acceptedGps)
    expect(map.getView().animate).toHaveBeenCalledTimes(1)
  })

  it('Given 当前跟踪已focus When map重建且组件重新挂载hydrate Then 只补绘车辆且不重放focus（回归P2）', async () => {
    const firstMap = createMap()
    const panel = await show(firstMap)
    runtime.handler?.(acceptedGps)
    expect(firstMap.getView().animate).toHaveBeenCalledTimes(1)
    await panel.setProps({ map: null })
    const replacementMap = createMap()
    await panel.setProps({ map: replacementMap })
    expect(replacementMap.getView().animate).not.toHaveBeenCalled()
    panel.unmount()
    wrapper = undefined
    const remountedMap = createMap()
    await show(remountedMap)
    runtime.handler?.(acceptedGps)
    expect(remountedMap.getView().animate).not.toHaveBeenCalled()
    expect(runtime.instances[2].updateVehicleLocations).toHaveBeenCalledTimes(2)
  })

  it('Given 当前跟踪已focus When 新警情或新会话接收GPS Then 每个新上下文可重新focus一次（回归P2）', async () => {
    const map = createMap()
    await show(map)
    useUserStore().applySharedState(sharedState('dispatchTrack', 'incident-2'))
    runtime.handler?.(acceptedGps)
    runtime.handler?.(acceptedGps)
    expect(map.getView().animate).toHaveBeenCalledTimes(2)
    useUserStore().applySharedState(sharedState('dispatchTrack', 'incident-2', 'session-2'))
    runtime.handler?.(acceptedGps)
    runtime.handler?.(acceptedGps)
    expect(map.getView().animate).toHaveBeenCalledTimes(3)
  })

  it.each(['user', 'session', 'seat'])(
    'Given 真实车辆正在插值 When 同dispatchTrack跨%s且地图不变 Then 旧车清空且旧动画停止（回归F6会话清理）',
    async (field) => {
      vi.useFakeTimers()
      runtime.useRealService = true
      runtime.latest = timedGps(114, '00')
      const map = realMap()
      await show(map)
      const source = vehicleSource(map)
      const feature = source.getFeatures()[0]
      const writes = vi.spyOn(feature.getGeometry()!, 'setCoordinates')
      runtime.handler?.(timedGps(114.01, '05'))
      await vi.advanceTimersByTimeAsync(100)
      expect(writes).toHaveBeenCalled()
      writes.mockClear()
      changeIdentity(field)
      expect(source.getFeatures()).toHaveLength(0)
      await vi.advanceTimersByTimeAsync(1000)
      expect(writes).not.toHaveBeenCalled()
      expect(runtime.realInstances).toHaveLength(1)
    },
  )

  it('Given 真实车辆正在插值 When 普通shared revision更新 Then 保留车辆及动画，不重置service（回归F6会话清理）', async () => {
    vi.useFakeTimers()
    runtime.useRealService = true
    runtime.latest = timedGps(114, '00')
    const map = realMap()
    await show(map)
    const reset = vi.spyOn(runtime.realInstances[0], 'reset')
    const source = vehicleSource(map)
    const writes = vi.spyOn(source.getFeatures()[0].getGeometry()!, 'setCoordinates')
    runtime.handler?.(timedGps(114.01, '05'))
    useUserStore().applySharedState(sharedState())
    useUserStore().applySharedState(sharedState())
    await vi.advanceTimersByTimeAsync(100)
    expect(reset).not.toHaveBeenCalled()
    expect(source.getFeatures()).toHaveLength(1)
    expect(writes).toHaveBeenCalled()
  })

  it('Given 真实service旧查询等待队站响应 When 会话变更且旧查询失败 Then 新状态及组件事件不受污染（回归F6会话清理）', async () => {
    runtime.useRealService = true
    runtime.latest = null
    const deferred = Promise.withResolvers<never>()
    runtime.queryStations.mockReturnValueOnce(deferred.promise)
    const panel = await show(realMap())
    const actions = panel.vm as unknown as { receiveWebSocket: (data: unknown) => Promise<unknown> }
    const pending = actions.receiveWebSocket({ incidentId: 'old', longitude: 114, latitude: 22 }).then(
      (result) => ({ result }),
      (error) => ({ error }),
    )
    expect(runtime.queryStations).toHaveBeenCalledTimes(1)
    changeIdentity('session')
    useDispatchT1Store().beginQuery({ id: 'new', longitude: 115, latitude: 23 })
    deferred.reject(new Error('old query failure'))
    expect(await pending).toEqual({ result: null })
    expect(useDispatchT1Store().incident?.id).toBe('new')
    expect(useDispatchT1Store().status).toBe('querying')
    expect(panel.emitted('querySuccess')).toBeUndefined()
    expect(panel.emitted('error')).toBeUndefined()
  })

  it.each(['receiveWebSocket', 'simulateCoordinate'] as const)(
    'Given %s旧调用正在等待 When 会话变更后完成 Then 不发送旧querySuccess（回归F6会话清理）',
    async (method) => {
      const panel = await show(createMap())
      const deferred = Promise.withResolvers<unknown>()
      const instance = runtime.instances[0]
      const serviceMethod =
        method === 'receiveWebSocket' ? instance.handleWebSocketMessage : instance.simulateCoordinate
      serviceMethod.mockReturnValueOnce(deferred.promise)
      const actions = panel.vm as unknown as Record<typeof method, (...args: unknown[]) => Promise<unknown>>
      const pending = actions[method](...(method === 'receiveWebSocket' ? [{}] : [114, 22]))
      changeIdentity('session')
      deferred.resolve({ incident: { id: 'old' } })
      expect(await pending).toBeNull()
      expect(instance.reset).toHaveBeenCalledTimes(1)
      expect(panel.emitted('querySuccess')).toBeUndefined()
    },
  )

  it('Given 会话切换同时换图 When 新controller同步hydrate Then 只reset旧service，不清除新状态（回归F6会话清理）', async () => {
    const panel = await show(createMap())
    const old = runtime.instances[0]
    changeIdentity('session')
    expect(old.reset).toHaveBeenCalledTimes(1)
    runtime.latest = timedGps(115, '10')
    const replacementMap = createMap()
    await panel.setProps({ map: replacementMap })
    const replacement = runtime.instances[1]
    expect(replacement.updateVehicleLocations).toHaveBeenCalledExactlyOnceWith(runtime.latest)
    expect(replacement.reset).not.toHaveBeenCalled()
    expect(old.reset.mock.invocationCallOrder[0]).toBeLessThan(
      replacement.updateVehicleLocations.mock.invocationCallOrder[0],
    )
    expect(replacementMap.getView().animate).toHaveBeenCalledTimes(1)
  })

  it('Given 无地图时暂存旧会话query When 切换会话后地图就绪 Then 不执行旧pending数据（回归F6会话清理）', async () => {
    const panel = await show(null)
    const actions = panel.vm as unknown as { receiveWebSocket: (data: unknown) => Promise<unknown> }
    await actions.receiveWebSocket({ incidentId: 'old', longitude: 114, latitude: 22 })
    changeIdentity('session')
    await panel.setProps({ map: createMap() })
    expect(runtime.instances[0].handleWebSocketMessage).not.toHaveBeenCalled()
  })

  it('Given 旧query等待formation When 会话变更后响应 Then 不回写新会话状态（回归F6服务层代次缺口）', async () => {
    runtime.useRealService = true
    runtime.latest = null
    const { queryDispatchFormation } = await import('@/service/methods/dispatchVehicles')
    const deferred = Promise.withResolvers<Awaited<ReturnType<typeof queryDispatchFormation>>>()
    vi.mocked(queryDispatchFormation).mockReturnValueOnce(deferred.promise)
    runtime.queryStations.mockResolvedValueOnce({
      primary: { id: 'old-station', name: '旧队站', address: '', coordinate: [114, 22], distanceMeters: 0 },
      support: [],
      searchRadiusMeters: 10000,
    })
    const panel = await show(realMap())
    const actions = panel.vm as unknown as { receiveWebSocket: (data: unknown) => Promise<unknown> }
    const pending = actions.receiveWebSocket({ incidentId: 'old', longitude: 114, latitude: 22 })
    await Promise.resolve()
    await Promise.resolve()
    changeIdentity('session')
    useDispatchT1Store().beginQuery({ id: 'new', longitude: 115, latitude: 23 })
    deferred.resolve({ formationId: 'old-formation', formationVersion: 1 })
    expect(await pending).toBeNull()
    expect(useDispatchT1Store().incident?.id).toBe('new')
  })
})
