import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { geoserverApi } from '@/service/geoserver'
import {
  BUILDING_LAYER_NAME,
  FIRE_HYDRANT_LAYER_NAME,
  JURIS_ZONE_LAYER_NAME,
  KEY_ENTERPRISE_LAYER_NAME,
  queryIncidentNearbyResources,
} from '@/controller/core/business/IncidentNearbyResourceQuery'
import {
  useIncidentLocationStore,
  useNearbyResourceLayerStore,
  useStationLayerStore,
} from '@/store/useIncidentLocationStore'
import { MESSAGE_CHANNEL, MESSAGE_EVENT_KEY, MESSAGE_SYSTEM } from '@/const/const.message.type'

vi.mock('@/service/geoserver', () => ({ geoserverApi: { getWFSFeatures: vi.fn() } }))
vi.mock('@/store', () => ({ useUserStore: vi.fn() }))
vi.mock('@/controller/core/business/IncidentStationQuery', () => ({
  queryIncidentStations: vi.fn(async () => ({
    primary: { id: 'primary', name: 'primary', address: '', coordinate: [113, 22], distanceMeters: 1 },
    support: [],
    jurisdictions: new Map(),
    incidentJurisdiction: null,
    searchRadiusMeters: 10000,
  })),
}))

const layers = [FIRE_HYDRANT_LAYER_NAME, KEY_ENTERPRISE_LAYER_NAME, JURIS_ZONE_LAYER_NAME, BUILDING_LAYER_NAME]
const resource = { properties: { id: 'hydrant', longitude: 113.93, latitude: 22.53, water_name: '消防栓' } }

describe('F1 nearby partial failure recovery', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(geoserverApi.getWFSFeatures).mockReset()
  })

  it.each(layers)(
    'Given 图层 %s 失败 When 周边查询完成 Then 报告不完整且保留成功资源；回归 F1 P2',
    async (failedLayer) => {
      vi.mocked(geoserverApi.getWFSFeatures).mockImplementation(async (options) => {
        if (options.typeName === failedLayer) throw new Error('offline')
        return { features: [resource] }
      })
      const result = await queryIncidentNearbyResources([113.93, 22.53])
      expect(result).toMatchObject({ complete: false })
      expect(Object.values(result).filter(Array.isArray).flat()).toHaveLength(3)
    },
  )

  it('Given station 成功而 resource 部分失败 When 恢复后重挂载 Then 重试并仅完整成功后去重；回归 F1 P2', async () => {
    let offline = true
    vi.mocked(geoserverApi.getWFSFeatures).mockImplementation(async (options) => {
      if (offline && options.typeName === BUILDING_LAYER_NAME) throw new Error('offline')
      return { features: options.typeName === FIRE_HYDRANT_LAYER_NAME ? [resource] : [] }
    })
    const store = useIncidentLocationStore()
    store.onAddressUpdated({
      id: 'nearby-retry',
      timestamp: 1,
      channel: MESSAGE_CHANNEL.WS,
      system: MESSAGE_SYSTEM.IDS_SEAT_WEB,
      eventKey: MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED,
      data: { incidentId: 'A', version: 1, slots: { longitude: '113.93', latitude: '22.53', m_org_id: 'primary' } },
    })
    await flushPromises()
    expect(store.primaryStations.A.stationId).toBe('primary')
    expect(store.nearbyResources.A.fireHydrants.map((entry) => entry.id)).toEqual(['hydrant'])
    expect(useStationLayerStore().entries['loc:A']).toEqual(['primary'])
    expect(useNearbyResourceLayerStore().entries['locres:A']).toHaveLength(1)
    expect(geoserverApi.getWFSFeatures).toHaveBeenCalledTimes(4)
    offline = false
    store.restoreOnMapMount()
    await flushPromises()
    expect(geoserverApi.getWFSFeatures).toHaveBeenCalledTimes(8)
    store.restoreOnMapMount()
    await flushPromises()
    expect(geoserverApi.getWFSFeatures).toHaveBeenCalledTimes(8)
    expect(store.nearbyResources.A.fireHydrants.map((entry) => entry.id)).toEqual(['hydrant'])
  })
})
