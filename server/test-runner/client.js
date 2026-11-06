'use strict';
// 独立进程控制端：连 mock-ws 的 /mock-control 通道（等价 __test 控制台的 push/clients 指令），
// 供 cli.js 独立运行（测试进程与 mock 服务可不在同一进程；多机部署时改 url 即可）。
// 回执匹配：单控制连接 + 请求队列，消息按序对应（控制指令低频，不做并发）。
const { WebSocket } = require('ws');

class WsControl {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.queue = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url, { perMessageDeflate: false });
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('close', () => { /* 连接断开后请求 fail */ this.queue.splice(0).forEach(r => r.reject(new Error('mock-control 连接已断开'))); });
      this.ws.on('message', raw => {
        let frame;
        try { frame = JSON.parse(raw.toString()); } catch { return; }
        if (frame.action === 'push' || frame.action === 'clients' || frame.action === 'disconnect') {
          const waiter = this.queue.shift();
          if (waiter) waiter.resolve(frame);
        } else if (frame.error) {
          const waiter = this.queue.shift();
          if (waiter) waiter.reject(new Error(String(frame.error)));
        }
      });
    });
  }

  async send(command, timeoutMs = 3000) {
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.findIndex(w => w.resolve === resolve);
        if (idx >= 0) this.queue.splice(idx, 1);
        reject(new Error(`控制指令超时（${timeoutMs}ms）：${command.action}`));
      }, timeoutMs);
      this.queue.push({ resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    });
    this.ws.send(JSON.stringify(command));
    return promise;
  }

  async listClients() {
    const frame = await this.send({ action: 'clients' });
    return frame.clients || [];
  }

  async push(message, { userId, sessionState, respectSubscriptions = true } = {}) {
    const frame = await this.send({
      action: 'push', message, userId, sessionState,
      respectSubscriptions,
      time: new Date().toISOString(),
    });
    if (frame.error) return { matched: 0, delivered: 0, error: frame.error };
    return { matched: frame.matched ?? 0, delivered: frame.delivered ?? 0 };
  }

  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.close();
  }
}

module.exports = { WsControl };
