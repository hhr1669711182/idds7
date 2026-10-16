import { describe, expect, it } from 'vitest'
import { normalizeIncidentLocationContent, toAddressUpdatedData } from '@/service/incidentLocation'

describe('F1/F11/F13 common profile normalization', () => {
  it('Given 纯 delta When before/after 均缺省 Then 跳过槽位且保留显式 null/非空 before；回归 F1 P2', () => {
    const result = normalizeIncidentLocationContent({
      incidentId: 'A',
      version: 2,
      slotChanges: [
        { slotCode: 'longitude' },
        { slotCode: 'latitude', beforeValue: undefined, afterValue: undefined },
        { slotCode: 'disaster_address', beforeValue: '旧地址' },
        { slotCode: 'm_org_id', beforeValue: 'primary', afterValue: null },
      ],
    })
    expect(result?.data.slots).toEqual({ disaster_address: '旧地址', m_org_id: null })
  })

  it('Given 全量 slots When delta 显式 null Then null 覆盖且不退回 beforeValue；回归 F1 清空', () => {
    const result = normalizeIncidentLocationContent({
      incidentId: 'A',
      version: 2,
      slots: [{ slotCode: 'longitude', filledValue: '113' }],
      slotChanges: [{ slotCode: 'longitude', beforeValue: '113', afterValue: null }],
    })
    expect(result).toMatchObject({ snapshotKind: 'full', data: { longitude: null, slots: { longitude: null } } })
  })

  it('Given delta 未携带坐标 When 只有地址更新 Then 保留缺席与清空的区别；回归 F1 累计快照', () => {
    const result = normalizeIncidentLocationContent({
      incidentId: 'A',
      version: 3,
      slotChanges: [{ slotCode: 'disaster_address', afterValue: '新地址' }],
    })
    expect(result).toMatchObject({ snapshotKind: 'delta', data: { slots: { disaster_address: '新地址' } } })
    expect(result?.data.slots).not.toHaveProperty('longitude')
  })

  it('Given HTTP full When filledValue 为空 Then 转换与 relay 相同且全量空槽位可接受；回归 F13', () => {
    expect(toAddressUpdatedData({ incidentId: 'A', version: 4, slots: [] })).toMatchObject({
      slots: {},
      longitude: null,
    })
    expect(
      normalizeIncidentLocationContent({ incidentId: 'A', slots: [{ slotCode: 'm_org_id', filledValue: ' station ' }] })
        ?.data.primaryStationId,
    ).toBe('station')
  })

  it('Given 非法 version 或槽位 When 归一 Then 拒绝输入；回归 F11 非法包不占水位', () => {
    expect(normalizeIncidentLocationContent({ incidentId: 'A', version: -1, slots: [] })).toBeNull()
    expect(normalizeIncidentLocationContent({ incidentId: 'A', version: 'bad', slots: [] })).toBeNull()
    expect(normalizeIncidentLocationContent({ incidentId: 'A', slots: 'bad' })).toBeNull()
  })
})
