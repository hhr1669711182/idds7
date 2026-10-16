import type { AlarmIncidentStateData } from '@/controller/core/protocol/LegacyMessageProtocol'
import type { PendingDispatchAlarmProfile } from '@/store/usePendingDispatchAlarmStore'

export const toDispatchAlarmProfile = (data: AlarmIncidentStateData): PendingDispatchAlarmProfile => {
  const ext = data.ext ?? {}
  const addressValue = ext.alarmAddr ?? ext.alarmAddress
  const address =
    addressValue && typeof addressValue === 'object' && !Array.isArray(addressValue)
      ? (addressValue as Record<string, unknown>)
      : {}
  const disasterAddress = address.fullAddr ?? address.address ?? ext.disaster_address ?? ext.disasterAddress
  return {
    ...ext,
    incidentId: data.incidentId,
    disaster_address: typeof disasterAddress === 'string' ? disasterAddress : undefined,
    longitude: Number(address.longitude ?? ext.longitude),
    latitude: Number(address.latitude ?? ext.latitude),
    disaster_type: String(ext.disaster_type ?? ext.disasterType ?? '警情'),
    incidentState: data.newState,
    incidentStateName: data.newStateName,
    fireBrigade: Array.isArray(ext.fireBrigade) ? ext.fireBrigade : [],
    alarmState: data,
  }
}
