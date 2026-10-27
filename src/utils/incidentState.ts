/**
 * 警情生命周期终态集合：到达、作业完成、返回、结案、战评。
 * 终态警情不再执行原有警情上图（主管队站/周边资源/路径规划）与调派逻辑，
 * 改为执行车辆历史轨迹链路。
 */
export const TERMINAL_INCIDENT_STATES = [
  'ARRIVED',
  'OPERATION_COMPLETED',
  'RETURNED',
  'CLOSED',
  'POST_ACTION_REVIEWED',
] as const

const TERMINAL_STATE_SET: ReadonlySet<string> = new Set(TERMINAL_INCIDENT_STATES)

/** 判断警情状态是否为 5 个终态之一（忽略大小写与首尾空白） */
export const isTerminalIncidentState = (state?: string | null): boolean =>
  TERMINAL_STATE_SET.has(String(state ?? '').trim().toUpperCase())
