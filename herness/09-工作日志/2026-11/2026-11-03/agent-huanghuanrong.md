# agent-huanghuanrong 工作日志 2026-11-03

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
