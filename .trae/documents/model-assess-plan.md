# 相似警情模块（2.5D 指挥大屏）实施计划

## Summary（计划摘要）

在 `src/views/modelAssess/index.vue` 中实现“相似警情模块（2.5D 指挥大屏）”独立单页系统。
包含三个核心分区：
1. 顶部 — 4 个相似警情卡片（横向并排）；
2. 左下 — 主警情详细信息及实时要素判研面板（可编辑）；
3. 中右下 — 3D 倾斜地图区域 + 右侧高空受困救援布控面板；
4. 右上 — 指南针 + 三维视角调节。

UI 风格：深黑科技风 + 橙色高亮（`#ff7a00 / #ff9500` 系），与本项目既有 `card.vue / d3Panel.vue / topicLayerCard.vue` 一致。

代码**完全独立**：
- 新建 `src/views/modelAssess/index.vue`（入口页面）；
- 新建 `src/views/modelAssess/components/SimilarAlarmCard.vue`（顶部相似警情卡片）；
- 新建 `src/views/modelAssess/components/MasterAlarmPanel.vue`（主警情 + 实时要素判研）；
- 新建 `src/views/modelAssess/components/TiltMapView.vue`（3D 倾斜地图主视图）；
- 新建 `src/views/modelAssess/components/TrappedRescuePanel.vue`（高空受困救援布控面板）；
- 新建 `src/views/modelAssess/components/Compass3D.vue`（指南针 + 三维视角调节）；
- 新建 `src/store/useModelAssessStore.ts`（模块独立 Pinia store）并在 `src/store/index.ts` 导出；
- 新建 `src/views/modelAssess/mock.ts`（静态 mock 数据，避免污染全局 store）；
- 新建 `src/views/modelAssess/styles/model-assess.less`（独立样式）；
- 新建 `src/const/const.modelAssess.ts`（模块独立枚举常量）。

不修改既有 `views/three_platform.vue / building.vue / home.vue / region.vue / components/map/*` 等文件。

---

## Current State Analysis（现状分析）

### 关键发现

1. **目标文件 `src/views/modelAssess/index.vue` 当前为空文件**（0 行），可自由填充。
2. **路由已存在但路径不一致**：[`src/router/index.ts`](file:///d:/work/telewave/ids/ids-gis-web/src/router/index.ts#L68-L74) 的 `/modelAssess` 路由当前指向 `views/modelAssess.vue`（**不带 `/index` 路径，单文件形式**），而目标文件位于 `views/modelAssess/index.vue`（目录形式）。
   - **修复方式**：保持现有路由命名 `MODEL_ASSESS` 不变，仅修改 `router/index.ts` 中 `component: () => import('@/views/modelAssess.vue')` 改为 `() => import('@/views/modelAssess/index.vue')`。这属于"为了引入新页面必须修改的最小变更"。
3. **store 独立要求**：用户明确要求“store 管理需要新创建等”，因此**不**复用 `useDispatchStore` / `useCardStore` 等已有 store。新建 `useModelAssessStore`。
4. **UI 风格参考**：
   - 橙色高亮、卡片悬浮 — 参照 [`src/components/map/card.vue`](file:///d:/work/telewave/ids/ids-gis-web/src/components/map/card.vue) 与 [`src/components/map/component/d3Panel.vue`](file:///d:/work/telewave/ids/ids-gis-web/src/components/map/component/d3Panel.vue) 的样式。
   - Pinia store 模式（composition API）— 参照 [`src/store/useDispatchStore.ts`](file:///d:/work/telewave/ids/ids-gis-web/src/store/useDispatchStore.ts)。
   - 路由懒加载 — 参照 [`src/router/index.ts`](file:///d:/work/telewave/ids/ids-gis-web/src/router/index.ts) 既有 `() => import(...)` 模式。
5. **依赖与版本**：
   - `vue@3.5.32` + `<script setup lang="ts">` — 与既有文件一致；
   - `element-plus@2.13.6` — 可直接使用 `<el-slider>`、`<el-select>`、`<el-input-number>`、`<el-button>`、`<el-tooltip>` 等；
   - `pinia@3.0.3` — 使用组合式 store；
   - `less@4.6.4` — `<style lang="less" scoped>`。

---

## Proposed Changes（拟变更清单）

### 1. 新建 `src/const/const.modelAssess.ts`（独立枚举常量）

定义模块内的所有静态枚举与样式 token，避免污染 `const/const.map.ts`：

```typescript
// 楼层用途 / 烟雾情况枚举
export const SMOKE_LEVELS = ['轻度 (Light)', '中度 (Medium)', '重度 (Heavy)'] as const
export const TRAPPED_DIRS = ['东南角', '西北角', '东北角', '西南角'] as const

// 受困人员统计
export const TRAPPED_TOTAL_DEFAULT = 15

// 顶部相似警情卡片模拟数据
export const SIMILAR_CARDS_MOCK = [...] // 4 个卡片数据
export const MASTER_ALARM_MOCK = {...}   // 主警情基础信息
export const TRAPPED_FLOORS_MOCK = [...]  // 初始受困楼层
```

### 2. 新建 `src/store/useModelAssessStore.ts`（独立 Pinia store）

采用 setup store 模式（与 `useDispatchStore` 一致），状态包括：

- `similarCards: SimilarAlarmCardItem[]` — 4 张相似警情卡片数据；
- `masterAlarm: MasterAlarm` — 主警情详情；
- `realtimeFactors: RealtimeFactors` — 实时要素判研值（楼层总数、起火楼层、受困人数、烟雾情况）；
- `trappedFloors: TrappedFloorItem[]` — 已知受困楼层；
- `realtimeVisible: boolean` — 综合图层 / 消防车辆 / 市政水源切换；
- `activeLayerTab: 'composite' | 'vehicles' | 'water'` — 地图顶部图层切换；
- `pitchAngle / rotationAngle: number` — 三维视角调节。

Actions（增删改查）：
- `addSimilarCard(card)` / `removeSimilarCard(id)` / `updateSimilarCard(id, patch)` / `mergeSimilarCards(ids)` — 卡片 CRUD；
- `mergeToMaster(cardId)` — 合并到主警情（对应按钮"合并"）；
- `updateFactor(key, value)` — 实时要素判研编辑；
- `addTrappedFloor(item)` / `removeTrappedFloor(uuid)` / `updateTrappedFloor(uuid, patch)` — 受困楼层 CRUD；
- `syncTrappedTotal()` — 重新汇总受困总人数；
- `setActiveLayerTab(tab)` / `setPitchAngle(v)` / `setRotationAngle(v)` — UI 状态。

并在 `src/store/index.ts` 末尾追加：
```typescript
export * from './useModelAssessStore.ts'
```

### 3. 新建 `src/views/modelAssess/mock.ts`

提供静态模拟数据：`SIMILAR_CARDS_MOCK` / `MASTER_ALARM_MOCK` / `TRAPPED_FLOORS_MOCK`（如已在 `const/const.modelAssess.ts` 中定义则可省略此文件，复用即可；**最终方案**：常量放 `const.modelAssess.ts`，运行时 mock 数据放本文件，避免 const 文件夹被运行时数据污染）。

### 4. 新建 `src/views/modelAssess/components/SimilarAlarmCard.vue`

顶部 4 张并排卡片的子组件。Props：
- `card: SimilarAlarmCardItem`
- `index: number`
- `isMaster?: boolean`

布局：警情 id 标签 + 3D 缩略图占位 + 对象名称 + 警情类型 + 相似度进度条 + 地址 + 删除/合并按钮。

### 5. 新建 `src/views/modelAssess/components/MasterAlarmPanel.vue`

左下主警情 + 实时要素判研面板。

头部（COMMAND MASTER + 进行中 标签）：建筑名称、地址、GPS 坐标、建筑概况（32层/96米，起火层 15/45米 橙色高亮）。

判研区：4 行（楼层总数 / 起火楼层 / 受困人员 / 烟雾情况），每行 - 按钮 + 输入控件 + + 按钮，下拉/滑动条用 Element Plus 组件。

底部贯穿橙色"保存修改"按钮，调用 `useModelAssessStore.updateFactor()`。

### 6. 新建 `src/views/modelAssess/components/TiltMapView.vue`

3D 倾斜地图主视图（**简化为 CSS 透视 + 绝对定位的 SVG 3D 占位模型**，因为本计划不引入 Three.js 新场景，避免冲突 `BIM/ThreejsViewerBuilding.vue`）：

- 顶部三个切换 tab：综合图层（默认选中，橙色高亮）/ 消防车辆 / 市政水源。
- 中央区域：CSS 3D 透视 + 多个 `div` 立方体表示建筑（中央高亮橙色边框）；用文字浮标表示 KX1/KX2/KX3、东南角 5 人、西北角 10 人等。
- 通过 `useModelAssessStore.activeLayerTab` 切换显隐。

### 7. 新建 `src/views/modelAssess/components/TrappedRescuePanel.vue`

右下面板，标题"高空受困救援布控"。

上半部分：已知受困楼层列表（楼层、方位、人数 + - 删除按钮）。
下半部分：新增受困楼层表单（楼层 input + 方位 select + 人数 input + 添加按钮）。
底部：统计 = 总计 15 人 + 同步提示。

### 8. 新建 `src/views/modelAssess/components/Compass3D.vue`

右上角小工具：
- 圆形指南针（CSS conic-gradient + 旋转 transform）；
- 下方两个 slider 控件：俯仰角 / 方位角，分别调用 `useModelAssessStore.setPitchAngle / setRotationAngle`。

### 9. 新建 `src/views/modelAssess/styles/model-assess.less`

全局样式 token（CSS variables）：
```less
:root {
  --ma-bg: #0a0e1a;
  --ma-bg-card: #131826;
  --ma-bg-panel: #1a2236;
  --ma-border: #1f2940;
  --ma-orange: #ff7a00;
  --ma-orange-light: #ff9500;
  --ma-text: #e6ebf5;
  --ma-text-dim: #8a96b0;
  --ma-red: #ff4d4f;
  --ma-blue: #3385ff;
}
```
以及各类工具类（panel、card-header、orange-btn、slider-row 等）。

### 10. 新建 `src/views/modelAssess/index.vue`（入口页面）

```vue
<script setup lang="ts">
import { useModelAssessStore } from '@/store/useModelAssessStore'
import SimilarAlarmCard from './components/SimilarAlarmCard.vue'
import MasterAlarmPanel from './components/MasterAlarmPanel.vue'
import TiltMapView from './components/TiltMapView.vue'
import TrappedRescuePanel from './components/TrappedRescuePanel.vue'
import Compass3D from './components/Compass3D.vue'

const store = useModelAssessStore()
</script>

<template>
  <div class="model-assess-page">
    <!-- 顶部 4 张相似警情卡片 -->
    <section class="top-cards">
      <SimilarAlarmCard
        v-for="(card, i) in store.similarCards"
        :key="card.id"
        :card="card"
        :index="i"
        @remove="store.removeSimilarCard(card.id)"
        @merge="store.mergeToMaster(card.id)"
      />
    </section>

    <!-- 主体：左 = 主警情 + 判研 / 中 = 3D 地图 / 右 = 受困救援 + 指南针 -->
    <section class="main-body">
      <MasterAlarmPanel class="left" />
      <div class="center">
        <TiltMapView />
      </div>
      <div class="right">
        <TrappedRescuePanel />
        <Compass3D />
      </div>
    </section>
  </div>
</template>

<style lang="less" scoped>
@import './styles/model-assess.less';
</style>
```

### 11. 修改 `src/router/index.ts`（最小必要变更）

将：
```typescript
component: () => import('@/views/modelAssess.vue'),
```
改为：
```typescript
component: () => import('@/views/modelAssess/index.vue'),
```
这是为了把目录形式的新页面接入到既有路由，**仅 1 行变更**，符合“与现有文件保持独立”的精神（不改业务文件，只改路由指向）。

---

## Assumptions & Decisions（假设与决策）

1. **3D 地图使用 CSS 3D 占位实现，不引入 Three.js 实际场景**：避免与既有 `BIM/ThreejsViewerBuilding.vue` 冲突；如需真实 3D，由后续任务通过 `useModelAssessStore` 注入新场景。
2. **不接入真实 geoserver / WebSocket 数据源**：本期以 mock 数据 + store 内部状态为主；store 已预留 action 接口，未来可通过 `useMessageStore` 订阅 `MESSAGE_EVENT_KEY.ALARM_UPDATE` 自动刷新。
3. **样式使用独立 `.less` 文件 + scoped**，避免与 `styles/element.less` 等全局样式冲突。
4. **删除 / 合并按钮**：仅触发 store 行为，不弹确认框（按需求卡片图所示，UI 是直观的删除/合并按钮）。
5. **响应式**：首期仅适配桌面端 ≥ 1440px（与 `trp.vue` 的 `!isMobile` 分支一致），不做手机端断点。
6. **TypeScript 严格模式**：所有 props、store state、actions 显式声明类型。

---

## Verification（验证步骤）

1. **运行** `npm run dev` 启动项目；
2. **访问** `http://localhost:5173/#/modelAssess`，确认：
   - 顶部出现 4 张相似警情卡片（按 mock 数据）；
   - 左下主警情面板可调节楼层 / 起火层 / 人数 / 烟雾，调节后 store 中 `realtimeFactors` 同步变化；
   - 中央 3D 地图区域显示橙色高亮主建筑 + 周边建筑 + 消防点 KX1/KX2/KX3；
   - 右下受困救援面板可增/删受困楼层，总计自动同步；
   - 右上指南针跟随方位角变化旋转；
3. **点击删除**卡片 → store `similarCards` 长度减 1，DOM 节点同步移除；
4. **点击合并**卡片 → 触发 `mergeToMaster`，可观察主警情建筑名称变化（mock 实现）；
5. **TypeScript 编译**：`npx vue-tsc --noEmit`（或在 IDE 中观察 `getDiagnostics`）应无类型错误。
6. **Lint**：项目未配置 ESLint 脚本（`package.json` 中无 lint 命令），跳过；如未来加入，按既有规则处理。
