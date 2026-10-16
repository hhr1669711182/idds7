import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { useIncidentLocationStore } from '@/store/useIncidentLocationStore'
import { MESSAGE_CHANNEL, MESSAGE_EVENT_KEY, MESSAGE_SYSTEM } from '@/const/const.message.type'
import type {
  AddressUpdatedData,
  IncidentLocationSharedState,
  IncidentProfileData,
} from '@/controller/core/protocol/IncidentLocationProtocol'
import type { MessageEnvelope } from '@/types/message'

const dependencies = vi.hoisted(() => ({ user: {} as IncidentLocationSharedState, get: vi.fn(), ingest: vi.fn() }))
vi.mock('@/store/useUserStore', () => ({ useUserStore: () => dependencies.user }))
vi.mock('@/store/useMessageStore', () => ({ useMessageStore: () => ({ ingest: dependencies.ingest }) }))
vi.mock('@/store', () => ({ useUserStore: () => dependencies.user }))
vi.mock('@/service/alova', () => ({ alovaInstance: { Get: dependencies.get } }))
vi.mock('@/controller/core/business/IncidentStationQuery', () => ({
  queryIncidentStations: () => new Promise(() => {}),
}))
vi.mock('@/controller/core/business/IncidentNearbyResourceQuery', () => ({
  DEFAULT_NEARBY_RESOURCE_RADIUS_METERS: 500,
  queryIncidentNearbyResources: () => new Promise(() => {}),
}))

const profile = (incidentId: string, version = 1): IncidentProfileData => ({
  incidentId,
  disasterProfileId: `profile-${incidentId}`,
  version,
  slots: [
    { slotCode: 'longitude', filledValue: '113.93' },
    { slotCode: 'latitude', filledValue: '22.53' },
  ],
})
const flush = async () => {
  for (let index = 0; index < 6; index++) await Promise.resolve()
}
const disposers: (() => void)[] = []

class RelayChannel {
  static instance: RelayChannel
  readonly postMessage = vi.fn()
  readonly close = vi.fn()
  onmessage: ((event: MessageEvent) => void) | null = null
  constructor(readonly name: string) {
    RelayChannel.instance = this
  }
  send(data: unknown) {
    this.onmessage?.({ data } as MessageEvent)
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  dependencies.user = reactive({
    rawState: {
      v: 1,
      updatedAt: 1,
      auth: { sessionId: 'session' },
      phase: 'inquiry',
      currentAlarm: { incidentId: 'A' },
    },
    currentAlarm: { incidentId: 'A' },
    MapMode: 'inquiry',
    sessionEpoch: 1,
    sharedStateRevision: 1,
  })
  dependencies.get.mockReset()
  dependencies.ingest.mockReset()
})

afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('F1 controller', () => {
  it('Given sole Input 接收 When receive/replay/reset/dispose Then 仅 accepted 通知渲染；回归 F1 接线', async () => {
    const { IncidentLocationController } = await import('@/controller/core/business/IncidentLocationController')
    const accepted = vi.fn()
    const controller = new IncidentLocationController({ onIncidentLocationAccepted: accepted })
    disposers.push(() => controller.dispose())
    const data: AddressUpdatedData = {
      incidentId: 'A',
      disasterProfileId: 'profile-A',
      version: 1,
      address: null,
      longitude: 113.93,
      latitude: 22.53,
      primaryStationId: null,
      slots: { longitude: '113.93', latitude: '22.53' },
    }
    const envelope: MessageEnvelope<AddressUpdatedData> = {
      id: 'one',
      timestamp: 1,
      eventKey: MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED,
      channel: MESSAGE_CHANNEL.WS,
      system: MESSAGE_SYSTEM.IDS_SEAT_WEB,
      data,
    }
    expect(controller.receive(envelope).accepted).toBe(true)
    expect(controller.receive(envelope).accepted).toBe(false)
    expect(accepted).toHaveBeenCalledTimes(1)
    controller.reset()
    expect(useIncidentLocationStore().markers).toEqual({})
    controller.dispose()
    expect(controller.receive(envelope)).toEqual({ accepted: false, reason: 'disposed' })
  })
})

describe('F13 HTTP profile source', () => {
  it('Given 启动 A When A 在途切 B Then 首次即拉且 B 不受阻，旧 A 不入 bus；回归 F13 A→B', async () => {
    let finishA!: (value: IncidentProfileData) => void
    let finishB!: (value: IncidentProfileData) => void
    dependencies.get
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishA = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishB = resolve
          }),
      )
    const { createIncidentLocationProfileSync } = await import('@/composables/useIncidentLocationProfileSync')
    disposers.push(createIncidentLocationProfileSync())
    expect(dependencies.get.mock.calls[0][0]).toContain('/A')
    dependencies.user.currentAlarm = { incidentId: 'B' }
    dependencies.user.rawState!.currentAlarm = { incidentId: 'B' }
    dependencies.user.sharedStateRevision! += 1
    expect(dependencies.get).toHaveBeenCalledTimes(2)
    finishB(profile('B'))
    await flush()
    finishA(profile('A', 10))
    await flush()
    expect(dependencies.ingest).toHaveBeenCalledTimes(1)
    const [envelope, channel, , meta] = dependencies.ingest.mock.calls[0]
    expect(envelope.data.incidentId).toBe('B')
    expect(channel).toBe('http')
    expect(meta).toMatchObject({ source: 'http-profile', snapshotKind: 'full', sessionEpoch: 1 })
  })

  it('Given 请求 A When session 轮换且 dispose Then 旧响应不交付；回归 F13 session/seq', async () => {
    const pending: ((value: IncidentProfileData) => void)[] = []
    dependencies.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(resolve)
        }),
    )
    const { createIncidentLocationProfileSync } = await import('@/composables/useIncidentLocationProfileSync')
    const dispose = createIncidentLocationProfileSync()
    disposers.push(dispose)
    dependencies.user.sessionEpoch = 2
    dependencies.user.sharedStateRevision! += 1
    expect(dependencies.get).toHaveBeenCalledTimes(2)
    dispose()
    pending.forEach((resolve) => resolve(profile('A')))
    await flush()
    expect(dependencies.ingest).not.toHaveBeenCalled()
  })

  it('Given 旧点位与 HTTP 错误/错误归属 When 响应 Then 不清场且不入 bus；回归 F13 失败兜底', async () => {
    const store = useIncidentLocationStore()
    store.upsertIncidentFromAlarm({ incidentId: 'A', lng: 113.93, lat: 22.53 })
    dependencies.get.mockResolvedValue(profile('B'))
    const { createIncidentLocationProfileSync } = await import('@/composables/useIncidentLocationProfileSync')
    disposers.push(createIncidentLocationProfileSync())
    await flush()
    expect(dependencies.ingest).not.toHaveBeenCalled()
    expect(store.markers.A.lng).toBe(113.93)
  })

  it('Given 请求水位为 0 When WS 先更新 Then HTTP 携带发起水位且不直接改 store；回归 F13', async () => {
    let finish!: (value: IncidentProfileData) => void
    dependencies.get.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const store = useIncidentLocationStore()
    const { createIncidentLocationProfileSync } = await import('@/composables/useIncidentLocationProfileSync')
    disposers.push(createIncidentLocationProfileSync())
    finish(profile('A', 0))
    await flush()
    expect(dependencies.ingest.mock.calls[0][3]).toMatchObject({ requestRevision: 0 })
    expect(store.markers).toEqual({})
  })
})

describe('F11 relay source', () => {
  it('Given relay When 打开与 30 秒 Then hello 立即/定时且 dispose 关闭；回归 F11 通道契约', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('BroadcastChannel', RelayChannel)
    const { createMapRelayReader } = await import('@/composables/useMapRelayReader')
    const dispose = createMapRelayReader()
    disposers.push(dispose)
    expect(RelayChannel.instance.name).toBe('ids-map-screen-relay')
    expect(RelayChannel.instance.postMessage).toHaveBeenCalledWith({ kind: 'map-relay-hello' })
    vi.advanceTimersByTime(30000)
    expect(RelayChannel.instance.postMessage).toHaveBeenCalledTimes(2)
    dispose()
    vi.advanceTimersByTime(30000)
    expect(RelayChannel.instance.postMessage).toHaveBeenCalledTimes(2)
    expect(RelayChannel.instance.close).toHaveBeenCalledTimes(1)
  })

  it('Given 未 accepted 的非法/门控消息 When 同版重新送达 Then 不提前占水位；回归 F11', async () => {
    vi.stubGlobal('BroadcastChannel', RelayChannel)
    const { createMapRelayReader } = await import('@/composables/useMapRelayReader')
    disposers.push(createMapRelayReader())
    const relay = RelayChannel.instance
    relay.send({ kind: 'map-relay-event', eventName: 'disaster_profile', payload: { ...profile('A'), slots: 'bad' } })
    expect(dependencies.ingest).not.toHaveBeenCalled()
    relay.send({ kind: 'map-relay-event', eventName: 'disaster_profile', payload: profile('A') })
    relay.send({ kind: 'map-relay-event', eventName: 'disaster_profile', payload: profile('A') })
    expect(dependencies.ingest).toHaveBeenCalledTimes(2)
    expect(dependencies.ingest.mock.calls[0][3]).toMatchObject({ source: 'map-relay', snapshotKind: 'full' })
  })

  it('Given snapshot/event/bye When 灾情/POSITION/addressbot 到达 Then 保留白名单分发；回归 F11', async () => {
    vi.stubGlobal('BroadcastChannel', RelayChannel)
    const { createMapRelayReader } = await import('@/composables/useMapRelayReader')
    disposers.push(createMapRelayReader())
    const relay = RelayChannel.instance
    relay.send({
      kind: 'map-relay-snapshot',
      events: [
        { eventName: 'disaster_profile', payload: profile('A') },
        { eventName: 'POSITION_SYNC', payload: { eventid: 'call', lng: 113, lat: 22, latLngType: 'GPS' } },
        { eventName: 'addressbot', payload: { event_type: 'AddressLocationUpdated' } },
        { eventName: 'unknown', payload: {} },
      ],
    })
    expect(dependencies.ingest.mock.calls.map((call) => call[0].eventKey)).toEqual([
      MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED,
      MESSAGE_EVENT_KEY.MAP_LOCATE_CALL,
      MESSAGE_EVENT_KEY.ADDRESS_ROBOT_GIS_SEARCH,
    ])
    relay.send({ kind: 'map-relay-bye', reason: 'logout' })
    expect(useIncidentLocationStore().markers).toEqual({})
  })
})
