import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type OlMap from 'ol/Map'
import type { AmapRealtimeNav } from '@/baseComponent/amap/useAmapTools'
import type { StationRouteAlternatives } from '@/baseComponent/amap/routeAlternatives'

const layers = vi.hoisted(() => ({ destroy: vi.fn() }))
vi.mock('@/baseComponent/OpenlayersMap/mountPointLayer', () => ({
  mountPointLayer: () => ({ destroy: layers.destroy }),
}))
vi.mock('@/baseComponent/OpenlayersMap/mountPolygonLayer', () => ({
  mountPolygonLayer: () => ({ destroy: layers.destroy }),
}))
vi.mock('@/baseComponent/amap/featureStyle', () => ({ getStyle: vi.fn(), MAP_ICON_SRC: { endPoint: 'end' } }))

import { createSpecialMapMock } from '@/baseComponent/OpenlayersMap/specialMapMock'

const deferred = <Value>() => {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

describe('specialMapMock generation（回归 F10 清场后旧任务复活）', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())
  const setup = () => {
    const requests: Array<ReturnType<typeof deferred<StationRouteAlternatives['alternatives']>>> = []
    const nav = {
      fetchRouteAlternatives: vi.fn(() => {
        const request = deferred<StationRouteAlternatives['alternatives']>()
        requests.push(request)
        return request.promise
      }),
      renderRouteAlternatives: vi.fn(),
      renderRoutesOnly: vi.fn(),
      startRouteVehicleAnimation: vi.fn(),
      setRouteVehicleGroups: vi.fn(),
      clearRoutes: vi.fn(),
    }
    const map = { getView: () => ({ animate: vi.fn(), getProjection: () => 'EPSG:4326' }) }
    const mock = createSpecialMapMock(map as unknown as OlMap, nav as unknown as AmapRealtimeNav)
    const finish = (offset = 0) =>
      requests.slice(offset, offset + 3).forEach((request) =>
        request.resolve([
          {
            id: 'route-1',
            result: {},
            metrics: {},
            etaSeconds: 20,
          } as StationRouteAlternatives['alternatives'][number],
        ]),
      )
    return { mock, nav, requests, finish }
  }

  it('Given 算路未完成 When clear 后响应到达 Then 不重绘，返回空结果且不复活图层', async () => {
    const { mock, nav, finish } = setup()
    const task = mock.render()
    mock.clear()
    finish()
    await expect(task).resolves.toEqual([])
    expect(nav.renderRouteAlternatives).not.toHaveBeenCalled()
  })

  it('Given simulate 等待算路 When clear 后响应到达 Then 不新建任务或启动动画', async () => {
    const { mock, nav, finish } = setup()
    const render = mock.render()
    const simulate = mock.simulate()
    mock.clear()
    finish()
    await Promise.all([render, simulate])
    expect(nav.fetchRouteAlternatives).toHaveBeenCalledTimes(3)
    expect(nav.startRouteVehicleAnimation).not.toHaveBeenCalled()
    expect(nav.renderRoutesOnly).not.toHaveBeenCalled()
  })

  it('Given 旧 render 在飞 When clear 并启动新 render Then 新任务不复用旧 promise', async () => {
    const { mock, nav, finish } = setup()
    const oldTask = mock.render()
    mock.clear()
    const newTask = mock.render()
    expect(newTask).not.toBe(oldTask)
    finish()
    await oldTask
    expect(nav.renderRouteAlternatives).not.toHaveBeenCalled()
    finish(3)
    await expect(newTask).resolves.toHaveLength(3)
    expect(nav.renderRouteAlternatives).toHaveBeenCalledTimes(1)
  })

  it('Given 活跃 render When destroy 后响应和新调用到达 Then 永不再绘图', async () => {
    const { mock, nav, finish } = setup()
    const task = mock.render()
    const destroy = Reflect.get(mock, 'destroy')
    expect(destroy).toBeTypeOf('function')
    destroy()
    finish()
    await task
    await mock.render()
    await mock.simulate()
    expect(nav.renderRouteAlternatives).not.toHaveBeenCalled()
    expect(nav.fetchRouteAlternatives).toHaveBeenCalledTimes(3)
  })

  it('Given 正常新上下文 When simulate 等待首次 render 完成 Then 按原行为绘路线并模拟三组车辆', async () => {
    const { mock, nav, finish } = setup()
    const task = mock.simulate()
    const generation = mock.getGeneration()
    expect(mock.isCurrent(generation)).toBe(true)
    finish()
    await task
    expect(nav.renderRouteAlternatives).toHaveBeenCalledTimes(1)
    expect(nav.renderRoutesOnly).toHaveBeenCalledTimes(1)
    expect(nav.startRouteVehicleAnimation).toHaveBeenCalledTimes(1)
    expect(nav.setRouteVehicleGroups.mock.calls[0][0]).toHaveLength(3)
    mock.clear()
    expect(mock.isCurrent(generation)).toBe(false)
  })
})
