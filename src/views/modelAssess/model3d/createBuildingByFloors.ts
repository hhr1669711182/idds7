/*
 * @Description: 按楼层堆叠主建筑（与 BIM 同名文件完全独立）
 * @FilePath: \ids-gis-web\src\views\modelAssess\model3d\createBuildingByFloors.ts
 */
import * as THREE from 'three'
import { maModelSetting } from './commonSetting'

/** 主建筑轮廓：以 basePoint 为中心的正方形（不依赖 GeoServer） */
function buildMainBuildingPoints(): THREE.Vector2[] {
  const d = 0.0001
  const cx = maModelSetting.basePoint.baseLon
  const cy = maModelSetting.basePoint.baseLat
  const dx = (d * 111319.9) / 100
  const dy = (d * 111319.9) / 100
  return [
    new THREE.Vector2(-dx, -dy),
    new THREE.Vector2(dx, -dy),
    new THREE.Vector2(dx, dy),
    new THREE.Vector2(-dx, dy),
    new THREE.Vector2(-dx, -dy),
  ]
}

function createFloor(points: THREE.Vector2[], thickness: number, addH: number): THREE.Mesh {
  const shape = new THREE.Shape(points)
  const extrudeSettings = { depth: thickness, bevelEnabled: false }
  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings)
  geometry.computeBoundingBox()
  const mat = new THREE.MeshLambertMaterial({ color: 0x3a4a6a })
  const mesh = new THREE.Mesh(geometry, mat)
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = addH
  return mesh
}

function createWalls(
  points: THREE.Vector2[],
  height: number,
  thickness: number,
  addH: number,
): THREE.Mesh {
  // 用 4 面墙（简化为 BoxGeometry 围一圈）
  const group = new THREE.Group()
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const dx = b.x - a.x
    const dz = b.y - a.y
    const len = Math.sqrt(dx * dx + dz * dz)
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(len + thickness, height, thickness),
      new THREE.MeshLambertMaterial({
        color: 0x1a2236,
        transparent: true,
        opacity: 0.9,
      }),
    )
    wall.position.set((a.x + b.x) / 2, addH + height / 2, -(a.y + b.y) / 2)
    wall.rotation.y = -Math.atan2(dz, dx)
    group.add(wall)
  }
  // 包装成单 mesh 不便，直接返回 Group 转 mesh 不可行，改为外部用 Group
  return group as unknown as THREE.Mesh
}

export interface FloorGroupRefs {
  group: THREE.Group
  allFloors: THREE.Group[]
}

/**
 * 按楼层数堆叠主建筑，每层为一个独立 Group
 * allFloors[i] 对应第 i 层（i 从 0 开始），可通过 .visible 控制显隐
 */
export function createBuildingByFloors(
  totalFloors: number,
  buildHeight: number,
): FloorGroupRefs {
  const points = buildMainBuildingPoints()
  const wallHeight = maModelSetting.wallAndFloor.WALL_HEIGHT
  const wallThickness = maModelSetting.wallAndFloor.WALL_THICKNESS
  const floorThickness = maModelSetting.wallAndFloor.FLOOR_THICKNESS
  // 单层厚度 = floorThickness + wallHeight（与 BIM 一致），但可被 floorDisplayHeight 覆盖
  const step = maModelSetting.floorDisplayHeight || wallHeight + floorThickness
  const group = new THREE.Group()
  const allFloors: THREE.Group[] = []

  for (let i = 0; i < totalFloors; i++) {
    const addH = i * step
    const layerGroup = new THREE.Group()

    const floor = createFloor(points, floorThickness, addH)
    floor.userData = { name: 'buildingFloor', height: i + 1, type: 'floor' }
    layerGroup.add(floor)

    const walls = createWalls(points, step, wallThickness, addH)
    layerGroup.add(walls as unknown as THREE.Object3D)

    layerGroup.userData = { name: 'buildingLayer', height: i + 1 }
    allFloors.push(layerGroup)
    group.add(layerGroup)
  }

  // 楼顶
  const topAddH = totalFloors * step
  const top = createFloor(points, floorThickness, topAddH)
  top.material = new THREE.MeshLambertMaterial({ color: 0x4a5a7a })
  group.add(top)

  return { group, allFloors }
}

/**
 * 根据楼层总数 / 起火层 / 高度（米）调整楼层缩放
 * 用于响应 store 中 realtimeFactors 变化
 */
export function updateBuildingScale(
  refs: FloorGroupRefs,
  totalFloors: number,
  buildingHeight: number,
) {
  // 简单实现：每层高度 = buildingHeight / totalFloors * 缩放系数
  // 不重建 group，仅更新每个 layerGroup 的 y 缩放
  const scale = buildingHeight / Math.max(1, totalFloors) / 3
  refs.allFloors.forEach((g) => {
    g.scale.y = scale
  })
}
