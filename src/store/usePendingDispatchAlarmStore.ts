import { defineStore } from 'pinia';
import { piniaSession } from './piniaPersist'

export type PendingDispatchAlarmProfile = {
  incidentId?: string;
  disaster_address?: string;
  longitude?: number;
  latitude?: number;
  disaster_type?: string;
  incidentState?: string;
  incidentStateName?: string;
  fireBrigade?: any[];
  [key: string]: any;
};

/**
 * 缓存触发 Dispatch1 的警情画像。
 * 消息通常先于路由页面挂载到达，因此不能只依赖页面内的瞬时订阅。
 */
export const usePendingDispatchAlarmStore = defineStore(
  'pendingDispatchAlarmStore',
  {
    state: () => ({
      profile: null as PendingDispatchAlarmProfile | null,
    }),

    actions: {
      queue(profile: PendingDispatchAlarmProfile): void {
        this.profile = {
          ...profile,
          fireBrigade: Array.isArray(profile.fireBrigade)
            ? [...profile.fireBrigade]
            : [],
        };
      },

      consume(incidentId?: string): void {
        if (
          incidentId
          && this.profile?.incidentId
          && this.profile.incidentId !== incidentId
        ) {
          return;
        }
        this.profile = null;
      },
    },

    persist: {
      storage: piniaSession,
      pick: ['profile'],
    },
  },
);

