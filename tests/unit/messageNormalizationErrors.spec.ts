import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MESSAGE_EVENT_KEY as KEY } from '@/const/const.message.type'
import { interceptorRegistry } from '@/interceptor/registry'
import { logger } from '@/utils/logger'

vi.mock('@/store', () => ({ useUserStore: () => ({ seatNumber: '8001' }) }))

describe('Given 消息归一订阅异常 When 执行注册链 Then 异常隔离且可观察', () => {
  beforeEach(() => {
    interceptorRegistry.clear()
    logger.clear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    interceptorRegistry.clear()
    logger.clear()
    vi.restoreAllMocks()
  })

  it('Given 模板匹配抛错 When 后续拦截器可接收 Then 记录错误并继续链路', () => {
    const failure = new Error('broken subscription')
    const rejectedTransform = vi.fn(() => ({ matched: false }))
    interceptorRegistry.register({
      id: 'broken-match',
      priority: 10,
      subscribe: {
        type: 'CUSTOM',
        get customType(): string {
          throw failure
        },
      },
      transform: rejectedTransform,
    })
    const data = { ready: true }
    const acceptedTransform = vi.fn(() => ({ matched: true, eventKey: KEY.MAP_READY, data, stop: true }))
    interceptorRegistry.register({
      id: 'accepted',
      priority: 20,
      subscribe: { type: 'RAW' },
      transform: acceptedTransform,
    })
    expect(interceptorRegistry.run({ topics: [{ type: 'CUSTOM', key: 'ready' }] }, 'ws', 'host')).toEqual([
      { eventKey: KEY.MAP_READY, data, meta: undefined },
    ])
    expect(rejectedTransform).not.toHaveBeenCalled()
    expect(acceptedTransform).toHaveBeenCalledOnce()
    expect(logger.export()).toMatchObject([
      {
        namespace: 'interceptor',
        level: 'error',
        data: {
          interceptorId: 'broken-match',
          error: { name: 'Error', message: 'broken subscription' },
        },
      },
    ])
  })
})
