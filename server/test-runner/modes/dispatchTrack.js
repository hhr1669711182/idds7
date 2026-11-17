'use strict';
// 跟踪全流程：以车辆沿路行驶动画为主。
// 走 localStorage mock 链路（mockVehicles → seat-shared-state-mock → MOCK_DISPATCH_VEHICLES
// → specialMapMock.dispatchVehicles），不依赖 T1 调派视图挂载。
// WS carSequence（seq 步）作为 full 模式补充：仅在 T1 视图活跃时 DispatchT1.vue 的
// attachTracking 才能消费 GPS 数据，非 T1 视图下不上图，故降级为 extra。
const base = require('./_base');
// 车辆清单按 mock 数据中心（MOCK_DATA_CENTER）适配：默认深圳，测试环境北京，生产环境贵州
const { getActiveRegion } = require('../../mock-data');
const region = getActiveRegion();

// WS 逐点推送（extra：需 T1 视图 + dispatchTrack 门禁才上图）
const extraCar1 = base.carSequence('car-track-1', 'WS路径1轨迹推送（需T1视图）', { count: 12, routeIndex: 0, intervalMs: 500 });
extraCar1.tag = 'extra';
const extraCar4 = base.carSequence('car-track-4', 'WS路径4轨迹推送（需T1视图）', { count: 20, routeIndex: 3, intervalMs: 300 });
extraCar4.tag = 'extra';

const scenario = {
  key: 'dispatchTrack',
  label: '跟踪全流程（模拟车辆沿路行驶动画·localStorage）',
  steps: [
    base.connect,
    // 前置：推到 dispatch 门禁（纠缠体 activate 后 mockVehicles 才生效）
    base.pushCallReceived,     // 来电 → inquiry
    base.pushPosition,         // 定位 → popup
    base.pushAddress,          // 画像 → dispatch
    // 核心：localStorage mock 派车 → 单消防站候选路线上图 + 车辆沿路行驶动画
    // 收敛为单车：多队站×多候选路线会放大 setRouteVideoCheckpoints 的路段合并成本，
    // P0 优化后已可承受，但单车演示更稳，避免地图卡顿。
    base.mockVehicles(
      'mock-track',
      '模拟车辆沿路行驶（单消防站路线动画）',
      [
        { vehicleId: 'V-T1', plateNo: region.vehicles[0].plateNo, stationId: region.vehicles[0].stationId, stationName: region.vehicles[0].stationName, vehicleTypeName: '抢险车' },
      ],
    ),
    extraCar1,
    extraCar4,
  ],
};

module.exports = scenario;
