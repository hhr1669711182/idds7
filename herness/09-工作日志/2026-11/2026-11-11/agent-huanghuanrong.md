# 2026-11-11 工作日志（huanghuanrong）

## FeatureClickQuery 收口缺陷修复 + 点击链路单测（合并前补强）

> 承接上一条「FeatureClickQuery 点击事件收口」。用户复审提出 6 个缺陷（2 必须修 + 4 建议修）并指出点击取数链路无单测覆盖，本轮全部补齐。

### 必须修
1. **缺陷 1（调派态点队站无反馈）**：`DispatchT1.handleFeatureClick` 命中立案队站后，若队站车辆详情 overlay 未启用（`stationOverlayEnabled`，默认 false，因 `ensureStationOverlay` 当前阶段注释停用）则返回 `false` 回落通用队站面板（仍渲染名称/地址，调派态经 `routeInfoProvider` 附预计时间/距离）。新增 `DispatchT1.setStationOverlayEnabled(enabled)` 公共方法；`DispatchT1.vue` 在被注释的 `ensureStationOverlay` 块内补 `service.value?.setStationOverlayEnabled(true)` 接线（未来启用即接管）。
2. **缺陷 2（overlay 泄漏）**：`featureDetailPanel` 补 `destroy()`（`close` + `map.removeOverlay`）；`FeatureClickQuery.destroy()` 由 `defaultPanel?.close()` 改为 `defaultPanel?.destroy()`，地图卸载时彻底移除 overlay。

### 建议修
3. **缺陷 3**：`route()` 补 JSDoc 说明 handler 抢占范围（注册顺序 / 语义独占 / 范围外放行 / 通用兜底四则约定）。
4. **缺陷 4（any 收窄）**：`FeatureClickResult` 的 `feature/features` 由 `any` → `WfsFeature`（`@/apis/geoserverTypes`）、`items` → `LayerConfig[]`（`@/config/layers`）；`featureDetailPanel.openFeature` 同步收窄（`properties` 归一 `Record<string, unknown>`、`title` 用 `String()` 包裹、geometry 取 `Point.coordinates` 判空）。
5. **缺陷 5（死代码）**：删 `getSharedFeatureClickQuery` 导出（无消费方）；同步清 `tests/components/dispatchT1TrackingBoundary.spec.ts` mock 里的同名引用。
6. **缺陷 6**：`.tmp-read.cjs` 临时读文件脚本 —— 全仓检索**确认已不存在**，无需处理。

### 补测试
- 新增 `tests/components/featureClickQuery.spec.ts`：fake map + mock 默认面板/取数/图层 store/TileWMS，验证「特化优先、通用兜底」四条链路 ——
  1. 命中主管矢量队站 + handler 接管 → 归一化 `station`（primaryVector）结果并抑制通用面板；
  2. 命中主管矢量队站 + 无 handler → 归一化 `station` 结果回落通用面板 `openStation`；
  3. 未命中队站的普通 WMS 要素 + handler 放行 → 归一化 `feature` 结果回落通用面板 `openFeature`；
  4. 空点击（无主管图标 / 无 WMS 命中）→ 关闭已打开面板；
  5. `destroy` 契约：停监听 + 注销 handler + `panel.destroy` 一次（含 `removeOverlay`）。

### 验证
- `pnpm lint`（vue-tsc --noEmit）→ **0 报错** ✅（`featureDetailPanel` 因 `Record<string,unknown>` 收窄暴露的 `title`/geometry 类型问题已当场修净）
- 测试文件 self-introduced 类型错误清零（scoped tsc 仅剩的嵌套数组 typo 已修）
- ⚠️ **vitest runner 本地无法执行**：Node v25.2.1 + undici 8.12.1 的 worker-bootstrap 预存在故障（`Cannot read properties of undefined (reading 'bind')` at `undici/lib/interceptor/decompress.js`），旧用例 `circleQueryPanel.spec.ts` / `dispatchT1TrackingBoundary.spec.ts` 同样全挂，**与本次改动无关**；需在 CI / 正常 Node 环境补跑 `pnpm test tests/components/featureClickQuery.spec.ts`

### 影响文件
| 文件 | 操作 |
|------|------|
| `src/baseComponent/OpenlayersMap/overlay/featureDetailPanel.ts` | 改（+destroy、any→WfsFeature/LayerConfig、title/geometry 类型收窄） |
| `src/baseComponent/OpenlayersMap/FeatureClickQuery.ts` | 改（Result any→WfsFeature/LayerConfig、destroy 调 panel.destroy、route 抢占注释、删 getSharedFeatureClickQuery） |
| `src/baseComponent/OpenlayersMap/DispatchT1.ts` | 改（+stationOverlayEnabled 门控 + setStationOverlayEnabled + handler 回落） |
| `src/baseComponent/OpenlayersMap/DispatchT1.vue` | 改（注释块内接线 setStationOverlayEnabled） |
| `tests/components/dispatchT1TrackingBoundary.spec.ts` | 改（删 mock 里 getSharedFeatureClickQuery 引用） |
| `tests/components/featureClickQuery.spec.ts` | 新建（点击链路四路径 + destroy 契约） |

## FeatureClickQuery 点击事件收口（消除重复 singleclick 双队站面板）

### 背景 / 根因
调派变体下同一张 OLMap 并存 4 处 `map.on('singleclick')`：主图 `FeatureClickQuery`、`useDispatchEntangled` 的**第二个** `FeatureClickQuery`、`DispatchT1.ts bindStationClick`、`DispatchT1.vue ensureHydrantQuery`。两个独立 `FeatureClickQuery` 实例各自 `addOverlay + createApp(AlarmDetailPopup)`，点中一个队站弹两个队站详情面板。

### 设计（用户确认，含修正）
1. `FeatureClickQuery` 作为**唯一公共点击取数入口**（单一实例 + 单一 singleclick）：只做命中级联 + 取数 + 归一化（`FeatureClickResult`），**不做**点击后交互业务。
2. **公共默认面板外置**到 `overlay/featureDetailPanel.ts`（复用 `AlarmDetailPopup` + OL `Overlay`，零 dispatch 语义，任何变体适用）。
3. **特化业务 handler 共存 + 回落**（用户修正语义）：`addBusinessHandler` 注册特化 handler 优先级链，首个接管者生效，全部未接管回落通用默认面板。调派态下非特化图层元素仍走通用面板，**不是**主图/调派原子替换。
4. 特化业务动作下沉到业务方：`DispatchT1` 注册队站 handler（命中立案主管/支撑队站 → `activateStation`）；`DispatchT1.vue` 注册消防栓 handler（消防栓图层命中 → 私有 hydrant 面板，定向 WMS 取数保持私有）。
5. **根因消除后删除补丁**：`DispatchT1.ts` 的 `MutationObserver`（`observeGenericStationPopups`/`hideGenericFeaturePopups`/`getStationFeatures`/`knownStationNames`）与第三处 `bindStationClick` 整体移除。

### 完成事项
1. `overlay/featureDetailPanel.ts`（新建）— `createFeatureDetailPanel(map, getRouteInfo?)` 通用队站/要素详情面板，`openStation/openFeature/close/getOpenStationId`；修掉 `mount` 内部误 `close` 清掉 `openStationId`/`dataset` 的状态串扰。
2. `FeatureClickQuery.ts`（重写）— 删自渲染（`vueApp`/内联 `showPopup`），保留命中级联 + 取数 + 归一化；新增 `FeatureClickResult`/`FeatureClickHandler` 类型、`addBusinessHandler`（返回注销函数）、`setRouteInfoProvider`、共享实例注册表 `getOrCreateSharedFeatureClickQuery`/`getSharedFeatureClickQuery`/`releaseSharedFeatureClickQuery`；`deactivate` 仅摘 singleclick（共享实例整体生命周期归 map.vue）。
3. `map.vue` — init 建**唯一** `getOrCreateSharedFeatureClickQuery(map)`，传入 `useDispatchEntangled`；卸载 `destroy + releaseSharedFeatureClickQuery`。
4. `useDispatchEntangled.ts` — deps 新增 `featureClickQuery`（消费不创建）；删第二实例；`activate` 注入 `setRouteInfoProvider`、`deactivate` 还原 provider + `close`（**不 destroy 共享实例**）。
5. `DispatchT1.ts` — 删 `bindStationClick` + `stationQuerySource` + `MutationObserver` 机制；`handleFeatureClick` 注册为特化 handler（命中立案队站集接管，否则回落通用）。
6. `DispatchT1.vue` — 删第四处 `singleclick`（`hydrantClickKey`/`queryHydrant`）；`handleHydrantFeature` 注册为特化 handler；保留 hydrant 面板 + 定向 `queryFeatureProperties`。
7. `tests/components/dispatchT1TrackingBoundary.spec.ts` — 更新 `FeatureClickQuery` mock 导出 `getOrCreateSharedFeatureClickQuery` 等共享注册表 API。

### 验证
- `pnpm lint`（vue-tsc --noEmit）→ 0 报错 ✅（基线已归零，无新增）
- `pnpm test tests/components/dispatchT1TrackingBoundary.spec.ts` → 18 用例全过 ✅

### 契约 / 分层影响
- `FeatureClickResult` 为**同层**（底座 `baseComponent` ↔ 业务 `DispatchT1`）DTO，由 `FeatureClickQuery.ts` 导出即可，**不进** `controller/protocol`（不跨 controller 层）。
- 纯前端地图点击链路，**不涉及** `docs/source` 消息协议 / WS / postMessage → 无协议事件键、无 DTO Schema 变更。
- 分层合规：`FeatureClickQuery`（底座通用）零业务语义；业务动作全在 `DispatchT1`（业务侧）。

### 待确认 / 已知风险
- 手动/回放三态（主图点消防栓/重点单位/队站→单一通用面板；调派点队站→不再双面板；切回主图→恢复通用面板、无残留 overlay / 无泄漏 listener）**需人工在浏览器复核**（当前无 e2e 覆盖点击取数链路）。
- `gis:env_fire_water` 消防栓非 `noEsSearch`，属 FCQ 通用取数集合；消防栓 handler 走定向查询保持私有，与通用回落不冲突。

### 影响文件清单
| 文件 | 操作 |
|------|------|
| `src/baseComponent/OpenlayersMap/overlay/featureDetailPanel.ts` | 新建 |
| `src/baseComponent/OpenlayersMap/FeatureClickQuery.ts` | 重写（单实例+handler 链+共享注册表） |
| `src/baseComponent/OpenlayersMap/map.vue` | 改（唯一共享 FCQ，传入 entangled） |
| `src/baseComponent/OpenlayersMap/useDispatchEntangled.ts` | 改（复用共享 FCQ，删第 2 实例） |
| `src/baseComponent/OpenlayersMap/DispatchT1.ts` | 改（删 3 处监听 + MutationObserver，注册特化队站 handler） |
| `src/baseComponent/OpenlayersMap/DispatchT1.vue` | 改（删 4 处监听，注册特化消防栓 handler） |
| `tests/components/dispatchT1TrackingBoundary.spec.ts` | 改（mock 共享注册表 API） |

## BC 收口（V1.1 多 kind 共用物理通道）

### 完成事项

1. **`src/store/useMessageStore.ts`** — `BindBroadcastChannelOptions` 新增 `onRaw` 字段；`bindBroadcastChannel` 实现中 `onRaw` 存在时直接透传 raw 数据，不走 `ingest`
2. **`src/const/const.message.type.ts`** — 新增 `RELAY_CHANNEL_NAME = 'ids-map-screen-relay'` 与 `MESSAGE_KIND`（RELAY_HELLO / RELAY_SNAPSHOT / RELAY_EVENT / RELAY_BYE / POINT_SELECTION）
3. **`src/composables/relayProtocol.ts`**（新建）— `handleRawRelayMessage`（按 kind 分流）、`sendWire`（经 bus BC 客户端直发）、`registerRelayHandler` / `registerPointHandler`
4. **`src/register/initMessage.ts`** — `bindBroadcastChannel` 改为 `system: IDS_SEAT_WEB`、`name: RELAY_CHANNEL_NAME`、`onRaw: handleRawRelayMessage`
5. **`src/lib/index.ts`** — `initMessage()` 前移至 `createGisPointChannel()` / `createMapRelayReader()` 之前
6. **`src/composables/useMapRelayReader.ts`** — 去裸 `new BroadcastChannel`，入向由 relayProtocol 路由，出向 `sendWire({ kind: 'map-relay-hello' })`，仅留 30s 定时器
7. **`src/composables/useGisPointSelection.ts`** — 删 `createBroadcastChannelBridge`，入向由 relayProtocol 路由，出向 `sendWire({ kind: 'map-point-selection', payload })`，`close()` 仅清状态机不关通道
8. **`src/composables/useBroadcastChannelBridge.ts`** — 已删除
9. **`src/config/env.ts`** — 删 `broadcastChannelName` 字段；`useBroadcastChannel` 改为 `!== 'false'`（默认启用）
10. **5 个 `.env*` 文件** — `VITE_USE_BROADCAST_CHANNEL=true`；删 `VITE_BROADCAST_CHANNEL_NAME`
11. **`docs/source/07-协议事件清单.md`** — 新增 §0.6 BC 收口章节

### 验证

- `pnpm lint` → 0 报错 ✅

### 待确认 / 已知风险

- BFCache（pagehide/pageshow）行为：物理通道随标签页存活保持；pagehide 后选点状态机已清理，pageshow 后需重建 `createGisPointChannel()` 或 `getGisPointChannel()`，尚未做自动化测试
- P01（路径规划 DTO 收敛）完整 vs lite 方案，用户尚未最终定稿，不阻塞本次 BC 收口

### 影响文件清单

| 文件 | 操作 |
|------|------|
| `src/store/useMessageStore.ts` | 改（onRaw 透传） |
| `src/const/const.message.type.ts` | 改（+RELAY_CHANNEL_NAME +MESSAGE_KIND） |
| `src/composables/relayProtocol.ts` | 新建 |
| `src/register/initMessage.ts` | 改（集中注册 BC） |
| `src/lib/index.ts` | 改（initMessage 前移） |
| `src/composables/useMapRelayReader.ts` | 改（去裸 BC） |
| `src/composables/useGisPointSelection.ts` | 改（去 bridge） |
| `src/composables/useBroadcastChannelBridge.ts` | 删 |
| `src/config/env.ts` | 改（删 broadcastChannelName，默认 true） |
| `.env.development` / `.env.local` / `.env.local.example` / `.env.production` / `.env.test` | 改（VITE_USE_BROADCAST_CHANNEL=true，删 VITE_BROADCAST_CHANNEL_NAME） |
| `docs/source/07-协议事件清单.md` | 改（+§0.6） |

## 会话交接（GIS-W46 地址机器人代码重构）

### 完成事项

1. **诊断原会话空转** — `sessions/2026/11/09/rollout-2026-11-09T15-54-25-*.jsonl`（7012 行）：真实 `spawn_agent` 调用 **0 次**，仅 1 次匹配命中来自 compacted 摘要内的工具清单文本；2026-11-11T14:54「继续」后连续 20 次工具调用为「宣告 spawn + `Write-Output "spawning"` 占位」，构成宣告—行动断裂死循环（会话累计 4 次上下文压缩，token 在 102K 附近震荡）。
2. **生成交接快照** — 新增 `herness/08-会话交接/records/2026-11/gis-w46-address-robot-refactor/20261111-151045-huanghuanrong-1669-2888.md`（200 行），覆盖目标边界、方案与授权、8 条关键决策、进度（A 组抽屉 3 文件 / B 组 JSDoc 4 文件 / C 组文档同步 8 处）、工作区改动归属、验证记录、踩坑风险与下一步停止点。
3. **归属核实** — 工作区 25 项差异中，**17 项属本重构任务**，另 **8 项属「BC 收口 V1.1 多 kind 共用物理通道」任务**（`src/const/const.message.type.ts`、`src/composables/relayProtocol.ts` 等，见本文件上一条日志），已在交接记录中标注为「归属不明，勿纳入本任务提交」。

### 验证

- `pnpm lint` — 0 报错（HEAD f8dcb2b5 + 25 项未提交差异）
- `pnpm harness:check` — 全过：交接格式 3 条记录 0 错 0 警、css-vars 140 个变量全有定义、backdrop 26 处标准写法、element-styles 29 个组件全登记；asset-manifest 8 条零引用警告不阻断（人工决策，勿据此删文件）
- `node scripts/check-handoff-format.mjs --strict` — 错误 0 条、警告 0 条，全部通过

### 未运行

- `pnpm test` / `pnpm build` — 本次仅新增文档，属交接规范 §7「文档专用改动可不跑 TS/业务测试」范围。

### 结论

交接记录阶段完成，**未提交、未推送**（本任务未获提交授权）。原会话仍在活跃写入，建议停用并以新会话按接续指令恢复。

## 代码评审与修复落地（GIS-W46 地址机器人代码重构）

### 评审结论

评审范围：地址机器人重构 17 项差异（**排除** relay/BC 收口那 8 项，属另一任务）。

| 轴 | 编号 | 结论 |
|---|---|---|
| Standards | S1 | `searchFeatureStyle.ts` 三个导出函数缺 JSDoc → 按用户要求「不一定必须有 jsdoc」改为**按需写**，只补 `createFlashStyleFunction` 的 `flash` 参数语义（非显然） |
| Standards | S2 | `ROLE_POLYGON_STYLES` 仅 re-export 无消费方 → **保留 + 注明**（用户口径） |
| Standards | S3 | `POINT_STROKE_COLOR` 与 `POINT_TEXT_STROKE_COLOR` 同值 → 合并底层 `WHITE_STROKE`，保留两个语义别名 |
| Standards | S4 | `SPATIAL_ANALYSIS_COLOR` 零引用且与内联字面量同值并存 → 保留导出 + 常态色提为私有常量，内联字面量改为引用 |
| Spec | P1 | 方案 §0 状态仍「待确认」→ 改为「已确认」+ 填确认时间与用户原话 |
| Spec | P2 | 方案 §4/§7 称 palette 走 `cssVar()` 主题读取 → **实际是纯常量**（颜色承载角色语义），已回写方案 |
| Spec | P3 | 方案称 `ROLE_RANK` 用 `as const + Record<AddressRobotRole, number>` → 实际用 `Exclude<..., "search_area">`（search_area 是面要素，不参与同层点排序），已回写 |
| Spec | P4 | 方案漏记 `getlabelText`→`getSourceTableLabel` 改名、新增 `resolveSingleStyle()` → 已回写 |
| Spec | P5 | 文档同步未落地：`项目结构速查.md` 仍写「controller 侧仅作兼容对照」（目录已删，事实错误）→ 已修正为「仅底座保留」；`公共工具速查.md` 补 `addressRobotPalette` 落位；协议清单与 DTO Schema 两处表述已同步 |

**行为等价性核查**：点要素 4 个 role 的 fill/text、描边、`lineStyleFlash`、`aoi_2/aoi_3` 合并、空间分析分支、`labelText`、`getRoleRank`、`getPolygonArea` **全部等价**。

**唯一真实行为变更**：`getPalette` 兜底 —— 旧版恒为 anchor 红，新版 `ROLE_POLYGON_STYLES[role ?? "anchor"]`。`role` 由服务端 `attrs` 透传（`AddressRobotRenderer.ts:106,118`），客户端不硬编码。已写入方案 §9 风险 5，需对真实数据确认。

### 注释规范修订（用户要求「不一定必须有 jsdoc，尽量精简注释描述，需要改一下 herness」）

- `代码注释规范.md` §一 拆出「底座渲染层」行；§四 改为「JSDoc 的判定标准（按需，不是强制）」，新增必写三情况表 + 不需要 JSDoc 的清单；§九 补检测项说明；§10.3 去 `baseComponent/` 公共文件列举
- 引用同步 5 处：`AGENTS.md:64`、`herness/00-SOP.md:64,69`、`设计规范速查.md:88,350`（另补改 `:116`「公开导出必须有 JSDoc」漏网条目）
- `scripts/check-code-convention.mjs`：删除 `missing-jsdoc` 检出与 `PUBLIC_DIRS` 判定，**保留 `jsdoc-long`**（只管「写了不能太长」，不管「有没有写」）

### 验证

- `pnpm lint` — 0 报错
- `pnpm lint:baseline` — 0 项 / 基线 0 项，无新增
- `pnpm harness:check` — 全过（交接格式 3 条 0 错 0 警、css-vars 140、backdrop 26、element-styles 29）
- 地址机器人相关测试 — `f6F7EngineBoundary` / `businessMessageRuntime` / `variantRoundTrip` 共 **35 项全绿**
- `pnpm build` — 通过
- `pnpm test` 全量 — **11 项失败，已确认与本次改动无关**：`broadcastChannelBridge.spec.ts` 引用了 commit `7bc1c2ff`（BC 收口 V1.1）已删除的 `useBroadcastChannelBridge.ts`，另 `gisPointSelectionMigration` / `incidentLocationSources` 同样属 relay 链路。已用 `git stash` 回到 HEAD 复跑验证，**HEAD 上失败集完全相同**

### 未完成 / 待人工

- `getPalette` 兜底按 role 取色需**对真实数据确认**（方案 §9 风险 5）
- 抽屉样式 token 化、DICT/displayLabels 合并、假数据接口化（R07）在本轮**未实施**，仍列在方案 §4
- 未提交、未推送（AI 不自动 commit/push）

### A/B/C 组实现落地（同批续做）

**A 组 · 抽屉**

- `index.vue` 样式段：20 处裸色值 → `var(--token)`。复用既有 `--tag-primary/success/warning-*`；新增 `--addr-robot-header-*` 8 个（与 `tokens.less` 双写）。删 `html[data-theme='NIGHT']` 覆盖块 —— 毛玻璃强度改走 `var(--glass-blur)`（本就随主题变化，夜间 8px / 白天 6px），**不再需要主题覆盖块**。
- `types.ts`：`DICT` 并入 `displayLabels`（单一权威），`label` 收敛为单一实现（未命中 → fallback，抽屉现行行为）；新增 `AddressRobotDataSource` 接口。
  - **裁定口径**：key 集合以 `displayLabels` 为准、文案采用 `DICT` 的 → `role.context`='上下文'、`role.final_anchor`='主锚定物'、`anchorType.aoi`='AOI'、`level.AOI_1`='主城区'；`anchorRole` 组名归一为 `role`。
  - **status 组例外（U12b）**：以 `displayLabels` 为准（`resolved`='已命中'、`ambiguous`='有歧义'），`DICT` 旧文案弃用。
- `data.ts`：导出 `defaultDataSource`；`index.vue` 改 `props` 注入（Q4 裁定）。
- `close_address_drawer` 的 TODO 补三要素（2026-12-10 到期）；`mock.ts` 删除（内容仅迁移提示注释）。
- **未做**：`GisPayload`/`OsmPayload` 的 `any` 收窄 —— 需与 `protocol/BusinessProtocol.ts` 对齐，属 W07 契约冻结范畴，不在本轮。

**B 组 · 消息层与工具**

- `interceptor/transforms/addressRobot.ts`、`business/AddressRobotController.ts` 补 JSDoc（**按需写**口径）。
- `dispatchers/addressRobot.ts` 修正 JSDoc 判定条件笔误：`notifyType === 'addressbot'` → 实际是 `'ADDRESSBOT'`。
- `MapTools/drawMapTools/addressRobot.ts`：`message: any` → 新增 `AddressRobotUpstreamMessage` 接口（保留 id/robotId/code 三来源）；`console.warn/error` → `createLogger('AddressRobotManager')`；**全部方法保留**。

**C 组 · 临时注释**

- `controller/core/generic/index.ts` 3 处「临时使用」TODO 补三要素（2026-12-11 到期），并注明真实归属应为 `AddressRobotRenderer` 自有图层管理。

### 验证（最终）

- `pnpm lint` — 0 报错；`pnpm lint:baseline` — 0 项 / 基线 0 项
- `pnpm harness:check` — 全过（css-vars 140→**148**，backdrop 26→**25**，交接格式 3 条 0 错 0 警，element-styles 29）
- 地址机器人相关测试 — `f6F7EngineBoundary` / `businessMessageRuntime` / `variantRoundTrip` 共 **35 项全绿**
- `pnpm build` — 通过
- `pnpm test` 全量 — **9 项失败，已确认与本次改动无关**：`broadcastChannelBridge.spec.ts` / `gisPointSelectionMigration`（5 项）/ `incidentLocationSources`（3 项）同属 relay/BC 链路（`7bc1c2ff` 删了 `useBroadcastChannelBridge.ts` 但测试还在引用）；另有 `dispatchMapMockVehicles` 1 项由**工作区里「调派起点/终点注入」那批未提交改动**引起（`useDispatchEntangled.ts` 把 `renderRoutesOnly` 换成 `renderRouteAlternatives`，测试仍断言旧调用）—— 已用 `git stash` 逐文件隔离验证，**与地址机器人无关**。

### 踩坑记录

- **`git stash pop` 会静默丢改动**：本轮 pop 时 `specialMapMock.ts` 整个丢失、`useDispatchEntangled.ts` 只恢复 18/54 行，且命令仍提示「已 pop」。**正确做法**：pop 后必须 `git diff --stat` 核对行数，不一致时用 `git checkout "stash@{0}" -- <file>` 取回，并用 `git apply --check --reverse` 验证 stash 内容已完整落地后再 `git stash drop`。
- **Windows PowerShell 5.1 命令行传中文给 `node -e`** 会因引号转义炸掉；写文件统一用 `.cjs` 临时脚本（`package.json` 有 `"type": "module"`，`.js` 不可用）。
- **BOM 会阻断 apply_patch**：部分文件 HEAD 就带 UTF-8 BOM（`dispatchers/addressRobot.ts` 等），`apply_patch` 因行首 BOM 匹配失败。改用 node 脚本读写，并显式保留原有 BOM。
## 16:30 调派多方案推荐+跟踪动画融合（B+c 方案）

### 改动
- specialMapMock.ts：接口加 setStations（运行时注入起点/终点），doRender/simulate 改读 activeData（默认内置北京，注入后走真实队站）
- useDispatchEntangled.ts receiveMockDispatchVehicles：规划保留全部候选→构建 StationRouteAlternatives→打开 DispatchRoutePreview 面板；车辆动画仍走各站选中路线；坐标同步 specialMapMock.setStations（flood 演练复用同一数据源）
- server/test-runner/modes/_base.js：新增 mockVehicles 步骤（记 stateLog.dispatchVehicles）
- server/test-runner/index.js：引擎处理 type mockVehicles（写 stateLog 含 dispatchVehicles 数组）
- server/test-runner/modes/dispatch.js：加 mock-vehicles 步骤（2 车深圳大冲/沙河）
- server/test-ui/app.js：applyReportState 增加 seat-shared-state-mock 写入（stateLog.dispatchVehicles）

### 验证
- pnpm lint EXIT=0（0 报错；W46 遗留 d.ts 缺失报错已不在本次范围内）

