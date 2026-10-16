import { defineStore } from 'pinia'
import type { LocateCallData } from '@/controller/core/protocol'

/** 来电粗定位统一使用的地图缩放层级。 */
export const INCOMING_CALL_FOCUS_ZOOM = 17

/**
 * 缓存切换到地图页期间收到的来电定位。
 * WebSocket 消息可能早于地图控制器挂载，不能只依赖地图内的瞬时订阅。
 */
export const usePendingCallLocationStore = defineStore('pendingCallLocationStore', {
  state: () => ({
    location: null as LocateCallData | null,
    contextKey: '',
  }),

  actions: {
    queue(location: LocateCallData, contextKey = ''): void {
      this.location = { ...location }
      this.contextKey = contextKey
    },

    /**
     * 当前来电定位在问询 -> 调派切页期间仍是有效状态，只读取、不消费。
     * 它会在挂断，或画像 slotChanges 给出有效经纬度后才被清除。
     */
    getActive(): LocateCallData | null {
      return this.location ? { ...this.location } : null
    },

    consume(callId?: string): LocateCallData | null {
      if (callId && this.location?.id !== callId) return null

      const location = this.location
      this.location = null
      this.contextKey = ''
      return location
    },
  },
  persist: {
    storage: sessionStorage,
    pick: ['location', 'contextKey'],
  },
})
