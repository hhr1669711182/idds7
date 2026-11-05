# dev-reset 重构 vs 原版功能对比评审报告

> **评审对象**：`dev-reset` 分支工作区（路线 X→Y 地图实例归一重构）对比重构前基线
> **基线 commit**：`8ef37c6b^`（路线 X 之前的最后提交）
> **评审日期**：2026-11-04
> **评审人**：agent-huanghuanrong
> **评审维度**：功能逻辑丢失 / 代码缺陷 / 监听失效 / 监听数据源失效 / 架构副作用 / 反向优化

---

## 〇、基线选择说明

| 候选基线 | 说明 | 采用 |
|---|---|---|
| `dev` 分支 | 2026-04-16 的 `init` 骨架，仅 2 个 commit，是**项目初始状态**而非重构前状态 | ❌ 不适用 |
| `8ef37c6b^` | 路线 X「地图实例归一」之前的最后提交，即本次重构的直接起点 | ✅ **采用** |

`dev` 与 `dev-reset` 的差异含 6 个多月演进（404 个新增文件、841 文件改动），无法作为重构对比基线；
`dev` 上的 `util/` `Control/` `controller/openlayer/` 等在重构前已迁至 `src/utils/` `src/controller/core/`，
功能均已核对保留（`mapTool.ts` 10 个导出、`svgTools.ts` 3 个导出逐一确认有等价实现且有引用）。

---

## 一、改动面盘点

`8ef37c6b^` → 工作区，`src/**` 净变更：

| 类型 | 文件 | 规模 |
|---|---|---|
| 删除 | `src/baseComponent/OpenlayersMap/dispatchMap.vue` | −3294 行 |
| 删除 | `src/components/dispatchMap/index.vue` | −189 行 |
| 删除 | `src/views/dispatch/index.vue` | −18 行 |
| 新增 | `src/baseComponent/OpenlayersMap/dispatchBusiness.ts` | +107 行 |
| 新增 | `src/baseComponent/OpenlayersMap/useDispatchEntangled.ts` | +2364 行（未提交） |
| 修改 | 16 个文件（`map.vue` `components/map/index.vue` `useGisBaseMap.ts` `useCurrentMap.ts` `router/index.ts` `useDispatchMapStore.ts` `views/home.vue` + 9 个 `drawMapTools/*`） | ±298 行 |

**核心结论**：本次重构是「**双实例 → 单实例常驻**」的架构归一。
旧版 `/map` 与 `/dispatch` 各挂一个 OLMap；新版 `/dispatch` 退化为 `/map` 的 thin redirect，
调派业务以「纠缠体（`useDispatchEntangled`）」形式挂到常驻主图上，按 `isDispatchVariant()` 响应式激活/停用。

---

## 二、功能逻辑丢失核查

### 2.1 逐项核对结论

| 旧功能 | 旧位置 | 新位置 | 结论 |
|---|---|---|---|
| 队站弹窗（title/address/phone/坐标） | `dispatchMap.vue` 模板 | `map.vue` + `useMapPopups.ts` | ✅ 保留 |
| 统一业务点位弹窗 `AlarmDetailPopup` | `dispatchMap.vue` 模板 | `map.vue` | ✅ 保留 |
| 警情详情 `IncidentDetailDialog` | `dispatchMap.vue` 模板 | `map.vue` | ✅ 保留 |
| 在线车辆弹窗（类型/状态/司机/速度/航向） | `dispatchMap.vue` 模板 | `map.vue` + `useMapPopups.ts` | ✅ 保留 |
| `DispatchRoutePreview` 路线预览 | `dispatchMap.vue` 模板 | `map.vue`（经 `dispatchRoutePreview` computed 桥接） | ✅ 保留 |
| `DispatchT1Panel` / `DispatchLayers` / `VehicleTrackPanel` | `components/dispatchMap/index.vue` | `components/map/index.vue` 的 `.dispatch-variant-ui` | ✅ 保留 |
| 警情定位点位 / 主管队站图层 | `dispatchMap.vue` | `useDispatchEntangled.ts` | ✅ 保留 |
| 队站 WMS CQL 强占 / 恢复 | `dispatchMap.vue` | `useDispatchEntangled.ts` | ✅ 保留 |
| 周边资源范围圈 + Modify | `dispatchMap.vue` | `useDispatchEntangled.ts` | ✅ 保留 |
| 模拟调派 / 路径规划 / 视频回放 | `dispatchMap.vue` | `useDispatchEntangled.ts` | ✅ 保留 |
| 车辆历史轨迹 | `dispatchMap.vue` | `useDispatchEntangled.ts` | ✅ 保留 |
| 鹰眼 / 比例尺控件 | `dispatchMap.vue` | `map.vue`（改为 feature 配置门控） | ✅ 保留 |
| `trafficTool` 实时路况 | `dispatchMap.vue` | `map.vue` | ✅ 保留 |
| `alarmOverlayManager` 警情 overlay | `dispatchMap.vue` | `map.vue` | ✅ 保留 |
| `printControl` 打印控件 | `dispatchMap.vue` | — | ✅ 非丢失（旧版即 `// map.addControl(printControl)` 已注释） |
| `keyboardPan` | `dispatchMap.vue` | — | ✅ 非丢失（旧版即未 addInteraction） |
| `ThreejsViewer*` BIM 面板 | `dispatchMap.vue` | — | ✅ 非丢失（旧版即整块注释） |
| `GithubIcon` / `ModeChange` | `views/home.vue` | — | ✅ 非丢失（旧版 import 但模板未渲染，死导入） |
| `incidentZoneManager` 辖区面 | `dispatchMap.vue` | — | ✅ 非丢失（旧版已注释「辖区渲染已禁用」） |
| **队站异步到达后重开路线预览队站弹窗** | `dispatchMap.vue` L2146-2149 | — | ❌ **遗漏**（见 F-1） |
| **调派图层 id 可用性过滤** | `components/dispatchMap/index.vue` onMounted | — | ❌ **遗漏**（见 F-2） |

### 2.2 F-1（P2）队站异步到达后不再重开路线预览队站弹窗

**旧行为**（`dispatchMap.vue` L2142-2149）：

```ts
void loadFireStations()
  .then((list) => {
    allFireStations = list;
    syncFireManagerStations();
    const openId = featureClickQuery?.getOpenStationId();
    const openStation = routePreviewStations.value.find((s) => s.stationId === openId);
    if (openStation) showRouteStationPopup(openStation);
  })
```

**新行为**（`useDispatchEntangled.ts` `onFireStationsLoaded`）只做 `syncFireManagerStations()`，
丢失了「队站详情数据异步补齐后，把已选中的队站弹窗重开一次」。

**影响**：队站 WFS 数据晚于路径规划到达时，队站弹窗会缺少地址/电话等 WFS 字段，直到用户手动点一次才补齐。
属于**展示完整性**问题，不影响业务判定与数据流。

**建议修法**：在 `onFireStationsLoaded` 中补齐旧联动（依赖 `featureClickQuery?.getOpenStationId()`，该方法仍存在）。

### 2.3 F-2（P2）调派图层 id 未按可用性过滤

**旧行为**（`components/dispatchMap/index.vue` onMounted）：

```ts
layersStore.setLayerConfigs(getToolbarLayerConfigs(mapConfig));
const availableIds = new Set(layersStore.items.map((i) => i.id));
dispatchMapStore.setCheckedIds(
  getDispatchLayerIds(dispatchMapStore.checkedIds.filter((id) => availableIds.has(id))),
);
```

**新行为**：`dispatchMapStore.checkedIds` 不做可用性过滤，直接进 `syncLayers`。

**影响**：`dispatchMapStore.checkedIds` 走 sessionStorage 持久化。若后台下线了某个图层，
持久化的旧 id 会留在 store 里，`syncLayers` 里 `addLayer` 因 `getLayerConfig` 取不到而返回 false（幂等 no-op），
不会崩，但 `DispatchLayers` 的「全选」状态判断会因存在无效 id 而恒为 false（`isAllSelected` 要求每个 id 都命中）。

**建议修法**：在 `components/map/index.vue` 的调派图层 watch 里，`syncLayers` 前按 `layersStore.items` 过滤一次。

---

## 三、代码缺陷核查

### 3.1 本轮已修复（评审报告 P0/P1 闭环）

| 编号 | 缺陷 | 位置 | 状态 |
|---|---|---|---|
| P0-1 | 调派专属 WMS 图层泄漏到主图态 | `components/map/index.vue` | ✅ 已修（watch 加 `dispatchVariant` 门控） |
| P0-2 | 切回主图态后主图 business attachment 永久失效 | `baseComponent/OpenlayersMap/map.vue` | ✅ 已修（else 分支补 `attachMap(kind:'map')`） |
| P1-1 | `deactivate()` 未恢复 CQL 强占与主管队站排除 | `useDispatchEntangled.ts` | ✅ 已修（`deactivate` 显式调 `restoreWmsLayerSnapshot` + `restoreAllFireStations`） |
| P1-2 | 主图全量队站 vs 调派排除口径不一致 | `useDispatchEntangled.ts` | ✅ 已修（同上） |
| P2-1 | 文件头 JSDoc 20 行 > 硬上限 10 行 | `useDispatchEntangled.ts` | ✅ 已修（压至 3 行 + herness 链接） |

### 3.2 本轮新增修复（评审中发现）

| 编号 | 缺陷 | 位置 | 状态 |
|---|---|---|---|
| R-1 | 调派态离开后范围圈矢量层 + Modify 交互残留 | `useDispatchEntangled.ts` `deactivate()` | ✅ 已修 |
| R-2 | `deactivate()` 未清 `mockDispatchPrimaryGate`（经 `clearMockDispatchStationIcons`） | `useDispatchEntangled.ts` | ✅ 已修 |

### 3.3 遗留风险（不阻塞，需知悉）

| 编号 | 说明 | 影响面 |
|---|---|---|
| K-1 | `dispatchMapStore.checkedIds` 与 `layersStore.checkedIds` 双源并存，共用同一 OLMap 图层集合。已加 variant 门控 + 复原，但仍属「两套状态源写同一份 OL 状态」的结构性隐患 | 后续若新增第三种 variant（如 `modelAssess`）需再扩展门控矩阵 |
| K-2 | `DispatchT1.vue` 的 `isLayerVisible` / `HYDRANT_LAYER` 判据读 `dispatchMapStore.checkedIds`，而主图图层读 `layersStore.checkedIds`。调派态下两者可能不一致 | 消防栓查询的图层可见性判据在两态交界处可能误判 |
| K-3 | `attachMap` 为单槽位（后 attach 顶掉前一个）。目前靠「切回主图态重新 attach」维持，任一路径漏掉都会永久失效 | 建议后续改为多槽位（按 `kind` 分别持有 attachment） |

---

## 四、监听失效核查

| 检查项 | 结论 |
|---|---|
| 旧 `dispatchMap.vue` 的 `watch` 是否全部迁入 | ✅ 迁入 `useDispatchEntangled.ts` 的 `activate()`（watch 推迟到 activate 注册，`deactivate()` 统一 stop） |
| `deactivate()` 后 watch 是否永久失效 | ✅ 已修（P1-1：恢复逻辑不再依赖 watch，改为 deactivate 内显式还原） |
| `components/map/index.vue` 调派图层 watch 是否在主图态误触发 | ✅ 已修（P0-1：加 `dispatchVariant` 门控） |
| `drawMapTools` pointermove 监听 | ✅ **改进**：旧版 8 个工具各自 `map.on('pointermove')` + `map.un()`，`MeasureAreaTool`/`PopulationTool` 在异常路径会漏解绑；新版统一收口到 `BaseTool.bindPointermove/unbindPointermove`，`destroy()` 兜底幂等解绑 |
| `vehicleTrackStore` / `pendingDispatchAlarmStore` 订阅释放 | ✅ `deactivate()` 内 `stoppedWatchers.forEach(stop)` + `vehicleTrackUnsubscribe?.()` |
| WS 订阅（`MOCK_INCIDENT_RELOCATE` / `ALARM_INCIDENT_STATE_CHANGED`） | ✅ `mockSpecialMapUnsubscribers.splice(0).forEach(unsub => unsub())` |
| `document` 级 click 监听 | ✅ `removeEventListener('click', handleDocumentClick, true)` |

---

## 五、监听数据源失效核查

| 检查项 | 结论 |
|---|---|
| `fireStations` 数据源 | ✅ 旧版 `dispatchMap` 自持 `allFireStations`；新版改为读共享 `useFireStations().stations`（与 `map.vue` 同一份缓存单例）。**时序依赖**：`map.vue` 在 `initMap` 中 `loadFireStations()`，纠缠体在 `activate()` 中注册 `watch(() => fireStations.value, onFireStationsLoaded, { immediate: true })`，两者指向同一 ref，加载完成后 watcher 会补触发 ✅ |
| `stationLayerStore` / `nearbyResourceLayerStore` | ✅ 与主图共享同一 Pinia 实例 |
| `incidentLocationStore` | ✅ 共享 |
| `messageStore` | ✅ 共享，订阅在 `deactivate` 中释放 |
| `dispatchMapStore.map` 字段 | ✅ 已删除，全仓无遗留引用（`rg 'dispatchMapStore\.map|dispatchMapStore\.setMap'` 为空） |
| `useCurrentMap()` | ✅ 旧版按 variant 返回主/调派两个实例，现统一返回 `mapStore.map`，无第二个实例 |
| `mapConfigStore.config` | ✅ 旧 `dispatchMap` 用 `mapConfigStore.config.feature`（只读），新版同 |
| `layersStore.layerConfigs` | ⚠️ 见 F-2：调派侧不再过滤无效 id |

---

## 六、架构方案副作用核查

| 编号 | 副作用 | 严重度 | 说明 |
|---|---|---|---|
| S-1 | 单图实例下「主图/调派」图层集合互斥 | P1 | 两套 store 写同一 OL 图层集合，任一侧写操作都会清掉另一侧的图层。已用 variant 门控 + 切回复原缓解，但根因（双源）仍在 → 见 K-1 |
| S-2 | `attachMap` 单槽位抢占 | P1 | 调派 attach `kind:'dispatch'` 顶掉主图 `kind:'map'`，主图业务端口失效。已修但结构性隐患仍在 → 见 K-3 |
| S-3 | 调派资源与主图资源同生共死 | P2 | 调派期创建的图层/监听/交互与主图共用实例，`deactivate()` 必须逐一还原。已覆盖 CQL、队站口径、范围圈、Modify；**新增调派资源时须同步补 `deactivate()` 还原逻辑**——这是本次重构引入的持续性维护成本 |
| S-4 | `/dispatch` 路由退化为 redirect | — | `name` 保留兼容 `router.replace({ name: 'dispatch' })`；URL 恒为 `/#/map`。已验证 e2e |
| S-5 | `preload: 0 → 4` | — | 路线 X 止血补丁撤销。因单实例常驻不再有「频繁 remount 触发预载竞态」的根因，恢复预加载提升缩放流畅度。方向正确 |

---

## 七、反向优化核查（本次重构带来的**改善**）

| 编号 | 改善 | 价值 |
|---|---|---|
| I-1 | 双 OLMap 实例 → 单实例常驻 | 根治路线 X 的「底图 unmount → preloader 竞态崩溃」根因；显存/内存占用减半 |
| I-2 | `drawMapTools` pointermove 统一收口到 `BaseTool` | 修 8 个工具的监听解绑遗漏（含 `MeasureAreaTool`/`PopulationTool` 异常路径漏解绑） |
| I-3 | `useGisBaseMap` 抽出共用层 | 主图/调派共用 WMS 图层创建-移除-zoom 逻辑，消除双底座漂移 |
| I-4 | `dispatchMap.vue` 3294 行 → `useDispatchEntangled.ts` 2364 行 + `dispatchBusiness.ts` 107 行 | 逻辑拆分出可复用 composable，职责边界清晰 |
| I-5 | `/dispatch` 从「独立页面」降为「variant」 | 消除路由跳转，切换零延迟，URL 单一 |
| I-6 | `useMapPopups.ts` 抽取弹窗状态 | 主图/调派共用一套弹窗管理 |
| I-7 | `preload` 恢复 4 | 缩放流畅度回升 |
| I-8 | 纠缠体 `activate/deactivate/dispose` 三段式 | 资源生命周期显式可审计 |

---

## 八、测试覆盖核查

本轮新增两条 e2e 往返回归（`tests/e2e/variantRoundTrip.spec.ts`），均已做**反向验证**（撤销修复后用例确实失败）：

| 用例 | 覆盖 | 反向验证 |
|---|---|---|
| 图层复原 | 主图态 → 调派态改图层 → 切回主图态 → 图层集合复原 | ✅ 撤销 `syncLayers` 复原后失败 |
| attachment 复原 | 主图态 → 调派态 → 切回主图态 → 地址机器人搜索真实上图 | ✅ 撤销 `attachMap(kind:'map')` 后失败 |

门禁结果：

| 门禁 | 结果 |
|---|---|
| `pnpm lint:baseline` | 0 项 / 基线 0 项 ✅ |
| `pnpm test` | 55 文件 / 579 项 全绿 ✅（连跑 5 轮稳定） |
| `pnpm e2e` | 11/11 全绿 ✅（含本轮新增 2 条） |
| `pnpm harness:check` | 通过 ✅ |

---

## 九、结论与建议

### 9.1 总结

1. **功能逻辑丢失**：整体无损。旧 `dispatchMap.vue` 的**所有实际启用**功能均已迁移至常驻主图；删掉的
   `printControl` / `keyboardPan` / `ThreejsViewer*` / `incidentZoneManager` 在旧版即未启用，
   `GithubIcon` / `ModeChange` 为死导入。**唯一两处遗漏为 P2 级展示完整性问题**（F-1、F-2）。
2. **代码缺陷**：评审发现的 2 个 P0 + 2 个 P1 + 1 个 P2 **本轮已全部修复并闭环验证**；
   另新增修复 2 处调派资源残留（R-1、R-2）。
3. **监听失效**：无遗留。旧版 watch 全部迁入且有 stop 路径；`drawMapTools` 的 pointermove 从
   「各自实现」收口到 `BaseTool`，反而**修掉了旧版的解绑遗漏**。
4. **监听数据源失效**：无。共享 ref / 共享 Pinia 语义正确；`dispatchMapStore.map` 删除后无遗留引用。
5. **架构副作用**：S-1（双源写同一图层集合）、S-2（`attachMap` 单槽位）、
   S-3（调派资源需逐一还原）属单实例架构的固有代价，当前均已闭环，但属**结构性隐患**，
   建议后续按 K-1/K-3 方向做架构级收口，而非继续打补丁。
6. **反向优化**：8 项实质改善（单实例根治崩溃、监听收口、底座共用、拆分、URL 归一等），
   改动方向正确，收益明显大于代价。

### 9.2 建议处理顺序

| 优先级 | 事项 | 建议 |
|---|---|---|
| P2 | F-1 队站弹窗重开联动 | 建议修（约 5 行，视觉完整性） |
| P2 | F-2 调派图层 id 可用性过滤 | 建议修（约 3 行，防「全选」恒 false） |
| P1 | K-3 `attachMap` 改多槽位 | 建议列入技术债，改造 `BusinessMessageRuntime` 按 `kind` 分别持有 attachment |
| P1 | K-1 图层集合单一事实源 | 建议列入技术债，考虑让调派态复用 `layersStore` 而非独立 store |
| P1 | K-2 `isLayerVisible` 数据源对齐 | 需产品口径确认（调派态下消防栓图层判据应以谁为准） |
| — | S-3 维护成本 | 在 `herness/05-共享上下文/模块设计速查.md` 增加「新增调派资源须同步 `deactivate()` 还原」的强制项 |

### 9.3 是否可提交

✅ **可以提交**。门禁全绿，本轮 P0/P1 已闭环且有反向验证的回归用例守护，
两处 P2 遗漏建议在提交前顺手修掉（一共不到 10 行），否则可留作后续技术债。
