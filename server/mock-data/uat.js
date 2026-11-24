'use strict';
// uat 环境假数据：北京（与 test 同坐标；队站/地址加 UAT 前缀，便于 GIS 上区分当前环境）
const base = require('./test');

const vehicles = base.vehicles.map(v => ({
  ...v,
  stationName: `UAT-${v.stationName}`,
  stationAddress: `UAT-${v.stationAddress}`,
}));

module.exports = {
  ...base,
  env: 'uat',
  label: 'uat · 北京',
  vehicles,
  leadStation: { ...base.leadStation, stationName: vehicles[0].stationName },
  address: `UAT-${base.address}`,
};
