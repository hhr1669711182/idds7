'use strict';
// 历史轨迹回放：共享态 lifecycleStage=closed 触发 VehicleTrackPanel（BFF mock 数据集可切换）
//
// 完整链路（前端自动执行，无需人工干预）：
//   引擎 sharedState 步写 stateLog.lifecycleStage → test-ui 轮询落 localStorage
//   seat-shared-state.currentAlarm = { incidentId, lifecycleStage: 'closed' }
//   → GIS 页 storage 事件 → useUserStore.applySharedState
//   → useDispatchEntangled watcher(onLifecycleStageChange, flush:sync)
//   → markTerminal + clearOriginalIncidentArtifacts
//   → beginVehicleTrack → HTTP queryIncidentTurnoutVehicles
//     （server/mock-ws.js handleBffMock 拦截，按当前 mock 数据集返回）
//   → HTTP queryCarHistoryTrack × 每车 → setMultiTracks + panelVisible=true → 面板出现
//
// mock 数据集（可运行时切换，见 server/mock-ws.js globalThis.__idsMockControl）：
//   withTrack（默认）= 2 车有轨迹 / single = 1 车 / noVehicles = 无出动车辆
//   noTrack = 有车但无轨迹点 / serviceError = 接口 500（降级单车逻辑）
//
// 为什么终态走共享态而非 WS：引擎推 WS 时门禁 stage 未就绪会被 messageStagePolicy 静默丢弃，
// 共享态 watcher 链路绕过该时序（storage 事件后 sync 触发）。写 lifecycleStage='' 可撤销终态。
//
// 验证点（跑完后在 GIS 地图肉眼确认）：
//   core：默认 withTrack → 2 条轨迹 + 面板
//   extra：切换 noTrack → 空态"未查询到历史轨迹数据"；noVehicles → "暂无出动车辆"；切回 withTrack → 恢复
//
const base = require('./_base');

// ── extra 段（仅 full=true 才跑）：切换 mock 数据集测空态降级 ──────────────────
// 每个数据集块 = 切换数据集 → 撤销终态（清旧轨迹）→ 重触发（用新数据集查询）→ 观察
// 同 incidentId 已有轨迹时前端不重查（beginVehicleTrack 幂等），故必须先撤销再重触发。
const datasetCases = [
  { key: 'noTrack', label: '无轨迹点（空态：未查询到历史轨迹数据）', observeMs: 2000 },
  { key: 'noVehicles', label: '无出动车辆（空态：该警情暂无出动车辆）', observeMs: 2000 },
  { key: 'withTrack', label: '恢复正常轨迹（2 车 + 面板）', observeMs: 3000 },
];

const extraSteps = [];
for (const c of datasetCases) {
  const setDs = base.setMockDataset(`track-ds-${c.key}`, `切换 mock 数据集：${c.label}`, c.key, { afterMs: 200 });
  setDs.tag = 'extra';
  const revoke = base.setLifecycleStage(`track-revoke-${c.key}`, '撤销终态（lifecycleStage 清空 → 清旧轨迹）', '', { afterMs: 700 });
  revoke.tag = 'extra';
  const retrigger = base.setLifecycleStage(`track-retrigger-${c.key}`, `重触发终态（lifecycleStage=closed → 用数据集 ${c.key} 查询）`, 'closed', { afterMs: 600 });
  retrigger.tag = 'extra';
  const observe = base.step(`track-observe-${c.key}`, `观察 ${c.label}（${c.observeMs}ms）`, 'wait', { ms: c.observeMs });
  observe.tag = 'extra';
  extraSteps.push(setDs, revoke, retrigger, observe);
}

// ── 场景定义 ──────────────────────────────────────────────────────────────────

const scenario = {
  key: 'trackReplay',
  label: '历史轨迹回放（终态触发 VehicleTrackPanel·BFF mock 数据集可切换）',
  steps: [
    // ① 连接确认
    base.connect,

    // ② 门禁推进：inquiry → popup → dispatch（stateLog 驱动地图进 dispatch 态 + currentAlarm 就绪）
    base.pushCallReceived,           // 来电接听 → inquiry
    base.pushPosition,               // 定位上图 → popup
    base.pushAddress,                // 画像变更 → dispatch

    // ③ 观察窗：确保 dispatch 态落盘 + 前端 currentAlarm 就绪（watcher 依赖 incidentId）
    base.step(
      'track-dispatch-digest',
      '等待 dispatch 态消化（1.5s：stateLog 落盘 + 前端 currentAlarm 就绪）',
      'wait',
      { ms: 1500 },
    ),

    // ④ 终态触发历史轨迹（核心，走共享态 lifecycleStage，默认数据集 withTrack）
    base.setLifecycleStage(
      'track-terminal-closed',
      '终态触发历史轨迹（lifecycleStage=closed → 清空警情产物 + 查询轨迹 + 面板自动打开）',
      'closed',
      { afterMs: 600 },
    ),

    // ⑤ 观察窗：HTTP 往返 + 轨迹渲染 + 面板显示
    base.step(
      'track-render-wait',
      '观察轨迹面板渲染（4s 观察窗：HTTP + OL 渲染 + 面板出现）',
      'wait',
      { ms: 4000 },
    ),

    ...extraSteps,
  ],
};

module.exports = scenario;
