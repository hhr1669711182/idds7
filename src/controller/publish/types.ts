/**
 * publish 分类文件的共享类型。
 *
 * 用途：让各分类文件的载荷类型在有协议 DTO 时复用 protocol 定义，
 * 而不是各自 `as` 断言或退化成 `any`。
 */

import type { MessageChannel, MessageSystem } from '@/const/const.message.type'

/**
 * publish 返回值语义：true = 已进入消息链路（可能被订阅者消费），
 * false = 未发送（无订阅者 / 未连接 / 前置校验失败）。
 * 调用方需要区分时按 boolean 处理，不要假设一定成功。
 */
export type PublishResult = boolean

/**
 * 分类文件的固定发送配置。
 * system / channel 在文件内固定，不作为函数参数暴露给调用方。
 */
export interface FixedPublishOptions {
  readonly system: MessageSystem
  readonly channel: MessageChannel
}