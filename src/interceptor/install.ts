/**
 * 默认拦截器装配入口
 *
 * 顺序：
 *   seat(150)        SEAT 泛订阅，二次分发到多个内部 eventKey
 *   alarm / alarmCall / carLocation (200)  CUSTOM 三段订阅
 *
 * SEAT 订阅的 key 依赖 useUserStore().seatNumber，本函数必须在 Pinia 激活后调用。
 * 返回 uninstall 整体注销
 */

import { interceptorRegistry } from './registry'
import { setSeatSubscribe, seatInterceptor } from './transforms/seat'
import { alarmInterceptor } from './transforms/alarm'
import { alarmCallInterceptor } from './transforms/alarmCall'
import { carLocationInterceptor } from './transforms/carLocation'
import { MESSAGE_SUBSCRIBE_TOPIC } from '@/const/const.message.type'

let installed = false

export const installDefaultInterceptors = (): (() => void) => {
  if (installed) return () => {}
  installed = true

  // SEAT 订阅需要运行时取 seatNumber
  setSeatSubscribe({
    ...MESSAGE_SUBSCRIBE_TOPIC.SEAT(),
    dispatch: 'multi',
  })

  const unregisters = [
    interceptorRegistry.register(seatInterceptor),
    interceptorRegistry.register(alarmInterceptor),
    interceptorRegistry.register(alarmCallInterceptor),
    interceptorRegistry.register(carLocationInterceptor),
  ]
  return () => {
    unregisters.forEach(fn => fn())
    installed = false
  }
}