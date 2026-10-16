import { MESSAGE_EVENT_KEY as KEY } from '@/const/const.message.type'

export const replayPosition = {
  content: {
    taskType: 'weizhiwang',
    eventid: 'call-1',
    lng: '113.9',
    lat: '22.5',
    latLngType: 'GPS',
    time: '2026-10-15T12:00:00Z',
    tel: '123',
    ostype: 'ios',
    address: '测试地址',
    Carrier_Loc: '定位来源',
  },
}

export const replayGps = {
  datas: [
    {
      carId: ' car-1 ',
      plateNumber: ' 粤B1 ',
      orgId: ' org-1 ',
      orgName: ' 队站 ',
      longitude: '113.9',
      latitude: '22.5',
      gpsTime: ' 2026-10-15T12:00:00Z ',
    },
  ],
}

export const replayAnswer = {
  customContent: {
    eventId: 'answer-1',
    eventName: 'AlarmCallAnswerStatusChanged',
    source: 'ids-call-client',
    data: {
      callId: 'call-1',
      incidentId: 'incident-1',
      previousState: 'RINGING',
      newState: 'ANSWERED',
      answered: true,
      ended: false,
      changedAt: '2026-10-15T12:00:00Z',
      channel: 'phone',
      extension: null,
    },
  },
}

export const replayIncident = {
  customContent: {
    eventId: 'incident-event-1',
    eventName: 'AlarmIncidentStateChangedEvent',
    source: 'ids-alarm-client',
    data: {
      incidentId: 'incident-1',
      previousState: null,
      previousStateName: null,
      newState: 'CREATED',
      newStateName: '已立案',
      inquiryIds: ['inquiry-1'],
      primaryIncidentId: 'incident-1',
      changedAt: '2026-10-15T12:00:00Z',
      dataSource: 'seat',
      sourceId: 'source-1',
      reconciliation: false,
      ext: { alarmAddr: { longitude: 113.9, latitude: 22.5, fullAddr: '测试地址' }, custom: { value: null } },
    },
  },
}

export const replayAddress = {
  notifyType: 'disaster_profile',
  notifySubType: 'updated',
  customContent: {
    eventId: 'address-1',
    incidentId: 'incident-1',
    disasterProfileId: 'profile-1',
    inquiryId: 'inquiry-1',
    occurredAt: '2026-10-15T12:00:00Z',
    version: 3,
    slots: [
      { slotCode: 'disaster_address', filledValue: '测试地址' },
      { slotCode: 'longitude', filledValue: '113.9' },
      { slotCode: 'latitude', filledValue: '22.5' },
      { slotCode: 'm_org_id', filledValue: 'station-1' },
    ],
  },
}

export const replayAddressbot = {
  notifyType: 'addressbot',
  customContent: {
    event_type: 'AddressLocationUpdated',
    raw_text: '测试地址',
    incident_id: 'incident-1',
    address: { name: '测试地址', longitude: 113.9, latitude: 22.5 },
    candidates: [],
    extension: null,
  },
}

export const replayProfile = {
  payload: {
    eventType: KEY.ALARM_PROFILE_SYNC,
    data: { incidentId: 'incident-1', disaster_address: '测试地址', longitude: null, latitude: null, fireBrigade: [] },
  },
}

export const replayFamilies = [
  { name: 'F7 addressbot', frame: replayAddressbot, eventKey: KEY.ADDRESS_ROBOT_GIS_SEARCH },
  { name: 'F4 position', frame: replayPosition, eventKey: KEY.MAP_LOCATE_CALL },
  { name: 'F6 GPS', frame: replayGps, eventKey: KEY.TRACKING_VEHICLE_GPS_UPDATE },
  { name: 'F3 answer', frame: replayAnswer, eventKey: KEY.ALARM_CALL_ANSWER_STATUS_CHANGED },
  { name: 'F2 incident', frame: replayIncident, eventKey: KEY.ALARM_INCIDENT_STATE_CHANGED },
  { name: 'F1 address', frame: replayAddress, eventKey: KEY.DISASTER_PROFILE_ADDRESS_UPDATED },
] as const

export const replayWrappers = ['request', 'data', 'body', 'message', 'payload', 'userMsgBodyList'] as const
