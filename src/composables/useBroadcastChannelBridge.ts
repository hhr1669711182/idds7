export interface BroadcastChannelBridge {
  send: (data: unknown) => void
  listen: (listener: (event: MessageEvent) => void) => () => void
  close: () => void
  dispose: () => void
}

export const createBroadcastChannelBridge = (name: string): BroadcastChannelBridge => {
  let channel: BroadcastChannel | null = new BroadcastChannel(name)
  const listeners = new Set<(event: MessageEvent) => void>()

  const listen = (listener: (event: MessageEvent) => void): (() => void) => {
    if (!channel) return () => {}
    channel.addEventListener('message', listener)
    listeners.add(listener)
    return () => {
      channel?.removeEventListener('message', listener)
      listeners.delete(listener)
    }
  }

  const close = () => {
    if (!channel) return
    listeners.forEach((listener) => channel?.removeEventListener('message', listener))
    listeners.clear()
    channel.close()
    channel = null
  }

  return { send: (data) => channel?.postMessage(data), listen, close, dispose: close }
}
