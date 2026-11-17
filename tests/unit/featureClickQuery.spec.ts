/**
 * FeatureClickQuery 点击取数管道测试。
 *
 * 待测接缝（外部接口即测试面，不触碰 resolveClick / queryGenericFeature 等私有实现）：
 * - activate / deactivate：singleclick 挂载与摘除
 * - addBusinessHandler：特化 handler 优先级链、注销、回落
 * - showStation / close / getOpenStationId：通用面板开合与队站 id
 * - destroy：终态释放（监听 + handler + overlay）
 *
 * 能拦住什么：双弹窗回归、handler 抢占后无输出、overlay 泄漏、handler 未注销。
 * 会漏掉什么：真实 GeoServer 返回内容、WMS 命中精度（需人工在浏览器复核）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getWMSFeatureInfo = vi.fn()

vi.mock('@/apis/geoserver', () => ({
  geoserverApi: {
    getWMSServiceUrl: () => '/geoserver/wms',
    getWMSFeatureInfo: (...args: unknown[]) => getWMSFeatureInfo(...args),
  },
}))

vi.mock('@/store', () => ({
  usePanelStore: () => ({ circleOpen: false, circleCenter: [] }),
}))

vi.mock('@/store/useLayersStore', () => ({
  useLayersStore: () => ({ items: [], checkedIds: [] }),
}))

vi.mock('@/components/map/MapTools', () => ({ ALL_RESOURCE_TYPES: [] }))

vi.mock('ol/Overlay', () => ({
  default: class {
    element: HTMLElement
    constructor(options: { element: HTMLElement }) {
      this.element = options.element
    }
    setPosition(position?: number[]) {
      ;(this as unknown as { position?: number[] }).position = position
    }
  },
}))

import {
  FeatureClickQuery,
  type FeatureClickResult,
} from '@/baseComponent/OpenlayersMap/FeatureClickQuery'

/** 构造 OL Map 替身：记录 overlay 增删与 singleclick 监听 */
const createFakeMap = () => {
  const addOverlay = vi.fn()
  const removeOverlay = vi.fn()
  const listeners: Array<(evt: unknown) => void> = []
  const fakeKey = {
    target: { removeEventListener: vi.fn() },
    listener: vi.fn(),
    type: 'singleclick',
  }
  const map = {
    addOverlay,
    removeOverlay,
    on: vi.fn((_type: string, handler: (evt: unknown) => void) => {
      listeners.push(handler)
      return fakeKey
    }),
    getLayers: () => ({ getArray: () => [] }),
    getView: () => ({
      getResolution: () => 1,
      getProjection: () => ({ getCode: () => 'EPSG:3857' }),
      getZoom: () => 10,
    }),
    forEachFeatureAtPixel: vi.fn(() => undefined),
    hasFeatureAtPixel: vi.fn(() => false),
  }
  return { map, addOverlay, removeOverlay, listeners, fakeKey }
}

const stationResult: FeatureClickResult = {
  kind: 'station',
  stationId: 'station-1',
  name: '南山消防站',
  address: '科技园路 1 号',
  coordinate: [1, 2],
  source: 'wmsStation',
}

describe('FeatureClickQuery 公共点击取数管道', () => {
  beforeEach(() => {
    getWMSFeatureInfo.mockReset()
    getWMSFeatureInfo.mockResolvedValue({ features: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Given 激活 When 重复 activate Then 只挂载一个 singleclick 监听', () => {
    const { map } = createFakeMap()
    const fcq = new FeatureClickQuery(map as never)
    fcq.activate()
    fcq.activate()
    expect(map.on).toHaveBeenCalledTimes(1)
    expect(map.on).toHaveBeenCalledWith('singleclick', expect.any(Function))
  })

  it('Given 已注册 handler When handler 接管 Then 通用面板不创建（不产生第二个弹窗）', async () => {
    const { map, addOverlay } = createFakeMap()
    const fcq = new FeatureClickQuery(map as never)
    const handled = vi.fn(() => true)
    fcq.addBusinessHandler(handled)

    await (fcq as unknown as { route: (r: FeatureClickResult) => Promise<void> }).route(stationResult)

    expect(handled).toHaveBeenCalledTimes(1)
    expect(addOverlay).not.toHaveBeenCalled()
  })

  it('Given handler 返回 false When 路由点击 Then 回落通用面板', async () => {
    const { map, addOverlay } = createFakeMap()
    const fcq = new FeatureClickQuery(map as never)
    fcq.addBusinessHandler(() => false)

    await (fcq as unknown as { route: (r: FeatureClickResult) => Promise<void> }).route(stationResult)

    expect(addOverlay).toHaveBeenCalledTimes(1)
  })

  it('Given 多个 handler When 前一个接管 Then 后一个不参与判定', async () => {
    const { map, addOverlay } = createFakeMap()
    const fcq = new FeatureClickQuery(map as never)
    const first = vi.fn(() => true)
    const second = vi.fn(() => true)
    fcq.addBusinessHandler(first)
    fcq.addBusinessHandler(second)

    await (fcq as unknown as { route: (r: FeatureClickResult) => Promise<void> }).route(stationResult)

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    expect(addOverlay).not.toHaveBeenCalled()
  })

  it('Given handler 注销 When 再次路由 Then 回落通用面板', async () => {
    const { map, addOverlay } = createFakeMap()
    const fcq = new FeatureClickQuery(map as never)
    const handler = vi.fn(() => true)
    const unsubscribe = fcq.addBusinessHandler(handler)
    unsubscribe()

    await (fcq as unknown as { route: (r: FeatureClickResult) => Promise<void> }).route(stationResult)

    expect(handler).not.toHaveBeenCalled()
    expect(addOverlay).toHaveBeenCalledTimes(1)
  })

  it('Given 异步 handler When 接管 Then 通用面板仍被抑制', async () => {
    const { map, addOverlay } = createFakeMap()
    const fcq = new FeatureClickQuery(map as never)
    fcq.addBusinessHandler(async () => true)

    await (fcq as unknown as { route: (r: FeatureClickResult) => Promise<void> }).route(stationResult)

    expect(addOverlay).not.toHaveBeenCalled()
  })

  it('Given 打开队站面板 When close Then 队站 id 清空', () => {
    const { map } = createFakeMap()
    const fcq = new FeatureClickQuery(map as never)
    fcq.showStation({ id: 'station-1', name: '南山消防站', address: '科技园路 1 号', coordinate: [1, 2] })
    expect(fcq.getOpenStationId()).toBe('station-1')
    fcq.close()
    expect(fcq.getOpenStationId()).toBeNull()
  })

  it('Given destroy When 调用 Then 摘除监听、清空 handler 并移除 overlay', () => {
    const { map, addOverlay, removeOverlay } = createFakeMap()
    const fcq = new FeatureClickQuery(map as never)
    fcq.activate()
    fcq.addBusinessHandler(() => true)
    fcq.showStation({ id: 'station-1', name: '南山消防站', address: '科技园路 1 号', coordinate: [1, 2] })
    expect(addOverlay).toHaveBeenCalledTimes(1)

    fcq.destroy()

    // unByKey 会清空 key.target，监听已摘除
    expect(removeOverlay).toHaveBeenCalledTimes(1)
  })
})
