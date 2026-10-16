export const buildPositionSubscription = (seatKey = '8001') =>
  ({
    action: 'subscribe',
    topic: `seat/${seatKey}`,
  }) as const

/** 屏订阅自己的收件箱；屏在 V2 中不再特殊，就是一个普通 topic。 */
export const buildScreenSubscription = (userId: string, screenName = 'map') =>
  ({
    action: 'subscribe',
    topic: `user/${userId}/screen/${screenName}`,
  }) as const

export const buildPositionUnsubscribe = (seatKey: string) => `seat/${seatKey}`

export const ALARM_STATE_SUBSCRIPTION = {
  action: 'subscribe',
  topic: 'ALARM_INCIDENT/STATE_CHANGED',
} as const

export const ALARM_CALL_SUBSCRIPTION = {
  action: 'subscribe',
  topic: 'ALARM_CALL/ANSWER_STATUS_CHANGED',
} as const

export const CAR_LOCATION_SUBSCRIPTION = {
  action: 'subscribe',
  topic: 'GPS_MSG/car-location-broadcast-all',
} as const

export const ADDRESS_UPDATED_SUBSCRIPTION = {
  action: 'subscribe',
  topic: 'DISASTER_PROFILE/UPDATED',
} as const

export const buildMessageWebSocketUrl = (serviceOrigin: string) => {
  const origin = serviceOrigin.trim().replace(/\/+$/g, '')
  if (!origin) return ''
  const wsOrigin = origin.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:')
  const base = /\/message-client$/i.test(wsOrigin) ? wsOrigin : `${wsOrigin}/message-client`
  return `${base}/ws`
}
