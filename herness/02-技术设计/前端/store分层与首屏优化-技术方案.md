# Store 分层与首屏优化 - 技术方案

> 定版日期：2026-10-28
> 状态：已落地（`pnpm lint` 0 报错）
> 关联规范：`herness/05-共享上下文/设计规范速查.md`「八·之一、Store 分层铁律」、`项目结构速查.md` store 段

---

## 1. 背景与目标

`ids-gis-web` 首屏经 `src/store/index.ts` 一次性 barrel 导出 20+ 个 Pinia store，任何 `from '@/store'` 的引用都会把整条 store 链拉进首屏 chunk（实测 `store-*.js` 189KB 进首屏）。同时部分 store 反向 `import` 引擎层（`ol/Map`）、组件层（`MapTools`）、views 层（`modelAssess/mock`）、apis 层（`searchQuery`），违反分层铁律「store 只存业务状态 + 消息中枢」。

**目标**：
1. 降低首屏经 barrel 拉入的 store 数量（Tier 1 / Tier 2 分层）。
2. 消除 store 向引擎/组件/views/apis 的越层依赖。
3. 清理零引用 store 与 store 内的死代码。
4. 把「Store 分层铁律」沉淀为规范，约束后续新增 store。

## 2. 方案要点

### 2.1 Tier 划分

- **Tier 1（全局核心，进 `store/index.ts` barrel，8 个）**：
  `useCommonStore` `useMapStore` `useMapConfigStore` `usePanelStore` `usePendingCallLocationStore` `usePendingDispatchAlarmStore` `useMessageStore` `useUserStore`
  判定口径：跨路由高频使用（用户身份 / 消息中枢 / 地图全局 / 面板 / 来电与调派报警过页态）。
- **Tier 2（路由专属，直接文件导入，不进 barrel，14 个）**：
  `useCardStore` `useLayersStore` `useTopicLayerStore` `useBaseSourceStore` `useModalStore` `useTabsStore` `useDispatchStore` `useDispatchT1Store` `useIncidentLocationStore` `useStationLayerStore` `useDispatchMapStore` `useDispatch1MapStore` `useModelAssessStore` `useSearchPanelStore`（另有 `useVehicleTrackStore` 保持直接导入）。
  仅在某条路由子树内消费，直接文件导入让其 chunk 随路由懒加载。

### 2.2 越层修复（store 只存状态）

| Store | 原问题 | 处理 |
|------|--------|------|
| `useCardStore` | `import Map from 'ol/Map'` + `import {DrawTool...} from '../components/map/MapTools'`，state 存工具实例 | 工具实例迁 `composables/useDrawTool.ts`（模块级单例）；store 只留 `drawToolType` 标识 + 数据列表；`setMapDrawTool`/`clearDrawTool` 保留为代理转发 |
| `useModelAssessStore` | `import {...MOCK} from '@/views/modelAssess/mock'` | mock 迁 `const/const.modelAssessMock.ts`；views/mock 标记 `@deprecated` re-export |
| `useSearchPanelStore` | `import {getSearchViewOptions, runSearch} from '@/apis/searchQuery'`，store 内做 HTTP 编排 | API 调用迁 `composables/useSearchActions.ts`；store 只留检索/路径规划状态 |
| `useIncidentLocationStore` | 单文件嵌套定义 `useStationLayerStore` + `useNearbyResourceLayerStore` | 拆至独立 `store/useStationLayerStore.ts`；原文件保留 re-export 兼容存量 import |
| `useTabsStore` | 内部 `useRouter().push(...)`，store 耦合路由生命周期 | 去掉 router，只改 `activeTab`；导航由调用方组件 `router.push` |
| `useDispatchStore` | `onUnmounted`（store 非组件）+ 30+ 行注释 WebSocket + 空 `sendWsMessage` + 无消费方 `wsStatus` | 清理，store 精简到 dispatch/alarmData/navPathPlanData + setDispatch |

### 2.3 死代码

- 删除 `store/useModalMap.ts`（全仓零引用）。
- `useMessageStore916` 保留（旧走线行为基准，不可删，见状态摘要）。

## 3. 涉及文件清单

**新建**
- `src/store/useStationLayerStore.ts`
- `src/composables/useDrawTool.ts`
- `src/composables/useSearchActions.ts`
- `src/const/const.modelAssessMock.ts`

**改动（store 本体）**
- `src/store/index.ts`（barrel 收敛为 8 个 Tier 1）
- `src/store/useCardStore.ts`
- `src/store/useModelAssessStore.ts`
- `src/store/useSearchPanelStore.ts`
- `src/store/useIncidentLocationStore.ts`（拆嵌套 + re-export）
- `src/store/useTabsStore.ts`
- `src/store/useDispatchStore.ts`
- `src/views/modelAssess/mock.ts`（@deprecated re-export）

**import 路径更新（Tier 2 从 barrel 改直接文件）**
- `baseComponent/OpenlayersMap/dispatchMap.vue`、`DispatchT1.ts`
- `baseComponent/OpenlayersMap/FeatureClickQuery.ts`、`map.vue`、`useBaseMapLayer.ts`
- `baseComponent/amap/useAmapTools.ts`
- `components/BIM/ThreejsViewerBuilding.vue`、`ThreejsViewerRegion.vue`、`viewerInquiryBuilding.vue`
- `components/bottomNav/index.vue`、`components/dispatchMap/index.vue`、`components/map/index.vue`
- `components/map/card.vue`、`clear.vue`、`trp.vue`、`form/*Form.vue`、`component/baseSource.vue`、`component/circleQueryPanel.vue`、`component/routePlanPanel.vue`、`component/topicLayerCard.vue`
- `components/Modals/index.vue`、`setting.vue`
- `composables/useCurrentMap.ts`
- `views/modelAssess/components/MiniMap.vue`

**删除**
- `src/store/useModalMap.ts`

**herness 文档**
- `设计规范速查.md` 追加「八·之一、Store 分层铁律」
- `项目结构速查.md` store 段标注 Tier、移除 `useModalMap`
- `当前状态摘要.md` 更新「首屏 JS 仍偏重」条目 + 追加决策记录
- 本方案文档

## 4. 契约影响

- 无消息事件键 / DTO / HTTP 接口 / 状态机对外契约变化。
- `useIncidentLocationStore.ts` 保留 `useStationLayerStore` / `useNearbyResourceLayerStore` / `LOCATION_*_OWNER_PREFIX` / `DISPATCH_T1_STATION_OWNER` 的 re-export，存量 `from '@/store/useIncidentLocationStore'` 导入无需改动；`DispatchT1.ts` 已顺带改为直接指向 `useStationLayerStore`。

## 5. 异常兜底

- 工具实例经 `useDrawTool` 模块级单例承接：`card.vue` 删 feature 走 `getCurrentTool().vectorLayer`，`trp.vue` 圈选传 `panelStore.setCircleQueryTool(getCurrentTool())`，切换工具前先 `destroy()` 旧实例。
- `useSearchActions` 内 API 失败保留原 `console.warn` + `searchError` 文案，行为与迁移前一致。

## 6. 验证方式

- `pnpm lint`（`vue-tsc --noEmit`）**0 报错**（已验证）。
- 全仓扫描确认无 Tier 2 store 仍经 `@/store` barrel 导入（仅 Tier 1 8 个在 barrel 中）。
- 手动回归：`/dispatch`、`/dispatch1` map 渲染正常；`/modelAssess` mock 正常；`/map` 检索面板 + 绘制工具正常。
- 首屏验证：`/map` 路由下 network 面板确认 Tier 2 store 未随首屏 barrel 加载。

## 7. 回滚方式

纯代码层改动，无数据迁移。回滚 = `git revert` 本批 commit（store 文件 + import 路径 + 4 个新文件 + herness 文档）。`useModalMap.ts` 已删除，回滚时由 git 恢复。

## 8. 遗留 / 后续

- `useMapStore` 等仍 `markRaw` 持有 `ol.Map` 实例（S1 存量例外），待 controller 层统一重构时再迁出，本轮按用户决定不动。
- `vite.config.ts` 的 `manualChunks` / `advancedChunks` 分包策略仍待单独立项（见状态摘要「首屏 JS 仍偏重」）。
