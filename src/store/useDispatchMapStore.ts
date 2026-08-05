import { defineStore } from "pinia";
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
      this.map = val;
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
