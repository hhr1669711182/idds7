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

/**
 * 警情详情接口实时拉取，禁用 Alova 响应缓存；错误由调用方提示。
 * 响应数据格式与归一化由调用方（IncidentDetailDialog.vue）定义，经泛型标注。
 */
export const fetchIncidentDetail = <T>(incidentId: string) =>
  alovaInstance.Get<T>(`/bff-client/api/v1/gis/incidents/${encodeURIComponent(incidentId)}/detail`, {
    cacheFor: 0,
    meta: { showError: false },
  })
