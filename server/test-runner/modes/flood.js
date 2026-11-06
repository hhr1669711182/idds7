'use strict';
// 洪涝全流程：洪涝态（V8 中 flood 为独立 LayerViewMode，值当前同 dispatch）
// 以定位 + 警情状态 + 单车轨迹为主
const base = require('./_base');

const scenario = {
  key: 'flood',
  label: '洪涝全流程（定位→警情状态→车辆轨迹）',
  steps: [
    base.connect,
    base.pushCallReceived,
    base.pushPosition,
    base.pushAddress,
    base.carSequence('car-track', '洪涝区车辆轨迹推送（路径2）', { count: 12, routeIndex: 1, intervalMs: 500 }),
    base.incidentFlow('incident-core', '警情核心状态流转', base.CORE_INCIDENT_STATES, 600),
  ],
};

module.exports = scenario;
