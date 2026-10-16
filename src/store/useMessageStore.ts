import { defineStore } from 'pinia'
import { piniaSession } from './piniaPersist'
import { reactive, toRefs } from 'vue'
import {
  MESSAGE_CHANNEL,
  MESSAGE_EVENT_KEY,
  MESSAGE_PROTOCOL_VERSION,
  MESSAGE_SYSTEM,
  type MessageChannel,
  type MessageEventKey,
  type MessageSystem,
} from '@/const/const.message.type'
import type { MessageEnvelope, MessageMetadata } from '@/types/message'
import { createLogger } from '@/utils/logger'
import { WebSocketClient, type WebSocketOptions } from '@/hooks/useWebSocket'
import { BroadcastChannelClient, type BroadcastChannelOptions } from '@/hooks/useBroadcastChannel'
import { interceptorRegistry, installDefaultInterceptors } from '@/interceptor'

type AnyRecord = Record<string, any>
const log = createLogger('message-handler')

type PersistedMessageState = {
  inbox: Record<string, MessageEnvelope<any>[]>
  outbox: Record<string, MessageEnvelope<any>[]>
  lastBySystem: Record<string, MessageEnvelope<any> | null>
  lastByEventKey: Record<string, MessageEnvelope<unknown> | null>
}

type RuntimeState = {
  wsStatus: Record<string, boolean>
  wsError: Record<string, string | null>
}

type Subscription = {
  id: string
  eventKey: string
  system?: MessageSystem
  callback: (envelope: MessageEnvelope) => unknown
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const isEnvelope = (v: any): v is MessageEnvelope<any> =>
  !!v &&
  typeof v === 'object' &&
  v.v === MESSAGE_PROTOCOL_VERSION &&
  typeof v.eventKey === 'string' &&
  typeof v.system === 'string' &&
  typeof v.channel === 'string'

const normalizeLegacy = (raw: any): { eventKey?: MessageEventKey; data?: any } => {
  if (!raw || typeof raw !== 'object') return {}
  if (typeof raw.eventKey === 'string') return { eventKey: raw.eventKey, data: raw.data }
  if (typeof raw.type === 'string') {
    const mapped = (MESSAGE_EVENT_KEY as AnyRecord)[raw.type as string] as MessageEventKey | undefined
    return { eventKey: mapped ?? raw.type, data: raw.payload ?? raw.data }
  }
  return {}
}

export type BindPostMessageOptions = {
  system?: MessageSystem
  acceptOrigins: string[]
}

export type BindWebSocketOptions = {
  system?: MessageSystem
  url: string
  socketOptions?: WebSocketOptions
}

export type BindBroadcastChannelOptions = {
  system?: MessageSystem
  /** 通道名，同源同名的标签页之间互通 */
  name: string
  channelOptions?: BroadcastChannelOptions
}

export type PublishOptions = {
  system: MessageSystem
  channel: MessageChannel
  targetSystem?: MessageSystem
  meta?: MessageMetadata
  targetOrigin?: string
  iframe?: () => HTMLIFrameElement | null | undefined
}

let interceptorsInstalled = false
const ensureInterceptors = () => {
  if (interceptorsInstalled) return
  interceptorsInstalled = true
  installDefaultInterceptors()
}

export const useMessageStore = defineStore(
  'messageStore',
  () => {
    const persisted = reactive<PersistedMessageState>({
      inbox: {},
      outbox: {},
      lastBySystem: {},
      lastByEventKey: {},
    })

    const runtime = reactive<RuntimeState>({
      wsStatus: {},
      wsError: {},
    })

    const wsClients = new Map<MessageSystem, WebSocketClient>()
    const bcClients = new Map<MessageSystem, BroadcastChannelClient>()
    const postMessageHandlers = new Map<MessageSystem, (e: MessageEvent) => void>()
    const subscriptions = new Map<string, Subscription[]>()

    const maxKeep = 100

    const push = (bucket: Record<string, MessageEnvelope<any>[]>, system: MessageSystem, msg: MessageEnvelope<any>) => {
      const list = bucket[system] ?? (bucket[system] = [])
      list.push(msg)
      if (list.length > maxKeep) list.splice(0, list.length - maxKeep)
    }

    const createEnvelope = <T>(
      system: MessageSystem,
      channel: MessageChannel,
      eventKey: MessageEventKey,
      data: T,
      extras?: Pick<MessageEnvelope, 'targetSystem' | 'meta'>,
    ): MessageEnvelope<T> => ({
      v: MESSAGE_PROTOCOL_VERSION,
      id: uid(),
      timestamp: Date.now(),
      system,
      channel,
      eventKey,
      data,
      ...(extras?.targetSystem ? { targetSystem: extras.targetSystem } : null),
      ...(extras?.meta ? { meta: extras.meta } : null),
    })

    const recordInbox = (system: MessageSystem, msg: MessageEnvelope<any>) => {
      push(persisted.inbox, system, msg)
      persisted.lastBySystem[system] = msg
      persisted.lastByEventKey[msg.eventKey] = msg
    }

    const recordOutbox = (system: MessageSystem, msg: MessageEnvelope<any>) => {
      push(persisted.outbox, system, msg)
    }

    const triggerSubscriptions = (eventKey: string, system: MessageSystem, envelope: MessageEnvelope) => {
      const list = subscriptions.get(eventKey) ?? []
      list.forEach((sub) => {
        if (!sub.system || sub.system === system) {
          const report = (error: unknown) =>
            log.error('业务消息处理失败', {
              eventKey,
              system,
              subscriptionId: sub.id,
              error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
            })
          try {
            Promise.resolve(sub.callback(envelope)).catch(report)
          } catch (error) {
            report(error)
          }
        }
      })
    }

    const dispatch = (
      eventKey: MessageEventKey,
      data: unknown,
      system: MessageSystem,
      channel: MessageChannel,
      meta?: MessageMetadata,
    ) => {
      const envelope = createEnvelope(system, channel, eventKey, data, { meta })
      recordInbox(system, envelope)
      triggerSubscriptions(eventKey, system, envelope)
    }

    const subscribe = (eventKey: string, callback: (envelope: MessageEnvelope) => unknown, system?: MessageSystem) => {
      const id = uid()
      const sub: Subscription = { id, eventKey, system, callback }
      const list = subscriptions.get(eventKey) ?? []
      list.push(sub)
      subscriptions.set(eventKey, list)
      return () => unsubscribe(id, eventKey)
    }

    const unsubscribe = (id: string, eventKey: string) => {
      const list = subscriptions.get(eventKey) ?? []
      subscriptions.set(
        eventKey,
        list.filter((s) => s.id !== id),
      )
    }

    /**
     * 入口：拦截器链 -> 多结果分发
     * 拦截器未命中时按 Envelope / Legacy 兼容路径回退。
     */
    const receive = (
      raw: any,
      channel: MessageChannel,
      system: MessageSystem,
      meta?: MessageMetadata,
      acceptLegacy = true,
    ) => {
      ensureInterceptors()

      if (isEnvelope(raw)) {
        const enriched: MessageEnvelope<any> = {
          ...raw,
          channel,
          system,
          ...(meta ? { meta: { ...(raw.meta ?? {}), ...meta } } : null),
        }
        recordInbox(system, enriched)
        triggerSubscriptions(raw.eventKey ?? '', system, enriched)
        return
      }

      const normalized = interceptorRegistry.run(raw, channel, system)
      if (normalized.length) {
        normalized.forEach((item) => {
          dispatch(item.eventKey, item.data, system, channel, { ...(raw?.meta ?? {}), ...meta, ...(item.meta ?? {}) })
        })
        return
      }

      if (!acceptLegacy) return
      const legacy = normalizeLegacy(raw)
      if (!legacy.eventKey) return
      dispatch(legacy.eventKey, legacy.data, system, channel, { ...(raw?.meta ?? {}), ...meta })
    }

    const ingest = (raw: unknown, channel: MessageChannel, system: MessageSystem, meta?: MessageMetadata) =>
      receive(raw, channel, system, meta)

    const bindParent = (options: BindPostMessageOptions) => {
      const system = options.system ?? MESSAGE_SYSTEM.HOST
      const accept = options.acceptOrigins?.length ? new Set(options.acceptOrigins) : null
      const handler = (e: MessageEvent) => {
        if (accept && typeof e.origin === 'string' && !accept.has(e.origin)) return
        if (!e.data) return
        ingest(e.data, MESSAGE_CHANNEL.POST_MESSAGE, system, { origin: e.origin })
      }
      postMessageHandlers.set(system, handler)
      window.addEventListener('message', handler)
      return () => {
        window.removeEventListener('message', handler)
        postMessageHandlers.delete(system)
      }
    }

    const connectWebSocket = (options: BindWebSocketOptions) => {
      const system = options.system ?? MESSAGE_SYSTEM.IDS_SEAT_WEB
      const prev = wsClients.get(system)
      prev?.disconnect()
      const client = new WebSocketClient(options.url, {
        reconnect: true,
        ...options.socketOptions,
        onOpen: (e) => {
          runtime.wsStatus[system] = true
          runtime.wsError[system] = null
          options.socketOptions?.onOpen?.(e)
        },
        onMessage: (d, e) => {
          if (d === undefined || d === null) return
          receive(d, MESSAGE_CHANNEL.WS, system, { readyState: client.ws?.readyState }, false)
          options.socketOptions?.onMessage?.(d, e)
        },
        onError: (e) => {
          runtime.wsError[system] = 'ws error'
          options.socketOptions?.onError?.(e)
        },
        onClose: (e) => {
          runtime.wsStatus[system] = false
          options.socketOptions?.onClose?.(e)
        },
      } satisfies WebSocketOptions)
      wsClients.set(system, client)
      return () => {
        client.disconnect()
        wsClients.delete(system)
        runtime.wsStatus[system] = false
      }
    }

    /**
     * 绑定 BroadcastChannel（同源多标签页互通），复用 useMessageStore 统一收发。
     * 浏览器不会把消息回发给发送方自身，因此这里只处理接收侧。
     */
    const bindBroadcastChannel = (options: BindBroadcastChannelOptions) => {
      const system = options.system ?? MESSAGE_SYSTEM.HOST
      bcClients.get(system)?.disconnect()
      const client = new BroadcastChannelClient(options.name, {
        ...options.channelOptions,
        onMessage: (d, e) => {
          if (d === undefined || d === null) return
          ingest(d, MESSAGE_CHANNEL.BROADCAST_CHANNEL, system, { channelName: options.name })
          options.channelOptions?.onMessage?.(d, e)
        },
      })
      bcClients.set(system, client)
      return () => {
        client.disconnect()
        bcClients.delete(system)
      }
    }

    const publish = <T>(eventKey: MessageEventKey, data: T, options: PublishOptions) => {
      if (options.channel === MESSAGE_CHANNEL.HTTP) return false
      const msg = createEnvelope(options.system, options.channel, eventKey, data, {
        targetSystem: options.targetSystem,
        meta: options.meta,
      })

      recordOutbox(options.system, msg)

      if (options.channel === MESSAGE_CHANNEL.WS) {
        const client = wsClients.get(options.system)
        return !!client?.send(msg)
      }

      if (options.channel === MESSAGE_CHANNEL.POST_MESSAGE) {
        const origin = options.targetOrigin ?? '*'
        if (options.iframe) {
          options.iframe()?.contentWindow?.postMessage(msg, origin)
          return true
        }
        window.parent?.postMessage(msg, origin)
        return true
      }

      if (options.channel === MESSAGE_CHANNEL.BROADCAST_CHANNEL) {
        const client = bcClients.get(options.system)
        return !!client?.send(msg)
      }

      return false
    }

    const clearSystem = (system: MessageSystem) => {
      persisted.inbox[system] = []
      persisted.outbox[system] = []
      persisted.lastBySystem[system] = null
      for (const [eventKey, envelope] of Object.entries(persisted.lastByEventKey)) {
        if (envelope?.system === system) delete persisted.lastByEventKey[eventKey]
      }
    }

    const getLastByEventKey = <T = unknown>(eventKey: string): MessageEnvelope<T> | null =>
      (persisted.lastByEventKey[eventKey] as MessageEnvelope<T> | undefined | null) ?? null

    const clearLastByEventKey = (eventKey: string) => {
      delete persisted.lastByEventKey[eventKey]
    }

    const disconnectSystem = (system: MessageSystem) => {
      wsClients.get(system)?.disconnect()
      wsClients.delete(system)
      runtime.wsStatus[system] = false
      bcClients.get(system)?.disconnect()
      bcClients.delete(system)
      const handler = postMessageHandlers.get(system)
      if (handler) {
        window.removeEventListener('message', handler)
        postMessageHandlers.delete(system)
      }
    }

    return {
      ...toRefs(persisted),
      ...toRefs(runtime),
      wsClients,
      bcClients,
      createEnvelope,
      ingest,
      bindParent,
      connectWebSocket,
      bindBroadcastChannel,
      publish,
      subscribe,
      unsubscribe,
      clearSystem,
      getLastByEventKey,
      clearLastByEventKey,
      disconnectSystem,
    }
  },
  {
    persist: {
      storage: piniaSession,
      pick: ['inbox', 'outbox', 'lastBySystem', 'lastByEventKey'],
    },
  },
)

export { MESSAGE_EVENT_KEY }
