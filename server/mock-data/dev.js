'use strict';
// dev 环境假数据：深圳。将北京基准路线整体平移到深圳中心（形状不变），队站用深圳站名。
const { carPoints } = require('../protocols');

const BJ_CENTER = [116.4074, 39.9042];
const SZ_CENTER = [113.9354071, 22.54831];
const OFFSET = [SZ_CENTER[0] - BJ_CENTER[0], SZ_CENTER[1] - BJ_CENTER[1]];

const routes = carPoints.map(route =>
  route.map(([lng, lat]) => [
    Number((lng + OFFSET[0]).toFixed(7)),
    Number((lat + OFFSET[1]).toFixed(7)),
  ]),
);

const vehicles = [
  {
    vehicleId: 'TEST-CAR-001',
    plateNumber: '粤B·12345',
    stationId: 'f7742190d975473790fb816861846b2e',
    stationName: '深圳市南山区大冲消防救援站',
    stationAddress: '深圳市南山区大冲路',
    routeIndex: 0,
  },
  {
    vehicleId: 'TEST-CAR-002',
    plateNumber: '粤B·67890',
    stationId: '8aee87a783f84e21018432fe5e814311',
    stationName: '深圳市南山区沙河消防救援站',
    stationAddress: '深圳市南山区沙河路',
    routeIndex: 1,
  },
];

module.exports = {
  env: 'dev',
  label: 'dev · 深圳',
  center: SZ_CENTER,
  routes,
  vehicles,
  leadStation: { stationId: vehicles[0].stationId, stationName: vehicles[0].stationName },
  address: '深圳市南山区示例路 1 号',
  adminDivision: '广东-深圳-南山',
};
