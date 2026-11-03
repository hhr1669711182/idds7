/**
 * 路线 Y 单实例常驻：调派业务 OL 设施注入层。
 *
 * 将 dispatchMap.vue 中调派独有的 OL 设施（各 batch 逐步迁入）抽为注入式模块，
 * attach/detach 到 map.vue 常驻的 OLMap 实例上，避免路线 X 双包装层互斥挂载
 * 导致的底图 unmount → preloader 竞态崩溃。
 *
 * 本模块不是 Vue SFC——它是纯 TS 模块，管理一组绑定到常驻 map 的 OL 设施。
 * 每个 B 增量（B-1…B-5）向 attach/detach 添加对应设施。
 */
import type OLMap from 'ol/Map';
import { IncidentVideoOverlayController } from '@/controller/core/business/IncidentVideoOverlayController';
import { createSpecialMapMock, type SpecialMapMock } from './specialMapMock';
import { createIncidentRelocate, type IncidentRelocate } from './incidentRelocate';
import type { AmapRealtimeNav } from '@/baseComponent/amap/useAmapTools';
import { GenericController } from '@/controller/core/generic';
import type { CallController } from '@/controller/core/business/CallController';
import { getBusinessMessageRuntime } from '@/controller/core/io/BusinessMessageRuntime';

// ---------------------------------------------------------------------------
// 注入契约
// ---------------------------------------------------------------------------

/** 调用方（map.vue）提供的依赖 */
export interface DispatchBusinessDeps {
  /** 常驻 OLMap 实例（永不 unmount） */
  map: OLMap;
  /** 高德实时导航控制器（map.vue initMap 后设置，attach 时传入） */
  nav: AmapRealtimeNav;
  // B-4+ 会扩展：gisBaseMap、firePopupEl、carPopupEl、alarmPopupEl
}

/** attach 成功后的句柄；detach() 执行后句柄失效 */
export interface DispatchBusinessHandle {
  /** B-1：灾情现场视频弹窗控制器 */
  incidentVideoController: IncidentVideoOverlayController;
  /** B-2：特殊地图模拟（假数据渲染/车辆模拟） */
  specialMapMock: SpecialMapMock;
  /** B-2：警情二次定位（受理席 mock 通道） */
  incidentRelocate: IncidentRelocate;
  /** B-2：调派消息 runtime 专用 GenericController（B-5 attachMap(kind:'dispatch') 用） */
  callLocationGenericController: GenericController;
  /** B-2：调派 CallController（business message runtime 单例引用） */
  callLocationController: CallController | null;
  /** 脱离所有设施并清理解绑 */
  detach: () => void;
}

// ---------------------------------------------------------------------------
// 模块级单例（常驻 map 只有一个）
// ---------------------------------------------------------------------------

let _handle: DispatchBusinessHandle | null = null;

/**
 * 将调派业务设施 attach 到常驻 map。
 * 若已 attach（幂等）直接返回现有句柄。
 */
export const attachDispatchBusiness = (
  deps: DispatchBusinessDeps,
): DispatchBusinessHandle => {
  if (_handle) return _handle;

  // ---- B-1: incidentVideoController ----
  const incidentVideoController = new IncidentVideoOverlayController(deps.map);

  // ---- B-2: specialMapMock / incidentRelocate / callLocation ----
  const specialMapMock = createSpecialMapMock(deps.map, deps.nav);
  const incidentRelocate = createIncidentRelocate(deps.map, deps.nav);
  const callLocationGenericController = new GenericController(deps.map);
  const callLocationController: CallController | null =
    getBusinessMessageRuntime().business.call ?? null;

  const detach = (): void => {
    incidentVideoController.destroy();
    specialMapMock.destroy();
    incidentRelocate.dispose();
    // callLocationGenericController / callLocationController 无显式 destroy，置 null 即可
    _handle = null;
  };

  _handle = {
    incidentVideoController,
    specialMapMock,
    incidentRelocate,
    callLocationGenericController,
    callLocationController,
    detach,
  };
  return _handle;
};

/**
 * 脱离所有调派业务设施（幂等：未 attach 时 no-op）。
 */
export const detachDispatchBusiness = (): void => {
  _handle?.detach();
};

/** 当前是否处于已 attach 状态（供 B-3+ 判断用） */
export const isDispatchBusinessAttached = (): boolean => _handle !== null;

/**
 * 取当前已 attach 的调派业务句柄（未 attach 返回 null）。
 * 供纠缠体 composable（useDispatchEntangled）复用 5 个独立设施句柄，避免重建。
 */
export const getDispatchBusiness = (): DispatchBusinessHandle | null => _handle;
