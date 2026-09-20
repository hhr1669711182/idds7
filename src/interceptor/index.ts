/**
 * 拦截器入口
 *
 * 用法：
 *   import { installDefaultInterceptors } from '@/interceptor'
 *   installDefaultInterceptors()
 *
 * 设计：
 *   - subscribe 字段直接消费 MESSAGE_SUBSCRIBE_TOPIC 的解构
 *   - subscribe.dispatch === 'multi' 标记 SEAT 泛订阅，走二次分发路径
 *   - registry.run 自动按 subscribe 做模板匹配，业务 transform 只关心数据归一
 */

export { interceptorRegistry, defineInterceptor } from './registry'
export type {
  InterceptorContext,
  InterceptorOutput,
  MessageInterceptor,
  NormalizedMessage,
  SubscribeRule,
} from './types'
export { installDefaultInterceptors } from './install'