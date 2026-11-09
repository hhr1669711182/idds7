'use strict';
// 跟踪全流程：以车辆 GPS 轨迹为主（多路径循环）；门禁由引擎自动推导 car→dispatchTrack
const base = require('./_base');

const extraSeq = base.carSequence('car-track-4', '路径4轨迹推送（192 点路径）', { count: 20, routeIndex: 3, intervalMs: 300 });
extraSeq.tag = 'extra';

const scenario = {
  key: 'dispatchTrack',
  label: '跟踪全流程（车辆 GPS 轨迹多路径）',
  steps: [
    base.connect,
    base.carSequence('car-track-1', '路径1轨迹推送（31 点）', { count: 12, routeIndex: 0, intervalMs: 500 }),
    base.carSequence('car-track-3', '路径3轨迹推送（84 点）', { count: 12, routeIndex: 2, intervalMs: 500 }),
    extraSeq,
  ],
};

module.exports = scenario;
