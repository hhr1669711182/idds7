/*
 * @Author: hhr
 * @Date: 2026-04-16 14:00:56
 * @LastEditTime: 2026-04-24 18:25:01
 * @LastEditors: hhr
 * @Description: 面板状态管理store
 * @FilePath: \ids-gis-web\src\store\usePanelStore.ts
 */
import { defineStore } from "pinia";
import { PANEL_TYPES, PANEL_MAP_TYPE } from "../const";

export const usePanelStore = defineStore("PanelStore", () => {
  const state = reactive({
    type: PANEL_TYPES.NULL,
    bigPanelType: PANEL_MAP_TYPE.NULL,
    configOpen: false,
  })


  const setPanelType = (type: string) => {
    state.type = type;
  }
  const setBigPanelType = (type: string) => {
    state.bigPanelType = type;
  }
  const setConfigOpen = (open: boolean) => {
    state.configOpen = open;
  }

  return {
    ...toRefs(state),
    setPanelType,
    setBigPanelType,
    setConfigOpen,
  }
});
