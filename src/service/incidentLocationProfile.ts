import { alovaInstance } from '@/service/alova'
import type { IncidentProfileData } from '@/controller/core/protocol/IncidentLocationProtocol'

/**
 * 凭证与链路头由 alovaInstance 的 beforeRequest 统一注入（service/authHeaders），
 * 调用方不再手工拼头，也不传原始快照。
 */
export const fetchIncidentLocationProfile = (incidentId: string) =>
  alovaInstance.Get<IncidentProfileData>(
    `/bff-client/api/v1/inquiry/profiles/by-incident/${encodeURIComponent(incidentId)}`,
    { cacheFor: 0, meta: { showError: false } },
  )
