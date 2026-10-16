import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeAlarmStateFrame as oldAlarm } from '@/Control/alarmMessage'
import { normalizeAlarmCallFrame as oldAnswer } from '@/Control/alarmCallMessage'
import { normalizeCarLocationFrames as oldGps } from '@/Control/carLocationMessage'
import { normalizePositionFrames as oldPosition } from '@/Control/positionMessage'
import { parseAddressUpdatedContent as oldAddress } from '@/Control/incidentLocationMessage'
import { normalizeAlarmStateFrame } from '@/interceptor/transforms/alarm'
import { normalizeAlarmCallFrame } from '@/interceptor/transforms/alarmCall'
import { normalizeCarLocationFrames } from '@/interceptor/transforms/carLocation'
import { normalizePositionFrames } from '@/interceptor/transforms/position'
import { parseAddressUpdatedContent } from '@/interceptor/transforms/incidentLocation'

vi.mock('@/store', () => ({ useUserStore: () => ({ seatNumber: '8001' }) }))
afterEach(() => vi.restoreAllMocks())

describe('Given 完整旧 Control 纯归一源 When 固定帧 A/B 回放 Then 载荷保持一致（916 迁移回归）', () => {
  it.each([
    {
      topics: [{ type: 'CUSTOM', customType: 'ALARM_INCIDENT', key: 'STATE_CHANGED' }],
      customContent: { data: { incidentId: 'i1' } },
    },
    {
      notifyType: 'ALARM_INCIDENT',
      notifySubType: 'STATE_CHANGED',
      customContent: { data: { incidentId: 'i1', newState: 'CREATED', ext: { arbitrary: 1 } } },
    },
    {
      payload: [
        {
          body: {
            eventName: 'AlarmIncidentStateChangedEvent',
            source: 'ids-alarm-client',
            data: { incidentId: 'i1', newState: 'CREATED' },
          },
        },
      ],
    },
  ])('Given 旧 incident 合法帧 When 新归一 Then data 一致 %j', (frame) => {
    const expected = oldAlarm(frame)
    expect(expected).not.toBeNull()
    expect(normalizeAlarmStateFrame(frame)?.data).toEqual(expected?.data)
  })

  it.each([
    {
      topics: [{ type: 'CUSTOM', customType: 'ALARM_CALL', key: 'ANSWER_STATUS_CHANGED' }],
      customContent: { data: { callId: 'c1' } },
    },
    {
      id: 'record',
      notifyType: 'ALARM_CALL',
      notifySubType: 'ANSWER_STATUS_CHANGED',
      payload: { customContent: { eventId: 'e1', data: { callId: 'c1', ended: true } } },
    },
    [{ customContent: { eventName: 'AlarmCallAnswerStatusChanged', data: { callId: 'c1', answered: true } } }],
  ])('Given 旧 answer 合法帧 When 新归一 Then data 一致 %j', (frame) => {
    expect(normalizeAlarmCallFrame(frame)?.data).toEqual(oldAnswer(frame)?.data)
  })

  it('Given position 多投递体和全部真字段 When 新归一 Then data 一致', () => {
    const body = {
      notifyTypeDto: { notifyType: 'POSITION_SYNC', notifySubType: 'GPS' },
      content: { eventId: 'c1', lng: '0', lat: '0', address: '地址', Carrier_Loc: '基站', tel: '123', ostype: 'ios' },
    }
    const frame = { userMsgBodyList: [body, body] }
    expect(normalizePositionFrames(frame).map((item) => item.data)).toEqual(oldPosition(frame).map((item) => item.data))
  })

  it('Given GPS CloudEvent 和同帧重复点 When 新归一 Then 真字段与去重一致', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const point = {
      carId: ' c1 ',
      plateNumber: ' 粤B1 ',
      longitude: '113.9',
      latitude: '22.5',
      orgId: ' o1 ',
      orgName: ' 机构 ',
      gpsTime: ' time ',
    }
    const frame = { source: 'ids:carlocation', type: 'ids:carlocation:location-sync', data: { datas: [point, point] } }
    expect(normalizeCarLocationFrames(frame).map((item) => item.data)).toEqual(oldGps(frame).map((item) => item.data))
  })

  it.each([
    {
      slots: [
        { slotCode: 'longitude', filledValue: '113.9' },
        { slotCode: 'latitude', filledValue: null },
      ],
    },
    {
      slotChanges: [
        { slotCode: 'longitude', beforeValue: '113.8' },
        { slotCode: 'latitude', afterValue: '22.5' },
      ],
    },
    {
      slots: [{ slotCode: 'longitude', filledValue: '113.9' }],
      slotChanges: [{ slotCode: 'longitude', afterValue: undefined }],
    },
    {
      slots: [{ slotCode: 'm_org_id', filledValue: ' station-1 ' }],
      slotChanges: [{ slotCode: 'm_org_id', afterValue: 'station-2' }],
    },
    {
      slots: [
        { slotCode: 'longitude', filledValue: 'bad' },
        { slotCode: 'disaster_address', filledValue: '' },
      ],
    },
  ])('Given 旧画像 full/delta 边界 When 新解析 Then 与完整源输出一致 %j', (content) => {
    const frame = {
      incidentId: 'i1',
      disasterProfileId: 'p1',
      inquiryId: 'q1',
      eventId: 'e1',
      occurredAt: 'time',
      version: 12,
      ...content,
    }
    expect(parseAddressUpdatedContent(frame)).toEqual(oldAddress(frame))
  })
})
