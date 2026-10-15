// 仅用于本地联调：不执行真实调派，不验证真实令牌。
const http = require('http');
const pools = new Map();
const plans = new Map();
function registerPlan(incidentId) {
  const context = { incidentId, dispatchPlanId: `PLAN-${incidentId}`, sourcePlanId: `PLAN-${incidentId}`, seatId: 'MOCK-SEAT-8001', sourceType: 'MANUAL' };
  plans.set(context.dispatchPlanId, { ...context, currentBatchNo: 0, finalPlans: [] });
  return context;
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/^\/api(?=\/)/, '');
  const reply = (code, eventType, data, message = 'success', incidentId = null) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ protocolVersion: '1.0', requestId: req.headers['x-request-id'] || `mock-${Date.now()}`, incidentId, eventType, success: code < 400, code, message, data }));
  };
  if (!/^Bearer\s+\S+/i.test(req.headers.authorization || '')) return reply(401, 'ERROR', null, '需要 Bearer 请求头（仅模拟）');
  if (req.method === 'GET' && path === '/dispatch/vehicles') {
    const stationId = url.searchParams.get('primaryStationId')?.trim();
    if (!stationId) return reply(400, 'VEHICLE_LIST', null, '缺少 primaryStationId');
    if (!pools.has(stationId)) {
      const n = pools.size + 1;
      pools.set(stationId, ['水罐消防车', '泡沫消防车', '登高平台车'].map((vehicleName, i) => ({
        carId: `MOCK-CAR-${n}-${i}`, stationId, plate: `测${String(n).padStart(3, '0')}${i + 1}`,
        vehicleName, orgName: `模拟队站（${stationId}）`, vehicleStatus: '可调派',
        vehicleType: ['WATER_TANKER', 'FOAM', 'AERIAL_PLATFORM'][i], vehicleHeight: i === 2 ? 4 : 3,
        etaMinutes: i === 0 ? null : 5 + i,
      })));
    }
    console.log('模拟车辆列表查询', stationId);
    return reply(200, 'VEHICLE_LIST', pools.get(stationId));
  }
  if (req.method === 'POST' && path === '/dispatch/vehicles/dispatch') {
    let body;
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) return reply(413, 'ERROR', null, '请求过大');
        chunks.push(chunk);
      }
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch { return reply(400, 'ERROR', null, '无效 JSON'); }
    if (!body || ['incidentId', 'dispatchPlanId', 'sourcePlanId', 'seatId'].some(key => typeof body[key] !== 'string' || !body[key].trim())) return reply(400, 'ERROR', null, '缺少警情、方案或坐席 ID');
    const plates = body.plateNumbers;
    if (!Array.isArray(plates) || !plates.length || plates.length > 200 || plates.some(p => typeof p !== 'string' || !p.trim()) || new Set(plates).size !== plates.length) return reply(400, 'ERROR', null, '车牌必须为 1—200 个且不重复');
    const plan = plans.get(body.dispatchPlanId);
    if (!plan || ['incidentId', 'sourcePlanId', 'seatId'].some(key => plan[key] !== body[key])) return reply(409, 'ERROR', null, '方案归属不匹配，请使用本次 WS 推送的方案');
    const all = [...pools.values()].flat();
    const vehicles = plates.map(p => all.find(v => v.plate === p));
    if (vehicles.some(v => !v || v.vehicleStatus !== '可调派')) return reply(409, 'ERROR', { conflicts: plates }, '车辆不存在或已调派，请刷新列表', body.incidentId);
    vehicles.forEach(v => { v.vehicleStatus = '已调派'; });
    const finalPlan = { plateNumbers: plates, vehicles: vehicles.map(v => ({ ...v })) };
    plan.currentBatchNo += 1;
    plan.finalPlans.push(finalPlan);
    console.log('模拟批量调派成功', plates);
    return reply(200, 'DISPATCHED', { ...plan, planStatus: 'DISPATCHED', finalPlan, orderReceipt: null, conflicts: [] }, 'success', body.incidentId);
  }
  reply(404, 'ERROR', null, '模拟接口不存在');
});
module.exports = { server, registerPlan };
