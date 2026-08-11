# modelAssess 真实 Three.js 3D 模型集成计划

## Summary（计划摘要）

将 `src/views/modelAssess/components/TiltMapView.vue` 中现有的 CSS 3D 占位实现，**替换为基于真实 Three.js 加载 glTF/GLB 3D 模型**的版本，使中间视图呈现真实 3D 建筑模型（楼层、消防栓、消防车、火点特效、周边建筑）。

新增内容：

1. 在 `src/views/modelAssess/` 下**新建**独立 `model3d/` 子文件夹，复刻（**不是引用**）BIM 模块中加载/创建模型的能力，确保不修改 `src/components/BIM/**` 任何文件。
2. 用真实建筑/楼层数据驱动模型：楼层数据（楼层数 / 高度 / 起火层）从 `useModelAssessStore` 实时读取，受困人员、烟雾、起火点用 Three.js 精灵 / 标牌 / 动效呈现。
3. 在右侧判研面板与 3D 视图之间实现**双向交互**：判研面板的 - / + 修改起火楼层 / 烟雾等级 / 受困人数时，3D 视图同步更新（如高亮当前起火层、调整烟雾透明度、按受困人数显示/隐藏人员标牌）。
4. 点击 3D 模型中的楼层 / 受困人员，弹出可编辑表单（在 store 中打开"选中对象"，右侧或新增的"详情面板"显示并允许编辑楼层 / 方位 / 人数）。

***

## Current State Analysis（现状分析）

### 关键发现

1. **现有 BIM 模块**（`src/components/BIM/`）使用 `three@0.169.0`（来自 `package.json`），包含：

   * [`ThreejsViewerBuilding.vue`](file:///d:/work/telewave/ids/ids-gis-web/src/components/BIM/ThreejsViewerBuilding.vue) — Three.js 容器入口；

   * [`module/initThreeBuilding.js`](file:///d:/work/telewave/ids/ids-gis-web/src/components/BIM/module/initThreeBuilding.js) — 场景 / 相机 / 渲染器 / 控制器初始化；

   * [`module/createWhiteBuildings.js`](file:///d:/work/telewave/ids/ids-gis-web/src/components/BIM/module/createWhiteBuildings.js) — 拉取 GeoServer WFS 拉取白模、拉伸成 ExtrudeGeometry 建筑；

   * [`module/createBuildingByFloors.js`](file:///d:/work/telewave/ids/ids-gis-web/src/components/BIM/module/createBuildingByFloors.js) — 按楼层堆叠建筑（每层单独 Group，可控制显示 / 隐藏）；

   * [`module/createFireFacilities.js`](file:///d:/work/telewave/ids/ids-gis-web/src/components/BIM/module/createFireFacilities.js) — 消防车（glb）、消防员、消防栓（obj + InstancedMesh）；

   * [`module/commonThree.js`](file:///d:/work/telewave/ids/ids-gis-web/src/components/BIM/module/commonThree.js) — `lonLatToLocalCoord` / `loadGLTF` / `loadOBJ` 工具；

   * [`module/commonSetting.js`](file:///d:/work/telewave/ids/ids-gis-web/src/components/BIM/module/commonSetting.js) — 全局配置（basePoint / disasterBuildingID / wallAndFloor）。

2. **资源路径**：BIM 模块从 `public/model3d/` 加载资源（如 `/model3d/gltf/B370921843501063A0.gltf`、`/model3d/xf_fire_truck.glb`、`/model3d/xf_fire_hydrant.obj`）。新模块应复用同一目录，避免重复资源。

3. **依赖已就绪**：`three`、`@types/three`、`@turf/turf`、`gsap` 全部已在 `package.json` 中存在。

4. **现有 modelAssess 状态**：

   * [TiltMapView.vue](file:///d:/work/telewave/ids/ids-gis-web/src/views/modelAssess/components/TiltMapView.vue) 是 CSS 3D 占位（无任何模型/数据加载）；

   * 已有独立 store [useModelAssessStore.ts](file:///d:/work/telewave/ids/ids-gis-web/src/store/useModelAssessStore.ts)，含 `realtimeFactors`（楼层总数 / 高度 / 起火层 / 烟雾 / 受困人数）、`trappedFloors`、`pitchAngle / rotationAngle`、`activeLayerTab` 状态。

5. **关键约束**：**不修改** **`src/components/BIM/**`** **任何文件**，仅借鉴（参考）实现思路，独立副本落到 `src/views/modelAssess/model3d/`。

6. **关键约束**：**不修改** **`useModelAssessStore`** **既有状态结构**，但允许扩展（如新增 `selectedObject`、`modelLoaded`）。

***

## Proposed Changes（拟变更清单）

### 1. 新建 `src/views/modelAssess/model3d/commonSetting.ts`

独立配置（参考 BIM 模块同名文件结构，但用 `.ts` + 仅暴露本模块需要的字段）：

```typescript
// 复刻 commonSetting.js，但隔离数据，避免与 BIM 模块共享全局变量
import * as turf from '@turf/turf'

export const maModelSetting = {
  basePoint: { baseLon: 121.4725, baseLat: 31.2305 }, // 主警情 GPS
  disasterBuildingID: 'M1',
  searchRadius: 350,
  buildRadius: 200,
  gisWorkspace: 'gis',
  // 资源路径，与 BIM 复用
  assetBase: '/model3d',
  fireHydrant: { layerName: 'gis:v_srvc_water_hydrant', geom: 'geom' },
  whiteBuilding: { layerName: 'gis:mapBuilding', geom: 'geom' },
  // 主建筑拉伸参数
  wallAndFloor: { WALL_HEIGHT: 0.1, WALL_THICKNESS: 0.01, FLOOR_THICKNESS: 0.01 },
  // 楼层高度（可视化缩放系数）
  floorDisplayHeight: 0.12,
}

export const updateBIMType = {
  fireFloor: 'fireFloor',
  smokeSize: 'smokeSize',
  trappedPerson: 'trappedPerson',
} as const
```

### 2. 新建 `src/views/modelAssess/model3d/commonThree.ts`

独立工具（仅本模块内使用）：

```typescript
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { maModelSetting } from './commonSetting'

export function lonLatToLocalCoord(lon: number, lat: number, isVector3 = false) { ... }
export function loadGLTF(url: string): Promise<any> { ... }
export function loadOBJ(url: string): Promise<any> { ... }
```

### 3. 新建 `src/views/modelAssess/model3d/createBuildingByFloors.ts`

独立实现"按楼层堆叠建筑"。每层为单独 `THREE.Group`，并打 `userData = { name: 'buildingFloor', height: i }` 用于点击拾取。
返回 `{ group, allFloors }`，其中 `allFloors` 是 `THREE.Group[]`，供外部按 `fireFloor` / `selectedFloor` 控制显隐/高亮。

### 4. 新建 `src/views/modelAssess/model3d/createWhiteBuildings.ts`

独立实现"白模周边建筑"。对每个 feature 拉伸成 `ExtrudeGeometry`，并 `userData = { name, height, type: 'whiteBuilding' }`。

### 5. 新建 `src/views/modelAssess/model3d/createFireFacilities.ts`

独立实现消防车 / 消防栓 / 消防员加载，**完全独立**于 BIM 同名文件：

* 消防车：`loadGLTF('/model3d/xf_fire_truck.glb')`，缩放 + 位置；

* 消防栓：使用 OBJLoader + InstancedMesh；

* 消防员：可选动画。

### 6. 新建 `src/views/modelAssess/model3d/generateFireSprite.ts`

独立实现火焰精灵 / 烟雾精灵（用 `THREE.Sprite` + 圆形 Canvas 贴图 或 用 `gsap` 做透明度脉动）：

* `createFireSprite(group, fireFloor)`：在起火层生成红色火焰精灵；

* `createSmokeSprite(group, level)`：根据烟雾等级（轻度/中度/重度）调整精灵数量 / 透明度。

### 7. 新建 `src/views/modelAssess/model3d/createTrappedMarkers.ts`

独立实现"受困人员标牌"：在受困楼层上生成可拾取的小立方体 + HTML 标签，标牌显示 `{{direction}} {{count}}人`。点击触发 store 的 `selectTrappedFloor(uuid)`。

### 8. 新建 `src/views/modelAssess/model3d/initModelAssessScene.ts`

主场景初始化（参考 `initThreeBuilding.js` 思路，**但完全独立**）：

```typescript
export interface ModelAssessSceneRefs {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  buildingsGroup: THREE.Group
  allFloors: THREE.Group[]        // 楼层组
  trappedMarkers: THREE.Group[]   // 受困标牌
  fireSprite?: THREE.Sprite
  smokeGroup: THREE.Group
  raycaster: THREE.Raycaster
}

export async function initScene(container: HTMLElement): Promise<ModelAssessSceneRefs>
export function disposeScene(refs: ModelAssessSceneRefs, container: HTMLElement): void
export function animate(refs: ModelAssessSceneRefs, clockChange: number): void
```

提供以下更新接口（订阅 store 变化）：

`updateFireFloor(refs, floor)`：高亮 / 显示当前起火层，隐藏其他层；

* `updateSmokeLevel(refs, level)`：调整烟雾精灵透明度；
* `updateTrappedFloors(refs, list)`：重建受困标牌；
* `updatePitchRotation(refs, pitch, rotation)`：将 store 的 `pitchAngle / rotationAngle` 同步到相机。

### 9. 修改 `src/views/modelAssess/components/TiltMapView.vue`

替换为真实 Three.js 容器：

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useModelAssessStore } from '@/store/useModelAssessStore'
import {
  initScene,
  disposeScene,
  animate,
  updateFireFloor,
  updateSmokeLevel,
  updateTrappedFloors,
  updatePitchRotation,
  type ModelAssessSceneRefs,
} from '../model3d/initModelAssessScene'

const containerRef = ref<HTMLDivElement | null>(null)
const store = useModelAssessStore()
const { realtimeFactors, trappedFloors, pitchAngle, rotationAngle, activeLayerTab } = storeToRefs(store)
const selectedFloor = ref<number | null>(null)

let sceneRefs: ModelAssessSceneRefs | null = null
let lastTime = 0
let animateId = 0

onMounted(async () => {
  if (!containerRef.value) return
  sceneRefs = await initScene(containerRef.value)
  // 初始同步
  updateFireFloor(sceneRefs, realtimeFactors.value.fireFloor)
  updateTrappedFloors(sceneRefs, trappedFloors.value)
  tick()
})

onUnmounted(() => {
  cancelAnimationFrame(animateId)
  if (sceneRefs && containerRef.value) disposeScene(sceneRefs, containerRef.value)
})

const tick = () => {
  const now = performance.now()
  const dt = Math.min((now - lastTime) / 1000, 0.1)
  lastTime = now
  if (sceneRefs) animate(sceneRefs, dt)
  animateId = requestAnimationFrame(tick)
}

// 响应 store 变化
watch(() => realtimeFactors.value.fireFloor, (f) => sceneRefs && updateFireFloor(sceneRefs, f))
watch(() => realtimeFactors.value.smokeLevel, (l) => sceneRefs && updateSmokeLevel(sceneRefs, l))
watch(() => trappedFloors.value, (l) => sceneRefs && updateTrappedFloors(sceneRefs, [...l]), { deep: true })
watch([pitchAngle, rotationAngle], ([p, r]) => sceneRefs && updatePitchRotation(sceneRefs, p, r))
</script>

<template>
  <div class="tilt-map">
    <!-- 顶部图层切换 + 高度标签保留 -->
    <div class="layer-tabs"> ... </div>
    <div class="altitude-tag">⏐ 高 {{ realtimeFactors.buildingHeight }}m ({{ realtimeFactors.totalFloors }}F)</div>

    <!-- Three.js 画布 -->
    <div ref="containerRef" class="three-canvas"></div>

    <!-- 起火 / 受困信息浮层（绝对定位在容器上） -->
    <div v-if="selectedFloor" class="selected-info"> 已选中：第{{ selectedFloor }} 层 ... </div>
  </div>
</template>
```

### 10. 修改 `src/views/modelAssess/components/MasterAlarmPanel.vue`

在判研行增加"点击定位到 3D 视图"按钮 + "在 3D 中选中"指示器，关联到 `selectedFloor`（通过新增 store action）。

### 11. 修改 `src/views/modelAssess/components/TrappedRescuePanel.vue`

点击列表项时，调用 `store.selectTrappedFloor(uuid)`，3D 视图高亮该楼层的受困标牌；同时 3D 视图点击受困标牌时，store 同步选中并回显到面板。

### 12. 扩展 `src/store/useModelAssessStore.ts`（最小扩展）

新增：

* `selectedTrappedUuid: string`；

* `modelLoaded: boolean`；

* `selectTrappedFloor(uuid: string | null)`；

* `setModelLoaded(v: boolean)`。
  （**不修改**既有 state / actions 字段，仅追加。）

并在 `src/store/index.ts` 中 store 导出已存在，**无需新增**。

### 13. 新建 `src/views/modelAssess/styles/model3d.less`

独立 3D 容器样式（不污染 `model-assess.less`），含：

* `.three-canvas` 满铺；

* 右上角 3D 信息浮层（帧率、加载进度）；

* 选中态 / 起火层高亮的 HUD 提示。

### 14. 不修改文件（强约束）

* 不修改 `src/components/BIM/**`；

* 不修改 `src/components/three/fontLoader.vue`；

* 不修改 `src/router/index.ts`；

* 不修改 `src/views/three_platform.vue / building.vue / home.vue / region.vue`；

* 不修改 `src/const/const.modelAssess.ts` 中既有枚举（可追加新枚举）。

***

## Assumptions & Decisions（假设与决策）

1. **复用 public 资源**：`/model3d/*` 资源已存在于 BIM 模块中（车、消火栓、火模型等），本模块直接复用同一路径，不复制资源文件。如果不存在，将降级为"几何体占位"（自动创建 BoxGeometry / SphereGeometry 替代）。
2. **不接真实 GeoServer**：白模 / 消防栓数据本计划使用 `useModelAssessStore` 中的 mock 数据（白模直接用代码生成 BoxGeometry 列表）。如未来要接 WFS，store 已有扩展位。
3. **不引入新依赖**：全部使用项目已有的 `three / @turf/turf / gsap`。
4. **TypeScript**：model3d 文件全部使用 `.ts`，与既有 BIM 模块的 `.js` 隔离。
5. **响应式**：仍只适配桌面端 ≥ 1440px。
6. **不破坏既有 store**：`useModelAssessStore` 既有 state / actions 字段**不改名 / 不删**，仅追加。
7. **不引入新组件库**：3D 视图的浮层提示用原生 DOM 样式。

***

## Verification（验证步骤）

1. `npm run dev` 启动后访问 `http://localhost:5173/#/modelAssess`：

   * 中央 3D 区域显示真实 3D 场景（白模建筑 + 主建筑 + 消防车 + 消防栓）；

   * 顶部"高度"标签同步 store 中 `buildingHeight / totalFloors`；
2. 在左下主警情面板修改"起火楼层"为 18 → 3D 视图应自动显示 18 层的火焰精灵，隐藏其他层的高亮；
3. 修改"烟雾情况"为"重度" → 3D 视图烟雾精灵透明度提升 / 数量增加；
4. 在右下受困救援面板新增一条 `20F 东北角 3 人` → 3D 视图第 20 层出现新标牌；
5. 点击 3D 视图中的受困标牌 → 右下面板自动滚动并高亮对应行；
6. 在右下受困救援面板点击某行 → 3D 视图对应标牌闪烁一次；
7. 旋转右侧指南针 → 3D 相机 `rotationAngle` 联动；
8. 调整俯仰角 → 3D 相机 `pitchAngle` 联动；
9. `GetDiagnostics` 所有相关文件无 TypeScript 错误。

