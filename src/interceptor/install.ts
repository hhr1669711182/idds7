/**
 * 默认拦截器装配入口
 *
 * 顺序：
 *   seat(50) → addressbot(100) → position(110) → GPS(120)
 *   → answer(130) → incident(140) → address(150) → T1(900)
 *
 * SEAT 订阅的 key 依赖 useUserStore().seatNumber，本函数必须在 Pinia 激活后调用。
 * 返回 uninstall 整体注销
 */

import { interceptorRegistry } from './registry'
import { setSeatSubscribe, seatInterceptor } from './transforms/seat'
import { alarmInterceptor } from './transforms/alarm'
import { alarmCallInterceptor } from './transforms/alarmCall'
import { carLocationInterceptor } from './transforms/carLocation'
import { positionInterceptor } from './transforms/position'
import { addressRobotInterceptor } from './transforms/addressRobot'
import { incidentLocationInterceptor } from './transforms/incidentLocation'
import { t1Interceptor } from './transforms/t1'
import { MESSAGE_EVENT_KEY, MESSAGE_SUBSCRIBE_TOPIC, type MessageEventKey } from '@/const/const.message.type'
import { normalizeBusinessFrames } from './transforms/business'
import type { InterceptorContext, MessageInterceptor, NormalizedMessage } from './types'

let installed = false

export const installDefaultInterceptors = (): (() => void) => {
  if (installed) return () => {}
  installed = true

  // SEAT 订阅需要运行时取 seatNumber
  setSeatSubscribe({
    ...MESSAGE_SUBSCRIBE_TOPIC.SEAT(),
    dispatch: 'multi',
  })

  const normalizedByContext = new WeakMap<InterceptorContext, NormalizedMessage[]>()
  const ordered = (interceptor: MessageInterceptor, eventKey: MessageEventKey): MessageInterceptor => ({
    ...interceptor,
    transform: (ctx) => {
      let results = normalizedByContext.get(ctx)
      if (!results) {
        results = normalizeBusinessFrames(ctx.raw)
        normalizedByContext.set(ctx, results)
      }
      const matched = results[0]?.eventKey === eventKey
      return { matched, results: matched ? results : [], stop: true }
    },
  })
  const unregisters = [
    interceptorRegistry.register(seatInterceptor),
    interceptorRegistry.register(ordered(addressRobotInterceptor, MESSAGE_EVENT_KEY.ADDRESS_ROBOT_GIS_SEARCH)),
    interceptorRegistry.register(ordered(positionInterceptor, MESSAGE_EVENT_KEY.MAP_LOCATE_CALL)),
    interceptorRegistry.register(ordered(carLocationInterceptor, MESSAGE_EVENT_KEY.TRACKING_VEHICLE_GPS_UPDATE)),
    interceptorRegistry.register(ordered(alarmCallInterceptor, MESSAGE_EVENT_KEY.ALARM_CALL_ANSWER_STATUS_CHANGED)),
    interceptorRegistry.register(ordered(alarmInterceptor, MESSAGE_EVENT_KEY.ALARM_INCIDENT_STATE_CHANGED)),
    interceptorRegistry.register(
      ordered(incidentLocationInterceptor, MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED),
    ),
    interceptorRegistry.register(t1Interceptor),
  ]
  return () => {
    unregisters.forEach((fn) => fn())
    installed = false
  }
}
