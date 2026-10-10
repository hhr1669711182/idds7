/*
 * @Author: huanghuanrong
 * @Date: 2026-04-29 16:52:10
 * @LastEditTime: 2026-10-10 17:10:27
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\register\initMessage.ts
 */
// src/Control/initMessage.ts
import { useMessageStore } from '@/store/useMessageStore'
import { MESSAGE_SUBSCRIBE_TOPIC, MESSAGE_SYSTEM } from '@/const/const.message.type'
import { useUserStore } from '@/store/useUserStore'
import { appEnv } from '@/config/env'
import { watch } from 'vue'

export const initMessage = () => {
  const msgStore = useMessageStore()
  const userStore = useUserStore()
  const { SEAT, ...args } = MESSAGE_SUBSCRIBE_TOPIC


  const isUseWS = import.meta.env.VITE_USE_WS === 'true'
  const isUsePostMessage = import.meta.env.VITE_USE_POSTMESSAGE === 'true'
  const isUseBroadcastChannel = appEnv.useBroadcastChannel
  const cleanups: Array<() => void> = []

  if (isUsePostMessage) {
    cleanups.push(msgStore.bindParent({
      system: MESSAGE_SYSTEM.HOST,
      acceptOrigins: [window.location.origin],
    }))
  }

  if (isUseBroadcastChannel) {
    cleanups.push(msgStore.bindBroadcastChannel({
      system: MESSAGE_SYSTEM.HOST,
      name: appEnv.broadcastChannelName || MESSAGE_SYSTEM.HOST,
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
              // {"action":"connected","userId":"8a56a473-...","sessionState":"fff24f08-...","clientId":"{clientId}"}
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
    cleanups.forEach(cleanup => cleanup())
    cleanups.length = 0
    stopWatch()
    wsRefresh()
  }
}
