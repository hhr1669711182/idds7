import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { MESSAGE_CHANNEL, MESSAGE_EVENT_KEY, MESSAGE_SYSTEM, type MessageEventKey } from '@/const/const.message.type'
import type { MessageEnvelope } from '@/types/message'
import { useUserStore } from '@/store/useUserStore'
import {
  createMessageStagePolicy,
  getSharedMapStage,
  parseSharedMapStage,
} from '@/controller/core/io/messageStagePolicy'

const bus = vi.hoisted(() => ({
  listeners: new Map<string, Set<(envelope: MessageEnvelope<unknown>) => void>>(),
  subscribe: vi.fn(),
}))

const logger = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn() }))

vi.mock('@/store/useMessageStore', () => ({ useMessageStore: () => bus }))
vi.mock('@/utils/logger', () => ({ createLogger: () => logger }))

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  v: 1,
  updatedAt: 1,
  auth: { sessionId: 'session', accessToken: 'token' },
  user: { userId: 'user' },
  seat: { seatNumber: 'seat' },
  phase: 'popup',
  ...overrides,
})

const emit = (eventKey: MessageEventKey, id = 'message') => {
  const envelope: MessageEnvelope<unknown> = {
    v: '1.0.0',
    id,
    timestamp: -100_000,
    eventKey,
    channel: MESSAGE_CHANNEL.WS,
    system: MESSAGE_SYSTEM.HOST,
    data: { id },
  }
  bus.listeners.get(eventKey)?.forEach((handler) => handler(envelope))
  return envelope
}

describe('messageStagePolicy / Control 迁移 §10.2–10.3', () => {
  const disposers: Array<() => void> = []

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    bus.listeners.clear()
    logger.error.mockClear()
    logger.info.mockClear()
    bus.subscribe.mockImplementation((key: string, handler: (envelope: MessageEnvelope<unknown>) => void) => {
      const listeners = bus.listeners.get(key) ?? new Set()
      listeners.add(handler)
      bus.listeners.set(key, listeners)
      return () => listeners.delete(handler)
    })
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  const contexts = [
    [{ phase: 'popup' }, 'popup'],
    [{ phase: 'inquiry', currentAlarm: null }, 'inquiry'],
    [{ phase: 'inquiry', currentAlarm: { incidentId: ' I1 ' } }, 'dispatch'],
    [{ phase: 'dispatchTrack' }, 'dispatchTrack'],
    [{ phase: 'onDuty' }, 'onDuty'],
    [{ phase: 'dispatch', currentAlarm: { incidentId: 'I1' } }, null],
    [{ phase: 'unrecognized' }, null],
    [{ phase: 'loggedOut', mode: 'flood' }, null],
    [{ phase: undefined }, null],
    [{ phase: 'inquiry' }, null],
    [{ phase: 'inquiry', currentAlarm: {} }, null],
    [{ phase: 'inquiry', currentAlarm: { incidentId: '  ' } }, null],
    [{ phase: 'inquiry', currentAlarm: [] }, null],
    [{ v: 2 }, null],
    [{ updatedAt: Infinity }, null],
    [{ updatedAt: NaN }, null],
    [{ updatedAt: '1' }, null],
    [{ auth: undefined }, null],
    [{ auth: [] }, null],
    [{ auth: 'token' }, null],
    [{ auth: null }, 'loggedOut'],
  ] as const

  it.each(contexts)('Given 上下文 %j When 纯解释 Then 阶段为 %s；回归 §10.2', (input, expected) => {
    const state = snapshot(input)
    expect(getSharedMapStage(state)).toBe(expected)
    expect(getSharedMapStage(state, state.phase ?? 'onDuty')).toBe(expected)
    if (Number.isFinite(state.updatedAt)) expect(parseSharedMapStage(JSON.stringify(state))).toBe(expected)
    expect(parseSharedMapStage('{broken')).toBeNull()
    expect(parseSharedMapStage(null)).toBeNull()
  })

  const rules = [
    [MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, 'popup'],
    [MESSAGE_EVENT_KEY.ALARM_CALL_ANSWER_STATUS_CHANGED, 'inquiry'],
    [MESSAGE_EVENT_KEY.ALARM_INCIDENT_STATE_CHANGED, 'dispatch'],
    [MESSAGE_EVENT_KEY.ALARM_PROFILE_SYNC, 'dispatch'],
    [MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED, 'dispatch'],
    [MESSAGE_EVENT_KEY.TRACKING_VEHICLE_GPS_UPDATE, 'dispatchTrack'],
  ] as const

  it.each(rules)('Given 六类事件 %s When 遍历上下文 Then 只放行 %s；回归 §10.3 真值表', (key, allowed) => {
    const store = useUserStore()
    const policy = createMessageStagePolicy(store)
    disposers.push(policy.dispose)
    const handler = vi.fn()
    policy.subscribeBusiness(key, handler)
    contexts.forEach(([input, expected]) => {
      handler.mockClear()
      store.applySharedState(JSON.stringify(snapshot(input)))
      const envelope = emit(key)
      vi.advanceTimersByTime(499)
      expect(handler).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(handler).toHaveBeenCalledTimes(expected === allowed ? 1 : 0)
      if (expected === allowed) expect(handler).toHaveBeenCalledWith(envelope)
    })
  })

  it('Given 多条旧时间戳消息 When 不同本地时刻接收 Then 各等 500ms 且顺序/载荷不丢；回归 §10.3', () => {
    const store = useUserStore()
    store.applySharedState(JSON.stringify(snapshot()))
    const policy = createMessageStagePolicy()
    disposers.push(policy.dispose)
    const received: string[] = []
    policy.subscribeBusiness(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, (envelope) => received.push(envelope.id))
    emit(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, 'A')
    vi.advanceTimersByTime(100)
    emit(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, 'B')
    emit(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, 'C')
    vi.advanceTimersByTime(400)
    expect(received).toEqual(['A'])
    vi.advanceTimersByTime(100)
    expect(received).toEqual(['A', 'B', 'C'])
  })

  it('Given 快速 A→B→A 和相同输入 When 同步共享提交 Then 每次重新等待而非批处理吞掉；回归 §10.1/10.3', () => {
    const store = useUserStore()
    const raw = JSON.stringify(snapshot())
    store.applySharedState(raw)
    const policy = createMessageStagePolicy(store)
    disposers.push(policy.dispose)
    const handler = vi.fn()
    policy.subscribeBusiness(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, handler)
    emit(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL)
    vi.advanceTimersByTime(400)
    store.applySharedState(JSON.stringify(snapshot({ phase: 'inquiry', currentAlarm: null })))
    store.applySharedState(raw)
    vi.advanceTimersByTime(400)
    store.applySharedState(raw)
    vi.advanceTimersByTime(499)
    expect(handler).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it.each(['logout', 'session', 'seat', 'dispose', 'unsubscribe'] as const)(
    'Given 排队消息 When %s 失效再恢复 Then 旧闭包不交付；回归 §10.3',
    (reason) => {
      const store = useUserStore()
      store.applySharedState(JSON.stringify(snapshot()))
      const policy = createMessageStagePolicy(store)
      disposers.push(policy.dispose)
      const handler = vi.fn()
      const stop = policy.subscribeBusiness(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, handler)
      emit(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL)
      vi.advanceTimersByTime(100)
      if (reason === 'dispose') policy.dispose()
      else if (reason === 'unsubscribe') stop()
      else {
        const input =
          reason === 'logout'
            ? { auth: null }
            : reason === 'seat'
              ? { seat: { seatNumber: 'other' } }
              : { auth: { sessionId: 'other', accessToken: 'token' } }
        store.applySharedState(JSON.stringify(snapshot(input)))
        store.applySharedState(JSON.stringify(snapshot()))
      }
      expect(vi.getTimerCount()).toBe(0)
      vi.advanceTimersByTime(1_000)
      expect(handler).not.toHaveBeenCalled()
      if (reason === 'dispose' || reason === 'unsubscribe') {
        expect(bus.listeners.get(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL)?.size).toBe(0)
      }
    },
  )

  it('Given 到期首条触发登出 When 同批还有消息 Then 后续全部取消；回归 §10.3 重入', () => {
    const store = useUserStore()
    store.applySharedState(JSON.stringify(snapshot()))
    const policy = createMessageStagePolicy(store)
    disposers.push(policy.dispose)
    const handler = vi.fn(() => store.applySharedState(JSON.stringify(snapshot({ auth: null }))))
    policy.subscribeBusiness(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, handler)
    emit(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, 'A')
    emit(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, 'B')
    vi.advanceTimersByTime(500)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it.each([MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, MESSAGE_EVENT_KEY.MAP_LOCATE_CALL_REMOVE])(
    'Given %s 订阅返回 rejected Promise When 立即或延迟交付 Then 统一记录且不产生未处理拒绝',
    async (eventKey) => {
      const store = useUserStore()
      store.applySharedState(JSON.stringify(snapshot()))
      const policy = createMessageStagePolicy(store)
      disposers.push(policy.dispose)
      const error = new Error('async delivery failure')
      const handler = vi.fn(async () => {
        throw error
      })
      policy.subscribeBusiness(eventKey, handler)
      emit(eventKey, 'failed')
      await vi.advanceTimersByTimeAsync(500)
      expect(handler).toHaveBeenCalledTimes(1)
      expect(logger.error).toHaveBeenCalledTimes(1)
      expect(logger.error.mock.calls[0][0]).toBe('业务订阅执行失败')
      expect(JSON.parse(JSON.stringify(logger.error.mock.calls[0][1]))).toEqual({
        eventKey,
        error: { name: error.name, message: error.message, stack: error.stack },
      })
    },
  )

  it.each([MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, MESSAGE_EVENT_KEY.MAP_LOCATE_CALL_REMOVE])(
    'Given %s 订阅同步抛错 When 同批继续交付 Then 隔离异常并继续保序',
    (eventKey) => {
      const store = useUserStore()
      store.applySharedState(JSON.stringify(snapshot()))
      const policy = createMessageStagePolicy(store)
      disposers.push(policy.dispose)
      const error = new Error('sync delivery failure')
      const received: string[] = []
      policy.subscribeBusiness(eventKey, (envelope) => {
        received.push(envelope.id)
        if (envelope.id === 'failed') throw error
        return received.length
      })
      expect(() => emit(eventKey, 'failed')).not.toThrow()
      emit(eventKey, 'next')
      vi.advanceTimersByTime(500)
      expect(received).toEqual(['failed', 'next'])
      expect(logger.error).toHaveBeenCalledTimes(1)
      expect(logger.error.mock.calls[0][0]).toBe('业务订阅执行失败')
      expect(JSON.parse(JSON.stringify(logger.error.mock.calls[0][1]))).toEqual({
        eventKey,
        error: { name: error.name, message: error.message, stack: error.stack },
      })
    },
  )

  it('Given 非 Error 拒绝值 When 延迟交付 Then 日志保留原值', async () => {
    const store = useUserStore()
    store.applySharedState(JSON.stringify(snapshot()))
    const policy = createMessageStagePolicy(store)
    disposers.push(policy.dispose)
    const error = { code: 'DELIVERY_FAILED', detail: 'rejected payload' }
    policy.subscribeBusiness(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, () => Promise.reject(error))
    emit(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL)
    await vi.advanceTimersByTimeAsync(500)
    expect(logger.error).toHaveBeenCalledExactlyOnceWith('业务订阅执行失败', {
      eventKey: MESSAGE_EVENT_KEY.MAP_LOCATE_CALL,
      error,
    })
    expect(logger.error.mock.calls[0][1].error).toBe(error)
  })

  it('Given 无规则事件和已销毁策略 When 接收/再订阅 Then 立即交付/销毁后无效；回归 §10.3', () => {
    const policy = createMessageStagePolicy()
    disposers.push(policy.dispose)
    const handler = vi.fn()
    policy.subscribeBusiness(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL_REMOVE, handler)
    const envelope = emit(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL_REMOVE)
    expect(handler).toHaveBeenCalledWith(envelope)
    policy.dispose()
    policy.subscribeBusiness(MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_CLEAR, handler)
    emit(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL_REMOVE)
    emit(MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_CLEAR)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
