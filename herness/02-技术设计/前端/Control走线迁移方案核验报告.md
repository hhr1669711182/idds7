# Control 走线迁移方案核验报告

## 1. 核验结论

**当前不满足整体迁移验收与 Control 清理标准，也不能证明未来编码绝对无副作用。** 原方案存在会导致错放阶段、跨页断链、异步回写、重复执行与会话清理串扰的设计缺口。本轮已将其补入[主方案](Control走线迁移清单与替换方案.md)，形成分批实施与验收约束；业务代码未修改。

| 判断对象 | 本轮结论 | 依据 |
|---|---|---|
| 功能覆盖 | F1～F14 与 Control 18 个文件均已纳入 | 主方案 §3、§5；包含剩余 HTTP/共享工具/Swiper 等职责 |
| 设计可实施性 | 已补明确落点、生命周期、规则与测试；仍须按批评审、实施 | 主方案 §4～§11；不能按原方案直接切换全部入口 |
| 当前代码符合目标方案 | **不符合，迁移尚未实施** | 目标归一、App runtime、统一门控、DTO/快照等仍有缺口 |
| “无新增副作用” | **尚无迁移实现与联调证据** | 现有基础测试和类型基线只证明当前受检范围 |
| F12 | **协议/会话行为冻结；可靠性缺陷未闭环** | 仅规划等价迁位；不擅自修改 ACK/取消/重试 |
| Control 清理 | **不允许据本轮核验执行** | 全功能人工确认后，还需单独确认清理清单 |

核验版本：`319fa44564f72d7a0284829a71e4a2cf27039505`，2026-10-15。核验开始时工作区干净。以下代码行号对应该版本；后续有实现变更需重新取证。

## 2. 问题与方案修订对应

“设计已修订”表示文档约束已补齐，不表示代码问题已修复。高风险项在对应功能启用前必须有回归证据。

| 编号/风险 | 已确认的问题与后果 | 代码证据 | 主方案处理/状态 |
|---|---|---|---|
| R01 高 | 原阶段表允许 `auth=null+popup` 定位；未立案 inquiry 允许立案事件；已有 incidentId 又允许应答，均不等价于旧链 | `Control/messageStageGate.ts:4`、`Control/seatSharedState.ts:73` | §10.2～§10.4：合法性、currentAlarm 的 null/缺省区别、六类真值表；**设计已修订，代码未实施** |
| R02 高 | InputController 仅随 /map 创建/销毁；直接删除 /dispatch1 订阅会断链；复用旧 Map 绑定实例又会操作已销毁地图 | `OpenlayersMap/map.vue:300,426,459`、`dispatchMap.vue:2029,2344` | §4.2～§4.3：App 接收、地图 attach/detach、就绪与重建；**设计已修订** |
| R03 高 | 新 store 只按 system 记录，恢复方却按 eventKey 读取；把门控移到订阅后又从 inbox 恢复，会恢复被拒绝数据 | `store/useMessageStore.ts:137`、`useMessageStore916.ts:135`、`InputController.ts:108` | §6.3：系统记录、事件索引、已准入业务快照分开；**设计已修订** |
| R04 高 | 仅启用 initUserStore 不能使现行 register 自动完成 V2：URL/CONNECT/订阅格式与较新装配不同；open 不等于业务 ready | `register/initMessage.ts:45`、`Control/initMessage.ts:101`、`hooks/useWebSocket.ts:105` | §7.3：单入口、CONNECT、connected 后订阅、逐来源回执；**设计已修订，真实来源需联调** |
| R05 高 | 换席 watch 参数/发送对象不正确，发送 SEAT 函数；连接 key 和本地 matcher 未同步席位 | `register/initMessage.ts:41,71`、`interceptor/install.ts:26` | §7.3：用户/会话/席位 key、唯一连接、matcher/订阅同批更新；**设计已修订** |
| R06 高 | 无会话启动或关闭 WS 会执行整个 cleanups，提前销毁 postMessage/BC；新增 F10/F12 若放同数组也会被永久停掉 | `register/initMessage.ts:27,60` | §4.2、§7.3：appDispose/sessionDispose/map dispose 分域；**设计已修订** |
| R07 高 | 现有归一不是“基本等价”：缺少旧包装列表/无 topic/裸 GPS 等；CUSTOM 兜底过宽，ALARM_CALL 可被 alarm 截走；T1 普通 stop:false 兜底会双分发 | `Control/positionMessage.ts:53`、`alarmCallMessage.ts:61`、`interceptor/matcher.ts:73`、`transforms/alarm.ts:19`、`registry.ts:98` | §6.1：显式路由排他、旧形态兼容、完整先后顺序、无产出才 T1；**设计已修订** |
| R08 高 | HTTP 初始化 lastId 后不拉首次画像；全局 inFlight 会吞掉 B 请求，A 晚响应又先 clearAll 再写入 | `Control/incidentLocationProfileSync.ts:99,104,119,139` | §11.2：初始拉取、请求序号与上下文验证、有效响应后处理；**设计已修订** |
| R09 高 | full/delta 靠 profile-sync- ID 前缀区分；新信封生成或旁支直接调用控制器会丢全量语义、绕门控；relay 过早推进水位也可能阻止补偿 | `Control/mapMessageHandlers.ts:117`、`mapRelayReader.ts:164`、`incidentLocationProfileSync.ts:122` | §6.2、§11.2：snapshotKind、统一入口、接受后更新水位；**设计已修订** |
| R10 高 | F10 启动恢复早于组件订阅；跨页只补 pending render，车辆/灾害点/模拟命令会丢；退出 flood 不撤销旧 pending | `App.vue:29`、`map.vue:426`、`dispatchMap.vue:2363,2521,2568`、`mockCallLocationBridge.ts:292` | §4.3、§11.1：App 先接收、运行期上下文 pending、退出撤销；**设计已修订** |
| R11 高 | 快照 raw 去重不足：新命令保留灾害点会重复清场；ingest 先后不保证 async 完成；clear 后旧算路仍可重绘/开面板/启动动画 | `specialMapMock.ts:100,167,175,229`、`dispatchMap.vue:2525` | §11.1：字段幂等、执行器 Promise 依赖、每个 await 后 generation 校验；**设计已修订** |
| R12 高 | 新业务控制器若直接委托 vehicleManager，仍把 OL 留在 business；定位 store 已有查询，照文档再加控制器查询会重复；已禁用辖区面/支撑路线不能顺带恢复 | `business/vehicleManager.ts:6`、`IncidentStationQuery.ts:11`、`IncidentNearbyResourceQuery.ts:21`、`store/useIncidentLocationStore.ts:283` | §4.4、§11.2：引擎适配、唯一状态/查询/渲染 owner、禁用分支保持；**设计已修订** |
| R13 高/冻结 | F12 迟到旧 CANCEL 可清新会话；RESULT 后 stop 立即清重试；未就绪 START 空窗。原文“逐行等价迁移且可靠重试全部通过”无法同时成立 | `Control/gisPointChannel.ts:153,156`、`OpenlayersMap/incidentRelocate.ts:88,133,250` | §11.3：**仅等价迁位，既有缺陷保留登记**；用户已要求协议暂不动，不自动扩展修复范围 |
| R14 中 | 通用 BC 客户端自动解析 JSON 字符串，构造/发送异常边界也不同；直接复用会改变 PICK 输入与降级语义 | `hooks/useBroadcastChannel.ts:41,47,60`、`Control/gisPointChannel.ts:77,166` | §11.3：复用需等价适配，禁止 sendEvent 改包；不等价则冻结底层；**设计已修订** |
| R15 高 | 916 和新 store 都用 messageStore ID，同 Pinia A/B 得到同一实例；只限制两侧副作用并不足以隔离 | `store/useMessageStore916.ts:83`、`useMessageStore.ts:92` | §8.2：独立 Pinia/应用/持久化/注册表，或刷新后单实现；**设计已修订** |
| R16 中 | 文档清理顺序会先删归一依赖留下 916；整文件块注释会嵌套失效；按错误总量放行可掩盖新增诊断；未强调人工确认后另确认清理 | 原方案 §7、§12，与 916 import 闭包及 TS 注释规则对照 | §12：依赖闭包同批处理、有效注释方式、严格无新增、单独清理确认；**设计已修订** |

表中 `OpenlayersMap/*` 均位于 `src/baseComponent/`；`business/*` 位于 `src/controller/core/`，其余路径位于 `src/`。具体输入输出见主方案 §8、§12.6。

## 3. 关键核验样例

### 3.1 阶段语义不能只改数据源

| 输入 | 旧链准入 | 原方案风险 | 修订要求 |
|---|---|---|---|
| v=1、有效时间、auth=null、phase=popup | 六类均不放行 | 仅按 MapMode 放定位 | 先识别登出，MapMode 仍保存原始 popup |
| 合法 auth、inquiry、currentAlarm=null | 仅应答类满足该上下文 | 立案状态也被放行 | F2 必须等待有效 incidentId 上下文 |
| 合法 auth、inquiry、有效 incidentId | 立案状态/画像同步/地址更新 | 又放行应答 | 统一调派上下文，MapMode 仍为 inquiry |
| 合法 auth、inquiry、currentAlarm 缺省/空ID | 不作为上述两类上下文 | `?? null` 变成未立案问询 | 保留字段缺省语义 |
| phase=dispatch | 旧解析返回无效阶段 | 类型存在就视为可用阶段 | 不自动扩展规则 |

500ms 不是只保留最后一条消息的防抖。必须逐条排队，并依据最后一次完整共享输入重算稳定窗口。接收 revision 可避免对上游 updatedAt 唯一性的依赖；不能仅凭“watch 数组 getter”推断一定丢更新，本轮没有将其认定为已证实的 Vue 缺陷。

### 3.2 F10 多字段独立判断不等于并发执行

同一新 blob 包含 callLocation、dispatchVehicles、disasterSite、dispatchCommand，应识别所有有效字段，但模拟运行必须等其依赖的灾害图/算路完成。下一条只更新 command 而保留 disasterSite 时，灾害点不得再次清场渲染。

启动时只恢复定位及当前 flood。不能通过刷新重放瞬时指令来补跨页丢失，也不能只用一个模块 bool 记录全部 pending。退出 flood/卸载时，已经启动的异步工作也须失效，而不仅是停止 store watch。

### 3.3 F12 冻结限制

迁入 composables、保留通用收发隔离和同名接口，符合已确认方向。改变协议字段、ACK 清理时机、token 规则、RESULT 重试及其可靠性补偿属于后续专项。

本轮记录现有取消/重试缺陷，**不把它们标成迁移引入，也不宣称已经修复**。迁位验收与完整功能可靠性验收必须分开记录；主方案第 33 项保持冻结，整体清理不自动放行。

## 4. 达标门槛与未完成证据

| 门槛 | 必要证据 | 当前状态 |
|---|---|---|
| 功能无遗漏 | F1～F14、18 文件和旁支完整矩阵 | 文档已具备 |
| 方案无内部矛盾 | 唯一阶段表、生命周期、分层、恢复、顺序、差异清单 | 本轮修订；后续实现按批回写 |
| 代码与方案一致 | 真实改动与 protocol、runtime、各批 owner 对照 | 尚未实施/未验证 |
| 无新增类型问题 | 变更前后严格基线，诊断身份无新增 | 当前 191/191；不能替代未来变更后检查 |
| 无新增可观察副作用 | 归一、状态、请求、路由、绘制、清理六类回归 + 隔离 A/B | 迁移专项未执行 |
| 完整运行与双形态 | 相关 Vitest、E2E、build、build:lib | 当前只执行既有 4 文件/28 用例；其他未执行 |
| 人工确认 | 主方案 §12.6 的 36 项记录/确认人/日期 | 全部尚未验收；第 33 项冻结 |
| 清理授权 | 全功能人工确认后具体文件清单再次确认 | 未确认，不能清理 |

不能用既有基线问题下降、基础测试全绿、旧入口无人引用或新文件已创建，替代以上门槛。

## 5. 本轮验证记录

| 检查 | 实际结果 | 适用边界 |
|---|---|---|
| HEAD/工作区 | 核验开始为 `319fa445`，工作区干净 | 旧文档的“并发未提交改动”不是当前事实 |
| 严格类型基线 | `LINT_BASELINE_STRICT=1` + `pnpm lint:baseline`：191/191，无新增，退出 0 | 存量 191 项仍在；未声称零错误 |
| 基础回归 | `pnpm test tests/unit/matcher.spec.ts tests/unit/unwrap.spec.ts tests/unit/mapStartup.spec.ts tests/unit/publish.spec.ts`：4 文件、28 用例通过 | 未覆盖本次拟新增 runtime、门控、F10/F12 迁移 |
| 文档结构/链接/空白检查 | 随本轮文档修订完成后检查，结果见当日工作日志 | 不等同于业务联调 |
| 源码边界 | 本轮不新增、不修改、不删除 `src/**` | 后续 P1 另按批实施 |

更新入口：[主方案](Control走线迁移清单与替换方案.md)、[前端索引](_index.md)、[当前状态摘要](../../05-共享上下文/当前状态摘要.md)。本报告为核验依据，不是上线、迁移完成或清理授权记录。
