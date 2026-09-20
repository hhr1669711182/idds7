/*
 * @Author: hhr
 * @Date: 2026-04-21 18:40:47
 * @LastEditTime: 2026-08-20 14:16:55
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\hooks\useWebSocket.ts
 */
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
}

/**
 * WebSocket 类
 * 支持多实例、自动重连、心跳保活
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

    this.ws = new WebSocket(this.url);

    this.ws.onopen = (e) => {
      this.attempts = 0;
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
      
      this.options.onOpen?.(e);
    };

    this.ws.onmessage = (e) => {
      console.log('[ws-handler] 收到消息', e.data)
      try {
        this.options.onMessage?.(JSON.parse(e.data), e);
      } catch {
        this.options.onMessage?.(e.data, e);
      }
    };

    this.ws.onerror = (e) => this.options.onError?.(e);

    this.ws.onclose = (e) => {
      this.stopHeartbeat();
      this.options.onClose?.(e);

      if (this.options.reconnect && this.attempts < this.options.reconnectAttempts) {
        this.attempts++;
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(this.connect, this.options.reconnectInterval);
      }
    };
  };

  public send = (data: string | object | ArrayBuffer | Blob) => {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    return true;
  };

  public sendEvent = <T = any>(eventKey: string, data?: T, extra?: Record<string, any>) => {
    return this.send({ eventKey, data, ...extra })
  }

  public disconnect = () => {
    this.options.reconnect = false;
    clearTimeout(this.reconnectTimer);
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

