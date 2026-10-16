import { describe, expect, it, vi } from 'vitest'
import { toDispatchAlarmProfile as legacy } from '@/Control/alarmMessage'
import { toDispatchAlarmProfile } from '@/service/alarmProfile'
import type { AlarmIncidentStateData } from '@/controller/core/protocol/LegacyMessageProtocol'

vi.mock('@/store', () => ({ useUserStore: () => ({ seatNumber: '8001' }) }))

describe('警情画像转换迁移（回归 F2 缺省字段）', () => {
  it.each([
    undefined,
    {},
    { alarmAddr: { fullAddr: '地址', longitude: '114', latitude: '22' } },
    { disasterAddress: '', longitude: 0, latitude: 0, disasterType: '火灾' },
  ])('Given 旧链支持的画像 %j When 转换 Then 保留值及缺省语义', (ext) => {
    const data: AlarmIncidentStateData = { incidentId: 'incident', newState: 'CREATED', ext }
    expect(toDispatchAlarmProfile(data)).toEqual(legacy(data))
  })
})
