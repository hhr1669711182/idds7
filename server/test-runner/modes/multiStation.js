'use strict';
// 多队站调派模拟：同时注入 2 个消防站 × 各带 1 辆出动车辆，
// 触发 receiveMockDispatchVehicles → specialMapMock 渲染多候选路线 +
// setRouteVideoCheckpoints 路段合并（P0 网格化后已可承受）。
// stationId 均取自 server/mock-ws.js（resolveStationCoordinates 可解析真实坐标）：
//   - f7742190d975473790fb816861846b2e 深圳市南山区大冲消防救援站
//   - 8aee87a783f84e21018432fe5e814311 深圳市南山区沙河消防救援站
// 如需更多站，在 mock-ws.js 增补 station 数据后追加到 vehicles 数组。
// 门禁同 dispatch.js：推 dispatch 态后纠缠体 activate，mockVehicles 生效。
// 车辆/消防站清单按 mock 数据中心（MOCK_DATA_CENTER）适配：默认深圳，测试环境北京，生产环境贵州
const base = require('./_base');
const { getActiveRegion } = require('../../mock-data');
const region = getActiveRegion();

// WS 补充轨迹（extra：仅在 T1 视图活跃时 DispatchT1.vue 的 attachTracking 才消费）
const extraCar1 = base.carSequence('car-multi-1', 'WS 路径1 轨迹推送（需T1视图）', { count: 12, routeIndex: 0, intervalMs: 500 });
extraCar1.tag = 'extra';

const scenario = {
  key: 'multiStation',
  label: '多队站调派模拟（2 消防站候选路线 + 沿路行驶动画）',
  steps: [
    base.connect,
    // 门禁推进：inquiry → popup → dispatch
    base.pushCallReceived,
    base.pushPosition,
    base.pushAddress,
    // 核心：多消防站同时派车 → 多候选路线上图 + 车辆沿路行驶动画
    base.mockVehicles(
      'multi-station-vehicles',
      '多消防站派车（2 站 × 各 1 车，路线候选上图 + 行驶动画）',
      [
        { vehicleId: 'V-M1', plateNo: region.vehicles[0].plateNo, stationId: region.vehicles[0].stationId, stationName: region.vehicles[0].stationName, vehicleTypeName: '抢险车' },
        { vehicleId: 'V-M2', plateNo: region.vehicles[1].plateNo, stationId: region.vehicles[1].stationId, stationName: region.vehicles[1].stationName, vehicleTypeName: '排涝车' },
      ],
      { afterMs: 5000 }, // 多站路线渲染耗时更长，给 5s 观察窗
    ),
    // 警情状态流转到到场（ARRIVED）
    base.incidentFlow('multi-incident', '警情状态流转（立案→调派→出动→到场）', ['CREATED', 'FORMAL_DISPATCHED', 'DISPATCHED', 'ARRIVED'], 800),
    extraCar1,
  ],
};

module.exports = scenario;
