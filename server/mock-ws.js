const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { filterFrame } = require('./routing');
const { proxyHttp, proxyUpgrade } = require('./gis-proxy');
const { mountTestHarness } = require('./test-harness');
// mock 数据中心：region（坐标/队站/车牌/车辆）+ carPoints（各 region 4 条轨迹路径）
const { getActiveRegion, getActiveRegionKey, getCarPoints, getCarTrackFullData, getTurnoutVehicleTimes, REGION_KEYS } = require('./mock-data');
const region = getActiveRegion();
const carPoints = getCarPoints();

// BFF mock 数据集切换：test-runner / test-ui 可在运行时切换，用于测试空态/降级等场景。
// withTrack=正常 2 车有轨迹；single=1 车；noVehicles=无出动车辆；noTrack=有车但无轨迹点；serviceError=接口 500。
const BFF_MOCK_DATASETS = ['withTrack', 'single', 'noVehicles', 'noTrack', 'serviceError'];
let bffMockDataset = 'withTrack';
const setBffMockDataset = (d) => {
  if (BFF_MOCK_DATASETS.includes(d)) {
    bffMockDataset = d;
    console.log(`[BFF-MOCK] dataset → ${d}`);
  }
};
const getBffMockDataset = () => bffMockDataset;

// BFF mock 分组：逐组开关，ON=返回假数据；OFF=该分支透传真实后端（局部模拟）。
const BFF_MOCK_GROUPS = ['profile', 'detail', 'turnoutVehicles', 'carTrack'];
let bffMockGroups = { profile: true, detail: true, turnoutVehicles: true, carTrack: true };
const setBffMockGroups = (g) => {
  if (g && typeof g === 'object') {
    let changed = false;
    for (const k of BFF_MOCK_GROUPS) {
      if (typeof g[k] === 'boolean' && bffMockGroups[k] !== g[k]) { bffMockGroups[k] = g[k]; changed = true; }
    }
    if (changed) console.log(`[BFF-MOCK] groups → ${JSON.stringify(bffMockGroups)}`);
  }
};
const getBffMockGroups = () => ({ ...bffMockGroups });

// 进程内共享：test-runner 与 mock-ws 同进程，直接调用避免 HTTP 自调用。
globalThis.__idsMockControl = {
  setBffMockDataset, getBffMockDataset, datasets: BFF_MOCK_DATASETS,
  setBffMockGroups, getBffMockGroups, groups: BFF_MOCK_GROUPS,
};

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

// BFF mock：测试环境无后端时拦截 /bff-client 与 /car-track-api，返回 COLA 信封假数据
const handleBffMock = (req, res, pathname) => {
  const json = (data, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ success: true, data, message: 'mock', code: 0, timestamp: Date.now() }));
  };

  // 前端 VITE_API_BASE_URL 可能为 /api（见 .env.local），给所有请求加 /api 前缀。
  // 归一化：去掉开头独立的 /api 段后再匹配拦截规则，使从 :18080 同源打开时能命中 mock。
  // 未命中时仍用原始 pathname 走 proxy（Vite 代理 /api 会自行 rewrite 去前缀），互不影响。
  const mockPath = pathname.replace(/^\/api(?=\/|$)/, '') || pathname;

  // by-incident profile（useIncidentLocationProfileSync → toAddressUpdatedData）
  const profileMatch = mockPath.match(/^\/bff-client\/api\/v1\/inquiry\/profiles\/by-incident\/([^/]+)$/);
  if (profileMatch) {
    if (!bffMockGroups.profile) return false; // 关闭 → 透传真实后端
    const incidentId = decodeURIComponent(profileMatch[1]);
    json({
      disasterProfileId: `profile-${incidentId}`,
      inquiryId: `inquiry-${incidentId}`,
      incidentId,
      version: 1,
      slots: [
        { slotCode: 'disaster_address', filledValue: region.sampleAddress },
        { slotCode: 'longitude', filledValue: String(region.center[0]) },
        { slotCode: 'latitude', filledValue: String(region.center[1]) },
        { slotCode: 'm_org_id', filledValue: region.stations[0].id },
      ],
    });
    return true;
  }

  // incident detail（IncidentDetailDialog）
  const detailMatch = mockPath.match(/^\/bff-client\/api\/v1\/gis\/incidents\/([^/]+)\/detail$/);
  if (detailMatch) {
    if (!bffMockGroups.detail) return false; // 关闭 → 透传真实后端
    const incidentId = decodeURIComponent(detailMatch[1]);
    const now = new Date().toISOString();
    // dataset 过滤车辆：withTrack 默认全量；single 仅第一辆；noVehicles 空
    const allDetailVehicles = region.vehicles;
    let detailVehicles = allDetailVehicles;
    if (bffMockDataset === 'single') detailVehicles = allDetailVehicles.slice(0, 1);
    else if (bffMockDataset === 'noVehicles') detailVehicles = [];
    const leadStation = region.stations[0];
    json({
      alarmInfo: {
        incidentNo: incidentId,
        callInTime: now,
        accessType: 'PHONE',
        callerPhone: '13800138000',
        callerName: '测试来电人',
        installAddress: region.sampleAddress,
      },
      acceptInfo: {
        seatNo: '3003',
        acceptTime: now,
        disasterLevel: 'III',
        keyUnitName: null,
        disasterAddress: region.sampleAddress,
        burningMaterial: '木材',
        isSupplement: false,
        incidentMark: 'fire',
        smokeSituation: null,
        trappedCount: 0,
        adminDivision: region.adminDivision,
        disasterType: { type: 'fire', subtype: 'residential' },
        contacterName: '测试联系人',
        contacterPhone: '13900139000',
        leadStation: leadStation.id,
        longitude: region.center[0],
        latitude: region.center[1],
        acceptContent: '测试警情描述',
      },
      dispatchInfo: {
        batches: [{
          batchId: 'batch-1',
          kind: 'first',
          seq: 1,
          dispatchedAt: now,
          vehicleCount: detailVehicles.length,
          stations: detailVehicles.map(v => {
            const st = region.stations.find(s => s.id === v.stationId) || leadStation;
            return {
              stationId: st.id,
              stationName: st.name,
              vehicleCount: 1,
              vehicles: [{
                vehicleId: v.vehicleId,
                vehicleName: v.plateNo,
                vehicleTypeCode: 'FIRE',
                vehicleTypeName: v.vehicleTypeName,
                plateNo: v.plateNo,
                onboardPersonnelCount: 5,
                waterTons: 8,
                foamTons: null,
              }],
            };
          }),
        }],
      },
    });
    return true;
  }

  // turnout-vehicles（queryIncidentTurnoutVehicles）
  const turnoutMatch = mockPath.match(/^\/bff-client\/api\/v1\/gis\/incidents\/([^/]+)\/turnout-vehicles$/);
  if (turnoutMatch) {
    if (!bffMockGroups.turnoutVehicles) return false; // 关闭 → 透传真实后端
    if (bffMockDataset === 'serviceError') {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ success: false, message: 'mock turnout-vehicles serviceError', code: 500 }));
      return true;
    }
    const incidentId = decodeURIComponent(turnoutMatch[1]);
    const vehicleTimes = getTurnoutVehicleTimes();
    const allVehicles = region.vehicles.map((v, i) => {
      const st = region.stations.find(s => s.id === v.stationId) || region.stations[0];
      const timeInfo = vehicleTimes[i] || {};
      return {
        vehicleId: v.vehicleId,
        plateNumber: v.plateNo,
        stationId: v.stationId,
        stationName: st.name,
        stationAddress: st.address,
        startTime: timeInfo.startTime || new Date().toISOString(),
        endTime: timeInfo.endTime || null,
        finalPlanId: `plan-${i + 1}`,
        dispatchSeq: i + 1,
      };
    });
    let vehicles = allVehicles;
    if (bffMockDataset === 'noVehicles') vehicles = [];
    else if (bffMockDataset === 'single') vehicles = allVehicles.slice(0, 1);
    // withTrack / noTrack 均返回全量车辆；noTrack 在 car-track 阶段返回空
    json({
      incident: {
        incidentId,
        incidentType: { type: 'fire', subtype: 'residential' },
        alarmTime: new Date().toISOString(),
        burningMaterial: '木材',
        keyUnitName: null,
        incidentState: 'DISPATCHED',
        disasterAddress: region.sampleAddress,
        leadStationId: region.stations[0].id,
        leadStationName: region.stations[0].name,
      },
      vehicles,
      meta: { sourceGaps: [], sourceErrors: [] },
    });
    return true;
  }

  // car-track-api POST（历史轨迹，按 carId 映射到对应环境的路线）
  if (mockPath === '/car-track-api/api/car/track/query' && req.method === 'POST') {
    if (!bffMockGroups.carTrack) return false; // 关闭 → 透传真实后端（必须在读 body 前返回，避免请求挂起）
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const [v0, v1] = region.vehicles;
      let carId = v0.vehicleId;
      let plateNumber = v0.plateNo;
      try {
        const parsed = JSON.parse(body);
        carId = parsed.carId || carId;
        plateNumber = parsed.plateNumber || plateNumber;
      } catch { /* use defaults */ }
      // noTrack：有车但轨迹点为空 → 前端过滤后 < 2 → 命中"未查询到历史轨迹数据"空态
      if (bffMockDataset === 'noTrack') { json([]); return; }
      // 车车 0/1 分别映射 carPoints[0]/[1]（31/116 点）；未知 carId 回退第一路
      const carPointsMap = {};
      region.vehicles.forEach((v, i) => { carPointsMap[v.vehicleId] = carPoints[i] || carPoints[0]; });
      // 优先用持久化/合成数据（真实道路坐标 + PAST 时间戳 + 速度段）；该车无对应路线时回退旧 carPoints
      const fullData = getCarTrackFullData();
      const carIdx = region.vehicles.findIndex(v => v.vehicleId === carId);
      const carIdxSafe = carIdx >= 0 ? carIdx : 0;
      const fullEntry = carIdxSafe < fullData.length ? fullData[carIdxSafe] : null;
      const route = fullEntry?.points || carPointsMap[carId] || carPoints[0];
      const gpsTimes = fullEntry?.gpsTimes || route.map((_, i) => {
        const startMs = Date.now() - 25 * 60 * 1000;
        return new Date(startMs + i * 5000).toISOString().slice(0, 19).replace('T', ' ');
      });
      const points = route.map((coord, i) => ({
        carId,
        plateNumber,
        longitude: coord[0],
        latitude: coord[1],
        gpsTime: gpsTimes[i],
      }));
      json(points);
    });
    return true;
  }

  // 其他 /bff-client 或 /car-track-api 路径 → 不拦截，走 proxy
  return false;
};

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if(pathname === '/__test') {res.writeHead(302,{Location:'/__test/'});return res.end();}
  const files = new Map([['/__test/','index.html'],['/__test/index.html','index.html'],['/__test/index.js','index.js'],['/__test/protocols.js','protocols.js'],['/car-location-subscribe-demo.html','car-location-subscribe-demo.html'],['/__test/car-location-subscribe-demo.html','car-location-subscribe-demo.html']]);
  const file=files.get(pathname);
  if (!file) {
    // mock 统一配置接口：GET 查询 / POST 更新（dataset / groups，env 只读按 MOCK_DATA_CENTER 环境变量定）
    if (pathname === '/__test/api/mock-config') {
      const sendConfig = () => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({
          env: getActiveRegionKey(),
          envs: REGION_KEYS,
          dataset: getBffMockDataset(),
          datasets: BFF_MOCK_DATASETS,
          groups: getBffMockGroups(),
          groupKeys: BFF_MOCK_GROUPS,
        }));
      };
      if (req.method === 'POST') {
        let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
          try {
            const body = JSON.parse(b || '{}');
            if (body.dataset) setBffMockDataset(body.dataset);
            if (body.groups) setBffMockGroups(body.groups);
            if (body.env) console.log(`[BFF-MOCK] env runtime switch not supported (MOCK_DATA_CENTER=${getActiveRegionKey()})`);
          } catch { /* ignore */ }
          sendConfig();
        });
      } else { sendConfig(); }
      return;
    }
    if (handleBffMock(req, res, pathname)) return; // BFF mock：优先于 test-harness 和 proxy
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
server.listen(Number(process.env.PORT || 18080), process.env.HOST || '127.0.0.1', () => {
  console.log(`mock 数据中心：${getActiveRegionKey()}（${region.name}，adcode=${region.adcode}，center=${region.center}，plate=${region.platePrefix}）`);
  console.log(`单元测试控制台：http://localhost:${server.address().port}/__test/`);
  console.log(`自动化流程测试控制台：http://localhost:${server.address().port}/test-ui/`);
});
