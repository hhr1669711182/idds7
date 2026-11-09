# 工作日志 2026-11-06（agent-huanghuanrong）

## 架构梳理与文档同步（ARCHITECTURE.md 重写 + 项目结构速查修正）

### 背景
- 用户要求「重新梳理当前项目架构」，在确认后落地。此前方案：P0 重写 `ARCHITECTURE.md`、P0 修 `项目结构速查.md` 过期目录树、P1 统一 `core/business` 能否 import ol 的口径、P1 把「单实例 variant 契约」写进第一入口、P2 改 `attachMap` 多槽位（本轮不做，代码改动需单独方案）。
- **前置发现**：上一轮问的 `dispatchMapStore` 归并**已落地**（提交 `9ce236bc`，HEAD 已到 `1c1b7130`），`useDispatchMapStore.ts` 与 `DispatchLayers.vue` 均已删除，车辆 GPS 磁贴已并入 `components/map/layers.vue`。本轮不再重复设计那部分。

### 调查结论（只读）
- 实测规模：`src/**` 430 文件 / 74,002 行；各层分布 components 20,688 / baseComponent 16,300 / views 5,468 / controller 5,214 / store 3,162 / composables 3,115 / apis 1,756 / utils 1,642 / interceptor 1,067 / plugins 999 / config 704 / const 643 / service 247。
- 巨型模块 top5：`useAmapTools.ts` 2158 / `useDispatchEntangled.ts` 2045 / `DispatchT1.ts` 932 / `DispatchT1.vue` 833 / `MasterAlarmPanel.vue` 825。
- 测试规模：unit 52 / components 3 / e2e 5 = 60 个 spec 文件。
- `core/business` 现存 `import 'ol/...'` 仅 3 处，全在 `IncidentVideoOverlayController.ts`（`ol/Overlay` / `ol/Map` / `ol/proj`）——**符合 2026-10-30 放宽后的口径**，非越层。
- `DispatchT1.isLayerVisible` 实为**死参数**：全仓仅 `DispatchT1.ts:119` 类型声明 + `DispatchT1.vue:173` 注入，无任何消费点。此前评审报告 K-2 判「口径不一致」属**误判**，需撤销。
- `controller/publish/{map,host,three}.ts` 5 个函数**零业务调用方**（仅 `tests/unit/publish.spec.ts` 引用）——属预留出口，非缺陷，但文档需如实标注。

### 变更清单
| 对象 | 动作 |
|---|---|
| `ARCHITECTURE.md` | **全文重写**（245 行 → 约 420 行）：新增「当前规模（实测数字）」章节、装配顺序图、`NormalizedMessage` 可行性专节（回答「这套设计是不是不可行」）、单实例地图架构专节（第五节：终态形态 / `LayerViewMode` 分层 / 变体切换契约 4 条强制项 / 图层勾选单一口径）、Store 分层（含 S7 循环依赖约束）、技术债表（K-1 已解决 / K-2 撤销 / K-3 仍有效）、历史遗留已清理表。删除全部过期表述：`@/subscribe` 存在、`src/Control/` 存在、`useMessageStore916.ts` 存在、类型基线 193 项、`core/business` 禁止 import ol、测试 16 文件 86 用例、`dispatchMap.vue` 存在 |
| `herness/05-共享上下文/项目结构速查.md` | 修正 6 处过期目录树：删 `views/dispatch/` 与 `views/dispatch1/`、删 `useMessageStore916.ts`、删 `useDispatchMapStore`/`useDispatch1MapStore`、删 `components/dispatchMap1/`、删 `src/Control/`（补注已删 + fixture 去向）、`baseComponent/OpenlayersMap/` 补齐当前实际文件（`useGisBaseMap` / `useDispatchEntangled` / `dispatchBusiness` / `gisMapConfig` 等）、补 `tools/routeBase.ts`、`dispatchMap/` 注明仅剩 `VehicleTrackPanel.vue`。另修「三维场景落点」指向 `InputController`、末尾「Control 保留对照」条目改为已删除说明 |
| `herness/05-共享上下文/设计规范速查.md` | 层次铁律第 4 条补明：订阅 API 是 `useMessageStore().subscribe`，但**业务侧订阅统一注册在 `controller/core/io/InputController.ts`**（原 `@/subscribe` 目录已下线）——消除「subscribe 还在不在」的歧义 |
| `herness/05-共享上下文/当前状态摘要.md` | 「单实例架构的变体切换契约」条目改名加「2026-11-06 复核」，技术债从 3 项收敛到 **1 项**（仅 K-3）：K-1 标注 ✅ 已解决（11-05 归并）、K-2 标注 ✅ 撤销（死参数，评审报告误判）；补指向 `ARCHITECTURE.md` 第五节 |

### 验证
- `pnpm lint` **0 报错**（vue-tsc 无输出）。
- `pnpm harness:check` **全部通过**：herness 体量 + handoff 格式 + css-vars（139 个变量全定义）+ backdrop-filter（26 处标准写法）+ 资源清单（93 文件 / 62.18MB，8 条零引用为既有人工决策项）+ element-styles（28 个 El 组件全登记）。
- `npx prettier --check` 对 4 个改动文档 **All matched files use Prettier code style**。
- 文档内所有引用路径已逐一核对存在性：`src/subscribe` / `src/Control` / `dispatchMap.vue` / `useMessageStore916.ts` / `useDispatch1MapStore.ts` / `views/dispatch` / `views/dispatch1` / `components/dispatchMap1` / `CircleQueryTool copy 2.ts` 均为 `False`（已确认删除）。

### 未做（留待单独方案）
- **P2 K-3**：`BusinessMessageRuntime.attachMap` 改按 `kind` 多槽位持有 attachment。属代码改动，需单独设计确认。
- **`DispatchT1.isLayerVisible` 死参数清理**：已确认可删，但属代码改动，本轮仅在文档中标注。
- **`server/` 目录未提交改动**：属其他 agent 工作，按协作规范未触碰。

### 备注
- 工作区另有 `server/` 大量 D/M/?? 改动（非本轮产生），提交时须逐个路径 `git add`，禁止 `git add .`。
- 未提交（按协作规范第 13 条，AI 不自动 commit）。

## 天气轮询与围栏定位解耦（修复「时不时闪烁定位到北京」）

### 背景
- 用户反馈：地图时不时自动定位到北京并高亮行政区划围栏。经定位为 **WeatherPanel 默认 10 分钟定时器** `setInterval → controller.selectArea(北京)`，而 `selectArea` 里 `loadFence` 会下发 `areaFenceHighlight(flash:true)`，触发 `AreaFenceRenderer` 重新 `fitToExtent`（相机定位）+ 3s 闪烁。定时器绕过了用户点击 `handleSelect` 的「同区划跳过」守卫，导致每 10 分钟地图跳动+围栏闪烁一次。

### 变更清单
| 对象 | 动作 |
|---|---|
| `src/controller/core/business/AreaWeatherController.ts` | 新增 `public async refreshWeather()`：仅对当前 `selected` 节点调 `loadWeather`，**不碰 `loadFence`**（`++requestSeq` 保持与 `selectArea` 的并发守卫一致） |
| `src/components/common/WeatherPanel.vue` | 定时器回调由 `selectArea(selected.areaCode)` 改为 `refreshWeather()`；天气每 10 分钟只刷数字，不再触发定位/闪烁 |

### 效果
- 首次 `init()` → 定位+闪烁（不变）；用户手动切区划 `selectArea` → 定位+闪烁（不变）；每 10 分钟定时器 → 仅刷天气，**地图不再跳动、围栏不再闪**。

### 验证
- `pnpm lint` **0 报错**。
- `selected` 仍被 `currentLabel` 计算属性与模板引用，无未使用告警。

### 备注
- 用户要求「落地并本地提交」，本轮按指定文件提交（仅上述 2 个代码文件 + 本日志），`server/**`、`ARCHITECTURE.md`、`DispatchT1.*`、herness 其他文档的既有改动不纳入本次提交。

## 补做 P2：attachMap 多槽位（K-3 根治）+ isLayerVisible 死参数清理

### 背景
- 用户要求把上轮「没做的两项」补上并一起提交：① K-3 `BusinessMessageRuntime.attachMap` 改多槽位；② `DispatchT1.isLayerVisible` 死参数清理。
- 注：本轮改动在执行中被**并行 agent 提交并推送**（HEAD 从 `1c1b7130` 推进到 `f814793f`，含我的 `0bf3724f` 代码+文档、`49c0dffe` 测试）。工作区现为干净态。

### 变更清单
| 对象 | 动作 |
|---|---|
| `src/controller/core/io/BusinessMessageRuntime.ts` | **attachMap 改多槽位**：`private active: Attachment\|null` → `private attachments = new Map<string, Attachment>()`（按 `kind` 分槽）；新增 `private activeSlot()`（调派优先、无调派槽位回落主图）；`valid()` 守卫改为校验「本槽位仍是该槽 attachment」（不再因另一槽 attach 而失效）；同槽位重复 attach 仍顶替旧的并 dispose；`drainMock` 只认 dispatch 槽位；`dispose` 释放全部槽位 |
| `src/baseComponent/OpenlayersMap/map.vue` | variant watch 的 else 分支**删除「重新 attach kind:'map'」**代码——多槽位后主图端口全程存活，切回无需重挂 |
| `src/baseComponent/OpenlayersMap/AddressRobotRenderer.ts` | 多槽位并存时同名 `businessId` 图层可能互抢：新增 `instanceSeq`（模块级自增序号），owner 不符时改用 `${businessId}__${instanceSeq}` 独立图层名；`SearchRenderState` 增 `layerName` 字段，dispose 按 `layerName` 清理 |
| `src/baseComponent/OpenlayersMap/DispatchT1.ts` | 删除 `DispatchT1Options.isLayerVisible` 死参数声明 |
| `src/baseComponent/OpenlayersMap/DispatchT1.vue` | 删除 `isLayerVisible: (layerId) => layersStore.checkedIds.includes(layerId)` 注入（全仓无消费点） |
| `tests/unit/businessMessageRuntime.spec.ts` | **新增 4 条多槽位用例**：双槽位并存时业务动作走 dispatch 且主图未被顶掉；调派 detach 后主图槽位仍存活且 dispose 未被提前调用；同槽位重复 attach 顶替语义；主图槽位 detach 不影响调派槽位 |
| `tests/e2e/variantRoundTrip.spec.ts` | 修**既有遗留失败**：定位器 `.dispatch-layer-toolbar` → `.lt .tile`（该 class 已随 `9ce236bc` 从 src/ 删除，测试没跟着改）；新增归并不变量断言「页面只存在一个图层工具栏」 |
| `ARCHITECTURE.md` | K-3 / K-2 标注已解决；多槽位机制与副作用处理写入第五节 |
| `herness/05-共享上下文/当前状态摘要.md` | 技术债 K-1/K-2/K-3 **全部收敛**，变体切换契约条目重写 |
| `herness/05-共享上下文/模块设计速查.md` | §五点五 第 4 条强制项从「单槽位需重新注册」改为「按用途分槽位持有，不同用途互不顶替」 |

### 验证
- `pnpm lint` **0 报错**。
- `pnpm test` **55 文件 583 项全通过**（原 579 + 新增 4）。
- `pnpm e2e` **11/11 全绿**（49.3s）。其中 `variantRoundTrip` 第一条为**既有遗留失败**（定位器指向已删除的 class），本轮修复后通过。
- **反向验证**：把 `attachMap` 人为退化回单槽位（dispatch attach 顶掉 map）后，新增的 4 条用例立即挂 2 条；恢复实现后 20/20 全过——证明新用例真能拦住该回归。
- `pnpm harness:check` 全部通过；`npx prettier --check` 通过。

### 备注
- 本轮 e2e 失败**非本次改动引入**：根因是 `9ce236bc`（图层工具栏归并）删除了 `.dispatch-layer-toolbar` 而 e2e 仍用该 class 定位，属测试未跟随实现更新。
- `server/**` 目录的 D/M/?? 改动属其他 agent，未触碰。

### 未提交

## dev:local 一键联调脚本 + 全生命周期测试场景（fullCycle）+ WS 门控统一

### 背景
- 用户要求：① `dev:local` 增一个脚本，起前端默认同时拉起本地测试服务（mock-ws :18080，含 /test-ui/ 一键测试台），无缝无感接入；WS 走本地 mock 还是 dev 远端加门控；② 测试页补全流程场景：值守→跟踪→回归值守，等待下一警；③ 真实阶段流按项目 MapPhase 走「值守-来电-接警问询-调派-跟踪」；④ 各环境 WS 统一为 `…/message-client/ws`（不再拼 `{userId}/{sessionState}`），initMessage.ts 清理优化；⑤ 复核 server 命名。

### 变更清单
| 对象 | 动作 |
|---|---|
| `scripts/dev-with-mock-ws.mjs` | **新增**：同起 `node server/mock-ws.js` 与 `pnpm exec vite --mode dev.local`，输出加 [mock-ws]/[vite] 前缀，任一进程退出联动终止另一个，SIGINT/SIGTERM 双杀。`ROOT_DIR` 用 `path.dirname(fileURLToPath(import.meta.url))`（无尾斜杠）上跳一层，修掉 `new URL('./',…)` 多剥一层的隐患 |
| `package.json` | 新增 `dev:local:test`（起双服务）与 `test:scenario:cycle`（`cli.js fullCycle --full`）两个脚本 |
| `.env.local`（不入库，已代改） | WS 门控改两态：A 本地 `ws://127.0.0.1:18080/message-client/ws`（配 dev:local:test）/ B dev 远端注释；保留切换说明 |
| `.env.local.example`（入库模板） | 同两态注释块，模板默认 dev 远端 |
| `.env.development` | 删旧 `ws://localhost:18080/…/alarm-debug-user/…` 与 `173.94/173.198` 旧模板行，保留标准 `ws://ids-dev.ks.telewave.tech/message-client/ws` |
| `.env.test` | `VITE_WS_URL` 由旧 `…/ws/ids-seat-web/{userId}/{sessionState}` 占位符改为标准 `ws://ids-test.ks.telewave.tech/message-client/ws`，删「登录后占位符替换」旧注释 |
| `src/register/initMessage.ts` | **删旧模板兼容分支**：`oldTemplate` 检测（`configured.includes(’{userId}’) && …’{sessionState}’`）删除，URL 决策简化为 `appEnv.wsUrl ‖ buildMessageWebSocketUrl(origin)`；补一行门控说明注释 |
| `src/config/env.ts` | 修正过期注释（原「wsUrl 不再经 appEnv 获取」误导，改为说明 VITE_WS_URL 门控语义） |
| `server/test-runner/modes/_base.js` | 新增 `pushCallEnded`（`kind:'end'` → CALL_TERMINATED）并导出 |
| `server/test-runner/modes/fullCycle.js` | **新增** 全生命周期场景 14 步：值守→来电→定位→画像→立案(CREATED)→调派/出动(FORMAL_DISPATCHED→DISPATCHED)+路径1轨迹→到场(ARRIVED)+路径4轨迹→归队(RETURNING)；extra（full 才跑）：7 态完整结案→CALL_TERMINATED→等 1.5s 回归值守→第二通来电 |
| `server/test-runner/index.js` | `DEFAULT_TARGETS` 命名 `alarm-debug-user/-session` 改为 `MOCK_TEST_USER=gis-test-user / MOCK_TEST_SESSION=gis-test-session`（mock 控制台演示身份，语义更准）；新增 `autoRebindTargets`：未显式指定目标且默认目标不在线时，改绑首个在线真实前端客户端，报告写 `rebound` 字段并打印日志 |
| `server/test-ui/index.html` | 目标身份 placeholder 文案 `alarm-debug-*` → `gis-test-*` |

### 设计要点
- **门控零代码**：WS 走本地 mock 还是 dev 远端，就是 `VITE_WS_URL` 的值本身（initMessage 已支持「有值直连 / 留空按 origin 拼接」），只在 env 文件加两态注释块，切换=改一行，不引入新代码门控。
- **阶段流对齐 MapPhase**（`SharedStateProtocol` 单一事实源）：onDuty→popup→inquiry→dispatch→dispatchTrack→onDuty，fullCycle 每段落到具体协议推送（来电/定位/画像/警情状态/车辆轨迹）。
- **自动改绑**让「真实前端登录后即可无缝跑场景」：不手填 target 也能命中登录身份。

### 验证
- `node --check` 全部新改 server/scripts 文件通过；`registry.js` 自动发现 6 模式（含 fullCycle 14 步，core 10 + extra 4）。
- `pnpm dev:local:test` 实测双起：`vite:8888` 与 `mockws:18080` 同时 OPEN，`GET /api/test/modes` 返回 6 模式；测完已清理双进程与端口。
- `pnpm lint` **0 报错**；`pnpm build` 通过（9.41s）；`pnpm vitest run` **55 文件 583 项全通过**。

### 备注
- `.env.local` 是个人文件（在 .gitignore），本次代改本地联调门控；入库的是 `.env.local.example` 模板。
- `git status` 里 `server/` 的 D/M/?? 为既有并行工作，本轮按路径精确提交，未 `git add .`。
