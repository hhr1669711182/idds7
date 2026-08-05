/*
 * @Description: 模型研判 Three.js 工具集
 * @FilePath: \ids-gis-web\src\views\modelAssess\model3d\commonThree.ts
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { maModelSetting } from './commonSetting'

/**
 * 经纬度 -> 局部场景坐标（米制缩放后）
 * 与 BIM 模块同名函数算法一致，但读取独立配置
 */
export function lonLatToLocalCoord(
  lon: number,
  lat: number,
  isVector3 = false,
): THREE.Vector2 | THREE.Vector3 {
  const baseLon = maModelSetting.basePoint.baseLon
  const baseLat = maModelSetting.basePoint.baseLat
  const dx = (lon - baseLon) * 111319.9
  const dy = (lat - baseLat) * 111319.9
  if (isVector3) {
    return new THREE.Vector3(dx / 100, 0, -dy / 100)
  }
  return new THREE.Vector2(dx / 100, dy / 100)
}

/** Promise 化 GLTF 加载 */
export function loadGLTF(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.load(
      url,
      (gltf) => resolve(gltf),
      undefined,
      (error) => reject(error),
    )
  })
}

/** Promise 化 OBJ 加载 */
export function loadOBJ(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const loader = new OBJLoader()
    loader.load(
      url,
      (obj) => resolve(obj),
      undefined,
      (error) => reject(error),
    )
  })
}

/**
 * 程序化生成一个简单"白模"建筑特征列表（不依赖 GeoServer）
 * 用于在没有真实 WFS 数据时填充场景
 */
export interface MockBuildingFeature {
  properties: { buildGuid: string; shortName: string; floor: number }
  geometry: { coordinates: number[][][] }
}

export function buildMockBuildings(): MockBuildingFeature[] {
  // 在主警情点周围 4 个方向生成 4 栋简单白模（方块轮廓）
  const cx = maModelSetting.basePoint.baseLon
  const cy = maModelSetting.basePoint.baseLat
  // 每栋楼 ~30m 边长
  const delta = 0.0003
  return [
    {
      properties: { buildGuid: 'S3', shortName: 'S3 星光百货汇', floor: 14 },
      geometry: {
        coordinates: [[
          [cx - delta, cy - delta],
          [cx + delta, cy - delta],
          [cx + delta, cy + delta],
          [cx - delta, cy + delta],
          [cx - delta, cy - delta],
        ]],
      },
    },
    {
      properties: { buildGuid: 'S4', shortName: 'S4 华东民生大楼', floor: 18 },
      geometry: {
        coordinates: [[
          [cx + delta * 2, cy - delta],
          [cx + delta * 4, cy - delta],
          [cx + delta * 4, cy + delta],
          [cx + delta * 2, cy + delta],
          [cx + delta * 2, cy - delta],
        ]],
      },
    },
    {
      properties: { buildGuid: 'S5', shortName: 'S5 国贸中心', floor: 22 },
      geometry: {
        coordinates: [[
          [cx - delta * 4, cy - delta * 2],
          [cx - delta * 2, cy - delta * 2],
          [cx - delta * 2, cy],
          [cx - delta * 4, cy],
          [cx - delta * 4, cy - delta * 2],
        ]],
      },
    },
    {
      properties: { buildGuid: 'S6', shortName: 'S6 浦江饭店', floor: 8 },
      geometry: {
        coordinates: [[
          [cx, cy + delta * 2],
          [cx + delta * 2, cy + delta * 2],
          [cx + delta * 2, cy + delta * 4],
          [cx, cy + delta * 4],
          [cx, cy + delta * 2],
        ]],
      },
    },
  ]
}

/** 程序化消防栓点位（围绕主警情点） */
export function buildMockHydrants(): Array<{ coordinates: [number, number]; name: string }> {
  const cx = maModelSetting.basePoint.baseLon
  const cy = maModelSetting.basePoint.baseLat
  const d = 0.0015
  return [
    { name: 'KX1', coordinates: [cx - d, cy - d * 0.5] },
    { name: 'KX2', coordinates: [cx + d, cy - d * 0.5] },
    { name: 'KX3', coordinates: [cx + d * 0.3, cy + d * 0.5] },
    { name: 'KX4', coordinates: [cx - d * 0.5, cy + d] },
  ]
}
