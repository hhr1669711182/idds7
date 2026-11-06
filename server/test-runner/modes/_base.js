'use strict';
// 步骤标签：core = 全流程必跑；extra = 仅 full=true 时追加
const step = (id, name, type, payload = {}) => ({ id, name, type, tag: payload.tag ?? 'core', ...payload });

/** 前端连接确认（无目标身份时广播匹配） */
const connect = step('connect', '前端 WS 连接确认', 'connect');

/** 来电定位推送（GPS 坐标 + 地址，触发前端定位上图） */
const pushPosition = step('position', '来电定位推送', 'push', {
  kind: 'position',
  options: { lng: 116.4074, lat: 39.9042, tel: '13800138000' },
});

/** 来电接听状态（received） */
const pushCallReceived = step('call-received', '来电接听状态推送', 'push', {
  kind: 'received',
  options: {},
});

/** 地址画像变更（slotChanges 契约） */
const pushAddress = step('address', '地址画像变更推送', 'push', {
  kind: 'address',
  options: { lng: 116.4074, lat: 39.9042 },
});

/** 车辆 GPS 轨迹序列（4 条真实路径之一） */
const carSequence = (id, name, { count = 12, routeIndex = 0, intervalMs = 500 } = {}) =>
  step(id, name, 'seq', { count, routeIndex, intervalMs, options: {} });

/** 警情状态顺序流转 */
const incidentFlow = (id, name, states, holdMs = 800) =>
  step(id, name, 'flow', { states, holdMs, options: {} });

const FULL_INCIDENT_STATES = ['CREATED', 'FORMAL_DISPATCHED', 'DISPATCHED', 'ARRIVED', 'OPERATION_COMPLETED', 'RETURNING', 'RETURNED'];
const CORE_INCIDENT_STATES = ['CREATED', 'FORMAL_DISPATCHED', 'DISPATCHED', 'ARRIVED', 'RETURNED'];

module.exports = {
  step,
  connect,
  pushPosition,
  pushCallReceived,
  pushAddress,
  carSequence,
  incidentFlow,
  FULL_INCIDENT_STATES,
  CORE_INCIDENT_STATES,
};
