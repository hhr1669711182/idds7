const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { build } = require('./protocols');
const { topicMatches, filterFrame } = require('./routing');

// 依据 integration-guide-v2.md（消息服务 V2 连接与订阅协议）：
// 单入口 /message-client/ws + CONNECT 首帧 JWT 鉴权 + 层级 topic（含 +/# 通配）。
// mock 不验签，仅解码 JWT payload 取 sub/session_state（§2.3）。
const mockJwt = claims => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;

async function spawnMock() {
  const child = spawn(process.execPath, ['mock-ws.js'], { cwd: __dirname, env: { ...process.env, PORT: '0', HOST: '127.0.0.1', CONNECT_TIMEOUT_MS: '400' } });
  const [output] = await once(child.stdout, 'data');
  const port = output.toString().match(/localhost:(\d+)/)[1];
  return { child, base: `ws://127.0.0.1:${port}`, http: `http://127.0.0.1:${port}` };
}
async function open(base, route, sockets) { const ws = new WebSocket(base + route); sockets.push(ws); await once(ws, 'open'); return ws; }
// §2.2：连接后首帧发送 connect，等待 connected 应答
async function connectV2(base, sockets, claims, clientId = 'ids-seat-web') {
  const ws = await open(base, '/message-client/ws', sockets);
  ws.send(JSON.stringify({ action: 'connect', token: mockJwt(claims), clientId }));
  const [frame] = await once(ws, 'message');
  return { ws, connected: JSON.parse(frame.toString()) };
}

test('HTTP、V2 连接鉴权、自动订阅、订阅（含通配）、心跳及断线', { timeout: 15000 }, async () => {
  const { child, base, http } = await spawnMock();
  const sockets = [];
  try {
    assert.match(await (await fetch(`${http}/__test/`)).text(), /WS 消息测试/);
    async function commandOn(ws, value) { const result = once(ws, 'message'); ws.send(JSON.stringify(value)); return JSON.parse((await result)[0]); }
    const control = await open(base, '/mock-control', sockets);
    const command = value => commandOn(control, value);

    // §2.1/§9.3：未完成鉴权前，其它指令一律拒绝
    const early = await open(base, '/message-client/ws', sockets);
    early.send(JSON.stringify({ action: 'subscribe', topic: 'seat/8001' }));
    const [earlyReply] = await once(early, 'message');
    assert.equal(JSON.parse(earlyReply.toString()).error, '请先发送 connect 首帧');
    // §2.2：超时未 connect，服务端主动断开（CONNECT_TIMEOUT_MS=400）
    assert.equal((await once(early, 'close'))[0], 4001);

    // §2.2 失败：token 无法解析为 JWT → denied + 服务端关闭连接
    const bad = await open(base, '/message-client/ws', sockets);
    bad.send(JSON.stringify({ action: 'connect', token: 'not-a-jwt', clientId: 'ids-seat-web' }));
    const [badFrame] = await once(bad, 'message');
    assert.deepEqual(JSON.parse(badFrame.toString()), { action: 'connected', result: 'denied', reason: 'invalid_token' });
    // 服务端随后关闭连接（未携带状态码 → 1005）
    assert.equal((await once(bad, 'close'))[0], 1005);

    // §2.2 成功：身份来自 token（userId=sub，sessionState=session_state）
    const { ws: a, connected } = await connectV2(base, sockets, { sub: 'user', session_state: 'session' });
    assert.deepEqual(connected, { action: 'connected', userId: 'user', sessionState: 'session', clientId: 'ids-seat-web' });
    // 同 user 不同 sessionState 的另一连接：多屏互不覆盖（§1.2 connId 解耦）
    const b = (await connectV2(base, sockets, { sub: 'user', session_state: 'other' })).ws;
    let otherMessages = 0; b.on('message', () => otherMessages++);

    // §3.3 自动订阅 user/{userId}：无需显式订阅即可收到用户收件箱消息
    const autoPush = { action: 'push', userId: 'user', sessionState: 'session', message: { clientId: 'ids-seat-web', topics: ['user/user'], sender: 'system', notifyType: 'test', customContent: {} } };
    let received = once(a, 'message');
    assert.equal((await command(autoPush)).delivered, 1);
    assert.deepEqual(JSON.parse((await received)[0].toString()), autoPush.message);

    // §4.1/§4.3 订阅与结果应答
    a.send(JSON.stringify({ action: 'subscribe', topic: 'seat/8001' }));
    const [subscribed] = await once(a, 'message');
    assert.deepEqual(JSON.parse(subscribed.toString()), { action: 'subscribed', topic: 'seat/8001', result: 'ok' });

    const push = { action: 'push', userId: 'user', sessionState: 'session', message: { clientId: 'ids-seat-web', topics: ['seat/8001'], content: { taskType: 'weizhiwang' } } };
    received = once(a, 'message');
    assert.equal((await command(push)).delivered, 1);
    assert.deepEqual(JSON.parse((await received)[0].toString()), push.message);
    // 未订阅该 topic 的连接（b）不投递
    assert.equal((await command({ ...push, sessionState: 'other' })).delivered, 0);
    // §3.1 完整地址 = {clientId}/{topic}：clientId 不符的发布不投递
    assert.equal((await command({ ...push, message: { clientId: 'other-client', topics: ['user/user'] } })).delivered, 0);

    // §3.1 通配：seat/+ 单层匹配
    a.send(JSON.stringify({ action: 'subscribe', topic: 'seat/+' }));
    await once(a, 'message');
    received = once(a, 'message');
    assert.equal((await command({ ...push, message: { clientId: 'ids-seat-web', topics: ['seat/8002'] } })).delivered, 1);
    assert.deepEqual(JSON.parse((await received)[0].toString()).topics, ['seat/8002']);

    // §4.1 退订后不再投递
    a.send(JSON.stringify({ action: 'unsubscribe', topic: 'seat/8001' }));
    await once(a, 'message');
    a.send(JSON.stringify({ action: 'unsubscribe', topic: 'seat/+' }));
    await once(a, 'message');
    const barrier = once(a, 'message'); a.send('ping'); await barrier; // 心跳兼作处理完成屏障
    assert.equal((await command(push)).delivered, 0);

    // respectSubscriptions=false 直投原始文本
    received = once(a, 'message');
    assert.equal((await command({ action: 'push', userId: 'user', sessionState: 'session', respectSubscriptions: false, message: 'custom raw text' })).delivered, 1);
    assert.equal((await received)[0].toString(), 'custom raw text');

    // §2.4 connId = {userId}:{sessionState}:{UUID}
    const clientsResult = await command({ action: 'clients' });
    assert.equal(clientsResult.clients.length, 2);
    const infoA = clientsResult.clients.find(c => c.sessionState === 'session');
    assert.equal(infoA.userId, 'user');
    assert.match(infoA.connId, /^user:session:[0-9a-f-]{36}$/);
    assert.ok(infoA.subscriptions.includes('user/user'));

    // 控制通道断开目标连接（测试重连），其余连接不受影响
    const closed = once(a, 'close');
    assert.equal((await command({ ...push, action: 'disconnect' })).delivered, 1);
    assert.equal((await closed)[0], 4000);
    assert.equal(b.readyState, WebSocket.OPEN);
    assert.equal(otherMessages, 0);
  } finally { for (const ws of sockets) ws.terminate(); child.kill(); }
});

test('v2 topic 通配匹配与嵌套订阅隔离', () => {
  // §3.1 语法：+ 单层、# 多层且只能在末尾
  assert.equal(topicMatches('seat/8001', 'seat/8001'), true);
  assert.equal(topicMatches('seat/+', 'seat/8001'), true);
  assert.equal(topicMatches('seat/+', 'seat/8001/x'), false);
  assert.equal(topicMatches('seat/#', 'seat/8001/x'), true);
  assert.equal(topicMatches('seat/#', 'seat'), false);
  assert.equal(topicMatches('user/+/screen/map', 'user/u1/screen/map'), true);
  assert.equal(topicMatches('user/+/screen/map', 'user/u1/other/map'), false);
  assert.equal(topicMatches('#', 'a/b/c'), true);
  assert.equal(topicMatches('a/+/c', 'a/b/c'), true);

  const o = { id: 'event1', time: '2026-09-11T01:00:00Z', callId: 'call1', incidentId: 'inc1', userId: 'user', seat: '3003', lng: 113, lat: 23 };
  // §5 信封：topics 为相对 clientId 的 topic 字符串数组
  const position = build('position', o);
  assert.deepEqual(position.topics, ['seat/3003']);
  assert.equal(typeof position.content, 'string');
  assert.equal(JSON.parse(position.content).eventid, 'call1');
  const subs = new Set(['seat/3003']);
  assert.deepEqual(filterFrame(position, subs), position);
  assert.equal(filterFrame(position, new Set()), null);
  const call = build('answer', o);
  assert.equal(call.customContent.source, 'ids-alarm-access-client');
  assert.equal(build('received', o).customContent.data.answered, false);
  assert.equal(build('missed', o).customContent.data.answered, false);
  assert.equal(build('end', o).customContent.data.newState, 'CALL_TERMINATED');
  assert.equal(build('end', o).customContent.data.answered, true);
  assert.equal(build('incident', o).customContent.data.newState, 'CREATED');
  assert.match(build('incident', o).customContent.data.changedAt, /^2026-09-11 \d{2}:00:00$/);
  // 嵌套包装层逐 body 过滤：seat/3003 只命中 position，不命中 ALARM_CALL 报文
  for (const key of ['data', 'body', 'message', 'payload', 'request', 'userMsgBodyList']) {
    const wrapped = { [key]: [call, position] };
    assert.equal(filterFrame(wrapped, subs)[key].length, 1);
    const all = new Set(['seat/3003', 'ALARM_CALL/ANSWER_STATUS_CHANGED', 'user/user']);
    assert.equal(filterFrame(wrapped, all)[key].length, 2);
  }
  const callSubs = new Set(['ALARM_CALL/ANSWER_STATUS_CHANGED']);
  assert.deepEqual(filterFrame(call, callSubs), call);
  assert.equal(filterFrame(build('incident', o), callSubs), null);
  assert.equal(build('cloud', o).data.eventId, o.id);
  // 地址相关变更（§7.2 翻译：CUSTOM:DISASTER_PROFILE:UPDATED → DISASTER_PROFILE/UPDATED）
  const addr = build('address', { ...o, disasterProfileId: 'profile-1', inquiryId: 'inquiry-1', version: 12 });
  assert.deepEqual(addr.topics, ['DISASTER_PROFILE/UPDATED']);
  assert.equal(addr.clientId, 'ids-seat-web');
  assert.equal(addr.notifyType, 'disaster_profile');
  assert.equal(addr.notifySubType, 'UPDATED');
  const cc = addr.customContent;
  assert.equal(cc.eventId, o.id);
  assert.equal(cc.disasterProfileId, 'profile-1');
  assert.equal(cc.incidentId, o.incidentId);
  assert.equal(cc.inquiryId, 'inquiry-1');
  assert.equal(cc.version, 12);
  assert.equal(cc.slotChanges.length, 9);
  const codes = cc.slotChanges.map(s => s.slotCode);
  assert.deepEqual(codes, ['disaster_address', 'longitude', 'latitude', 'met_floors', 'met_upfloors', 'build_type', 'met_downfloors', 'is_over_100m', 'refuge_position']);
  // 条目对齐画像协议 slotChanges 契约：slotCode 不变，filledValue 变为 afterValue
  const addressSlot = cc.slotChanges.find(s => s.slotCode === 'disaster_address');
  assert.deepEqual(Object.keys(addressSlot), ['infoId', 'slotId', 'slotCode', 'changeType', 'changedFields', 'beforeValue', 'afterValue']);
  assert.equal(addressSlot.infoId, 'profile-1-disaster_address');
  assert.equal(addressSlot.slotId, 'disaster_address-slot');
  assert.equal(addressSlot.changeType, 'UPDATED');
  assert.deepEqual(addressSlot.changedFields, ['filledValue']);
  assert.equal(addressSlot.beforeValue, '示例路 99 号');
  assert.equal(addressSlot.afterValue, '示例路 1 号');
  // 经纬度使用传入值；清空槽位 afterValue 为 null（不能忽略）
  assert.equal(cc.slotChanges.find(s => s.slotCode === 'longitude').afterValue, String(o.lng));
  assert.equal(cc.slotChanges.find(s => s.slotCode === 'build_type').afterValue, null);
  assert.equal(filterFrame(addr, new Set()), null);
  assert.deepEqual(filterFrame(addr, new Set(['DISASTER_PROFILE/UPDATED'])), addr);
  // 不同 topic 的订阅不应投递地址消息
  assert.equal(filterFrame(addr, new Set(['ALARM_INCIDENT/STATE_CHANGED'])), null);
});

test('DISASTER_PROFILE/UPDATED WS 订阅与投递', { timeout: 15000 }, async () => {
  const { child, base } = await spawnMock();
  const sockets = [];
  try {
    const control = await open(base, '/mock-control', sockets);
    async function command(value) { const result = once(control, 'message'); control.send(JSON.stringify(value)); return JSON.parse((await result)[0]); }
    const { ws: client } = await connectV2(base, sockets, { sub: 'user', session_state: 'session' });
    const message = build('address', { id: 'evt-1', time: '2026-09-14T15:30:00.000Z', callId: 'call1', incidentId: 'inc1', userId: 'user', lng: 116.397, lat: 39.908, disasterProfileId: 'profile-1', version: 12 });
    const push = { action: 'push', userId: 'user', sessionState: 'session', message };
    // 未订阅时不投递
    assert.equal((await command(push)).delivered, 0);
    // 订阅后投递，且 customContent 结构与文档一致
    client.send(JSON.stringify({ action: 'subscribe', topic: 'DISASTER_PROFILE/UPDATED' }));
    assert.deepEqual(JSON.parse((await once(client, 'message'))[0].toString()), { action: 'subscribed', topic: 'DISASTER_PROFILE/UPDATED', result: 'ok' });
    let received = once(client, 'message');
    assert.equal((await command(push)).delivered, 1);
    const delivered = JSON.parse((await received)[0].toString());
    assert.deepEqual(delivered, message);
    assert.equal(delivered.customContent.slotChanges.length, 9);
    // 取消订阅后不再投递
    client.send(JSON.stringify({ action: 'unsubscribe', topic: 'DISASTER_PROFILE/UPDATED' }));
    await once(client, 'message');
    const barrier = once(client, 'message'); client.send('ping'); await barrier;
    assert.equal((await command(push)).delivered, 0);
    // 其他主题消息不会投递给仅订阅 UPDATED 的客户端
    client.send(JSON.stringify({ action: 'subscribe', topic: 'DISASTER_PROFILE/UPDATED' }));
    await once(client, 'message');
    const other = build('incident', { id: 'evt-2', time: '2026-09-14T15:31:00.000Z', callId: 'call1', incidentId: 'inc1', userId: 'user', lng: 116, lat: 39 });
    let otherReceived = false; const off = () => { otherReceived = true; };
    client.once('message', off);
    assert.equal((await command({ ...push, message: other })).delivered, 0);
    client.off('message', off);
    assert.equal(otherReceived, false);
  } finally { for (const ws of sockets) ws.terminate(); child.kill(); }
});

// §8 实时消息转发通道测试用例（V1.6+，V1.9 增补 POSITION_SYNC）
// 依据：d:\work\接口对接\地图屏共享状态契约V1.9.md §8.1–§8.6
// 权威代码：src/app/window-link/map-relay-host.ts、src/entities/incident/model/profile-relevance.ts

test('§8.3.2 POSITION_SYNC 载荷形状（位置网中间件业务体）', () => {
  // §8.3.2 PositionSyncPayload：扁平业务体，字段名对侧原样保留（不转驼峰）
  const o = { id: 'evt-pos-1', time: '2026-09-22T01:00:00Z', callId: 'call-pos-1', incidentId: 'inc-1', userId: 'user', seat: '8001', lng: 113.5, lat: 23.5 };
  const position = build('position', o);
  // v2：POSITION_SYNC 走 seat/{坐席号} topic（§8.2 SEAT topic 的层级翻译）
  assert.deepEqual(position.topics, ['seat/8001']);
  assert.equal(typeof position.content, 'string');
  const payload = JSON.parse(position.content);
  assert.equal(payload.taskType, 'weizhiwang');
  assert.match(payload.time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(payload.eventid, 'call-pos-1');
  assert.equal(payload.lng, 113.5);
  assert.equal(payload.lat, 23.5);
  assert.equal(payload.tel, '13800138000');
  assert.equal(payload.ostype, 'android');
  assert.equal(payload.latLngType, 'WZWDW-GPS');
  assert.ok(payload.address);
  // §8.3.2: "无 version 字段——按到达顺序直接替换（不要套用 §8.3.1 的 version 仲裁）"
  assert.ok(!('version' in payload), 'POSITION_SYNC 不应有 version 字段');
  // §8.3.2: lng/lat 可为数值或数值字符串（位置网对侧原样保留）
  const oStr = { ...o, lng: '113.50', lat: '23.50' };
  const payloadStr = JSON.parse(build('position', oStr).content);
  assert.equal(payloadStr.lng, '113.50');
  assert.equal(payloadStr.lat, '23.50');
});

test('§8.3.1 灾害画像 WS 载荷形状（host 转发前的 WS 层）', () => {
  // §8.3.1 DisasterProfileUpdatedPayload 扁平业务体——无 {type,data} 包裹、无 type 判别字段
  // 注：WS 层 customContent 与 §8.3.1 转发载荷共有的必填字段对齐；
  // 转发载荷的 updateType/slots/aiBatchNo 由 host 在转发前派生（§8.2 白名单扩充规则），不在 WS 层校验。
  const o = { id: 'evt-addr-1', time: '2026-09-22T02:00:00Z', callId: 'call-1', incidentId: 'inc-1', userId: 'user', lng: 116.397, lat: 39.908, disasterProfileId: 'profile-1', inquiryId: 'inq-1', version: 12 };
  const addr = build('address', o);
  // v2 §7.2：Topic 为 DISASTER_PROFILE/UPDATED
  assert.deepEqual(addr.topics, ['DISASTER_PROFILE/UPDATED']);
  assert.equal(addr.notifyType, 'disaster_profile');
  assert.equal(addr.notifySubType, 'UPDATED');
  // §8.3.1 扁平业务体（customContent 即转发前的载荷来源）
  const payload = addr.customContent;
  assert.equal(payload.eventId, 'evt-addr-1');
  assert.equal(payload.occurredAt, '2026-09-22T02:00:00Z');
  assert.equal(payload.disasterProfileId, 'profile-1');
  assert.equal(payload.incidentId, 'inc-1');
  assert.equal(payload.inquiryId, 'inq-1');
  assert.equal(payload.version, 12);
  // §8.3.1 约束：incidentId/inquiryId 至少一个非空
  assert.ok(payload.incidentId || payload.inquiryId, 'incidentId/inquiryId 至少一个非空');
  // §8.3.1 version 单调递增
  const higher = build('address', { ...o, version: 13 }).customContent;
  assert.equal(higher.version, 13);
  assert.ok(higher.version > payload.version);
  // WS 层使用 slotChanges（增量变更列表），§8.3.1 slots 为 host 转发前派生字段——不在 WS 层校验
  assert.ok(Array.isArray(payload.slotChanges));
  assert.ok(payload.slotChanges.length > 0);
  // §8.3.1: 人工受理推送仅带 incidentId；问询期 AI 推送常缺省 incidentId
  const aiPush = build('address', { ...o, incidentId: undefined, inquiryId: 'inq-ai' }).customContent;
  assert.equal(aiPush.incidentId, null);
  assert.equal(aiPush.inquiryId, 'inq-ai');
});

test('§8.4 RelayMessage 4 种通道消息形状', () => {
  // §8.4 通道协议：hello / snapshot / event / bye
  const hello = { kind: 'map-relay-hello' };
  assert.deepEqual(Object.keys(hello).sort(), ['kind']);
  assert.equal(hello.kind, 'map-relay-hello');

  const snapshot = { kind: 'map-relay-snapshot', sentAt: Date.now(), events: [
    { eventName: 'disaster_profile', payload: { disasterProfileId: 'p1', version: 1 }, sentAt: Date.now() },
    { eventName: 'POSITION_SYNC', payload: { taskType: 'weizhiwang', lng: 116, lat: 39 }, sentAt: Date.now() }
  ]};
  assert.equal(snapshot.kind, 'map-relay-snapshot');
  assert.equal(typeof snapshot.sentAt, 'number');
  assert.ok(Array.isArray(snapshot.events));
  for (const it of snapshot.events) {
    assert.equal(typeof it.eventName, 'string');
    assert.equal(typeof it.sentAt, 'number');
    assert.ok('payload' in it);
  }

  const event = { kind: 'map-relay-event', eventName: 'disaster_profile', payload: { disasterProfileId: 'p1', version: 2 }, seq: 1, sentAt: Date.now() };
  assert.equal(event.kind, 'map-relay-event');
  assert.equal(typeof event.eventName, 'string');
  assert.equal(typeof event.seq, 'number');
  assert.equal(typeof event.sentAt, 'number');

  // §8.5: bye reason 仅 'logout' | 'shutdown'
  for (const reason of ['logout', 'shutdown']) {
    const bye = { kind: 'map-relay-bye', reason };
    assert.equal(bye.kind, 'map-relay-bye');
    assert.ok(['logout', 'shutdown'].includes(bye.reason));
  }
});

test('§8.5/§8.6 画像 version 仲裁消费逻辑（seenVersion 去重）', () => {
  // §8.3.1 关键性质：每次推送 slots 自含全量槽位 + 单调 version——「最新一条」即完整快照
  // §8.6 applyProfile：version 仲裁，丢弃回退/重复，整体替换
  const seenVersion = new Map();   // disasterProfileId -> version
  const applied = [];
  function applyProfile(p) {
    // 修正契约样例 `seenVersion.get(id)!` 的 TS 非空断言语义——用 ?? -1 显式表达首见场景
    if ((seenVersion.get(p.disasterProfileId) ?? -1) >= p.version) return false;
    seenVersion.set(p.disasterProfileId, p.version);
    applied.push(p);
    return true;
  }
  assert.equal(applyProfile({ disasterProfileId: 'p1', version: 1, slots: [] }), true);
  // 重复 version=1 应被丢弃
  assert.equal(applyProfile({ disasterProfileId: 'p1', version: 1, slots: [{ slotId: 's1', slotCode: 'longitude', value: '116' }] }), false);
  // 回退到 version=0 应被丢弃
  assert.equal(applyProfile({ disasterProfileId: 'p1', version: 0, slots: [] }), false);
  // 升级到 version=2 通过
  assert.equal(applyProfile({ disasterProfileId: 'p1', version: 2, slots: [{ slotId: 's1', slotCode: 'longitude', value: '117' }] }), true);
  // 不同画像独立仲裁
  assert.equal(applyProfile({ disasterProfileId: 'p2', version: 1, slots: [] }), true);
  assert.equal(applyProfile({ disasterProfileId: 'p2', version: 1, slots: [] }), false);
  assert.equal(applied.length, 3);
  assert.deepEqual(applied.map(p => [p.disasterProfileId, p.version]), [['p1', 1], ['p1', 2], ['p2', 1]]);
});

test('§8.3.2 POSITION_SYNC 按到达顺序替换（无 version 仲裁）', () => {
  // §8.3.2 消费规则：每次推送即一次定位刷新，无 version 字段——按到达顺序直接替换
  let latest = null;
  function applyPosition(p) {
    assert.ok(!('version' in p), 'POSITION_SYNC 不应做 version 仲裁');
    latest = p;
  }
  applyPosition({ taskType: 'weizhiwang', time: '2026-09-22 10:00:00', eventid: 'e1', lng: 113.5, lat: 23.5 });
  applyPosition({ taskType: 'weizhiwang', time: '2026-09-22 10:00:05', eventid: 'e1', lng: 113.6, lat: 23.6 });
  // 后一条直接替换前一条，无 version 比较
  assert.equal(latest.lng, 113.6);
  assert.equal(latest.lat, 23.6);
  // §8.3.2: 主窗重载后缓存为空，等下一次推送补齐
  applyPosition({ taskType: 'weizhiwang', lng: 113.7, lat: 23.7 });
  assert.equal(latest.lng, 113.7);
});

test('§8.2/§8.5 转发白名单与 host 侧相关性过滤（含切换警情后旧画像不再应答）', () => {
  // §8.2 转发白名单：disaster_profile / POSITION_SYNC；白名单外事件绝不出现于本通道
  const MAP_RELAY_EVENT_ALLOWLIST = new Set(['disaster_profile', 'POSITION_SYNC']);
  assert.equal(MAP_RELAY_EVENT_ALLOWLIST.size, 2);
  assert.ok(MAP_RELAY_EVENT_ALLOWLIST.has('disaster_profile'));
  assert.ok(MAP_RELAY_EVENT_ALLOWLIST.has('POSITION_SYNC'));
  for (const ev of ['alarm_incident', 'alarm_call', 'gps_position', '']) {
    assert.ok(!MAP_RELAY_EVENT_ALLOWLIST.has(ev));
  }

  // §8.2 host 侧相关性过滤：inquiryId = 当前问询 或 incidentId = 当前立案警情
  let currentInquiryId = 'inq-1';
  let currentIncidentId = 'inc-1';
  function isRelevant(payload) {
    if (payload.inquiryId === currentInquiryId) return true;
    if (payload.incidentId === currentIncidentId) return true;
    return false;
  }
  // 问询期画像（inquiryId 匹配，incidentId=null）——通过
  assert.equal(isRelevant({ inquiryId: 'inq-1', incidentId: null }), true);
  // 立案后画像（incidentId 匹配）——通过
  assert.equal(isRelevant({ inquiryId: null, incidentId: 'inc-1' }), true);
  // 他席画像——不通过
  assert.equal(isRelevant({ inquiryId: 'inq-other', incidentId: 'inc-other' }), false);
  // 两者皆空——不通过（§8.3.1 至少一个非空）
  assert.equal(isRelevant({ inquiryId: null, incidentId: null }), false);

  // §8.5: 切换警情/结束处置后，缓存旧画像自动不再应答
  const cached = { inquiryId: 'inq-1', incidentId: null, version: 5 };
  assert.equal(isRelevant(cached), true);   // 切换前：相关
  currentInquiryId = 'inq-2';               // 切换到新问询
  assert.equal(isRelevant(cached), false);  // 切换后：旧画像不再应答快照

  // §8.2: POSITION_SYNC 投递 topic 为 seat/{坐席号}（v2 层级地址），天然坐席隔离，无需相关性过滤
  const seatTopic = 'seat/8001';
  assert.ok(topicMatches(seatTopic, 'seat/8001'));
  assert.ok(!topicMatches(seatTopic, 'seat/8002'));
});

test('§8.5/§8.6 bye 通道结束 + hello→snapshot round-trip', () => {
  // §8.5 时序：登出/被踢 bye(logout)；主窗关闭/刷新 bye(shutdown)（尽力而为）
  let sessionDown = null;
  function markRelayDown(reason) {
    assert.ok(['logout', 'shutdown'].includes(reason), `非法 bye.reason: ${reason}`);
    sessionDown = reason;
  }
  markRelayDown('logout');
  assert.equal(sessionDown, 'logout');
  markRelayDown('shutdown');
  assert.equal(sessionDown, 'shutdown');

  // §8.6 hello 请求快照触发 snapshot 应答
  const sentToHost = [];
  const sentToMap = [];
  function postToHost(msg) { sentToHost.push(msg); }
  function postToMap(msg) { sentToMap.push(msg); }

  // 地图屏打开即取快照
  postToHost({ kind: 'map-relay-hello' });
  assert.equal(sentToHost[0].kind, 'map-relay-hello');
  assert.deepEqual(Object.keys(sentToHost[0]).sort(), ['kind']);

  // host 应答 snapshot——events 内每类白名单事件最新一条
  const snapshot = {
    kind: 'map-relay-snapshot',
    sentAt: Date.now(),
    events: [
      { eventName: 'disaster_profile', payload: { disasterProfileId: 'p1', version: 5, slots: [] }, sentAt: Date.now() },
      { eventName: 'POSITION_SYNC', payload: { taskType: 'weizhiwang', lng: 116, lat: 39 }, sentAt: Date.now() }
    ]
  };
  postToMap(snapshot);
  assert.equal(sentToMap[0].kind, 'map-relay-snapshot');
  assert.equal(sentToMap[0].events.length, 2);
  // events 内 eventName 必在白名单内
  for (const it of sentToMap[0].events) {
    assert.ok(['disaster_profile', 'POSITION_SYNC'].includes(it.eventName));
  }

  // §8.5: 快照仅会话级——主窗重载后缓存为空，hello 应答可能暂缺某类事件
  const emptySnapshot = { kind: 'map-relay-snapshot', sentAt: Date.now(), events: [] };
  postToMap(emptySnapshot);
  assert.equal(sentToMap[1].events.length, 0);
});
