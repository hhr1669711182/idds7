/*
 * @Author: ljh
 * @Date: 2026-08-27 10:30:08
 * @LastEditTime: 2026-08-27 10:39:46
 * @LastEditors: ljh
 * @Description: Dispatch1 页面独立地图状态，避免图层选择污染原 dispatch 页面。
 * @FilePath: src\store\useDispatch1MapStore.ts
 */
import { defineStore } from 'pinia';
import { piniaSession } from './piniaPersist'
import type Map from 'ol/Map';

export interface Dispatch1MapState {
  map: Map | null;
  checkedIds: string[];
}

export const useDispatch1MapStore = defineStore('dispatch1MapStore', {
  state: (): Dispatch1MapState => ({
    map: null,
    checkedIds: ['gis:view_res_org_dept', 'gis:view_juris_zone'],
  }),
  actions: {
    setMap(map: Map) {
      this.map = map;
    },
    setCheckedIds(ids: string[]) {
      this.checkedIds = [...new Set(ids)];
    },
  },
  persist: {
    storage: piniaSession,
    pick: ['checkedIds'],
  },
});
