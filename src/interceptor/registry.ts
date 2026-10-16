/**
 * 拦截器注册表 + 链式执行
 *
 * - register / unregister / setEnabled
 * - run(raw, channel, system) -> NormalizedMessage[]
 * - subscribe.dispatch === 'multi' 时按多结果路径处理（results[]）
 */

import type {
  InterceptorContext,
  InterceptorOutput,
  MessageInterceptor,
  NormalizedMessage,
  SubscribeRule,
} from './types'
import { matchSubscription } from './matcher'
import { createLogger } from '@/utils/logger'

const log = createLogger('interceptor')

const sortByPriority = (list: MessageInterceptor[]) => [...list].sort((a, b) => a.priority - b.priority)

const isTemplate = (sub: SubscribeRule) => sub.type === 'CUSTOM' || sub.type === 'SEAT'

const flatten = (out: InterceptorOutput): NormalizedMessage[] => {
  if (Array.isArray(out.results) && out.results.length) return out.results
  if (out.matched && out.eventKey) {
    return [
      {
        eventKey: out.eventKey as NormalizedMessage['eventKey'],
        data: out.data,
        meta: out.meta,
      },
    ]
  }
  return []
}

class InterceptorRegistry {
  private items: MessageInterceptor[] = []
  private sortedCache: MessageInterceptor[] | null = null

  register(interceptor: MessageInterceptor): () => void {
    if (this.items.some((i) => i.id === interceptor.id)) {
      log.warn('duplicate id', { interceptorId: interceptor.id })
    }
    this.items.push(interceptor)
    this.sortedCache = null
    return () => this.unregister(interceptor.id)
  }

  unregister(id: string): void {
    this.items = this.items.filter((i) => i.id !== id)
    this.sortedCache = null
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const target = this.items.find((i) => i.id === id)
    if (!target) return false
    target.enabled = enabled
    return true
  }

  list(): readonly MessageInterceptor[] {
    return this.sortedCache ?? (this.sortedCache = sortByPriority(this.items))
  }

  clear(): void {
    this.items = []
    this.sortedCache = null
  }

  /**
   * 执行拦截器链
   *   - subscribe.type 为 CUSTOM/SEAT 时：先按 subscribe 模板匹配，再调 transform
   *   - subscribe.dispatch === 'multi'：transform 应返回 results[] 二次分发
   *   - 其他：跳过模板匹配，由 transform 自行判断
   */
  run(raw: unknown, channel: string, system: string): NormalizedMessage[] {
    const list = this.list().filter((i) => i.enabled !== false)
    if (!list.length) return []

    const collected: NormalizedMessage[] = []
    const ctx: InterceptorContext = { raw, channel, system }

    for (const it of list) {
      if (it.fallback && collected.length) continue

      let out: InterceptorOutput
      try {
        if (isTemplate(it.subscribe) && !matchSubscription(ctx, it.subscribe)) continue
        out = it.transform(ctx)
      } catch (error) {
        log.error('拦截器执行异常', {
          interceptorId: it.id,
          error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
        })
        continue
      }
      if (!out || !out.matched) continue

      const results = flatten(out)
      if (results.length) collected.push(...results)

      if (out.stop) break
    }

    return collected
  }
}

export const interceptorRegistry = new InterceptorRegistry()

export const defineInterceptor = (interceptor: MessageInterceptor) => interceptorRegistry.register(interceptor)
