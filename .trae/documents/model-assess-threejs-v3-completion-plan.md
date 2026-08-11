# modelAssess 深度重构 — 收尾完成计划

## Summary（计划摘要）

承接上一轮 `model-assess-threejs-v2-plan.md` 审批通过的 v2 计划（已实现 5 个 builder + 6 个 update 的 `useThreeScene` composable、可复用 `<ThreeViewer>` 容器、`<FloorPlan2D>` SVG 平面图、`<ComponentDetailPopover>` 详情弹窗、3D 人形 mesh `createPersonMesh`、图层子组拆分等），本计划只关注**剩余收尾工作**：

1. **`SimilarAlarmCard.vue` 改造** — 把顶部 4 张相似警情卡片里那个 CSS 渐变 `.thumb` 占位替换为 `<ThreeViewer data-source="similarAlarm" :similar-card-data="card" />`，实现用户明确要求的"相似警情的小模型也要用 threejs 显示，且复用同一个 ThreeViewer 组件"。
2. **样式文件补齐** — 抽出 `three-viewer.less` 与 `plan-2d.less`，与 `model-assess.less` 隔离但不冲突。
3. **TypeScript 校验 + 端到端验收** — `GetDiagnostics` 所有新/改文件 0 错误；4 张相似卡片在主警情页面打开后能看到自动旋转的 3D 缩略图（不是占位渐变方块）。

---

## Current State Analysis（现状分析）

### 已完成（来自上一轮 v2 计划）

| 资产 | 路径 | 状态 |
| --- | --- | --- |
| `useThreeScene` composable | [useThreeScene.ts](file:///d:/work/telewave/ids/ids-gis-web/src/views/modelAssess/composables/useThreeScene.ts) | ✅ 5 个 builder + 6 个 update + 点击拾取 |
| `<ThreeViewer>` 容器组件 | [ThreeViewer.vue](file:///d:/work/telewave/ids/ids-gis-web/src/views/modelAssess/components/ThreeViewer.vue) | ✅ 已实现 `dataSource: 'masterAlarm' \| 'similarAlarm'` 两种模式 |
| `<FloorPlan2D>` SVG 平面图 | [FloorPlan2D.vue](file:///d:/work/telewave/ids/ids-gis-web/src/views/modelAssess/components/FloorPlan2D.vue) | ✅ 房间网格 + 楼梯 + 消防栓 + 受困人员 + 起火层高亮 + 烟雾覆盖 |
| `<ComponentDetailPopover>` 弹窗 | [ComponentDetailPopover.vue](file:///d:/work/telewave/ids/ids-gis-web/src/views/modelAssess/components/ComponentDetailPopover.vue) | ✅ 4 种构件类型 + 定位/编辑动作 |
| `<TiltMapView>` 主视图 | [TiltMapView.vue](file:///d:/work/telewave/ids/ids-gis-web/src/views/modelAssess/components/TiltMapView.vue) | ✅ 3D/2D 切换 + ThreeViewer + 弹窗 + 顶部图层 tabs |
| 3D 人形 mesh | [createPersonMesh.ts](file:///d:/work/telewave/ids/ids-gis-web/src/views/modelAssess/model3d/createPersonMesh.ts) | ✅ 头/身/四肢/警示环 |
| 三个图层子组 | useThreeScene 内 `layerGroupRef` | ✅ 综合/车辆/水源 独立 `Group` |
| store 扩展 | [useModelAssessStore.ts](file:///d:/work/telewave/ids/ids-gis-web/src/store/useModelAssessStore.ts) | ✅ `selectedComponent` / `plan2DMode` / 6 个新 action |

### 仍未完成（本计划覆盖）

1. **`SimilarAlarmCard.vue` 仍用 CSS 占位** — 看 [SimilarAlarmCard.vue#L25](file:///d:/work/telewave/ids/ids-gis-web/src/views/modelAssess/components/SimilarAlarmCard.vue#L25) 还是 `<div class="thumb"></div>`，里面的渐变条纹 + 中心方块脉冲动画 = **纯 CSS 占位，没有 threejs**。这一行直接违反用户最新要求"相似警情的那个小模型加载也要使用threejs显示，可以复用"。
2. **样式未拆文件** — `<ThreeViewer>` 与 `<FloorPlan2D>` 的样式都散在组件 `<style scoped>` 内（[ThreeViewer.vue#L126-L157](file:///d:/work/telewave/ids/ids-gis-web/src/views/modelAssess/components/ThreeViewer.vue#L126-L157)），`<FloorPlan2D>` 同理。需要按 v2 计划的 J 节抽出 `three-viewer.less` 与 `plan-2d.less`。
3. **未做最终 TypeScript 校验** — 由于 TiltMapView 内 `el-button` 事件表达式是 `@click="!plan2DMode || onTogglePlan()"` 这种混合短路表达式，需逐文件 `GetDiagnostics` 确认无报错。

---

## Proposed Changes（拟变更清单）

### 1. `SimilarAlarmCard.vue` 改造 — 嵌入 ThreeViewer 缩略图

**文件**：`src/views/modelAssess/components/SimilarAlarmCard.vue`

**what**：把现有 `<div class="thumb"></div>` 占位替换为 `<ThreeViewer>`，复用同一份组件，区别仅在 `dataSource` 和 props。

**why**：直接兑现用户"相似警情的那个小模型加载也要使用 threejs 显示，可以复用（引入同一个 threejs 组件根据数据源初始化一个）"的明确要求；提升顶部 4 张卡片的视觉信息密度（自动旋转的 3D 楼宇 + 火焰/烟雾）。

**how**（在 `<script setup>` 引入 + 模板替换）：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { SimilarAlarmCardItem } from '@/const/const.modelAssess'
import ThreeViewer from './ThreeViewer.vue'
import { useModelAssessStore } from '@/store/useModelAssessStore'

const props = defineProps<{
  card: SimilarAlarmCardItem
  index: number
}>()

const store = useModelAssessStore()

// 缩略图派生 props：复用主警情实时要素（每张卡片都用主警情的主建筑/火灾态势做背景动画）
const realtimeFactors = computed(() => store.realtimeFactors)
const trappedFloors = computed(() => store.trappedFloors)

const emit = defineEmits<{
  (e: 'remove', id: string): void
  (e: 'merge', id: string): void
}>()
</script>

<template>
  <div class="similar-card">
    <span class="id-tag">警情id: {{ card.id }}</span>
    <!-- 缩略图改为 ThreeViewer（自动旋转、非交互） -->
    <div class="thumb">
      <ThreeViewer
        data-source="similarAlarm"
        :similar-card-data="card"
        :realtime-factors="realtimeFactors"
        :trapped-floors="trappedFloors"
        :interactive="false"
        :show-h-u-d="false"
        height="100%"
      />
    </div>
    <!-- ... 其余 .info / .actions 不变 ... -->
  </div>
</template>
```

**CSS 调整**（移除 `.thumb::after` 那个红橙方块脉冲占位，改为容纳画布）：

```less
.similar-card .thumb {
  width: 70px;
  height: 100%;
  background: #050810;
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
}
.similar-card .thumb :deep(.three-viewer) {
  height: 100% !important;
}
.similar-card .thumb :deep(.three-canvas canvas) {
  display: block;
}
```

**TiltMapView / ThreeViewer 已知小修补**（顺手做，不算新功能）：

- [TiltMapView.vue#L65 & L72](file:///d:/work/telewave/ids/ids-gis-web/src/views/modelAssess/components/TiltMapView.vue#L65) 中 `@click="!plan2DMode || onTogglePlan()"` / `@click="plan2DMode || onTogglePlan()"` 改为更可读的 `@click="!plan2DMode && onTogglePlan()"` / `@click="plan2DMode && onTogglePlan()"`。**仅改善可读性，不改行为**。
- [TiltMapView.vue#L63 & L70](file:///d:/work/telewave/ids/ids-gis-web/src/views/modelAssess/components/TiltMapView.vue#L63) Element Plus `el-button` 的 `type` 字符串保持 `'warning'` 不变（这是合法值）。

### 2. 抽出 `three-viewer.less` 与 `plan-2d.less`

**新建** `src/views/modelAssess/styles/three-viewer.less`

把 [ThreeViewer.vue](file:///d:/work/telewave/ids/ids-gis-web/src/views/modelAssess/components/ThreeViewer.vue) 内的 `.three-viewer` / `.three-canvas` / `.three-canvas :deep(canvas)` / `.three-hud` 整段复制到独立 less 文件，删除组件内 `<style scoped>` 重复定义，并在组件顶部 `import`：

```vue
<style lang="less" scoped>
@import '../styles/three-viewer.less';
</style>
```

**新建** `src/views/modelAssess/styles/plan-2d.less`

把 [FloorPlan2D.vue](file:///d:/work/telewave/ids/ids-gis-web/src/views/modelAssess/components/FloorPlan2D.vue) 内 `.plan-2d` / `.plan-header` / `.plan-svg` / `.trapped-marker` / `.hydrant` / `.fire-marker` 复制到独立 less 文件，组件内改为 `@import`。

**why**：与 v2 计划 K 节对齐，便于后续主警情多个楼层平面图复用；样式与逻辑解耦。

### 3. 端到端验收 + TypeScript 校验

| 步骤 | 命令/工具 | 期望 |
| --- | --- | --- |
| 检查所有新/改文件 TS | `GetDiagnostics` 逐文件 | 0 error / 0 warning |
| 启动 dev server | `npm run dev` | 无编译错误 |
| 打开 `/modelAssess` | 浏览器 | 顶部 4 张卡片显示**自动旋转的 3D 楼宇缩略图**（不再是 CSS 渐变方块） |
| 切换图层 tab | 点击"消防车辆" / "市政水源" | 主警情 3D 视图按图层显隐 |
| 点击主警情楼层 | 鼠标点击 | 弹出 `<ComponentDetailPopover>` 显示楼层详情 |
| 切换 2D 平面 | 点击"📐 2D 平面" | 主警情区显示 SVG 平面图，房间 + 楼梯 + 消防栓 + 受困人员 + 起火标记 |
| 切回 3D | 点击"🎮 3D" | 切回 3D 视图 |
| 接受相似卡片 | 点击"⇄ 合并" | 合并到主警情，卡片消失 |

---

## Assumptions & Decisions

1. **不动 `src/components/BIM/**`** — 沿用 v2 强约束。
2. **不引入新依赖** — 4 张相似卡各开一个 Three.js 独立场景（每场景 < 2000 面），4 个 WebGL 上下文共存浏览器可接受；如未来卡顿再合并 InstancedMesh。
3. **样式不冲突** — `three-viewer.less` / `plan-2d.less` 沿用 [model-assess.less](file:///d:/work/telewave/ids/ids-gis-web/src/views/modelAssess/styles/model-assess.less) 已有变量（@ma-orange / @ma-bg 等），不重定义。
4. **缩略图沿用主警情实时数据** — 4 张相似卡内 `<ThreeViewer>` 共用同一 `realtimeFactors` / `trappedFloors`（实际是 mock），保证主警情与相似卡的视觉信息一致（楼层总数 / 起火层 / 烟雾）。
5. **不出现在 masterAlarm 之外** — `masterAlarm` 仍由 `useModelAssessStore` 单点管理；相似卡的 `similarCardData` 仍走 `<ThreeViewer>` 的 `similarCardData?` prop，符合 v2 计划的 props 契约。

---

## Verification（验证清单）

1. `git status` 确认 `src/components/BIM/**` 与 `src/components/map/MapTools/drawMapTools/addressRobot.ts` 未被本计划触碰。
2. `GetDiagnostics` 检查以下文件全部 0 报错：
   - `src/views/modelAssess/components/SimilarAlarmCard.vue`
   - `src/views/modelAssess/components/ThreeViewer.vue`（仅做 import 调整）
   - `src/views/modelAssess/components/TiltMapView.vue`（仅做表达式可读性调整）
   - `src/views/modelAssess/components/FloorPlan2D.vue`（仅做 import 调整）
   - 新建 `src/views/modelAssess/styles/three-viewer.less`
   - 新建 `src/views/modelAssess/styles/plan-2d.less`
3. `npm run dev` 启动后访问 `http://localhost:5173/#/modelAssess`：
   - 顶部 4 张相似卡片左侧 70px 宽区域内能看到**自动旋转的 3D 楼宇模型**（无 CSS 渐变方块、无中心橙色脉冲）；
   - 鼠标移到相似卡缩略图上不会出现"可拖拽"指针（因为 `:interactive="false"`）；
   - 主警情区域显示综合图层（白模 + 主建筑 + 起火层高亮 + 火焰精灵 + 烟雾精灵 + 受困人员人形 mesh）；
   - 切到"消防车辆"tab → 主警情 3D 中只显示消防车；
   - 切到"市政水源"tab → 只显示消防栓；
   - 点击主警情 3D 视图中的某层楼 → 弹窗出现在右侧并显示该楼层信息；
   - 切换"📐 2D 平面"→ 平面图淡入；切回"🎮 3D"→ 3D 视图淡入。
4. 性能验证：DevTools Performance 面板录制 5s，4 张相似卡 + 主警情 3D 同时渲染，FPS ≥ 30。
