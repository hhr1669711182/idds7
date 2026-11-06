const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { filterFrame } = require('./routing');
const { proxyHttp, proxyUpgrade } = require('./gis-proxy');
const { mountTestHarness } = require('./test-harness');

// §2.2 默认 5s 内未 connect 即断开；测试可通过环境变量缩短
const CONNECT_TIMEOUT_MS = Number(process.env.CONNECT_TIMEOUT_MS) || 5000;
// §2.3 服务端用 JwtDecoder 验签；mock 不验签，仅解码 payload 取 sub / session_state（缺失时取 sid）
function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
}
// §3.1 topic 语法：段 [A-Za-z0-9_-]{1,64}；+ 单层；# 只能作为最后一段
const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const validTopic = topic => {
  const segments = String(topic).split('/');
  return segments.every((s, i) => s === '+' || (s === '#' ? i === segments.length - 1 : SEGMENT.test(s)));
};

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if(pathname === '/__test') {res.writeHead(302,{Location:'/__test/'});return res.end();}
  const files = new Map([['/__test/','index.html'],['/__test/index.html','index.html'],['/__test/index.js','index.js'],['/__test/protocols.js','protocols.js'],['/car-location-subscribe-demo.html','car-location-subscribe-demo.html'],['/__test/car-location-subscribe-demo.html','car-location-subscribe-demo.html']]);
  const file=files.get(pathname);
  if (!file) {
    if (mountTestHarness(req, res, { clients })) return; // 一键测试台 /test-ui/ 与测试 API /api/test/*
    if(pathname.startsWith('/__test/')){res.writeHead(404);return res.end('Not found');}
    return proxyHttp(req,res);
  }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(path.join(__dirname, file)).pipe(res);
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
const clients = new Map();
const send = (ws, data) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
server.on('upgrade', (req, socket, head) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    // §2.1 单入口 /message-client/ws；/mock-control 为测试控制台专用通道（非 v2 协议）
    const kind = pathname === '/message-client/ws' ? 'message-client' : pathname === '/mock-control' ? 'mock-control' : null;
    if (!kind) { proxyUpgrade(req, socket, head); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, kind));
  } catch { socket.destroy(); }
});
wss.on('connection', (ws, kind) => {
  // 鉴权成功前 identity 为 null：不注册、不订阅、不接收任何消息（§2.1）
  let identity = null;
  const connectTimer = kind === 'message-client' ? setTimeout(() => ws.close(4001, 'connect timeout'), CONNECT_TIMEOUT_MS) : null;
  ws.on('error', error => console.error('WebSocket:', error.message));
  ws.on('close', () => { if (connectTimer) clearTimeout(connectTimer); clients.delete(ws); });
  ws.on('message', raw => {
    const text = raw.toString();
    if (text === 'ping') { ws.send('pong'); return; } // §2.5 心跳不变
    let command;
    try { command = JSON.parse(text); } catch { send(ws, { error: '消息不是合法 JSON' }); return; }
    try {
      if (kind === 'message-client') {
        if (!identity) {
          if (command.action !== 'connect') throw Error('请先发送 connect 首帧');
          clearTimeout(connectTimer);
          const claims = decodeJwtPayload(command.token); // §2.2 CONNECT 首帧
          if (!claims?.sub) { send(ws, { action: 'connected', result: 'denied', reason: 'invalid_token' }); return ws.close(); }
          const userId = String(claims.sub);
          const sessionState = String(claims.session_state || claims.sid || '');
          const clientId = typeof command.clientId === 'string' && command.clientId ? command.clientId : 'ids-seat-web';
          // §2.4 connId = {userId}:{sessionState}:{UUID}，每连接唯一；§3.3 自动订阅用户收件箱
          identity = { userId, sessionState, clientId, connId: `${userId}:${sessionState}:${randomUUID()}`, subscriptions: new Set([`user/${userId}`]) };
          clients.set(ws, identity);
          send(ws, { action: 'connected', userId, sessionState, clientId });
          return;
        }
        if (command.action === 'subscribe' || command.action === 'unsubscribe') { // §4.1
          if (typeof command.topic !== 'string' || !command.topic || !validTopic(command.topic)) throw Error('无效 topic');
          if (command.action === 'subscribe') identity.subscriptions.add(command.topic);
          else identity.subscriptions.delete(command.topic);
          send(ws, { action: 'subscribed', topic: command.topic, result: 'ok' }); // §4.3
          return;
        }
        throw Error('不支持的操作');
      }
      // mock-control（测试控制台专用，不属于 v2 协议）
      if (command.action === 'clients') {
        send(ws, { action: 'clients', clients: [...clients.values()].map(c => ({ ...c, subscriptions: [...c.subscriptions] })) });
        return;
      }
      if (!['push', 'disconnect'].includes(command.action)) throw Error('不支持的操作');
      if (command.action === 'push' && !Object.hasOwn(command, 'message')) throw Error('缺少消息');
      let matched = 0, delivered = 0;
      for (const [client, info] of clients) {
        if (command.userId && info.userId !== command.userId) continue;
        if (command.sessionState && info.sessionState !== command.sessionState) continue;
        if (client.readyState !== WebSocket.OPEN) continue;
        matched++;
        if (command.action === 'disconnect') { client.close(4000, 'Mock reconnect test'); delivered++; continue; }
        // §3.1 完整地址 = {clientId}/{topic}：发布按 clientId 隔离
        const envelope = command.message;
        if (envelope && typeof envelope === 'object' && !Array.isArray(envelope) && envelope.clientId && envelope.clientId !== info.clientId) continue;
        const message = command.respectSubscriptions === false ? envelope : filterFrame(envelope, info.subscriptions);
        if (message === null && command.message !== null) continue;
        client.send(typeof message === 'string' ? message : JSON.stringify(message));
        delivered++;
      }
      send(ws, { action: command.action, matched, delivered, time: new Date().toISOString() });
    } catch (error) { send(ws, { error: error.message }); }
  });
});
server.on('error', error => { console.error(error.message); process.exit(1); });
server.listen(Number(process.env.PORT || 18080), process.env.HOST || '127.0.0.1', () => console.log(`WS 测试控制台：http://localhost:${server.address().port}/__test/`));
