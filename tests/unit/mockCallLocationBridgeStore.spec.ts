import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const ingest = vi.hoisted(() => vi.fn())
vi.mock('@/store/useMessageStore', () => ({ useMessageStore: () => ({ ingest }) }))
vi.mock('@/store', async () => ({ useUserStore: (await import('@/store/useUserStore')).useUserStore }))

import { useUserStore } from '@/store/useUserStore'
import { createMockCallLocationBridge } from '@/composables/useMockCallLocationBridge'
import { MESSAGE_EVENT_KEY as KEY } from '@/const/const.message.type'

const shared = (sessionId: string, mode = 'flood') =>
  JSON.stringify({
    v: 1,
    updatedAt: 1,
    mode,
    phase: 'inquiry',
    auth: { accessToken: 'token', sessionId },
    user: { userId: 'U1' },
    seat: { seatNumber: 'S1' },
  })

describe('F10 与真实 store action 提交集成（回归 committed revision/sessionEpoch）', () => {
  let dispose = () => {}
  beforeEach(() => {
    setActivePinia(createPinia())
    ingest.mockReset()
  })
  afterEach(() => {
    dispose()
  })

  it('Given 已恢复 store When applySharedState 换会话 Then clear/render 使用完整的新提交上下文', () => {
    const store = useUserStore()
    store.applySharedState(shared('session-1'))
    const bridge = createMockCallLocationBridge()
    dispose = bridge.dispose
    const oldContext = bridge.getContext()
    ingest.mockClear()
    store.applySharedState(shared('session-2'))
    expect(ingest.mock.calls.map(([envelope]) => envelope.eventKey)).toEqual([
      KEY.MOCK_SPECIAL_MAP_CLEAR,
      KEY.MOCK_SPECIAL_MAP_RENDER,
    ])
    for (const [, , , meta] of ingest.mock.calls) {
      expect(meta.sessionEpoch).toBe(store.sessionEpoch)
      expect(meta.sharedStateRevision).toBe(store.sharedStateRevision)
    }
    expect(bridge.isCurrent(oldContext)).toBe(false)
  })

  it('Given startup 非注入基线 When applyMockState 合并字段 Then 各字段独立且按 site 在 simulate 前投递', () => {
    const store = useUserStore()
    store.applySharedState(shared('session-1'))
    const bridge = createMockCallLocationBridge()
    dispose = bridge.dispose
    ingest.mockClear()
    store.applyMockState(
      JSON.stringify({
        v: 1,
        updatedAt: 2,
        callLocation: { lng: 116, lat: 39 },
        dispatchVehicles: [{ vehicleId: 'V1' }],
        disasterSite: { id: 'site' },
        flood: { dispatchCommand: { id: 'command' } },
      }),
    )
    expect(ingest.mock.calls.map(([envelope]) => envelope.eventKey)).toEqual([
      KEY.MAP_LOCATE_CALL,
      KEY.MOCK_DISPATCH_VEHICLES,
      KEY.MOCK_SPECIAL_MAP_DISASTER_SITE,
      KEY.MOCK_SPECIAL_MAP_SIMULATE,
    ])
    for (const [, channel, , meta] of ingest.mock.calls) {
      expect(channel).toBe('localStorage')
      expect(meta).toMatchObject({ mockRevision: store.mockRevision, sessionEpoch: store.sessionEpoch, mock: true })
    }
  })

  it.each([
    { auth: null, phase: 'loggedOut' },
    { auth: null, phase: 'inquiry' },
    { auth: { accessToken: 'token', sessionId: 'session-1' }, phase: 'loggedOut' },
  ])('Given 活跃 flood When 提交登出状态 $phase/$auth Then 只 CLEAR，不重建或导航；回归 F10 审查 R1', (logout) => {
    const store = useUserStore()
    store.applySharedState(shared('session-1'))
    const requestNavigation = vi.fn()
    const bridge = createMockCallLocationBridge({ requestNavigation })
    dispose = bridge.dispose
    ingest.mockClear()
    requestNavigation.mockClear()
    store.applySharedState(JSON.stringify({ v: 1, updatedAt: 2, mode: 'flood', ...logout }))
    expect(ingest.mock.calls.map(([envelope]) => envelope.eventKey)).toEqual([KEY.MOCK_SPECIAL_MAP_CLEAR])
    expect(bridge.consumePendingSpecialMapRender()).toBeNull()
    expect(requestNavigation).not.toHaveBeenCalled()
    ingest.mockClear()
    store.applyMockState(
      JSON.stringify({
        v: 1,
        updatedAt: 3,
        callLocation: { lng: 116, lat: 39 },
        dispatchVehicles: [{ vehicleId: 'V1' }],
        disasterSite: { id: 'site' },
        flood: { dispatchCommand: { id: 'C1' } },
      }),
    )
    expect(ingest).not.toHaveBeenCalled()
  })

  it('Given startup 已登出但保留 flood/mock When 创建桥 Then 不恢复任务、pending 或导航；回归 F10 审查 R1', () => {
    const store = useUserStore()
    store.applySharedState(JSON.stringify({ v: 1, updatedAt: 1, auth: null, phase: 'loggedOut', mode: 'flood' }))
    store.applyMockState(JSON.stringify({ v: 1, updatedAt: 1, callLocation: { lng: 116, lat: 39 } }))
    const requestNavigation = vi.fn()
    const bridge = createMockCallLocationBridge({ requestNavigation })
    dispose = bridge.dispose
    expect(ingest).not.toHaveBeenCalled()
    expect(requestNavigation).not.toHaveBeenCalled()
    expect(bridge.consumePendingSpecialMapRender()).toBeNull()
  })
})
