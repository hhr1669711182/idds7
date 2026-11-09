'use strict';
// 值守全流程：定位 → 画像 → 来电接听（值守态以定位上图为主）
// 门禁由引擎按 kind 自动推导：received→inquiry / position→popup / address→dispatch。
const base = require('./_base');

const scenario = {
  key: 'onDuty',
  label: '值守全流程（定位→画像→来电）',
  steps: [
    base.connect,
    base.pushCallReceived,   // 来电 → inquiry
    base.pushPosition,       // 定位 → popup
    base.pushAddress,        // 画像 → dispatch
    base.incidentFlow('incident-core', '警情核心状态流转', base.CORE_INCIDENT_STATES, 600),
  ],
};

module.exports = scenario;
