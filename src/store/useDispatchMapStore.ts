import { defineStore } from "pinia";
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
      // 防止 Pinia 把 OL Map 深度代理，触发 rAF 卡顿
      this.map = markRaw(toRaw(val));
    },
    setCheckedIds(ids: string[]) {
      this.checkedIds = ids;
    },
  },
  persist: {
    storage: sessionStorage,
    pick: ['checkedIds'],
  },
});