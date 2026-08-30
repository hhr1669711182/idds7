/*
 * @Author: huanghuanrong
 * @Date: 2026-04-29 16:52:10
 * @LastEditTime: 2026-08-28 10:25:26
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\Control\initMessage.ts
 */
// src/Control/initMessage.ts
import { useMessageStore } from '@/store/useMessageStore'
import { MESSAGE_SYSTEM } from '@/const/const.message.type'

export const initMessage = () => {
    const msg = useMessageStore()

    const isUseWS = import.meta.env.VITE_USE_WS === 'true'
    const isUsePostMessage = import.meta.env.VITE_USE_POSTMESSAGE === 'true'
    const cleanups: Array<() => void> = []

    if (isUsePostMessage) {
        cleanups.push(msg.bindParent({
            system: MESSAGE_SYSTEM.HOST,
            acceptOrigins: [
                window.location.origin,
                'http://127.0.0.1:5173',
                'http://localhost:5173',
                'http://192.168.173.79:5172',
                'http://192.168.173.79:5173',
                'http://192.168.173.94:5173',
            ],
        }))
    }

    if (isUseWS && import.meta.env.VITE_WS_URL) {
        cleanups.push(msg.connectWebSocket({
            system: MESSAGE_SYSTEM.DISPATCH,
            url: import.meta.env.VITE_WS_URL,
            socketOptions: {
                heartbeat: true,
                heartbeatInterval: 30000,
                heartbeatMessage: 'ping',
                // 调试使用
                initSend: {
                    type: 'auth', userId: '123' // 单点调试
                }
                // initSend: {
                //     login: 'ids-dev',
                //     passcode: 'Q7mN4pL2xR8k',
                //     host: 'ids',
                // }
            },
        }))
    }

    return () => {
        cleanups.forEach(cleanup => cleanup())
    }
}
