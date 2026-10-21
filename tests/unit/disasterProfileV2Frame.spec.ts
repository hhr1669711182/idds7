import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// 斩断 const.message.type.ts → '@/store' barrel → useMessageStore → interceptor 的循环依赖；
// useUserStore 转发真实直连模块（与 messageNormalization.spec.ts 同款方案）
vi.mock('@/store', async () => {
  const actual = await vi.importActual<typeof import('@/store/useUserStore')>('@/store/useUserStore')
  return { useUserStore: actual.useUserStore }
})

// 挂起 store 的 HTTP 依赖（辖区/周边资源查询不在本测试范围）
vi.mock('@/service/alova', () => ({ alovaInstance: { Get: vi.fn(() => new Promise(() => {})) } }))
vi.mock('@/controller/core/business/IncidentStationQuery', () => ({ queryIncidentStations: () => new Promise(() => {}) }))
vi.mock('@/controller/core/business/IncidentNearbyResourceQuery', () => ({
  DEFAULT_NEARBY_RESOURCE_RADIUS_METERS: 500,
  queryIncidentNearbyResources: () => new Promise(() => {}),
}))

const logger = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }))
vi.mock('@/utils/logger', () => ({ createLogger: () => logger }))

/** 受理席下发的 DISASTER_PROFILE/UPDATED 原始 V2 帧（2026-10-16 联调样本原样保留） */
const V2_FRAME = {
  id: 'mock-1792142854767-00d82d39b6575',
  clientId: 'ids-seat-web',
  topics: ['DISASTER_PROFILE/UPDATED'],
  sender: 'system',
  notifyType: 'disaster_profile',
  notifySubType: 'UPDATED',
  title: '地址相关变更',
  content: '地址相关变更',
  customContent: {
    eventId: 'mock-1792142854767-00d82d39b6575',
    occurredAt: '2026-10-16T09:27:34.767Z',
    disasterProfileId: 'profile-1',
    incidentId: '55b15364053b40f8ba7f944091b92404',
    inquiryId: 'inquiry-1',
    version: 12,
    slotChanges: [
      { infoId: 'profile-1-disaster_address', slotId: 'disaster_address-slot', slotCode: 'disaster_address', changeType: 'UPDATED', changedFields: ['filledValue'], beforeValue: '示例路 99 号', afterValue: '示例路 1 号' },
      { infoId: 'profile-1-longitude', slotId: 'longitude-slot', slotCode: 'longitude', changeType: 'UPDATED', changedFields: ['filledValue'], beforeValue: '113.95024', afterValue: '113.97' },
      { infoId: 'profile-1-latitude', slotId: 'latitude-slot', slotCode: 'latitude', changeType: 'UPDATED', changedFields: ['filledValue'], beforeValue: '22.54545', afterValue: '22.57' },
      { infoId: 'profile-1-met_floors', slotId: 'met_floors-slot', slotCode: 'met_floors', changeType: 'UPDATED', changedFields: ['filledValue'], beforeValue: '6', afterValue: '7' },
      { infoId: 'profile-1-met_upfloors', slotId: 'met_upfloors-slot', slotCode: 'met_upfloors', changeType: 'UPDATED', changedFields: ['filledValue'], beforeValue: '5', afterValue: '6' },
      { infoId: 'profile-1-build_type', slotId: 'build_type-slot', slotCode: 'build_type', changeType: 'UPDATED', changedFields: ['filledValue'], beforeValue: '10000', afterValue: null },
      { infoId: 'profile-1-met_downfloors', slotId: 'met_downfloors-slot', slotCode: 'met_downfloors', changeType: 'UPDATED', changedFields: ['filledValue'], beforeValue: '2', afterValue: '1' },
      { infoId: 'profile-1-is_over_100m', slotId: 'is_over_100m-slot', slotCode: 'is_over_100m', changeType: 'UPDATED', changedFields: ['filledValue'], beforeValue: 'TRUE', afterValue: 'FALSE' },
      { infoId: 'profile-1-refuge_position', slotId: 'refuge_position-slot', slotCode: 'refuge_position', changeType: 'UPDATED', changedFields: ['filledValue'], beforeValue: null, afterValue: null },
    ],
  },
}

const INCIDENT_ID = '55b15364053b40f8ba7f944091b92404'

/** 复刻 InputController.ts L67 的接线：stage 门控订阅 → IncidentLocationController */
const wireBusinessChain = async () => {
  const { MESSAGE_CHANNEL, MESSAGE_EVENT_KEY, MESSAGE_SYSTEM } = await import('@/const/const.message.type')
  const { IncidentLocationController } = await import('@/controller/core/business/IncidentLocationController')
  const { createMessageStagePolicy } = await import('@/controller/core/io/messageStagePolicy')
  const { useMessageStore } = await import('@/store/useMessageStore')
  const { useUserStore } = await import('@/store/useUserStore')
  const controller = new IncidentLocationController()
  const policy = createMessageStagePolicy(useUserStore())
  const stop = policy.subscribeBusiness(
    MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED,
    (envelope: { data: unknown }) => controller.receive(envelope as Parameters<typeof controller.receive>[0]),
  )
  return {
    ingest: (frame: unknown) => useMessageStore().ingest(frame, MESSAGE_CHANNEL.WS, MESSAGE_SYSTEM.IDS_SEAT_WEB),
    dispose: () => { stop(); policy.dispose(); controller.dispose() },
  }
}

describe('DISASTER_PROFILE/UPDATED V2 帧 → 警情定位上图', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    sessionStorage.clear()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('Given V2 字符串 topics + notifyType 帧 When interceptor 归一（nativeOnly）Then 解析出经纬度增量事件；回归 2026-10-16 警情定位不上图排查', async () => {
    const { MESSAGE_EVENT_KEY } = await import('@/const/const.message.type')
    const { normalizeAddressUpdatedFrames } = await import('@/interceptor/transforms/incidentLocation')
    const [native] = normalizeAddressUpdatedFrames(V2_FRAME, true)
    expect(native?.eventKey).toBe(MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED)
    expect(native?.data).toMatchObject({
      incidentId: INCIDENT_ID,
      disasterProfileId: 'profile-1',
      version: 12,
      address: '示例路 1 号',
      longitude: 113.97,
      latitude: 22.57,
      primaryStationId: null,
    })
    expect(native?.meta.snapshotKind).toBe('delta')
  })

  it('Given V2 帧（非 native 包裹）When unwrap 兜底归一 Then 同样命中且不重复产出；回归 2026-10-16', async () => {
    const { normalizeAddressUpdatedFrames } = await import('@/interceptor/transforms/incidentLocation')
    const results = normalizeAddressUpdatedFrames(V2_FRAME, false)
    expect(results).toHaveLength(1)
    expect(results[0].data.longitude).toBe(113.97)
  })

  it('Given stage=inquiry 且 currentAlarm=null（来电定位可上图的同一状态）When V2 帧入总线 Then 门控丢弃且点位不上图；回归 2026-10-16 根因复现', async () => {
    vi.useFakeTimers()
    const { useUserStore } = await import('@/store/useUserStore')
    const { useIncidentLocationStore } = await import('@/store/useIncidentLocationStore')
    useUserStore().applySharedState(JSON.stringify({
      v: 1, updatedAt: 1, auth: { sessionId: 's' }, phase: 'inquiry', currentAlarm: null,
    }))
    const chain = await wireBusinessChain()
    chain.ingest(V2_FRAME)
    await vi.advanceTimersByTimeAsync(600)
    expect(logger.info).toHaveBeenCalledWith('忽略状态不匹配的消息', expect.objectContaining({
      eventKey: 'disaster_profile.address_updated',
      stage: 'inquiry',
    }))
    expect(useIncidentLocationStore().markers).toEqual({})
    chain.dispose()
  })

  it('Given stage=dispatch 且 incidentId 与消息一致 When V2 帧入总线 Then 门控放行且点位以消息坐标上图；回归 2026-10-16 修复验证', async () => {
    vi.useFakeTimers()
    const { useUserStore } = await import('@/store/useUserStore')
    const { useIncidentLocationStore } = await import('@/store/useIncidentLocationStore')
    useUserStore().applySharedState(JSON.stringify({
      v: 1, updatedAt: 1, auth: { sessionId: 's' }, phase: 'inquiry',
      currentAlarm: { incidentId: INCIDENT_ID },
    }))
    const chain = await wireBusinessChain()
    chain.ingest(V2_FRAME)
    await vi.advanceTimersByTimeAsync(600)
    const marker = useIncidentLocationStore().markers[INCIDENT_ID]
    expect(marker).toMatchObject({ lng: 113.97, lat: 22.57, address: '示例路 1 号', version: 12 })
    expect(marker?.coordinateSource).toBe('slotChanges')
    chain.dispose()
  })

  it('Given 已消费 version=12 When 同版本 V2 帧再次入总线 Then store 按 version 拒绝重复上图；回归 2026-10-16 版本仲裁', async () => {
    vi.useFakeTimers()
    const { useUserStore } = await import('@/store/useUserStore')
    const { useIncidentLocationStore } = await import('@/store/useIncidentLocationStore')
    useUserStore().applySharedState(JSON.stringify({
      v: 1, updatedAt: 1, auth: { sessionId: 's' }, phase: 'inquiry',
      currentAlarm: { incidentId: INCIDENT_ID },
    }))
    const chain = await wireBusinessChain()
    chain.ingest(V2_FRAME)
    await vi.advanceTimersByTimeAsync(600)
    expect(useIncidentLocationStore().markers[INCIDENT_ID]).toBeTruthy()
    chain.ingest(V2_FRAME)
    await vi.advanceTimersByTimeAsync(600)
    const store = useIncidentLocationStore()
    expect(Object.keys(store.markers)).toEqual([INCIDENT_ID])
    expect(store.markers[INCIDENT_ID].version).toBe(12)
    chain.dispose()
  })
})
