/**
 * 拦截器核心类型
 *
 * 设计：
 *   - subscribe: 与 MESSAGE_SUBSCRIBE_TOPIC 同构；registry 用其做模板匹配
 *   - dispatch: 'multi' 标记 SEAT 泛订阅，transform 可返回 results[] 二次分发
 *   - transform: 通过 ctx.raw + matcher 公共兜底判断，业务只关心数据归一
 */

import type { MessageEventKey } from '@/const/const.message.type'

/** 订阅规则：与 MESSAGE_SUBSCRIBE_TOPIC 同构 */
export interface SubscribeRule {
  type: 'CUSTOM' | 'SEAT' | string
  customType?: string
  key?: string | null
  /**
   * single: 默认；transform 返回单条结果，eventKey 由 transform 决定
   * multi:  SEAT 泛订阅；transform 返回 results[] 二次分发到多个内部 eventKey
   */
  dispatch?: 'single' | 'multi'
  /** 兼容 MESSAGE_SUBSCRIBE_TOPIC 其它字段（如 action） */
  [extra: string]: unknown
}

/** 拦截器执行上下文 */
export interface InterceptorContext {
  channel: string
  system: string
  raw: unknown
  eventKey?: string
  meta?: Record<string, unknown>
}

/** 单条标准化消息（拦截器链最终产物） */
export interface NormalizedMessage {
  eventKey: MessageEventKey
  data: unknown
  meta?: Record<string, unknown>
}

/** 拦截器输出 */
export interface InterceptorOutput {
  matched: boolean
  data?: unknown
  eventKey?: string
  meta?: Record<string, unknown>
  results?: NormalizedMessage[]
  stop?: boolean
}

/** 拦截器定义 */
export interface MessageInterceptor {
  id: string
  priority: number
  enabled?: boolean
  describe?: string
  /** 订阅规则：与 MESSAGE_SUBSCRIBE_TOPIC 入参完全一致 */
  subscribe: SubscribeRule
  /** 转换 */
  transform: (ctx: InterceptorContext) => InterceptorOutput
}