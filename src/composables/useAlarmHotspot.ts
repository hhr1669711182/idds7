import { computed } from 'vue'
import { useRequest } from './useAlova'
import {
  listAlarmMethod,
  getAlarmAllDetailMethod,
  type DisasterProfileItem,
  type AlarmListResult,
  type AlarmItem,
} from '@/service/methods/alarm'
import type { JRAlarmData } from '@/baseComponent/amap/mapData'
import type { PageResult } from '@/service/methods/types'

const RED_INCIDENT_STATES = new Set([
  'CREATED',
  'PRE_DISPATCHED',
  'FORMAL_DISPATCHED',
  'DISPATCHED',
  'ARRIVED',
  'OPERATION_COMPLETED',
])

const BLUE_INCIDENT_STATES = new Set([
  'RETURNING',
  'RETURNED',
  'CLOSED',
])

const resolveColorType = (state?: string): JRAlarmData['colorType'] => {
  if (!state) return 'red'
  if (RED_INCIDENT_STATES.has(state)) return 'red'
  if (BLUE_INCIDENT_STATES.has(state)) return 'blue'
  return 'red'
}

const resolveDisasterType = (raw: string): JRAlarmData['type'] => {
  switch (raw) {
    case 'FIRE':
      return 'fire'
    case 'RESCUE':
      return 'rescue'
    default:
      return 'society'
  }
}

type AlarmListRef = Pick<
  AlarmItem,
  'incidentState' | 'incidentStateName' | 'createdAt'
>

const toJRAlarmData = (
  item: DisasterProfileItem,
  ref: AlarmListRef,
): JRAlarmData | null => {
  if (item.longitude == null || item.latitude == null) return null
  return {
    incidentId: item.incidentId,
    incidentState: ref.incidentState,
    incidentStateName: ref.incidentStateName,
    disasterType: item.disasterType,
    disasterTypeLabel: item.disasterTypeLabel,
    disasterGrade: item.disasterGrade,
    disasterGradeLabel: item.disasterGradeLabel,
    disasterAddress: item.disasterAddress,
    lng: Number(item.longitude),
    lat: Number(item.latitude),
    inquiryId: item.inquiryId,
    mOrgId: item.mOrgId,
    mOrgIdLabel: item.mOrgIdLabel,
    buildingProfileId: item.buildingProfileId,
    disasterProfileId: item.disasterProfileId,
    version: item.version,
    type: resolveDisasterType(item.disasterType),
    colorType: resolveColorType(ref.incidentState),
    createdAt: ref.createdAt,
  }
}

const emptyListResult: PageResult<DisasterProfileItem> = {
  list: [],
  total: 0,
  page: 1,
  pageSize: 0,
}

export const useAlarmHotspot = () => {
  const list = useRequest(
    () => listAlarmMethod({ stateFrom: 'CREATED', stateTo: 'CLOSED' }),
    { immediate: false },
  )

  const detail = useRequest(
    (incidentIds: string[]) => getAlarmAllDetailMethod(incidentIds),
    { immediate: false },
  )

  list.onSuccess(async (ev) => {
    const data = ev.data as AlarmListResult | undefined
    const records = data?.records ?? []
    const ids = records.map((r) => r.incidentId).filter(Boolean)
    if (ids.length) {
      await detail.send(ids)
    } else {
      detail.update({ data: emptyListResult })
    }
  })

  const alarms = computed<JRAlarmData[]>(() => {
    const items = (detail.data.value?.list ?? []) as DisasterProfileItem[]
    const refByIncidentId: Record<string, AlarmListRef> = {}
    const records = (list.data.value as AlarmListResult | undefined)?.records ?? []
    records.forEach((r) => {
      if (!r?.incidentId) return
      refByIncidentId[r.incidentId] = {
        incidentState: r.incidentState,
        incidentStateName: r.incidentStateName,
        createdAt: r.createdAt,
      }
    })
    return items
      .map((item) => toJRAlarmData(item, refByIncidentId[item.incidentId] ?? {}))
      .filter((d): d is JRAlarmData => d !== null)
  })

  const fetch = () => list.send()

  return {
    alarms,
    loading: computed(() => list.loading.value || detail.loading.value),
    error: computed(() => list.error.value ?? detail.error.value),
    fetch,
  }
}
