/**
 * 连接鉴权策略：把「消息服务 V2 的 CONNECT 首帧握手」从 WebSocket 传输层里剥离出来。
 *
 * 传输层（WebSocketClient）只负责连接 / 重连 / 心跳 / 收发；
 * 协议细节（首帧格式、鉴权超时、控制帧解析）全部收口在本文件的策略实现里，
 * 后续服务端协议演进只需改这里，不触碰传输层。
 */

/** connected 成功后服务端回传的连接身份 */
export interface WebSocketConnectedInfo {
  userId?: string
  sessionState?: string
  clientId?: string
}

/** subscribed 订阅回执 */
export interface WebSocketSubscribeResult {
  topic: string
  result: 'ok' | 'denied'
  reason?: string
}

/** CONNECT 首帧配置（鉴权） */
export interface WebSocketConnectAuth {
  /**
   * CONNECT 首帧负载，通常为 { action:'connect', token, clientId, tenantId? }。
   * 用函数形式，使自动重连时能读取到最新 token。
   */
  payload: object | (() => object)
  /** 鉴权超时（ms），默认 5000；超时未收到 connected 则判定失败并关闭连接。 */
  timeout?: number
}

/** 鉴权策略回调 */
export interface AuthStrategyHandlers {
  /** 鉴权通过：传输层在此启动心跳 / flush initSend / 回调 onOpen */
  onReady?: () => void
  /** connected 鉴权通过后回传连接身份（晚于传输层 onOpen） */
  onConnected?: (info: WebSocketConnectedInfo) => void
  /** 鉴权失败（denied 或超时） */
  onAuthDenied?: (reason: string, raw: unknown) => void
  /** subscribed 订阅回执（含 denied） */
  onSubscribeResult?: (result: WebSocketSubscribeResult) => void
}

/**
 * 鉴权策略契约。传输层在连接打开时调用 handshake，
 * 每收到一帧先交给 handleFrame 尝试消费（返回 true 表示控制帧，不透传业务）。
 */
export interface AuthStrategy {
  /** 鉴权是否通过：决定 send 是否放行、initSend 何时 flush */
  readonly ready: boolean
  /** 连接打开时触发：发送 CONNECT 首帧并启动鉴权超时 */
  handshake(): void
  /** 尝试消费控制帧；命中返回 true，传输层不再向上派发 */
  handleFrame(parsed: unknown): boolean
  /** 连接关闭 / 断开时清理内部状态 */
  reset(): void
}

/**
 * 无鉴权策略（兼容旧的「打开即用」行为）。
 * ready 恒为 true，handleFrame 恒为 false：不消费任何帧。
 */
export class OpenAuthStrategy implements AuthStrategy {
  readonly ready = true

  handshake() {}

  handleFrame(): boolean {
    return false
  }

  reset() {}
}

/**
 * 消息服务 V2 鉴权策略：CONNECT 首帧 → 等 connected → 就绪。
 */
export class V2AuthStrategy implements AuthStrategy {
  private authed = false
  private timer?: ReturnType<typeof setTimeout> | null
  private readonly auth: WebSocketConnectAuth
  private readonly handlers: AuthStrategyHandlers
  /** 直连 socket：CONNECT 首帧必须绕过传输层的「鉴权前禁发」闸门 */
  private readonly rawSend: (frame: object) => void
  private readonly close: () => void

  constructor(
    auth: WebSocketConnectAuth,
    handlers: AuthStrategyHandlers,
    rawSend: (frame: object) => void,
    close: () => void,
  ) {
    this.auth = auth
    this.handlers = handlers
    this.rawSend = rawSend
    this.close = close
  }

  get ready() {
    return this.authed
  }

  handshake() {
    this.authed = false
    this.clearTimer()

    const frame = typeof this.auth.payload === 'function' ? this.auth.payload() : this.auth.payload
    if (frame && typeof frame === 'object') this.rawSend(frame)

    this.timer = setTimeout(() => {
      if (this.authed) return
      this.authed = false
      this.handlers.onAuthDenied?.('connect_timeout', null)
      this.close()
    }, this.auth.timeout ?? 5000)
  }

  handleFrame(parsed: unknown): boolean {
    if (!parsed || typeof parsed !== 'object') return false
    const raw = parsed as Record<string, unknown>
    if (raw.action === 'connected') {
      this.handleConnected(raw)
      return true
    }
    if (raw.action === 'subscribed') {
      this.handleSubscribed(raw)
      return true
    }
    return false
  }

  reset() {
    this.authed = false
    this.clearTimer()
  }

  private handleConnected(raw: Record<string, unknown>) {
    this.clearTimer()
    if (raw.result === 'denied') {
      this.authed = false
      this.handlers.onAuthDenied?.(raw.reason != null ? String(raw.reason) : 'denied', raw)
      // 服务端随后会主动关闭连接，由 onclose 走既有重连逻辑
      return
    }
    this.authed = true
    this.handlers.onReady?.()
    this.handlers.onConnected?.({
      userId: typeof raw.userId === 'string' ? raw.userId : undefined,
      sessionState: typeof raw.sessionState === 'string' ? raw.sessionState : undefined,
      clientId: typeof raw.clientId === 'string' ? raw.clientId : undefined,
    })
  }

  private handleSubscribed(raw: Record<string, unknown>) {
    this.handlers.onSubscribeResult?.({
      topic: typeof raw.topic === 'string' ? raw.topic : String(raw.topic ?? ''),
      result: raw.result === 'denied' ? 'denied' : 'ok',
      ...(raw.reason ? { reason: String(raw.reason) } : null),
    })
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
