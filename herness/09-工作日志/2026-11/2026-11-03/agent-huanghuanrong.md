# agent-huanghuanrong 工作日志 2026-11-03

## 方法论入 herness：模块设计速查 + 测试接缝规范 + 术语 GLOSSARY 化 + ADR 规范（并本地安装 27 个 skill）

### 背景
用户问「有哪些 mattpocock/skills 的方法论可以写进 harness 提升项目能力」，确认走**推荐方案**：
P0 两项（模块设计方法论、测试接缝方法论）＋ P1 两项（ADR 规范、术语表 GLOSSARY 化）写入 herness，
其余 skill 作为**个人工具**安装到本地 codex 与 agnes 两处，不进仓库。

### 落地内容（herness 文档 4 份 + 索引 5 处）

| 文件 | 性质 | 要点 |
|------|------|------|
| `herness/05-共享上下文/模块设计速查.md`（新增，P0） | 形状约束 | 深/浅模块判断（删除测试）、seam 纪律、依赖四分类、接口即测试面、6 项自检表 |
| `herness/03-测试/测试接缝规范.md`（新增，P0） | 测试落点 | 先定接缝再写用例、本项目接缝表、按依赖类别定测法、替换而非叠加 |
| `herness/05-共享上下文/决策记录规范.md`（新增，P1） | ADR | 三判据（难逆转/无上下文费解/有真实权衡）、模板、落位 `05-共享上下文/adr/` |
| `herness/05-共享上下文/核心概念术语.md`（改造，P1） | 术语统一 | 加 §零（怎么用 + 禁用词示例表 + 定义写法）、29 行补「禁用词（勿用）」列 |

- **索引同步**：`05-共享上下文/_index.md`（文件列表 + AI 工作流 + 维护责任）、`03-测试/_index.md`、`herness/README.md`（目录导航 + 读取策略）、`AGENTS.md`（任务路由表加「新增/重构模块」「测试/验收」两行）、`00-SOP.md`（第 3 步共享上下文清单 + 新增第 15 条行为规则「模块形状先定再写」）。
- **状态摘要**：`05-共享上下文/当前状态摘要.md` 关键决策记录加 2 行（方法论落地、skill 本地安装）。

### 核心结论（写进 herness 的判断）

1. **一个 adapter = 假想 seam，两个 adapter = 真 seam** —— 没有第二个实现就别抽象 port，
   那只是多一层间接、不换来可测性。
2. **删除测试**：想象删掉这个模块，复杂度消失 → 透传浅模块（合并）；复杂度散回 N 个调用方 → 深模块（保留）。
3. **接口即测试面**：调用方与测试穿同一个 seam；想测穿界面说明**模块形状错了**，不是测试写错了。
4. **替换而非叠加**：浅模块深化后，旧浅模块上的单测是 waste，应删；留着会把形状锁死在浅模块上。
5. **依赖四分类**（进程内 / 可本地替代 / 远程自有 / 真外部）决定 seam 放哪、mock 什么。
   推论：本项目**不该** mock OpenLayers / Three / Cesium 内部，应断言业务可观察结果。
6. **ADR 三判据缺一不可**；**落位 `05-共享上下文/adr/` 而非 `docs/adr/`**——
   `docs/source/**` 是业务契约真相源（给外部系统看），ADR 是工程决策（给团队看），混入会污染契约源边界。
7. **术语表统一「禁用词」列**：同一概念多个叫法是多人协作最常见的隐性成本（席位/坐席、接缝/边界、深度/复杂度）。

### 本地 skill 安装（不进仓库）

- 源：`mattpocock/skills`（sparse checkout engineering + productivity + misc）
- 安装 **27 个**：engineering 20（ask-matt, code-review, codebase-design, diagnosing-bugs, domain-modeling,
  grill-with-docs, implement, implement-spec, improve-codebase-architecture, pr, prototype, research, retro,
  setup-matt-pocock-skills, tdd, to-spec, to-tickets, triage, wayfinder, wizard）
  ＋ productivity 7（grill-me, grilling, handoff, teach, to-questionnaire, wait-what, writing-for-agents）
- 目标：`C:/Users/16697/.codex/skills/`（43 个）、`C:/Users/16697/.agnes/skills/`（42 个），已存在则覆盖为最新
- **未装**：`misc/setup-pre-commit`、`misc/git-guardrails-claude-code`（本项目 husky + lint 基线已覆盖，避免两套 git 钩子冲突）
- **刻意不装进 herness**：`research`（属流程不是知识，个人 skill 用）、`improve-codebase-architecture`（属工具产出，herness 是规范与事实）
- **刻意不引入**：`tdd`/`diagnosing-bugs`/`grill-me`/`code-review`/`handoff`/`to-spec` 等 12 项——
  herness 规范 + 本地 superpowers 已覆盖，再引入会造成两套流程冲突

### 验证
| 门禁 | 结果 |
|---|---|
| `pnpm harness:check` | ✅ 通过（无体量告警） |
| `pnpm lint:baseline` | ✅ 0 项 / 0 项（本次纯文档改动，未动 `src/**`） |
| `pnpm test` | ✅ 全绿（本次未动测试代码） |
| 术语表列数自检 | ✅ 脚本校验所有表格行 4 列一致 |

### 踩坑
- **PowerShell 传中文给 `apply_patch` 会报 UTF-8 错误** → 改用 node 脚本读写文件（`Set-Content -Encoding UTF8` 写临时 `.cjs` 再 `node` 执行）。
- **表格列数不齐**：给术语表批量加列时，只在 `avoidMap` 里的行加了「禁用词」列，其余行表头已是 4 列 → 表格错位。
  必须**脚本校验每一行单元格数**，不能只看新增的行。


## 路线 Y B-3c：调派「纠缠体」composable 落地并接线 map.vue（单实例常驻，阶段 3/6）

### 背景
路线 Y 目标：让调派图业务寄生在常驻的 `map.vue` 单 OLMap 上，消除路线 X 双包装层
（`components/map` ↔ `components/dispatchMap`）互斥挂载导致的底图 unmount → OL preloader 竞态崩溃。
B-1/B-2（`dispatchBusiness.ts`）已把 5 个**独立**设施（incidentVideoController / specialMapMock /
incidentRelocate / callLocation*）抽成注入式 attach/detach。
本步 B-3c 把 `dispatchMap.vue`（3295 行）里**相互纠缠**的那 ~1800 行业务
（车辆历史轨迹 + 路径规划 + 模拟调派 + 警情定位点位 + 队站/周边资源 CQL/范围圈）
整块搬成一个可 attach/detach 的 Vue composable `useDispatchEntangled`，从 `map.vue` 按 variant 切换激活。

按门禁「设计先行」先做契约精读（`attachMap` 单槽位互斥 / `FeatureClickQuery.getStationRouteInfo` /
`useGisBaseMap` API / 现状 git），再按 C 方案（混合分层：独立设施纯 TS + 纠缠体单 composable）逐段搬迁。

### 核心决策
- **纠缠体整块 composable，不拆分**：内部调用链 100% 保持
  （`clearOriginalIncidentArtifacts` → `resetRouteVideoPlayback` → `clearMockTrackingTimers` →
   `nav.stop/clearRoutes` → `routePreview*` → `featureClickQuery.close()` → `incidentLocationStore.clearAll()`）。
  把 SFC 顶层作用域搬进 `useDispatchEntangled(deps)` 内部作用域，`let map`/`nav` 改引用 deps 注入的常驻实例。
- **共享设施所有权边界**：fireManager / carManager / alarmOverlayManager / jrAlarmManager 由 `map.vue` 创建并
  经 deps 注入，composable 内**不 mount、不 destroy** 这四个；B-1/B-2 设施经 `getDispatchBusiness()` 在
  `activate()` 内懒取（因它们由 `attachDispatchBusiness()` 在 dispatch variant 下才创建）。
- **watch 注册推迟到 activate**：所有 `watch(...)` 存进 `stoppedWatchers`，`activate()` 时注册、
  `deactivate()` 时统一 stop——常驻 map 下避免 main 态也跑调派监听。
- **调派专属 FeatureClickQuery**：带 `getStationRouteInfo`（主图实例不带），activate 建 + `activate()`，
  deactivate `destroy()`；与主图 FCQ 并存，dispatch handler 后挂、命中 `return true` 拦截。
- **共享 fireStations**：`useFireStations` 用模块级共享 `stations` ref（map.vue 的 `loadFireStations()` 填充），
  composable 直接读共享 ref 驱动 `syncFireManagerStations` 的主管排除，并加 `watch(fireStations)`（immediate）重同步；
  不再持局部 `allFireStations`（源 initMap 里的 `loadFireStations()` 调用已归 map.vue）。
- **CQL/范围圈经共享 `gisBaseMap`**：不新建第二份底座；`deactivate()` 清 `forcedStationLayerSnapshot` /
  `forcedResourceLayerSnapshots`，恢复图层开关原始状态。
- **`@ts-expect-error` 备份保留**：源文件「模板功能已注释、变量保留备用」的死代码段原样搬运；
  B-6c 才挂载的入口（selectStationRoute / 弹窗 refs / closeFirePopup / openIncidentDetail 等）
  按源风格加 `@ts-expect-error TS6133` 备份。
- **辖区渲染禁用**：源 `store.zones` 同步本就是注释态，本 composable 不建 zone manager/watch（与源一致，非漂移）。

### 涉及文件（3）
| 文件 | 改动 |
|---|---|
| `src/baseComponent/OpenlayersMap/useDispatchEntangled.ts` | **新增**（~2364 行）：纠缠体 composable，分段：状态绑定 → CQL/范围圈 → 警情点位/主管队站 watch 回调 → 路径规划+模拟调派 → 地址模拟+警情详情 → 车辆历史轨迹 → activate/deactivate/dispose 生命周期 |
| `src/baseComponent/OpenlayersMap/dispatchBusiness.ts` | 加 `getDispatchBusiness()` 访问器（~4 行，返回当前 handle 或 null） |
| `src/baseComponent/OpenlayersMap/map.vue` | import `useDispatchEntangled`；`initMap` 末尾创建 `entangled` 存模块级；`watch(isDispatchVariant)` dispatch→`activate()`/else→`deactivate()`；initMap 完成若已 dispatch 补 `activate()`；`cleanup` 加 `entangled.dispose()` + 置 null。template 本步不动 |

### 验证
| 门禁 | 结果 |
|---|---|
| `pnpm lint`（vue-tsc 类型） | ✅ 0 报错（新文件 18 项 TS6133/TS1340/TS2339 全真修，无 any、无攒基线） |
| `pnpm lint:baseline` | ✅ 当前 0 项 / 基线 0 项，无新增 |
| `pnpm build` | ✅ 通过（`✓ built in ~9s`，0 error；dispatchMap chunk 正常生成） |
| e2e | ⏳ 未在本步跑（纠缠体 composable 属 B-3c 中期，模板入口 DispatchRoutePreview/统一弹窗到 B-6c 才挂，e2e 全量回归留 B-6c 收口时一次性跑） |

### 踩坑 / 待办
- **委托 agent 两次崩溃（stream decode error）+ 一次触 25 轮上限**：大文件逐段 write 易中途断流。
  对策：第三次委托加 `max_turns` + 「前 5 轮先落骨架再分段 edit」策略；仍断流后改为**主线程亲自分段搬**，
  骨架占位 `__SECTION_*__` 逐段填充，最终成功。教训：>1500 行搬迁不委托一把梭，分段落盘保进度。
- **B-6c 原子收口才闭环**：`dispatchMap.vue` + `components/dispatchMap/index.vue` + `home.vue` 的
  `v-if` 分支**本步保留**（纠缠体已并行可用，但调派 UI 模板入口尚未切到 map.vue）；
  B-6c 需：home.vue 恒渲染 Map、删 DispatchMapPage、map.vue 模板挂 DispatchRoutePreview + 统一弹窗、
  恢复底图 `preload=4`（单实例永不 unmount，可安全找回缩放流畅）、清理 `useDispatchMapStore.map`、全量 e2e 回归。
- **共享设施 destroy 归属**：`entangled.dispose()` 只清纠缠体自有资源（vehicleTrackRenderer / resourceCircle /
  点位 manager / 调派 FCQ / 各 unsubscribe），**绝不**碰 map/nav 与 4 个共享 manager（归 map.vue cleanup），
  边界已在实现内注释固化。

### 提交
- 连同 B-1/B-2 后续改动一起 `refactor(gis-base)` 提交（含 `useDispatchEntangled.ts` 新增 + dispatchBusiness 访问器 + map.vue 接线）。

## 路线 Y B-6c：原子收口 + e2e 全量回归（阶段 6/6，全部收口完成）

### 落地内容（一次性闭环）
- **home.vue 恒渲染 `<Map/>`**：删 `DispatchMapPage` import + `v-if="dispatchVariant"` 互斥分支 + 冗余 state（ref/reactive/watch/computed/useRouter/storeToRefs 等），调派态由主 Map 内 watch 切纠缠体承载。
- **调派 UI 面板迁入主 Map 包装层**（`components/map/index.vue`）：`DispatchT1Panel`/`DispatchLayers`/`VehicleTrackPanel` 以 `v-if="dispatchVariant"` 条件渲染 + 外层 `<div class="dispatch-variant-ui">`，图层 watch（checkedIds→syncLayers）同步迁入。
- **map.vue 挂 `DispatchRoutePreview`**：`entangled` 是 module-level let，经 `dispatchRoutePreview` computed（读 `routePreviewVisible/Loading/Stations`）+ `handleRoutePreviewSelect` 桥接 `selectStationRoute`。
- **恢复 `preload=4`**：`useGisBaseMap.ts` 底图 TileLayer `preload 0→4`（路线 X 止血补丁撤销，单实例永不 unmount 找回缩放流畅度）。
- **清理 `useDispatchMapStore.map`**：删 `map` 字段 + `setMap` action；`useCurrentMap` 简化为只返回 `mapStore.map`。
- **删双包装层**：`dispatchMap.vue`（3295行）+ `components/dispatchMap/index.vue` + `views/dispatch/index.vue`（路由已 thin redirect → /map 的死文件，删除后 build 报 UNLOADABLE_DEPENDENCY 的漏网引用一并清掉）。
- **删 3 文件后路由注释更新**（`/dispatch` → B-6c 语义）。

### 验证
| 门禁 | 结果 |
|---|---|
| `pnpm lint`（vue-tsc） | ✅ 0 报错 |
| `pnpm lint:baseline` | ✅ 0 项 / 0 项 |
| `pnpm build` | ✅ 通过（17.37s，0 error，仅预存 lightningcss/three.js 警告） |
| `pnpm e2e`（9 项） | ✅ **9/9 全绿**（26.0s，chromium，单 worker 串行） |

### e2e 回归暴露的 bug（已当场修，重要踩坑）
初版 B-6c 迁 `DispatchT1Panel` 时传 `:map="MapStore.map"`（**Pinia 深度响应式 state**）→ OL Map 被 Vue Proxy 深代理包裹
→ `DispatchT1.vue` 的 `watch(props.map, immediate)` 拿到真值立即 `createService()` → `new DispatchT1(map)` 构造器里
`this.map.addLayer()` 方法绑定在 Proxy 上丢失 → 抛 `TypeError: this.map.addLayer is not a function`
→ 污染 Vue 组件实例（第二个 error `instance.update is not a function`）→ 整棵 `.dispatch-variant-ui` 子树渲染中断 → div 不进 DOM。
**修复**：复刻原 `dispatchMap/index.vue` 的 `shallowRef<OlMap>` 时序——本地 `dispatchOlMap` shallowRef + `@set-map`
回调赋值 + template 传 `dispatchOlMap`（裸 OL 实例，shallow 不深代理）。
**教训**：传 OL 实例给带 `immediate watch + 构造器副作用` 的组件，必须用 `shallowRef`/裸实例，绝不能直接传 pinia 深度 state。

### e2e spec 同步
`.dispatch-page`（已删包装层专属 class）→ `.dispatch-variant-ui`（新条件渲染 div，子组件 hidden 不影响 div 存在性，
断言改 `toHaveCount`）。两个 spec（controlMigration + dispatchBaseMap）全过。

### 提交
`refactor(gis-base): 路线Y B-6c 原子收口——删双包装层 + 恒渲染 Map + 恢复 preload=4 + e2e 全量回归`
**路线 Y 全量收口完成**：单实例常驻永不 unmount、调派业务寄生常驻 OLMap、双包装层彻底删除、底图 preload=4 流畅度找回、e2e 9/9 全绿。
