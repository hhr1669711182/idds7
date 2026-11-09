'use strict';
// 弹窗态（popup 阶段）：来电 + 定位 + 画像 + 接听状态（弹窗以轻量数据为主）
// 门禁由引擎按 kind 自动推导：received→inquiry / position→popup / address→dispatch。
const base = require('./_base');

const scenario = {
  key: 'popup',
  label: '弹窗态（来电→定位→画像→接听状态）',
  steps: [
    base.connect,
    base.pushCallReceived, // 来电 → inquiry
    base.pushPosition,     // 定位 → popup
    base.pushAddress,      // 画像 → dispatch
  ],
};

module.exports = scenario;
