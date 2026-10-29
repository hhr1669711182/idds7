/*
 * @Author: ljh
 * @Date: 2026-08-27 10:30:08
 * @LastEditTime: 2026-08-27 10:39:46
 * @LastEditors: ljh
 * @Description: 调派页面地图状态（消防力量调派，图层选择与主图隔离）。
 * @FilePath: \ids-gis-web\src\store\useDispatchMapStore.ts
 */
import { defineStore } from 'pinia'
import type Map from 'ol/Map'

export interface DispatchMapState {
  map: Map | null
  checkedIds: string[]
}

export const useDispatchMapStore = defineStore('dispatchMapStore', {
  state: (): DispatchMapState => ({
    map: null,
    checkedIds: ['gis:view_res_org_dept'],
  }),
  actions: {
    setMap(map: Map) {
      this.map = map
    },
    setCheckedIds(ids: string[]) {
      this.checkedIds = [...new Set(ids)]
    },
  },
  persist: {
    storage: sessionStorage,
    pick: ['checkedIds'],
  },
})
