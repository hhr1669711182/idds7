# modelAssess 3D 视图深度优化与重构计划

## Summary（计划摘要）

在已有 `modelAssess` 模块基础上做四件事：
1. **抽取复用组件** — 抽离一个通用 `ThreeViewer` 容器（仿 [ThreejsViewerBuilding.vue](file:///d:/work/telewave/ids/ids-gis-web/src/components/BIM/ThreejsViewerBuilding.vue) 模式 + Element Plus UI），主警情 3D 视图 + 顶部 4 个相似警情卡片的小模型 **共用** 同一组件（仅 props 数据源不同），减少代码量、提高内聚。
2. **2D 俯视平面图切换** — 主警情 3D 视图增加"2D 平面模式"切换：点击楼层 → 切换到该楼层的俯视 SVG/Canvas 平面图（房间布局 + 消防栓 + 受困人员位置）。
3. **构件点击高亮 + 详情弹窗** — 点击楼层 / 房间 / 消防栓 / 消防车 / 受困人员 → 弹出 Element Plus `el-popover` 详情卡（用现有深色科技风样式 + 橙色边框），展示对应数据 + 实时要素。
4. **图层 / 标牌 / 复用** — 综合 / 消防车辆 / 市政水源 三个图层的模型层各自独立显示；受困人员画成 3D 红色人形 mesh（程序化生成）而非占位方块；相似警情卡片内的小模型用同一 `ThreeViewer` 渲染。

---

## Current State Analysis（现状分析）

### 关键发现

1. **现有 model3d 模块结构**（`src/views/modelAssess/model3d/`）：
   - `initModelAssessScene.ts` 是**单体大函数**，含场景/相机/控制器/光/白模/主建筑/消防设施/火焰/烟雾/受困标牌 一次性 init，**没有可复用入口**。
   - `createWhiteBuildings / createBuildingByFloors / createFireFacilities / generateFireSprite / createTrappedMarkers` 各函数均接受固定参数，**未提供"按图层显隐" / "按构件显隐" 通用 API**。
   - 受困标牌 = **红立方体**（`BoxGeometry`），不是人形；要求"画出来受困人员" → 需重写为程序化人形 mesh。
   - `initScene` 返回的 `ModelAssessSceneRefs` 一次性含白模 + 主建筑 + 消防 + FX，**无法配置"只显示综合图层" / "只显示消防车辆" 等组合**。
2. **现有 UI 框架**：项目使用 `element-plus@2.13.6`（已在 `package.json`），可使用 `el-button / el-tabs / el-select / el-input-number / el-popover / el-dialog / el-icon / el-tooltip`。
3. **既有约束（强）**：
   - 不修改 `src/components/BIM/**`；
   - 不修改既有 store state 字段（仅追加）；
   - 不引入新依赖。
4. **现有 `updateFireFloor` / `updateSmokeLevel` / `updateTrappedFloors` 接口已存在但粗粒度**，新需求要更细粒度（按楼层、按房间、按构件）。
5. **Element Plus 默认深色**：项目已有 `styles/element.less`（在 [package.json](file:///d:/work/telewave/ids/ids-gis-web/package.json) 中），需确保弹窗 / popover 配色与深色科技风统一。

---

## Proposed Changes（拟变更清单）

### A. 抽离通用 `ThreeViewer.vue` 组件（高内聚、低耦合、可复用）

**新建** `src/views/modelAssess/components/ThreeViewer.vue`：

职责：作为一个**纯 Three.js 容器**，根据传入的"数据源 props"加载并渲染模型；自身不关心业务数据。

```typescript
interface ThreeViewerProps {
  /** 数据源类型，决定加载哪些模块 */
  dataSource: 'masterAlarm' | 'similarAlarm' | 'trappedLayer'
  /** 相似警情卡片小模型：只读 props */
  similarCardData?: SimilarAlarmCardItem
  /** 主警情数据 */
  masterAlarm?: MasterAlarm
  realtimeFactors?: RealtimeFactors
  trappedFloors?: TrappedFloorItem[]
  /** 显示哪些图层（综合 / 消防车辆 / 市政水源） */
  visibleLayers: { composite: boolean; vehicles: boolean; water: boolean }
  /** 外部点击事件回调 */
  onPickFloor?: (floor: number) => void
  onPickMarker?: (uuid: string) => void
  onPickComponent?: (info: ComponentInfo) => void
  /** 是否显示 2D 平面图模式（仅主警情支持） */
  plan2DMode?: boolean
  planFloor?: number
  /** 容器尺寸/位置信息 */
  height?: string
  showHUD?: boolean
}
```

内部使用 `useThreeScene` composable（见 B）初始化场景，并通过 props 驱动。

**重用**：
- 顶部 4 张 `SimilarAlarmCard` 内的缩略图 → 用 `<ThreeViewer data-source="similarAlarm" :similar-card-data="card" />` 替换 CSS 占位；
- 主警情 3D → 替换 TiltMapView 内的内联实现；
- 后续如需"主警情多个楼层平面"也可复用。

### B. 抽离 `useThreeScene` composable（业务逻辑与渲染解耦）

**新建** `src/views/modelAssess/composables/useThreeScene.ts`：

把 `initModelAssessScene.ts` 中的"场景初始化"和"更新函数"全部搬入此 composable，并按**职责拆分为多个小函数**（高内聚低耦合）：

```typescript
export function useThreeScene(options: UseThreeSceneOptions) {
  // 内部状态
  const sceneState = reactive({ /* scene, camera, renderer, ... */ })
  const buildRefs = ref<BuildRefs | null>(null)

  // 5 个独立的 builder 函数（高内聚）
  const buildCompositeLayer = async () => { /* 白模 + 主建筑 */ }
  const buildVehiclesLayer = async () => { /* 消防车 */ }
  const buildWaterLayer = async () => { /* 消防栓 */ }
  const buildTrappedMarkers = (list: TrappedFloorItem[]) => { /* 红色人形 mesh */ }
  const buildFx = (fireFloor: number, smoke: string) => { /* 火焰 + 烟雾 */ }

  // 6 个独立的 update 函数（细粒度）
  const updateFireFloor = (floor: number) => { /* 高亮层 + 移动精灵 */ }
  const updateSmokeLevel = (level: string) => { /* 销毁 + 重建烟雾 */ }
  const updateTrappedMarkers = (list: TrappedFloorItem[]) => { /* 增删改查 */ }
  const toggleLayer = (key: 'composite' | 'vehicles' | 'water', visible: boolean) => {
    sceneState.layerGroup[key].visible = visible
  }
  const highlightComponent = (uuid: string) => { /* 构件高亮（描边 + emissive） */ }
  const showPlan2D = (floor: number) => { /* 切换到 2D 平面图 */ }
  const show3D = () => { /* 从 2D 切回 3D */ }

  return { sceneState, buildRefs, /* 5 个 build + 6 个 update + dispose */ }
}
```

`useThreeScene` **不直接操作** DOM（容器 ref 由调用方传入），**不直接绑定** 点击事件（由调用方通过 `onPickFloor / onPickMarker / onPickComponent` 接收回调）。这样：
- 既能被主警情 `TiltMapView` 使用；
- 也能被 `SimilarAlarmCard` 内部使用（只传入 `similarCardData`）。

### C. 重构 `initModelAssessScene.ts` 改为各 builder 模块组合

**改造** `src/views/modelAssess/model3d/`：

- `initModelAssessScene.ts` **改为纯导出 `useThreeScene` 内部使用的工具**，**不再直接被组件 import**。
- 把"主建筑按楼层堆叠"逻辑拆为 `composables/buildCompositeLayer.ts`；
- 把"消防车 / 消防栓"拆为 `composables/buildVehiclesLayer.ts` / `composables/buildWaterLayer.ts`；
- 把"受困人员"用**程序化生成人形 mesh**（圆柱 + 球 + 圆锥组合，红色 emissive ），替换现有红方块。
- 新增 `composables/buildPlan2D.ts`：用 SVG 渲染楼层平面图（房间 + 楼梯 + 走廊 + 消防栓 + 受困人员点），与 3D 共用同一受困 / 消防栓数据源。

### D. 2D 俯视平面图模式

**新建** `src/views/modelAssess/components/FloorPlan2D.vue`：

- 接收 `floor: number` + `realtimeFactors: RealtimeFactors` + `trappedFloors: TrappedFloorItem[]`；
- 用 SVG（**不引入新依赖**）渲染：
  - 房间矩形（4x4 网格，含东南 / 西北 / 东北 / 西南 4 个区域）；
  - 楼梯图标；
  - 消防栓标记（与 3D 中同名同步）；
  - 受困人员红色人形标记（点击触发 onPickMarker）。
- 通过 `transition` 在 3D 画布上方做 0.3s 淡入淡出切换。

### E. 构件高亮 + 详情弹窗

**新建** `src/views/modelAssess/components/ComponentDetailPopover.vue`：

使用 `el-popover` 触发（**用 Element Plus**），展示：
- 楼层详情：楼层 / 高度 / 烟雾 / 起火情况 / 受困总人数；
- 受困人员：楼层 / 方位 / 人数 / 操作按钮（在主警情面板中编辑）；
- 消防栓：KX1/KX2/... 编号 / 距离主建筑距离 / 状态；
- 消防车：车辆编号 / 驾驶员 / 状态。

统一深色科技风配色（直接复用 [model-assess.less](file:///d:/work/telewave/ids/ids-gis-web/src/views/modelAssess/styles/model-assess.less) 已有变量）。

**点击拾取**：
- `useThreeScene` 内部 `raycaster` 检测 mesh；
- 命中后调用 `highlightComponent(uuid)`，弹窗由调用方（`TiltMapView`）的 `onPickComponent` 回调控制。

### F. 三个图层（综合 / 消防车辆 / 市政水源）独立模型层

**改造** `useThreeScene`：

- 在 `scene` 中创建 `layerGroup = { composite: Group, vehicles: Group, water: Group }` 三个独立子组；
- 三个 builder 分别把模型加入对应子组；
- `toggleLayer(key, visible)` 仅设置 `layerGroup[key].visible`；
- `initModelAssessScene` 不再把所有模型一次性塞进 `buildingsGroup` 一个 group。

### G. 受困人员 3D 人形 mesh

**新建** `src/views/modelAssess/model3d/createPersonMesh.ts`：

```typescript
export function createPersonMesh(color: number = 0xff3030): THREE.Group {
  const g = new THREE.Group()
  // 头：球
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 12, 12),
    new THREE.MeshStandardMaterial({ color, emissive: 0x550000, emissiveIntensity: 0.5 }),
  )
  head.position.y = 0.18
  g.add(head)
  // 身体：圆柱
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8),
    new THREE.MeshStandardMaterial({ color }),
  )
  body.position.y = 0.1
  g.add(body)
  // 四肢（简化为 4 个圆锥）
  // ... 省略
  return g
}
```

在 `buildTrappedMarkers` 中把人形 mesh 替换现有 BoxGeometry。

### H. 相似警情卡片内的小模型（ThreeViewer 复用）

**改造** `src/views/modelAssess/components/SimilarAlarmCard.vue`：

- 移除现有 CSS 缩略图（`.thumb`）；
- 嵌入 `<ThreeViewer data-source="similarAlarm" :similar-card-data="card" height="100%" :show-hud="false" />`；
- ThreeViewer 在 `dataSource === 'similarAlarm'` 时：
  - 创建一个独立的小 Three.js 场景（`PerspectiveCamera` + `OrbitControls`，禁止用户拖拽）；
  - 自动旋转（每帧 `scene.rotation.y += dt * 0.2`）；
  - 用 `similarCardData.buildingName` 作为模型标识；
  - 复用 `buildCompositeLayer` 的简化版（只画 1 栋白模 + 1 栋主建筑）。

这样 4 张卡片 × 1 个小 Three.js 场景 + 主警情 1 个大场景，**总共 5 个 ThreeViewer 复用同一份 composable**。

### I. TiltMapView.vue 重构

**改造** `src/views/modelAssess/components/TiltMapView.vue`：

- 移除内联 Three.js 代码；
- 改为：
  ```vue
  <ThreeViewer
    data-source="masterAlarm"
    :master-alarm="masterAlarm"
    :realtime-factors="realtimeFactors"
    :trapped-floors="trappedFloors"
    :visible-layers="visibleLayers"
    :plan2-d-mode="plan2DMode"
    :plan-floor="selectedFloor"
    @pick-floor="onPickFloor"
    @pick-marker="onPickMarker"
    @pick-component="onPickComponent"
  />
  ```
- 顶部 2D/3D 切换按钮（用 `el-radio-group` / `el-button-group`）；
- 加载 / HUD / 选中小弹窗仍在 TiltMapView 层控制。

### J. MasterAlarmPanel.vue / TrappedRescuePanel.vue 适配

- 移除 `modelLoaded` 状态（已下沉到 composable）；
- 改为直接通过 `useThreeScene` 暴露的 `highlightComponent(uuid)` 等方法操作；
- 增 / 删 / 改 受困楼层时，通过 composable 的 `updateTrappedMarkers(list)` 实时更新（**已实现**）。

### K. 样式补充

**新建/改造**：
- `src/views/modelAssess/styles/three-viewer.less` — ThreeViewer 通用样式（与 model-assess.less 隔离）；
- `src/views/modelAssess/styles/plan-2d.less` — 2D 平面图样式；
- 复用 Element Plus 默认主题 + 项目 `styles/element.less` 既有覆盖。

---

## Assumptions & Decisions

1. **不复用 BIM 模块**：坚持"不修改 `src/components/BIM/**`"约束，独立抽离 `ThreeViewer` / `useThreeScene`。
2. **不引入新 UI 库**：弹窗 / 切换按钮 / 表单控件全部用 Element Plus 既有组件。
3. **不引入新 Three.js 模块**：3D 资源仍复用 `public/model3d/*`；楼层平面图用 SVG 不引入 canvas2d / d3 库。
4. **4 张相似卡片各开独立 Three.js 场景**：性能上可接受（每场景 1 栋主建筑 + 1~2 栋白模，总面数 < 2000）；若卡顿，可后续改为 InstancedMesh 合并。
5. **不强加新依赖**：`gsap` 已在 package.json（用于动画，可选用）。
6. **代码量控制**：通过 composable + 组件复用，新代码量控制在 600 行以内。
7. **弹窗数据来源于 store**：`selectedComponent: ComponentInfo` 存到 `useModelAssessStore`，通过 popover 渲染。

---

## Verification

1. `npm run dev` → `http://localhost:5173/#/modelAssess`：
   - 顶部 4 张卡片**真实 3D 缩略图**（鼠标悬停或自动旋转）；
   - 中央 3D 区域显示主警情 3D 场景（综合图层默认开，消防车 / 水源按 tab 切换显示）；
   - 切到"消防车辆"tab → 主警情 3D 中只显示消防车，其他组不可见；
   - 切到"市政水源"tab → 只显示消防栓；
2. 顶部 3D/2D 切换按钮：
   - 3D 模式：当前 3D 视图；
   - 2D 模式：显示当前选中楼层的 SVG 平面图（房间 + 楼梯 + 消防栓 + 受困人员位置）；
3. 点击 3D 中的楼层 → 弹出 Element Plus popover 显示楼层详情（层 / 高 / 起火情况 / 受困人数），高亮该楼层（emissive 描边）；
4. 点击受困人员（3D 中的人形 mesh 或 2D 中的红点）→ 弹出 popover 显示楼层 / 方位 / 人数，右下面板同步高亮该行；
5. 点击消防栓 → popover 显示 KX1 / 距离 / 状态；
6. 修改"起火楼层"为 18 → 3D 第 18 层变橙高亮，火焰精灵移动，2D 模式下平面图右下角出现火焰图标；
7. 修改"烟雾情况"为重度 → 3D 烟雾精灵密度增大；2D 平面图中整层用半透明灰雾覆盖；
8. `GetDiagnostics` 所有新/改文件 0 错误；
9. `git status` 确认 `src/components/BIM/**` 未被修改。
