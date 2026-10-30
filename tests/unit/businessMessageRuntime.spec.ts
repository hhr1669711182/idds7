import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { BusinessMessageRuntime } from '@/controller/core/io/BusinessMessageRuntime'
import { useMessageStore } from '@/store/useMessageStore'
import { useUserStore } from '@/store/useUserStore'
import { usePendingCallLocationStore } from '@/store/usePendingCallLocationStore'
import { usePendingDispatchAlarmStore } from '@/store/usePendingDispatchAlarmStore'
import { MESSAGE_CHANNEL, MESSAGE_EVENT_KEY, MESSAGE_SYSTEM } from '@/const/const.message.type'
import type { BusinessMapPort } from '@/controller/core/protocol/BusinessMapPort'
import { createRouter, createMemoryHistory } from 'vue-router'
import { bindBusinessMapLifecycle } from '@/register/businessMapLifecycle'
import { ROUTE_NAMES } from '@/router/constants'

vi.mock('@/register/pageCondition', () => ({
  PAGE_CONDITION: { REQUEST: 'request', DISPATCH: 'dispatch' },
  clearPageCondition: vi.fn(),
  navigateByCondition: vi.fn(),
  setPageCondition: vi.fn(),
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
  spatial: {
    calcBuffer: vi.fn(() => ({ type: 'Polygon', coordinates: [] })),
    calcRoute: vi.fn(async () => []),
    esQuery: vi.fn(async () => []),
  },
  kinematic: { smoothMove: vi.fn(), appendTrack: vi.fn(), playTrack: vi.fn() },
  trackingVehicleGpsUpdate: vi.fn(),
  addressRobotGisSearch: vi.fn(),
  addressRobotClear: vi.fn(),
})

describe('Control 迁移应用生命周期（回归 2026-10-15 F4/F8/F10）', () => {
  const runtimes: BusinessMessageRuntime[] = []
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    setActivePinia(createPinia())
    useUserStore().applySharedState(
      JSON.stringify({
        v: 1,
        updatedAt: 1,
        auth: { accessToken: 'test', sessionId: 'session' },
        user: { userId: 'user' },
        seat: { seatNumber: 'seat' },
        phase: 'popup',
        currentAlarm: null,
      }),
    )
  })
  afterEach(() => {
    runtimes.forEach((runtime) => runtime.dispose())
    runtimes.length = 0
    vi.useRealTimers()
  })
  const start = () => {
    const runtime = new BusinessMessageRuntime()
    runtimes.push(runtime)
    runtime.start()
    return runtime
  }
  const locate = () =>
    useMessageStore().ingest(
      { eventKey: MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, data: { id: 'call', longitude: 114, latitude: 22, radius: 500 } },
      MESSAGE_CHANNEL.WS,
      MESSAGE_SYSTEM.IDS_SEAT_WEB,
    )

  it('Given 无地图 When 来电准入后挂载地图 Then 从已接收状态绘制且重复start不双订阅', async () => {
    const runtime = start()
    runtime.start()
    locate()
    await vi.advanceTimersByTimeAsync(500)
    expect(usePendingCallLocationStore().getActive()?.id).toBe('call')
    const port = createPort()
    runtime.attachMap(port)
    expect(port.geometry.addMarker).toHaveBeenCalledTimes(1)
    expect(port.view.locate).toHaveBeenCalledTimes(1)
  })

  it('Given A地图已替换为B When A迟到detach Then B仍接收且重建不重复聚焦', async () => {
    const runtime = start()
    const first = createPort()
    const detachFirst = runtime.attachMap(first)
    locate()
    await vi.advanceTimersByTimeAsync(500)
    const second = createPort()
    runtime.attachMap(second)
    detachFirst()
    expect(second.geometry.addMarker).toHaveBeenCalledTimes(1)
    expect(second.view.locate).not.toHaveBeenCalled()
    locate()
    await vi.advanceTimersByTimeAsync(500)
    expect(second.geometry.addMarker).toHaveBeenCalledTimes(2)
  })

  it('Given 未就绪图面 When site与simulate连续接收 Then attach后等site完成再执行simulate', async () => {
    const runtime = start()
    const order: string[] = []
    let finishSite: (() => void) | undefined
    const site = new Promise<void>((resolve) => {
      finishSite = resolve
    })
    useMessageStore().ingest(
      { eventKey: MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_DISASTER_SITE, data: { disasterSite: { x: 114, y: 22 } } },
      MESSAGE_CHANNEL.LOCAL_STORAGE,
      MESSAGE_SYSTEM.IDS_SEAT_WEB,
      { mock: true },
    )
    useMessageStore().ingest(
      { eventKey: MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_SIMULATE, data: null },
      MESSAGE_CHANNEL.LOCAL_STORAGE,
      MESSAGE_SYSTEM.IDS_SEAT_WEB,
      { mock: true },
    )
    runtime.attachMap(createPort(), {
      kind: 'dispatch',
      mock: {
        render: vi.fn(),
        disasterSite: async () => {
          order.push('site')
          await site
        },
        simulate: () => {
          order.push('simulate')
        },
        clear: vi.fn(),
        dispatchVehicles: vi.fn(),
      },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['site'])
    finishSite?.()
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['site', 'simulate'])
  })

  it('Given 已排队消息 When dispose Then 不交付且不再操作已卸载图面', async () => {
    const runtime = start()
    const port = createPort()
    runtime.attachMap(port)
    locate()
    runtime.dispose()
    await vi.advanceTimersByTimeAsync(1000)
    expect(port.geometry.addMarker).not.toHaveBeenCalled()
  })

  it('Given 无地图 When 地址机器人结果先到 Then 挂载后恢复已准入结果', () => {
    const runtime = start()
    const data = { highlight_entities: [], gis_search: { status: 'ready' } }
    useMessageStore().ingest(
      { eventKey: MESSAGE_EVENT_KEY.ADDRESS_ROBOT_GIS_SEARCH, data },
      MESSAGE_CHANNEL.WS,
      MESSAGE_SYSTEM.IDS_SEAT_WEB,
    )
    const port = createPort()
    runtime.attachMap(port)
    expect(port.addressRobotGisSearch).toHaveBeenCalledWith(data, undefined)
  })

  it('Given A任务未返回 When 退出并开始B任务 Then B不等待已失效的A', async () => {
    const runtime = start()
    const order: string[] = []
    let resolveOld: (() => void) | undefined
    const oldTask = new Promise<void>((resolve) => {
      resolveOld = resolve
    })
    const render = vi.fn(() => {
      order.push('render')
    })
    runtime.attachMap(createPort(), {
      kind: 'dispatch',
      mock: { render, disasterSite: () => oldTask, simulate: vi.fn(), clear: vi.fn(), dispatchVehicles: vi.fn() },
    })
    const send = (
      eventKey:
        | typeof MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_CLEAR
        | typeof MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_DISASTER_SITE
        | typeof MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_RENDER,
    ) =>
      useMessageStore().ingest({ eventKey, data: null }, MESSAGE_CHANNEL.LOCAL_STORAGE, MESSAGE_SYSTEM.IDS_SEAT_WEB, {
        mock: true,
      })
    send(MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_DISASTER_SITE)
    send(MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_CLEAR)
    send(MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_RENDER)
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['render'])
    resolveOld?.()
  })

  it('Given 路径请求在途 When 会话更换后旧请求返回 Then 旧结果不绘制到当前图面', async () => {
    const runtime = start()
    const port = createPort()
    let resolveRoutes:
      | ((routes: Array<{ coordinates: [number, number][]; distanceMeters: number; durationSeconds: number }>) => void)
      | undefined
    port.spatial.calcRoute = () =>
      new Promise((resolve) => {
        resolveRoutes = resolve
      })
    runtime.attachMap(port)
    useMessageStore().ingest(
      { eventKey: MESSAGE_EVENT_KEY.MAP_BASE_ROUTE_CALC, data: { start: [114, 22], end: [115, 23] } },
      MESSAGE_CHANNEL.WS,
      MESSAGE_SYSTEM.IDS_SEAT_WEB,
    )
    useUserStore().applySharedState(
      JSON.stringify({
        v: 1,
        updatedAt: 2,
        phase: 'popup',
        auth: { sessionId: 'new-session' },
        user: { userId: 'new-user' },
      }),
    )
    resolveRoutes?.([
      {
        coordinates: [
          [114, 22],
          [115, 23],
        ],
        distanceMeters: 10,
        durationSeconds: 5,
      },
    ])
    await vi.advanceTimersByTimeAsync(0)
    expect(port.geometry.drawRouteCandidates).not.toHaveBeenCalled()
  })

  it('Given 已准入警情画像 When 切换会话 Then 不保留可供新页面恢复的旧画像', async () => {
    const runtime = start()
    const user = useUserStore()
    user.applySharedState(
      JSON.stringify({ ...user.rawState, updatedAt: 2, phase: 'inquiry', currentAlarm: { incidentId: 'A' } }),
    )
    useMessageStore().ingest(
      { eventKey: MESSAGE_EVENT_KEY.ALARM_PROFILE_SYNC, data: { incidentId: 'A', longitude: 114, latitude: 22 } },
      MESSAGE_CHANNEL.WS,
      MESSAGE_SYSTEM.IDS_SEAT_WEB,
    )
    await vi.advanceTimersByTimeAsync(500)
    expect(usePendingDispatchAlarmStore().profile?.incidentId).toBe('A')
    user.applySharedState(
      JSON.stringify({ ...user.rawState, updatedAt: 3, auth: { accessToken: 'new', sessionId: 'new-session' } }),
    )
    expect(usePendingDispatchAlarmStore().profile).toBeNull()
    runtime.attachMap(createPort())
  })

  it('Given 持久化旧画像无会话归属 When runtime启动 Then 不作为已准入画像恢复', () => {
    usePendingDispatchAlarmStore().queue({ incidentId: 'old' })
    start()
    expect(usePendingDispatchAlarmStore().profile).toBeNull()
  })

  it('Given 同一稳定会话已准入画像 When runtime重新启动 Then 保留待页面消费的画像', async () => {
    const runtime = start()
    const user = useUserStore()
    user.applySharedState(
      JSON.stringify({ ...user.rawState, updatedAt: 2, phase: 'inquiry', currentAlarm: { incidentId: 'A' } }),
    )
    useMessageStore().ingest(
      { eventKey: MESSAGE_EVENT_KEY.ALARM_PROFILE_SYNC, data: { incidentId: 'A' } },
      MESSAGE_CHANNEL.WS,
      MESSAGE_SYSTEM.IDS_SEAT_WEB,
    )
    await vi.advanceTimersByTimeAsync(500)
    runtime.dispose()
    start()
    expect(usePendingDispatchAlarmStore().profile?.incidentId).toBe('A')
  })

  it('Given 已缓存画像 When attachAlarmProfile Then 立即hydrate且后续更新实时送达', async () => {
    const runtime = start()
    const user = useUserStore()
    user.applySharedState(
      JSON.stringify({ ...user.rawState, updatedAt: 2, phase: 'inquiry', currentAlarm: { incidentId: 'A' } }),
    )
    useMessageStore().ingest(
      { eventKey: MESSAGE_EVENT_KEY.ALARM_PROFILE_SYNC, data: { incidentId: 'A', longitude: 114, latitude: 22 } },
      MESSAGE_CHANNEL.WS,
      MESSAGE_SYSTEM.IDS_SEAT_WEB,
    )
    await vi.advanceTimersByTimeAsync(500)

    const seen: string[] = []
    const stop = runtime.attachAlarmProfile((profile) => seen.push(profile.incidentId))
    expect(seen).toEqual(['A'])

    useMessageStore().ingest(
      { eventKey: MESSAGE_EVENT_KEY.ALARM_PROFILE_SYNC, data: { incidentId: 'B', longitude: 115, latitude: 23 } },
      MESSAGE_CHANNEL.WS,
      MESSAGE_SYSTEM.IDS_SEAT_WEB,
    )
    await vi.advanceTimersByTimeAsync(500)
    expect(seen).toEqual(['A', 'B'])
    stop()
  })

  it('Given 已attach画像 When 解绑后新画像到达 Then 不再送达旧handler', async () => {
    const runtime = start()
    const user = useUserStore()
    user.applySharedState(
      JSON.stringify({ ...user.rawState, updatedAt: 2, phase: 'inquiry', currentAlarm: { incidentId: 'A' } }),
    )
    const stop = runtime.attachAlarmProfile(() => {})
    stop()
    useMessageStore().ingest(
      { eventKey: MESSAGE_EVENT_KEY.ALARM_PROFILE_SYNC, data: { incidentId: 'B' } },
      MESSAGE_CHANNEL.WS,
      MESSAGE_SYSTEM.IDS_SEAT_WEB,
    )
    await vi.advanceTimersByTimeAsync(500)
    expect(usePendingDispatchAlarmStore().profile?.incidentId).toBe('B')
    stop()
  })

  it('Given runtime已dispose When attachAlarmProfile Then 返回空函数不抛错', () => {
    const runtime = new BusinessMessageRuntime()
    runtime.dispose()
    const handler = vi.fn()
    const stop = runtime.attachAlarmProfile(handler)
    expect(handler).not.toHaveBeenCalled()
    expect(() => stop()).not.toThrow()
  })

  it('Given 旧退出导航在途 When 新flood任务到达再返回调派 Then 旧导航不清新任务；回归路由竞争', async () => {
    const runtime = start()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/map', name: ROUTE_NAMES.MAP, component: {} },
        { path: '/dispatch', name: ROUTE_NAMES.DISPATCH, component: {} },
      ],
    })
    const stop = bindBusinessMapLifecycle(router, runtime)
    await router.push('/dispatch')
    let release: () => void = () => {}
    let entered: () => void = () => {}
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const entering = new Promise<void>((resolve) => {
      entered = resolve
    })
    router.beforeResolve(async (to) => {
      if (to.path === '/map') {
        entered()
        await blocked
      }
    })
    const leaving = router.push('/map')
    await entering
    const user = useUserStore()
    user.applySharedState(JSON.stringify({ ...user.rawState, updatedAt: 2, mode: 'flood' }))
    for (const eventKey of [
      MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_RENDER,
      MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_DISASTER_SITE,
    ]) {
      useMessageStore().ingest({ eventKey, data: null }, MESSAGE_CHANNEL.LOCAL_STORAGE, MESSAGE_SYSTEM.IDS_SEAT_WEB, {
        mock: true,
      })
    }
    release()
    await leaving
    await router.push('/dispatch')
    const render = vi.fn()
    const disasterSite = vi.fn()
    runtime.attachMap(createPort(), {
      kind: 'dispatch',
      mock: { render, disasterSite, simulate: vi.fn(), clear: vi.fn(), dispatchVehicles: vi.fn() },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(render).toHaveBeenCalledOnce()
    expect(disasterSite).toHaveBeenCalledOnce()
    stop()
  })

  it('Given 调派任务未执行 When 退出导航取消 Then 保留原任务；回归路由failure', async () => {
    const runtime = start()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/map', name: ROUTE_NAMES.MAP, component: {} },
        { path: '/dispatch', name: ROUTE_NAMES.DISPATCH, component: {} },
      ],
    })
    const stop = bindBusinessMapLifecycle(router, runtime)
    await router.push('/dispatch')
    useMessageStore().ingest(
      { eventKey: MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_DISASTER_SITE, data: null },
      MESSAGE_CHANNEL.LOCAL_STORAGE,
      MESSAGE_SYSTEM.IDS_SEAT_WEB,
      { mock: true },
    )
    router.beforeResolve((to) => (to.path === '/map' ? false : undefined))
    expect(await router.push('/map')).toBeTruthy()
    const disasterSite = vi.fn()
    runtime.attachMap(createPort(), {
      kind: 'dispatch',
      mock: { render: vi.fn(), disasterSite, simulate: vi.fn(), clear: vi.fn(), dispatchVehicles: vi.fn() },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(disasterSite).toHaveBeenCalledOnce()
    stop()
  })

  it('Given A图面灾害任务未完成 When 同上下文换B图面 Then 未完成任务交还B且完成任务不重放', async () => {
    const runtime = start()
    let finish: () => void = () => {}
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const firstSite = vi.fn(() => pending)
    runtime.attachMap(createPort(), {
      kind: 'dispatch',
      mock: { render: vi.fn(), disasterSite: firstSite, simulate: vi.fn(), clear: vi.fn(), dispatchVehicles: vi.fn() },
    })
    useMessageStore().ingest(
      { eventKey: MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_DISASTER_SITE, data: null },
      MESSAGE_CHANNEL.LOCAL_STORAGE,
      MESSAGE_SYSTEM.IDS_SEAT_WEB,
      { mock: true },
    )
    const secondSite = vi.fn()
    runtime.attachMap(createPort(), {
      kind: 'dispatch',
      mock: { render: vi.fn(), disasterSite: secondSite, simulate: vi.fn(), clear: vi.fn(), dispatchVehicles: vi.fn() },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(firstSite).toHaveBeenCalledOnce()
    expect(secondSite).toHaveBeenCalledOnce()
    finish()
    await vi.advanceTimersByTimeAsync(0)
    const thirdSite = vi.fn()
    runtime.attachMap(createPort(), {
      kind: 'dispatch',
      mock: { render: vi.fn(), disasterSite: thirdSite, simulate: vi.fn(), clear: vi.fn(), dispatchVehicles: vi.fn() },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(thirdSite).not.toHaveBeenCalled()
  })
})
