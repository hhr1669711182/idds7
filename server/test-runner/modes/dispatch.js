'use strict';
// 调派全流程：接警 → 定位 → 画像 → 派车（多车轨迹）→ 状态流转 → 结案
// 门禁由引擎按 kind 自动推导；carSequence 走 dispatchTrack，incidentFlow 走 dispatch。
// 车辆清单按 mock 数据中心（MOCK_DATA_CENTER）适配：默认深圳，测试环境北京，生产环境贵州
const base = require('./_base');
const { getActiveRegion } = require('../../mock-data');
const region = getActiveRegion();

const extraFullFlow = base.incidentFlow('incident-flow-full', '警情完整 7 态流转', base.FULL_INCIDENT_STATES, 500);
extraFullFlow.tag = 'extra';
const extraCar2 = base.carSequence('car-track-2', '第二路线车辆轨迹（路径4）', { count: 16, routeIndex: 3, intervalMs: 400 });
extraCar2.tag = 'extra';

const scenario = {
  key: 'dispatch',
  label: '调派全流程（警情→定位→画像→派车→状态流转→结案）',
  steps: [
    base.connect,
    base.pushCallReceived,     // 来电 → inquiry
    base.pushPosition,         // 定位 → popup
    base.pushAddress,          // 画像 → dispatch
    base.mockVehicles(
      'mock-vehicles',
      '模拟派车清单（单消防站候选上图 + 沿路行驶动画）',
      [
        { vehicleId: 'V-1', plateNo: region.vehicles[0].plateNo, stationId: region.vehicles[0].stationId, stationName: region.vehicles[0].stationName, vehicleTypeName: '抢险车' },
      ],
    ),
    base.carSequence('car-track', '出动车辆轨迹推送（路径1）', {
      count: 16,
      routeIndex: 0,
      intervalMs: 400,
    }),
    base.incidentFlow('incident-flow', '警情状态流转（立案→调派→出动→到场→结案）', base.CORE_INCIDENT_STATES, 800),
    extraFullFlow,
    extraCar2,
  ],
};

module.exports = scenario;
