'use strict';
// 历史轨迹回放：推终态警情（ARRIVED），前端自动触发 loadVehicleTrack：
//   ① HTTP queryIncidentTurnoutVehicles（mock-ws.js handleBffMock 拦截，返回 2 辆 mock 出动车辆）
//   ② HTTP queryCarHistoryTrack × 每车（mock-ws.js 拦截，按 carId 返回 carPoints[0]/[1] 带 gpsTime）
//   ③ setMultiTracks + panelVisible=true → VehicleTrackPanel 出现（时间轴/倍速/统计/路线切换）
// 不依赖 T1 视图、不依赖 localStorage 注入，BFF mock 层在 :18080 常驻。
const base = require('./_base');

// WS 逐点推送（extra：仅 T1 视图挂载 attachTracking 时才上图，非 T1 视图无效果）
const extraCar1 = base.carSequence('car-track-1', 'WS路径1轨迹推送（需T1视图）', { count: 12, routeIndex: 0, intervalMs: 500 });
extraCar1.tag = 'extra';

const scenario = {
  key: 'trackReplay',
  label: '历史轨迹回放（终态触发 VehicleTrackPanel·BFF mock）',
  steps: [
    base.connect,
    // 前置：推到 dispatch 门禁（纠缠体 activate，历史轨迹链路才监听）
    base.pushCallReceived,     // 来电 → inquiry
    base.pushPosition,         // 定位 → popup
    base.pushAddress,          // 画像 → dispatch
    // 核心：推终态 ARRIVED → handleAlarmStateChanged → markTerminal → beginVehicleTrack
    // → loadVehicleTrack（HTTP 被 BFF mock 拦截）→ 面板自动打开
    base.incidentFlow('track-terminal', '终态触发（ARRIVED → 自动查询并打开历史轨迹面板）', ['ARRIVED'], 800),
    extraCar1,
  ],
};

module.exports = scenario;
