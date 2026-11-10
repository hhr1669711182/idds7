# 工作日志 2026-11-09（agent-huanghuanrong）

## herness 文档同步：模式状态知识回写（3 处缺口补齐）

### 背景
- 用户问「模式状态方面的知识是否需要同步更新文档库 herness，完成后提交推送」。
- 只读排查发现：`LayerViewMode`/`MapPhase` 展示模式、WS 门控、fullCycle、connect 自动改绑等主体**已**随 `d3406e6c` 

### 调查结论（只读，代码为准）
- `disposeOnHide`（`a4ba3b25`）**未进任何 herness 文档**：`config/layers.ts` 5 个 WMS 层（`view_env_en
- `技术栈速查.md`：`VITE_WS_URL` 说明停留旧文案（"测试页可显式指定"），实为 **WS 门控主开关**（配置即直连、留空按 `VITE_MESSAGE_SER
- `项目结构速查.md`：仓库树 `server/` 仅 `index.js`，漏 `mock-ws.js`（:18080，含 `/test-ui/` + `/api/test/

### 改动（零 src 代码改动，纯文档回写）
1. `05-共享上下文/当前状态摘要.md`：「图层工具栏归并 + 展示模式状态」行追加 `disposeOnHide` hide 分流决策（`a4ba3b25`，5 层名单 +
2. `05-共享上下文/技术栈速查.md`：修 `VITE_WS_URL` 行为门控主开关说明；补 5 条 server 测试命令；删「无 pnpm test」过期注、改为指向 
3. `05-共享上下文/项目结构速查.md`：`server/` 目录树补 4 个子项（`mock-ws.js` / `test-runner/` / `test-ui/` / `index.js`），标注 `test-harness.js` 伺服关系。

### 验证
- `pnpm harness:check` 全绿（herness-size 正常 / handoff 0 错 / css-vars 139 / backdrop 26 / asset-manifest --check 通过 / element-styles 28 组件登记）；仅 8 条既有零引用资源**提示**（不阻断，非本轮引入）。

---

## 追加：test-ui 自包含改造（登录态注入复刻自 `__test/` 控制台）

**背景**：用户在 `:8888` 开 GIS 时 WS 永远连不上 18080——根因不是"没连上"，而是前端 WS **登录后才惰性发起**（`initMessage.ts` L97 `if (!session) return`），且登录态（`seat-shared-state`）写在 `:18080` origin 的 localStorage，`localhost` 与 `127.0.0.1` 是**两个独立 origin**，跨源读不到 → `messageSession=null` → 连接根本未发起。用户要求把 `__test/` 控制台的"写入测试状态"步骤复刻进 test-ui，进页面即可用。

**改动（3 文件，零 `src` 改动）**：
1. `server/test-harness.js`：新增 `GET /api/test/clients`（复用 mock-ws `clients` Map，返回 userId/sessionState/clientId/connId/subscriptions）。
2. `server/test-ui/index.html`：新增「① GIS 连接 · 登录态注入」面板（⚡一键连接 GIS / 仅写登录态 / 打开地图页 + 在线客户端 2.5s 轮询 chip 列表）；修旧 hint 中过期键 `VITE_DISPATCH_MOCK` → `VITE_WS_URL` + `VITE_USE_WS`。
3. `server/test-ui/app.js`：同源 `localStorage.setItem('seat-shared-state')`——payload 严格对齐 `sharedMessageSessionFromSnapshot` 硬条件（`v:1` + 有限 `updatedAt` + `auth.sessionId` + `user.userId` + mock JWT，`sub/session_state` = 目标身份，留空默认 `gis-test-user/gis-test-session`）；`window.open('/#/map')` **相对路径锁死同源**（根治 localhost/127.0.0.1 跨源坑）；已开 GIS 页靠 storage 事件热重连。

**验证**：`node --check` 三文件过；临时 `:18081` 实例实测 `/api/test/clients` 空态/连入后 +1 均 200；payload 形状 6 项校验全过（含 mock JWT `sub/session_state` 还原）。中途发现补丁脚本把 `/api/test/clients` 路由块写重了 2 份（`patch.cjs` 在 `edit` 已应用后又跑了一次），已去重为 1 份。

**用户操作三步走**（生效需重启 `dev:local:test`，旧 mock-ws 进程无新路由）：
1. `Ctrl+C` 重跑 `pnpm dev:local:test`
2. 开 `http://127.0.0.1:18080/test-ui/`（**必须 127.0.0.1**，别开 localhost）
3. 点「⚡ 一键连接 GIS」→ 自动开 `/#/map`，1~2s 后在线客户端出现 `gis-test-user/gis-test-session` 即通；再「▶ 执行」跑场景。
---

## 追加：场景引擎模式门禁同步 + 节奏（stateLog / afterMs / 点间真实等待）

**背景**：用户指出 test-ui 场景执行「前端模式门禁没被触发（phase/mode 没变）」+「数据推送过快，地图没有逐步交互」。只读排查定位两个引擎缺陷：
1. 场景只推 WS 业务报文，而前端展示模式门禁（useLayersStore 的 LAYER_MODE_* / 工具栏锁定）**只认 localStorage seat-shared-state 的 phase/mode**——node 进程写不到浏览器 localStorage，场景跑完 phase 纹丝不动。
2. seq（车辆轨迹）执行器的 intervalMs **只写进 payload.time 从不真 sleep**，12~16 点瞬间打完；业务步之间也缺观察窗口。

**改动（零 src，全在 server/ 测试基建）**：
- _base.js：步骤携带 statePhase（该步完成后前端应处的 MapPhase）+ mode（特灾轴，flood）+ afterMs（PASS 后观察窗）；carSequence/incidentFlow 参数化；新增 withMode 助手。
- index.js：新增 recordState（对象化 + 去重，记 report.stateLog）；push/flow/seq PASS 后 sleep(afterMs)；seq 点间**真实** sleep(intervalMs)；报告附 stateSequence 轨迹摘要。
- 6 模式文件（fullCycle/dispatch/dispatchTrack/flood/onDuty/popup）按数据特性标注 statePhase/mode + 节奏参数；fullCycle 轨迹 = popup→inquiry→dispatch→dispatchTrack→onDuty（extra 再 onDuty→popup），flood 叠 mode:flood。
- cli.js：结果输出附 stateSequence。
- test-ui/app.js：applyReportState 轮询增量把 stateLog 写回 seat-shared-state.phase/mode（GIS 页经 storage 事件热更新门禁）；index.html 加「展示模式同步」指示行。

**验证**：node --check 全过；临时 :18082 实例 + 镜像真实前端（默认 clientId=ids-seat-web + # 通配订阅）真跑：fullCycle --full 14 步全 PASS、stateLog 6 条去重正确、car-route1 ms=6875（≥6000 证明节奏生效，旧=0）、flood stateSequence 带 mode 轴。

**验证侧踩坑（非引擎缺陷）**：probe 客户端若用自定义 clientId（如 probe-gis）+ 空订阅，会被协议 clientId 隔离（base=ids-seat-web）+ 空订阅直接判「topic 未订阅」FAIL、stateLog 记不到——镜像真实前端须用默认 clientId + 订阅。

**文档**：当前状态摘要 test-ui 行追加「场景模式门禁同步 + 节奏」段。

## 追加：场景阶段门禁修正（kind 自动推导 + currentAlarm 落盘，修复警情/车辆/画像不上图）

**背景**：用户反馈 test-ui 跑场景「只有来电定位上图，警情/车辆/画像都不生效」，问是数据错还是契约不一致。只读排查前端消息链路（initMessage→useMessageStore→interceptor→InputController→messageStagePolicy）定位根因：
1. **数据报文形状是对的**（incident 的 notifyType=alarm_incident / customContent.data.incidentId 等，拦截器 matcher 全命中）。
2. **卡点是前端 messageStagePolicy 阶段门禁**：消息先入 pending，只有 getSharedMapStage(rawState, MapMode) 算出的 stage 等于该消息要求 stage 才放行，否则按「忽略状态不匹配」丢弃。
3. **关键机制**：stage=dispatch 是「推导值」不可直接写 phase（可写仅 onDuty/popup/inquiry/dispatchTrack）；phase=inquiry 时 currentAlarm.incidentId 有值→dispatch、null→inquiry。旧引擎写死 phase=dispatch（非法，getSharedMapStage 返回 null 全丢）且从不写 currentAlarm，只有 position(popup，可写、无需 currentAlarm) 能过门禁——与现象完全吻合。

**修复（纯 server 测试侧，零 src 改动）**：
- _base.js：步骤契约收紧，门禁改由 kind 自动推导；删掉写死的 statePhase=dispatch；stateAlarm/mode 显式字段保留。
- index.js：KIND_STAGE（received/end→inquiry、position→popup、address/incident→dispatch、car→dispatchTrack）+ stageToWritable + mirrorStage（镜像前端门禁，自检 _stage）；preGateState 在每步推送「前」写 report.stateLog（含 alarm=incidentId / _stage），消息到达时门禁已就绪；stateSequence 带 gate= 摘要。
- test-ui/app.js：applyReportState 增写 cur.currentAlarm（alarm=incidentId→{incidentId}、null→清空）；轮询 600→250ms（< afterMs/intervalMs≥300，保证门禁先于消息落盘）。
- 7 场景文件：按 kind 推导去 statePhase；wait 步保留显式 statePhase=onDuty 复位；flood 叠加 mode 轴。
- cli.js：打印 gateWarns。

**验证**：node --check 全绿；无头模拟 6 场景 gateWarns=none、stateSequence 正确（inquiry→popup→dispatch(inquiry+incidentId)→dispatchTrack）；in-process 伪前端 WS（订阅 5 业务 topic）跑 fullCycle --full：投递 45 帧，alarm_incident=12 / CAR_LOCATION_SYNC=28 / disaster_profile=1 / alarm_call=3 / POSITION_SYNC=1，全部 topic 实际收到（此前只有 position 有帧）。

**文档**：当前状态摘要新增「前端消息阶段门禁契约」行（stage 真值表 + 可写 phase 集合 + dispatch 需 inquiry+currentAlarm 推导 + 引擎按 kind 自动写 stateLog）；对应权威设计见 Control走线迁移清单 §10.3。

---

## 追加：BFF API mock + 车辆轨迹假数据 + dispatch 模式工具隐藏（三处联动落地）

**背景**：用户反馈 3 个问题：
1. `GET /bff-client/api/v1/inquiry/profiles/by-incident/{incidentId}` 无 mock，前端画像补水静默失败（`showError: false`），导致警情上图后无坐标/地址刷新。
2. 调派模式下车辆不动——历史轨迹 API（`POST /car-track-api/api/car/track/query`）指向外网 `192.168.169.40:31319`，测试环境无该服务 → 轨迹查询无数据 → 地图无动画。
3. 合并 `map.vue` 与 `dispatchMap.vue` 后，调派模式应隐藏的主图工具入口（`trp` 工具栏、`clear`、`card`、`bigPanel`、`config`、`paletteDrawer`、`topicLayerCard`、`baseSource` 及 `routePlan`、`ssrkPanel`、`WeatherPanel`、`circleQueryPanel`）丢失了隐藏逻辑（这些组件只按 `mapConfigStore.feature` 门控、不感知 dispatch 模式，故调派跟踪态下仍显示）。

**改动（2 文件）**：
1. `server/mock-ws.js`：
   - 顶部加 `const { carPoints } = require('./protocols')`。
   - 新增 `handleBffMock(req, res, pathname)` 拦截器，在 `mountTestHarness` **之前**优先匹配 4 类路径：
     - `GET /bff-client/api/v1/inquiry/profiles/by-incident/{id}` → 返回 `IncidentProfileData`（disasterProfileId / slots 含 longitude、latitude、m_org_id、disaster_address）。
     - `GET /bff-client/api/v1/gis/incidents/{id}/detail` → 返回完整 `IncidentDetailResponseData`（alarmInfo / acceptInfo / dispatchInfo.batches[0].stations[0].vehicles[0] vehicleId=`TEST-CAR-001`）。
     - `GET /bff-client/api/v1/gis/incidents/{id}/turnout-vehicles` → 返回 `IncidentTurnoutVehiclesData`（vehicles[0] vehicleId=`TEST-CAR-001`，startTime=now，endTime=null）。
     - `POST /car-track-api/api/car/track/query` → 从 `carPoints[0]`（31 点路径）生成 `CarTrackPoint[]`，`gpsTime` 为相对当前时间逐点 +5s 间隔。
   - 所有 mock 响应走 COLA 信封 `{ success: true, data, message: 'mock', code: 0 }`，由 alova response interceptor 解包。
   - 未匹配的 `/bff-client` / `/car-track-api` 路径仍走原 `proxyHttp` → Vite → 后端。

2. `src/components/map/index.vue`：
   - 调派跟踪态（`dispatchVariant`）下主图工具**入口统一藏掉**：`trp` / `clear` / `card` / `bigPanel` / `config` / `paletteDrawer` / `topicLayerCard` / `baseSource` / `routePlan` / `ssrkPanel` / `WeatherPanel` / `circleQueryPanel` 共 12 项加 `v-if="!dispatchVariant"`；保留 `tlp`（罗盘）/ `layers`（图层栏，双变体共用按 activeMode 过滤）/ `brp`（对齐原 `dispatchMap/index.vue` 的 6 项基准）。

**验证**：
- `node --check server/mock-ws.js` OK。
- `pnpm lint`（vue-tsc）0 报错。

**使用方式**：
- 重启 `pnpm dev:local:test`（mock-ws 加载新路由）。
- 前端在 `:8888` 开发时，Vite proxy 把 `/bff-client` 转到 `ids-dev.ks.telewave.tech`，**不受 mock-ws 影响**；需要 mock 时直接访问 `:18080` 路径，或将 Vite proxy target 指向 `127.0.0.1:18080`。
- 跑 `dispatchTrack` 场景时，`test-ui` 轮询写 `seat-shared-state`（phase=dispatchTrack）→ 前端门禁放行 → WS 推送车辆 GPS → 前端调 `queryCarHistoryTrack` → mock-ws 返回 31 点 → `VehicleTrackRenderer` 渲染轨迹动画。

## 追加：工具显隐中置开关 overlay + 右上角换位（`7b63f50f`）

**背景**：上一轮入口隐藏在模板逐处堆 `!dispatchVariant`（12 处）。用户提出两点：① 右上角三入口换位（调色盘 ThemeSwitch 最右、WeatherPanel 挪左），先不聚合；② 用 `mapConfigStore` 中置开关替代模板 v-if——"切出调派直接恢复，做成关联配置"。

**方案（派生 overlay，不改写 feature 本身）**：用户明确"dispatchVariant 模式下一样要隐藏用户配置，不会污染，切出调派直接恢复"。故用**派生层**而非直接改 feature：

**改动（9 文件，+143/-29）**：
1. `src/config/mapConfig.ts`：`FeatureSettings` 接口加 6 个工具键（`showDrawToolbar`/`showCard`/`showBigPanel`/`showConfig`/`showTopicCard`/`showBaseSource`，此前无 feature 键的 6 个组件），`DEFAULT_FEATURE_SETTINGS` 全 true（现状默认显）；新增 `FeatureBoolKey` 类型（mask 只作用于布尔键，数值键不参与）。
2. `src/config/layers.ts`：`LAYER_MODE_HIDDEN_TOOL_KEYS: Record<LayerViewMode, FeatureBoolKey[]>`（与 `LAYER_MODE_HIDDEN_LAYER_IDS` 同风格同文件）。`dispatch`/`dispatchTrack` 隐藏 18 键（工具栏/清除/路径/专题/人口/圈选/调色盘/天气 + 6 新键）；`flood` 留空（特灾态隐藏清单待定）。
3. `src/store/useMapConfigStore.ts`：加 `viewMode`（**复用 `gisMapConfig.resolveLayerViewMode`**，与图层工具栏轴同源，避免第三套派生逻辑漂移）、`effectiveFeature`（`feature` ∧ 模式 mask 派生，**只读不改写 feature** → 切出调派自动恢复用户原值，零持久化副作用）、`showTool(key)` 辅助。均暴露到 store。
4. `src/components/map/index.vue`：解构 `{ feature }` → `{ effectiveFeature }`；12 工具入口 `v-if` 全改读 `effectiveFeature.showXxx`，**模板不再出现 `!dispatchVariant`**；`dispatchVariant` 仅在 watch 逻辑 + `dispatch-variant-ui` div 保留。
5. `trp.vue` / `clear.vue`：内部工具条目显隐改读 `effectiveFeature`（调派态下连 trp 内部工具项一起收）。
6. 换位：`paletteDrawer`（最右，`right: --top-actions-right`）↔ `config`（次右）↔ `WeatherPanel`（最左，`right` 对称互换坐标，保证不重叠）。

**分层合规**：store 层新增 import `@/config/layers` + `@/baseComponent/OpenlayersMap/gisMapConfig`（resolveLayerViewMode）——store 引用 baseComponent 已有先例（`useBaseSourceStore`/`useMapStore`），非越层。

**验证**：`pnpm lint`（vue-tsc）0 报错。

**遗留**：`flood`（特灾）模式的工具隐藏清单未定，`LAYER_MODE_HIDDEN_TOOL_KEYS.flood` 暂空 = 特灾态不额外隐藏（等同 feature 用户配置），待确认哪些工具该在特灾藏。

## 追加：ThemeSwitch 主题开关入口纳入调派态隐藏（ae5b3519）

`src/baseComponent/ThemeSwitch.vue`（右上角主题切换，`--top-actions-*` 定位簇）此前在 `home.vue` 里**无条件**渲染（不走 map/index.vue 那层），所以上一轮工具隐藏表没盖住它。走同一套 `effectiveFeature` 派生 overlay 收口：
- `mapConfig.ts` 加 `showThemeSwitch` 键（默认 true）；
- `LAYER_MODE_HIDDEN_TOOL_KEYS` dispatch/dispatchTrack 隐藏表纳入；
- `home.vue` 挂 `v-if="effectiveFeature.showThemeSwitch"`（经 `../store` barrel 引 `useMapConfigStore` + `storeToRefs`）。
与工具入口同架构：调派/调派跟踪态自动隐藏，切出自动恢复，零持久化。pnpm lint 0 报错。
---

## 追加：GIS-W46 迭代落地（G 域 GeoServer 加固 + P 域路径规划数据分析，9 项）

**背景**：按《GIS-W46-实现阶段代码落地清单.md》（实现版 v2）落地 G03～G05 + P01～P06 共 9 项，全部落 `src/**`。方案见 `herness/02-技术设计/前端/GIS-W46-路径分析与GeoServer加固-技术方案.md`（已确认 → 已落地，待人工验收）。

**用户已确认的 5 项决策**：
1. P01 收敛范围 = 只建 DTO + 单一分析入口，**不迁消费方**（实测「迁移 4 个消费方」对象已不存在：前 3 个已接入 `routeBase`，`useDispatchEntangled` 无路线上图逻辑）。
2. G04 空间口径 = 统一到 `INTERSECTS` 测地圆（**圈选结果集会变，属产品行为变更，需人工验收**）。
3. TMC 缺省兜底 = 归 `unknown` 单列，**不按畅通**（并入会高估畅通占比）。
4. `getWMSFeatureInfo` 参数顺序 = 统一为 `(params, workspace?)`。
5. **workspace = 逐图层/逐请求推导，不做全局单一配置入口**（用户原话：「geoserverWorkspace 的 workspace 在 geoserver 中配置工作空间都不一定一样的，单一配置入口不现实」）。

**新增文件（9）**：
- `src/apis/geoserverTypes.ts` — WFS/WMS 返回契约（几何用 `GeoJSON.Geometry`，与 `envArea` 同口径）。
- `src/utils/cql.ts` — CQL 构造统一入口（字面量转义 / 测地圆 / 视口 / 关键词 / 多图层拼接 / AND 组合）。
- `src/utils/geojson.ts` — `readPointCoordinates` 点几何坐标提取。
- `src/utils/trackStatistics.ts` — 轨迹统计（速度分布 / 停留点 / 跳点与超速异常 / 分段指标 / `limitedSample`）。
- `src/types/routeAnalysis.ts` — `RouteAnalysisDTO` 等分析契约。
- `src/baseComponent/tools/routeAnalysis.ts` — `buildRouteAnalysis` / `compareCandidates` / `ensureSegmentContinuity`。
- `src/baseComponent/tools/routeContinuity.worker.ts` + `src/hooks/useRouteContinuityWorker.ts` — 路段衔接 Worker（照 `routeMetrics.worker` 范式，含主线程兜底）。
- `src/composables/useGeoServerHealth.ts` — 探活 + 离线一次性提示 + `retry`（`GEOSERVER_PING_TIMEOUT_MS = 3s`）。
- `tests/unit/{cql,geoserverApi,routeAnalysis,trackStatistics}.spec.ts` — 4 个用例文件（35 项）。

**修改文件（15）**：`src/apis/geoserver.ts`（泛型化 + workspace 推导 + `pingGeoServer` + `WFSFeatureParams` 去索引签名）、`src/service/alovaGeo.ts`（`timeout = 10s`）、`src/apis/searchQuery.ts` 与 `src/components/map/MapTools/drawMapTools/CircleQueryTool.ts`（圈选改 INTERSECTS）、`src/controller/core/business/IncidentNearbyResourceQuery.ts`（CQL 下沉 utils）、`src/controller/core/business/IncidentStationQuery.ts`、`src/baseComponent/OpenlayersMap/{FeatureClickQuery,DispatchT1.ts,DispatchT1.vue,map.vue}`、`src/apis/layers.ts`、`src/composables/useSSRKFeatures.ts`、`src/baseComponent/amap/routeCongestion.ts`（`normalizeTmcLevel` / `summarizeTmc`）、`src/components/map/component/routePlanPanel.vue`（路况分布分析区）、`src/components/dispatchMap/VehicleTrackPanel.vue`（轨迹统计区）。

**关键设计取舍**：
- **工作空间推导**（`resolveWorkspace(explicit?, typeName?)`）：显式入参 > `workspace:layer` 前缀 > 缺省兜底 `gis`。实测存在 `gis:env_area` 与 `mark:mark_features` 并存，故全局单一入口在语义上不成立。
- **CQL 口径统一依据**：`IncidentNearbyResourceQuery.ts` 早已实测记录该 GeoServer 的 `DWITHIN(...meters)` 不可靠（500m 圈命中 1.3km 外辖区、点图层返回 0），`INTERSECTS` + `SRID=4326;` 轴序前缀是可靠口径。
- **探活失败只提示不阻断**：GeoServer 只服务业务图层，底图与前端矢量功能不依赖它。

**踩坑**：
- ⚠️ **测试夹具的时间轴**：轨迹停留点用例最初写成「前 20 点静止 + 后 20 点移动」，两个错误叠加导致误判失败——① 静止 20 秒远低于 120 秒停留阈值；② 移动段用同一个 `buildPoints` 生成，`gpsTime` 从 0 重新开始，时间轴倒退。**造轨迹夹具必须保证 `gpsTime` 全程单调递增**，静止段要按阈值时长铺点。
- ⚠️ **alova GET 默认缓存 5 分钟**：接口层用例若连续发同参数请求会读到上一次的响应。测试里要关掉（`alovaInstance.options.cacheFor = { GET: 0 }`），否则断言会被缓存污染。
- ⚠️ `@alova/mock` 默认按 pathname 匹配，会把查询串一起算进路径导致匹配不上；用 `matchMode: 'methodurl'`，且 mock key 用 `{workspace}` 通配捕获工作空间段。

**验证**：
- `pnpm lint`（vue-tsc）**0 报错**；`pnpm lint:baseline` **当前 0 项 / 基线 0 项**（无新增）。
- `pnpm harness:check` 全过（css-vars 140 个变量 / backdrop 26 处 / asset manifest / element-styles 29 组件）。
- `pnpm test` **59 文件 614 项全通过**（较基线 55 文件 579 项新增 4 文件 35 项）。
- `pnpm build` 通过（`three.sRGBEncoding` 告警为 BIM 模块存量，与本次无关）。
- Prettier：本次新增/改动的文件全部格式化通过；`src/components/dispatchMap/VehicleTrackPanel.vue` 的格式漂移是**存量**（HEAD 已有 331 处 diff），本次新增的 143 行逐字符合 prettier 规范，未整文件重排以免产生无关 diff。

**待人工验收**：
- G04 圈选结果集变化（同一圈选范围下，列表条数 / 上图要素 / 周边资源命中数与改动前比对）。
- 路径规划面板「路况分布」与车辆轨迹面板「轨迹统计」的显示与数值口径。

**回滚**：G 域与 P 域改动分散在 20 个 `src/**` 文件 + 4 个用例文件，撤销成本低；G04 单独回滚 = 恢复 `src/apis/searchQuery.ts` 与 `CircleQueryTool.ts` 原 CQL 条件。

**关联文档**: `herness/02-技术设计/前端/GIS-W46-路径分析与GeoServer加固-技术方案.md`