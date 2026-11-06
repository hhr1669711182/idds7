'use strict';
// 调派全流程：接警 → 定位 → 画像 → 派车（多车轨迹）→ 状态流转 → 结案
const base = require('./_base');

const extraFullFlow = base.incidentFlow('incident-flow-full', '警情完整 7 态流转', base.FULL_INCIDENT_STATES, 500);
extraFullFlow.tag = 'extra';
const extraCar2 = base.carSequence('car-track-2', '第二路线车辆轨迹（路径4）', { count: 16, routeIndex: 3, intervalMs: 400 });
extraCar2.tag = 'extra';

const scenario = {
  key: 'dispatch',
  label: '调派全流程（警情→定位→画像→派车→状态流转→结案）',
  steps: [
    base.connect,
    base.pushCallReceived,
    base.pushPosition,
    base.pushAddress,
    base.carSequence('car-track', '出动车辆轨迹推送（路径1）', { count: 16, routeIndex: 0, intervalMs: 400 }),
    base.incidentFlow('incident-flow', '警情状态流转（立案→调派→出动→到场→结案）', base.CORE_INCIDENT_STATES, 800),
    extraFullFlow,
    extraCar2,
  ],
};

module.exports = scenario;
