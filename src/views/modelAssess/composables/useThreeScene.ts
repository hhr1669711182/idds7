/*
 * @Description: 通用 3D 场景 composable（高内聚低耦合：5 个 builder + 6 个 update）
 * @FilePath: \ids-gis-web\src\views\modelassess\composables\useThreeScene.ts
 */
import { reactive, shallowRef, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { maModelSetting } from '../model3d/commonSetting'
import { createWhiteBuildings } from '../model3d/createWhiteBuildings'
import {
  createBuildingByFloors,
  type FloorGroupRefs,
} from '../model3d/createBuildingByFloors'
import { loadFireTruck, loadFireFighter, loadFireHydrant } from '../model3d/createFireFacilities'
import { createFireSprite, createSmokeSprites } from '../model3d/generateFireSprite'
import { directionToAngle } from '../model3d/createTrappedMarkers'
import { createPersonMesh } from '../model3d/createPersonMesh'
import { makeTextSprite } from '../model3d/createFireFacilities'
import {
  createRouteAnimationSystem,
  computePathLocalPoints,
  buildWaterSourceMarker,
  buildParkingSpotMarker,
  type RouteAnimationController,
  type NavPathPlanData,
  type LngLat,
  type NavPath,
} from '../model3d/createRouteAnimation'
import { useDispatchStore } from '@/store/useDispatchStore'
import {
  createBuildingAnnotations,
  type BuildingAnnotationRefs,
} from '../model3d/createBuildingAnnotations'
import type { TrappedFloorItem, MasterAlarm, RealtimeFactors } from '@/const/const.modelAssess'

/** 拾取事件数据 */
export interface PickComponentInfo {
  type: 'floor' | 'trappedPerson' | 'hydrant' | 'fireTruck' | 'fireFighter'
  uuid?: string
  floor?: number
  name?: string
  count?: number
  direction?: string
}

export interface UseThreeSceneOptions {
  container: HTMLElement
  mode: 'masterAlarm' | 'similarAlarm' | 'trappedLayer'
  masterAlarm?: MasterAlarm
  realtimeFactors?: RealtimeFactors
  trappedFloors?: TrappedFloorItem[]
  /** 是否允许用户拖拽（默认 true；相似卡片内 false） */
  interactive?: boolean
  /** 主警情三维数据 */
  totalFloors?: number
  buildingHeight?: number
  /** 路线动画数据（来自 useDispatchStore.navPathPlanData），未传则自动从 store 读取 */
  routePlan?: NavPathPlanData
  /** 路线动画总时长（毫秒） */
  routeDurationMs?: number
  /** 事件回调 */
  onPickFloor?: (floor: number) => void
  onPickMarker?: (uuid: string) => void
  onPickComponent?: (info: PickComponentInfo) => void
}

/** 主入口 composable */
export function useThreeScene(opts: UseThreeSceneOptions) {
  // ---------- 场景状态 ----------
  const state = reactive({
    loaded: false,
    modelLoaded: false,
  })

  /** 是否为主警情场景（路线动画 / 复杂效果仅主警情启用） */
  const isMaster = opts.mode === 'masterAlarm'

  // 用 shallowRef 避免深度响应（Three.js 内部对象）
  const sceneRef = shallowRef<THREE.Scene | null>(null)
  const cameraRef = shallowRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = shallowRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = shallowRef<OrbitControls | null>(null)
  const layerGroupRef = shallowRef<{
    composite: THREE.Group
    vehicles: THREE.Group
    water: THREE.Group
  } | null>(null)
  /** 路线动画专用 group（始终可见） */
  const routeGroupRef = shallowRef<THREE.Group | null>(null)
  const floorRefsRef = shallowRef<FloorGroupRefs | null>(null)
  const fireSpriteRef = shallowRef<THREE.Sprite | null>(null)
  const smokeSpritesRef = shallowRef<THREE.Sprite[]>([])
  const trappedMeshesRef = shallowRef<THREE.Group[]>([])
  const hydrantMeshesRef = shallowRef<THREE.Mesh[]>([])
  const vehicleMeshesRef = shallowRef<THREE.Object3D[]>([])
  const raycasterRef = shallowRef<THREE.Raycaster | null>(null)
  const mixerRef = shallowRef<THREE.AnimationMixer | null>(null)
  const routeAnimRef = shallowRef<RouteAnimationController | null>(null)
  /** 建筑标注系统（高度标尺 + 建筑信息 + 方向角） */
  const annotationRefsRef = shallowRef<BuildingAnnotationRefs | null>(null)
  /** 综合图层上的静态路径标识（水源 + 停车位），跟着 routePlan 变化重建 */
  const pathStaticMarkersRef = shallowRef<THREE.Group | null>(null)

  let lastTime = 0
  let animateId = 0
  let resizeObs: ResizeObserver | null = null
  const isSimilar = opts.mode === 'similarAlarm'

  /* 跟随相机（chase camera）状态 */
  let followVehicleEnabled = false
  let followCameraRafId = 0

  /* -------------------- 初始化 -------------------- */
  function init() {
    if (state.loaded) return

    // Scene
    // ★ 修复"拉远变灰变黑"：用天蓝色作为背景，并禁用雾效（让远处物体保留原色，不会被雾色覆盖变灰）
    const scene = new THREE.Scene()
    scene.background = isSimilar ? null : new THREE.Color(0x00344)
    // 不设置 scene.fog，避免远处物体被雾色覆盖成灰色
    sceneRef.value = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(
      isSimilar ? 40 : 55,
      Math.max(1, opts.container.clientWidth) / Math.max(1, opts.container.clientHeight),
      0.1,
      1000,
    )
    if (isSimilar) {
      camera.position.set(2, 1.5, 2)
    } else {
      const pos = maModelSetting.cameraInit
      camera.position.set(pos.x, pos.y, pos.z)
    }
    camera.lookAt(0, isSimilar ? 0.5 : 1, 0)
    cameraRef.value = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: isSimilar })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(opts.container.clientWidth || 100, opts.container.clientHeight || 100)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    renderer.setClearColor(0x000000, 0)
    opts.container.appendChild(renderer.domElement)
    rendererRef.value = renderer

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = maModelSetting.cameraLimits.minDistance
    controls.maxDistance = maModelSetting.cameraLimits.maxDistance
    controls.target.set(0, isSimilar ? 0.5 : 1, 0)
    controls.enabled = opts.interactive !== false
    controlsRef.value = controls

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const dir = new THREE.DirectionalLight(0xffffff, 1.2)
    dir.position.set(5, 10, 5)
    scene.add(dir)
    const fill = new THREE.DirectionalLight(0x6688ff, 0.4)
    fill.position.set(-5, 3, -5)
    scene.add(fill)

    // 地面（仅主警情显示）
    if (!isSimilar) {
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20, 20, 20),
        new THREE.MeshBasicMaterial({
          color: 0x131826,
          wireframe: true,
          transparent: true,
          opacity: 0.3,
        }),
      )
      ground.rotation.x = -Math.PI / 2
      scene.add(ground)
    }

    // 三个图层子组（受顶部 tab 显隐控制）
    const layerGroup = {
      composite: new THREE.Group(),
      vehicles: new THREE.Group(),
      water: new THREE.Group(),
    }
    scene.add(layerGroup.composite, layerGroup.vehicles, layerGroup.water)
    layerGroupRef.value = layerGroup

    // 路线动画专用 group（不受 tab 显隐控制 — 任何标签下都能看到绿色路径 + 车辆）
    const routeGroup = new THREE.Group()
    routeGroup.name = 'routeAnimationLayer'
    scene.add(routeGroup)
    routeGroupRef.value = routeGroup

    // Raycaster
    const raycaster = new THREE.Raycaster()
    raycasterRef.value = raycaster

    // 绑定点击
    renderer.domElement.addEventListener('click', (e) => handleClick(e))

    // Resize
    resizeObs = new ResizeObserver(() => resize())
    resizeObs.observe(opts.container)

    state.loaded = true
    startAnimate()
  }

  // 监听 dispatch store 中的路径数据，自动重建综合图层上的水源/停车位标识
  if (isMaster) {
    watch(
      () => useDispatchStore().navPathPlanData,
      () => {
        if (layerGroupRef.value) {
          rebuildPathStaticMarkers(layerGroupRef.value.composite)
        }
      },
      { deep: true },
    )
  }

  /* -------------------- 5 个独立 builder -------------------- */

  // 1) 综合图层（白模 + 主建筑 + 建筑标注 + 水源 / 停车位）
  async function buildCompositeLayer() {
    if (!layerGroupRef.value) return
    const g = layerGroupRef.value.composite
    // 白模
    createWhiteBuildings(g)
    // 主建筑
    const totalFloors = opts.totalFloors || 32
    const buildingHeight = opts.buildingHeight || 96
    const floorRefs = createBuildingByFloors(totalFloors, buildingHeight)
    g.add(floorRefs.group)
    floorRefsRef.value = floorRefs
    // 建筑标注（楼层标尺 + 建筑信息 + 方向角标）— 仅主警情启用
    if (isMaster && !annotationRefsRef.value) {
      const refs = createBuildingAnnotations({
        totalFloors,
        totalRealHeightM: buildingHeight,
        // 建筑名 / 起火层通过 update 接口动态设置
      })
      g.add(refs.group)
      annotationRefsRef.value = refs
    }
    // 水源 / 停车位标识（仅主警情 + 有路径数据时）— 静态展示，作为"作战部署"
    if (isMaster) {
      rebuildPathStaticMarkers(g)
    }
  }

  /** 重建综合图层上的"水源 + 停车位"静态标识（跟着 routePlan 变化而更新） */
  function rebuildPathStaticMarkers(parent: THREE.Group) {
    // 清理旧
    if (pathStaticMarkersRef.value) {
      parent.remove(pathStaticMarkersRef.value)
      disposeObject3D(pathStaticMarkersRef.value)
      pathStaticMarkersRef.value = null
    }
    // 找第一条有效路径
    const plan = (opts.routePlan ?? (useDispatchStore().navPathPlanData as NavPathPlanData)) || {}
    const firstKey = Object.keys(plan)[0]
    if (!firstKey) return
    const rawVal = plan[firstKey]
    const arr = normalizeStaticPlan(rawVal as NavPath | NavPath[])
    const nav = arr.find((n) => n.fullPath && n.fullPath.length >= 2)
    if (!nav) return
    // 用与 createRouteAnimation 同一份算法算出水源 / 停车位
    const { waterSource, parkingSpot } = computePathLocalPoints(nav.fullPath as LngLat[], firstKey)
    const approachFromDir = waterSource.clone()
    if (approachFromDir.lengthSq() < 1e-6) return
    approachFromDir.normalize()
    const group = new THREE.Group()
    group.name = 'pathStaticMarkers'
    group.add(buildWaterSourceMarker(waterSource))
    group.add(buildParkingSpotMarker(parkingSpot, approachFromDir))
    parent.add(group)
    pathStaticMarkersRef.value = group
  }

  /** 释放一个 Object3D 子树的几何/材质 */
  function disposeObject3D(obj: THREE.Object3D) {
    obj.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose())
        else o.material.dispose()
      }
    })
  }

  /** 拍平 NavPath | NavPath[] */
  function normalizeStaticPlan(v: NavPath | NavPath[] | undefined): NavPath[] {
    if (!v) return []
    return Array.isArray(v) ? v : [v]
  }

  // 2) 消防车辆 + 路线动画
  async function buildVehiclesLayer() {
    if (!layerGroupRef.value) return
    const g = layerGroupRef.value.vehicles
    vehicleMeshesRef.value = []

    // 2.1 路线动画系统（绿色路径 + 车辆沿经纬度路线行进）
    // 关键：挂在专用 routeGroup（始终 visible），不受顶部 tab 显隐影响
    if (isMaster) {
      if (!routeAnimRef.value) {
        const parent = routeGroupRef.value ?? layerGroupRef.value.vehicles
        routeAnimRef.value = createRouteAnimationSystem(parent, {
          useRealModel: true,
          defaultDurationMs: opts.routeDurationMs ?? 8000,
          // vehicleY 默认走 GROUND_Y（=0.02，贴地），传 0 即可
        })
      }
      // 读取路线数据：优先用 props 传入的，否则从 dispatch store 读取
      const plan = opts.routePlan ?? (useDispatchStore().navPathPlanData as NavPathPlanData)
      if (plan && Object.keys(plan).length > 0) {
        routeAnimRef.value.play(plan, { autoStart: true })
      }
    }

    // 2.2 默认静态车辆（无路线数据时仍展示一辆车）
    try {
      const truck = await loadFireTruck(g, [
        maModelSetting.basePoint.baseLon + 0.001,
        maModelSetting.basePoint.baseLat - 0.0005,
      ])
      vehicleMeshesRef.value.push(truck)
      const mixer = await loadFireFighter(g)
      if (mixer) mixerRef.value = mixer
    } catch (e) {
      console.warn('[useThreeScene] 加载消防车失败', e)
    }
  }

  /* -------------------- 路线动画对外控制 -------------------- */
  function playRouteAnimation(planData?: NavPathPlanData, options?: { durationMs?: number }) {
    if (!layerGroupRef.value) {
      console.warn('[useThreeScene] 场景未初始化，无法播放路线动画')
      return
    }
    // 兜底：若 buildVehiclesLayer 还没建好系统，按需懒初始化
    if (!routeAnimRef.value) {
      const parent = routeGroupRef.value ?? layerGroupRef.value.vehicles
      routeAnimRef.value = createRouteAnimationSystem(parent, {
        useRealModel: true,
        defaultDurationMs: opts.routeDurationMs ?? 8000,
        // vehicleY 默认 GROUND_Y（贴地 0.02）
      })
    }
    const plan = planData ?? (opts.routePlan ?? (useDispatchStore().navPathPlanData as NavPathPlanData))
    if (!plan || Object.keys(plan).length === 0) {
      console.warn('[useThreeScene] 暂无路线数据，无法播放')
      return
    }
    try {
      routeAnimRef.value.play(plan, {
        durationMs: options?.durationMs ?? opts.routeDurationMs ?? 8000,
        autoStart: true,
      })
      // 播放成功：先 fit 相机到路线范围（让用户看到路径），然后启动 chase camera
      requestAnimationFrame(() => {
        fitCameraToRoute()
        // 短暂延迟后启动跟随（让用户先看到整体路径）
        setTimeout(() => {
          if (routeAnimRef.value?.isPlaying()) {
            startFollowVehicle()
          }
        }, 800)
      })
    } catch (e: any) {
      console.error('[useThreeScene] routeAnim.play 异常', e)
    }
  }

  /**
   * 自动框选相机到当前路线范围（恢复全景视角）
   *
   * lookAt 选 **建筑点**（模型中心 = 路径终点 / 停车位所在位置），
   * 相机位置按 AABB 半径 + 抬升，确保整条路径 + 起点都在视野内，
   * 建筑作为画面中心、路径从中延伸出去。
   */
  function fitCameraToRoute() {
    const anim = routeAnimRef.value
    const cam = cameraRef.value
    const ctl = controlsRef.value
    if (!anim || !cam || !ctl) {
      console.warn('[useThreeScene] fitCameraToRoute: 缺少 routeAnim/camera/controls')
      return
    }
    const box = anim.getBoundingBox()
    if (!box) return
    const size = new THREE.Vector3().subVectors(box.max, box.min)
    const radius = Math.max(size.x, size.z, 2) // 路径半径，最小 2 避免太近

    // 视觉焦点：建筑点（停车位 / 路径终点，紧贴建筑），它是模型中心
    const endpoints = anim.getRouteEndpoints?.()
    const target = endpoints?.parkingSpot
      ? endpoints.parkingSpot.clone()
      : new THREE.Vector3().addVectors(box.min, box.max).multiplyScalar(0.5)

    // 相机放在建筑点外侧、俯视 45°，抬高一点确保不被地面挡住
    cam.position.set(
      target.x + radius * 1.4,
      target.y + Math.max(radius * 0.9, 1.5),
      target.z + radius * 1.4,
    )
    cam.lookAt(target.x, target.y + 0.3, target.z)
    ctl.target.set(target.x, target.y + 0.3, target.z)
    ctl.update()
  }

  /* ===================== 跟随车辆（chase camera）===================== */
  /**
   * 启动 chase camera：相机持续跟随动画中的第一辆车
   * - 位于车辆后方 3.5 个单位（沿运动反方向）
   * - 高于车辆 2.2 个单位
   * - 始终注视车辆
   */
  function startFollowVehicle() {
    if (followVehicleEnabled) return
    followVehicleEnabled = true
    // 跟随期间禁用 OrbitControls（避免用户拖动 + chase camera 互相打架）
    if (controlsRef.value) controlsRef.value.enabled = false
    const tick = () => {
      if (!followVehicleEnabled) {
        followCameraRafId = 0
        return
      }
      // 动画结束 → 自动停止跟随，释放相机
      if (!routeAnimRef.value?.isPlaying()) {
        stopFollowVehicle()
        return
      }
      if (!routeAnimRef.value || !cameraRef.value || !controlsRef.value) {
        followCameraRafId = requestAnimationFrame(tick)
        return
      }
      const state = routeAnimRef.value.getCurrentVehicleState?.(0)
      if (!state) {
        // 还没有车辆数据 → 继续等
        followCameraRafId = requestAnimationFrame(tick)
        return
      }
      // 相机位置 = 车辆位置 - 运动方向 * 距离 + 上方高度
      const dir = state.direction
      const back = dir.clone().multiplyScalar(-3.5)
      const up = new THREE.Vector3(0, 2.2, 0)
      const targetCamPos = state.position.clone().add(back).add(up)
      // 平滑过渡：lerp 当前相机位置 → 目标位置（避免抖动）
      cameraRef.value.position.lerp(targetCamPos, 0.15)
      // 注视点：车辆位置 + 上方一点
      const lookAt = state.position.clone()
      lookAt.y += 0.3
      controlsRef.value.target.lerp(lookAt, 0.2)
      cameraRef.value.lookAt(lookAt)
      // 注意：follow 模式下禁用 controls 的 update（避免与 lookAt 冲突）
      followCameraRafId = requestAnimationFrame(tick)
    }
    tick()
  }

  function stopFollowVehicle() {
    followVehicleEnabled = false
    if (followCameraRafId) {
      cancelAnimationFrame(followCameraRafId)
      followCameraRafId = 0
    }
    // 释放 OrbitControls，让用户自由观察
    if (controlsRef.value) controlsRef.value.enabled = true
  }

  function isFollowVehicleEnabled() {
    return followVehicleEnabled
  }

  function replayRouteAnimation() {
    if (!routeAnimRef.value) {
      // 系统未初始化 → 等价于"用最新 store 数据首次播放"
      playRouteAnimation()
      return
    }
    if (!routeAnimRef.value.isPlaying()) {
      // 已停止：尝试用最新数据重播（防止 lastPlan 为空时无法重播）
      const plan: any = useDispatchStore().navPathPlanData as NavPathPlanData
      if (plan && Object.keys(plan).length > 0) {
        routeAnimRef.value.play(plan, { autoStart: true })
        return
      }
    }
    routeAnimRef.value.replay()
  }

  function stopRouteAnimation() {
    routeAnimRef.value?.stop()
  }

  // 3) 市政水源
  async function buildWaterLayer() {
    if (!layerGroupRef.value) return
    const g = layerGroupRef.value.water
    hydrantMeshesRef.value = []
    try {
      await loadFireHydrant(g)
    } catch (e) {
      console.warn('[useThreeScene] 加载消防栓失败', e)
    }
    // 收集实例 mesh 供点击拾取
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) hydrantMeshesRef.value.push(o as THREE.Mesh)
    })
  }

  // 4) 受困人员（人形 mesh）
  function buildTrappedMarkers(list: TrappedFloorItem[]) {
    if (!layerGroupRef.value || !opts.realtimeFactors) return
    const totalFloors = opts.realtimeFactors.totalFloors
    const composite = layerGroupRef.value.composite
    // 清理旧
    trappedMeshesRef.value.forEach((g) => composite.remove(g))
    trappedMeshesRef.value = []
    // 重建
    list.forEach((item) => {
      const group = new THREE.Group()
      group.userData = { type: 'trappedPerson', uuid: item.uuid, floor: item.floor, direction: item.direction, count: item.count }
      const person = createPersonMesh()
      const y = (item.floor / Math.max(1, totalFloors)) * totalFloors * maModelSetting.floorDisplayHeight + 0.15
      person.position.y = y
      person.traverse((c) => ((c as any).userData = { ...group.userData }))
      group.add(person)
      // 文字标牌
      const label = makeTextSprite(`${item.floor}F ${item.direction} ${item.count}人`, '#ffffff', 'rgba(255,48,48,0.85)')
      label.position.set(0, y + 0.25, 0)
      label.userData = { ...group.userData }
      group.add(label)
      // 方向 / 角度
      const angle = directionToAngle(item.direction)
      const radius = 0.45
      group.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
      composite.add(group)
      trappedMeshesRef.value.push(group)
    })
  }

  // 5) FX 火焰 + 烟雾
  function buildFx(fireFloor: number, smokeLevel: string) {
    if (!layerGroupRef.value || !opts.realtimeFactors) return
    const composite = layerGroupRef.value.composite
    const totalFloors = opts.realtimeFactors.totalFloors
    const y = (fireFloor / Math.max(1, totalFloors)) * totalFloors * maModelSetting.floorDisplayHeight + 0.1
    if (!fireSpriteRef.value) {
      fireSpriteRef.value = createFireSprite(composite, y)
    } else {
      fireSpriteRef.value.position.y = y
    }
    if (smokeSpritesRef.value.length === 0) {
      smokeSpritesRef.value = createSmokeSprites(composite, smokeLevel, y)
    } else {
      // 更新烟雾
      smokeSpritesRef.value.forEach((s) => composite.remove(s))
      smokeSpritesRef.value = createSmokeSprites(composite, smokeLevel, y)
    }
  }

  /* -------------------- 6 个细粒度 update -------------------- */

  function updateFireFloor(fireFloor: number) {
    if (!floorRefsRef.value) return
    floorRefsRef.value.allFloors.forEach((g) => {
      const isFire = (g.userData?.height || 0) === fireFloor
      g.children.forEach((child) => {
        const mesh = child as THREE.Mesh
        if (mesh.material) {
          const mat = mesh.material as THREE.MeshLambertMaterial
          if (isFire) {
            mat.color = new THREE.Color(0xff7a00)
            mat.emissive = new THREE.Color(0x551100)
          } else {
            mat.color = new THREE.Color(0x3a4a6a)
            mat.emissive = new THREE.Color(0x000000)
          }
        }
      })
    })
    if (fireSpriteRef.value && opts.realtimeFactors) {
      const totalFloors = opts.realtimeFactors.totalFloors
      const y = (fireFloor / Math.max(1, totalFloors)) * totalFloors * maModelSetting.floorDisplayHeight + 0.1
      fireSpriteRef.value.position.y = y
      smokeSpritesRef.value.forEach((s) => (s.position.y = y + 0.5))
    }
    // 同步更新起火层标注（红色外框 + callout 标签）
    annotationRefsRef.value?.setFireFloor(fireFloor)
  }

  function updateSmokeLevel(level: string) {
    if (!layerGroupRef.value || !fireSpriteRef.value) return
    const composite = layerGroupRef.value.composite
    smokeSpritesRef.value.forEach((s) => composite.remove(s))
    smokeSpritesRef.value = createSmokeSprites(composite, level, fireSpriteRef.value.position.y)
  }

  function updateTrappedMarkers(list: TrappedFloorItem[]) {
    buildTrappedMarkers(list)
  }

  function toggleLayer(key: 'composite' | 'vehicles' | 'water', visible: boolean) {
    if (!layerGroupRef.value) return
    layerGroupRef.value[key].visible = visible
  }

  /** 构件高亮（描边色：emissive） */
  function highlightComponent(uuid: string | null) {
    if (!layerGroupRef.value) return
    const groups = trappedMeshesRef.value
    groups.forEach((g) => {
      const isSel = g.userData?.uuid === uuid
      g.traverse((c: any) => {
        if (c.isMesh && c.material) {
          const mat = c.material
          if (isSel) {
            mat.emissive = new THREE.Color(0xff9500)
            mat.emissiveIntensity = 0.8
          } else {
            mat.emissive = new THREE.Color(0x551100)
            mat.emissiveIntensity = 0.5
          }
        }
      })
    })
  }

  /** 相机角度 */
  function updatePitchRotation(pitch: number, rotation: number) {
    if (!cameraRef.value || !controlsRef.value) return
    const r = cameraRef.value.position.length()
    const radPitch = (pitch * Math.PI) / 180
    const radRot = (rotation * Math.PI) / 180
    cameraRef.value.position.x = r * Math.cos(radPitch) * Math.sin(radRot)
    cameraRef.value.position.z = r * Math.cos(radPitch) * Math.cos(radRot)
    cameraRef.value.position.y = r * Math.sin(radPitch)
    cameraRef.value.lookAt(controlsRef.value.target)
    controlsRef.value.update()
  }

  /** 复位相机到 maModelSetting.cameraInit 初始位置 + 默认俯仰/方位 */
  function resetView() {
    if (!cameraRef.value || !controlsRef.value) return
    const pos = maModelSetting.cameraInit
    cameraRef.value.position.set(pos.x, pos.y, pos.z)
    cameraRef.value.lookAt(0, isSimilar ? 0.5 : 1, 0)
    controlsRef.value.target.set(0, isSimilar ? 0.5 : 1, 0)
    controlsRef.value.update()
  }

  /** 选中受困人员 uuid */
  function setSelectedTrapped(uuid: string | null) {
    highlightComponent(uuid)
  }

  /* -------------------- 点击拾取 -------------------- */
  function handleClick(event: MouseEvent) {
    if (!rendererRef.value || !cameraRef.value || !raycasterRef.value) return
    if (!opts.onPickFloor && !opts.onPickMarker && !opts.onPickComponent) return
    const rect = rendererRef.value.domElement.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycasterRef.value.setFromCamera(mouse, cameraRef.value)

    // 1) 受困人员（人形）
    const personMeshes: THREE.Mesh[] = []
    trappedMeshesRef.value.forEach((g) => {
      g.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) personMeshes.push(c as THREE.Mesh)
      })
    })
    if (personMeshes.length) {
      const hits = raycasterRef.value.intersectObjects(personMeshes, false)
      if (hits.length > 0) {
        const ud = (hits[0].object as any).userData
        if (ud?.uuid) {
          opts.onPickMarker?.(ud.uuid)
          opts.onPickComponent?.({
            type: 'trappedPerson',
            uuid: ud.uuid,
            floor: ud.floor,
            direction: ud.direction,
            count: ud.count,
          })
          return
        }
      }
    }

    // 2) 楼层
    const floorMeshes: THREE.Mesh[] = []
    floorRefsRef.value?.allFloors.forEach((g) => {
      g.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) floorMeshes.push(c as THREE.Mesh)
      })
    })
    if (floorMeshes.length) {
      const hits = raycasterRef.value.intersectObjects(floorMeshes, false)
      if (hits.length > 0) {
        let ud: any = hits[0].object.userData
        if (!ud?.height) {
          let p: any = hits[0].object.parent
          while (p && !p.userData?.height) p = p.parent
          ud = p?.userData
        }
        if (ud?.height) {
          opts.onPickFloor?.(ud.height)
          opts.onPickComponent?.({ type: 'floor', floor: ud.height })
          return
        }
      }
    }

    // 3) 消防栓
    if (hydrantMeshesRef.value.length) {
      const hits = raycasterRef.value.intersectObjects(hydrantMeshesRef.value, false)
      if (hits.length > 0) {
        const ud = (hits[0].object as any).userData
        opts.onPickComponent?.({ type: 'hydrant', name: ud?.name || '消防栓' })
        return
      }
    }

    // 4) 消防车
    if (vehicleMeshesRef.value.length) {
      const hits = raycasterRef.value.intersectObjects(vehicleMeshesRef.value, true)
      if (hits.length > 0) {
        const ud = (hits[0].object as any).userData
        opts.onPickComponent?.({ type: 'fireTruck', name: ud?.name || '消防车' })
      }
    }
  }

  /* -------------------- 主循环 -------------------- */
  function startAnimate() {
    lastTime = performance.now()
    const tick = () => {
      animateId = requestAnimationFrame(tick)
      const now = performance.now()
      const dt = Math.min((now - lastTime) / 1000, 0.1)
      lastTime = now
      if (mixerRef.value) mixerRef.value.update(dt)
      if (controlsRef.value) controlsRef.value.update()
      // 相似卡片自动旋转
      if (opts.mode === 'similarAlarm' && sceneRef.value) {
        sceneRef.value.rotation.y += dt * 0.25
      }
      // 烟雾上升
      if (layerGroupRef.value) {
        smokeSpritesRef.value.forEach((s, i) => {
          s.position.y += dt * 0.05
          if (s.position.y > 5) s.position.y = 1 + (i % 3) * 0.2
        })
      }
      if (rendererRef.value && sceneRef.value && cameraRef.value) {
        rendererRef.value.render(sceneRef.value, cameraRef.value)
      }
    }
    tick()
  }

  function resize() {
    if (!rendererRef.value || !cameraRef.value) return
    const w = opts.container.clientWidth || 100
    const h = opts.container.clientHeight || 100
    cameraRef.value.aspect = w / h
    cameraRef.value.updateProjectionMatrix()
    rendererRef.value.setSize(w, h)
  }

  function dispose() {
    cancelAnimationFrame(animateId)
    resizeObs?.disconnect()
    if (routeAnimRef.value) {
      routeAnimRef.value.dispose()
      routeAnimRef.value = null
    }
    if (annotationRefsRef.value) {
      annotationRefsRef.value.dispose()
      annotationRefsRef.value = null
    }
    if (pathStaticMarkersRef.value) {
      disposeObject3D(pathStaticMarkersRef.value)
      pathStaticMarkersRef.value = null
    }
    if (controlsRef.value) controlsRef.value.dispose()
    if (rendererRef.value) {
      rendererRef.value.dispose()
      rendererRef.value.forceContextLoss()
      if (rendererRef.value.domElement.parentNode === opts.container) {
        opts.container.removeChild(rendererRef.value.domElement)
      }
    }
    if (sceneRef.value) {
      sceneRef.value.traverse((o: any) => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose())
          else o.material.dispose()
        }
      })
    }
    state.loaded = false
  }

  return {
    state,
    // 5 个 builder
    buildCompositeLayer,
    buildVehiclesLayer,
    buildWaterLayer,
    buildTrappedMarkers,
    buildFx,
    // 6 个 update
    updateFireFloor,
    updateSmokeLevel,
    updateTrappedMarkers,
    toggleLayer,
    highlightComponent,
    updatePitchRotation,
    resetView,
    setSelectedTrapped,
    // 路线动画控制
    playRouteAnimation,
    replayRouteAnimation,
    stopRouteAnimation,
    fitCameraToRoute,
    startFollowVehicle,
    stopFollowVehicle,
    isFollowVehicleEnabled,
    // 生命周期
    init,
    dispose,
    resize,
  }
}
