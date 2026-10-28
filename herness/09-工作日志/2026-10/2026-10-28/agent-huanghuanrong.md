# 2026-10-28 工作日志（agent-huanghuanrong）

## 任务：方向箭头统一走「缩放分级 Overlay」+ 接口收口（`createRouteOverlayLayer` 工厂）

### 背景
接续 10-27 的路线上图底座（`routeBase.ts`）。dispatch1（高德调派）的箭头带"缩放时分级增减、锚点不滑动"的效果，
而 `SearchResultTool` / `DispatchT1`(OL 调派) / `VehicleTrackRenderer` 用的是**静态 Feature 撒点**（画线时按当时
resolution 快照一次），缩放后密度/数量不变，观感和 dispatch1 不一致。本次把这套"缩放分级"机制下沉底座，
4 个消费方统一接入，并把"图层必须开 `updateWhile*` 两 flag"的隐性契约收成唯一工厂入口。

### 改动（5 文件，净 -132 行，`pnpm lint` 0 报错）
| 文件 | 改动 |
|------|------|
| `src/baseComponent/tools/routeBase.ts` | 下沉 `createRouteDirectionOverlay`（单 Feature MultiLineString + 带 resolution 的样式函数 + 2ⁿ 量化缓存）+ 导出 `getRouteArrowResolution`；新增 `createRouteOverlayLayer` 工厂（固定 `updateWhileInteracting`/`updateWhileAnimating: true`，消费方只传 zIndex/className/style/renderOrder/properties） |
| `src/baseComponent/amap/useAmapTools.ts` | 原 Overlay 实现删体改薄封装（re-export 底座），`MultiLineString` 冗余导入清理 |
| `src/components/map/MapTools/drawMapTools/SearchResultTool.ts` | `drawRouteArrows` 切 overlay（删自写 routeArrow.svg + 7×7 + 300m 密度算法）；`routeLayer` 走工厂 |
| `src/baseComponent/OpenlayersMap/DispatchT1.ts` | 箭头切 overlay（单 Feature 携带 `stationId`/`routePlanIndex`/`routeAlternative`，命中既有删除路径）；`routeLayer`/`vehicleLayer` 走工厂 |
| `src/baseComponent/OpenlayersMap/VehicleTrackRenderer.ts` | 箭头切 overlay（`trackRank=2` 保留）；fit 回调删冗余重建；图层走工厂；删未用的 `VectorLayer` 导入 |

### 机制要点（"overlay"是行业词，非 `ol/Overlay` 类）
- 单 Feature（MultiLineString）承载整条路线，箭头由**带 resolution 的样式函数**动态算出；
- OL 原生：样式函数签名带 `resolution` 时，每次视图渲染（pan/zoom/动画帧）会收到当前分辨率；
- resolution 量化到 2ⁿ + 级别缓存 → 同级不重算（锚点不滑动），跳级才按 40px 间距增减；
- 图层开 `updateWhileInteracting`/`updateWhileAnimating` → 缩放动画中实时生效。

### 踩坑
- **OL 10 无 `VectorLayerOptions` 命名导出**：`import type { VectorLayerOptions } from 'ol/layer/Vector'` 报 TS2614。改用独立接口 `RouteOverlayLayerOptions` 手写签名。
- **回调参数是 `FeatureLike`（`Feature | RenderFeature`）而非 `Feature`**：`style`/`renderOrder` 回调形参须用 `FeatureLike`（`ol/Feature` 命名导出），否则 TS2322 不兼容。
- **`fromLonLat` 只投影单个坐标**：demo 里误传整包坐标数组 → `getExtent()` 返回空 → `view.fit` 抛 "Cannot fit empty extent"；须 `coords.map(fromLonLat)`（与 `projectCoords` 口径一致）。
- **OL standalone demo 加载方式**：jsDelivr 上 ol ESM 文件在包根（`.../ol@10.8.0/Map.js`，非 `dist/ol/`），`importmap` 前缀映射不可靠；改 UMD 全局构建（`dist/ol.js` → `window.ol`）最稳。离线环境无网渲染 OSM 瓦片会报 `getExtent is not a function`，demo 去瓦片层、背景走 CSS（箭头/线是矢量层，不影响演示）。

### 验证
- `pnpm lint`（vue-tsc）0 报错。
- 独立可视化 demo（`demo/route-arrow-overlay-demo.html`，UMD 全局 OL + 本地 `node_modules` 引用，不入库）：双图联动缩放对比，zoom-10（量化 128）旧 57 个 / 新 1 个；zoom-16（量化 2）旧仍 57 / 新 115。Playwright headless 截图（`demo/shot.cjs`，chromium-1234）验证渲染无报错。demo 目录仅作验证材料，不入库。

### 回写
- `公共工具速查.md`：路线上图原语条目补 `createRouteDirectionOverlay` / `createRouteOverlayLayer` / `getRouteArrowResolution`，标注"缩放分级箭头统一走 overlay + 工厂"。
- `当前状态摘要.md`：路线底座条目补 overlay 分级箭头 + 图层工厂收口。

---

## 任务：全局 Store 分层与首屏优化（Tier 拆分 + 越层修复）

### 背景
首屏经 `src/store/index.ts` 一次性 barrel 导出 20+ 个 store，任何 `from '@/store'` 都把整条 store 链拉进首屏 chunk（实测 `store-*.js` 189KB）；同时 4 个 store 反向 import 引擎/组件/views/apis，违反分层铁律。本次做 Tier 分层 + 越层修复 + 死代码清理。

### 决策（用户确认）
- **`useMapStore` 不处理**（仍 `markRaw` 持 ol.Map 实例），列为 S1 存量例外。
- `useDispatchMapStore` / `useDispatch1MapStore` 仅从 barrel 移出（map 字段保留）。

### 改动
| 类别 | 文件 | 改动 |
|------|------|------|
| 新建 | `src/store/useStationLayerStore.ts` | 从 `useIncidentLocationStore` 拆出 `useStationLayerStore` + `useNearbyResourceLayerStore` + owner 前缀常量 + `NearbyResourceCircle` 类型 |
| 新建 | `src/composables/useDrawTool.ts` | 承接 `useCardStore` 的 ol/Map + MapTools 工具生命周期（模块级单例）；导出 `setMapDrawTool`/`clearDrawTool`/`getCurrentTool` |
| 新建 | `src/composables/useSearchActions.ts` | 承接 `useSearchPanelStore` 的 API 调用（`runKeywordSearch`/`runViewSearch`/`runCircleSearch`/`viewOptions`） |
| 新建 | `src/const/const.modelAssessMock.ts` | 承接 `views/modelAssess/mock.ts` 的三组 mock |
| 改 | `src/store/index.ts` | barrel 收敛为 8 个 Tier 1（Common/Map/MapConfig/Panel/PendingCall/PendingDispatchAlarm/Message/User） |
| 改 | `src/store/useCardStore.ts` | 删 ol/Map + MapTools + drawTool 实例；保留 `drawToolType` 标识 + 数据列表；工具方法改经 `useDrawTool` 代理 |
| 改 | `src/store/useModelAssessStore.ts` | mock import 改 `const/const.modelAssessMock` |
| 改 | `src/store/useSearchPanelStore.ts` | 删 apis import + 3 个 search action + `viewOptions`，只留状态 |
| 改 | `src/store/useIncidentLocationStore.ts` | 拆嵌套 store，保留 re-export 兼容存量 import；去未用 `computed` |
| 改 | `src/store/useTabsStore.ts` | 去 `useRouter`，只改 `activeTab` |
| 改 | `src/store/useDispatchStore.ts` | 删 `onUnmounted` + 注释 WebSocket + 空 `sendWsMessage` + 无消费方 `wsStatus`（103→55 行） |
| 改 | `src/views/modelAssess/mock.ts` | 标记 `@deprecated` re-export |
| 改 | ~25 个调用方 | Tier 2 store 从 `@/store` barrel 改为直接文件导入 |
| 删 | `src/store/useModalMap.ts` | 全仓零引用死代码 |

### 踩坑
- **循环依赖**：`useCardStore` 若 import `useDrawTool`（后者又 import `useCardStore`）→ 循环。解决：store 不 import composable，工具实例放 `useDrawTool` 模块级单例，调用方（card.vue 删 feature、trp.vue 传 circleQueryTool）经 `getCurrentTool()` 取实例；store 里的 `setMapDrawTool`/`clearDrawTool` 仅作代理（实际已改为调用方直接用 `useDrawTool`）。
- **`clear.vue` 未用 import**：改用 `useDrawTool` 后 `useCardStore` 不再使用 → TS6133，删除。
- **`useSearchActions` 未用 import**：`ref`/`ComputedRef`/部分类型导入未用 → TS 报，清理到只保留 `computed` + 实际用到的类型。
- **cmd 单引号转义**：node 内联脚本多行/单引号被 cmd 吃掉，检测脚本落盘 `.mjs`（仓库 `type:module`，`.js` 会走 ESM 报 `require` undefined）。

### 验证
- `pnpm lint`（vue-tsc）0 报错。
- `pnpm build` 成功（lightningcss `export` 伪类警告为存量 CSS 噪声，与本次改动无关）。
- 全仓扫描：无 Tier 2 store 仍经 `@/store` barrel 导入；`useModalMap` 零残留。

### 回写
- `设计规范速查.md`：新增「八·之一、Store 分层铁律」（S1~S6 + Tier 划分表 + 例外说明）。
- `项目结构速查.md`：store 段标 Tier 1/2、移除 `useModalMap`；"新增全局状态"落点补 Tier 判定。
- `当前状态摘要.md`：更新"首屏 JS 仍偏重"条目为 Tier 分层已落地；追加 2026-10-28 决策记录。
- 新建 `02-技术设计/前端/store分层与首屏优化-技术方案.md` + 登记进 `_index.md`（文档列表 + 近期方案索引）。
- 遗留：`useMapStore` 等持 ol.Map 实例属存量例外，待 controller 层重构统一处理；`vite manualChunks` 分包另立项。
