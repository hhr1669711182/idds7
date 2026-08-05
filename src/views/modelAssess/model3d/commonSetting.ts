/*
 * @Description: 模型研判 Three.js 场景独立配置（不与 BIM 模块共享）
 * @FilePath: \ids-gis-web\src\views\modelAssess\model3d\commonSetting.ts
 */

/**
 * 模型研判 3D 场景配置
 * 与 src/components/BIM/module/commonSetting.js 隔离，避免共享全局变量
 */
export const maModelSetting = {
  /** 主警情建筑经纬度（用作场景中心点） */
  basePoint: { baseLon: 121.4725, baseLat: 31.2305 },
  /** 主建筑 ID（与 useModelAssessStore 中的 masterAlarm.id 对应） */
  disasterBuildingID: 'M1',
  /** 周边建筑搜索半径（米） */
  searchRadius: 350,
  /** 市政设施筛选半径（米） */
  buildRadius: 200,
  /** GeoServer workspace */
  gisWorkspace: 'gis',
  /** 资源根路径（复用 public/model3d/） */
  assetBase: '/model3d',
  /** 楼层表资源（白模 GeoServer 图层） */
  fireHydrant: { layerName: 'gis:v_srvc_water_hydrant', geom: 'geom' },
  whiteBuilding: { layerName: 'gis:mapBuilding', geom: 'geom' },
  /** 主建筑拉伸参数 */
  wallAndFloor: { WALL_HEIGHT: 0.1, WALL_THICKNESS: 0.01, FLOOR_THICKNESS: 0.01 },
  /** 楼层高度显示缩放系数（控制每层在 3D 中的厚度） */
  floorDisplayHeight: 0.12,
  /** 相机初始位置（俯瞰角度） */
  cameraInit: { x: 4, y: 4, z: 4 },
  /** 相机最远/最近距离 */
  cameraLimits: { minDistance: 1, maxDistance: 50 },
}

/** 场景中可被点击/订阅的"更新事件"类型 */
export const updateBIMType = {
  fireFloor: 'fireFloor',
  smokeSize: 'smokeSize',
  trappedPerson: 'trappedPerson',
} as const

export type UpdateBIMType = (typeof updateBIMType)[keyof typeof updateBIMType]
