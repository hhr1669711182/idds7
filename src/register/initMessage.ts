/*
 * @Author: huanghuanrong
 * @Date: 2026-04-29 16:52:10
 * @LastEditTime: 2026-10-16 14:52:46
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\register\initMessage.ts
 */
import { watch } from 'vue'
import { useMessageStore } from '@/store/useMessageStore'
import { useUserStore } from '@/store/useUserStore'
import { MESSAGE_SYSTEM } from '@/const/const.message.type'
import { appEnv } from '@/config/env'
import {
  buildMessageWebSocketUrl,
  buildPositionUnsubscribe,
  buildPositionSubscription,
  buildScreenSubscription,
  ALARM_CALL_SUBSCRIPTION,
  ALARM_STATE_SUBSCRIPTION,
  CAR_LOCATION_SUBSCRIPTION,
  ADDRESS_UPDATED_SUBSCRIPTION,
} from '@/interceptor/subscriptions'
import { createLogger } from '@/utils/logger'

const logger = createLogger('message-session')

/** 单个 V2 topic 的订阅回执状态；尚未收到回执时为 pending。 */
export interface SubscriptionState {
  topic: string
  result: 'pending' | 'ok' | 'denied'
  reason?: string
}

export interface MessageSessionHandle {
  (): void
  /** 当前会话各 topic 的订阅回执状态，供联调排查静默拒订。 */
  subscriptionStatus: () => SubscriptionState[]
}

export const initMessage = (): MessageSessionHandle => {
  const bus = useMessageStore()
  const user = useUserStore()
  const appCleanups: Array<() => void> = []
  let closeSession: (() => void) | undefined
  /** 连接身份只含 userId + sessionState：席位变更不重建连接（V2 §4.1）。 */
  let connectionKey = ''
  let seatTopic = ''
  const subscriptions = new Map<string, SubscriptionState>()
  let disposed = false

  const resetSubscriptions = (topics: string[]) => {
    subscriptions.clear()
    for (const topic of topics) subscriptions.set(topic, { topic, result: 'pending' })
  }

  const releaseSession = () => {
    closeSession?.()
    closeSession = undefined
    connectionKey = ''
    seatTopic = ''
    subscriptions.clear()
  }

  /** 换席：同连接先退订旧 seat topic，再订阅新 seat topic。 */
  const switchSeat = (seatKey: string) => {
    const nextTopic = seatKey ? `seat/${seatKey}` : ''
    if (nextTopic === seatTopic) return
    const client = bus.wsClients.get(MESSAGE_SYSTEM.IDS_SEAT_WEB)
    if (seatTopic) client?.unsubscribe(seatTopic)
    seatTopic = nextTopic
    if (!nextTopic) return
    subscriptions.set(nextTopic, { topic: nextTopic, result: 'pending' })
    client?.subscribe(nextTopic)
  }

  try {
    if (appEnv.usePostMessage)
      appCleanups.push(
        bus.bindParent({
          system: MESSAGE_SYSTEM.HOST,
          acceptOrigins: [window.location.origin],
        }),
      )
    if (appEnv.useBroadcastChannel)
      appCleanups.push(
        bus.bindBroadcastChannel({
          system: MESSAGE_SYSTEM.HOST,
          name: appEnv.broadcastChannelName || MESSAGE_SYSTEM.HOST,
        }),
      )
    const stop = watch(
      () => user.sharedStateRevision,
      () => {
        if (disposed || !appEnv.useWS) return
        const session = user.accessToken ? user.messageSession : null
        if (!session) {
          releaseSession()
          return
        }
        // 连接身份来自 token（userId + sessionState），与 seat 无关。
        const nextKey = JSON.stringify({
          userId: session.userId,
          sessionState: session.sessionState,
        })
        if (connectionKey === nextKey) {
          switchSeat(session.seatKey)
          return
        }
        releaseSession()
        const configured = appEnv.wsUrl
        const oldTemplate = configured.includes('{userId}') && configured.includes('{sessionState}')
        const url =
          configured && !oldTemplate
            ? configured
            : buildMessageWebSocketUrl(appEnv.messageServiceOrigin || window.location.origin)
        closeSession = bus.connectWebSocket({
          system: MESSAGE_SYSTEM.IDS_SEAT_WEB,
          url,
          socketOptions: {
            heartbeat: true,
            heartbeatInterval: 30000,
            heartbeatMessage: 'ping',
            connectAuth: {
              payload: () => {
                const tenantId = user.tenantId
                return {
                  action: 'connect',
                  token: user.accessToken ?? '',
                  clientId: appEnv.messageClient || 'ids-seat-web',
                  ...(tenantId ? { tenantId } : {}),
                }
              },
            },
            onReady: () => logger.info('V2 鉴权通过，已恢复订阅'),
            onAuthDenied: (reason) => logger.error('V2 鉴权拒绝', { reason }),
            onSubscribeResult: (result) => {
              subscriptions.set(result.topic, {
                topic: result.topic,
                result: result.result,
                ...(result.reason ? { reason: result.reason } : null),
              })
              if (result.result === 'denied') logger.warn('V2 订阅拒绝', result)
              else logger.info('V2 订阅成功', { topic: result.topic })
            },
            initSend: [
              buildScreenSubscription(session.userId),
              ...(session.seatKey ? [buildPositionSubscription(session.seatKey)] : []),
              ALARM_STATE_SUBSCRIPTION,
              ALARM_CALL_SUBSCRIPTION,
              CAR_LOCATION_SUBSCRIPTION,
              ADDRESS_UPDATED_SUBSCRIPTION,
            ],
          },
        })
        connectionKey = nextKey
        seatTopic = session.seatKey ? buildPositionUnsubscribe(session.seatKey) : ''
        resetSubscriptions([
          buildScreenSubscription(session.userId).topic,
          ...(seatTopic ? [seatTopic] : []),
          ALARM_STATE_SUBSCRIPTION.topic,
          ALARM_CALL_SUBSCRIPTION.topic,
          CAR_LOCATION_SUBSCRIPTION.topic,
          ADDRESS_UPDATED_SUBSCRIPTION.topic,
        ])
      },
      { immediate: true, flush: 'sync' },
    )
    appCleanups.push(stop)
  } catch (error) {
    releaseSession()
    appCleanups.reverse().forEach((cleanup) => cleanup())
    throw error
  }
  const dispose: MessageSessionHandle = () => {
    if (disposed) return
    disposed = true
    releaseSession()
    appCleanups.reverse().forEach((cleanup) => cleanup())
  }
  dispose.subscriptionStatus = () => [...subscriptions.values()]
  return dispose
}
