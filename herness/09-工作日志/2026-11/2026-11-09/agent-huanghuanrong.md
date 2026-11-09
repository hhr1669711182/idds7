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
3. 合并 `map.vue` 与 `dispatchMap.vue` 后，调派模式应隐藏的部分工具（`routePlan`、`ssrkPanel`、`WeatherPanel`、`circleQueryPanel`）丢失了隐藏逻辑。

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
   - `routePlan` / `ssrkPanel` / `WeatherPanel` / `circleQueryPanel` 的 `v-if` 各追加 `&& !dispatchVariant`，恢复原 `dispatchMap.vue` 中调派模式隐藏这四个工具的行为。

**验证**：
- `node --check server/mock-ws.js` OK。
- `pnpm lint`（vue-tsc）0 报错。

**使用方式**：
- 重启 `pnpm dev:local:test`（mock-ws 加载新路由）。
- 前端在 `:8888` 开发时，Vite proxy 把 `/bff-client` 转到 `ids-dev.ks.telewave.tech`，**不受 mock-ws 影响**；需要 mock 时直接访问 `:18080` 路径，或将 Vite proxy target 指向 `127.0.0.1:18080`。
- 跑 `dispatchTrack` 场景时，`test-ui` 轮询写 `seat-shared-state`（phase=dispatchTrack）→ 前端门禁放行 → WS 推送车辆 GPS → 前端调 `queryCarHistoryTrack` → mock-ws 返回 31 点 → `VehicleTrackRenderer` 渲染轨迹动画。

