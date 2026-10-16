import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocketClient, type WebSocketOptions } from '@/hooks/useWebSocket'

/** 可控的 WebSocket 替身：记录 send/close，按测试脚本触发 open/message/close。 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static readonly OPEN = 1
  static readonly CLOSED = 3
  readyState = FakeWebSocket.OPEN
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  sent: unknown[] = []
  closed = false

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.closed = true
  }
  open() {
    this.onopen?.(new Event('open'))
  }
  emit(payload: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }))
  }
  serverClose() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.(new CloseEvent('close'))
  }
}

const connectOptions = (): WebSocketOptions => ({
  reconnect: true,
  reconnectAttempts: 2,
  reconnectInterval: 5,
  connectAuth: { payload: () => ({ action: 'connect', token: 't', clientId: 'ids-seat-web' }) },
})

describe('V2 WebSocketClient：Given 鉴权与重连 Then 不再对 denied 无限重连', () => {
  beforeEach(() => {
    FakeWebSocket.instances.length = 0
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWebSocket)
    Object.assign(FakeWebSocket, { OPEN: 1, CLOSED: 3 })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('Given CONNECT 被拒 When 服务端随后关闭 Then 按 reconnectAttempts 停止重连', () => {
    const denied = vi.fn()
    const client = new WebSocketClient('ws://host/ws', { ...connectOptions(), onAuthDenied: denied })
    const first = FakeWebSocket.instances[0]!
    first.open()
    first.emit({ action: 'connected', result: 'denied', reason: 'invalid_token' })
    first.serverClose()
    vi.advanceTimersByTime(5)
    expect(FakeWebSocket.instances).toHaveLength(2)
    secondCycle(FakeWebSocket.instances)
    vi.advanceTimersByTime(5)
    expect(FakeWebSocket.instances).toHaveLength(3)
    denied.mockClear()
    secondCycle(FakeWebSocket.instances)
    vi.advanceTimersByTime(5)
    expect(FakeWebSocket.instances).toHaveLength(3)
    expect(denied).toHaveBeenCalledWith('invalid_token', expect.anything())
    client.disconnect()
  })

  it('Given 鉴权通过后断线 When 自动重连 Then 次数重新计数', () => {
    const client = new WebSocketClient('ws://host/ws', connectOptions())
    const first = FakeWebSocket.instances[0]!
    first.open()
    first.emit({ action: 'connected', userId: 'u', sessionState: 's' })
    first.serverClose()
    vi.advanceTimersByTime(5)
    expect(FakeWebSocket.instances).toHaveLength(2)
    const second = FakeWebSocket.instances[1]!
    second.open()
    second.emit({ action: 'connected' })
    second.serverClose()
    vi.advanceTimersByTime(5)
    expect(FakeWebSocket.instances).toHaveLength(3)
    client.disconnect()
  })

  it('Given 订阅回执 When ok 与 denied 到达 Then 分别回调且鉴权前不回调 onOpen', () => {
    const onOpen = vi.fn()
    const onReady = vi.fn()
    const onSubscribeResult = vi.fn()
    const client = new WebSocketClient('ws://host/ws', {
      ...connectOptions(),
      onOpen,
      onReady,
      onSubscribeResult,
      initSend: [{ action: 'subscribe', topic: 'seat/8001' }],
    })
    const socket = FakeWebSocket.instances[0]!
    socket.open()
    expect(onOpen).not.toHaveBeenCalled()
    expect(JSON.parse(socket.sent[0] as string)).toMatchObject({ action: 'connect' })
    socket.emit({ action: 'connected' })
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onReady).toHaveBeenCalledOnce()
    expect(JSON.parse(socket.sent[1] as string)).toEqual({ action: 'subscribe', topic: 'seat/8001' })
    socket.emit({ action: 'subscribed', topic: 'seat/8001', result: 'ok' })
    socket.emit({ action: 'subscribed', topic: 'seat/8001', result: 'denied', reason: 'not_authorized' })
    expect(onSubscribeResult).toHaveBeenNthCalledWith(1, { topic: 'seat/8001', result: 'ok' })
    expect(onSubscribeResult).toHaveBeenNthCalledWith(2, {
      topic: 'seat/8001',
      result: 'denied',
      reason: 'not_authorized',
    })
    client.disconnect()
  })
})

const secondCycle = (instances: FakeWebSocket[]) => {
  const socket = instances[instances.length - 1]!
  socket.open()
  socket.emit({ action: 'connected', result: 'denied', reason: 'invalid_token' })
  socket.serverClose()
}
