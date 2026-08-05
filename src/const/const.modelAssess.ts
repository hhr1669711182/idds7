/*
 * @Description: 模型研判（2.5D 指挥大屏）模块独立常量
 * @FilePath: \ids-gis-web\src\const\const.modelAssess.ts
 */

/* ---------------------- 类型定义 ---------------------- */
export interface SimilarAlarmCardItem {
  id: string
  callId: string
  buildId: string
  incidentId: string
  buildingName: string
  alarmType: string
  similarity: number // 0~100
  address: string
  thumbnail?: string
}

export interface MasterAlarm {
  id: string
  buildingName: string
  address: string
  gps: [number, number]
  totalFloors: number
  buildingHeight: number // 米
  fireFloor: number
  fireHeight: number // 米
  fireLocations: string[] // ['东南角 15F', '西北角 10F']
}

export interface RealtimeFactors {
  totalFloors: number
  buildingHeight: number
  fireFloor: number
  fireHeight: number
  trappedPeople: number
  smokeLevel: string
}

export interface TrappedFloorItem {
  uuid: string
  floor: number
  direction: string
  count: number
}

/* ---------------------- 静态枚举 ---------------------- */
export const SMOKE_LEVELS = ['轻度 (Light)', '中度 (Medium)', '重度 (Heavy)'] as const
export const TRAPPED_DIRS = ['东南角', '西北角', '东北角', '西南角'] as const

/* ---------------------- 样式 token ---------------------- */
export const MA_COLOR = {
  bg: '#0a0e1a',
  bgCard: '#131826',
  bgPanel: '#1a2236',
  border: '#1f2940',
  borderLight: '#2a3556',
  orange: '#ff7a00',
  orangeLight: '#ff9500',
  orangeSoft: 'rgba(255, 122, 0, 0.15)',
  text: '#e6ebf5',
  textDim: '#8a96b0',
  textMuted: '#5b6478',
  red: '#ff4d4f',
  blue: '#3385ff',
  green: '#22c55e',
  yellow: '#fbbf24',
} as const

export const LAYER_TABS = [
  { key: 'composite', label: '综合图层' },
  { key: 'vehicles', label: '消防车辆' },
  { key: 'water', label: '市政水源' },
] as const

export type LayerTabKey = (typeof LAYER_TABS)[number]['key']
