import { computed } from 'vue'
import { useRequest } from './useAlova'
import type { JRAlarmData } from '@/baseComponent/amap/mapData'
import {
  getUnclosedIncidentsMethod,
  type GisOpenState,
  type GisUnclosedIncident,
  type GisUnclosedIncidentList,
} from '@/service/methods/unclosedIncidents'
import { ERROR_CODES, type AppError } from '@/service/error'

/** 处置/到场阶段标红；返程/归队标蓝（与旧即时警情口径对齐） */
const RED_UNCLOSED_STATES = new Set<GisOpenState>([
  'filed',
  'pre_dispatched',
  'formal_dispatched',
  'departed',
  'arrived',
  'operation_completed',
])

const resolveColorType = (state: GisOpenState): 'red' | 'blue' =>
  RED_UNCLOSED_STATES.has(state) ? 'red' : 'blue'

const resolveType = (
  incidentType: GisUnclosedIncident['incidentType'],
): JRAlarmData['type'] => {
  switch (incidentType) {
    case 'fire_rescue':
    case 'fire':
      return 'fire'
    case 'emergency_rescue':
    case 'rescue':
      return 'rescue'
    case 'social_aid':
    case 'society':
      return 'society'
    case 'other':
    case null:
    default:
      return 'society'
  }
}

/**
 * BFF 未结案警情记录 → 图层点要素数据。
 * 仅把接口协议没有登记的字段（问询/画像 ID、队站名等）降级为空值，
 * 展示所需的类型/等级/状态名、地址、坐标均直接来自 BFF。
 */
const toJRAlarmData = (item: GisUnclosedIncident): JRAlarmData | null => {
  const lng = Number(item.longitude)
  const lat = Number(item.latitude)
  if (
    item.longitude == null ||
    item.latitude == null ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat)
  ) {
    return null
  }
  return {
    incidentId: item.incidentId,
    incidentState: item.incidentState,
    incidentStateName: item.incidentStateName,
    disasterType: item.incidentType ?? 'other',
    disasterTypeLabel: item.incidentTypeName ?? '',
    disasterGrade: item.incidentGrade ?? '',
    disasterGradeLabel: item.incidentGradeName,
    disasterAddress: item.address ?? '',
    lng,
    lat,
    inquiryId: '',
    mOrgId: item.leadStationId ?? '',
    mOrgIdLabel: null,
    buildingProfileId: null,
    disasterProfileId: item.incidentId,
    version: 0,
    type: resolveType(item.incidentType),
    colorType: resolveColorType(item.incidentState),
    createdAt: item.alarmTime,
  }
}

/**
 * 401 降级用假数据，保证未登录也能看到图层样例点。
 * 三类警情图标各一条：火灾扑救(fire_rescue→fire)、抢险救援(emergency_rescue→rescue)、社会救助(social_aid→society)；
 * 红=处置中（已立案～作战完成），蓝=返程/归队。
 */
// const FAKE_UNCLOSED_INCIDENTS: GisUnclosedIncident[] = [
//   {
//     incidentId: 'fake-unclosed-fire-001',
//     incidentType: 'fire_rescue',
//     incidentTypeName: '火灾扑救',
//     incidentState: 'arrived',
//     incidentStateName: '到场',
//     alarmTime: new Date().toISOString(),
//     address: '示例地址：科技园高新南六道 16 号',
//     leadOfficerPhone: null,
//     communicatorPhone: null,
//     burningMaterial: null,
//     keyUnitName: null,
//     incidentGrade: 'level_2',
//     incidentGradeName: '二级',
//     longitude: 114.001234,
//     latitude: 22.545678,
//     leadStationId: 'demo-station-001',
//   },
//   {
//     incidentId: 'fake-unclosed-rescue-002',
//     // incidentType: 'emergency_rescue',
//     incidentType: 'other',
//     incidentTypeName: '抢险救援',
//     incidentState: 'departed',
//     incidentStateName: '已出动',
//     alarmTime: new Date().toISOString(),
//     address: '示例地址：蛇口太子路 18 号',
//     leadOfficerPhone: null,
//     communicatorPhone: null,
//     burningMaterial: null,
//     keyUnitName: null,
//     incidentGrade: 'level_1',
//     incidentGradeName: '一级',
//     longitude: 113.976543,
//     latitude: 22.532109,
//     leadStationId: 'demo-station-002',
//   },
//   {
//     incidentId: 'fake-unclosed-society-003',
//     incidentType: 'social_aid',
//     incidentTypeName: '社会救助',
//     incidentState: 'returned',
//     incidentStateName: '归队',
//     alarmTime: new Date().toISOString(),
//     address: '示例地址：西丽留仙大道 2002 号',
//     leadOfficerPhone: null,
//     communicatorPhone: null,
//     burningMaterial: null,
//     keyUnitName: null,
//     incidentGrade: 'level_3',
//     incidentGradeName: '三级',
//     longitude: 113.939876,
//     latitude: 22.576543,
//     leadStationId: 'demo-station-003',
//   },
// ]

const isUnauthorized = (err: unknown): boolean => {
  const e = err as AppError | undefined
  return !!e && (e.code === ERROR_CODES.UNAUTHORIZED || e.status === 401)
}

/** 未结案警情图层数据源：GET /api/v1/gis/unclosed-incidents?kind=unclosed */
export const useUnclosedIncidents = () => {
  const list = useRequest(
    () => getUnclosedIncidentsMethod({ kind: 'unclosed' }),
    { immediate: false },
  )

  /** 开发环境 401 时降级为样例假数据，其余情况取 BFF 原始记录 */
  const records = computed<GisUnclosedIncident[]>(() => {
      console.log('total', list.data.value)

    // if (import.meta.env.DEV && list.error.value && isUnauthorized(list.error.value)) {
    //   return [...FAKE_UNCLOSED_INCIDENTS]
    // }
    return (list.data.value as GisUnclosedIncidentList | undefined)?.records ?? []
  })

  /** 供地图矢量层消费的点要素数据 */
  const alarms = computed<JRAlarmData[]>(() =>
    records.value
      .map((item) => toJRAlarmData(item))
      .filter((d): d is JRAlarmData => d !== null),
  )

  const fetch = () => list.send()

  return {
    alarms,
    records,
    total: computed(() => {
      // if (import.meta.env.DEV && list.error.value && isUnauthorized(list.error.value)) {
      //   return FAKE_UNCLOSED_INCIDENTS.length
      // }
      return (list.data.value as GisUnclosedIncidentList | undefined)?.total ?? 0
    }),
    asOf: computed(() => {
      if (list.error.value && isUnauthorized(list.error.value)) {
        return Date.now()
      }
      return (list.data.value as GisUnclosedIncidentList | undefined)?.asOf ?? 0
    }),
    loading: computed(() => list.loading.value),
    error: computed(() => list.error.value),
    fetch,
  }
}
