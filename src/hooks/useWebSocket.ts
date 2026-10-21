/*
 * @Author: hhr
 * @Date: 2026-04-21 18:40:47
 * @LastEditTime: 2026-10-19 10:00:00
 * @LastEditors: hhr
 * @Description: WebSocket 客户端：多实例、自动重连、心跳保活；协议鉴权委托给 AuthStrategy
 * @FilePath: \ids-gis-web\src\hooks\useWebSocket.ts
 */

import {
  OpenAuthStrategy,
  V2AuthStrategy,
  type AuthStrategy,
  type WebSocketConnectAuth,
  type WebSocketConnectedInfo,
  type WebSocketSubscribeResult,
} from './useWebSocketAuth'

export type { WebSocketConnectAuth, WebSocketConnectedInfo, WebSocketSubscribeResult } from './useWebSocketAuth'

export interface WebSocketOptions {
  reconnect?: boolean
  reconnectAttempts?: number
  reconnectInterval?: number
  heartbeat?: boolean
  heartbeatInterval?: number
  heartbeatMessage?: string | object
  onOpen?: (event: Event) => void
  onMessage?: (data: any, event: MessageEvent) => void
  onError?: (event: Event) => void
  onClose?: (event: CloseEvent) => void
  initSend?: string | object | Array<string | object>
  /**
   * 消息服务 V2：配置后连接打开会先发 CONNECT 首帧鉴权，
   * 收到 connected 成功后才进入就绪态（启动心跳 / 发送 initSend / 回调 onOpen）。
   * 不配置则保持“打开即用”的旧行为。
   */
  connectAuth?: WebSocketConnectAuth
  /** connected 鉴权通过、进入就绪态时触发（晚于 onOpen） */
  onReady?: (info: WebSocketConnectedInfo, event: Event) => void
  /** connected result=denied 或鉴权超时 */
  onAuthDenied?: (reason: string, raw: any) => void
  /** subscribed 订阅回执（含 denied） */
  onSubscribeResult?: (result: WebSocketSubscribeResult) => void
}

/** 带默认值的选项子集，字段声明处无需重复 Required<Pick<...>> */
interface ResolvedOptions {
  reconnect: boolean
  reconnectAttempts: number
  reconnectInterval: number
  heartbeat: boolean
  heartbeatInterval: number
  heartbeatMessage: string | object
}

/**
 * WebSocket 传输层：连接 / 断线重连 / 心跳保活 / 帧收发。
 *
 * 协议相关（CONNECT 首帧鉴权、控制帧消费）全部委托给 AuthStrategy，
 * 本类不含任何 V2 协议细节，见 useWebSocketAuth.ts。
 */
export class WebSocketClient {
  public ws: WebSocket | null = null
  private url: string
  private options: WebSocketOptions & ResolvedOptions
  private attempts = 0
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private heartbeatTimer?: ReturnType<typeof setInterval>
  /** 最近一次 onopen 事件，供 markReady 回调 onOpen 时复用 */
  private openEvent?: Event
  /** 当前连接是否已进入就绪态：保证心跳 / initSend / onOpen 只触发一次 */
  private ready = false
  /** 协议鉴权策略：无 connectAuth 时为恒就绪的空实现 */
  private auth: AuthStrategy

  constructor(url: string, options: WebSocketOptions = {}) {
    this.url = url
    this.options = {
      reconnect: true,
      reconnectAttempts: 5,
      reconnectInterval: 3000,
      heartbeat: false,
      heartbeatInterval: 30000,
      heartbeatMessage: 'ping',
      ...options,
    }
    this.auth = this.createAuthStrategy()
    this.connect()
  }

  public connect = () => {
    if (this.ws?.readyState === WebSocket.OPEN) return

    const socket = new WebSocket(this.url)
    this.ws = socket

    socket.onopen = (e) => {
      this.openEvent = e
      this.auth.handshake()
      // 无鉴权策略时 ready 恒为 true，握手即就绪；V2 由策略在 connected 后回调 markReady
      if (this.auth.ready) this.markReady()
    }

    socket.onmessage = (e) => {
      const raw = e.data

      // 心跳回执：直接吞掉
      if (raw === 'pong') return

      let parsed: any = raw
      if (typeof raw === 'string') {
        try {
          parsed = JSON.parse(raw)
        } catch {
          parsed = raw
        }
      }

      // 控制帧由鉴权策略消费，不透传给业务
      if (this.auth.handleFrame(parsed)) return

      // 鉴权完成前丢弃一切业务帧
      if (!this.auth.ready) return

      this.options.onMessage?.(parsed, e)
    }

    socket.onerror = (e) => this.options.onError?.(e)

    socket.onclose = (e) => {
      this.ready = false
      this.auth.reset()
      this.stopHeartbeat()
      this.options.onClose?.(e)

      if (this.options.reconnect && this.attempts < this.options.reconnectAttempts) {
        this.attempts++
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = setTimeout(this.connect, this.options.reconnectInterval)
      }
    }
  }

  public send = (data: string | object | ArrayBuffer | Blob) => {
    if (this.ws?.readyState !== WebSocket.OPEN) return false
    // 鉴权完成前除 CONNECT 首帧（由策略直发）外，不允许发送业务数据
    if (!this.auth.ready) return false
    this.ws.send(typeof data === 'string' ? data : JSON.stringify(data))
    return true
  }

  public sendEvent = <T = any>(eventKey: string, data?: T, extra?: Record<string, any>) => {
    return this.send({ eventKey, data, ...extra })
  }

  /** V2：订阅层级 topic（相对 clientId，可含 + / # 通配） */
  public subscribe = (topic: string) => {
    return this.send({ action: 'subscribe', topic })
  }

  /** V2：退订 topic */
  public unsubscribe = (topic: string) => {
    return this.send({ action: 'unsubscribe', topic })
  }

  public disconnect = () => {
    this.options.reconnect = false
    clearTimeout(this.reconnectTimer)
    this.ready = false
    this.auth.reset()
    this.stopHeartbeat()
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onclose = null
      this.ws.close()
    }
    this.ws = null
  }

  /**
   * 进入就绪态：启动心跳、flush 初始订阅，并回调 onOpen。
   * 无鉴权策略时 onopen 直接就绪；V2 时由 connected 控制帧触发策略置位后调用。
   */
  private markReady = () => {
    if (this.ready) return
    this.ready = true
    // 仅在鉴权通过后才清零重试计数。
    // 若放在 onopen，CONNECT 被拒（denied/超时）时服务端会「打开即关闭」，
    // 计数不断被重置，reconnectAttempts 永远不生效，形成死循环。
    this.attempts = 0
    this.startHeartbeat()

    // 发送连接初始化消息（例如 Topic 订阅）；重连成功后也会再次发送。
    const initialMessages = Array.isArray(this.options.initSend) ? this.options.initSend : [this.options.initSend]
    initialMessages.forEach((message) => {
      if (message && (typeof message === 'string' || Object.keys(message).length > 0)) {
        this.send(message)
      }
    })

    if (this.openEvent) this.options.onOpen?.(this.openEvent)
  }

  /** 构建鉴权策略：V2 用握手策略，其余保持打开即用 */
  private createAuthStrategy = (): AuthStrategy => {
    const handlers = {
      onReady: this.markReady,
      onConnected: (info: WebSocketConnectedInfo) => {
        if (this.openEvent) this.options.onReady?.(info, this.openEvent)
      },
      onAuthDenied: this.options.onAuthDenied,
      onSubscribeResult: this.options.onSubscribeResult,
    }
    if (!this.options.connectAuth) return new OpenAuthStrategy()
    return new V2AuthStrategy(
      this.options.connectAuth,
      handlers,
      (frame) => {
        // CONNECT 首帧需绕过「鉴权后才允许 send」的闸门，直接发送
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(frame))
      },
      () => {
        try {
          this.ws?.close()
        } catch {
          /* 忽略关闭异常 */
        }
      },
    )
  }

  private startHeartbeat = () => {
    if (!this.options.heartbeat) return
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => this.send(this.options.heartbeatMessage), this.options.heartbeatInterval)
  }

  private stopHeartbeat = () => clearInterval(this.heartbeatTimer)
}
