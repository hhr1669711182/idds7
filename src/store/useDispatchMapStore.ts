/*
 * @Author: ljh
 * @Date: 2026-08-27 10:30:08
 * @LastEditTime: 2026-11-03 17:40:00
 * @LastEditors: hhr
 * @Description: 调派页面地图状态（消防力量调派，图层选择与主图隔离）。
 *               路线 Y B-6c：单实例常驻后不再有独立调派 map 实例，map 字段删除。
 * @FilePath: \ids-gis-web\src\store\useDispatchMapStore.ts
 */
import { defineStore } from 'pinia'

export interface DispatchMapState {
  checkedIds: string[]
}

export const useDispatchMapStore = defineStore('dispatchMapStore', {
  state: (): DispatchMapState => ({
    checkedIds: ['gis:view_res_org_dept'],
  }),
  actions: {
    setCheckedIds(ids: string[]) {
      this.checkedIds = [...new Set(ids)]
    },
  },
  persist: {
    storage: sessionStorage,
    pick: ['checkedIds'],
  },
})
