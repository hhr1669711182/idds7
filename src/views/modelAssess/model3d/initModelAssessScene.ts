/*
 * @Description: 模型研判 3D 场景初始化与更新接口
 * @FilePath: \ids-gis-web\src\views\modelAssess\model3d\initModelAssessScene.ts
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { maModelSetting } from './commonSetting'
import { createWhiteBuildings } from './createWhiteBuildings'
import {
  createBuildingByFloors,
  updateBuildingScale,
  type FloorGroupRefs,
} from './createBuildingByFloors'
import { loadFireTruck, loadFireFighter, loadFireHydrant } from './createFireFacilities'
import { createFireSprite, createSmokeSprites } from './generateFireSprite'
import { createTrappedMarker, directionToAngle } from './createTrappedMarkers'
import type { TrappedFloorItem } from '@/const/const.modelAssess'

export interface ModelAssessSceneRefs {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  buildingsGroup: THREE.Group
  fireFacilitiesGroup: THREE.Group
  fxGroup: THREE.Group // 火焰 + 烟雾精灵
  trappedGroup: THREE.Group // 受困标牌
  floorRefs: FloorGroupRefs
  fireSprite?: THREE.Sprite
  smokeSprites: THREE.Sprite[]
  raycaster: THREE.Raycaster
  mixer: THREE.AnimationMixer | null
  pickableMeshes: THREE.Mesh[]
  totalFloors: number
  buildingHeight: number
  selectedTrappedUuid: string | null
  onSelectTrapped?: (uuid: string) => void
  onPickFloor?: (floor: number) => void
}

/**
 * 初始化 3D 场景
 */
export async function initScene(
  container: HTMLElement,
  totalFloors: number,
  buildingHeight: number,
  onSelectTrapped?: (uuid: string) => void,
  onPickFloor?: (floor: number) => void,
): Promise<ModelAssessSceneRefs> {
  // ---------- Scene ----------
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a0e1a) // 与深色科技风 UI 协调
  scene.fog = new THREE.Fog(0x0a0e1a, 8, 20)

  // ---------- Camera ----------
  const camera = new THREE.PerspectiveCamera(
    55,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.1,
    1000,
  )
  const pos = maModelSetting.cameraInit
  camera.position.set(pos.x, pos.y, pos.z)
  camera.lookAt(0, 1, 0)

  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
  renderer.shadowMap.enabled = true
  container.appendChild(renderer.domElement)

  // ---------- Controls ----------
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = maModelSetting.cameraLimits.minDistance
  controls.maxDistance = maModelSetting.cameraLimits.maxDistance
  controls.target.set(0, 1, 0)

  // ---------- Lights ----------
  const ambient = new THREE.AmbientLight(0xffffff, 0.5)
  scene.add(ambient)
  const dir = new THREE.DirectionalLight(0xffffff, 1.2)
  dir.position.set(5, 10, 5)
  dir.castShadow = true
  scene.add(dir)
  const fill = new THREE.DirectionalLight(0x6688ff, 0.4)
  fill.position.set(-5, 3, -5)
  scene.add(fill)

  // ---------- 地面（深色网格） ----------
  const groundGeo = new THREE.PlaneGeometry(20, 20, 20, 20)
  const groundMat = new THREE.MeshBasicMaterial({
    color: 0x131826,
    wireframe: true,
    transparent: true,
    opacity: 0.3,
  })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = 0
  scene.add(ground)

  // ---------- 容器组 ----------
  const buildingsGroup = new THREE.Group()
  const fireFacilitiesGroup = new THREE.Group()
  const fxGroup = new THREE.Group()
  const trappedGroup = new THREE.Group()
  scene.add(buildingsGroup, fireFacilitiesGroup, fxGroup, trappedGroup)

  // ---------- 加载数据 ----------
  // 1) 周边白模
  createWhiteBuildings(buildingsGroup)
  // 2) 主建筑
  const floorRefs = createBuildingByFloors(totalFloors, buildingHeight)
  buildingsGroup.add(floorRefs.group)
  // 3) 消防车 / 消防员 / 消防栓
  let mixer: THREE.AnimationMixer | null = null
  try {
    const truck = await loadFireTruck(fireFacilitiesGroup, [
      maModelSetting.basePoint.baseLon + 0.001,
      maModelSetting.basePoint.baseLat - 0.0005,
    ])
    ;(truck as any).userData = { type: 'fireTruck' }
    const m = await loadFireFighter(fireFacilitiesGroup)
    mixer = m
    await loadFireHydrant(fireFacilitiesGroup)
  } catch (e) {
    console.warn('[modelAssess] 加载消防设施失败', e)
  }

  // 4) 火焰精灵（默认高度 = 起火层 15）
  const fireY = (15 / Math.max(1, totalFloors)) * totalFloors * maModelSetting.floorDisplayHeight
  const fireSprite = createFireSprite(fxGroup, fireY)
  // 5) 默认中度烟雾
  const smokeSprites = createSmokeSprites(fxGroup, '中度 (Medium)', fireY)

  // 收集可拾取 mesh
  const pickableMeshes: THREE.Mesh[] = []
  buildingsGroup.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) pickableMeshes.push(o as THREE.Mesh)
  })

  // ---------- Raycaster（用于点击楼层 / 受困） ----------
  const raycaster = new THREE.Raycaster()

  const refs: ModelAssessSceneRefs = {
    scene,
    camera,
    renderer,
    controls,
    buildingsGroup,
    fireFacilitiesGroup,
    fxGroup,
    trappedGroup,
    floorRefs,
    fireSprite,
    smokeSprites,
    raycaster,
    mixer,
    pickableMeshes,
    totalFloors,
    buildingHeight,
    selectedTrappedUuid: null,
    onSelectTrapped,
    onPickFloor,
  }

  // 绑定点击
  renderer.domElement.addEventListener('click', (e) => handleClick(e, refs))

  return refs
}

/**
 * 点击拾取
 */
function handleClick(event: MouseEvent, refs: ModelAssessSceneRefs) {
  if (!refs.onSelectTrapped && !refs.onPickFloor) return
  const rect = refs.renderer.domElement.getBoundingClientRect()
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  refs.raycaster.setFromCamera(mouse, refs.camera)

  // 1) 优先检测受困标牌
  const trappedMeshes: THREE.Mesh[] = []
  refs.trappedGroup.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) trappedMeshes.push(o as THREE.Mesh)
  })
  if (trappedMeshes.length) {
    const hits = refs.raycaster.intersectObjects(trappedMeshes, false)
    if (hits.length > 0) {
      const ud = (hits[0].object as any).userData
      if (ud?.uuid && refs.onSelectTrapped) {
        refs.selectedTrappedUuid = ud.uuid
        refs.onSelectTrapped(ud.uuid)
        return
      }
    }
  }

  // 2) 检测楼层
  const floorMeshes: THREE.Mesh[] = []
  refs.floorRefs.allFloors.forEach((g) => {
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) floorMeshes.push(o as THREE.Mesh)
    })
  })
  const fHits = refs.raycaster.intersectObjects(floorMeshes, false)
  if (fHits.length > 0) {
    let ud: any = fHits[0].object.userData
    if (!ud?.height) {
      // 向上找 group.userData
      let p: any = fHits[0].object.parent
      while (p && !p.userData?.height) p = p.parent
      ud = p?.userData
    }
    if (ud?.height && refs.onPickFloor) refs.onPickFloor(ud.height)
  }
}

/**
 * 主循环
 */
export function animate(refs: ModelAssessSceneRefs, dt: number) {
  if (refs.mixer) refs.mixer.update(dt)
  refs.controls.update()
  // 烟雾精灵缓慢上升
  refs.smokeSprites.forEach((s, i) => {
    s.position.y += dt * 0.05
    if (s.position.y > 5) s.position.y = 1 + (i % 3) * 0.2
  })
  refs.renderer.render(refs.scene, refs.camera)
}

/**
 * 销毁场景
 */
export function disposeScene(refs: ModelAssessSceneRefs, container: HTMLElement) {
  try {
    refs.controls.dispose()
    refs.renderer.dispose()
    refs.renderer.forceContextLoss()
    refs.scene.clear()
    if (refs.renderer.domElement.parentNode === container) {
      container.removeChild(refs.renderer.domElement)
    }
  } catch (e) {
    console.warn('[modelAssess] dispose failed', e)
  }
}

/**
 * 窗口尺寸变更
 */
export function resizeScene(refs: ModelAssessSceneRefs, container: HTMLElement) {
  if (!container.clientWidth) return
  refs.camera.aspect = container.clientWidth / Math.max(1, container.clientHeight)
  refs.camera.updateProjectionMatrix()
  refs.renderer.setSize(container.clientWidth, container.clientHeight)
}

/* -------------------- 更新接口（订阅 store） -------------------- */

/** 更新起火楼层：高亮该层，火焰精灵移到该高度 */
export function updateFireFloor(refs: ModelAssessSceneRefs, fireFloor: number) {
  refs.floorRefs.allFloors.forEach((g) => {
    const isFire = (g.userData?.height || 0) === fireFloor
    g.children.forEach((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.material) {
        // 高亮起火层：颜色变橙
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
  // 移动火焰精灵
  if (refs.fireSprite) {
    const y = (fireFloor / Math.max(1, refs.totalFloors)) * refs.totalFloors * maModelSetting.floorDisplayHeight + 0.1
    refs.fireSprite.position.y = y
    // 同步烟雾
    refs.smokeSprites.forEach((s) => (s.position.y = y + 0.5))
  }
}

/** 更新烟雾等级 */
export function updateSmokeLevel(refs: ModelAssessSceneRefs, level: string) {
  // 销毁旧的
  refs.smokeSprites.forEach((s) => refs.fxGroup.remove(s))
  refs.smokeSprites.length = 0
  // 获取当前火焰高度
  const y = refs.fireSprite ? refs.fireSprite.position.y : 1
  const next = createSmokeSprites(refs.fxGroup, level, y)
  refs.smokeSprites.push(...next)
}

/** 更新受困标牌列表 */
export function updateTrappedFloors(refs: ModelAssessSceneRefs, list: TrappedFloorItem[]) {
  // 清空旧
  while (refs.trappedGroup.children.length) {
    const c = refs.trappedGroup.children.pop()!
    c.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = (mesh as any).material
      if (mat && mat.map) mat.map.dispose()
      if (mat) mat.dispose()
    })
  }
  // 重建
  list.forEach((item, idx) => {
    const marker = createTrappedMarker(item, refs.totalFloors, idx)
    // 方向决定角度
    const angle = directionToAngle(item.direction)
    const radius = 0.45
    marker.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
    refs.trappedGroup.add(marker)
  })
  // 选中态高亮
  applySelectedHighlight(refs)
}

/** 根据 store 选中态高亮受困标牌 */
export function applySelectedHighlight(refs: ModelAssessSceneRefs) {
  refs.trappedGroup.children.forEach((g) => {
    const ud = g.userData
    const isSel = ud?.uuid === refs.selectedTrappedUuid
    g.children.forEach((child) => {
      const mesh = child as THREE.Mesh
      if ((mesh as any).isMesh && mesh.material && (mesh.material as any).color) {
        const mat = mesh.material as THREE.MeshBasicMaterial
        if (ud?.type === 'trappedMarker') {
          if (isSel) {
            mat.color = new THREE.Color(0xffd700)
          } else {
            mat.color = new THREE.Color(0xff3030)
          }
        }
      }
    })
  })
}

/** 更新相机俯仰 / 旋转 */
export function updatePitchRotation(refs: ModelAssessSceneRefs, pitch: number, rotation: number) {
  // 通过绕 target 旋转相机实现
  const r = refs.camera.position.length()
  const radPitch = (pitch * Math.PI) / 180
  const radRot = (rotation * Math.PI) / 180
  refs.camera.position.x = r * Math.cos(radPitch) * Math.sin(radRot)
  refs.camera.position.z = r * Math.cos(radPitch) * Math.cos(radRot)
  refs.camera.position.y = r * Math.sin(radPitch)
  refs.camera.lookAt(refs.controls.target)
}

/** 更新选中态（外部调用） */
export function setSelectedTrapped(refs: ModelAssessSceneRefs, uuid: string | null) {
  refs.selectedTrappedUuid = uuid
  applySelectedHighlight(refs)
}

/** 更新楼层总数 / 建筑高度 */
export function updateBuildingDimensions(
  refs: ModelAssessSceneRefs,
  totalFloors: number,
  buildingHeight: number,
) {
  refs.totalFloors = totalFloors
  refs.buildingHeight = buildingHeight
  updateBuildingScale(refs.floorRefs, totalFloors, buildingHeight)
}
