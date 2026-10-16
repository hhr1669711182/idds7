import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createApp } from 'vue'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import type { WebSocketOptions } from '@/hooks/useWebSocket'
import { useMessageStore } from '@/store/useMessageStore'
import {
  MESSAGE_CHANNEL as CHANNEL,
  MESSAGE_EVENT_KEY as KEY,
  MESSAGE_SYSTEM as SYSTEM,
} from '@/const/const.message.type'
import { logger } from '@/utils/logger'

vi.mock('@/store', () => ({ useUserStore: () => ({ seatNumber: '8001' }) }))
const transport = vi.hoisted(() => ({ options: [] as WebSocketOptions[] }))
vi.mock('@/hooks/useWebSocket', () => ({
  WebSocketClient: class {
    ws = { readyState: 1 }
    send = vi.fn(() => true)
    disconnect = vi.fn()
    constructor(_url: string, options: WebSocketOptions) {
      transport.options.push(options)
    }
  },
}))

describe('消息中枢回归：Given 新 store When 统一接收 Then 保留兼容与可观测性', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    logger.clear()
    vi.restoreAllMocks()
    sessionStorage.clear()
    transport.options.length = 0
  })

  it('Given 两类消息 When 接收并查询 Then 事件索引独立于系统索引且清理互不污染', () => {
    const store = useMessageStore()
    store.ingest({ eventKey: KEY.MAP_LOCATE_CALL, data: { id: 'call-1' } }, CHANNEL.WS, SYSTEM.HOST)
    store.ingest({ eventKey: KEY.MAP_READY, data: { ready: true } }, CHANNEL.WS, SYSTEM.HOST)
    expect(store.getLastByEventKey(KEY.MAP_LOCATE_CALL)?.data).toEqual({ id: 'call-1' })
    expect(Object.keys(store.lastBySystem)).toEqual([SYSTEM.HOST])
    expect(store.lastBySystem[SYSTEM.HOST]?.eventKey).toBe(KEY.MAP_READY)
    expect(Object.keys(store.inbox)).toEqual([SYSTEM.HOST])
    store.clearLastByEventKey(KEY.MAP_LOCATE_CALL)
    expect(store.getLastByEventKey(KEY.MAP_LOCATE_CALL)).toBeNull()
    expect(store.getLastByEventKey(KEY.MAP_READY)?.data).toEqual({ ready: true })
    expect(store.inbox[SYSTEM.HOST]).toHaveLength(2)
  })

  it('Given 两个 system When clearSystem Then 只清对应系统的事件索引', () => {
    const store = useMessageStore()
    store.ingest({ eventKey: KEY.MAP_READY, data: 1 }, CHANNEL.WS, SYSTEM.HOST)
    store.ingest({ eventKey: KEY.MAP_LOCATE_CALL, data: 2 }, CHANNEL.WS, SYSTEM.MAP)
    store.clearSystem(SYSTEM.HOST)
    expect(store.getLastByEventKey(KEY.MAP_READY)).toBeNull()
    expect(store.getLastByEventKey(KEY.MAP_LOCATE_CALL)?.data).toBe(2)
  })

  it('Given HTTP 与 localStorage 入站 When 接收 Then 通道合法且 HTTP 无发送副作用', () => {
    expect(CHANNEL.LOCAL_STORAGE).toBe('localStorage')
    expect(CHANNEL.HTTP).toBe('http')
    const store = useMessageStore()
    const subscriber = vi.fn()
    store.subscribe(KEY.DISASTER_PROFILE_ADDRESS_UPDATED, subscriber)
    store.ingest(
      { eventKey: KEY.DISASTER_PROFILE_ADDRESS_UPDATED, data: {}, meta: { snapshotKind: 'full' } },
      CHANNEL.HTTP,
      SYSTEM.HOST,
    )
    expect(subscriber.mock.calls[0][0]).toMatchObject({ channel: 'http', meta: { snapshotKind: 'full' } })
    expect(store.publish(KEY.MAP_READY, {}, { system: SYSTEM.HOST, channel: CHANNEL.HTTP })).toBe(false)
    expect(store.outbox[SYSTEM.HOST] ?? []).toEqual([])
  })

  it('Given 同步抛错和异步拒绝的订阅 When 分发 Then logger 记录且其他订阅不受影响', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const store = useMessageStore()
    const delivered = vi.fn()
    store.subscribe(KEY.MAP_READY, () => {
      throw new Error('sync failure')
    })
    store.subscribe(KEY.MAP_READY, async () => {
      throw new Error('async failure')
    })
    store.subscribe(KEY.MAP_READY, delivered)
    store.ingest({ eventKey: KEY.MAP_READY, data: {} }, CHANNEL.WS, SYSTEM.HOST)
    await Promise.resolve()
    await Promise.resolve()
    expect(delivered).toHaveBeenCalledOnce()
    expect(logger.export().filter((item) => item.namespace === 'message-handler')).toHaveLength(2)
    expect(logger.export().map((item) => item.data)).toMatchObject([
      { error: { message: 'sync failure' } },
      { error: { message: 'async failure' } },
    ])
  })

  it('Given 系统过滤与取消订阅 When 再次接收 Then 仅有效订阅消费', () => {
    const store = useMessageStore()
    const subscriber = vi.fn()
    const stop = store.subscribe(KEY.MAP_READY, subscriber, SYSTEM.HOST)
    store.ingest({ eventKey: KEY.MAP_READY, data: {} }, CHANNEL.WS, SYSTEM.MAP)
    store.ingest({ eventKey: KEY.MAP_READY, data: {} }, CHANNEL.WS, SYSTEM.HOST)
    stop()
    store.ingest({ eventKey: KEY.MAP_READY, data: {} }, CHANNEL.WS, SYSTEM.HOST)
    expect(subscriber).toHaveBeenCalledOnce()
  })

  it('Given Envelope 额外 metadata When 接收 Then 订阅与记录获得同一完整信封', () => {
    const store = useMessageStore()
    const subscriber = vi.fn()
    store.subscribe(KEY.MAP_READY, subscriber)
    const envelope = store.createEnvelope(
      SYSTEM.MAP,
      CHANNEL.WS,
      KEY.MAP_READY,
      {},
      { meta: { snapshotKind: 'delta' } },
    )
    store.ingest(envelope, CHANNEL.POST_MESSAGE, SYSTEM.HOST, { origin: 'https://host.test' })
    expect(subscriber.mock.calls[0][0]).toMatchObject({
      system: SYSTEM.HOST,
      channel: CHANNEL.POST_MESSAGE,
      meta: { snapshotKind: 'delta', origin: 'https://host.test' },
    })
    expect(store.lastBySystem[SYSTEM.HOST]).toEqual(subscriber.mock.calls[0][0])
  })

  it('Given 持久化事件索引 When 重建 store Then 可查询但不主动重放业务订阅', () => {
    const createPersistedPinia = () => {
      const pinia = createPinia().use(piniaPluginPersistedstate)
      createApp({}).use(pinia)
      return pinia
    }
    const first = useMessageStore(createPersistedPinia())
    first.ingest({ eventKey: KEY.MAP_LOCATE_CALL, data: { id: 'c1' } }, CHANNEL.LOCAL_STORAGE, SYSTEM.HOST)
    first.$persist()
    first.$dispose()
    const second = useMessageStore(createPersistedPinia())
    const subscriber = vi.fn()
    second.subscribe(KEY.MAP_LOCATE_CALL, subscriber)
    expect(second.getLastByEventKey(KEY.MAP_LOCATE_CALL)?.data).toEqual({ id: 'c1' })
    expect(second.lastBySystem[SYSTEM.HOST]?.eventKey).toBe(KEY.MAP_LOCATE_CALL)
    expect(subscriber).not.toHaveBeenCalled()
    second.clearLastByEventKey(KEY.MAP_LOCATE_CALL)
    second.$persist()
    second.$dispose()
    expect(useMessageStore(createPersistedPinia()).getLastByEventKey(KEY.MAP_LOCATE_CALL)).toBeNull()
  })

  it('Given WS 原始包装同时带 T1 When 接收 Then 仅发专属事件并合并传输元数据', () => {
    const store = useMessageStore()
    const positionSubscriber = vi.fn()
    const t1Subscriber = vi.fn()
    store.subscribe(KEY.MAP_LOCATE_CALL, positionSubscriber)
    store.subscribe(KEY.MAP_READY, t1Subscriber)
    const stop = store.connectWebSocket({ url: 'ws://example.test', system: SYSTEM.HOST })
    transport.options[0].onMessage?.(
      {
        meta: { traceId: 'trace-1' },
        userMsgBodyList: [
          {
            content: JSON.stringify({ taskType: 'weizhiwang', eventid: 'c1', lng: 113.9, lat: 22.5 }),
          },
        ],
        payload: { eventType: KEY.MAP_READY, data: { t1: true } },
      },
      new MessageEvent('message'),
    )
    expect(positionSubscriber).toHaveBeenCalledOnce()
    expect(positionSubscriber.mock.calls[0][0]).toMatchObject({
      channel: CHANNEL.WS,
      system: SYSTEM.HOST,
      data: { id: 'c1' },
      meta: { readyState: 1, traceId: 'trace-1' },
    })
    expect(t1Subscriber).not.toHaveBeenCalled()
    stop()
  })
})
