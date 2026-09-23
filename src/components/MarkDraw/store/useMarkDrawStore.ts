/**
 * MarkDraw UI 状态：activeTool / activeGroupId / activeLayerId / drawer / panel
 * 数据落 GeoServer，UI 状态走 pinia + localStorage。
 */
import { defineStore } from "pinia";
import { markDrawLocal } from "./persist";
import type { MarkDrawToolType } from "../engine/types";

interface MarkDrawState {
  activeTool: MarkDrawToolType | null;
  activeGroupId: string;
  activeLayerId: string;
  drawerOpen: boolean;
  drawerSize: number;
  panelVisible: boolean;
}

export const useMarkDrawStore = defineStore("markDraw", {
  state: (): MarkDrawState => ({
    activeTool: null,
    activeGroupId: "markdraw",
    activeLayerId: "mark:mark_features",
    drawerOpen: true,
    drawerSize: 360,
    panelVisible: true,
  }),
  actions: {
    setActiveTool(tool: MarkDrawToolType | null) {
      this.activeTool = tool;
    },
    setActiveLayer(layerId: string) {
      this.activeLayerId = layerId;
      const layer = layerId.split(":")[0];
      this.activeGroupId = layer === "mark" ? "markdraw" : layer;
    },
    toggleDrawer() {
      this.drawerOpen = !this.drawerOpen;
    },
    setPanelVisible(v: boolean) {
      this.panelVisible = v;
    },
  },
  persist: {
    storage: markDrawLocal,
    pick: ["activeTool", "activeGroupId", "activeLayerId", "drawerOpen", "drawerSize", "panelVisible"],
  } as never,
});
