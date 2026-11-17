'use strict';
// mock 数据中心：按前端 env 运行环境适配模拟数据（坐标 / 消防站 / 车牌 / 行政区划 / 车辆轨迹）。
// 各环境对应关系：
//   - 本地（dev.local）/ 开发环境（development）→ shenzhen（深圳）
//   - 测试环境（test）                           → beijing（北京）
//   - 生产环境（production）                     → guizhou（贵阳，贵州省内制造）
//
// 选取方式：process.env.MOCK_DATA_CENTER（取值 shenzhen|beijing|guizhou，默认 shenzhen）。
// 由 scripts/dev-with-mock-ws.mjs 按 vite mode 推导并透传；单独 `node server/mock-ws.js`
// 时可手动 `MOCK_DATA_CENTER=beijing node server/mock-ws.js`。
//
// 浏览器侧（__test/ 静态页）加载的 protocols.js 不引用本模块（保持向后兼容），
// Node 侧（mock-ws / test-runner）通过 require('./mock-data') 取当前 region。

const REGIONS = {
  shenzhen: {
    name: '深圳',
    adcode: '440300',
    city: '深圳市',
    center: [113.9354, 22.5483],
    adminDivision: '深圳-南山',
    platePrefix: '粤B',
    // m_org_id 主键：前端 resolveStationCoordinates 可按 stationId 解析真实坐标，
    // 此处 mock 数据使用固定占位主键（跨环境一致，避免前端按 region 另配坐标表）。
    stations: [
      { id: 'f7742190d975473790fb816861846b2e', name: '深圳市南山区大冲消防救援站', address: '深圳南山区大冲路' },
      { id: '8aee87a783f84e21018432fe5e814311', name: '深圳市南山区沙河消防救援站', address: '深圳南山区沙河路' },
    ],
    vehicles: [
      { vehicleId: 'TEST-CAR-001', plateNo: '粤B·12345', stationId: 'f7742190d975473790fb816861846b2e', stationName: '深圳市南山区大冲消防救援站', vehicleTypeName: '消防车' },
      { vehicleId: 'TEST-CAR-002', plateNo: '粤B·67890', stationId: '8aee87a783f84e21018432fe5e814311', stationName: '深圳市南山区沙河消防救援站', vehicleTypeName: '消防车' },
    ],
    sampleAddress: '深圳市南山区大冲路 1 号',
    sampleAddressLngLat: [113.95024, 22.54545],
  },
  beijing: {
    name: '北京',
    adcode: '110000',
    city: '北京市',
    center: [116.4074, 39.9042],
    adminDivision: '北京-海淀',
    platePrefix: '京A',
    stations: [
      { id: 'f7742190d975473790fb816861846b2e', name: '北京市海淀区大冲消防救援站', address: '北京海淀区大冲路' },
      { id: '8aee87a783f84e21018432fe5e814311', name: '北京市海淀区沙河消防救援站', address: '北京海淀区沙河路' },
    ],
    vehicles: [
      { vehicleId: 'TEST-CAR-001', plateNo: '京A·12345', stationId: 'f7742190d975473790fb816861846b2e', stationName: '北京市海淀区大冲消防救援站', vehicleTypeName: '消防车' },
      { vehicleId: 'TEST-CAR-002', plateNo: '京A·67890', stationId: '8aee87a783f84e21018432fe5e814311', stationName: '北京市海淀区沙河消防救援站', vehicleTypeName: '消防车' },
    ],
    sampleAddress: '北京市海淀区大冲路 1 号',
    sampleAddressLngLat: [116.4074, 39.9042],
  },
  guizhou: {
    name: '贵州·贵阳',
    adcode: '520100',
    city: '贵阳市',
    center: [106.630, 26.6477],
    adminDivision: '贵州-贵阳',
    platePrefix: '贵A',
    stations: [
      { id: 'f7742190d975473790fb816861846b2e', name: '贵阳市南明区大冲消防救援站', address: '贵阳市南明区大冲路' },
      { id: '8aee87a783f84e21018432fe5e814311', name: '贵阳市南明区沙河消防救援站', address: '贵阳市南明区沙河路' },
    ],
    vehicles: [
      { vehicleId: 'TEST-CAR-001', plateNo: '贵A·12345', stationId: 'f7742190d975473790fb816861846b2e', stationName: '贵阳市南明区大冲消防救援站', vehicleTypeName: '消防车' },
      { vehicleId: 'TEST-CAR-002', plateNo: '贵A·67890', stationId: '8aee87a783f84e21018432fe5e814311', stationName: '贵阳市南明区沙河消防救援站', vehicleTypeName: '消防车' },
    ],
    sampleAddress: '贵阳市南明区大冲路 1 号',
    sampleAddressLngLat: [106.630, 26.6477],
  },
};

const REGION_KEYS = Object.keys(REGIONS);
const DEFAULT_REGION = 'shenzhen';
// 与既有 mock 一致：carPoints 4 条路径点数（31 / 116 / 84 / 192）
const CAR_ROUTE_LENGTHS = [31, 116, 84, 192];

// 确定性伪随机（mulberry32）：同一 region 每次生成完全一致，避免轨迹抖动
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * 生成某 region 的 4 条车辆轨迹路径（按 CAR_ROUTE_LENGTHS 点数），落在 center ±0.02° 内。
 * 模拟道路弯曲：沿一个主方向线性推进 + 正弦横向摆动。
 * @returns {number[][][]} 4 条路径，每条为 [lng, lat] 数组
 */
function generateCarPoints(regionKey) {
  const region = REGIONS[regionKey];
  const [clng, clat] = region.center;
  const rand = mulberry32(hashSeed(regionKey + ':carPoints'));
  const routes = [];
  CAR_ROUTE_LENGTHS.forEach((len, ri) => {
    // 每条路径一个主方向（角度），随机起点在中心附近
    const dirAngle = rand() * Math.PI * 2;
    const startLng = clng + (rand() - 0.5) * 0.02;
    const startLat = clat + (rand() - 0.5) * 0.02;
    // 每步前进量：把 0.02° 的跨度均摊到 len 步，保证整条路径落在中心 ±0.02° 范围内
    const stepSize = 0.012 / len;
    const wobbleAmp = 0.0004 + rand() * 0.0006; // 横向摆动幅度
    const wobbleFreq = 1 + rand() * 3;           // 摆动频率
    const phase = rand() * Math.PI * 2;
    const points = [];
    for (let i = 0; i < len; i++) {
      const t = i * stepSize;
      const along = t;
      const lateral = wobbleAmp * Math.sin(t * wobbleFreq * 10 + phase);
      // 主方向 + 横向（垂直）偏移
      const lng = startLng + along * Math.cos(dirAngle) + lateral * -Math.sin(dirAngle);
      const lat = startLat + along * Math.sin(dirAngle) + lateral * Math.cos(dirAngle);
      points.push([Number(lng.toFixed(7)), Number(lat.toFixed(7))]);
    }
    routes.push(points);
  });
  return routes;
}

function resolveRegionKey() {
  const raw = String(process.env.MOCK_DATA_CENTER || DEFAULT_REGION).trim().toLowerCase();
  return REGION_KEYS.includes(raw) ? raw : DEFAULT_REGION;
}

/** 当前生效 region key（shenzhen|beijing|guizhou，默认 shenzhen） */
function getActiveRegionKey() {
  return resolveRegionKey();
}

/** 当前生效 region 数据 */
function getActiveRegion() {
  return REGIONS[getActiveRegionKey()];
}

/** 当前生效 region 的 4 条车辆轨迹路径 */
function getCarPoints() {
  return generateCarPoints(getActiveRegionKey());
}

const api = { REGIONS, REGION_KEYS, DEFAULT_REGION, CAR_ROUTE_LENGTHS, getActiveRegionKey, getActiveRegion, getCarPoints, generateCarPoints };
module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.MockDataCenter = api;
