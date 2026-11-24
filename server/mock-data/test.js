'use strict';
// test 环境假数据：北京（= 现有 protocols.carPoints 基准路线）
const { carPoints } = require('../protocols');

const vehicles = [
  {
    vehicleId: 'TEST-CAR-001',
    plateNumber: '京A·12345',
    stationId: 'f7742190d975473790fb816861846b2e',
    stationName: '北京市海淀区中关村消防救援站',
    stationAddress: '北京市海淀区中关村大街',
    routeIndex: 0,
  },
  {
    vehicleId: 'TEST-CAR-002',
    plateNumber: '京A·67890',
    stationId: '8aee87a783f84e21018432fe5e814311',
    stationName: '北京市海淀区学院路消防救援站',
    stationAddress: '北京市海淀区学院路',
    routeIndex: 1,
  },
];

module.exports = {
  env: 'test',
  label: 'test · 北京',
  center: [116.4074, 39.9042],
  routes: carPoints,
  vehicles,
  leadStation: { stationId: vehicles[0].stationId, stationName: vehicles[0].stationName },
  address: '北京市海淀区示例路 1 号',
  adminDivision: '北京-海淀',
};
