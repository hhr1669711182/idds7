const $ = id => document.getElementById(id);
let socket, timer, carPointIndex = 0, carBaseTime = null, carRouteIndex = 0;
let relayChannel = null, relaySeq = 0;
// 地图选点 V1.1：独立选点 BroadcastChannel 实例，不复用 relayChannel。
// 通道名同为 ids-map-screen-relay（与实时转发共用名称），但各自创建实例。
let pickChannel = null, pickSession = null;
const gisOrigin = location.origin;
const base = location.protocol === 'file:' ? 'ws://localhost:18080' : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
function log(value) { $('log').textContent = (`[${new Date().toLocaleTimeString()}] ${typeof value === 'string' ? value : JSON.stringify(value)}\n` + $('log').textContent).slice(0, 24000); }
function stop() { clearInterval(timer); timer = null; $('start').disabled = false; }
function send(command) { if (socket?.readyState !== 1) throw Error('请先连接控制服务'); socket.send(JSON.stringify(command)); }
// v2 §2.2：连接身份来自 CONNECT 首帧的 token。accessToken 留空时自动生成 mock JWT（mock 不验签，
// 仅解码 payload 取 sub/session_state），保证 GIS 连接身份与控制台推送目标一致。
const b64url = obj => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function makeMockJwt(userId, sessionState) { return [b64url({ alg: 'none', typ: 'JWT' }), b64url({ sub: userId, session_state: sessionState }), 'mock-signature'].join('.'); }
function decodeJwtPayload(token) {
    const payload = String(token).split('.')[1];
    if (!payload) return null;
    try {
        const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
        return JSON.parse(atob(base64));
    } catch { return null; }
}
// 粘贴 accessToken 后，GIS 的 WS 连接身份取自 token 的 sub / session_state；
// 推送目标必须与之对齐（mock-ws 按 userId/sessionState 过滤客户端），否则 matched=0。
function tokenIdentity() {
    const token = $('accessToken').value.trim();
    if (!token) return null;
    const claims = decodeJwtPayload(token);
    const userId = typeof claims?.sub === 'string' ? claims.sub.trim() : '';
    const sessionState = typeof claims?.session_state === 'string'
        ? claims.session_state.trim()
        : (typeof claims?.sid === 'string' ? claims.sid.trim() : '');
    if (!userId || !sessionState) return null;
    return { userId, sessionState };
}
function target() {
    // 可解析 token 时优先使用 token 身份，并回填输入框，保证状态写入与推送目标一致
    const identity = tokenIdentity();
    if (identity) {
        $('userId').value = identity.userId;
        $('sessionState').value = identity.sessionState;
        return identity;
    }
    const userId = $('userId').value.trim(), sessionState = $('sessionState').value.trim();
    if (!userId || !sessionState) throw Error('用户和会话不能为空');
    return { userId, sessionState };
}
function updateUrl() { $('url').textContent = `${base}/message-client/ws ｜ v2 单入口（§2.1），连接后首帧发送 {"action":"connect","token":"<accessToken>","clientId":"ids-seat-web"}；accessToken 留空时写入测试状态会自动生成 mock JWT`; }
function generate() {
    const id = `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`, time = new Date().toISOString();
    const kind = $('preset').value;
    let message;
    if (kind === 'car') {
        const routeIndex = carRouteIndex;
        const route = TestProtocols.carPoints[routeIndex % TestProtocols.carPoints.length];
        const interval = Math.max(500, Number($('interval').value) || 2000);
        const idx = carPointIndex % route.length;
        // 循环推送中用固定 carBaseTime；否则以当前时间回推让当前点接近现在
        const baseTime = carBaseTime ?? (Date.now() - idx * interval);
        message = TestProtocols.build('car', { id, time: new Date(baseTime).toISOString(), routeIndex, pointIndex: idx, interval });
    } else {
        const lng = Number($('lng').value), lat = Number($('lat').value);
        if (!$('lng').value || !$('lat').value || !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) throw Error('经纬度无效');
        message = TestProtocols.build(kind, { id, time, callId: $('call').value, incidentId:  $('incident').value.trim() || '55b15364053b40f8ba7f944091b92404', userId: $('userId').value.trim(), seat: $('seat').value.trim(), lng, lat, incidentState: $('incidentState').value, reconciliation: $('reconciliation').checked });
    }
    const wrapper = $('wrapper').value;
    if (wrapper !== 'root') message = { [wrapper]: wrapper === 'userMsgBodyList' ? [message] : message };
    $('message').value = JSON.stringify(message, null, 2); renderProtocol();
}
let knownClients = [];
function renderProtocol() {
    const kind = $('preset').value, spec = TestProtocols.describe(kind, $('seat').value.trim());
    $('protocolNote').textContent = spec.document + '：' + spec.note;
    $('subscriptionPreview').textContent = spec.subscription ? JSON.stringify({ action: 'subscribe', topic: spec.subscription }, null, 2) : '事件总线订阅标识：ids:alarm-access / ids:alarm-access:call-received';
    $('push').disabled = kind === 'cloud'; $('start').disabled = kind === 'cloud' || !!timer;
    const clients = knownClients.filter(c => c.userId === $('userId').value.trim() && c.sessionState === $('sessionState').value.trim());
    const t = spec.subscription;
    const subscribed = clients.filter(c => t && c.subscriptions.includes(t)).length;
    $('subscriptionStatus').textContent = !t ? '此对照没有 WS 订阅。' : clients.length ? '最近刷新：目标连接 ' + clients.length + ' 个，其中 ' + subscribed + ' 个具有上述订阅。' : '最近刷新未找到目标 GIS 连接，请连接 GIS 后刷新。';
}
function push() { if ($('preset').value === 'cloud') throw Error('事件总线对照不作为 WS 消息发送'); const message = JSON.parse($('message').value); send({ action: 'push', ...target(), respectSubscriptions: $('subscriptions').checked, message }); }

function bind(id, fn) { $(id).onclick = () => { try { fn(); } catch (e) { log(e.message); } }; }
bind('openGis', () => {
    const page = window.open(`${gisOrigin}/#/map`, 'ids-gis-test-map');
    if (!page) throw Error('浏览器拦截了新窗口，请允许弹窗');
    page.focus();
});
// §8.3.1 写入测试状态
bind('writeState', () => {
    const identity = target();
    const pastedToken = $('accessToken').value.trim();
    // v2 §2.2：GIS 以该 token 发送 CONNECT 首帧；留空时自动生成 mock JWT 供 mock 解析身份
    const accessToken = pastedToken || makeMockJwt(identity.userId, identity.sessionState);
    if (!/^https?:$/.test(location.protocol)) throw Error('请通过测试服务的 /__test/ 地址打开控制台');
    const phase = $('phase').value, now = Date.now();
    const pendingState = { v: 1, updatedAt: now, auth: { Tenantid: $('tenantid').value.trim(), 'X-Trace-Id': $('xTraceId').value.trim(), accessToken, sessionId: identity.sessionState }, user: { userId: identity.userId, username: 'chenxiangqi', displayName: '陈湘琪', employeeNo: '98c9d15dab274cb5a7782927a8fe3b89', roles: ['16730092-711f-44ed-93f2-ccf18a6ca080', '0132c8d4-b909-47c5-9fa4-7285acc36bd8'] }, seat: { seatNumber: $('seat').value.trim(), terminalId: 'terminal-02' }, phase: phase === 'filed' ? 'inquiry' : phase, currentAlarm: ['filed', 'dispatchTrack'].includes(phase) ? { incidentId: $('incident').value, address: '测试警情地址', stage: 'filed', stageName: '立案', source: 'inquiry_filed', filedAt: now, updatedAt: now } : null };
    localStorage.setItem('seat-shared-state', JSON.stringify(pendingState));
    $('gisStatus').textContent = '测试状态已写入 ' + gisOrigin + ($('accessToken').value.trim() ? '' : '（accessToken 为自动生成的 mock JWT）') + '；GIS 将以 CONNECT 首帧携带该 token 完成鉴权。请使用“打开 GIS 地图”访问同源地图。';
});
// §8.3.2 POSITION_SYNC 走 BroadcastChannel('ids-map-screen-relay') 通道
// §8.4 RelayMessage: map-relay-event { kind, eventName:'POSITION_SYNC', payload: PositionSyncPayload, seq, sentAt }
// §8.3.2 消费规则：无 version，按到达顺序直接替换；topic SEAT:{坐席号} 天然坐席隔离
bind('writePosition', () => {
    if (!/^https?:$/.test(location.protocol)) throw Error('请通过测试服务的 /__test/ 地址打开控制台');
    if (typeof BroadcastChannel === 'undefined') throw Error('当前环境不支持 BroadcastChannel');
    if(localStorage.getItem('seat-shared-state-mock')){
        let data1 = JSON.parse(localStorage.getItem('seat-shared-state-mock')); 
        data1 = `{"v": 1, "updatedAt": String(Date.now())}`;
        localStorage.setItem('seat-shared-state-mock', JSON.stringify(data1));
    }
    const lng = Number($('positionLng').value), lat = Number($('positionLat').value);
    if (!$('positionLng').value || !$('positionLat').value || !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) throw Error('经纬度无效');
    // §8.3.2: time 空则用当前时间 'yyyy-MM-dd HH:mm:ss'
    const pad = n => String(n).padStart(2, '0');
    const d = new Date();
    const defaultTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const payload = {
        taskType: $('ps_taskType').value.trim() || 'weizhiwang',
        time: $('ps_time').value.trim() || defaultTime,
        eventid: $('ps_eventid').value.trim() || $('call').value.trim() || 'TEST-CALL-001',
        lng, lat,
        tel: $('ps_tel').value.trim(),
        ostype: $('ps_ostype').value.trim(),
        latLngType: $('ps_latLngType').value.trim(),
        address: $('ps_address').value.trim(),
    };
    const msg = { kind: 'map-relay-event', eventName: 'POSITION_SYNC', payload, seq: ++relaySeq, sentAt: Date.now() };
    if (!relayChannel) relayChannel = new BroadcastChannel('ids-map-screen-relay');
    relayChannel.postMessage(msg);
    const json = JSON.stringify(msg, null, 2);
    $('positionSync').value = json;
    console.log('[writePosition] BroadcastChannel ids-map-screen-relay →', msg);
    $('gisStatus').textContent = '定位消息已通过 BroadcastChannel 发送（lng=' + lng + ', lat=' + lat + ', seq=' + relaySeq + '）；地图屏按到达顺序直接替换（无 version 仲裁）。';
    log('发送 map-relay-event → POSITION_SYNC：seq=' + relaySeq + ' ' + JSON.stringify(payload));
});
// §8.3.1 disaster_profile 走 BroadcastChannel('ids-map-screen-relay') 通道
// §8.4 RelayMessage: map-relay-event { kind, eventName:'disaster_profile', payload: DisasterProfileUpdatedPayload, seq, sentAt }
// §8.6 读侧（地图屏）通过 new BroadcastChannel('ids-map-screen-relay') 接收，按 version 仲裁后整体替换
// 文本框内容统一为 map-relay-snapshot：{ kind, sentAt, events:[{ eventName, payload, sentAt }] }，
// 槽位变更与画像快照共用同一格式与发送逻辑，仅取 events 中 eventName=disaster_profile 的 payload 整体发送
function sendProfileSnapshot(textareaId, label) {
    if (!/^https?:$/.test(location.protocol)) throw Error('请通过测试服务的 /__test/ 地址打开控制台');
    if (typeof BroadcastChannel === 'undefined') throw Error('当前环境不支持 BroadcastChannel');
    let snapshot;
    try { snapshot = JSON.parse($(textareaId).value); } catch (e) { throw Error(label + ' JSON 不合法：' + e.message); }
    const event = Array.isArray(snapshot?.events) ? snapshot.events.find(e => e?.eventName === 'disaster_profile' && e.payload) : null;
    if (!event) throw Error(label + ' events 中未找到 eventName=disaster_profile 的事件');
    const payload = event.payload;
    if (!payload.disasterProfileId) throw Error('payload.disasterProfileId 不能为空');
    const version = Number(payload.version);
    if (!Number.isFinite(version) || version < 0) throw Error('payload.version 必须是非负数字');
    const msg = { kind: 'map-relay-event', eventName: 'disaster_profile', payload, seq: ++relaySeq, sentAt: Date.now() };
    if (!relayChannel) relayChannel = new BroadcastChannel('ids-map-screen-relay');
    relayChannel.postMessage(msg);
    $('positionSync').value = JSON.stringify(msg, null, 2);
    console.log('[' + label + '] BroadcastChannel ids-map-screen-relay →', msg);
    $('gisStatus').textContent = label + '已通过 BroadcastChannel 发送（disasterProfileId=' + payload.disasterProfileId + ', version=' + version + ', seq=' + relaySeq + '）；已打开的地图屏按 §8.6 读侧逻辑接收。';
    log('发送 map-relay-event → disaster_profile：seq=' + relaySeq + ' ' + JSON.stringify(payload));
}
bind('writeProfile', () => sendProfileSnapshot('dp_message', '画像快照'));
// localStorage 面板：在当前同源页面上下文执行文本框脚本，其他标签页（待测 GIS）通过 storage 事件收到变化
function runStorageScript(textareaId, label) {
    if (!/^https?:$/.test(location.protocol)) throw Error('请通过测试服务的 /__test/ 地址打开控制台');
    const code = $(textareaId).value.trim();
    if (!code) throw Error('脚本内容为空');
    new Function(code)();
    log('localStorage 脚本已执行：' + label);
    $('gisStatus').textContent = '已执行「' + label + '」并写入 localStorage；同源的待测地图页通过 storage 事件接收变化。';
}
bind('runDt', () => runStorageScript('dt_message', '调派车辆'));
bind('routrGH', () => runStorageScript('routeguihua_message', '路径规划'));
bind('runLDD', () => runStorageScript('LDD_message', '来电定位 callLocation'));
// 地图选点 V1.1：与实时转发共用 ids-map-screen-relay，但必须创建独立选点实例（不复用 relayChannel）
function getPickChannel() {
    if (typeof BroadcastChannel === 'undefined') throw Error('当前浏览器不支持 BroadcastChannel');
    if (!pickChannel) {
        pickChannel = new BroadcastChannel('ids-map-screen-relay');
        pickChannel.onmessage = onPickMessage;
    }
    return pickChannel;
}
// 校验并过滤 GIS 发来的选点消息：只接受 kind=map-point-selection 且 payload.v=1、source=gis
function onPickMessage(event) {
    const data = event?.data;
    if (!data || data.kind !== 'map-point-selection') return; // 不是选点消息（可能是 map-relay-*），忽略
    const msg = data.payload;
    if (!msg || typeof msg !== 'object' || msg.v !== 1 || msg.source !== 'gis') return;
    // 无活跃会话或 token 不匹配（不是我们的 START 回执），忽略
    if (!pickSession || msg.ownerId !== pickSession.ownerId || msg.requestId !== pickSession.requestId || msg.incidentID !== pickSession.incidentID) return;
    // 更新接收预览
    $('pickReceive').value = JSON.stringify(msg, null, 2);
    const type = msg.type;
    if (type === 'PICK_READY') {
        pickSession.phase = 'ready';
        $('gisStatus').textContent = 'GIS 已 READY（选点准备就绪），等待 RESULT...';
        log('收到 PICK_READY → ' + JSON.stringify(msg));
    } else if (type === 'PICK_RESULT') {
        pickSession.phase = 'awaiting_save';
        pickSession.lastResult = msg.pointInfo;
        const pt = msg.pointInfo || {};
        $('pickResultInfo').hidden = false;
        $('pickResultInfo').innerHTML = '<strong>GIS 选点结果：</strong>经度 <code>' + pt.x + '</code> / 纬度 <code>' + pt.y + '</code><br>地址：' + (pt.address || '（空）');
        $('pickApplied').hidden = false; $('pickApplied').disabled = false;
        $('pickFailed').hidden = false; $('pickFailed').disabled = false;
        $('gisStatus').textContent = '收到 GIS RESULT：x=' + pt.x + ', y=' + pt.y + ', address=' + pt.address + '。请模拟保存后发送 APPLIED 或 FAILED。';
        log('收到 PICK_RESULT → ' + JSON.stringify(msg));
    } else if (type === 'PICK_CANCEL') {
        log('GIS 发送 PICK_CANCEL，reason=' + msg.reason);
        $('gisStatus').textContent = 'GIS 取消了本次选点（reason=' + msg.reason + '）。';
        clearPickSession();
    } else {
        log('收到未处理的 GIS 消息：' + type);
    }
}
function clearPickSession() {
    pickSession = null;
    $('runRelocate').disabled = false;
    $('relocateCancel').disabled = true;
    $('pickResultInfo').hidden = true;
    $('pickReceive').value = '';
    $('pickApplied').hidden = true; $('pickApplied').disabled = true;
    $('pickFailed').hidden = true; $('pickFailed').disabled = true;
}
function pickSend(type, extra = {}) {
    const ch = getPickChannel();
    const ownerId = $('relocate_ownerId').value.trim();
    const requestId = $('relocate_requestId').value.trim();
    const incidentID = $('relocate_incidentID').value.trim();
    if (!ownerId || !requestId || !incidentID) throw Error('ownerId / requestId / incidentID 不能为空');
    const payload = { v: 1, type, source: 'seat', ownerId, requestId, incidentID, sentAt: Date.now(), ...extra };
    // pickSession 里记住 token，用于过滤 GIS 回执
    pickSession = { ownerId, requestId, incidentID, phase: (type === 'PICK_START' ? 'waiting_ready' : (pickSession?.phase || 'done')) };
    const wire = { kind: 'map-point-selection', payload };
    ch.postMessage(wire);
    console.log('[pick] BroadcastChannel ids-map-screen-relay →', wire);
    log('发送 ' + type + ' → map-point-selection：' + JSON.stringify(wire));
    return wire;
}
bind('runRelocate', () => {
    const x = $('relocate_x').value.trim(), y = $('relocate_y').value.trim(), address = $('relocate_address').value.trim();
    pickSend('PICK_START', { pointInfo: { x, y, address } });
    $('runRelocate').disabled = true;
    $('relocateCancel').disabled = false;
    $('gisStatus').textContent = 'PICK_START 已发出，等待 GIS READY（最多 5s）...';
});
bind('relocateCancel', () => {
    if (!pickSession) { log('没有活跃的选点会话'); return; }
    pickSend('PICK_CANCEL', { reason: 'user_cancel' });
    $('gisStatus').textContent = '已发送 PICK_CANCEL，reason=user_cancel';
    clearPickSession();
});
bind('pickApplied', () => {
    if (!pickSession) throw Error('没有活跃的选点会话');
    pickSend('PICK_APPLIED', { changed: true });
    $('gisStatus').textContent = '已发送 PICK_APPLIED（changed=true），GIS 应停止 RESULT 重试并清理本次选点。';
    clearPickSession();
});
bind('pickFailed', () => {
    if (!pickSession) throw Error('没有活跃的选点会话');
    pickSend('PICK_FAILED', { code: 'save_failed', message: '测试控制台模拟保存失败' });
    $('gisStatus').textContent = '已发送 PICK_FAILED（save_failed），GIS 应停止重试并提示失败。';
    clearPickSession();
});
bind('runTezai', () => runStorageScript('tezai_message', '切换特灾模式'));
bind('runDispatchTZ', () => runStorageScript('dispatchTZTrack_message', '特灾调派命令'));
bind('runRenderTZ', () => runStorageScript('renderTZTrack_message', '特灾渲染命令'));
bind('runCheckPT', () => runStorageScript('checkPT_message', '特灾切回普通模式'));
bind('runIncidentLocation', () => runStorageScript('incidentLocation_message', '警情定位'));
// 槽位变更（辖区）：与画像快照同格式（map-relay-snapshot），共用发送逻辑
bind('writeSlot', () => sendProfileSnapshot('slot_message', '槽位变更'));
bind('connect', () => {
    if (socket && socket.readyState < 2) { socket.close(); return; }
    socket = new WebSocket(`${base}/mock-control`); $('status').textContent = '连接中';
    socket.onopen = () => { $('status').textContent = '控制服务已连接'; $('connect').textContent = '断开控制服务'; send({ action: 'clients' }); };
    socket.onmessage = e => { const result = JSON.parse(e.data); if (result.action === 'clients') { knownClients = result.clients; $('clients').textContent = JSON.stringify(result.clients, null, 2); renderProtocol(); } log(result); };
    socket.onerror = () => log('连接失败，请检查 Node 服务是否启动');
    socket.onclose = () => { 
        stop(); 
        $('status').textContent = '控制服务已断开'; 
        $('connect').textContent = '连接控制服务';
     };
});
bind('refresh', () => send({ action: 'clients' })); bind('disconnect', () => send({ action: 'disconnect', ...target() })); bind('generate', generate); bind('push', push);
bind('start', () => { const delay = Number($('interval').value); if (!Number.isFinite(delay) || delay < 500 || delay > 2147483647) throw Error('循环间隔应在 500 到 2147483647 毫秒之间'); stop(); const isCar = $('preset').value === 'car'; const routeLen = isCar ? TestProtocols.carPoints[carRouteIndex % TestProtocols.carPoints.length].length : 0; if (isCar) { /* 重置 baseTime 让最后一个点接近当前；gpsTime 间隔 = delay */ carBaseTime = Date.now() - (routeLen - 1) * delay; carPointIndex = 0; generate(); } push(); timer = setInterval(() => { try { if (isCar) { const next = carPointIndex + 1; if (next >= routeLen) { stop(); log('已推送完最后一个车辆位置，循环自动停止'); return; } carPointIndex = next; generate(); } push(); } catch (e) { log(e.message); stop(); } }, delay); $('start').disabled = true; });
bind('stop', stop); bind('clear', () => { $('log').textContent = ''; });
$('preset').onchange = () => { stop(); try { generate(); } catch (e) { log(e.message); } };
$('routeIndex').onchange = () => { stop(); carPointIndex = 0; carBaseTime = null; carRouteIndex = Number($('routeIndex').value) || 0; try { generate(); } catch (e) { log(e.message); } };
['userId', 'sessionState', 'seat'].forEach(id => $(id).oninput = () => { stop(); updateUrl(); renderProtocol(); });
Object.entries(TestProtocols.incidentStates).forEach(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = value + ' · ' + label; $('incidentState').appendChild(option); });
// phase_web 下拉值 → 通信面板 id；面板即一种前端页面间通信方式（localStorage / BroadcastChannel）
const webPanels = {
    position: 'positionPanel',
    LDD: 'LDDPanel',
    relocate: 'relocatePanel',
    dispatchTrack: 'dispatchTrackPanel',
    routeguihua: 'routeguihuaPanel',
    tezai: 'tezaiPanel',
    dispatchTZTrack: 'dispatchTZTrackPanel',
    renderTZTrack: 'renderTZTrackPanel',
    checkPT: 'checkPTPanel',
    incidentLocation: 'incidentLocationPanel',
    slot: 'slotPanel',
    profile: 'profilePanel',
};
function syncWebPanel() {
    const panelId = webPanels[$('phase_web').value];
    Object.values(webPanels).forEach(id => { $(id).hidden = id !== panelId; });
}
$('phase_web').onchange = syncWebPanel;
function syncPresetToPhase() {
    stop();
    const phase = $('phase').value;
    const presets = { onDuty: 'car', popup: 'position', inquiry: 'answer', filed: 'incident', dispatchTrack: 'incident' };
    $('preset').value = presets[phase];
    if (phase === 'dispatchTrack') $('incidentState').value = 'CREATED';
    // 阶段联动：来电→POSITION_SYNC 面板；立案→disaster_profile 面板；其余不预选（面板显隐统一由 phase_web 驱动）
    $('phase_web').value = phase === 'popup' ? 'position' : phase === 'filed' ? 'profile' : '';
    syncWebPanel();
    try { generate(); } catch (e) { $('message').value = ''; log(e.message); }
}
$('phase').onchange = syncPresetToPhase;
['incidentState', 'reconciliation', 'wrapper'].forEach(id => {
    $(id).onchange = () => { stop(); try { generate(); } catch (e) { $('message').value = ''; log(e.message); } };
});
window.addEventListener('beforeunload', () => { stop(); socket?.close(); relayChannel?.close(); pickChannel?.close(); }); updateUrl(); syncPresetToPhase();