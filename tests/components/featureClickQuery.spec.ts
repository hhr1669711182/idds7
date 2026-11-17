/**
 * FeatureClickQuery 点击取数链路单测（回归「特化优先、通用兜底」共存语义）。
 *
 * 覆盖用户要求的三条路径 + 一条空点击兜底：
 *  1. 命中主管矢量队站 + 特化 handler 接管 → 归一化 station 结果，抑制通用面板
 *  2. 命中主管矢量队站 + 无 handler → 归一化 station 结果，回落通用面板 openStation
 *  3. 未命中队站的普通 WMS 要素 + handler 放行 → 归一化 feature 结果，回落通用面板 openFeature
 *  4. 空点击（无主管图标 / 无 WMS 要素）→ 关闭已打开面板
 *
 * 用 fake map 驱动唯一 singleclick 监听，mock 掉取数接口 / 默认面板 / 图层 store / TileWMS，
 * 只验证「命中级联 → 归一化 → route 决策」这条最容易回归的链路，避免真实 OL 投影数学。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Map from 'ol/Map'
import { FeatureClickQuery } from '@/baseComponent/OpenlayersMap/FeatureClickQuery'
import { geoserverApi } from '@/apis/geoserver'

// 公共默认面板 mock：可观察 openStation/openFeature 是否被调用，验证「接管 vs 回落」
const panelHarness = vi.hoisted(() => ({
  panel: {
    openStation: vi.fn(),
    openFeature: vi.fn(),
    close: vi.fn(),
    getOpenStationId: vi.fn(() => null),
    destroy: vi.fn(),
  },
}))

vi.mock('@/baseComponent/OpenlayersMap/overlay/featureDetailPanel', () => ({
  createFeatureDetailPanel: () => panelHarness.panel,
}))

// 取数接口：getWMSFeatureInfo 逐用例控制返回
vi.mock('@/apis/geoserver', () => ({
  geoserverApi: {
    getWMSServiceUrl: () => '/geoserver/gis/wms',
    getWMSFeatureInfo: vi.fn(),
  },
}))

// 图层 store / 面板 store：普通对象即可（配合下方 storeToRefs 身份 mock）
vi.mock('@/store', () => ({ usePanelStore: () => ({ circleOpen: false }) }))
vi.mock('@/store/useLayersStore', () => ({
  useLayersStore: () => ({
    // 必须给一个可勾选层 + 对应 item，否则 queryLayers 恒空、queryGenericFeature
    // 在 `if (!queryLayers.length) return null` 处短路，通用取数路径（路径3）走不到。
    checkedIds: { value: ['gis:view_env_water'] },
    items: { value: [{ id: 'gis:view_env_water', useWebMock: false, noEsSearch: false }] },
  }),
}))
// 让 storeToRefs(fakeStore) 直接返回 store 自身，从而 checkedIds.value / items.value 生效
vi.mock('pinia', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pinia')>()
  return { ...actual, storeToRefs: (store: unknown) => store }
})

// TileWMS：getFeatureInfoUrl 返回固定查询串 URL，避免真实 OL 投影数学在 fake projection 上崩溃
vi.mock('ol/source/TileWMS', () => ({
  default: class TileWMS {
    getFeatureInfoUrl() {
      return '/geoserver/gis/wms?BBOX=0+0+1+1&WIDTH=100&HEIGHT=100&X=5&Y=5&SERVICE=WMS&VERSION=1.1.0'
    }
  },
}))

// 纯常量 / 轻量工具：避免拉起重依赖
vi.mock('@/components/map/MapTools', () => ({ ALL_RESOURCE_TYPES: [] }))
vi.mock('@/utils/cql', () => ({ buildMultiLayerCql: (parts: string[]) => parts.join(',') }))
vi.mock('@/controller/core/business/IncidentStationQuery', () => ({
  STATION_LAYER_NAME: 'gis:view_res_org_dept',
}))

/** 构造主管队站矢量要素（forEachFeatureAtPixel 直接返回，绕过 OL 像素命中） */
const makePrimaryStationFeature = () => ({
  get: (key: string) =>
    key === 'data'
      ? { stationId: 'S1', name: '主管消防站', address: '幸福路 1 号' }
      : undefined,
  getGeometry: () => ({ getCoordinates: () => [111, 222] }),
})

/**
 * 构造 fake map，驱动 FeatureClickQuery 的唯一 singleclick 监听。
 * - primaryFeature：命中主管矢量图标（forEachFeatureAtPixel 返回值）
 * - 无队站 WMS 图层（getLayers 为空），使 resolveWmsStation 返回 null，走通用要素取数
 */
const makeFakeMap = (primaryFeature: unknown = undefined) => {
  const singleclickListeners: Array<(...args: unknown[]) => unknown> = []
  const map = {
    on: (type: string, listener: (...args: unknown[]) => unknown) => {
      if (type === 'singleclick') singleclickListeners.push(listener)
      // unByKey 会调用 target.removeEventListener 摘监听，替身需提供该方法
      return { target: { removeEventListener: vi.fn() }, type, key: {} }
    },
    forEachFeatureAtPixel: () => primaryFeature,
    hasFeatureAtPixel: () => false,
    getLayers: () => ({ getArray: () => [] as unknown[] }),
    getView: () => ({
      getZoom: () => 14,
      getResolution: () => 10,
      getProjection: () => ({ getCode: () => 'EPSG:4326' }),
    }),
    addOverlay: vi.fn(),
    removeOverlay: vi.fn(),
  }
  const fireSingleClick = async (evt: { pixel: number[]; coordinate: number[] }) => {
    await Promise.all(singleclickListeners.map((listener) => listener(evt)))
  }
  return { map: map as unknown as Map, fireSingleClick }
}

beforeEach(() => {
  panelHarness.panel.openStation.mockClear()
  panelHarness.panel.openFeature.mockClear()
  panelHarness.panel.close.mockClear()
  panelHarness.panel.destroy.mockClear()
  panelHarness.panel.getOpenStationId.mockClear()
  ;(geoserverApi.getWMSFeatureInfo as ReturnType<typeof vi.fn>).mockReset()
})

describe('FeatureClickQuery 点击取数链路', () => {
  it('路径1：命中主管矢量队站且 handler 接管 → 归一化 station 结果并抑制通用面板', async () => {
    const { map, fireSingleClick } = makeFakeMap(makePrimaryStationFeature())
    const fcq = new FeatureClickQuery(map)
    fcq.activate()

    const seen: unknown[] = []
    fcq.addBusinessHandler((result) => {
      seen.push(result)
      return result.kind === 'station' && result.stationId === 'S1'
    })

    await fireSingleClick({ pixel: [0, 0], coordinate: [111, 222] })

    expect(seen).toHaveLength(1)
    const hit = seen[0] as {
      kind: string
      stationId: string
      name: string
      address: string
      source: string
      coordinate: number[]
    }
    expect(hit.kind).toBe('station')
    expect(hit.stationId).toBe('S1')
    expect(hit.source).toBe('primaryVector')
    expect(hit.name).toBe('主管消防站')
    expect(hit.address).toBe('幸福路 1 号')
    expect(hit.coordinate).toEqual([111, 222])
    // handler 接管后，通用面板不应被打开
    expect(panelHarness.panel.openStation).not.toHaveBeenCalled()
    expect(panelHarness.panel.openFeature).not.toHaveBeenCalled()
  })

  it('路径2：命中主管矢量队站且无 handler → 归一化 station 结果回落通用面板 openStation', async () => {
    const { map, fireSingleClick } = makeFakeMap(makePrimaryStationFeature())
    const fcq = new FeatureClickQuery(map)
    fcq.activate()

    await fireSingleClick({ pixel: [0, 0], coordinate: [111, 222] })

    expect(panelHarness.panel.openStation).toHaveBeenCalledTimes(1)
    expect(panelHarness.panel.openStation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'S1',
        name: '主管消防站',
        address: '幸福路 1 号',
        coordinate: [111, 222],
      }),
    )
    expect(panelHarness.panel.openFeature).not.toHaveBeenCalled()
  })

  it('路径3：未命中队站的普通 WMS 要素 → handler 放行时回落通用面板 openFeature', async () => {
    const { map, fireSingleClick } = makeFakeMap()
    const fcq = new FeatureClickQuery(map)
    fcq.activate()

    // 特化 handler 对非本业务要素放行（返回 false），验证「范围外回落通用」
    let sawFeature = false
    fcq.addBusinessHandler((result) => {
      sawFeature = result.kind === 'feature'
      return false
    })

    const wmsFeature = {
      id: 'env_fire_water.7',
      properties: { name: '某消防栓', address: '某地址', water_name: '某消防栓' },
      geometry: { type: 'Point', coordinates: [111, 222] },
    }
    ;(geoserverApi.getWMSFeatureInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      features: [wmsFeature],
    })

    await fireSingleClick({ pixel: [0, 0], coordinate: [111, 222] })

    expect(sawFeature).toBe(true)
    expect(panelHarness.panel.openFeature).toHaveBeenCalledTimes(1)
    expect(panelHarness.panel.openFeature).toHaveBeenCalledWith(
      [111, 222],
      expect.objectContaining({ id: 'env_fire_water.7' }),
      expect.anything(),
    )
    expect(panelHarness.panel.openStation).not.toHaveBeenCalled()
  })

  it('路径4：空点击（无主管图标且无 WMS 要素命中）→ 保持已打开面板，仅手动按钮可关', async () => {
    const { map, fireSingleClick } = makeFakeMap()
    const fcq = new FeatureClickQuery(map)
    fcq.activate()
    ;(geoserverApi.getWMSFeatureInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
      features: [],
    })

    // 先程序化打开一个队站面板，再点击空白处（无矢量命中、无 WMS 命中）应保持面板现状
    fcq.showStation({ id: 'S1', name: '主管消防站', address: '幸福路 1 号', coordinate: [111, 222] })
    await fireSingleClick({ pixel: [9, 9], coordinate: [9, 9] })

    // 空白点击：不产生新的 openFeature、也不自动关闭已打开面板（保持现状，仅手动按钮可关）
    expect(panelHarness.panel.openStation).toHaveBeenCalledTimes(1)
    expect(panelHarness.panel.openFeature).not.toHaveBeenCalled()
    expect(panelHarness.panel.close).not.toHaveBeenCalled()
  })

  it('destroy：停监听、注销 handler 并销毁默认面板（含移除 overlay）', async () => {
    const { map, fireSingleClick } = makeFakeMap(makePrimaryStationFeature())
    const fcq = new FeatureClickQuery(map)
    fcq.activate()
    // 先注册再注销 handler，模拟业务方销毁（回落通用兜底）
    const unsub = fcq.addBusinessHandler(() => true)
    unsub()

    // 先打开一次队站面板，使默认面板被惰性创建
    await fireSingleClick({ pixel: [0, 0], coordinate: [111, 222] })
    expect(panelHarness.panel.openStation).toHaveBeenCalledTimes(1)

    fcq.destroy()

    // destroy 应销毁默认面板（close + 从地图移除 overlay）
    expect(panelHarness.panel.destroy).toHaveBeenCalledTimes(1)
  })
})
