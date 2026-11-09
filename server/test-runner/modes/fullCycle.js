'use strict';
// 全生命周期：值守→来电→接警问询→调派→跟踪→回归值守等下一警
// 门禁由引擎按 kind 自动推导（received→inquiry / position→popup / address·incident→dispatch / car→dispatchTrack）；
// 节奏：各业务步推送前同步门禁态，PASS 后 sleep(afterMs)，seq 点间真实 sleep(intervalMs)。

const base = require('./_base');

// ── extra 段（仅 full=true 才跑）────────────────────────────────────────────
// 结案归位：7 态完整流转（incident 门禁自动推导 dispatch）；onDuty 复位交由后续 regression-wait 步承担
const closeFlow = base.incidentFlow('incident-close', '结案归位（7 态完整）', base.FULL_INCIDENT_STATES, 500, null, 500);
closeFlow.tag = 'extra';

const callEnded = base.step('call-ended', '来电结束推送（CALL_TERMINATED）', 'push', {
  kind: 'end',
  options: {},
  afterMs: 1200,
  tag: 'extra',
});

const regressionWait = base.step('regression-wait', '等待前端回归值守（1.5s 观察窗口）', 'wait', {
  ms: 1500,
  statePhase: 'onDuty', // 纯状态迁移：复位值守
  tag: 'extra',
});

const secondCall = base.step('second-call-received', '第二通来电（系统已就绪，等待下一警）', 'push', {
  kind: 'received',
  options: {},
  afterMs: 1200,
  tag: 'extra',
});

const scenario = {
  key: 'fullCycle',
  label: '全生命周期（值守→来电→问询→调派→跟踪→回归值守）',
  steps: [
    // ① 值守接警（onDuty → popup）
    base.connect,
    base.pushCallReceived, // 来电（RECEIVED）→ inquiry
    base.pushPosition,     // 定位上图 → popup

    // ② 接警问询（dispatch 门禁）：画像变更 + 立案
    base.pushAddress,
    base.incidentFlow('incident-filed', '立案（CREATED）', ['CREATED'], 600),

    // ③ 调派（dispatch）：派车 + 出动 + 车辆轨迹
    base.incidentFlow(
      'incident-dispatch',
      '调派→出动（FORMAL_DISPATCHED → DISPATCHED）',
      ['FORMAL_DISPATCHED', 'DISPATCHED'],
      800,
    ),
    base.carSequence('car-route1', '出动车辆轨迹（路径 1，16 点）', {
      count: 16,
      routeIndex: 0,
      intervalMs: 400,
    }),

    // ④ 跟踪（dispatchTrack）：到场 + 跟踪轨迹
    base.incidentFlow('incident-arrived', '到场（ARRIVED）', ['ARRIVED'], 500),
    base.carSequence('car-route4', '跟踪车辆轨迹（路径 4，12 点）', {
      count: 12,
      routeIndex: 3,
      intervalMs: 300,
    }),

    // ⑤ 归队（主段结束）
    base.incidentFlow('incident-returning', '归队（RETURNING）', ['RETURNING'], 500),

    // ⑥ 回归值守（extra：full 才跑）：完整 7 态 → 结案 → 来电结束 → 等待 → 下一警
    closeFlow,
    callEnded,
    regressionWait,
    secondCall,
  ],
};

module.exports = scenario;
