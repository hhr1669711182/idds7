/*
 * @Description: 主建筑标注系统（楼层高度标尺 + 建筑信息 + 方向角标）
 * @FilePath: \ids-gis-web\src\views\modelAssess\model3d\createBuildingAnnotations.ts
 *
 * 提供：
 *   1) 左侧高度标尺：水平虚线 + 文字标签（30m / 50m / 70m / 90m …）
 *   2) 顶部建筑信息：建筑名 + "总楼高: 32F / 96m"
 *   3) 起火层标注：起火层高亮外框 + 右侧 callout 标签 + 引线
 *   4) 4 个方向角标：东南 / 东北 / 西北 / 西南（位于建筑底部四角）
 *
 * 坐标约定：
 *   - 建筑中心位于 (0, 0)（已由 createBuildingByFloors 将其放到场景原点）
 *   - +y 向上为楼层高度方向
 *   - 高度米 → 世界单位的换算：meterToUnit = displayHeight / totalRealHeightM
 *     例：96m 总高、显示 3.84 单位 → 1m = 0.04 单位
 */
import * as THREE from 'three'
import { makeTextSprite } from './createFireFacilities'

/** 主建筑角点 4 个角的 x/z 偏移（与 createBuildingByFloors 中 buildMainBuildingPoints 一致） */
const BUILDING_HALF_WIDTH = (0.0001 * 111319.9) / 100  // ≈ 0.1113 m
const BUILDING_HALF_DEPTH = BUILDING_HALF_WIDTH
/** 单层显示厚度（与 maModelSetting.floorDisplayHeight 一致） */
const FLOOR_DISPLAY_HEIGHT = 0.12

/** 方向角标：4 个角对应的方位（z 轴为北，+x 为东） */
const CORNER_DIRECTIONS = [
  { label: '东南', angle: Math.PI / 4 },
  { label: '东北', angle: (3 * Math.PI) / 4 },
  { label: '西北', angle: (5 * Math.PI) / 4 },
  { label: '西南', angle: (7 * Math.PI) / 4 },
] as const

export interface BuildingAnnotationOpts {
  /** 楼层总数（与 createBuildingByFloors 一致） */
  totalFloors: number
  /** 建筑总高（米） */
  totalRealHeightM: number
  /** 建筑名称（显示在顶部） */
  buildingName?: string
  /** 起火层（1-based） */
  fireFloor?: number
  /** 高度标尺刻度（米），默认 [30, 50, 70, 90] */
  heightMarks?: number[]
}

export interface BuildingAnnotationRefs {
  group: THREE.Group
  /** 更新起火层（重新画高亮框 + callout 标签） */
  setFireFloor: (floor: number | null) => void
  /** 更新建筑名 */
  setBuildingName: (name: string) => void
  /** 销毁 */
  dispose: () => void
}

/* -------- 工具：用多段短直线模拟虚线（WebGL LineBasicMaterial 不支持 linewidth） -------- */
function makeDashedLine(
  start: THREE.Vector3,
  end: THREE.Vector3,
  color: number,
  dashCount = 6,
): THREE.Group {
  const g = new THREE.Group()
  const totalLen = start.distanceTo(end)
  if (totalLen < 1e-6) return g
  const dir = end.clone().sub(start).normalize()
  const segLen = totalLen / dashCount
  const dashLen = segLen * 0.55
  const mat = new THREE.LineBasicMaterial({ color })
  for (let i = 0; i < dashCount; i++) {
    const s = start.clone().add(dir.clone().multiplyScalar(i * segLen))
    const e = s.clone().add(dir.clone().multiplyScalar(dashLen))
    const geo = new THREE.BufferGeometry().setFromPoints([s, e])
    g.add(new THREE.Line(geo, mat))
  }
  return g
}

/* -------- 工具：起火层外框（12 段 LineSegments 围一圈） -------- */
function makeFloorBox(width: number, depth: number, y: number, color: number): THREE.LineSegments {
  const half = width / 2
  const dHalf = depth / 2
  const yLow = y - FLOOR_DISPLAY_HEIGHT * 0.8
  const pts: THREE.Vector3[] = []
  // 顶面 4 条边
  pts.push(new THREE.Vector3(-half, y, -dHalf), new THREE.Vector3(half, y, -dHalf))
  pts.push(new THREE.Vector3(half, y, -dHalf), new THREE.Vector3(half, y, dHalf))
  pts.push(new THREE.Vector3(half, y, dHalf), new THREE.Vector3(-half, y, dHalf))
  pts.push(new THREE.Vector3(-half, y, dHalf), new THREE.Vector3(-half, y, -dHalf))
  // 底面 4 条边
  pts.push(new THREE.Vector3(-half, yLow, -dHalf), new THREE.Vector3(half, yLow, -dHalf))
  pts.push(new THREE.Vector3(half, yLow, -dHalf), new THREE.Vector3(half, yLow, dHalf))
  pts.push(new THREE.Vector3(half, yLow, dHalf), new THREE.Vector3(-half, yLow, dHalf))
  pts.push(new THREE.Vector3(-half, yLow, dHalf), new THREE.Vector3(-half, yLow, -dHalf))
  // 4 条立柱
  pts.push(new THREE.Vector3(-half, y, -dHalf), new THREE.Vector3(-half, yLow, -dHalf))
  pts.push(new THREE.Vector3(half, y, -dHalf), new THREE.Vector3(half, yLow, -dHalf))
  pts.push(new THREE.Vector3(half, y, dHalf), new THREE.Vector3(half, yLow, dHalf))
  pts.push(new THREE.Vector3(-half, y, dHalf), new THREE.Vector3(-half, yLow, dHalf))
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  const mat = new THREE.LineBasicMaterial({ color })
  return new THREE.LineSegments(geo, mat)
}

/** 释放一个 Object3D 子树的几何/材质（用于重建前清理） */
function disposeSubtree(obj: THREE.Object3D) {
  obj.traverse((o: any) => {
    if (o.geometry) o.geometry.dispose()
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose())
      else o.material.dispose()
    }
  })
}

/**
 * 在主建筑附近创建一组标注，返回 refs 供外部动态更新
 */
export function createBuildingAnnotations(
  opts: BuildingAnnotationOpts,
): BuildingAnnotationRefs {
  const totalFloors = opts.totalFloors > 0 ? opts.totalFloors : 32
  const totalRealHeightM = opts.totalRealHeightM > 0 ? opts.totalRealHeightM : 96
  const marks = opts.heightMarks ?? [30, 50, 70, 90]
  const displayHeight = totalFloors * FLOOR_DISPLAY_HEIGHT
  const meterToUnit = displayHeight / totalRealHeightM  // 1m = meterToUnit 单位
  const floorToY = (floor: number) => (floor / Math.max(1, totalFloors)) * displayHeight

  const root = new THREE.Group()
  root.name = 'buildingAnnotations'

  /* ===== 1) 高度标尺（建筑左侧） ===== */
  const heightScaleGroup = new THREE.Group()
  heightScaleGroup.name = 'heightScale'
  const scaleX = -BUILDING_HALF_WIDTH - 0.5
  const scaleLineEndX = -BUILDING_HALF_WIDTH - 0.05
  marks.forEach((m) => {
    const y = m * meterToUnit
    // 水平虚线
    const line = makeDashedLine(
      new THREE.Vector3(scaleLineEndX, y, 0),
      new THREE.Vector3(scaleX, y, 0),
      0x66aaff,
      5,
    )
    heightScaleGroup.add(line)
    // 文字标签（蓝底白字）
    const label = makeTextSprite(`${m}m`, '#ffffff', 'rgba(74,144,217,0.95)')
    label.position.set(scaleX - 0.22, y, 0)
    label.scale.set(0.28, 0.16, 1)
    heightScaleGroup.add(label)
  })
  root.add(heightScaleGroup)

  /* ===== 2) 顶部建筑信息（建筑名 + 总楼高） ===== */
  // 建筑名（最顶，橙色 callout 风格）
  let nameSprite: THREE.Sprite | null = null
  function rebuildBuildingName(name?: string | null) {
    if (nameSprite) {
      root.remove(nameSprite)
      disposeSubtree(nameSprite)
      nameSprite = null
    }
    if (!name) return
    nameSprite = makeTextSprite(name, '#ffffff', 'rgba(255,140,0,0.95)')
    nameSprite.position.set(0, displayHeight + 0.85, 0)
    nameSprite.scale.set(0.7, 0.3, 1)
    nameSprite.userData = { __isBuildingName: true }
    root.add(nameSprite)
  }
  rebuildBuildingName(opts.buildingName)

  // 总楼高标签（建筑名下方，蓝底）
  const totalLabel = makeTextSprite(
    `总楼高: ${totalFloors}F / ${totalRealHeightM}m`,
    '#ffffff',
    'rgba(74,144,217,0.95)',
  )
  totalLabel.position.set(0, displayHeight + 0.4, 0)
  totalLabel.scale.set(0.7, 0.25, 1)
  root.add(totalLabel)

  // 引线：从总楼高标签到楼顶
  const totalLeader = makeDashedLine(
    new THREE.Vector3(0, displayHeight + 0.25, 0),
    new THREE.Vector3(0, displayHeight + 0.05, 0),
    0x4a90d9,
    3,
  )
  root.add(totalLeader)

  /* ===== 3) 起火层标注（外框 + callout 标签 + 引线） ===== */
  let fireBox: THREE.LineSegments | null = null
  let fireLabel: THREE.Sprite | null = null
  let fireLeader: THREE.Group | null = null

  function rebuildFireLabel(floor: number | null) {
    if (fireBox) {
      root.remove(fireBox)
      disposeSubtree(fireBox)
      fireBox = null
    }
    if (fireLabel) {
      root.remove(fireLabel)
      disposeSubtree(fireLabel)
      fireLabel = null
    }
    if (fireLeader) {
      root.remove(fireLeader)
      disposeSubtree(fireLeader)
      fireLeader = null
    }
    if (floor == null || floor < 1 || floor > totalFloors) return
    const y = floorToY(floor)
    const realM = ((floor / Math.max(1, totalFloors)) * totalRealHeightM).toFixed(0)
    // 外框（红色 8 段线框）
    fireBox = makeFloorBox(
      BUILDING_HALF_WIDTH * 2.05,
      BUILDING_HALF_DEPTH * 2.05,
      y,
      0xff3030,
    )
    root.add(fireBox)
    // callout 标签（红底白字）
    fireLabel = makeTextSprite(
      `起火层: ${floor}F / 约${realM}m`,
      '#ffffff',
      'rgba(255,48,48,0.95)',
    )
    fireLabel.position.set(BUILDING_HALF_WIDTH + 0.7, y + 0.1, 0)
    fireLabel.scale.set(0.65, 0.22, 1)
    root.add(fireLabel)
    // 引线（红色虚线，从标签指向起火层右边缘）
    fireLeader = makeDashedLine(
      new THREE.Vector3(BUILDING_HALF_WIDTH + 0.35, y + 0.1, 0),
      new THREE.Vector3(BUILDING_HALF_WIDTH + 0.08, y, 0),
      0xff3030,
      4,
    )
    root.add(fireLeader)
  }
  rebuildFireLabel(opts.fireFloor ?? null)

  /* ===== 4) 4 个方向角标（建筑底部四角） ===== */
  const dirGroup = new THREE.Group()
  dirGroup.name = 'directionCorners'
  const dirRadius = Math.max(BUILDING_HALF_WIDTH, BUILDING_HALF_DEPTH) + 0.35
  CORNER_DIRECTIONS.forEach(({ label, angle }) => {
    const sprite = makeTextSprite(label, '#ffffff', 'rgba(74,144,217,0.85)')
    sprite.position.set(
      Math.cos(angle) * dirRadius,
      0.08,
      Math.sin(angle) * dirRadius,
    )
    sprite.scale.set(0.24, 0.16, 1)
    dirGroup.add(sprite)
  })
  root.add(dirGroup)

  /* ===== 对外 API ===== */
  function setFireFloor(floor: number | null) {
    rebuildFireLabel(floor)
  }

  function setBuildingName(name: string) {
    rebuildBuildingName(name)
  }

  function dispose() {
    root.parent?.remove(root)
    disposeSubtree(root)
  }

  return {
    group: root,
    setFireFloor,
    setBuildingName,
    dispose,
  }
}
