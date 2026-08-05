/*
 * @Description: 模型研判模块静态 mock 数据（不污染全局 store）
 * @FilePath: \ids-gis-web\src\views\modelAssess\mock.ts
 */
import type { SimilarAlarmCardItem, MasterAlarm, TrappedFloorItem } from '@/const/const.modelAssess'

/* 顶部 4 张相似警情卡片 */
export const SIMILAR_CARDS_MOCK: SimilarAlarmCardItem[] = [
  {
    id: 'S1',
    callId: 'STANDBY',
    buildId: 'B001',
    incidentId: 'INC001',
    buildingName: '南山软件园一期6栋',
    alarmType: '火灾扑救',
    similarity: 88,
    address: '深圳市南山区高新南一道软件园一期6栋A座',
  },
  {
    id: 'S2',
    callId: 'STANDBY',
    buildId: 'B001',
    incidentId: 'INC002',
    buildingName: '南山软件园一期6栋',
    alarmType: '火灾扑救',
    similarity: 94,
    address: '深圳市南山区高新南一道软件园一期6栋B座',
  },
  {
    id: 'S3',
    callId: 'STANDBY',
    buildId: 'B002',
    incidentId: 'INC003',
    buildingName: '南山软件园一期5栋',
    alarmType: '自动喷淋',
    similarity: 70,
    address: '深圳市南山区高新南一道软件园一期5栋',
  },
  {
    id: 'S4',
    callId: 'STANDBY',
    buildId: 'B003',
    incidentId: 'INC004',
    buildingName: '南山软件园一期7栋',
    alarmType: '紧急救援',
    similarity: 71,
    address: '深圳市南山区高新南一道软件园一期7栋',
  },
]
/* 主警情（COMMAND MASTER） */
export const MASTER_ALARM_MOCK: MasterAlarm = {
  id: 'M1',
  buildingName: '南山软件园一期6栋',
  address: '深圳市南山区高新南一道软件园一期6栋',
  gps: [121.4725, 31.2305],
  totalFloors: 32,
  buildingHeight: 96,
  fireFloor: 15,
  fireHeight: 45,
  fireLocations: ['东南角 15F', '西北角 10F'],
}

/* 初始受困楼层 */
export const TRAPPED_FLOORS_MOCK: TrappedFloorItem[] = [
  { uuid: 'T1', floor: 15, direction: '东南角', count: 5 },
  { uuid: 'T2', floor: 10, direction: '西北角', count: 10 },
]
