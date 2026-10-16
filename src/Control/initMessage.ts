/*
 * @Author: huanghuanrong
 * @Date: 2026-04-29 16:52:10
 * @LastEditTime: 2026-07-08 13:51:33
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\Control\initMessage.ts
 */
// src/Control/initMessage.ts
import { useMessageStore } from '@/store/useMessageStore'

import { MESSAGE_EVENT_KEY, MESSAGE_SYSTEM } from '@/const/const.message.type'
import {
    // ALARM_STATE_SUBSCRIPTION,
    buildMessageWebSocketUrl,
    getAlarmMessageSession,
} from '@/Control/alarmMessage'
import { buildPositionSubscription } from '@/Control/positionMessage'
import { CAR_LOCATION_SUBSCRIPTION } from '@/Control/carLocationMessage'
// import {
//     ALARM_CALL_SUBSCRIPTION,
// } from '@/Control/alarmCallMessage'
import { ADDRESS_UPDATED_SUBSCRIPTION } from '@/Control/incidentLocationMessage'//画像地址变更（警情定位）
import { createMessageStageGate } from '@/Control/messageStageGate'
import {
    SEAT_SHARED_STATE_KEY,
    SEAT_SHARED_STATE_MOCK_KEY,
    getSharedAccessToken,
    getSharedTenantId,
} from '@/Control/seatSharedState'
import { createMockCallLocationBridge } from '@/Control/mockCallLocationBridge'
import { createMapMessageHandlers } from '@/Control/mapMessageHandlers'
import { createIncidentLocationProfileSync } from '@/Control/incidentLocationProfileSync'
import { createMapRelayReader } from '@/Control/mapRelayReader'
import { createGisPointChannel } from '@/Control/gisPointChannel'
import router from '@/router'
import { ROUTE_NAMES } from '@/router/constants'

export const initMessage = () => {
    const msg = useMessageStore()

    const isUseWS = import.meta.env.VITE_USE_WS === 'true'
    const isUsePostMessage = import.meta.env.VITE_USE_POSTMESSAGE === 'true'
    const cleanups: Array<() => void> = []
    const handlers = createMapMessageHandlers()
    const stageGate = createMessageStageGate()
    const mockBridge = createMockCallLocationBridge()
    // @migration-retained：旧装配仅保留对照，准入已迁至 App 级 messageStagePolicy。
    // cleanups.push(() => stageGate.dispose(), msg.setIngressGate(stageGate.accept))
    cleanups.push(() => stageGate.dispose())

    cleanups.push(msg.subscribe(MESSAGE_EVENT_KEY.ALARM_PROFILE_SYNC, handlers.onAlarmProfileSync))
    cleanups.push(msg.subscribe(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL, handlers.onLocateCall))
    cleanups.push(msg.subscribe(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL_REMOVE, handlers.onLocateCallRemove))
    cleanups.push(msg.subscribe(MESSAGE_EVENT_KEY.ALARM_CALL_ANSWER_STATUS_CHANGED, handlers.onCallAnswerStatusChanged))
    cleanups.push(msg.subscribe(MESSAGE_EVENT_KEY.ALARM_INCIDENT_STATE_CHANGED, handlers.onIncidentStateChanged))
    // 画像地址变更（警情定位）：订阅消息并写入 store，渲染由 dispatchMap.vue 负责
    cleanups.push(msg.subscribe(MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED, handlers.onAddressUpdated))
    // 警情定位 HTTP 补充来源：监听 currentAlarm.incidentId 变化拉取画像全量定位
    cleanups.push(createIncidentLocationProfileSync(handlers.onAddressUpdated))
    // 实时消息转发通道（契约 §8）：BroadcastChannel ids-map-screen-relay 读侧接入，
    // 消费 host 转发的 disaster_profile（§8.3.1）/POSITION_SYNC（§8.3.2）白名单事件，
    // 复用 handlers.onAddressUpdated / handlers.onLocateCall，App 级常驻
    cleanups.push(createMapRelayReader()) // 不要删，先注释掉，演示后根据需求开启
    // GIS 地图选点 BroadcastChannel（ids-gis-point-selection，对接受理席 gis-point-selection 协议 V1.0）
    // 接收 PICK_START → 投递 MOCK_INCIDENT_RELOCATE → dispatchMap 激活选点交互
    cleanups.push(createGisPointChannel())
    cleanups.push(() => handlers.dispose())

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
        const nextKey = session ? JSON.stringify(session) : ''
        // 业务状态及 Token 刷新不需要重建相同用户、会话和坐席的连接。
        if (nextKey === connectionKey) return
        disconnectWs?.()
        disconnectWs = undefined
        connectionKey = ''
        handlers.reset()
        if (!session) return
        // V2：VITE_WS_URL 为完整单入口；为空或仍是旧 {userId}/{sessionState} 模板时，按 origin 派生
        const messageWsUrl = configuredWsUrl && !isSessionTemplate
            ? configuredWsUrl
            : buildMessageWebSocketUrl(messageServiceOrigin)
        const clientId = import.meta.env.VITE_MESSAGE_CLIENT?.trim() || 'ids-seat-web'
        console.info('[message-ws] 连接地址', messageWsUrl, session.seatKey)
        disconnectWs = msg.connectWebSocket({
            system: MESSAGE_SYSTEM.IDS_SEAT_WEB,
            url: messageWsUrl,
            socketOptions: {
                heartbeat: true,
                heartbeatInterval: 30000,
                heartbeatMessage: 'ping',
                // V2：打开后首帧发 CONNECT 用 JWT 鉴权；函数形式使自动重连读取最新 token
                connectAuth: {
                    payload: () => {
                        const tenantId = getSharedTenantId()
                        return {
                            action: 'connect',
                            token: getSharedAccessToken() ?? '',
                            clientId,
                            ...(tenantId ? { tenantId } : {}),
                        }
                    },
                },
                onReady: () => console.info('[message-ws] V2 鉴权通过，已恢复订阅'),
                onAuthDenied: (reason) => console.error('[message-ws] 鉴权被拒', reason),
                onSubscribeResult: (r) => {
                    if (r.result === 'denied') console.warn('[message-ws] 订阅被拒', r)
                },
                onError: () => console.error('[message-ws] 连接错误'),
                onClose: (event) => console.warn(
                    '[message-ws] 连接关闭，等待自动重连', { code: event.code },
                ),
                // V2：鉴权通过后发送，断连自动清理、重连自动重订阅。
                // - user/{userId}/screen/map：地图屏专用收件箱（指南 §3.2）
                // - GPS_MSG/car-location-broadcast-all：旧 CUSTOM(GPS_MSG / car-location-broadcast-all)
                //   按指南 §7.2 翻译的层级 topic（全量车辆位置广播）；
                //   指南 §6 的 vehicle/positions 待后端发布侧切换后再迁移。
                initSend: [
                    { action: 'subscribe', topic: `user/${session.userId}/screen/map` },
                    ...(session.seatKey ? [buildPositionSubscription(session.seatKey)] : []),
                    // ALARM_CALL_SUBSCRIPTION, // 来电接听状态变更订阅
                    // ALARM_STATE_SUBSCRIPTION, // 警情定位似乎已弃用（马驭）
                    // 只订阅实时车辆这一个，演示后再解封
                    CAR_LOCATION_SUBSCRIPTION,
                    ADDRESS_UPDATED_SUBSCRIPTION, // 画像地址变更（警情定位）槽位变更
                ],
            },
        })
        connectionKey = nextKey
    }

    const onSessionStorage = (event: StorageEvent) => {
        console.log('[sessionStorage]', event.key, event && JSON.parse(event.newValue || ''))
        if (event.storageArea !== localStorage) return
        if (event.key === SEAT_SHARED_STATE_KEY || event.key === null) {
            syncMessageSession()
            // 特殊地图（mode 字段在 seat-shared-state）：
            // mode=flood → 进入特殊地图并清空；mode 非 flood 或不存在 → 退出特灾模式（清除上图数据）
            // 仅在从 flood 切出时投 clear，避免非 flood 场景空转
            let wasFlood = false
            let isFlood = false
            try {
                wasFlood = JSON.parse(event.oldValue ?? 'null')?.mode === 'flood'
            } catch { /* ignore */ }
            try {
                isFlood = JSON.parse(event.newValue ?? 'null')?.mode === 'flood'
            } catch { /* ignore */ }
            // 已在特灾模式中（old/new 均为 flood）：仅 phase 等状态变化，
            // 不重新清空、不清除来电定位
            if (wasFlood && isFlood) return
            const triggered = mockBridge.applySpecialMapRenderFromSharedState(event.newValue)
            if (triggered) {
                if (router.currentRoute.value.name !== ROUTE_NAMES.DISPATCH1) {
                    router.replace({ name: ROUTE_NAMES.DISPATCH1 })
                }
            } else if (wasFlood) {
                // 从特灾模式切出：清除特殊地图上图数据
                mockBridge.applySpecialMapExit()
            }
        }
        if (event.key === SEAT_SHARED_STATE_MOCK_KEY || event.key === null) {
            console.log("haomanfan")
            // 模拟调派：受理席调派成功写入 dispatchVehicles，桥接给地图屏
            // 校验队站匹配后触发模拟实时跟踪（注入型，见契约 §7.2/§7.3）
            if (event.newValue?.includes('dispatchVehicles')) {
                mockBridge.applyMockDispatchVehicles(event.newValue)
                return
            }

            // 特殊地图车辆模拟：flood.dispatchCommand 存在且非空对象时触发
            if (event.newValue?.includes('flood')) {
                mockBridge.applyMockSpecialMap(event.newValue)
                return
            }

            // 特殊地图灾害点渲染：disasterSite 有值时触发（前提 mode=flood 已清空）
            if (event.newValue?.includes('disasterSite')) {
                mockBridge.applyMockDisasterSite(event.newValue)
                return
            }

            // 添加判断是模拟来电定位还是模拟调派车辆
            if (event.newValue?.includes('callLocation')) {
                console.log("模拟来电定位", event.newValue)
                mockBridge.applyMockCallLocation(event.newValue)
                return
            }

        }

        // 警情二次定位已迁移到 BroadcastChannel('ids-gis-point-selection')，
        // 见 createGisPointChannel()，不再监听 localStorage
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

    // F5 刷新：检查 seat-shared-state 的 mode=flood，设 pending 标志
    // router 守卫已负责从 /map 切到 /dispatch1，dispatchMap 挂载后消费 pending 渲染
    mockBridge.applySpecialMapRenderFromSharedState(localStorage.getItem(SEAT_SHARED_STATE_KEY))

    return () => {
        cleanups.forEach(cleanup => cleanup())
    }
}
