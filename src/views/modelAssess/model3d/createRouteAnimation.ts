/*
 * @Description: 车辆路线动画系统（绿色路径 + 消防车沿 lat/lng 路线行进 + 可重播）
 * @FilePath: \ids-gis-web\src\views\modelAssess\model3d\createRouteAnimation.ts
 *
 * 数据源：useDispatchStore.navPathPlanData
 *   类型：Record<string, AmapDrivingResult | AmapDrivingResult[]>
 *   - key: 目的地点位字符串（'lon,lat'）
 *   - value: 单条结果 或 结果数组（每条 = 一辆消防车一条路径）
 *
 * 行为：
 *   - 每条 fullPath 渲染一条绿色 Tube 路径
 *   - 每条路径起点放一辆消防车（loadFireTruck GLB，失败用 BoxGeometry 红盒子）
 *   - 沿路径匀速行进，到达终点停止
 *   - 头部朝向：根据相邻路径点方向动态旋转
 *   - replay()：把所有车辆重置到路径起点，重新播放
 */
import * as THREE from 'three'
import { lonLatToLocalCoord, loadGLTF } from './commonThree'
import { maModelSetting } from './commonSetting'
import { makeTextSprite } from './createFireFacilities'

/* -----------------------------------------------------------------------
 * 常量
 * --------------------------------------------------------------------- */
/** 地面 y 高度（车辆/路线/标记都在这个高度，避免和地面 z-fighting） */
const GROUND_Y = 0.02
/**
 * 停车位距建筑中心的距离（m 世界单位）。
 * 建筑对角线半径 ≈ 0.16，加上 GLB 消防车长度（0.15 scale × ~6m）≈ 0.9 单位的一半 ≈ 0.45，
 * 0.50 保证车辆最前端贴着建筑体外侧、整体不侵入建筑体。
 */
const PARKING_DISTANCE = 0.50

/** 经纬度点 */
export type LngLat = [number, number]

/** 单条路径结果（与 useDispatchStore.navPathPlanData 单条元素一致） */
export interface NavPath {
  fullPath: LngLat[]
  tmcs?: any[]
  distanceMeters?: number
  durationSeconds?: number
}

/** 兼容两种形态：单条 OR 数组 */
export type NavPathPlanData = Record<string, NavPath | NavPath[]>

/**
 * 模块级导出：把单条路径的 fullPath 转换到场景局部坐标（与车辆动画内部 toLocalPoints 一致）。
 * 供综合图层（buildCompositeLayer）复用，独立计算水源 / 停车位的世界位置。
 *
 * 约定：
 * - 入参：fullPath（按 AMap 顺序，首=火点 / 末=水源）、pathKey（"lon,lat" 路径 basePoint）
 * - 出参：localPts（已在场景坐标系下：火点→(0,0,0) → 末点移到 PARKING_DISTANCE 停车位）
 *         + waterSource = 末点水源位置（局部坐标，未被末点覆盖前）
 */
export function computePathLocalPoints(
  fullPath: LngLat[],
  pathKey: string,
): { points: THREE.Vector3[]; waterSource: THREE.Vector3; parkingSpot: THREE.Vector3 } {
  // 反转后：[0]=水源、[last]=火点
  const reversed = [...fullPath].reverse()
  const parts = (pathKey || '').split(',')
  const pathBaseLon = Number(parts[0])
  const pathBaseLat = Number(parts[1])

  let localPts: THREE.Vector3[]
  if (!isNaN(pathBaseLon) && !isNaN(pathBaseLat)) {
    localPts = reversed.map(([lon, lat]) => {
      const dx = (lon - pathBaseLon) * 111319.9 / 100
      const dy = (lat - pathBaseLat) * 111319.9 / 100
      return new THREE.Vector3(dx, GROUND_Y, dy)
    })
  } else {
    localPts = reversed.map(([lon, lat]) => {
      const v = lonLatToLocalCoord(lon, lat, true) as THREE.Vector3
      return new THREE.Vector3(v.x, GROUND_Y, v.z)
    })
  }
  if (localPts.length === 0) {
    return { points: [], waterSource: new THREE.Vector3(), parkingSpot: new THREE.Vector3() }
  }

  // 记录水源位置（反转后第 0 点 = 原 fullPath 最后一点 = 水源）
  const waterSource = localPts[0].clone()

  // 第一步：把火点（最后一个点）偏移到原点
  const offset = localPts[localPts.length - 1].clone().negate()
  localPts.forEach((p) => p.add(offset))
  // 水源位置也要同步偏移
  waterSource.add(offset)

  // 第二步：把末点外推到停车位
  let parkingSpot = localPts[localPts.length - 1].clone()
  if (localPts.length >= 2) {
    const approachFromDir = localPts[0].clone()
    if (approachFromDir.lengthSq() > 1e-6) {
      approachFromDir.normalize()
      localPts[localPts.length - 1].copy(approachFromDir.multiplyScalar(PARKING_DISTANCE))
      parkingSpot = localPts[localPts.length - 1].clone()
    }
  }
  return { points: localPts, waterSource, parkingSpot }
}

/** 内部归一化：把单条 / 数组都拍平成数组 */
function normalizePlan(v: NavPath | NavPath[] | undefined): NavPath[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

/* -----------------------------------------------------------------------
 * 模块级公共工厂：水源 / 停车位 / 起点 / 终点 标识
 * 供综合图层（buildCompositeLayer）独立调用，不依赖 createRouteAnimationSystem
 * --------------------------------------------------------------------- */

/** 创建水源标识（蓝色圆柱 + "💧 水源" 文字，贴地平面） */
export function buildWaterSourceMarker(waterSource: THREE.Vector3): THREE.Group {
  const g = new THREE.Group()
  g.name = 'waterSourceMarker'
  // 蓝色圆柱（模拟消防水池 / 取水点）
  const baseGeo = new THREE.CylinderGeometry(0.2, 0.22, 0.12, 16)
  const baseMat = new THREE.MeshLambertMaterial({ color: 0x22aaff })
  const base = new THREE.Mesh(baseGeo, baseMat)
  base.position.set(waterSource.x, GROUND_Y + 0.06, waterSource.z)
  base.userData = { type: 'waterSource' }
  g.add(base)
  // 顶部蓝色水滴（半透明球）
  const dropGeo = new THREE.SphereGeometry(0.1, 16, 12)
  const dropMat = new THREE.MeshBasicMaterial({
    color: 0x44ccff,
    transparent: true,
    opacity: 0.7,
  })
  const drop = new THREE.Mesh(dropGeo, dropMat)
  drop.position.set(waterSource.x, GROUND_Y + 0.22, waterSource.z)
  g.add(drop)
  // 底部 6 段虚线圆环（强调"点位"）
  const RING_R = 0.32
  const ringSegs: THREE.Vector3[] = []
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2
    const a1 = ((i + 0.5) / 6) * Math.PI * 2
    ringSegs.push(
      new THREE.Vector3(
        waterSource.x + Math.cos(a0) * RING_R,
        GROUND_Y + 0.005,
        waterSource.z + Math.sin(a0) * RING_R,
      ),
    )
    ringSegs.push(
      new THREE.Vector3(
        waterSource.x + Math.cos(a1) * RING_R,
        GROUND_Y + 0.005,
        waterSource.z + Math.sin(a1) * RING_R,
      ),
    )
  }
  const ringGeo = new THREE.BufferGeometry().setFromPoints(ringSegs)
  const ringMat = new THREE.LineBasicMaterial({ color: 0x22aaff })
  g.add(new THREE.LineSegments(ringGeo, ringMat))
  // 文字标牌
  const label = makeTextSprite('💧 水源', '#ffffff', 'rgba(34,170,255,0.95)')
  label.position.set(waterSource.x, GROUND_Y + 0.5, waterSource.z)
  label.scale.set(0.5, 0.2, 1)
  g.add(label)
  return g
}

/** 创建消防车位标识（黄色虚线矩形 + "🚒 消防车位" 文字，贴地平面） */
export function buildParkingSpotMarker(
  parkingSpot: THREE.Vector3,
  approachFromDir: THREE.Vector3,
): THREE.Group {
  const g = new THREE.Group()
  g.name = 'parkingSpotMarker'
  const LENGTH = 0.42
  const WIDTH = 0.24
  const tangent = new THREE.Vector3(-approachFromDir.z, 0, approachFromDir.x)
  if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0)
  else tangent.normalize()
  const halfL = LENGTH / 2
  const halfW = WIDTH / 2
  const mkCorner = (sx: number, sz: number) =>
    parkingSpot
      .clone()
      .add(approachFromDir.clone().multiplyScalar(sx * halfL))
      .add(tangent.clone().multiplyScalar(sz * halfW))
  const corners = [mkCorner(1, 1), mkCorner(1, -1), mkCorner(-1, -1), mkCorner(-1, 1)]
  // 4 条边，每条用 6 段黄色虚线
  for (let i = 0; i < 4; i++) {
    g.add(makeDashedLinePublic(corners[i], corners[(i + 1) % 4], 0xffcc00, 6))
  }
  const label = makeTextSprite('🚒 消防车位', '#000000', 'rgba(255,204,0,0.95)')
  label.position.set(parkingSpot.x, GROUND_Y + 0.18, parkingSpot.z)
  label.scale.set(0.5, 0.2, 1)
  g.add(label)
  return g
}

/** 模块级虚线段工厂（与 createRouteAnimation 内部的 makeDashedLine 一致） */
function makeDashedLinePublic(
  start: THREE.Vector3,
  end: THREE.Vector3,
  color: number,
  dashCount = 6,
  y = GROUND_Y + 0.005,
): THREE.Group {
  const g = new THREE.Group()
  const dx = end.x - start.x
  const dz = end.z - start.z
  const totalLen = Math.hypot(dx, dz)
  if (totalLen < 1e-6) return g
  const segLen = totalLen / dashCount
  const dashLen = segLen * 0.55
  const mat = new THREE.LineBasicMaterial({ color })
  for (let i = 0; i < dashCount; i++) {
    const t0 = (i * segLen) / totalLen
    const t1 = (i * segLen + dashLen) / totalLen
    const s = new THREE.Vector3(start.x + dx * t0, y, start.z + dz * t0)
    const e = new THREE.Vector3(start.x + dx * t1, y, start.z + dz * t1)
    const geo = new THREE.BufferGeometry().setFromPoints([s, e])
    g.add(new THREE.Line(geo, mat))
  }
  return g
}

/** 单条路径的可视化（绿线 + 车辆 + 起终点/停车位标记） */
interface RouteVisual {
  key: string
  line: THREE.Mesh | null
  startMarker: THREE.Group | null
  endMarker: THREE.Group | null
  /** 停车位标识（黄色虚线矩形 + 文字，贴在建筑体外侧地面） */
  parkingMarker: THREE.Group | null
  vehicle: THREE.Object3D | null
  /** 已转换为局部坐标的 Vector3 列表 */
  points: THREE.Vector3[]
  /** 当前动画进度 0~1 */
  progress: number
  /** 路径总长度（沿折线累加，保留以备未来用） */
  totalLength: number
}

/** 动画系统对外暴露的 API */
export interface RouteAnimationController {
  /** 启动 / 替换当前动画 */
  play: (planData: NavPathPlanData, options?: { durationMs?: number; autoStart?: boolean }) => void
  /** 重播：把车辆重置到起点，重新播放 */
  replay: () => void
  /** 停止：动画停在当前位置 */
  stop: () => void
  /** 是否正在播放 */
  isPlaying: () => boolean
  /** 当前全局进度 0~1（取所有路径平均） */
  getProgress: () => number
  /** 清理：删除所有绿线 + 车辆 */
  dispose: () => void
  /** 获取所有路径点的包围盒（用于相机自动框选） */
  getBoundingBox: () => { min: THREE.Vector3; max: THREE.Vector3 } | null
  /** 获取第一条路径的起终点（起点 = 车辆出发点，终点 = 停车位/建筑旁），用于相机定位 */
  getRouteEndpoints: () => { startPoint: THREE.Vector3; parkingSpot: THREE.Vector3 } | null
  /** 获取某条路径上车辆当前位置 + 运动方向（用于 chase camera） */
  getCurrentVehicleState: (routeIndex?: number) => {
    position: THREE.Vector3
    direction: THREE.Vector3
    progress: number
  } | null
  /** 路径数量 */
  getRouteCount: () => number
}

interface CreateOpts {
  /** 是否使用 GLB 真实车辆（失败降级为 Box） */
  useRealModel?: boolean
  /** 动画总时长（毫秒） */
  defaultDurationMs?: number
  /** 车辆 y 高度（贴地） */
  vehicleY?: number
}

/**
 * 创建一个路线动画系统，挂载在指定 group 下
 */
export function createRouteAnimationSystem(
  parent: THREE.Group,
  opts: CreateOpts = {},
): RouteAnimationController {
  const { useRealModel = true, defaultDurationMs = 8000, vehicleY = GROUND_Y } = opts

  const routes: RouteVisual[] = []
  let rafId = 0
  let playing = false
  let startTime = 0
  let durationMs = defaultDurationMs
  let lastPlan: NavPathPlanData | null = null

  /* -------- 工具：根据路径前两点计算车头朝向（车头默认 +x，减 π/2 对齐 atan2 角） -------- */
  function computeHeadingY(p0: THREE.Vector3, p1: THREE.Vector3): number {
    const dx = p1.x - p0.x
    const dz = p1.z - p0.z
    return dx === 0 && dz === 0 ? 0 : Math.atan2(dx, dz) - Math.PI / 2
  }

  /* -------- 工具：累加折线总长 -------- */
  function polylineLength(pts: THREE.Vector3[]): number {
    let total = 0
    for (let i = 1; i < pts.length; i++) total += pts[i].distanceTo(pts[i - 1])
    return total
  }

  /* -------- 工具：lng/lat 列表 → 局部 Vector3 列表 --------
   * 内部 toLocalPoints 直接复用模块级 computePathLocalPoints（见文件顶部），
   * 综合图层 buildCompositeLayer 也用同一个函数计算水源 / 停车位 → 保证坐标一致。
   */
  function toLocalPoints(fullPath: LngLat[], pathKey: string): THREE.Vector3[] {
    return computePathLocalPoints(fullPath, pathKey).points
  }

  /* -------- 工具：基于 CatmullRom 曲线创建绿色 Tube 路径 -------- */
  function buildGreenRouteLine(points: THREE.Vector3[]): THREE.Mesh | null {
    if (points.length < 2) return null
    let curve: THREE.Curve<THREE.Vector3>
    if (points.length === 2) {
      // 两点：构造一条直线段
      curve = new THREE.LineCurve3(points[0], points[1])
    } else {
      curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5)
    }
    const tubularSegments = Math.max(8, points.length * 4)
    const tubeRadius = 0.08  // 加大管径（原 0.015 太细，几乎看不见）
    const tube = new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, 8, false)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x22ff66,
      transparent: false,  // 不透明，避免被其他透明物体遮挡
    })
    const mesh = new THREE.Mesh(tube, mat)
    mesh.userData = { type: 'routeLine' }
    return mesh
  }

  /* -------- 工具：创建路径起点的虚线脉冲圆环（强调起点） -------- */
  function buildStartMarker(point: THREE.Vector3): THREE.Group {
    const g = new THREE.Group()
    // 外圈大环（贴地）
    const ringGeo = new THREE.RingGeometry(0.25, 0.4, 32)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22ff66,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(point.x, GROUND_Y + 0.01, point.z)
    ring.userData = { type: 'routeStart' }
    g.add(ring)
    // 中心实心球（更醒目）
    const ballGeo = new THREE.SphereGeometry(0.12, 16, 16)
    const ballMat = new THREE.MeshBasicMaterial({ color: 0x44ff88 })
    const ball = new THREE.Mesh(ballGeo, ballMat)
    ball.position.set(point.x, GROUND_Y + 0.08, point.z)
    g.add(ball)
    return g
  }

  /* -------- 工具：创建路径终点的红色目标标记 -------- */
  function buildEndMarker(point: THREE.Vector3): THREE.Group {
    const g = new THREE.Group()
    // 十字星（X-Z 平面）— 用 2 个细长 Box 交叉，贴着地面
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xff3030 })
    const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.1), crossMat)
    h1.position.set(point.x, GROUND_Y + 0.04, point.z)
    const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.7), crossMat)
    h2.position.set(point.x, GROUND_Y + 0.04, point.z)
    g.add(h1, h2)
    // 顶部小立方（终点方块）
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.25, 0.25),
      new THREE.MeshBasicMaterial({ color: 0xff5050 }),
    )
    cube.position.set(point.x, GROUND_Y + 0.25, point.z)
    g.add(cube)
    return g
  }

  /* -------- 工具：创建停车位标识（黄色虚线矩形 + "P" 文字，贴地平面） -------- */
  function buildParkingMarker(spot: THREE.Vector3, approachFromDir: THREE.Vector3): THREE.Group {
    const g = new THREE.Group()
    // 长边沿接近方向（车头朝向停车位入口），短边垂直于接近方向
    const LENGTH = 0.42  // 沿接近方向（车头-车尾方向）
    const WIDTH = 0.24   // 垂直于接近方向
    // 水平面上，垂直于 approachFromDir 的切向
    const tangent = new THREE.Vector3(-approachFromDir.z, 0, approachFromDir.x)
    if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0)
    else tangent.normalize()
    const halfL = LENGTH / 2
    const halfW = WIDTH / 2
    // 4 个角点（中心 + 4 向量）
    const mkCorner = (sx: number, sz: number) =>
      spot
        .clone()
        .add(approachFromDir.clone().multiplyScalar(sx * halfL))
        .add(tangent.clone().multiplyScalar(sz * halfW))
    const corners = [
      mkCorner(1, 1),
      mkCorner(1, -1),
      mkCorner(-1, -1),
      mkCorner(-1, 1),
    ]
    // 4 条边，每条用 6 段黄色虚线
    for (let i = 0; i < 4; i++) {
      g.add(makeDashedLine(corners[i], corners[(i + 1) % 4], 0xffcc00, 6, GROUND_Y + 0.005))
    }
    // "🚒 消防车位" 文字浮在停车位中心略上方
    const label = makeTextSprite('🚒 消防车位', '#000000', 'rgba(255,204,0,0.95)')
    label.position.set(spot.x, GROUND_Y + 0.18, spot.z)
    label.scale.set(0.5, 0.2, 1)
    g.add(label)
    return g
  }

  /* -------- 工具：N 段虚线段（WebGL 不支持 linewidth，所以用多段短线模拟） -------- */
  function makeDashedLine(
    start: THREE.Vector3,
    end: THREE.Vector3,
    color: number,
    dashCount = 6,
    y = GROUND_Y + 0.005,
  ): THREE.Group {
    const g = new THREE.Group()
    const dx = end.x - start.x
    const dz = end.z - start.z
    const totalLen = Math.hypot(dx, dz)
    if (totalLen < 1e-6) return g
    const segLen = totalLen / dashCount
    const dashLen = segLen * 0.55
    const mat = new THREE.LineBasicMaterial({ color })
    for (let i = 0; i < dashCount; i++) {
      const t0 = (i * segLen) / totalLen
      const t1 = (i * segLen + dashLen) / totalLen
      const s = new THREE.Vector3(start.x + dx * t0, y, start.z + dz * t0)
      const e = new THREE.Vector3(start.x + dx * t1, y, start.z + dz * t1)
      const geo = new THREE.BufferGeometry().setFromPoints([s, e])
      g.add(new THREE.Line(geo, mat))
    }
    return g
  }

  /* -------- 工具：创建消防车（GLB / 降级 Box） -------- */
  async function buildVehicle(): Promise<THREE.Object3D> {
    if (useRealModel) {
      try {
        const gltf = await loadGLTF(`${maModelSetting.assetBase}/xf_fire_truck.glb`)
        const m = gltf.scene as THREE.Object3D
        m.scale.setScalar(0.15)  // 加大（原 0.06 太小）
        m.userData = { type: 'fireTruck', name: '消防车' }
        return m
      } catch {
        // 降级
      }
    }
    // 降级：红盒子（更醒目）
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.25, 0.3),
      new THREE.MeshLambertMaterial({ color: 0xff2233, emissive: 0x441111 }),
    )
    mesh.userData = { type: 'fireTruck', name: '消防车' }
    return mesh
  }

  /* -------- 主循环：根据 progress 更新所有车辆位置/朝向 -------- */
  function tickAll() {
    if (!playing) return
    const tGlobal = Math.min((performance.now() - startTime) / durationMs, 1)

    routes.forEach((r) => {
      const v = r.vehicle
      if (!v || r.points.length < 2) return
      const segCount = r.points.length - 1
      const idx = Math.min(Math.floor(tGlobal * segCount), segCount - 1)
      const frac = tGlobal * segCount - idx
      const p1 = r.points[idx]
      const p2 = r.points[idx + 1]
      // 位置：按 frac 线性插值
      v.position.set(
        p1.x + (p2.x - p1.x) * frac,
        vehicleY,
        p1.z + (p2.z - p1.z) * frac,
      )
      // 朝向：看向下一段（车头对齐 +x，减 π/2）
      v.rotation.y = computeHeadingY(p1, p2)
      r.progress = tGlobal
    })

    if (tGlobal < 1) {
      rafId = requestAnimationFrame(tickAll)
    } else {
      playing = false
    }
  }

  /* -------- 清理 -------- */
  function clearAll() {
    cancelAnimationFrame(rafId)
    playing = false
    routes.forEach((r) => {
      if (r.line) parent.remove(r.line)
      if (r.startMarker) parent.remove(r.startMarker)
      if (r.endMarker) parent.remove(r.endMarker)
      if (r.parkingMarker) parent.remove(r.parkingMarker)
      if (r.vehicle) parent.remove(r.vehicle)
    })
    routes.length = 0
  }

  /* -------- 对外 API：play -------- */
  function play(planData: NavPathPlanData, options?: { durationMs?: number; autoStart?: boolean }) {
    lastPlan = planData
    durationMs = options?.durationMs ?? defaultDurationMs
    const autoStart = options?.autoStart !== false

    clearAll()

    // 构建所有路径的可视化（绿线 + 起终点标记 + 停车位 + 占位车辆）
    Object.entries(planData).forEach(([key, rawVal]) => {
      const arr = normalizePlan(rawVal as NavPath | NavPath[])
      arr.forEach((nav) => {
        if (!nav.fullPath || nav.fullPath.length < 2) return
        const pts = toLocalPoints(nav.fullPath, key)
        // 视觉元素
        const line = buildGreenRouteLine(pts)
        if (line) parent.add(line)
        const startMarker = buildStartMarker(pts[0])
        const endMarker = buildEndMarker(pts[pts.length - 1])
        parent.add(startMarker)
        parent.add(endMarker)
        // 停车位标识：黄色虚线矩形 + "🚒 消防车位"（贴着地面，末点已在建筑体外侧）
        let parkingMarker: THREE.Group | null = null
        const approachFromDir = pts[0].clone()
        if (approachFromDir.lengthSq() > 1e-6) {
          approachFromDir.normalize()
          parkingMarker = buildParkingMarker(pts[pts.length - 1], approachFromDir)
          parent.add(parkingMarker)
        }
        // 占位车辆（async 加载真实 GLB 后会被替换）
        const placeholder = new THREE.Object3D()
        placeholder.position.set(pts[0].x, vehicleY, pts[0].z)
        if (pts.length >= 2) {
          placeholder.rotation.y = computeHeadingY(pts[0], pts[1])
        }
        placeholder.userData = { type: 'fireTruck', name: '消防车', loading: true }
        parent.add(placeholder)
        routes.push({
          key,
          line,
          startMarker,
          endMarker,
          parkingMarker,
          vehicle: placeholder,
          points: pts,
          progress: 0,
          totalLength: polylineLength(pts),
        })
      })
    })

    // 异步加载真实车辆 GLB，替换占位
    loadRealVehiclesAsync()

    if (autoStart) start()
  }

  function loadRealVehiclesAsync() {
    Promise.all(routes.map(() => buildVehicle()))
      .then((vehicles) => {
        routes.forEach((r, i) => {
          if (!r.vehicle) return
          parent.remove(r.vehicle)
          const v = vehicles[i]
          v.position.copy(r.vehicle.position)
          v.rotation.copy(r.vehicle.rotation)
          parent.add(v)
          r.vehicle = v
        })
      })
      .catch((e) => {
        console.error('[createRouteAnimation] 加载车辆失败', e)
      })
  }

  function start() {
    startTime = performance.now()
    playing = true
    cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(tickAll)
  }

  /* -------- 对外 API：replay -------- */
  function replay() {
    if (!lastPlan) return
    // 重置：把车辆移回起点 + 重新计时
    routes.forEach((r) => {
      if (!r.vehicle || r.points.length === 0) return
      r.vehicle.position.set(r.points[0].x, vehicleY, r.points[0].z)
      r.vehicle.rotation.set(
        0,
        r.points.length >= 2 ? computeHeadingY(r.points[0], r.points[1]) : 0,
        0,
      )
      r.progress = 0
    })
    start()
  }

  /* -------- 对外 API：stop -------- */
  function stop() {
    playing = false
    cancelAnimationFrame(rafId)
  }

  function isPlaying() {
    return playing
  }

  function getProgress() {
    if (routes.length === 0) return 0
    return routes.reduce((s, r) => s + r.progress, 0) / routes.length
  }

  function dispose() {
    clearAll()
    lastPlan = null
  }

  /** 计算所有路径点的 AABB（用于相机自动框选） */
  function getBoundingBox() {
    if (routes.length === 0) return null
    const min = new THREE.Vector3(Infinity, Infinity, Infinity)
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
    routes.forEach((r) => {
      r.points.forEach((p) => {
        min.min(p)
        max.max(p)
      })
    })
    return { min, max }
  }

  /** 获取第一条路径的起终点（起点 = 车辆出发点，终点 = 停车位/建筑旁），用于相机定位 */
  function getRouteEndpoints() {
    if (routes.length === 0) return null
    const r = routes[0]
    if (!r || r.points.length === 0) return null
    return {
      startPoint: r.points[0].clone(),
      parkingSpot: r.points[r.points.length - 1].clone(),
    }
  }

  /** 获取某条路径上车辆当前状态（位置 + 运动方向） */
  function getCurrentVehicleState(routeIndex = 0) {
    const r = routes[routeIndex]
    if (!r || !r.vehicle || r.points.length < 2) return null
    // 用 progress 推算当前段
    const t = Math.max(0, Math.min(1, r.progress))
    const segCount = r.points.length - 1
    const segIdx = Math.min(Math.floor(t * segCount), segCount - 1)
    // 取段首尾的方向作为运动方向
    const dir = new THREE.Vector3().subVectors(r.points[segIdx + 1], r.points[segIdx])
    if (dir.lengthSq() < 1e-6) {
      // 退化（段长度为 0）→ 用前一段的方向
      if (segIdx > 0) {
        dir.subVectors(r.points[segIdx], r.points[segIdx - 1])
      }
    }
    if (dir.lengthSq() > 1e-6) dir.normalize()
    else dir.set(0, 0, 1)
    return {
      position: r.vehicle.position.clone(),
      direction: dir,
      progress: t,
    }
  }

  function getRouteCount() {
    return routes.length
  }

  return {
    play,
    replay,
    stop,
    isPlaying,
    getProgress,
    dispose,
    getBoundingBox,
    getRouteEndpoints,
    getCurrentVehicleState,
    getRouteCount,
  }
}
