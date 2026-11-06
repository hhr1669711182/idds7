'use strict';
// 值守全流程：定位 → 画像 → 来电接听（值守态以定位上图为主）
const base = require('./_base');

const scenario = {
  key: 'onDuty',
  label: '值守全流程（定位→画像→来电）',
  steps: [
    base.connect,
    base.pushCallReceived,
    base.pushPosition,
    base.pushAddress,
    base.incidentFlow('incident-core', '警情核心状态流转', base.CORE_INCIDENT_STATES, 600),
  ],
};

module.exports = scenario;
