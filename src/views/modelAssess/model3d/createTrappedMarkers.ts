/*
 * @Description: 受困人员标牌（3D 楼层标记 + 文字精灵）
 * @FilePath: \ids-gis-web\src\views\modelAssess\model3d\createTrappedMarkers.ts
 */
import * as THREE from 'three'
import type { TrappedFloorItem } from '@/const/const.modelAssess'
import { maModelSetting } from './commonSetting'
import { makeTextSprite } from './createFireFacilities'

/**
 * 在主建筑外某个位置生成受困人员标牌组（红立方体 + 文字精灵）
 * 返回标牌 Group，外部管理显隐与拾取
 */
export function createTrappedMarker(
  item: TrappedFloorItem,
  totalFloors: number,
  index: number,
): THREE.Group {
  const group = new THREE.Group()
  group.userData = {
    type: 'trappedMarker',
    uuid: item.uuid,
    floor: item.floor,
    direction: item.direction,
    count: item.count,
  }

  // 计算 y 高度 = (item.floor / totalFloors) * 总高
  const step = maModelSetting.floorDisplayHeight
  const totalHeight = totalFloors * step
  const yPos = (item.floor / Math.max(1, totalFloors)) * totalHeight + 0.1

  // 红立方体（人员图标）
  const personBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.08),
    new THREE.MeshBasicMaterial({ color: 0xff3030 }),
  )
  personBox.position.set(0, yPos, 0)
  personBox.userData = { ...group.userData }
  group.add(personBox)

  // 文字标牌
  const label = makeTextSprite(`${item.floor}F ${item.direction} ${item.count}人`, '#ffffff', 'rgba(255,48,48,0.85)')
  label.position.set(0, yPos + 0.18, 0)
  label.userData = { ...group.userData }
  group.add(label)

  // 在主建筑周围散开（东南 / 西北 / 东北 / 西南 四个方向）
  const angle = (index * Math.PI) / 2 + Math.PI / 4
  const radius = 0.4
  group.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)

  return group
}

/**
 * 根据方向枚举返回主建筑周围的角度（弧度）
 */
export function directionToAngle(direction: string): number {
  switch (direction) {
    case '东南角':
      return Math.PI / 4
    case '西北角':
      return (5 * Math.PI) / 4
    case '东北角':
      return (3 * Math.PI) / 4
    case '西南角':
      return (7 * Math.PI) / 4
    default:
      return Math.PI / 4
  }
}
