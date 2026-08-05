/*
 * @Description: 模型研判主警情 ThreeViewer 单例控制器（供外部 Compass3D 等组件联动）
 * @FilePath: \ids-gis-web\src\views\modelAssess\composables\useThreeController.ts
 *
 * 用法：
 * 1) 主警情 ThreeViewer mount 时：registerMasterController({ updatePitchRotation, resetView, ... })
 * 2) 外部 Compass3D 等：import { useThreeController }，调用其暴露的方法
 * 3) 组件 unmount 时：unregisterMasterController()
 *
 * 设计动机：
 *   useThreeScene 是每个 ThreeViewer 实例的本地 composable；
 *   但 Compass3D / 视角控制条等与 ThreeViewer 互为兄弟节点（不在父子链上），
 *   无法直接 ref 引用其 api。引入模块级单例，让"主警情" 3D 场景主动注册自身能力，
 *   外部组件通过响应式状态自动响应。
 */

/** 主警情 ThreeViewer 暴露给外部的相机控制 API（按需扩展） */
export interface MasterThreeController {
  /** 设置俯仰 / 方位（pitch: 0~80，rotation: -180~180） */
  updatePitchRotation: (pitch: number, rotation: number) => void
  /** 复位到初始相机位置 */
  resetView: () => void
  /** 重播车辆路线动画（绿色路径 + 消防车沿 lat/lng 路线行进） */
  replayRouteAnimation: () => void
  /** 播放 / 重新加载路线动画（传入新数据） */
  playRouteAnimation: (
    planData?: Record<string, unknown>,
    options?: { durationMs?: number },
  ) => void
  /** 恢复全景视角（相机框选到路线范围） */
  fitCameraToRoute: () => void
  /** 启动 chase camera：跟随第一辆车 */
  startFollowVehicle: () => void
  /** 停止 chase camera */
  stopFollowVehicle: () => void
  /** 当前是否在跟随模式 */
  isFollowVehicleEnabled: () => boolean
}

/* 模块级单例状态：响应式 */
const state = {
  controller: null as MasterThreeController | null,
  hasController: false,
}

/** 主警情 ThreeViewer 在 onMounted 时调用 */
export function registerMasterController(api: MasterThreeController) {
  state.controller = api
  state.hasController = true
}

/** 主警情 ThreeViewer 在 onUnmounted 时调用 */
export function unregisterMasterController() {
  state.controller = null
  state.hasController = false
}

/**
 * Composable：在外部组件（Compass3D / 路线操作栏等）中使用，
 * 通过响应式状态感知主警情 ThreeViewer 是否就绪，并调用其方法。
 */
export function useThreeController() {
  return {
    /** 响应式状态：外部组件用 ctrlState.hasController 控制按钮 disabled */
    state,
    updatePitchRotation: (pitch: number, rotation: number) => {
      state.controller?.updatePitchRotation(pitch, rotation)
    },
    resetView: () => {
      state.controller?.resetView()
    },
    replayRouteAnimation: () => {
      state.controller?.replayRouteAnimation()
    },
    playRouteAnimation: (
      planData?: Record<string, unknown>,
      options?: { durationMs?: number },
    ) => {
      state.controller?.playRouteAnimation(planData, options)
    },
    fitCameraToRoute: () => {
      state.controller?.fitCameraToRoute()
    },
    startFollowVehicle: () => {
      state.controller?.startFollowVehicle()
    },
    stopFollowVehicle: () => {
      state.controller?.stopFollowVehicle()
    },
    isFollowVehicleEnabled: () => {
      return state.controller?.isFollowVehicleEnabled() ?? false
    },
  }
}
