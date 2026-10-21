import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  useIncidentLocationStore,
  useStationLayerStore,
  useNearbyResourceLayerStore,
} from '@/store/useIncidentLocationStore'
import { MESSAGE_CHANNEL, MESSAGE_EVENT_KEY, MESSAGE_SYSTEM } from '@/const/const.message.type'
import type { AddressUpdatedData } from '@/controller/core/protocol/IncidentLocationProtocol'
import type { MessageEnvelope } from '@/types/message'
import { normalizeIncidentLocationContent } from '@/utils/incidentLocation'

const queries = vi.hoisted(() => ({ stations: vi.fn(), nearby: vi.fn() }))
vi.mock('@/controller/core/business/IncidentStationQuery', () => ({ queryIncidentStations: queries.stations }))
vi.mock('@/controller/core/business/IncidentNearbyResourceQuery', () => ({
  DEFAULT_NEARBY_RESOURCE_RADIUS_METERS: 500,
  queryIncidentNearbyResources: queries.nearby,
}))
vi.mock('@/store', () => ({ useUserStore: vi.fn() }))

const update = (
  version: number,
  slots: Record<string, string | null>,
  incidentId = 'A',
  full = false,
): MessageEnvelope<AddressUpdatedData> => ({
  id: `test-${incidentId}-${version}`,
  timestamp: 1,
  channel: MESSAGE_CHANNEL.WS,
  system: MESSAGE_SYSTEM.IDS_SEAT_WEB,
  eventKey: MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED,
  meta: { snapshotKind: full ? 'full' : 'delta' },
  data: {
    incidentId,
    disasterProfileId: `profile-${incidentId}`,
    version,
    slots,
    address: slots.disaster_address ?? null,
    longitude: slots.longitude == null ? null : Number(slots.longitude),
    latitude: slots.latitude == null ? null : Number(slots.latitude),
    primaryStationId: slots.m_org_id ?? null,
  },
})

const coordinates = { longitude: '113.93', latitude: '22.53', m_org_id: 'primary' }
const stationResult = (id: string) => ({
  primary: { id, name: id, address: id, coordinate: [113, 22], distanceMeters: 1 },
  support: [{ id: 'support', name: 'support', address: '', coordinate: [114, 23], distanceMeters: 2 }],
  jurisdictions: new Map(),
  incidentJurisdiction: null,
  searchRadiusMeters: 10000,
})
const emptyNearby = { complete: true, fireHydrants: [], keyEnterprises: [], jurisZones: [], buildings: [] }
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const restorePersistedLocation = () => {
  const original = useIncidentLocationStore()
  original.setContext({ incidentId: 'A', stage: 'dispatch', sessionEpoch: 7, sessionKey: 'session-seat' })
  original.onAddressUpdated(update(9, coordinates, 'A', true))
  const persisted = JSON.parse(
    JSON.stringify({
      markers: original.markers,
      versions: original.versions,
      profileSnapshots: original.profileSnapshots,
      activeKey: original.activeKey,
      context: original.context,
    }),
  )
  setActivePinia(createPinia())
  const restored = useIncidentLocationStore()
  restored.$patch(persisted)
  return restored
}

describe('F1 incident location acceptance', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    queries.stations.mockReset().mockImplementation(() => new Promise(() => {}))
    queries.nearby.mockReset().mockImplementation(() => new Promise(() => {}))
  })

  it('Given 持久化 epoch 7 When 同 session/seat/incident 刷新后首次绑定 epoch 1 Then 保留槽位点位版本；回归 F1 P1', () => {
    const store = restorePersistedLocation()
    store.setContext({ incidentId: 'A', stage: 'dispatch', sessionEpoch: 1, sessionKey: 'session-seat' })
    expect(store.markers.A).toMatchObject({ lng: 113.93, lat: 22.53, version: 9 })
    expect(store.profileSnapshots.A.slots).toEqual(coordinates)
    expect(store.versions.A).toBe(9)
    expect(store.activeKey).toBe('A')
    expect(store.context?.sessionEpoch).toBe(1)
    expect(store.onAddressUpdated(update(8, {}, 'A', true))).toMatchObject({ accepted: false, reason: 'version' })
    store.restoreOnMapMount()
    expect(queries.stations).toHaveBeenCalledTimes(2)
  })

  it.each([{ sessionKey: 'other-session-seat' }, { incidentId: 'B' }, { stage: 'inquiry' }])(
    'Given 持久化快照 When 首次绑定稳定身份变化 %j Then 清理旧快照；回归 F1 P1 隔离',
    (changed) => {
      const store = restorePersistedLocation()
      store.setContext({ incidentId: 'A', stage: 'dispatch', sessionEpoch: 1, sessionKey: 'session-seat', ...changed })
      expect(store.markers).toEqual({})
      expect(store.profileSnapshots).toEqual({})
      expect(store.versions).toEqual({})
    },
  )

  it('Given 已绑定运行期上下文 When 同稳定身份 epoch 变化 Then 仍清空并拒绝旧响应；回归 F1 P1 运行期隔离', () => {
    const store = useIncidentLocationStore()
    store.setContext({ incidentId: 'A', stage: 'dispatch', sessionEpoch: 1, sessionKey: 'session-seat' })
    store.onAddressUpdated(update(9, coordinates))
    store.setContext({ incidentId: 'A', stage: 'dispatch', sessionEpoch: 2, sessionKey: 'session-seat' })
    expect(store.markers).toEqual({})
    expect(store.versions).toEqual({})
    const stale = update(10, coordinates)
    stale.meta = { sessionEpoch: 1 }
    expect(store.onAddressUpdated(stale)).toMatchObject({ accepted: false, reason: 'session' })
  })

  it('Given 正式坐标 When delta 的坐标槽位缺少 before/after Then 保留点位且显式 null 仍清除；回归 F1 P2', () => {
    const store = useIncidentLocationStore()
    store.onAddressUpdated(update(1, coordinates))
    const normalized = normalizeIncidentLocationContent({
      incidentId: 'A',
      version: 2,
      slotChanges: [{ slotCode: 'longitude' }],
    })!
    const envelope = update(2, {})
    envelope.data = normalized.data
    expect(store.onAddressUpdated(envelope)).toMatchObject({ accepted: true, coordinateChanged: false })
    expect(store.markers.A).toMatchObject({ lng: 113.93, lat: 22.53 })
    expect(store.profileSnapshots.A.slots.longitude).toBe('113.93')
    expect(queries.stations).toHaveBeenCalledTimes(1)
    store.onAddressUpdated(update(3, { longitude: null }))
    expect(store.markers.A).toBeUndefined()
  })

  it('Given 累计坐标 When 主管增量更新 Then 只重查不重飞，返回 accepted；回归 F1 单一缓存', () => {
    const store = useIncidentLocationStore()
    expect(store.onAddressUpdated(update(1, coordinates))).toMatchObject({ accepted: true, key: 'A' })
    const focus = store.focusRequest
    expect(store.onAddressUpdated(update(2, { m_org_id: 'new' }))).toMatchObject({
      accepted: true,
      coordinateChanged: false,
    })
    expect(store.markers.A).toMatchObject({ lng: 113.93, lat: 22.53, primaryStationId: 'new' })
    expect(store.focusRequest).toEqual(focus)
    expect(queries.stations).toHaveBeenCalledTimes(2)
  })

  it('Given v3 快照 When v2 full 到达 Then 不替换缓存和点位；回归 F1 校验先于 replace', () => {
    const store = useIncidentLocationStore()
    store.onAddressUpdated(update(3, coordinates))
    expect(store.onAddressUpdated(update(2, {}, 'A', true))).toMatchObject({ accepted: false })
    store.onAddressUpdated(update(4, { m_org_id: 'latest' }))
    expect(store.markers.A.lng).toBe(113.93)
    expect(store.profileSnapshots.A.slots.longitude).toBe('113.93')
  })

  it('Given 正式坐标 When null 清空经度 Then 删除点位、owner、待消费路线；回归 F1 显式清空', async () => {
    queries.stations.mockResolvedValue(stationResult('primary'))
    queries.nearby.mockResolvedValue(emptyNearby)
    const store = useIncidentLocationStore()
    store.onAddressUpdated(update(1, coordinates))
    await flush()
    expect(store.routePlanRequest?.origins).toEqual([[113, 22]])
    expect(store.zones).toEqual({})
    store.onAddressUpdated(update(2, { longitude: null }))
    expect(store.markers).toEqual({})
    expect(store.routePlanRequest).toBeNull()
    expect(useStationLayerStore().entries).toEqual({})
    expect(useNearbyResourceLayerStore().entries).toEqual({})
  })

  it('Given 完整旧快照 When full 缺少坐标 Then 清除旧点位且不沿用槽位；回归 F13 全量替换', () => {
    const store = useIncidentLocationStore()
    store.onAddressUpdated(update(1, coordinates))
    store.onAddressUpdated(update(2, { m_org_id: 'other' }, 'A', true))
    expect(store.markers.A).toBeUndefined()
    expect(store.profileSnapshots.A.slots).toEqual({ m_org_id: 'other' })
  })

  it('Given 当前上下文 A When 非 A 或无 identity 输入 Then 拒绝且不清场；回归 F1 归属检查', () => {
    const store = useIncidentLocationStore()
    store.setContext({ incidentId: 'A', stage: 'dispatch', sessionEpoch: 1 })
    store.onAddressUpdated(update(1, coordinates))
    expect(store.onAddressUpdated(update(20, {}, 'B', true))).toMatchObject({ accepted: false, reason: 'identity' })
    const invalid = update(30, {})
    invalid.data.incidentId = null
    invalid.data.disasterProfileId = null
    expect(store.onAddressUpdated(invalid)).toMatchObject({ accepted: false, reason: 'identity' })
    expect(store.markers.A.lng).toBe(113.93)
  })

  it('Given v5 已接受 When 无版本或同版本 full 到达 Then 不回退；回归 F11 跨来源版本', () => {
    const store = useIncidentLocationStore()
    store.onAddressUpdated(update(5, coordinates))
    expect(store.onAddressUpdated(update(0, {}, 'A', true)).accepted).toBe(false)
    expect(store.onAddressUpdated(update(5, {}, 'A', true)).accepted).toBe(false)
    expect(store.versions.A).toBe(5)
  })

  it('Given 已发起 HTTP When WS 接受无版本更新 Then 旧 HTTP 水位不得覆盖；回归 F13 并发', () => {
    const store = useIncidentLocationStore()
    const watermark = store.acceptanceRevision
    store.onAddressUpdated(update(0, coordinates))
    const http = update(0, {}, 'A', true)
    http.meta = { snapshotKind: 'full', source: 'http-profile', requestRevision: watermark }
    expect(store.onAddressUpdated(http)).toMatchObject({ accepted: false, reason: 'watermark' })
    expect(store.markers.A.lng).toBe(113.93)
  })

  it('Given A 旧查询 When clearAll 后相同 A 重建 Then 晚旧响应不能回写；回归 F1 ABA', async () => {
    let finishOld!: (value: ReturnType<typeof stationResult>) => void
    queries.stations.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve
        }),
    )
    const store = useIncidentLocationStore()
    store.onAddressUpdated(update(1, coordinates))
    store.clearAll()
    store.onAddressUpdated(update(1, { ...coordinates, longitude: '114' }))
    finishOld(stationResult('obsolete'))
    await flush()
    expect(store.primaryStations.A).toBeUndefined()
    expect(store.routePlanRequest).toBeNull()
  })

  it('Given 查询在途 When 地图挂载恢复 Then 不重复查询；回归 F1 唯一 query owner', () => {
    const store = useIncidentLocationStore()
    store.onAddressUpdated(update(1, coordinates))
    store.restoreOnMapMount()
    expect(queries.stations).toHaveBeenCalledTimes(1)
    expect(queries.nearby).toHaveBeenCalledTimes(1)
  })

  it('Given 新旧 focus 请求 When 旧消费者确认 Then 保留新请求；回归 F1 消费序号', () => {
    const store = useIncidentLocationStore()
    store.onAddressUpdated(update(1, coordinates))
    const oldSeq = store.focusRequest!.seq
    store.onAddressUpdated(update(2, { longitude: '114' }))
    store.consumeFocus(oldSeq)
    expect(store.focusRequest?.lng).toBe(114)
  })

  it('Given 已关联的画像 When delta 只有 profileId Then 仍归并 incident key；回归 F1 稳定 identity', () => {
    const store = useIncidentLocationStore()
    store.setContext({ incidentId: 'A', stage: 'dispatch', sessionEpoch: 1 })
    store.onAddressUpdated(update(1, coordinates))
    const delta = update(2, { m_org_id: 'new' })
    delta.data.incidentId = null
    expect(store.onAddressUpdated(delta)).toMatchObject({ accepted: true, key: 'A' })
    expect(Object.keys(store.markers)).toEqual(['A'])
  })

  it('Given 正式坐标已清空 When 立案粗坐标补到 Then 不复活已清点位；回归 F1 唯一事实源', () => {
    const store = useIncidentLocationStore()
    store.onAddressUpdated(update(1, coordinates))
    store.onAddressUpdated(update(2, { longitude: null }))
    store.upsertIncidentFromAlarm({ incidentId: 'A', lng: 113, lat: 22 })
    expect(store.markers.A).toBeUndefined()
  })

  it('Given 旧 HTTP 已排队 When reset 后同警情重入 Then 旧 contextRevision 被拒绝；回归 F13 ABA', () => {
    const store = useIncidentLocationStore()
    store.setContext({ incidentId: 'A', stage: 'dispatch', sessionEpoch: 1 })
    const http = update(10, coordinates, 'A', true)
    http.meta = { snapshotKind: 'full', source: 'http-profile', contextRevision: store.contextRevision }
    store.clearAll()
    store.onAddressUpdated(update(1, coordinates))
    expect(store.onAddressUpdated(http)).toMatchObject({ accepted: false, reason: 'session' })
  })

  it('Given 立案粗点 A When 有效 B 画像到达 Then 接受后只保留 B；回归 F1 活跃 key', () => {
    const store = useIncidentLocationStore()
    store.upsertIncidentFromAlarm({ incidentId: 'A', lng: 113, lat: 22 })
    store.onAddressUpdated(update(1, coordinates, 'B'))
    expect(Object.keys(store.markers)).toEqual(['B'])
  })

  it('Given 立案粗点 When 只改主管槽位 Then 不标为正式坐标；回归 F1 粗定位替换条件', () => {
    const store = useIncidentLocationStore()
    store.upsertIncidentFromAlarm({ incidentId: 'A', lng: 113, lat: 22 })
    store.onAddressUpdated(update(1, { m_org_id: 'primary' }))
    store.onAddressUpdated(update(2, { m_org_id: 'new' }))
    expect(store.markers.A.coordinateSource).toBe('alarm')
    expect(store.profileSnapshots.A.slots).not.toHaveProperty('longitude')
    store.onAddressUpdated(update(3, coordinates))
    expect(store.markers.A.coordinateSource).toBe('slotChanges')
  })

  it('Given 派生查询失败 When 地图重新挂载 Then 可重试失败派生查询；回归 F1 挂载恢复', async () => {
    queries.stations.mockRejectedValueOnce(new Error('offline'))
    queries.nearby.mockResolvedValueOnce(emptyNearby)
    const store = useIncidentLocationStore()
    store.onAddressUpdated(update(1, coordinates))
    for (let index = 0; index < 5; index++) await flush()
    store.restoreOnMapMount()
    expect(queries.stations).toHaveBeenCalledTimes(2)
  })
})
