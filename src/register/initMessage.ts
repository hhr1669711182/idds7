/*
 * @Author: huanghuanrong
 * @Date: 2026-04-29 16:52:10
 * @LastEditTime: 2026-09-20 09:44:12
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\register\initMessage.ts
 */
// src/Control/initMessage.ts
import { useMessageStore } from '@/store/useMessageStore'
import { MESSAGE_SUBSCRIBE_TOPIC, MESSAGE_SYSTEM } from '@/const/const.message.type'
import { useUserStore } from '@/store/useUserStore'
import { watch } from 'vue'

export const initMessage = () => {
  const msgStore = useMessageStore()
  const userStore = useUserStore()
  const { SEAT, ...args } = MESSAGE_SUBSCRIBE_TOPIC


  const isUseWS = import.meta.env.VITE_USE_WS === 'true'
  const isUsePostMessage = import.meta.env.VITE_USE_POSTMESSAGE === 'true'
  const cleanups: Array<() => void> = []

  if (isUsePostMessage) {
    cleanups.push(msgStore.bindParent({
      system: MESSAGE_SYSTEM.HOST,
      acceptOrigins: [window.location.origin],
    }))
  }

  const stopWatch = watch(
    () => [userStore.userId, userStore.sessionId],
    ([userId, sessionId]) => {
      if (userId && sessionId && isUseWS) {
        cleanups.push(msgStore.connectWebSocket({
          system: MESSAGE_SYSTEM.IDS_SEAT_WEB,
          url: `${import.meta.env.VITE_WS_URL}/${MESSAGE_SYSTEM.IDS_SEAT_WEB}/${userId}/${sessionId}`,
          socketOptions: {
            heartbeat: true,
            heartbeatInterval: 30000,
            heartbeatMessage: 'ping',
            initSend: [
              SEAT(),
              ...Object.values(args),
              // type: 'auth', userId: 'hhr' // 单点调试
            ],
          },
        }))
      } else {
        // 退出后断开
        msgStore.disconnectSystem(MESSAGE_SYSTEM.IDS_SEAT_WEB)
        cleanups.forEach(fn => fn())
        cleanups.length = 0
      }
    },
    { immediate: true }
  )

  // 监听座位号变化，刷新座位信息
  const wsRefresh = watch(
    () => userStore.seatNumber,
    (o, n) => o !== n && n && msgStore.wsClients.get(MESSAGE_SYSTEM.IDS_SEAT_WEB)?.send(SEAT),
    { immediate: true }
  )

  return () => {
    // cleanups.forEach(cleanup => cleanup())
    stopWatch()
    wsRefresh()
  }
}