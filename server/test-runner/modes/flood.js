'use strict';
// 洪涝全流程：洪涝态（V8 中 flood 为独立 LayerViewMode，值当前同 dispatch）
// 以定位 + 警情状态 + 单车轨迹为主；每步叠加 mode: 'flood'（特灾业务轴），随 phase 一并写 seat-shared-state。
// 门禁（stage）仍由引擎按 kind 自动推导；mode 不影响门禁，仅写 seat-shared-state.mode。
const base = require('./_base');

const scenario = {
  key: 'flood',
  label: '洪涝全流程（定位→警情状态→车辆轨迹）',
  steps: [
    base.connect,
    base.withMode(base.pushCallReceived, 'flood'),   // 来电 → inquiry / flood
    base.withMode(base.pushPosition, 'flood'),        // 定位 → popup / flood
    base.withMode(base.pushAddress, 'flood'),         // 画像 → dispatch / flood
    base.withMode(
      base.carSequence('car-track', '洪涝区车辆轨迹推送（路径2）', { count: 12, routeIndex: 1, intervalMs: 500 }),
      'flood',
    ),
    base.withMode(
      base.incidentFlow('incident-core', '警情核心状态流转', base.CORE_INCIDENT_STATES, 600),
      'flood',
    ),
  ],
};

module.exports = scenario;
