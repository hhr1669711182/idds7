import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBroadcastChannelBridge } from '@/composables/useBroadcastChannelBridge'

class TestChannel {
  static latest: TestChannel
  readonly listeners = new Set<(event: MessageEvent) => void>()
  postMessage = vi.fn()
  close = vi.fn()
  constructor(readonly name: string) {
    TestChannel.latest = this
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

describe('通用 BC 原生契约（回归 F12 禁止自动 JSON 解析）', () => {
  beforeEach(() => vi.stubGlobal('BroadcastChannel', TestChannel))
  afterEach(() => vi.unstubAllGlobals())

  it('Given 对象与 JSON 字符串 When send/receive Then 保留引用和原始类型', () => {
    const bridge = createBroadcastChannelBridge('raw-channel')
    const received = vi.fn()
    bridge.listen((event) => received(event.data))
    const object = { v: 1, type: 'raw' }
    const text = JSON.stringify(object)
    for (const value of [object, text, null, undefined]) {
      TestChannel.latest.receive(value)
      expect(received.mock.calls.at(-1)?.[0]).toBe(value)
      bridge.send(value)
      expect(TestChannel.latest.postMessage.mock.calls.at(-1)?.[0]).toBe(value)
    }
    bridge.dispose()
  })

  it('Given 回调或发送异常 When 收发 Then 异常按原生语义传出且不重复回调', () => {
    const bridge = createBroadcastChannelBridge('raw-channel')
    const callback = vi.fn(() => {
      throw new Error('handler')
    })
    bridge.listen(callback)
    expect(() => TestChannel.latest.receive('{}')).toThrow('handler')
    expect(callback).toHaveBeenCalledTimes(1)
    TestChannel.latest.postMessage.mockImplementation(() => {
      throw new Error('clone')
    })
    expect(() => bridge.send({})).toThrow('clone')
    bridge.close()
  })

  it('Given 解绑/关闭 When 后续消息到达 Then 无残留监听且关闭幂等', () => {
    const bridge = createBroadcastChannelBridge('raw-channel')
    const listener = vi.fn()
    const unsubscribe = bridge.listen(listener)
    unsubscribe()
    TestChannel.latest.receive({})
    expect(listener).not.toHaveBeenCalled()
    bridge.listen(listener)
    bridge.close()
    bridge.dispose()
    expect(TestChannel.latest.listeners.size).toBe(0)
    expect(TestChannel.latest.close).toHaveBeenCalledTimes(1)
    expect(() => bridge.send({})).not.toThrow()
  })

  it('Given BC 创建异常 When 创建桥 Then 交由业务调用者决定降级', () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('disabled')
        }
      },
    )
    expect(() => createBroadcastChannelBridge('raw-channel')).toThrow('disabled')
  })
})
