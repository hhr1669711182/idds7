/*
 * @Author: hhr
 * @Date: 2026-04-21 18:27:41
 * @LastEditTime: 2026-04-23 19:31:53
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\hooks\usePostMessage.ts
 */
import { onMounted, onUnmounted } from 'vue'

export type EventMessage<T = any> = {
  eventKey?: string
  data?: T
  type?: string
  payload?: any
  system?: string
  [key: string]: any
}

export type ListenParentOptions = {
  acceptOrigins?: string[]
}

/**
 * 监听上游系统（父窗口）发送的消息
 * @param callback 接收到消息时的回调业务逻辑
 */
export const useListenParentMessage = <T = any>(
  callback: (data: EventMessage<T>, event: MessageEvent) => void,
  options: ListenParentOptions = {},
) => {
  const accept = options.acceptOrigins?.length ? new Set(options.acceptOrigins) : null
  const handler = (event: MessageEvent) => {
    if (accept && typeof event.origin === 'string' && !accept.has(event.origin)) return
    event.data && callback(event.data as EventMessage<T>, event)
  }

  onMounted(() => window.addEventListener('message', handler))
  onUnmounted(() => window.removeEventListener('message', handler))
}

/**
 * 向下游系统（内嵌iframe）发送消息
 * @param iframeRef iframe 的模板引用或 DOM 元素
 */
export const usePostChildMessage = (iframeRef: () => HTMLIFrameElement | null | undefined) => {
  const sendMessage = <T = any>(data: EventMessage<T>, targetOrigin = '*') => {
    const iframe = iframeRef()
    iframe?.contentWindow?.postMessage(data, targetOrigin)
  }
  return { sendMessage }
}

/**
 * 向上游系统（父窗口）发送消息
 */
export const usePostParentMessage = () => {
  const sendMessage = <T = any>(data: EventMessage<T>, targetOrigin = '*') => {
    window.parent?.postMessage(data, targetOrigin)
  }
  return { sendMessage }
}
