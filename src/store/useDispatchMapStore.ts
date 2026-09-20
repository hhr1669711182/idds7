/*
 * @Author: hhr
 * @Date: 2026-08-14 18:57:09
 * @LastEditTime: 2026-08-17 17:47:25
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\store\useDispatchMapStore.ts
 */
import { defineStore } from "pinia";
import { piniaSession } from "./piniaPersist"
import { markRaw, toRaw } from "vue";
import { Map } from "ol";

export interface DispatchMapState {
  map: Map | null;
  checkedIds: string[];
}

export const useDispatchMapStore = defineStore("dispatchMapStore", {
  state: (): DispatchMapState => {
    return {
      map: null,
      checkedIds: ["gis:view_res_org_dept", "gis:view_juris_zone"],
    };
  },

  actions: {
    setMap(val: Map) {
      this.map = markRaw(toRaw(val));
    },
    setCheckedIds(ids: string[]) {
      this.checkedIds = ids;
    },
  },
  persist: {
    storage: piniaSession,
    pick: ['checkedIds'],
  },
});