import { defineStore } from 'pinia'
import type { LocateCallData } from '@/controller/core/protocol'

/**
 * 缓存切换到地图页期间收到的来电定位。
 * WebSocket 消息可能早于地图控制器挂载，不能只依赖地图内的瞬时订阅。
 */
export const usePendingCallLocationStore = defineStore(
  'pendingCallLocationStore',
  {
    state: () => ({
      location: null as LocateCallData | null,
    }),

    actions: {
      queue(location: LocateCallData): void {
        this.location = { ...location }
      },

      consume(callId?: string): LocateCallData | null {
        if (callId && this.location?.id !== callId) return null

        const location = this.location
        this.location = null
        return location
      },
    },
  },
)
