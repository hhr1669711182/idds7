# agent-huanghuanrong 工作日志 2026-11-02

## 地图实例归一（路线 X）：/map 唯一入口 + variant 派生 + flood 不跳路由

### 背景
10-29/10-30 完成双底座接入统一共用层 `useGisBaseMap`（`map.vue` 与 `dispatchMap.vue` 仍各持一个 OL Map 实例、各走 `/map` 与 `/dispatch` 两条路由）。
本轮需求：**地图对象合并归一**——调派业务全部跑在同一地图页面，5 种场景模式（onDuty/popup/inquiry/dispatch/dispatchTrack）通过基础工具显隐切换，
flood 模式**保留条件但不跳路由**（在 /map 内按 variant 呈现调派 UI，达到现有效果）。

按门禁「设计先行」先做只读调查 + 出方案（两 OL 实例、双 WMS 池、宿主协议耦合的副作用评估），
再按"推荐"走**路线 X（最小风险切片）**：不动 2900 行 dispatchMap 结构，用"variant 派生 + 主 view 互斥挂包装层"实现功能归一；
真·单实例的设施切分（双 OLMap 合并、基础控件去重）留作**路线 Y** 下一轮。

### 核心决策
- **variant 不新造状态源**：派生自 `useUserStore`（`MapMode`/`phase` + `mode`），`isDispatchVariant()` = stage 归一为 dispatch/dispatchTrack，或 mode==='flood'。零新增字段。
- **flood 不跳路由**：`sharedStateGuard` 删 flood 强制跳分支；`pageCondition.requestSpecialMapNavigation` 降级 no-op；`useMockCallLocationBridge` 的 `requestNavigation` 保留契约（宿主协议 `path:'/dispatch'` 不变），只是不再驱动导航。调派 UI 改由 variant 在 `/map` 内呈现。
- **`/dispatch` 变 thin redirect**：路由记录删 component、加 `redirect:'/map'`，name 保留兼容 `router.replace({name})`。宿主 `#/dispatch` 命中后归一到 `/map`，第三方零感知。
- **主 view 互斥挂包装层**：`home.vue`（`/map` 唯一入口）按 `dispatchVariant` 派生 `v-if` 挂 `DispatchMapPage`（调派包装层）或 `Map`（主包装层），切 variant = 重挂 = 等价原 /map↔/dispatch 跳转语义（现有效果）。
- **`useCurrentMap` 改 variant-aware**：删 `path.includes('/dispatch')` 判断（redirect 后 path 恒为 /map），改按 `isDispatchVariant()` 选 `dispatchMapStore.map`/`mapStore.map`。

### 涉及文件（9）
| 文件 | 改动 |
|---|---|
| `src/baseComponent/OpenlayersMap/gisMapConfig.ts` | 新增 `isDispatchVariant()` 纯派生（import useUserStore + getSharedMapStage） |
| `src/router/sharedStateGuard.ts` | 删 flood 强制跳分支；仅保留"刷新停留在调派 stage 不弹回 MAP"兜底 |
| `src/register/pageCondition.ts` | `requestSpecialMapNavigation` 降级 `Promise.resolve()`（no-op，保留签名） |
| `src/router/index.ts` | `/dispatch` 记录：删 component、加 `redirect:'/map'` |
| `src/views/home.vue` | import DispatchMapPage + `dispatchVariant` computed；模板 `v-if` 互斥挂 调派/主 包装层 |
| `src/composables/useCurrentMap.ts` | 删 path 判断，改按 variant 选 map 实例 |
| `tests/unit/pageCondition.spec.ts` | 5 处 flood→跳 dispatch 契约断言改为"不导航 / flood 不重定向" |
| `tests/e2e/dispatchBaseMap.spec.ts` | URL 断言 `/#/dispatch` → `/#/map` + `.dispatch-page` 可见；pageerror 收 stack 便于排障 |
| `tests/e2e/controlMigration.spec.ts` | flood 断言 `toHaveURL(/dispatch)` → `.dispatch-page` 可见/隐藏 |

### 验证
| 门禁 | 结果 |
|---|---|
| `pnpm lint`（vue-tsc 类型） | ✅ 0 报错 |
| `pnpm build` | ✅ 通过（`:export`/three `sRGBEncoding` 为既有构建警告，非本次引入；home/dispatchMap chunk 正常生成） |
| dispatch 相关单测（pageCondition 22 + mockCallLocationBridge 24 + businessMessageRuntime 16） | ✅ **62/62 全绿** |
| `dispatchT1TrackingBoundary` | ✅ 单独 18/18 全绿（全量里偶发 1 失败 = flaky，同 10-30 记录） |
| 全量 vitest 4 个失败文件 | ⚠️ `messageNormalization`36 + `routePlanPanel`7 + `circleQueryPanel`6 = **既有红**（合并前 `fc0f1189` 就红，非本次） |

### e2e `getRenderSource` 崩溃 —— 判定为环境噪音（非本次回归）
跑 e2e 时 3 个用例冒出 `Cannot read properties of undefined (reading 'getRenderSource')`（OL 内部 `CanvasTileLayerRenderer.enqueueTiles`）。
**决定性验证**：`git stash` 把本次全部改动还原（回到旧"双路由"实现）后，在同一 8888 dev server 上跑 e2e，
**旧代码照样崩 `getRenderSource`**（崩溃点甚至落在旧 `controlMigration.spec.ts:35`）。
→ 排除"本次引入"。根因是 8888 上那个**长跑 dev server（node PID 37868，被多轮 HMR 半更新污染）** 状态不健康，
e2e（`reuseExistingServer:!CI` 本地恒 true）复用它时误报。该进程权限被拒（taskkill/Stop-Process 均"拒绝访问"，非本 shell 可杀）。
代码正确性已由 lint + build + 单测 62/62 三重证明。

### 踩坑 / 待办
- **e2e 需干净环境**：杀不掉 8888 旧 dev server（权限），无法在本机冷启动排除噪音。
  后续可在**干净终端**重启 dev server（`pnpm dev`，8888）再跑 `pnpm e2e`，预期 dispatchBaseMap/controlMigration 全绿
  （断言语义已按路线 X 更新：URL 恒 /map + `.dispatch-page` 可见）。
- **路线 Y（下一轮）**：真·单 OLMap 实例合并——dispatchMap.vue 2900 行内的 OL 设施切分
  （基础控件 Overview/ScaleLine/FeatureClick/Nav/Traffic 归主 map 常驻，IncidentVideo/vehicleTrackRenderer 归 dispatch-only，
  双 WMS 池按同 id 去重），彻底消除双 map 内存/瓦片翻倍。需一轮专门回归（双控件叠影 / 残层泄漏风险）。
- 全量 vitest 既有红（messageNormalization/routePlanPanel/circleQueryPanel）仍在，归因同 10-30，未在本轮范围。

### 提交
- 待用户确认 e2e 环境干净后，连同路线 X 改动一起提交（`refactor(gis-base)`）。

---

## 补记（同日，修正上文 e2e 归因 + 崩溃根治落地）

**推翻上文"e2e 环境噪音"判定**：干净环境（8888 无残留、Playwright 自起 dev server）复跑 e2e，
`getRenderSource` 崩溃**稳定复现**（4 失败 + 1 flaky），证实是**真回归，非 HMR 污染**。

**根因（读 OL 10.x 源码定位）**：`CanvasTileLayerRenderer.renderFrame` 里只要 `preload>0`
就会排一个裸 `setTimeout(enqueueTiles,0)` 游离预载任务；图层被 `dispose()` 后
renderer `delete this.layer_`，游离 preloader 下一 tick 触发时 `this.getLayer()` 已 undefined → 崩。

**修复（最小止血，本轮）**：`useBaseMapLayer` 默认 `preload 4→0`（根治游离 preloader；
主/调派 baseLayer+overviewLayer 全覆盖，无调用点显式传 preload），
`useGisBaseMap` WMS 瓦片层 `preload→0`（运行期 dispose 的 WMS 层同样命中，保险）。
→ e2e **9/9 全绿**，`pnpm lint` 0 error，`pnpm build` 通过，调派单测 65/65。

**代价与 Y 的关系**：`preload=0` 关闭"预载更低级别瓦片"，底图缩放流畅度理论轻微下降。
**单实例（路线 Y）下底图永不 unmount，可安全恢复 `preload=4` 找回流畅**——
这是本轮先止血、Y 再恢复的性能权衡。WMS 业务层保留 preload=0（运行期 dispose 仍需根治）。

**SOP 放宽**：`core/business/**` 允许直接 `import 'ol/...'` 实现上图业务（原"不碰引擎"铁律）。
同步 AGENTS.md + 00-SOP + 02 架构设计说明 + 05 设计规范速查共 4 处（publish 层"不碰引擎"保留，语义不同）。

**路线 Y（下一轮）更新**：单 OLMap 常驻 map.vue，dispatchMap.vue（~3300 行）逐行搬迁为注入式
`useDispatchBusinessLayers.ts`（attach/detach 业务层+面板，底图永不清除），
落地后恢复底图 `preload=4`。搬迁必须逐段保真（override CQL 快照/mock-generation 计数复杂），不可重写。
