import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ingest = vi.hoisted(() => vi.fn())
vi.mock('@/store/useMessageStore', () => ({ useMessageStore: () => ({ ingest }) }))
vi.mock('@/store', () => ({ useUserStore: vi.fn() }))

import { createGisPointChannel, getGisPointChannel } from '@/composables/useGisPointSelection'
import { MESSAGE_EVENT_KEY } from '@/const/const.message.type'

class TestChannel {
  static instances: TestChannel[] = []
  readonly listeners = new Set<(event: MessageEvent) => void>()
  postMessage = vi.fn()
  close = vi.fn()
  constructor(readonly name: string) {
    TestChannel.instances.push(this)
  }
  addEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.add(listener)
  }
  removeEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.delete(listener)
  }
  receive(data: unknown) {
    this.listeners.forEach((listener) => listener({ data } as MessageEvent))
  }
}

const seat = (type: string, requestId = 'R1', extra: Record<string, unknown> = {}) => ({
  v: 1,
  type,
  source: 'seat',
  ownerId: 'owner',
  requestId,
  incidentID: 'I1',
  sentAt: 1,
  ...extra,
})

describe('F12 V1.0 迁位冻结（回归 GIS BC 既有 wire/session/ACK 行为）', () => {
  let cleanup = () => {}
  beforeEach(() => {
    TestChannel.instances = []
    vi.stubGlobal('BroadcastChannel', TestChannel)
    ingest.mockReset()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('Given App create 先于 getter When START/READY/PING Then 共用实例，wire 对象保持原样', () => {
    cleanup = createGisPointChannel()
    const channel = TestChannel.instances[0]
    expect(channel.name).toBe('ids-gis-point-selection')
    channel.receive(seat('PICK_START'))
    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: MESSAGE_EVENT_KEY.MOCK_INCIDENT_RELOCATE,
        data: { incidentId: 'I1', ownerId: 'owner', requestId: 'R1' },
      }),
      'broadcastChannel',
      'ids-seat-web',
      { source: 'gis-point-channel' },
    )
    const instance = getGisPointChannel()
    expect(getGisPointChannel()).toBe(instance)
    const ready = {
      v: 1 as const,
      type: 'PICK_READY' as const,
      source: 'gis' as const,
      ownerId: 'owner',
      requestId: 'R1',
      incidentID: 'I1',
      sentAt: 2,
    }
    instance.send(ready)
    expect(channel.postMessage.mock.calls[0][0]).toBe(ready)
    channel.receive(seat('PICK_PING'))
    expect(channel.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'PICK_PONG', requestId: 'R1' }),
    )
    expect(TestChannel.instances).toHaveLength(1)
  })

  it('Given 当前会话 When 匹配/不匹配 ACK 与旧 CANCEL Then 保留迟到 CANCEL 清新会话的冻结行为', () => {
    cleanup = createGisPointChannel()
    const channel = TestChannel.instances[0]
    channel.receive(seat('PICK_START', 'R2'))
    const ack = vi.fn()
    getGisPointChannel().onAck(ack)
    channel.receive(seat('PICK_APPLIED', 'R1'))
    expect(ack).not.toHaveBeenCalled()
    const applied = seat('PICK_APPLIED', 'R2')
    channel.receive(applied)
    expect(ack).toHaveBeenCalledWith(applied)
    channel.receive(seat('PICK_FAILED', 'R2'))
    expect(ack).toHaveBeenCalledTimes(2)
    channel.receive(seat('PICK_CANCEL', 'R1'))
    channel.receive(seat('PICK_PING', 'R2'))
    channel.receive(seat('PICK_APPLIED', 'R2'))
    expect(channel.postMessage).not.toHaveBeenCalled()
    expect(ack).toHaveBeenCalledTimes(2)
  })

  it('Given 通道 When JSON 字符串或无效 token 到达 Then 不自动解析也不投递', () => {
    cleanup = createGisPointChannel()
    const channel = TestChannel.instances[0]
    channel.receive(JSON.stringify(seat('PICK_START')))
    channel.receive(seat('PICK_START', ''))
    channel.receive(seat('PICK_START', 'R1', { v: '1' }))
    channel.receive(seat('PICK_START', 'R1', { sentAt: NaN }))
    expect(ingest).not.toHaveBeenCalled()
  })

  it('Given 创建/发送异常 When 工厂或 send 执行 Then 仍按旧语义降级', () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('unavailable')
        }
      },
    )
    expect(() => {
      cleanup = createGisPointChannel()
    }).not.toThrow()
    cleanup()
    vi.stubGlobal('BroadcastChannel', TestChannel)
    cleanup = createGisPointChannel()
    TestChannel.instances[0].postMessage.mockImplementation(() => {
      throw new Error('clone')
    })
    expect(() =>
      getGisPointChannel().send({
        v: 1,
        type: 'PICK_PONG',
        source: 'gis',
        ownerId: 'owner',
        requestId: 'R1',
        incidentID: 'I1',
        sentAt: 1,
      }),
    ).not.toThrow()
  })
})
