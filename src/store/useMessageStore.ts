import { defineStore } from 'pinia'
import { reactive, toRefs } from 'vue'
import {
  // LEGACY_MESSAGE_TYPE_MAP,
  MESSAGE_CHANNEL,
  MESSAGE_EVENT_KEY,
  MESSAGE_PROTOCOL_VERSION,
  MESSAGE_SYSTEM,
  // type LegacyMessageType,
  type MessageChannel,
  type MessageEventKey,
  type MessageSystem,
} from '@/const/const.message.type'
import type { MessageEnvelope } from '@/types/message'
import { WebSocketClient, type WebSocketOptions } from '@/hooks/useWebSocket'

type AnyRecord = Record<string, any>

type PersistedMessageState = {
  inbox: Record<string, MessageEnvelope<any>[]>
  outbox: Record<string, MessageEnvelope<any>[]>
  lastBySystem: Record<string, MessageEnvelope<any> | null>
}

type RuntimeState = {
  wsStatus: Record<string, boolean>
  wsError: Record<string, string | null>
}

type Subscription = {
  id: string
  eventKey: string
  system?: MessageSystem
  callback: (envelope: MessageEnvelope) => void
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
    // const mapped = (LEGACY_MESSAGE_TYPE_MAP as AnyRecord)[raw.type as LegacyMessageType] as MessageEventKey | undefined
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

export type PublishOptions = {
  system: MessageSystem
  channel: MessageChannel
  targetSystem?: MessageSystem
  meta?: Record<string, any>
  targetOrigin?: string
  iframe?: () => HTMLIFrameElement | null | undefined
}

export const useMessageStore = defineStore(
  'messageStore',
  () => {
    const persisted = reactive<PersistedMessageState>({
      inbox: {},
      outbox: {},
      lastBySystem: {},
    })

    const runtime = reactive<RuntimeState>({
      wsStatus: {},
      wsError: {},
    })

    const wsClients = new Map<MessageSystem, WebSocketClient>()
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
    }

    const recordOutbox = (system: MessageSystem, msg: MessageEnvelope<any>) => {
      push(persisted.outbox, system, msg)
    }

    const subscribe = (
      eventKey: string,
      callback: (envelope: MessageEnvelope) => void,
      system?: MessageSystem,
    ) => {
      const id = uid()
      const sub: Subscription = { id, eventKey, system, callback }
      const list = subscriptions.get(eventKey) ?? []
      list.push(sub)
      subscriptions.set(eventKey, list)
      return () => unsubscribe(id, eventKey)
    }

    const unsubscribe = (id: string, eventKey: string) => {
      const list = subscriptions.get(eventKey) ?? []
      subscriptions.set(eventKey, list.filter(s => s.id !== id))
    }

    const ingest = (raw: any, channel: MessageChannel, system: MessageSystem, meta?: AnyRecord) => {
      if (isEnvelope(raw)) {
        recordInbox(system, { ...raw, channel, system, ...(meta ? { meta: { ...(raw.meta ?? {}), ...meta } } : null) })
        triggerSubscriptions(raw.eventKey ?? '', system, raw)
        return
      }

      const legacy = normalizeLegacy(raw)
      if (!legacy.eventKey) return

      const envelope = createEnvelope(system, channel, legacy.eventKey, legacy.data, { meta })
      recordInbox(system, envelope)
      triggerSubscriptions(legacy.eventKey, system, envelope)
    }

    const triggerSubscriptions = (eventKey: string, system: MessageSystem, envelope: MessageEnvelope) => {
      const list = subscriptions.get(eventKey) ?? []
      list.forEach(sub => {
        if (!sub.system || sub.system === system) {
          try { sub.callback(envelope) } catch { /* 不阻塞其他订阅者 */ }
        }
      })
    }

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
      const system = options.system ?? MESSAGE_SYSTEM.DISPATCH
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
          const { payload } = d;
          if (!payload) return
          let data = { ...payload, eventKey: payload.eventType ?? '' }
          console.log('2233', data, e)

          ingest(data, MESSAGE_CHANNEL.WS, system, { readyState: (client.ws as any)?.readyState })
          options.socketOptions?.onMessage?.(data, e)
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

    const publish = <T>(eventKey: MessageEventKey, data: T, options: PublishOptions) => {
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

      return false
    }

    const clearSystem = (system: MessageSystem) => {
      persisted.inbox[system] = []
      persisted.outbox[system] = []
      persisted.lastBySystem[system] = null
    }

    const disconnectSystem = (system: MessageSystem) => {
      wsClients.get(system)?.disconnect()
      wsClients.delete(system)
      runtime.wsStatus[system] = false
      const handler = postMessageHandlers.get(system)
      if (handler) {
        window.removeEventListener('message', handler)
        postMessageHandlers.delete(system)
      }
    }

    return {
      ...toRefs(persisted),
      ...toRefs(runtime),

      createEnvelope,
      ingest,
      bindParent,
      connectWebSocket,
      publish,
      subscribe,
      unsubscribe,
      clearSystem,
      disconnectSystem,
    }
  },
  {
    persist: {
      storage: sessionStorage,
      pick: ['inbox', 'outbox', 'lastBySystem'],
    },
  },
)

export { MESSAGE_EVENT_KEY }
