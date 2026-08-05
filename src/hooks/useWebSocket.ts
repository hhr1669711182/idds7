/*
 * @Author: hhr
 * @Date: 2026-04-21 18:40:47
 * @LastEditTime: 2026-06-17 19:06:15
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
  initSend?: object;
}

/**
 * WebSocket 类
 * 支持多实例、自动重连、心跳保活
 */
export class WebSocketClient {
  public ws: WebSocket | null = null;
  private url: string;
  private options: Required<Omit<WebSocketOptions, 'onOpen' | 'onMessage' | 'onError' | 'onClose'>> & WebSocketOptions;
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
      initSend: {
        login: 'ids-dev',
        passcode: 'Q7mN4pL2xR8k',
        host: 'ids'
      },
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
      
      // 发送首次连接认证数据
      if (this.options.initSend && Object.keys(this.options.initSend).length > 0) {
        this.send(this.options.initSend);
      }
      
      this.options.onOpen?.(e);
    };

    this.ws.onmessage = (e) => {
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
    return this.send({ eventKey, data, ...(extra ?? null) })
  }

  public disconnect = () => {
    clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  };

  private startHeartbeat = () => {
    if (!this.options.heartbeat) return;
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this.send(this.options.heartbeatMessage), this.options.heartbeatInterval);
  };

  private stopHeartbeat = () => clearInterval(this.heartbeatTimer);
}

