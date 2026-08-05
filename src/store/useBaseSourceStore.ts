import { defineStore } from "pinia";

import {
  DEFAULT_BASE_SOURCE_ID,
  isBaseSourceId,
  type BaseSourceId,
} from "@/baseComponent/OpenlayersMap/baseSource.ts";

export const useBaseSourceStore = defineStore("baseSourceStore", {
  state: () => {
    return {
      visible: false,
      activeId: DEFAULT_BASE_SOURCE_ID as BaseSourceId,
      trafficVisible: false,
    };
  },
  actions: {
    setVisible(visible: boolean) {
      this.visible = visible;
    },
    toggleVisible() {
      this.visible = !this.visible;
    },
    setActiveId(id: string) {
      if (!isBaseSourceId(id)) {
        return false;
      }
      this.activeId = id;
      return true;
    },
    open(id?: string) {
      if (id) {
        this.setActiveId(id);
      }
      this.visible = true;
    },
    close() {
      this.visible = false;
    },

    // 实时路况
    showTrafficSource() {
      this.trafficVisible = !this.trafficVisible;
    }
  },
});
