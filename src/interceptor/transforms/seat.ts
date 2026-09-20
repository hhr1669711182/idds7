/**
 * SEAT 通道二次分发
 *
 * subscribe 通过 setSeatSubscribe(rule) 注入；seatInterceptor.subscribe 用 getter 实时读取
 *
 * 输入消息走 unwrap.ts 归一化后传给 dispatcher：
 *   - content / customContent 一律是对象或 null（JSON 字符串自动 parse）
 *   - notifyType / notifySubType 一律是大写
 *
 * 新增 SEAT 业务时，在 dispatchers/<name>.ts 里 export 一个 dispatcher，
 * 然后在 seatDispatchers 数组里登记即可。
 */

import type { MessageInterceptor, NormalizedMessage, SubscribeRule } from '../types'
import { normalize, type NormalizeResult } from '../unwrap'
import { locateCallDispatcher } from './dispatchers/locateCall'
import { addressRobotDispatcher } from './dispatchers/addressRobot'

/** 业务识别：命中即返回对应 NormalizedMessage 列表；不命中返回 null */
export type SeatDispatcher = (m: NormalizeResult) => NormalizedMessage[] | null

/** SEAT 二次分发规则登记表 */
const seatDispatchers: SeatDispatcher[] = [
  locateCallDispatcher,
  addressRobotDispatcher,
]

/** SEAT 订阅配置：模块加载时为空，由 install 注入 */
let currentSubscribe: SubscribeRule = { type: 'SEAT', dispatch: 'multi' }
export const setSeatSubscribe = (rule: SubscribeRule) => {
  currentSubscribe = rule
}

const transform: MessageInterceptor['transform'] = (ctx) => {
  const m = normalize(ctx.raw)
  if (!m) return { matched: false }

  const results: NormalizedMessage[] = []
  for (const dispatcher of seatDispatchers) {
    const out = dispatcher(m)
    if (out && out.length) results.push(...out)
  }
  if (!results.length) return { matched: false }
  return { matched: true, results, stop: true }
}

export const seatInterceptor: MessageInterceptor = {
  id: 'topic:seat',
  priority: 150,
  describe: 'SEAT 通道二次分发',
  // getter：实时读取模块变量，避免 subscribe 被快照成旧值
  get subscribe() { return currentSubscribe },
  transform,
}

/** 工具：注册新的 SEAT dispatcher */
export const defineSeatDispatcher = (dispatcher: SeatDispatcher) => {
  seatDispatchers.push(dispatcher)
}