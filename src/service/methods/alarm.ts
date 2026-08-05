import { alovaInstance } from '../alova'
import type { PageResult } from './types'

export type AlarmItem = {
  id: string
  incidentId: string
  incidentState?: string
  incidentStateName?: string
  level: string
  address: string
  status: string
  createdAt: string
}

export type AlarmListParams = {
  page?: number
  size?: number
  state?: string
  stateFrom?: string
  stateTo?: string
  keyword?: string
  startTime?: string
  endTime?: string
  primaryIncidentId?: string
  inquiryId?: string
  unclosed?: boolean
}

export type DisasterProfileItem = {
  disasterProfileId: string
  incidentId: string
  inquiryId: string
  buildingProfileId: string | null
  disasterAddress: string
  longitude: number | null
  latitude: number | null
  disasterType: string
  disasterTypeLabel: string
  disasterGrade: string
  disasterGradeLabel: string | null
  mOrgId: string
  mOrgIdLabel: string | null
  version: number
}

export type DisasterProfileQuery = {
  incidentIds: string[]
}

export type GetAlarmAllDetailDTO = {
  currentPage: number
  pageSize: number
  query: DisasterProfileQuery
}

export type AlarmListResult = {
  records: AlarmItem[]
  total: number
  page: number
  size: number
}

export const listAlarmMethod = (params: AlarmListParams) =>
  alovaInstance.Get<AlarmListResult, AlarmListParams>(
    'alarm-client/api/alarm-incidents',
    {
      params: params,
      meta: { cacheFor: 30 * 1000, showError: true }
    },
  )

export const getAlarmAllDetailMethod = (
  incidentIds: string[],
  currentPage = 1,
  pageSize = 100000
) => {
  return alovaInstance.Post<PageResult<DisasterProfileItem>, GetAlarmAllDetailDTO>(
    'disaster-profile-client/api/disaster-profiles/page',
    {
      currentPage,
      pageSize,
      query: { incidentIds },
    },
    { meta: { cacheFor: 30 * 1000, showError: true } }
  )
}
