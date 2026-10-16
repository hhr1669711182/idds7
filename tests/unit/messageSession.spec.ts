import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '@/store/useUserStore'
import { initMessage, type MessageSessionHandle } from '@/register/initMessage'

const transport = vi.hoisted(() => ({
  closeWs: vi.fn(),
  closeParent: vi.fn(),
  closeBc: vi.fn(),
  connect: vi.fn(),
  parent: vi.fn(),
  bc: vi.fn(),
  socket: { subscribe: vi.fn(() => true), unsubscribe: vi.fn(() => true) },
  clients: new Map<string, unknown>(),
}))
vi.mock('@/store/useMessageStore', () => ({
  useMessageStore: () => ({
    connectWebSocket: transport.connect,
    bindParent: transport.parent,
    bindBroadcastChannel: transport.bc,
    disconnectSystem: vi.fn(),
    wsClients: transport.clients,
  }),
}))
vi.mock('@/config/env', () => ({
  appEnv: {
    useWS: true,
    usePostMessage: true,
    useBroadcastChannel: true,
    wsUrl: 'ws://localhost/message-client/ws',
    messageClient: 'ids-seat-web',
    broadcastChannelName: 'host',
  },
}))

describe('会话和App通道分域（回归 2026-10-15 M7）', () => {
  let dispose: MessageSessionHandle | undefined
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    transport.clients.clear()
    transport.connect.mockReturnValue(transport.closeWs)
    transport.parent.mockReturnValue(transport.closeParent)
    transport.bc.mockReturnValue(transport.closeBc)
    transport.connect.mockImplementation(() => {
      transport.clients.set('ids-seat-web', transport.socket)
      return transport.closeWs
    })
  })
  afterEach(() => dispose?.())
  const apply = (seat = 'seat', token = 'token') =>
    useUserStore().applySharedState(
      JSON.stringify({
        v: 1,
        updatedAt: Date.now(),
        phase: 'onDuty',
        user: { userId: 'user' },
        auth: { sessionId: 'session', accessToken: token },
        seat: { seatNumber: seat },
      }),
    )

  it('Given 未登录 When 装配并登录再登出 Then App通道常驻且WS单独释放', () => {
    dispose = initMessage()
    expect(transport.closeParent).not.toHaveBeenCalled()
    expect(transport.closeBc).not.toHaveBeenCalled()
    apply()
    expect(transport.connect).toHaveBeenCalledTimes(1)
    useUserStore().applySharedState(JSON.stringify({ v: 1, updatedAt: 2, phase: 'loggedOut', auth: null }))
    expect(transport.closeWs).toHaveBeenCalledTimes(1)
    expect(transport.closeParent).not.toHaveBeenCalled()
    dispose()
    expect(transport.closeParent).toHaveBeenCalledTimes(1)
    expect(transport.closeBc).toHaveBeenCalledTimes(1)
  })

  it('Given 已连接 When 刷新token及换席 Then token不重连且换席在同连接退订/订阅', () => {
    apply()
    dispose = initMessage()
    apply('seat', 'new-token')
    expect(transport.connect).toHaveBeenCalledTimes(1)
    apply('new-seat')
    expect(transport.closeWs).not.toHaveBeenCalled()
    expect(transport.connect).toHaveBeenCalledTimes(1)
    const options = transport.connect.mock.calls[0][0]
    expect(options.url).toBe('ws://localhost/message-client/ws')
    expect(options.socketOptions.initSend).toContainEqual({ action: 'subscribe', topic: 'seat/seat' })
    expect(transport.socket.unsubscribe).toHaveBeenCalledWith('seat/seat')
    expect(transport.socket.subscribe).toHaveBeenCalledWith('seat/new-seat')
    expect(options.socketOptions.initSend.every((frame: unknown) => typeof frame === 'object')).toBe(true)
  })

  it('Given 已连接 When 换用户或会话 Then 释放旧连接并按新身份订阅', () => {
    apply()
    dispose = initMessage()
    useUserStore().applySharedState(
      JSON.stringify({
        v: 1,
        updatedAt: Date.now(),
        phase: 'onDuty',
        user: { userId: 'user-2' },
        auth: { sessionId: 'session-2', accessToken: 'token-2' },
        seat: { seatNumber: 'seat' },
      }),
    )
    expect(transport.closeWs).toHaveBeenCalledTimes(1)
    expect(transport.connect).toHaveBeenCalledTimes(2)
    const options = transport.connect.mock.calls[1][0]
    expect(options.socketOptions.initSend).toContainEqual({ action: 'subscribe', topic: 'user/user-2/screen/map' })
  })

  it('Given 专用业务订阅 When 连接就绪 Then 立案、应答、GPS与画像 topic 均已声明', () => {
    apply()
    dispose = initMessage()
    const initSend = transport.connect.mock.calls[0][0].socketOptions.initSend
    expect(initSend).toEqual(
      expect.arrayContaining([
        { action: 'subscribe', topic: 'ALARM_INCIDENT/STATE_CHANGED' },
        { action: 'subscribe', topic: 'ALARM_CALL/ANSWER_STATUS_CHANGED' },
        { action: 'subscribe', topic: 'GPS_MSG/car-location-broadcast-all' },
        { action: 'subscribe', topic: 'DISASTER_PROFILE/UPDATED' },
      ]),
    )
  })

  it('Given 订阅回执 When ok 与 denied 到达 Then 可查询各 topic 订阅状态', () => {
    apply()
    dispose = initMessage()
    const onSubscribeResult = transport.connect.mock.calls[0][0].socketOptions.onSubscribeResult
    onSubscribeResult({ topic: 'seat/seat', result: 'ok' })
    onSubscribeResult({ topic: 'seat/seat', result: 'denied', reason: 'not_authorized' })
    expect(dispose.subscriptionStatus()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic: 'seat/seat', result: 'denied', reason: 'not_authorized' }),
        expect.objectContaining({ topic: 'ALARM_CALL/ANSWER_STATUS_CHANGED', result: 'pending' }),
      ]),
    )
  })

  it('Given 会话结束 When 重新登录 Then 订阅状态随旧会话清空', () => {
    apply()
    dispose = initMessage()
    const onSubscribeResult = transport.connect.mock.calls[0][0].socketOptions.onSubscribeResult
    onSubscribeResult({ topic: 'seat/seat', result: 'denied', reason: 'not_authorized' })
    useUserStore().applySharedState(JSON.stringify({ v: 1, updatedAt: 2, phase: 'loggedOut', auth: null }))
    expect(dispose.subscriptionStatus()).toEqual([])
  })

  it('Given 身份完整但无token When fallback凭证随后到达 Then 仅在凭证就绪后连接', () => {
    apply('seat', '')
    dispose = initMessage()
    expect(transport.connect).not.toHaveBeenCalled()
    useUserStore().applyAuthSession(JSON.stringify({ accessToken: 'fallback' }))
    expect(transport.connect).toHaveBeenCalledTimes(1)
    const options = transport.connect.mock.calls[0][0]
    expect(options.socketOptions.connectAuth.payload().token).toBe('fallback')
    useUserStore().applyAuthSession(null)
    expect(transport.closeWs).toHaveBeenCalledTimes(1)
  })
})
