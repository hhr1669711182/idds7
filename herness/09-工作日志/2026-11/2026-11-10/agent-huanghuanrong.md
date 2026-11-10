# 工作日志 2026-11-10（agent-huanghuanrong）

## 追加：进调派态即清来电粗定位圈（复刻路线Y 前 /dispatch unmount 旧语义）

**背景**：用户发现来电定位圈（粗定位 polygon + marker + text）在进调派跟踪态后不再消失。根因：路线Y（`ab9a798a`）把 `/dispatch` 退化为 `/map` thin redirect、`map.vue` 单实例常驻永不 unmount，原来"切 /dispatch 路由 → 主 map.vue unmount → 来电圈随组件销毁"的副作用消失。现状来电圈清理只有 4 个事件触发点（新来电换圈 / 挂断 / 回值守 / slotChanges 出坐标），**进调派态本身**不在其中；若 slotChanges 在进调派前已出坐标（markers watch non-immediate 首帧回调未触发过），来电圈会残留。

**改动（`src/baseComponent/OpenlayersMap/useDispatchEntangled.ts` 1 处）**：
`activate()` 中 `syncResourceLayersOverride()` 之后、`replayTerminalOnActivate()` 之前加一行 `callLocationController?.clearLocateCalls()`。进调派 variant 即清来电粗定位圈，与画像 slotChanges 是否已出正式坐标无关（粗定位圈与警情点 marker 是不同要素，`clearLocateCalls` 只清来电圈不误删警情点，幂等安全）。

**验证**：`pnpm lint`（vue-tsc）0 报错。

---

## 追加：mock 双车不同 stationId + car-track 按 carId 路由（ VehicleTrackPanel 路线选择器恢复）

**背景**：用户反馈调派跟踪态 VehicleTrackPanel 的"路线"下拉不出现。根因：`server/mock-ws.js` 的 `turnout-vehicles` 只返回 1 辆车（`TEST-CAR-001`），`routeGroups.length === 1`，`v-if="routeGroups.length > 1"` 条件不满足。

**改动（`server/mock-ws.js` 两处）**：
1. `turnout-vehicles` vehicles 数组加第 2 条：`TEST-CAR-002`，`stationId: '8aee87a783f84e21018432fe5e814311'`（沙河消防救援站），`startTime` 晚于第 1 车 +1 min，`dispatchSeq: 2`。
2. `car-track-api POST` 改读请求体：解析 `carId`/`plateNumber`，用 `carPointsMap` 映射（`TEST-CAR-001`→carPoints[0] 31 点，`TEST-CAR-002`→carPoints[1] 116 点），`carId` 不存在时 fallback 到 carPoints[0]。

**验证**：`node --check server/mock-ws.js` 语法 OK；重启 `pnpm dev:local:test` 后调派跟踪态 VehicleTrackPanel 应出现 2 条路线分组，路线下拉正常。

## 路径规划线说明（只读，无需改代码）

用户问"为啥看到多条路径规划线，原设计能不能点选切换高亮"。只读排查 `DispatchT1.ts` 的 `planRoute`：

- 高德 `fetchDrivingRoutes` **一次请求返回多条候选路线**，全部渲染到 `routeSource`。
- `planIndex=0`（首条）：实色主线，车辆模拟路径和面板里程/ETA 以此为基准。
- `planIndex>0`（备选）：`dimRouteStyle` 半透明置底，仅作背景参考。
- 调派确认后 `pruneAlternativeRoutes` 把备选线全删掉，只留首条。
- **原设计无"点击备选路线提升为选中"交互**；地图 singleclick 只触发 `activateStation`（展开队站详情）。
- 支撑队站路径规划已注释禁用（L424-426），主管+支撑同时规划的场景不会触发。

如需此交互需新增功能，目前不在原设计范围内。

---

## 追加：GIS-W46 完善实现收尾（Worker 收口 / G05 超时闭环 / 探活单例 / DwithinCql 可配置 / P01 加法式迁移）

**背景**：延续 GIS-W46（GeoServer 加固 + 路径规划分析）本轮优化。此前一轮实现 pass 已落地 G03~G05 / P01~P06 核心，本轮是 review 后收敛遗留项。

**改动**：
1. **① Worker 入口统一收口 `src/worker/`**（用户 D 决策）：`amap/routeMetrics.worker.ts`、`tools/routeContinuity.worker.ts` 迁入 `src/worker/`，两 hook（`useRouteMetricsWorker.ts` / `useRouteContinuityWorker.ts`）的 `new Worker(new URL(...))` 改指 `'../worker/…'`（相对路径，对齐 Vite worker 官方惯例），旧文件删除。纯计算模块（`routeMetrics.ts` / `routeAnalysis.ts`）仍在原位被 worker 与主线程共享，未迁。
2. **② G05 探活 3s 超时真正接入**：`geoserver.ts` 的 `pingGeoServer(workspace?, timeout?)` 签名扩展，`useGeoServerHealth.ts` 的 `check()` 传 `GEOSERVER_PING_TIMEOUT_MS`（此前常量仅声明未接，半开连接会挂起）。
3. **④ `buildDwithinCql` 可配置**：`utils/cql.ts` 加可选 `geomField` 参数（默认 `'geom'` 向后兼容，辖区图层可传 `zone_geom`），保留 INTERSECTS 为默认口径不动。
4. **⑤ 探活单例化**：`useGeoServerHealth` 的健康态 / `checking` / `notifiedOffline` 提到模块作用域，多地图/页面共享去重，返回 API 不变。
5. **③ P01 加法式迁移**：`SearchResultTool`（检索/路径规划入口，带 TMC 分段）`showRoute` 挂 `buildRouteAnalysis` 产出 `RouteAnalysisDTO` + 新增 `getRouteAnalysis()` getter，`clearRoute` 同步清 null，**不改任何既有 OL 绘制逻辑**。

**主动后置（B2-lite 原意，回归雷区不盲改）**：`VehicleTrackRenderer` / `DispatchT1`(43k) / `useDispatchEntangled`(87k) 三入口的行为重接——历史轨迹分析语义与 P04 `trackStatistics` 重叠，巨文件盲改违反"零报错"安全原则，保留待后续专门排期。

**验证**：`pnpm lint`（vue-tsc）0 报错；`pnpm vitest run`（cql / geoserverApi / routeAnalysis / routeMetrics / trackStatistics 5 spec）**34 tests 全绿**；2 hook 已指向 `../worker/`、旧 worker 文件确认删除、新 `src/worker/` 两文件就位。

**回写**：`公共工具速查.md`（新增 Worker 收口行 + 探活单例/超时 + `buildDwithinCql` 签名）、`当前状态摘要.md`（G05 行标 2026-11-10 闭环 + 追加本条收尾记录）。

## 路径规划多方案展示（strategy=11）

**需求**：小汽车路径规划接口加 `strategy=11` 参数，返回 1-3 个选项（时间最短 / 距离最短 / 躲避拥堵）；规划结果直接展示 1-3 套方案并做区分标识，含距离、预计耗时、红绿灯、路况分布（畅通率）；路况分布默认收起可展开折叠；参考截图展示方向标签与 tag 标识。用户追加要求货车分支一并做，但按接口实际能力适配。

**方案**：先出方案文档 `herness/02-技术设计/前端/路径规划多方案展示-技术方案.md`，用户确认「都按推荐来」后实施。

**实测结论（打真实代理 `192.168.169.28:33082`）**：
- `strategy=11` 稳定返回 3 个候选方案（5 组 OD 实测）；`strategy=0~9` 返回 1 个。`strategy=10` 与 `11` 返回相同。
- **响应不含策略标识字段**（试过 `show_fields=cost`，返回结构仍是 7 个 key），档位必须前端判定。
- `properties.partDesc` 已含完整转向文案（「沿沙河东路向南行驶456米左转调头」），转向指引无需新接口字段。
- **货车 `driving-v2` 代理端恒返回单方案，且 `load`/`height`/`width` 货车约束完全不生效**（三种约束返回字节级相同）。属代理端既有缺陷，本次按接口实际能力适配：货车走 v2 时天然只有 1 套方案，代理修复后自动多方案。

**代码改动**：
- 新增 `src/baseComponent/tools/routePlanOptions.ts`：方案切分 / 档位判定 / 转向文案解析。
- `src/types/routeAnalysis.ts` 增 `RoutePlanOption` / `RouteStepInstruction` / `RouteOptionTier`。
- `src/apis/amap.ts`：`driving` 增 `extensions`，`drivingV2` 增 `strategy`（预留）。
- `src/baseComponent/amap/routeAlternatives.ts`：`balanced` 文案「综合推荐」→「综合最优」对齐截图。
- `src/components/map/MapTools/drawMapTools/SearchResultTool.ts`：新增 `showRouteOptions` 多方案上图（复用 `routeBase` 底座，选中原色 + 备选 `dimRouteStyle` 半透明置底）。
- `src/components/map/component/routePlanPanel.vue`：主体改造为方案卡列表（顶栏方案序号 + 档位 tag + 折叠箭头；次栏约X分钟|X公里|红绿灯N个；展开区指标 + 可折叠路况分布 + 转向指引）。
- `public/icons.svg`：补 4 个转向图标 symbol（原有 `icon-turn-left/right/around` 复用，掉头映射到 `icon-turn-around`）。

**踩坑**：
1. `public/icons.svg` 里**已有** `icon-turn-left/right/around`，我起初追加同名 symbol 造成 id 冲突 → 已回滚，改为只补缺的 4 个并做 id 重复校验。
2. `partDesc` 里「进入右转专用道 / 直行进入中间岔道」的「进入…」是车道名不是转向动作，需整段剔除；但转向词在「进入」之前，所以剔除后转向判定仍正确（实测「右转进入右转专用道」= 右转）。
3. 「躲避拥堵」若按全局最小拥堵占比判定，全线无拥堵时**每个方案都会命中**该标签、失去区分度 → 改为仅在方案间存在拥堵差异时打标。
4. 替换面板模板时多留了一个 `</div>`，Vue 编译器报 "Element is missing end tag" 导致组件测试 7 项全挂 → 用 `@vue/compiler-sfc` 的 `parse()` 定位到行号修掉。

**门禁**：`pnpm lint` 0 报错 / `pnpm lint:baseline` 0 项 / `pnpm harness:check` 全过 / `pnpm test` **60 文件 625 项全通过**（较上次 59/614 新增 2 文件 11 项：routePlanOptions.spec.ts 11 项 + routePlanOptionsReal.spec.ts 3 项，含真实代理响应回归）/ `pnpm build` 通过 / 新增文件 prettier 通过。

**注**：`src/components/map/component/routePlanPanel.vue` 在 HEAD 就不通过 prettier（该文件用分号 + 双引号，与 `.prettierrc.json` 的无分号 + 单引号不一致），属存量漂移，按规范「存量不追溯格式化」未整文件重排，本次新增行跟随该文件既有风格。

**待人工验收**：① 小汽车路径规划返回几套方案、档位 tag 是否正确 ② 多方案上图是否分色、点击能否切换 ③ 转向指引文案与箭头方向 ④ 路况分布能否展开折叠、畅通率数值。

**关联文档**: `herness/02-技术设计/前端/路径规划多方案展示-技术方案.md`
### 追加：转向指引点击定位路段

用户追加需求「点击 rp-steps 转向指引选项可以定位到这个路段」。

**实现**：
- `RouteStepInstruction` 增 `coords`（该 step 路段几何，WGS84）。高德每个 feature 的 `geometry.coordinates` 即该 step 路段，**同一方案内相邻 step 首尾相接**（实测），可连续定位。
- `SearchResultTool.focusRouteSegment(coords)`：视野 fit 到该路段范围 + 在该路段叠加强调色高亮描边（画在 focusLayer，不影响路线图层自身分色）。
- 面板 `activeStep` 记录「方案 id + 指引下标」，点击后该行进入高亮态（底色 + 左侧强调条）；切换方案 / 重新规划 / 清空端点时重置高亮，避免高亮落在别的方案的路线上。

**踩坑**：固化真实响应做回归时，我第一版把相邻 step 的坐标写成了不连续的简写值，触发「相邻路段首尾相接」断言失败 —— 换成代理真实坐标后通过。这个断言本身就锁住了「点击定位能连续走完整条路线」的前提。

**测试**：`tests/unit/routePlanOptionsReal.spec.ts` 加 1 项（指引带路段几何 + 相邻首尾相接）；`tests/components/routePlanPanel.spec.ts` 加 2 项（多方案卡片渲染 + 点击指引触发地图 fit 且该行进入 active 态），并**做了反向验证**（把 click 换成 mouseenter 后测试确实失败，确认断言真的在验证点击定位链路）。

**门禁**：`pnpm lint` 0 报错 / `pnpm lint:baseline` 0 项 / `pnpm harness:check` 全过 / `pnpm test` **61 文件 631 项全通过** / `pnpm build` 通过 / 新增文件 prettier 通过。

**关联文档**: `herness/02-技术设计/前端/路径规划多方案展示-技术方案.md` §4.6