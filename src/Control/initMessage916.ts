/*
 * @Author: huanghuanrong
 * @Date: 2026-04-29 16:52:10
 * @LastEditTime: 2026-09-17 10:43:38
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\Control\initMessage916.ts
 */
// src/Control/initMessage.ts
import { useMessageStore } from '@/store/useMessageStore916'

import { MESSAGE_EVENT_KEY, MESSAGE_SYSTEM } from '@/const/const.message.type'
import {
    ALARM_STATE_SUBSCRIPTION,
    buildAlarmMessageWebSocketUrl,
    getAlarmMessageSession,
} from '@/Control/alarmMessage'
import { buildPositionSubscription } from '@/Control/positionMessage'
import { CAR_LOCATION_SUBSCRIPTION } from '@/Control/carLocationMessage'
import {
    ALARM_CALL_SUBSCRIPTION,
} from '@/Control/alarmCallMessage'
import { startUnreadCountPolling } from '@/Control/informRecords'//消息中心未读数量
import { ADDRESS_UPDATED_SUBSCRIPTION } from '@/Control/incidentLocationMessage'//画像地址变更（警情定位）
import { createMessageStageGate } from '@/Control/messageStageGate'
import {
    SEAT_SHARED_STATE_KEY,
    SEAT_SHARED_STATE_MOCK_KEY,
} from '@/Control/seatSharedState'
import { createMockCallLocationBridge } from '@/Control/mockCallLocationBridge'
import { createMapMessageHandlers } from '@/Control/mapMessageHandlers'

export const initMessage = () => {
    const msg = useMessageStore()

    const isUseWS = import.meta.env.VITE_USE_WS === 'true'
    const isUsePostMessage = import.meta.env.VITE_USE_POSTMESSAGE === 'true'
    const cleanups: Array<() => void> = []
    const handlers = createMapMessageHandlers()
    const stageGate = createMessageStageGate()
    const mockBridge = createMockCallLocationBridge()
    cleanups.push(() => stageGate.dispose(), msg.setIngressGate(stageGate.accept))

    cleanups.push(startUnreadCountPolling())//消息中心未读数量

    cleanups.push(msg.subscribe(MESSAGE_EVENT_KEY.ALARM_PROFILE_SYNC, handlers.onAlarmProfileSync))
    cleanups.push(msg.subscribe(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, handlers.onLocateCall))
    cleanups.push(msg.subscribe(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL_REMOVE, handlers.onLocateCallRemove))
    cleanups.push(msg.subscribe(MESSAGE_EVENT_KEY.ALARM_CALL_ANSWER_STATUS_CHANGED, handlers.onCallAnswerStatusChanged))
    cleanups.push(msg.subscribe(MESSAGE_EVENT_KEY.ALARM_INCIDENT_STATE_CHANGED, handlers.onIncidentStateChanged))
    // 画像地址变更（警情定位）：订阅消息并写入 store，渲染由 dispatchMap.vue 负责
    cleanups.push(msg.subscribe(MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED, handlers.onAddressUpdated))

    if (isUsePostMessage) {
        cleanups.push(msg.bindParent({
            system: MESSAGE_SYSTEM.HOST,
            acceptOrigins: [window.location.origin],
        }))
    }

    const configuredWsUrl = import.meta.env.VITE_WS_URL?.trim() || ''
    const isSessionTemplate = configuredWsUrl.includes('{userId}')
        && configuredWsUrl.includes('{sessionState}')
    const messageServiceOrigin = import.meta.env.VITE_MESSAGE_SERVICE_ORIGIN?.trim()
        || window.location.origin
    let disconnectWs: (() => void) | undefined
    let connectionKey = ''

    const syncMessageSession = () => {
        if (!isUseWS) return
        const session = getAlarmMessageSession()
        // access_token / sessionId / userId 全部由 useUserStore 同步，不再裸读 localStorage。
        const nextKey = session ? JSON.stringify(session) : ''
        // 业务状态及 Token 刷新不需要重建相同用户、会话和坐席的连接。
        if (nextKey === connectionKey) return
        disconnectWs?.()
        disconnectWs = undefined
        connectionKey = ''
        handlers.reset()
        if (!session) return
        const messageWsUrl = isSessionTemplate
            ? configuredWsUrl
                .replace(/\{userId\}/g, encodeURIComponent(session.userId))
                .replace(/\{sessionState\}/g, encodeURIComponent(session.sessionState))
            : buildAlarmMessageWebSocketUrl(
                messageServiceOrigin, session.userId, session.sessionState,
                import.meta.env.VITE_MESSAGE_CLIENT?.trim() || 'ids-seat-web',
            )
        disconnectWs = msg.connectWebSocket({
            system: MESSAGE_SYSTEM.DISPATCH,
            url: messageWsUrl,
            socketOptions: {
                heartbeat: true,
                heartbeatInterval: 30000,
                heartbeatMessage: 'ping',
                onOpen: () => console.info('[message-ws] 已连接并发送订阅'),
                onError: () => console.error('[message-ws] 连接错误'),
                onClose: (event) => console.warn(
                    '[message-ws] 连接关闭，等待自动重连', { code: event.code },
                ),
                // 未绑席位不订阅 SEAT；重连后恢复当前订阅。
                initSend: [
                    ...(session.seatKey ? [buildPositionSubscription(session.seatKey)] : []),
                    ALARM_CALL_SUBSCRIPTION,
                    ALARM_STATE_SUBSCRIPTION,
                    CAR_LOCATION_SUBSCRIPTION,
                    ADDRESS_UPDATED_SUBSCRIPTION,
                ],
            },
        })
        connectionKey = nextKey
    }

    const onSessionStorage = (event: StorageEvent) => {
        if (event.storageArea !== localStorage) return
        if (event.key === SEAT_SHARED_STATE_KEY || event.key === null) {
            syncMessageSession()
        }
        if (event.key === SEAT_SHARED_STATE_MOCK_KEY || event.key === null) {
            mockBridge.applyMockCallLocation(event.newValue)
        }
    }
    window.addEventListener('storage', onSessionStorage)
    cleanups.push(() => {
        window.removeEventListener('storage', onSessionStorage)
        disconnectWs?.()
        disconnectWs = undefined
    })
    syncMessageSession()
    // blob 持久存在、演示置一次可反复用，晚打开的地图屏初始读也能拿到（§7.1）；
    // 是否真正落地仍由阶段门控按 popup 相位校验。
    mockBridge.applyMockCallLocation(localStorage.getItem(SEAT_SHARED_STATE_MOCK_KEY), true)

    return () => {
        cleanups.forEach(cleanup => cleanup())
    }
}
