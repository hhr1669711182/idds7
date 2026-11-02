/*
 * @Author: huanghuanrong
 * @Date: 2026-10-29
 * @Description: 统一 GIS 底座（GisBaseMap）variant 能力开关表。
 *               main = 值守主图（/map），dispatch = 消防调派图（/dispatch，T1 转正）。
 *               底座层只按 variant 门控能力，不做路由判断；路由切换仍由 router/
 *               sharedStateGuard/businessMapLifecycle 承担。
 */

import { useUserStore } from '@/store/useUserStore';
import { getSharedMapStage } from '@/utils/seatSharedState';

export type GisMapVariant = 'main' | 'dispatch';

/** 底座 attach BusinessMessageRuntime 的 kind，与 drainMock 约定一致。 */
export type GisMapRuntimeKind = 'map' | 'dispatch';

/**
 * variant → 能力开关。
 * main 只跑共用能力；dispatch 额外开启派生 store 的 watcher 同步
 * （主管站/定位点位/辖区面/周边资源范围圈）。
 */
export interface GisMapFeatureFlags {
  variant: GisMapVariant;
  /** attach BusinessMessageRuntime 的 kind。 */
  runtimeKind: GisMapRuntimeKind;
  /** 是否挂警情定位/主管队站/辖区/周边资源范围圈相关 store watcher。 */
  incidentStores: boolean;
  /** 是否走 dispatch 派生 store（useStationLayerStore / useNearbyResourceLayerStore）。 */
  dispatchStores: boolean;
}

const MAIN_FLAGS: GisMapFeatureFlags = {
  variant: 'main',
  runtimeKind: 'map',
  incidentStores: false,
  dispatchStores: false,
};

const DISPATCH_FLAGS: GisMapFeatureFlags = {
  variant: 'dispatch',
  runtimeKind: 'dispatch',
  incidentStores: true,
  dispatchStores: true,
};

/**
 * 解析 variant 能力开关。未知值兜底 main 并告警，避免误触发 dispatch mock 队列。
 */
export const resolveGisMapFlags = (variant: string): GisMapFeatureFlags => {
  if (variant === 'dispatch') return DISPATCH_FLAGS;
  if (variant !== 'main') {
    console.warn('[gisMapConfig] 未知 variant，按 main 兜底', variant);
  }
  return MAIN_FLAGS;
};

/**
 * 运行期派生"是否处于调派业务态"（合并归一路线 X）。
 *
 * 不再由路由/组件决定（原 /dispatch 路由已退化为 thin redirect），改由共享态单一事实源
 * 派生：归一 stage 为 dispatch/dispatchTrack，或业务模式为 flood（flood 不再跳路由，
 * 改在 /map 内按 variant 显示调派 UI）。调用方包进 computed 以获得响应式切换。
 * 无新增 state 字段，仅读 useUserStore 现成字段，避免第二状态源。
 */
export const isDispatchVariant = (): boolean => {
  const store = useUserStore();
  const stage = getSharedMapStage(store.rawState, store.MapMode);
  return stage === 'dispatch' || stage === 'dispatchTrack' || store.mode === 'flood';
};
