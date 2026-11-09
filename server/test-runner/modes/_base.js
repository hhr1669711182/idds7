'use strict';
// 步骤契约（供引擎按 kind 推导门禁目标态 + test-ui 轮询增量写 seat-shared-state）：
//   - tag：core / extra（extra 仅 full=true 追加）
//   - kind（push）：报文类型。引擎据 kind 推导前端门禁所需 stage（见 index.js KIND_STAGE），
//     再反推「可写 stored-state」（phase + currentAlarm），写入 report.stateLog。
//   - 展示模式状态同步链：引擎记 stateLog → test-ui 轮询增量写 seat-shared-state
//     （phase / mode / currentAlarm）→ GIS 页 storage 事件 → useUserStore.applySharedState
//     → useLayersStore + messageStagePolicy 门禁热更新。
//   - statePhase（可选覆盖）：必须是「可写 MapPhase」（popup|inquiry|dispatchTrack|onDuty）。
//     注意：前端 stage 'dispatch' 不可直接写 phase，须 phase='inquiry' + currentAlarm.incidentId 推导得出；
//     直接写 phase='dispatch' 会让 getSharedMapStage 返回 null，之后所有消息被门禁丢弃。
//   - stateAlarm（可选覆盖）：'current'（本 run incidentId）/ null（清空 currentAlarm）/ 省略（引擎按 kind 自动）。
//   - mode（可选）：特灾业务轴（如 'flood'），与 phase 一并写 seat-shared-state.mode（不影响门禁 stage，门禁只看 phase+currentAlarm）。
//   - afterMs：步骤 PASS 后「地图交互观察窗」（ms），引擎 sleep，让地图逐帧可见。
//   - seq（car）：intervalMs 为点间真实等待（引擎逐点 sleep）。
//   - flow（incident）：holdMs 为态间真实等待；states 为警情状态序列。
const step = (id, name, type, payload = {}) => ({ id, name, type, tag: payload.tag ?? 'core', ...payload });

/** 前端连接确认（无目标身份时广播匹配） */
const connect = step('connect', '前端 WS 连接确认', 'connect');

/** 来电接听（received）→ 前端 stage inquiry（phase='inquiry' + currentAlarm=null） */
const pushCallReceived = step('call-received', '来电接听状态推送', 'push', {
  kind: 'received',
  options: {},
  afterMs: 1200,
});

/** 来电定位（position）→ 前端 stage popup（phase='popup'）；seat 与 test-ui 默认坐席对齐 */
const pushPosition = step('position', '来电定位推送', 'push', {
  kind: 'position',
  options: { lng: 116.4074, lat: 39.9042, tel: '13800138000', seat: '3003' },
  afterMs: 1200,
});

/** 地址画像变更（address）→ 前端 stage dispatch（phase='inquiry' + currentAlarm.incidentId） */
const pushAddress = step('address', '地址画像变更推送', 'push', {
  kind: 'address',
  options: { lng: 116.4074, lat: 39.9042 },
  afterMs: 1200,
});

/** 来电结束（end / CALL_TERMINATED）→ 前端 stage inquiry（phase='inquiry' + currentAlarm=null） */
const pushCallEnded = step('call-ended', '来电结束推送（CALL_TERMINATED）', 'push', {
  kind: 'end',
  options: {},
  afterMs: 1200,
});

/** 车辆 GPS 轨迹序列（car）→ 前端 stage dispatchTrack（phase='dispatchTrack'）；intervalMs 为点间真实等待 */
const carSequence = (id, name, { count = 12, routeIndex = 0, intervalMs = 500, mode = null, afterMs = 800 } = {}) =>
  step(id, name, 'seq', { count, routeIndex, intervalMs, mode, afterMs, options: {} });

/** 警情状态顺序流转（incident）→ 前端 stage dispatch（phase='inquiry' + currentAlarm.incidentId）；态间 holdMs 真实等待 */
const incidentFlow = (id, name, states, holdMs = 800, mode = null, afterMs = 800) =>
  step(id, name, 'flow', { states, holdMs, mode, afterMs, options: {} });

/** 给已有步骤叠加特灾业务轴（flood）：仅追加 mode，phase/currentAlarm 仍由引擎按 kind 推导 */
const withMode = (s, modeStr) => ({ ...s, mode: modeStr });

const FULL_INCIDENT_STATES = ['CREATED', 'FORMAL_DISPATCHED', 'DISPATCHED', 'ARRIVED', 'OPERATION_COMPLETED', 'RETURNING', 'RETURNED'];
const CORE_INCIDENT_STATES = ['CREATED', 'FORMAL_DISPATCHED', 'DISPATCHED', 'ARRIVED', 'RETURNED'];

module.exports = {
  step,
  withMode,
  connect,
  pushPosition,
  pushCallReceived,
  pushCallEnded,
  pushAddress,
  carSequence,
  incidentFlow,
  FULL_INCIDENT_STATES,
  CORE_INCIDENT_STATES,
};
