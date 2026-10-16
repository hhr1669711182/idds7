import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { watch } from 'vue'
import { initUserStore, useUserStore } from '@/store/useUserStore'

const shared = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    v: 1,
    updatedAt: 1,
    auth: { accessToken: 'token', sessionId: 'session' },
    user: { userId: 'user' },
    seat: { seatNumber: 'seat', terminalId: 'terminal' },
    phase: 'popup',
    ...overrides,
  })

const receive = (key: string | null, newValue: string | null, storageArea = localStorage) => {
  window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea }))
}

describe('useUserStore / Control 迁移 §10', () => {
  const disposers: Array<() => void> = []

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
  })

  afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('Given 完整共享输入 When 同页 action 接收 Then revision 只发布齐备事实；回归 §10.1 半快照', () => {
    const store = useUserStore()
    const seen: unknown[] = []
    disposers.push(
      watch(
        () => store.sharedStateRevision,
        () => {
          seen.push({
            phase: store.MapMode,
            alarm: store.currentAlarm,
            mode: store.mode,
            raw: store.rawState,
            receivedAt: store.lastSharedReceiveAt,
            session: store.session,
            epoch: store.sessionEpoch,
          })
        },
        { flush: 'sync' },
      ),
    )
    const raw = shared({ phase: 'inquiry', currentAlarm: { incidentId: 'I1' }, mode: 'flood' })
    store.applySharedState(raw)
    expect(seen).toEqual([
      {
        phase: 'inquiry',
        alarm: { incidentId: 'I1' },
        mode: 'flood',
        raw: JSON.parse(raw),
        receivedAt: 1_000,
        session: { userId: 'user', sessionId: 'session', accessToken: 'token' },
        epoch: store.sessionEpoch,
      },
    ])
    expect(store.sharedStateRevision).toBe(1)
    store.applySharedState(raw)
    expect(store.sharedStateRevision).toBe(2)
    expect(seen).toHaveLength(2)
  })

  it('Given 缺省/null/非法 phase When 接收 Then 保留差别且不投影调派；回归 §10.1', () => {
    const store = useUserStore()
    store.applySharedState(shared({ phase: 'inquiry' }))
    expect(store.currentAlarm).toBeUndefined()
    expect(store.mode).toBeUndefined()
    store.applySharedState(shared({ phase: 'inquiry', currentAlarm: null, mode: null }))
    expect(store.currentAlarm).toBeNull()
    expect(store.mode).toBeNull()
    store.applySharedState(shared({ phase: 'unrecognized', currentAlarm: { incidentId: 'I1' } }))
    expect(store.MapMode).toBe('unrecognized')
    store.applySharedState('{broken')
    expect(store.rawState).toBeNull()
    expect(store.currentAlarm).toBeUndefined()
    expect(store.MapMode).toBe('onDuty')
  })

  it('Given 同一实例 When 多次 init/storage/clear Then 不重复监听或提交且 mock 删除可观察；回归 §10.5', () => {
    localStorage.setItem('seat-shared-state', shared())
    const addListener = vi.spyOn(window, 'addEventListener')
    const first = initUserStore()
    const second = initUserStore()
    disposers.push(first, second)
    const store = useUserStore()
    expect(addListener.mock.calls.filter(([name]) => name === 'storage')).toHaveLength(1)
    expect(store.sharedStateRevision).toBe(1)
    expect(store.mockRevision).toBe(0)
    expect(store.seatSharedStateMockRaw).toBeNull()
    receive('seat-shared-state', shared(), sessionStorage)
    expect(store.sharedStateRevision).toBe(1)
    receive('seat-shared-state-mock', '{raw mock')
    expect(store.seatSharedStateMockRaw).toBe('{raw mock')
    expect(store.mockRevision).toBe(1)
    receive('seat-shared-state-mock', null)
    expect(store.mockRevision).toBe(2)
    receive(null, null)
    expect(store.sharedStateRevision).toBe(2)
    expect(store.mockRevision).toBe(3)
    expect(store.session).toBeNull()
    first()
    first()
    receive('seat-shared-state', shared())
    expect(store.sharedStateRevision).toBe(2)
  })

  it('Given 自定义观察者抛错 When 接收 Then 默认更新先完成且其他观察者照常执行；回归 §10.5', () => {
    const store = useUserStore()
    const observed: unknown[] = []
    disposers.push(
      initUserStore({
        'seat-shared-state': () => {
          observed.push(store.MapMode)
          throw new Error('observer failed')
        },
      }),
    )
    const observer = vi.fn(() => observed.push(store.MapMode))
    disposers.push(initUserStore({ 'seat-shared-state': observer }))
    observed.length = 0
    receive('seat-shared-state', shared({ phase: 'dispatchTrack' }))
    expect(store.MapMode).toBe('dispatchTrack')
    expect(observed).toEqual(['dispatchTrack', 'dispatchTrack'])
  })

  it('Given 明确 auth=null When 初始化及 token 兜底更新 Then 会话始终登出；回归 §10.5', () => {
    localStorage.setItem('seat-shared-state', shared({ auth: null }))
    localStorage.setItem('seat-auth-session', JSON.stringify({ accessToken: 'fallback' }))
    disposers.push(initUserStore())
    const store = useUserStore()
    expect(store.session).toBeNull()
    expect(store.isLoggedIn).toBe(false)
    receive('seat-auth-session', JSON.stringify({ accessToken: 'replacement' }))
    expect(store.session).toBeNull()
    store.applySharedState(shared())
    const epoch = store.sessionEpoch
    store.applySharedState(shared({ auth: null }))
    expect(store.sessionEpoch).toBeGreaterThan(epoch)
    receive('seat-auth-session', JSON.stringify({ accessToken: 'fallback' }))
    expect(store.accessToken).toBeNull()
  })

  it('Given 兜底 token When 主共享身份完整/不完整 Then 只补完整会话；回归 §10.5 空 session spread', () => {
    localStorage.setItem('seat-auth-session', JSON.stringify({ accessToken: 'fallback' }))
    disposers.push(initUserStore())
    const store = useUserStore()
    expect(store.session).toBeNull()
    store.applySharedState(shared({ auth: { sessionId: 'session' } }))
    expect(store.session).toEqual({ userId: 'user', sessionId: 'session', accessToken: 'fallback' })
    store.applySharedState(shared({ user: {}, auth: { sessionId: 'session' } }))
    expect(store.session).toBeNull()
  })

  it('Given 启动快照需要兜底 token When revision 提交 Then 会话凭证已完整；回归 §10.1 启动半快照', () => {
    const store = useUserStore()
    localStorage.setItem('seat-shared-state', shared({ auth: { sessionId: 'session' } }))
    localStorage.setItem('seat-auth-session', JSON.stringify({ accessToken: 'fallback' }))
    const tokens: Array<string | null> = []
    disposers.push(
      watch(
        () => store.sharedStateRevision,
        () => tokens.push(store.accessToken),
        { flush: 'sync' },
      ),
    )
    disposers.push(initUserStore())
    expect(tokens).toEqual(['fallback'])
  })

  it('Given 无主 token 的完整身份 When fallback 更新/删除 Then 工具可用且同步提交完整会话；回归 V2 CONNECT', async () => {
    const store = useUserStore()
    store.applySharedState(shared({ auth: { sessionId: 'session' } }))
    disposers.push(initUserStore())
    const seen: unknown[] = []
    disposers.push(
      watch(
        () => store.sharedStateRevision,
        () =>
          seen.push({
            token: store.accessToken,
            session: store.session,
            phase: store.MapMode,
            epoch: store.sessionEpoch,
            receivedAt: store.lastSharedReceiveAt,
          }),
        { flush: 'sync' },
      ),
    )
    store.applySharedState(shared({ auth: { sessionId: 'session' } }))
    seen.length = 0
    const initialEpoch = store.sessionEpoch
    receive('seat-auth-session', JSON.stringify({ accessToken: 'fallback' }))
    expect(store.accessToken).toBe('fallback')
    expect(seen).toEqual([
      {
        token: 'fallback',
        session: { userId: 'user', sessionId: 'session', accessToken: 'fallback' },
        phase: 'popup',
        epoch: initialEpoch + 1,
        receivedAt: 1_000,
      },
    ])
    seen.length = 0
    receive('seat-auth-session', JSON.stringify({ accessToken: 'rotated' }))
    expect(seen).toHaveLength(1)
    expect(store.sessionEpoch).toBe(initialEpoch + 1)
    expect(store.accessToken).toBe('rotated')
    receive('seat-auth-session', null)
    expect(store.session).toBeNull()
    expect(store.sessionEpoch).toBe(initialEpoch + 2)
    expect(store.accessToken).toBeNull()
    store.applySharedState(shared({ auth: null }))
    const revision = store.sharedStateRevision
    receive('seat-auth-session', JSON.stringify({ accessToken: 'cannot-revive' }))
    expect(store.sharedStateRevision).toBe(revision)
    expect(store.accessToken).toBeNull()
  })

  it('Given fallback 生效及 mock When storage.clear Then 仅提交一次完整清空；回归 §10.5 clear 半快照', () => {
    localStorage.setItem('seat-shared-state', shared({ auth: { sessionId: 'session' }, mode: 'flood' }))
    localStorage.setItem('seat-auth-session', JSON.stringify({ accessToken: 'fallback' }))
    localStorage.setItem('seat-shared-state-mock', '{mock')
    localStorage.setItem('seat_id', 'seat-id')
    disposers.push(initUserStore())
    const store = useUserStore()
    const snapshots: unknown[] = []
    disposers.push(
      watch(
        () => store.sharedStateRevision,
        () =>
          snapshots.push({
            raw: store.rawState,
            token: store.accessToken,
            mock: store.seatSharedStateMockRaw,
            mode: store.mode,
            seatId: store.seatId,
          }),
        { flush: 'sync' },
      ),
    )
    receive(null, null)
    expect(snapshots).toEqual([{ raw: null, token: null, mock: null, mode: undefined, seatId: null }])
  })

  it('Given 已登录会话 When phase/token/身份改变 Then 仅会话边界增加 epoch；回归 §10.3 旧队列失效', () => {
    const store = useUserStore()
    store.applySharedState(shared())
    const epoch = store.sessionEpoch
    store.applySharedState(shared({ phase: 'inquiry', auth: { sessionId: 'session', accessToken: 'rotated' } }))
    expect(store.sessionEpoch).toBe(epoch)
    store.applySharedState(shared({ seat: { seatNumber: 'another-seat' } }))
    expect(store.sessionEpoch).toBe(epoch + 1)
    store.applySharedState(shared({ user: { userId: 'another-user' } }))
    expect(store.sessionEpoch).toBe(epoch + 2)
    store.applySharedState(shared({ auth: { sessionId: 'another-session', accessToken: 'token' } }))
    expect(store.sessionEpoch).toBe(epoch + 3)
  })

  it('Given store 快照 When 读凭证与构造请求头 Then 全部来自 store 且不触碰 storage；回归 §10.4', async () => {
    const { applyAuthHeaders, applyTraceHeaders } = await import('@/service/authHeaders')
    const tools = await import('@/utils/seatSharedState')
    const store = useUserStore()
    const raw = shared({
      auth: { accessToken: ' token ', sessionId: 'session', Tenantid: ' tenant ', 'X-Trace-Id': ' trace ' },
    })
    store.applySharedState(raw)
    const readStorage = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('shared storage read')
    })
    expect(store.accessToken).toBe(' token ')
    expect(store.tenantId).toBe('tenant')
    expect(store.traceId).toBe('trace')
    expect(store.messageSession).toEqual({ userId: 'user', sessionState: 'session', seatKey: 'seat' })
    expect(tools.parseSharedMessageSession(raw)).toEqual(store.messageSession)
    const headers = { Existing: 'keep', Tenantid: 'old', 'X-Trace-Id': 'old' }
    expect(applyTraceHeaders(headers)).toBe(headers)
    expect(headers).toEqual({ Existing: 'keep', Tenantid: 'tenant', 'X-Trace-Id': 'trace' })
    const authed = applyAuthHeaders({})
    expect(authed).toMatchObject({ Authorization: 'Bearer  token ', clientid: 'ids-seat-web' })
    store.applySharedState(shared({ auth: { Tenantid: '', 'X-Trace-Id': null } }))
    expect(applyTraceHeaders(headers)).toEqual(headers)
    expect(applyAuthHeaders({})).toEqual({})
    expect(store.accessToken).toBeNull()
    expect(store.tenantId).toBeNull()
    expect(store.traceId).toBeNull()
    expect(readStorage).not.toHaveBeenCalled()
  })

  it('Given 等待 dispatchTrack When 同页快速接收与取消 Then 回调一次或不再回调；回归 §10.4', async () => {
    const { whenDispatchTrack } = await import('@/utils/sharedStateWatch')
    const store = useUserStore()
    store.applySharedState(shared())
    const callback = vi.fn()
    disposers.push(whenDispatchTrack(callback))
    store.applySharedState(shared({ phase: 'dispatchTrack' }))
    store.applySharedState(shared({ phase: 'popup' }))
    store.applySharedState(shared({ phase: 'dispatchTrack' }))
    expect(callback).toHaveBeenCalledTimes(1)
    const immediate = vi.fn()
    whenDispatchTrack(immediate)
    expect(immediate).toHaveBeenCalledTimes(1)
    store.applySharedState(shared())
    const cancelled = vi.fn()
    whenDispatchTrack(cancelled)()
    store.applySharedState(shared({ phase: 'dispatchTrack' }))
    expect(cancelled).not.toHaveBeenCalled()
  })
})
