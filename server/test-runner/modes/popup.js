'use strict';
// 弹窗态（popup 阶段）：来电 + 定位 + 画像 + 接听状态（弹窗以轻量数据为主）
const base = require('./_base');

const scenario = {
  key: 'popup',
  label: '弹窗态（来电→定位→画像→接听状态）',
  steps: [
    base.connect,
    base.pushCallReceived,
    base.pushPosition,
    base.pushAddress,
  ],
};

module.exports = scenario;
