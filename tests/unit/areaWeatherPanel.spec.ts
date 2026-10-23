import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getWFSFeatures = vi.fn()

vi.mock('@/apis/geoserver', () => ({
  geoserverApi: {
    getWFSFeatures: (...args: unknown[]) => getWFSFeatures(...args),
  },
}))

const weatherMock = vi.fn()
vi.mock('@/apis/amap', () => ({
  weather: (...args: unknown[]) => weatherMock(...args),
}))

const areaFeatures = (list: Array<Record<string, unknown>>) => ({
  features: list.map((properties) => ({ type: 'Feature', geometry: null, properties })),
})

const node = (code: string, name: string, level: number, parent: string, seq = 1) => ({
  area_code: code,
  area_name: name,
  addrlevel_id: level,
  parent_code: parent,
  seq,
})

/**
 * 行政区划面板的数据契约：
 * Given 层级查询与天气查询都走指定的数据源
 * When 面板加载默认区划、选中下级、选中街道
 * Then 查询参数用 parent_code / area_code 正确下钻，街道级天气回退到上级区划，围栏优先 GeoServer 再 DataV
 */
describe('行政区划面板：层级下钻 / 天气回退 / 围栏兜底', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('datav.aliyun.com')) {
        // 真实服务只有省/市/区县级边界，街道级 404
        const code = url.split('/').pop()?.replace('.json', '') ?? ''
        if (code.length > 6) {
          return { ok: false, status: 404, json: async () => ({ features: [] }) } as unknown as Response
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            features: [
              {
                type: 'Feature',
                geometry: { type: 'MultiPolygon', coordinates: [[[[116.3, 39.9]]]] },
                properties: { adcode: Number(code), name: '东城区' },
              },
            ],
          }),
        } as unknown as Response
      }
      return { ok: true, json: async () => ({ features: [] }) } as unknown as Response
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('层级查询用 parent_code 下钻并按 seq 排序', async () => {
    const { fetchAreaChildren } = await import('@/apis/envArea')
    getWFSFeatures.mockResolvedValue(
      areaFeatures([node('110102', '西城区', 2, '110000', 20), node('110101', '东城区', 2, '110000', 2)]),
    )

    const list = await fetchAreaChildren('110000')

    expect(getWFSFeatures).toHaveBeenCalledTimes(1)
    const params = getWFSFeatures.mock.calls[0][0] as Record<string, string>
    expect(params.typeName).toBe('gis:env_area')
    expect(params.cql_filter).toBe("parent_code='110000'")
    expect(list.map((item) => item.areaName)).toEqual(['东城区', '西城区'])
    expect(list[0]).toMatchObject({ areaCode: '110101', parentCode: '110000', level: 2 })
  })

  it('围栏优先取 GeoServer，命中不到才回退 DataV 边界', async () => {
    const { fetchAreaFence, fetchAreaBoundary } = await import('@/apis/envArea')

    getWFSFeatures.mockResolvedValue({
      features: [
        {
          type: 'Feature',
          geometry: { type: 'MultiPolygon', coordinates: [[[[116.3, 39.9]]]] },
          properties: { area_id: '110101', area_name: '东城区' },
        },
      ],
    })
    const fence = await fetchAreaFence('110101')
    expect(fence).not.toBeNull()
    expect(fence?.areaName).toBe('东城区')

    // GeoServer 无数据时，DataV 兜底拿到 MultiPolygon
    getWFSFeatures.mockResolvedValue({ features: [] })
    const boundary = await fetchAreaBoundary('110101')
    expect(boundary).not.toBeNull()
    expect(boundary?.geometry.type).toBe('MultiPolygon')
  })

  it('街道级天气回退到上级区划', async () => {
    const port = {
      areaFenceHighlight: vi.fn(),
      areaFenceClear: vi.fn(),
    }
    const { AreaWeatherController } = await import('@/controller/core/business/AreaWeatherController')

    getWFSFeatures.mockImplementation(async (params: Record<string, string>) => {
      const filter = params.cql_filter ?? ''
      if (filter.includes('parent_code')) return areaFeatures([])
      if (filter.includes("area_code='110101001'")) {
        return areaFeatures([node('110101001', '东华门街道', 3, '110101')])
      }
      if (filter.includes("area_code='110101'")) {
        return areaFeatures([node('110101', '东城区', 2, '110000')])
      }
      return areaFeatures([])
    })
    weatherMock.mockImplementation(async ({ city }: { city: string }) => {
      if (city === '110101001') return { lives: [{ temperature: null }] }
      return { lives: [{ city: '东城区', temperature: '13', weather: '阴', reporttime: '2026-10-22 18:39:23' }] }
    })

    const controller = new AreaWeatherController(port as never)
    await controller.selectArea('110101001')

    // 街道查不到天气 → 回退到所属区县的 adcode
    expect(weatherMock).toHaveBeenCalledWith({ city: '110101001' })
    expect(weatherMock).toHaveBeenCalledWith({ city: '110101' })
    const state = controller.getState().value
    expect(state.live?.temperature).toBe('13')
    expect(state.liveSourceName).toBe('东城区')
  })

  it('街道级围栏缺失时回退到上级区划的围栏', async () => {
    const port = {
      areaFenceHighlight: vi.fn(),
      areaFenceClear: vi.fn(),
    }
    const { AreaWeatherController } = await import('@/controller/core/business/AreaWeatherController')

    getWFSFeatures.mockImplementation(async (params: Record<string, string>) => {
      const filter = params.cql_filter ?? ''
      if (filter.includes('parent_code')) return areaFeatures([])
      if (filter.includes("area_code='110101001'")) {
        return areaFeatures([node('110101001', '东华门街道', 3, '110101')])
      }
      if (filter.includes("area_code='110101'")) {
        return areaFeatures([node('110101', '东城区', 2, '110000')])
      }
      if (filter.includes("area_id='110101'")) {
        return {
          features: [
            {
              type: 'Feature',
              geometry: { type: 'MultiPolygon', coordinates: [[[[116.3, 39.9]]]] },
              properties: { area_id: '110101', area_name: '东城区' },
            },
          ],
        }
      }
      return areaFeatures([])
    })

    const controller = new AreaWeatherController(port as never)
    await controller.selectArea('110101001')

    expect(port.areaFenceHighlight).toHaveBeenCalledTimes(1)
    const payload = port.areaFenceHighlight.mock.calls[0][0] as { areaCode: string; flash: boolean }
    expect(payload.areaCode).toBe('110101')
    expect(payload.flash).toBe(true)
    expect(controller.getState().value.fenceMissing).toBe(false)
  })

  it('区划码非前缀关系时用 env_area 子级拼 IN 列表查队站', async () => {
    const { fetchJurisdictionStations, collectAreaCodeTree } = await import('@/apis/envArea')

    // 北京：110000 → 110101 / 110105…，不是 1100001x
    getWFSFeatures.mockImplementation(async (params: Record<string, string>) => {
      const filter = params.cql_filter ?? ''
      if (filter === "parent_code='110000'") {
        return areaFeatures([node('110101', '东城区', 2, '110000'), node('110105', '朝阳区', 2, '110000')])
      }
      if (filter === "parent_code='110101'") {
        return areaFeatures([node('110101001', '东华门街道', 3, '110101')])
      }
      if (params.typeName === 'gis:view_res_org_dept') {
        return {
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [116.42, 39.95] },
              properties: {
                id: 'st-1',
                org_name: '东城消防救援支队和平里小型消防站',
                area_id: '110101',
                longitude: 116.42,
                latitude: 39.95,
              },
            },
          ],
        }
      }
      return areaFeatures([])
    })

    const codes = await collectAreaCodeTree('110000')
    expect(codes).toContain('110101')
    expect(codes).toContain('110105')
    expect(codes).toContain('110101001')

    const stations = await fetchJurisdictionStations('110000', new Map([['110101', '东城区']]))
    expect(stations).toHaveLength(1)
    expect(stations[0].name).toBe('东城消防救援支队和平里小型消防站')
    expect(stations[0].areaName).toBe('东城区')

    // 队站查询必须用 IN 列表而不是 LIKE 前缀
    const orgCall = getWFSFeatures.mock.calls.find(
      (call) => (call[0] as Record<string, string>).typeName === 'gis:view_res_org_dept',
    )
    const filter = (orgCall?.[0] as Record<string, string>).cql_filter
    expect(filter).toContain('area_id IN (')
    expect(filter).toContain("'110101'")
    expect(filter).not.toContain('LIKE')
  })

  it('队站辖区带几何与区划名，选中队站下发围栏高亮', async () => {
    const port = {
      areaFenceHighlight: vi.fn(),
      areaFenceClear: vi.fn(),
    }
    const { AreaWeatherController } = await import('@/controller/core/business/AreaWeatherController')

    getWFSFeatures.mockImplementation(async (params: Record<string, string>) => {
      const filter = params.cql_filter ?? ''
      if (filter === "area_code='110000'") {
        return areaFeatures([node('110000', '北京市', 1, '1')])
      }
      if (filter === "parent_code='110000'") {
        return areaFeatures([node('110101', '东城区', 2, '110000')])
      }
      if (filter === "parent_code='110101'") return areaFeatures([])
      if (params.typeName === 'gis:view_res_org_dept') {
        return {
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [116.42, 39.95] },
              properties: {
                id: 'st-1',
                org_name: '东城消防救援支队和平里小型消防站',
                area_id: '110101',
                longitude: 116.42,
                latitude: 39.95,
              },
            },
          ],
        }
      }
      if (params.typeName === 'gis:view_juris_zone') {
        return {
          features: [
            {
              type: 'Feature',
              geometry: { type: 'MultiPolygon', coordinates: [[[[116.4, 39.9]]]] },
              properties: { zone_id: 'st-1', zone_name: '和平里小型消防站', area_id: '110101' },
            },
          ],
        }
      }
      return areaFeatures([])
    })
    weatherMock.mockResolvedValue({
      lives: [{ city: '北京市', temperature: '13', weather: '晴', reporttime: '2026-10-23 11:00:00' }],
    })

    const controller = new AreaWeatherController(port as never)
    await controller.init('110000')

    const state = controller.getState().value
    expect(state.stations).toHaveLength(1)
    expect(state.zones).toHaveLength(1)
    expect(state.zones[0].zoneId).toBe('st-1')

    await controller.selectStation('st-1')
    expect(port.areaFenceHighlight).toHaveBeenCalledWith(
      expect.objectContaining({ areaCode: '110101', areaName: '和平里小型消防站', flash: true }),
    )
  })
})
