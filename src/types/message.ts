/*
 * @Author: hhr
 * @Date: 2026-04-23 19:23:39
 * @LastEditTime: 2026-04-29 17:36:04
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\types\message.ts
 */
import type { MessageChannel, MessageEventKey, MessageSystem } from '@/const/const.message.type'

/**
 * 消息信封，用于在系统内部或跨系统传递消息
 * @template T 消息体数据的类型，默认为任意类型
 */
export type MessageEnvelope<T = any> = {
  /** 消息唯一标识，用于追踪和幂等处理 */
  id: string
  /** 消息时间戳，单位毫秒，记录消息创建时间 */
  timestamp: number
  /** 消息通道，标识消息所属的业务通道 */
  channel: MessageChannel
  /** 消息来源系统，标识发送该消息的系统 */
  system: MessageSystem
  /** 事件键，用于区分同一通道下的不同事件类型 */
  eventKey: MessageEventKey
  /** 消息体，承载具体业务数据 */
  data: T
  /** 可选，目标系统，指定消息应被哪个系统处理；留空表示广播给所有订阅者 */
  targetSystem?: MessageSystem
  /** 可选，附加元数据，用于扩展字段，如链路追踪、用户标识等 */
  meta?: Record<string, any>
  /** 可选，消息协议版本，当前固定为 '1.0.0'，用于后续版本兼容 */
  v?: '1.0.0'
  /** 可选，是否移除相同元素，默认 false */
  isRemoveSameElement?: boolean
}
