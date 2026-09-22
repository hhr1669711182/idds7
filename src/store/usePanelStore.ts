/*
 * @Author: hhr
 * @Date: 2026-04-16 14:00:56
 * @LastEditTime: 2026-09-22 11:20:26
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
    ssrkPanelOpen: false,
    // 增量:圈选查询当前激活工具实例(供面板挂载时主动拉取)
    circleQueryTool: null as any,
    circleOpen: false,
    circleCenter: [] as number[],
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
  const setSsrkPanelOpen = (open: boolean) => {
    state.ssrkPanelOpen = open;
  }
  const setCircleQueryTool = (tool: any) => {
    state.circleQueryTool = tool ?? null;
    state.circleOpen = true;
  }
  const clearCircleQueryTool = () => {
    state.circleQueryTool = null;
    state.circleOpen = false;
  }

  const setCircleCenter = (center: number[]) => {
    state.circleCenter = center;
  }

  return {
    ...toRefs(state),
    setPanelType,
    setBigPanelType,
    setConfigOpen,
    setSsrkPanelOpen,
    setCircleQueryTool,
    clearCircleQueryTool,
    setCircleCenter,
  }
});
