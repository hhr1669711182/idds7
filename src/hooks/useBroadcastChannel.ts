/*
 * @Author: hhr
 * @Date: 2026-10-10
 * @Description: 跨标签页广播通道客户端，结构参照 useWebSocket 的 WebSocketClient
 * @FilePath: \ids-gis-web\src\hooks\useBroadcastChannel.ts
 */
export interface BroadcastChannelOptions {
  onOpen?: (channel: BroadcastChannel) => void;
  onMessage?: (data: any, event: MessageEvent) => void;
  onError?: (event: Event) => void;
  onClose?: () => void;
}

/**
 * BroadcastChannel 类
 * 与 WebSocketClient 同构：构造即连接，对外暴露 send / sendEvent / disconnect。
 * 区别在于无需重连与心跳（标签页存活期间通道常驻），
 * 且浏览器不会把消息回发给发送方自身。
 */
export class BroadcastChannelClient {
  public channel: BroadcastChannel | null = null;
  public readonly supported: boolean;
  private name: string;
  private options: BroadcastChannelOptions;

  constructor(name: string, options: BroadcastChannelOptions = {}) {
    this.name = name;
    this.options = { ...options };
    this.supported = typeof BroadcastChannel !== 'undefined';
    this.connect();
  }

  public connect = () => {
    if (this.channel) return;
    if (!this.supported) {
      this.options.onError?.(new Event('error'));
      this.options.onClose?.();
      return;
    }

    this.channel = new BroadcastChannel(this.name);

    this.channel.onmessage = (e) => {
      const raw = e.data;
      if (raw === undefined || raw === null) return;
      try {
        this.options.onMessage?.(JSON.parse(raw as string), e);
      } catch {
        this.options.onMessage?.(raw, e);
      }
    };

    this.channel.onmessageerror = (e) => this.options.onError?.(e);

    this.options.onOpen?.(this.channel);
  };

  public send = (data: string | object | ArrayBuffer | Blob | ArrayBufferView) => {
    if (!this.channel) return false;
    this.channel.postMessage(data);
    return true;
  };

  public sendEvent = <T = any>(eventKey: string, data?: T, extra?: Record<string, any>) => {
    return this.send({ eventKey, data, ...extra });
  };

  public disconnect = () => {
    if (this.channel) {
      this.channel.onmessage = null;
      this.channel.onmessageerror = null;
      this.channel.close();
    }
    this.channel = null;
    this.options.onClose?.();
  };
}
