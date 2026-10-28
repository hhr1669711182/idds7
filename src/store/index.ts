/*
 * @Author: hhr
 * @Date: 2026-03-31 15:30:08
 * @LastEditTime: 2026-09-22 10:38:08
 * @LastEditors: hhr
 * @Description: 鏂囦欢鎻忚堪
 * @FilePath: \ids-gis-web\src\store\index.ts
 */
/**
 * Tier 1 全局核心 store barrel。
 * 跨路由高频使用的身份 / 消息 / 地图 / 面板 / 来电定位 / 调派报警等全局状态统一从此处导入。
 *
 * 路由专属的 Tier 2 store（useCardStore / useLayersStore / useTopicLayerStore /
 * useBaseSourceStore / useModalStore / useTabsStore / useDispatchStore /
 * useDispatchT1Store / useIncidentLocationStore / useStationLayerStore /
 * useDispatchMapStore / useModelAssessStore / useSearchPanelStore 等）
 * 不再进 barrel，调用方直接按文件路径导入（如 @/store/useCardStore），
 * 避免首屏把全部 store 拉进同一 chunk。
 */
export * from './useCommonStore.ts'
export * from './useMapStore.ts'
export * from './useMapConfigStore.ts'
export * from './usePanelStore.ts'
export * from './usePendingCallLocationStore.ts'
export * from './usePendingDispatchAlarmStore.ts'
export * from './useMessageStore.ts'
export * from './useUserStore.ts'
