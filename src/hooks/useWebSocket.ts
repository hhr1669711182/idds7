/*
 * @Author: hhr
 * @Date: 2026-04-21 18:40:47
 * @LastEditTime: 2026-10-09 10:00:00
 * @LastEditors: hhr
 * @Description: WebSocket 客户端：支持多实例、自动重连、心跳保活，以及消息服务 V2 的 CONNECT 首帧鉴权
 * @FilePath: \ids-gis-web\src\hooks\useWebSocket.ts
 */

/** 消息服务 V2 CONNECT 首帧配置（鉴权） */
export interface WebSocketConnectAuth {
  /**
   * CONNECT 首帧负载，通常为 { action:'connect', token, clientId, tenantId? }。
   * 用函数形式，使自动重连时能读取到最新 token。
   */
  payload: object | (() => object)
  /** 鉴权超时（ms），默认 5000；超时未收到 connected 则判定失败并关闭连接。 */
  timeout?: number
}

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

export interface WebSocketOptions {
  reconnect?: boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeat?: boolean;
  heartbeatInterval?: number;
  heartbeatMessage?: string | object;
  onOpen?: (event: Event) => void;
  onMessage?: (data: any, event: MessageEvent) => void;
  onError?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  initSend?: string | object | Array<string | object>;
  /**
   * 消息服务 V2：配置后连接打开会先发 CONNECT 首帧鉴权，
   * 收到 connected 成功后才进入就绪态（启动心跳 / 发送 initSend / 回调 onOpen）。
   * 不配置则保持“打开即用”的旧行为。
   */
  connectAuth?: WebSocketConnectAuth;
  /** connected 鉴权通过、进入就绪态时触发（晚于 onOpen） */
  onReady?: (info: WebSocketConnectedInfo, event: Event) => void;
  /** connected result=denied 或鉴权超时 */
  onAuthDenied?: (reason: string, raw: any) => void;
  /** subscribed 订阅回执（含 denied） */
  onSubscribeResult?: (result: WebSocketSubscribeResult) => void;
}

/**
 * WebSocket 类
 * 支持多实例、自动重连、心跳保活，以及可选的消息服务 V2 CONNECT 首帧鉴权
 */
export class WebSocketClient {
  public ws: WebSocket | null = null;
  private url: string;
  private options: WebSocketOptions & Required<Pick<WebSocketOptions,
    'reconnect' | 'reconnectAttempts' | 'reconnectInterval' |
    'heartbeat' | 'heartbeatInterval' | 'heartbeatMessage'>>;
  private attempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  /** V2：是否已通过鉴权（未配置 connectAuth 时恒在就绪后置 true） */
  private authed = false;
  private authTimer?: ReturnType<typeof setTimeout>;
  private openEvent?: Event;

  constructor(url: string, options: WebSocketOptions = {}) {
    this.url = url;
    this.options = {
      reconnect: true,
      reconnectAttempts: 5,
      reconnectInterval: 3000,
      heartbeat: false,
      heartbeatInterval: 30000,
      heartbeatMessage: 'ping',
      ...options,
    };
    this.connect();
  }

  public connect = () => {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.authed = false;
    clearTimeout(this.authTimer);

    this.ws = new WebSocket(this.url);

    this.ws.onopen = (e) => {
      this.attempts = 0;
      this.openEvent = e;

      if (this.options.connectAuth) {
        // V2：打开后先发 CONNECT 首帧，等待 connected 才进入就绪态
        this.startConnectAuth();
      } else {
        this.markReady({}, e);
      }
    };

    this.ws.onmessage = (e) => {
      const raw = e.data;

      // 心跳回执：直接吞掉
      if (raw === 'pong') return;

      let parsed: any = raw;
      if (typeof raw === 'string') {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
      }

      // V2 控制帧：connected / subscribed 在内部处理，不透传给业务
      if (parsed && typeof parsed === 'object') {
        const action = parsed.action;
        if (action === 'connected') {
          this.handleConnected(parsed);
          return;
        }
        if (action === 'subscribed') {
          this.handleSubscribed(parsed);
          return;
        }
      }

      // 鉴权完成前丢弃一切业务帧
      if (this.options.connectAuth && !this.authed) return;

      console.log('[ws-handler] 收到消息', raw)
      this.options.onMessage?.(parsed, e);
    };

    this.ws.onerror = (e) => this.options.onError?.(e);

    this.ws.onclose = (e) => {
      this.authed = false;
      clearTimeout(this.authTimer);
      this.stopHeartbeat();
      this.options.onClose?.(e);

      if (this.options.reconnect && this.attempts < this.options.reconnectAttempts) {
        this.attempts++;
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(this.connect, this.options.reconnectInterval);
      }
    };
  };

  /** 进入就绪态：启动心跳、flush 初始订阅，并回调 onOpen / onReady */
  private markReady = (info: WebSocketConnectedInfo, event: Event) => {
    this.authed = true;
    clearTimeout(this.authTimer);
    this.startHeartbeat();

    // 发送连接初始化消息（例如 Topic 订阅）；重连成功后也会再次发送。
    const initialMessages = Array.isArray(this.options.initSend)
      ? this.options.initSend
      : [this.options.initSend];
    initialMessages.forEach((message) => {
      if (
        message
        && (
          typeof message === 'string'
          || Object.keys(message).length > 0
        )
      ) {
        this.send(message);
      }
    });

    this.options.onOpen?.(event);
    this.options.onReady?.(info, event);
  };

  /** V2：发送 CONNECT 首帧并等待 connected */
  private startConnectAuth = () => {
    const auth = this.options.connectAuth;
    if (!auth) return;
    const timeout = auth.timeout ?? 5000;

    const frame = typeof auth.payload === 'function' ? auth.payload() : auth.payload;
    // CONNECT 首帧需绕过“鉴权后才允许 send”的闸门，直接发送
    if (this.ws?.readyState === WebSocket.OPEN && frame && typeof frame === 'object') {
      this.ws.send(JSON.stringify(frame));
    }

    clearTimeout(this.authTimer);
    this.authTimer = setTimeout(() => {
      if (this.authed) return;
      this.options.onAuthDenied?.('connect_timeout', null);
      try { this.ws?.close(); } catch { /* 忽略关闭异常 */ }
    }, timeout);
  };

  private handleConnected = (raw: any) => {
    clearTimeout(this.authTimer);
    if (raw?.result === 'denied') {
      this.authed = false;
      this.options.onAuthDenied?.(raw.reason ?? 'denied', raw);
      // 服务端随后会主动关闭连接，由 onclose 走既有重连逻辑
      return;
    }
    this.markReady(
      {
        userId: typeof raw.userId === 'string' ? raw.userId : undefined,
        sessionState: typeof raw.sessionState === 'string' ? raw.sessionState : undefined,
        clientId: typeof raw.clientId === 'string' ? raw.clientId : undefined,
      },
      this.openEvent ?? new Event('open'),
    );
  };

  private handleSubscribed = (raw: any) => {
    const result: WebSocketSubscribeResult['result'] = raw?.result === 'denied' ? 'denied' : 'ok';
    this.options.onSubscribeResult?.({
      topic: typeof raw?.topic === 'string' ? raw.topic : String(raw?.topic ?? ''),
      result,
      ...(raw?.reason ? { reason: String(raw.reason) } : null),
    });
  };

  public send = (data: string | object | ArrayBuffer | Blob) => {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    // V2：未通过鉴权前，除 CONNECT 首帧（内部直发）外，不允许发送业务数据
    if (this.options.connectAuth && !this.authed) return false;
    this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    return true;
  };

  public sendEvent = <T = any>(eventKey: string, data?: T, extra?: Record<string, any>) => {
    return this.send({ eventKey, data, ...extra })
  }

  /** V2：订阅层级 topic（相对 clientId，可含 + / # 通配） */
  public subscribe = (topic: string) => {
    return this.send({ action: 'subscribe', topic });
  };

  /** V2：退订 topic */
  public unsubscribe = (topic: string) => {
    return this.send({ action: 'unsubscribe', topic });
  };

  public disconnect = () => {
    this.options.reconnect = false;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.authTimer);
    this.authed = false;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
    }
    this.ws = null;
  };

  private startHeartbeat = () => {
    if (!this.options.heartbeat) return;
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this.send(this.options.heartbeatMessage), this.options.heartbeatInterval);
  };

  private stopHeartbeat = () => clearInterval(this.heartbeatTimer);
}
