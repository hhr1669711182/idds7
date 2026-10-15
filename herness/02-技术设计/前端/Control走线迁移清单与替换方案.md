# 旧 Control 走线 → 拦截器/控制器走线 迁移清单与替换方案

## 1. 文档信息

- 关联迭代：待填写
- 作者 / 日期：hhr（AI 协助梳理）/ 2026-10-15
- 关联需求：`docs/source/07-协议事件清单.md`、`docs/source/协议层DTO Schema.tsd`、`src/interceptor/README.md`
- 性质：**技术调研 + 迁移方案**（方案阶段，**未改任何业务代码**）

---

## 2. 方案概述

### 2.1 背景（含重要修正：旧中枢是 `useMessageStore916.ts`）

> ⚠️ **修正声明**：本文早期版本把 `useMessageStore.ts`（317 行，拦截器版）当作旧中枢，这是**误判**。
> 经实测确认：**旧走线的真正中枢是 `src/store/useMessageStore916.ts`（391 行）**，
> 旧链路（F1~F14）在这条走线上**已完整实现并经过验证**。
> `src/store/useMessageStore.ts` 是**后建的拦截器版新中枢**，功能是 916 的**子集**，且缺少多个关键能力。

#### 两条走线的准确对照

| 维度 | **旧走线（已完善）** | **新走线（在建）** |
|------|-------------------|-------------------|
| **中枢** | `src/store/useMessageStore916.ts`（391 行） | `src/store/useMessageStore.ts`（317 行） |
| **引入时间** | `bfc47fce`（工具目录重构时已存在） | `00f1ecc8` 新增统一消息系统 |
| **归一方式** | `onMessage` 内**硬编码 5 段 if-return 链**：`normalizePositionFrames` → `normalizeCarLocationFrames` → `normalizeAlarmCallFrame` → `normalizeAlarmStateFrame` → `normalizeAddressUpdatedFrame` | `interceptorRegistry.run()` **注册式拦截器链**（`transforms/*.ts`），支持 priority + `stop` + `results[]` 二次分发 |
| **归一覆盖** | ✅ **5 类全覆盖**：来电定位 / 车辆 GPS / 来电应答 / 警情状态 / 画像地址 | ⚠️ **3 类**：alarm / alarmCall / carLocation（**缺 position、addressUpdated**） |
| **阶段门控** | ✅ `setIngressGate`（`916:103-105,190,422`，由 `Control/initMessage916.ts:41` 注入 `createMessageStageGate`） | ❌ **无该 API**（新 store 已移除；当前无消费方、**未报错**，但阶段门控能力也一并丢失**） |
| **BroadcastChannel** | ❌ 不支持（`bindBroadcastChannel` 缺失） | ✅ 支持（`bcClients` + `bindBroadcastChannel`） |
| **持久化** | `inbox`/`outbox`/`lastBySystem` → sessionStorage（`piniaSession`） | 同（结构一致，但部署层使用原生 `sessionStorage`） |
| **订阅分发** | `triggerSubscriptions` + `catch` 打日志（**不吞异常**） | `triggerSubscriptions` + `catch` 空吞（**静默失败**） |
| **组装文档标注** | `interceptor/README.md:244` 误标为「废案保留，不再被引用」 | 实际仅被 `Control/initMessage916.ts` 引用 |

#### 旧走线完整链路（已验证，作为迁移基准）

```
WS 帧 → useMessageStore916.onMessage (硬编码 5 段归一链)
        → ingest → [setIngressGate 阶段门控] → deliverIncoming
        → createEnvelope → recordInbox → triggerSubscriptions
        → Control/mapMessageHandlers.ts 业务 handler（6 个订阅）
        → useIncidentLocationStore / pendingCallLocation / pendingDispatchAlarm
        → dispatchMap.vue / DispatchT1 渲染

并行旁支：
  · Control/initMessage.ts          —— 连接 + localStorage 监听 + mock 桥 + 转发通道
  · Control/incidentLocationProfileSync.ts —— HTTP 画像补源
  · Control/mapRelayReader.ts       —— 地图屏实时转发（§8）
  · Control/gisPointChannel.ts      —— 二次定位 BroadcastChannel（§11.10）
  · Control/messageStageGate.ts     —— 阶段门控实现（喂给 setIngressGate）
```

#### 三个必须纠正的既有结论

| 原结论 | 修正后 |
|--------|--------|
| 「`useMessageStore916.ts` 是废案，可删除（约 357 行）」 | ❌ **错**。它是旧走线中枢，承载 5 段归一 + `setIngressGate`，是**迁移的行为基准**，**必须保留到 P2 人工调试通过** |
| 「`initMessage916.ts` 无人引用 = 废案」 | ⚠️ **半对**。文件本身当前无调用方，但它是**旧中枢的装配示例**，其 `initSend` 订阅报文清单（`buildPositionSubscription` / `ALARM_CALL_SUBSCRIPTION` / `ALARM_STATE_SUBSCRIPTION` / `CAR_LOCATION_SUBSCRIPTION` / `ADDRESS_UPDATED_SUBSCRIPTION`）是**现网可用配置**，不能直接删 |
| 「新走线 `interceptor` 已覆盖全部消息」 | ❌ **错**。缺 `position`（来电定位）与 `addressUpdated`（画像地址）两段归一 |

#### 新中枢相对 916 的能力缺口（迁移必须补齐）

| 缺口 | 916 有 | 新 store 无 | 影响 |
|------|-------|------------|------|
| **阶段门控** | `setIngressGate` + `ingest` 前置过滤 | 无 | 新走线无法按业务阶段过滤消息 |
| **来电定位归一** | `normalizePositionFrames` | 无（`transforms/dispatchers/locateCall.ts` 覆盖 SEAT，但 916 走的是独立 `POSITION` 订阅） | 来电定位可能丢失 |
| **画像地址归一** | `normalizeAddressUpdatedFrame` | 无（`transforms/incidentLocation.ts` 是 **0 字节空文件**） | 警情定位完全失效 |
| **订阅异常可观测** | `console.error` 打日志 | 空 `catch` | 静默失败，线上难排查 |
| **T1 事件兜底** | `payload.eventType ?? eventKey` 兜底 | 无 | T1 派发事件可能丢失 |

> ✅ **新中枢的独有优势**：`bindBroadcastChannel`（916 没有）——这是 F11 转发通道、F12 二次定位、mock 桥依赖的能力，**迁移时不能丢**。

### 2.2 目标

把旧 `Control/**` 的「接收 → 拦截清洗 → 转换 → 上图」全部改为：

```
WS / postMessage / BroadcastChannel
  → useMessageStore.ingest → interceptorRegistry.run（清洗归一）
  → dispatch(eventKey) → subscribe
  → InputController（唯一业务订阅总线）
  → BusinessController（业务 DTO 装配）
  → GenericController（图形指令）
  → 实际上图
```

同时覆盖**当前未走控制器**的显示逻辑（组件内 subscribe 直连 store / OL 实例的分支）。

### 2.3 范围

**含**：旧 `src/Control/**` 的协议/清洗/订阅职责；组件内绕过控制器的显示逻辑；**`useMessageStore916.ts` 旧中枢及其 5 段归一链（作为行为基准，§2.1 / §4.7）**；`interceptor-integration` / `messageInterceptors` 双实现。
**不含**：通用控制层 `core/generic/**` 内部实现；`src/plugins/mapPlugins`（库形态独立链路）；三维 `modelAssess` 场景；后端契约本身。

---

## 3. 功能迁移清单

### 3.1 按「业务功能」归类的迁移项

| # | 业务功能 | 旧入口 | 旧实现 | 当前实际消费方 | 迁移目标 | 优先级 |
|---|---------|--------|--------|--------------|---------|--------|
| F1 | **警情画像地址/经纬度变更**（点位上图 + 辖区重查 + 队站过滤 + 路径规划） | 旧中枢 `useMessageStore916.ts:314-323` 走 `Control/incidentLocationMessage.ts` 的 `normalizeAddressUpdatedFrame` | 归一 + 缓存 + 切警情清理完整可用（**行为基准**）；**新中枢缺此段归一**（`transforms/incidentLocation.ts` 为空文件） | + `Control/incidentLocationProfileSync.ts`（HTTP 补源）+ `Control/mapRelayReader.ts`（§8 转发通道）+ `Control/messageStageGate.ts`（阶段门控） | `useIncidentLocationStore.onAddressUpdated` → `dispatchMap.vue` 多个 watcher 直连图层 | **新建** `IncidentLocationController`（business 层）+ `AddressUpdatedData` DTO 进 `protocol/BusinessProtocol.ts`；订阅迁到 `InputController` | **P0**（缺口最大） |
| F2 | **警情状态变更 → 立案切页** | `initMessage.ts:54` | `Control/alarmMessage.ts`（`toDispatchAlarmProfile` / `normalizeAlarmStateFrame`）+ `mapMessageHandlers.ts:onIncidentStateChanged`（eventId 去重 + `openDispatch1`） | **无订阅方**（`interceptor/transforms/alarm.ts` 已归一但下游断链） | `AlarmController` 增加 `onIncidentStateChanged`，含 eventId 幂等 + 切页 | **P0** |
| F3 | **来电应答状态 → 问询/值守切页** | `initMessage.ts:54`（`ALARM_CALL_ANSWER_STATUS_CHANGED`） | `Control/alarmCallMessage.ts` + `mapMessageHandlers.ts:onCallAnswerStatusChanged` | **无订阅方**（`transforms/alarmCall.ts` 已归一但下游断链） | `CallController` 增加 `onCallAnswerStatusChanged`，切页逻辑迁入 | P1 |
| F4 | **来电粗定位**（circle + marker + 文本） | `initMessage.ts:51-52` | `Control/positionMessage.ts` → 现由 `interceptor/transforms/dispatchers/locateCall.ts` 归一 | 双重消费：`InputController:89` → `CallController.locateCall`；**同时** `dispatchMap.vue:2344-2346` 自行 subscribe 再调自己的 `CallController` | 收敛为**单实例** `CallController`（`InputController` 唯一订阅），删组件内订阅 | P1（**当前存在重复上图风险**） |
| F5 | **警情画像同步 → 精确上图** | `initMessage.ts:50` | `mapMessageHandlers.ts:onAlarmProfileSync` | `InputController:78` → `AlarmController.syncAlarmProfile`（已通）**但 `ALARM_PROFILE_SYNC` 全项目无生产者** | 保留控制器；补齐生产者或按契约移除该键 | P2 |
| F6 | **车辆 GPS 实时位置** | 旧中枢 `useMessageStore916.ts:267-282` 走 `Control/carLocationMessage.ts` 的 `normalizeCarLocationFrames` | 归一逻辑完整可用（**行为基准**）；新中枢有 `transforms/carLocation.ts` 但载荷口径与 DTO 声明不一致（§4.2） | `InputController:142` → `TrackingController.trackingVehicleGpsUpdate`（只做 layerToggle/Refresh）；**同时** `DispatchT1.vue:502-504` 自行 subscribe 真渲染 | **DTO 契约冲突（见 §4.2）**，必须先定 `TrackingVehicleGpsUpdateData` 口径再收口 | **P0（阻塞）** |
| F7 | **地址机器人 GIS 搜索** | — | `interceptor/transforms/dispatchers/addressRobot.ts` | `InputController:164` → `AddressRobotController`（已通） | 已迁移，纳入回归验证 | P3 |
| F8 | **阶段门控**（popup/inquiry/dispatch/dispatchTrack） | `initMessage916.ts:41` | `Control/messageStageGate.ts`（`msg.setIngressGate`） | **未启用**（新入口未调用 `setIngressGate`） | 移入拦截器链后段或 `InputController` 前的准入判定；保留 `seat-shared-state.phase` 判定语义 | P1 |
| F9 | **页面切换编排**（`openDispatch1` / `REQUEST` 条件） | `Control/pageCondition.ts` | `setPageCondition` / `navigateByCondition` / `initPageConditionListener` | `App.vue:13,32` 仍在用 `initPageConditionListener` | **保留**（路由编排职责不属于控制器）；但触发源从 handler 改为控制器 | P2 |
| F10 | **模拟来电定位桥** | `initMessage.ts`（旧入口内 `mockBridge`） | `Control/mockCallLocationBridge.ts`（`msg.ingest` 注入 `MAP_LOCATE_CALL` 等 mock 事件） | 新入口**未调用** `createMockCallLocationBridge`；`dispatchMap.vue:70` 仍在消费 `consumePendingSpecialMapRender` | 决定去留：若保留，迁到 `register/initMessage.ts` 并同样走拦截器/控制器 | P2 |
| F11 | **地图屏实时转发通道**（`ids-map-screen-relay`） | `initMessage.ts:59` | `Control/mapRelayReader.ts` | 新入口**未调用** → 功能事实上关闭（代码注释还留着「演示后开启」） | 与 F1 合并迁移（同一 DTO） | P1 |
| F12 | **GIS 二次定位选点通道**（`ids-gis-point-selection`）——**新业务，不可删除** | `initMessage.ts:64` | `Control/gisPointChannel.ts`（V1.0 协议 + 会话 token + ACK 重试） | 新入口**未调用** → 通道仅惰性创建，`incidentRelocate.ts:26,52,118,200,211` 仍在用 `getGisPointChannel()` 收发 + `onAck` | **拆两层迁 `src/composables/`**：①通用 BroadcastChannel 收发工具（复用 `hooks/useBroadcastChannel` 能力，新建 composable）②二次定位业务分发 composable（协议类型 + 会话 + ACK + 事件投递）。**协议 V2 文档未出，V1.0 逻辑暂不动，仅换归属** | P1（保留业务） |
| F13 | **HTTP 画像补源** | `initMessage.ts:58` | `Control/incidentLocationProfileSync.ts`（监听 `currentAlarm.incidentId` 变化拉画像） | 新入口**未调用** → F5 刷新恢复依赖失效 | 与 F1 合并 | P1 |
| F14 | **共享状态 / 凭证** | 全链路 | `Control/seatSharedState.ts` | **仍在用**：`register/initMessage.ts` 不依赖，但 `InputController.ts:9`、`vehicleManager.ts`、`dispatchMap.vue`、`service/alova.ts` 等大量 import | **保留**（工具层，非迁移对象）；但建议从 `Control/` 移到 `utils/`（见 §11.9） | P3 |

### 3.2 按文件维度的处置建议

| 文件 | 行数 | 处置 | 理由 |
|------|-----|------|------|
| `src/Control/initMessage916.ts` | 125 | **保留为装配基准**（§12.3 档 2） | 虽当前无调用方，但 `initSend` 订阅报文清单是**现网可用配置**（POSITION / ALARM_CALL / ALARM_STATE / CAR_LOCATION / ADDRESS_UPDATED 五类），新入口装配时以它为对照 |
| `src/store/useMessageStore916.ts` | 391 | **保留为迁移行为基准**（§12.3 档 2） | 5 段归一链 + `setIngressGate` 是 F1~F14 的对照实现，P2 通过后才删；`interceptor/README.md:244` 的「废案」标注**错误**，需回写修正 |
| `src/store/useMessageStore916.ts` | 391 | **保留为迁移基准**（§12.3 档 2） | ❌ **不是废案**：旧走线中枢，承载 5 段归一 + `setIngressGate`，是 F1~F14 行为对照的**唯一参考实现**；`interceptor/README.md:244` 的「废案」标注**错误**，需回写修正 |
| `src/store/interceptor-integration.ts` | 486 | **删除** | 双实现，无人 import（仅自引 `messageInterceptors`） |
| `src/store/messageInterceptors.ts` | 250 | **删除** | 同上 |
| `src/Control/mapMessageHandlers.ts` | 133 | **删除**（职责拆入控制器） | 切页归 F9，上图归控制器 |
| `src/Control/messageStageGate.ts` | 66 | **迁移** → `interceptor` 准入或 `InputController` | 语义保留，实现换层 |
| `src/Control/alarmMessage.ts` | 183 | **部分删**：`normalizeAlarmStateFrame` / `findAlarmCustomContent` 已由 `transforms/alarm.ts` 接管；`toDispatchAlarmProfile` / `getAlarmMessageSession` / `buildMessageWebSocketUrl` 需另找归属 | `buildMessageWebSocketUrl` 若 `register/initMessage.ts` 不用则删 |
| `src/Control/alarmCallMessage.ts` | 80 | **删除**（`transforms/alarmCall.ts` 已接管） | — |
| `src/Control/positionMessage.ts` | 92 | **删除**（`dispatchers/locateCall.ts` 已接管） | — |
| `src/Control/carLocationMessage.ts` | 125 | **保留类型 / 删解析**：`CarLocationBatch` 仍被 `vehicleManager.ts`、`DispatchT1.ts` 引用；`normalizeCarLocationFrames` 已由 `transforms/carLocation.ts` 接管 | 类型应迁到 `protocol/` |
| `src/Control/incidentLocationMessage.ts` | 401 | **核心迁移对象**（F1） | 解析 + 缓存 + DTO 三合一，需拆：解析→interceptor；缓存→store；DTO→protocol |
| `src/Control/incidentLocationProfileSync.ts` | 154 | **迁移**（F13）→ 归 F1 控制器 | — |
| `src/Control/mapRelayReader.ts` | 261 | **迁移**（F11）→ 归 F1 | — |
| `src/Control/gisPointChannel.ts` | 193 | **迁移保留**（F12）：拆「通用 BC 工具 + 二次定位业务分发」两层，均落 `src/composables/`；**不删**、协议 V1.0 逻辑不变 | 二次定位是新业务，通道需长期存在 |
| `src/Control/mockCallLocationBridge.ts` | 341 | **待决**（F10） | mock 通道，需产品确认是否保留 |
| `src/Control/seatSharedState.ts` | 129 | **保留**，建议移出 `Control/` | 工具层被广泛 import |
| `src/Control/pageCondition.ts` | 104 | **保留**（F9） | 路由编排，不属控制器 |
| `src/Control/dispatchVehicleAdapter.ts` | 126 | **保留**，建议移出 `Control/` | HTTP 适配，被 `service/methods/dispatchVehicles.ts` 引用 |
| `src/Control/Swiper.ts` / `Swiper.css` | 278 | **待决** | 与消息链路无关，需确认是否在用 |
| `src/interceptor/transforms/incidentLocation.ts` | **0（空文件）** | **补写**（F1） | 已建占位但内容为空、未注册，DISASTER_PROFILE 订阅缺失 |

---

## 4. 替换方案（关键设计决策）

### 4.1 目标链路（统一收口）

```
外部消息（WS / postMessage / BroadcastChannel）
  ↓ useMessageStore.ingest()                 [src/store/useMessageStore.ts:198] interceptorRegistry.run()
  ↓ interceptorRegistry.run()                [src/interceptor/registry.ts] 清洗归一 → NormalizedMessage[]
  ↓ dispatch(eventKey, data, meta)            生成 MessageEnvelope
  ↓ triggerSubscriptions()                    按 eventKey 通知
  ↓ InputController.initSubscriptions()       ★ 唯一业务订阅总线 [src/controller/core/io/InputController.ts]
  ↓ BusinessController.<method>(data)         业务 DTO 装配，不碰 OL/Three
  ↓ GenericController.view/geometry/spatial/kinematic  图形指令
  ↓ 实际上图（GeometryController / ViewController 等）
```

**唯一收口原则**：业务事件（`alarm.*` / `disaster_profile.*` / `map.locate.call` / `tracking.*` / `address_robot.*`）的 subscribe **只允许出现在 `InputController`**；组件层若需感知状态，经 store 读，不自行 subscribe 触发渲染。

### 4.2 阻塞项：F6 DTO 契约冲突（必须先决策）

三方对同一事件键 `TRACKING_VEHICLE_GPS_UPDATE` 的载荷定义**互不相同**：

| 来源 | 期望载荷 | 实际收到 |
|------|---------|---------|
| `interceptor/transforms/carLocation.ts:55` （生产者） | `{ datas: Point[] }` | ✅ 一致 |
| `controller/core/protocol/BusinessProtocol.ts:160` `TrackingVehicleGpsUpdateData` | `{ incidentId: string; layerId: string }` | ❌ **不匹配** |
| `baseComponent/OpenlayersMap/DispatchT1.vue:504` （真实渲染） | `CarLocationBatch = { datas: CarLocationPoint[] }` | ✅ 一致 |

**即 `TrackingController.trackingVehicleGpsUpdate()` 收到的 `data.layerId` 恒为 `undefined`**，`view.layerToggle({layerId: undefined})` 是无效调用——当前 GPS 走线「接通了但没干活」，真正的车点渲染全靠 `DispatchT1.vue` 自己 subscribe。

**方案**：把 `TrackingVehicleGpsUpdateData` 改为 `CarLocationBatch`（或让 `TrackingController` 接收 `{datas}` 并委托 `vehicleManager`/`DispatchT1` 渲染）。同时 `docs/source/07-协议事件清单.md` 与 `协议层DTO Schema.tsd` 需同步。

### 4.3 F1 警情定位迁移方案（最大项）

**现状数据流**（四入口汇一）：
```
WS DISASTER_PROFILE/UPDATED ─┐
HTTP 画像拉取（by-incident）─┤→ AddressUpdatedData ─→ mapMessageHandlers.onAddressUpdated
mapRelayReader（§8 转发）───┤   （addressCache.merge/replace → clearAll → store）
incidentRelocate（选点）─────┘
```

**目标拆解**：

| 职责 | 旧位置 | 新位置 |
|------|--------|--------|
| WS 帧 → `AddressUpdatedData` 归一 | `Control/incidentLocationMessage.ts` `normalizeAddressUpdatedFrame` | **`src/interceptor/transforms/incidentLocation.ts`**（补写空文件）+ `install.ts` 注册 `DISASTER_PROFILE` |
| HTTP 补源 → 同一 DTO | `Control/incidentLocationProfileSync.ts` | 保留文件，**回调改投递控制器**（不直接走 handler） |
| 转发通道 → 同一 DTO | `Control/mapRelayReader.ts` | 迁入 `register/initMessage.ts`，`parseAddressUpdatedContent` 归 interceptor |
| slotChanges 增量合并缓存 | `Control/incidentLocationMessage.ts` `createAddressUpdatedCache` | 迁 **`src/store/useIncidentLocationStore.ts`**（store 层职责） |
| 切警情 clearAll + 图上控制 | `mapMessageHandlers.ts` | **新建 `core/business/IncidentLocationController.ts`** |
| 点位/辖区/队站/路径渲染 | `dispatchMap.vue` watcher 直连 OL | 迁入 `IncidentLocationController` → `GenericController`（**工作量最大，需分批**） |

**新增 DTO**（进 `protocol/BusinessProtocol.ts`）：

```ts
export interface AddressUpdatedData {
  eventId?: string
  occurredAt?: string | null
  disasterProfileId?: string | null
  incidentId?: string | null
  inquiryId?: string | null
  version: number
  address: string | null
  longitude: number | null
  latitude: number | null
  primaryStationId: string | null
  slots: Record<string, string | null>
}
```

（`AddressUpdatedData` 现定义在 `Control/incidentLocationMessage.ts`，被 `useIncidentLocationStore.ts:18`、`incidentRelocate.ts:23` 引用——迁到 protocol 后需同步改 import。）

**订阅迁到 `InputController`**（新增）：

```ts
store.subscribe(MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED, (envelope) =>
  this.businessController.incidentLocation.onAddressUpdated(envelope))
```

### 4.4 F4 来电定位重复上图收敛

**当前问题**：`InputController:89-96`（`/map` 的 `CallController`）与 `dispatchMap.vue:2344-2346`（`/dispatch1` 另一实例）**各订阅一次 `MAP_LOCATE_CALL`**。虽然分属不同路由页，但 `InputController` 随 `map.vue` 挂载、`dispatchMap` 另建实例，**同一事件在两个页面共存时会双绘**。

**方案**：
1. 组件内 `dispatchMap.vue:2343-2351` 的 subscribe **删除**，改由 `InputController` 统一分发；
2. `dispatchMap.vue` 的 `callLocationController` 改为**接收 `InputController` 的实例**（依赖注入或单例导出），不再自行 `new GenericController`；
3. `pendingCallLocationStore.queue()` 的调用保留在 `InputController`（已有，`InputController.ts:90`）。

### 4.5 阶段门控（F8）与切页（F9）设计——单一数据源 `useUserStore().MapMode`

> 本小节已按用户新要求重写：阶段数据不再由各处各自监听 localStorage，**全系统统一走 `useUserStore().MapMode`**。详细收口设计见 §10.3，本节只定边界。

**事实基底（已实测）**：

| 事实 | 证据 | 影响 |
|------|------|------|
| `useUserStore.MapMode` 存在但**零消费方** | `rg "MapMode" src/` 仅命中定义处（`useUserStore.ts:69,84,97`）；`config/mapConfig.ts` 的同名 `MapMode` 是无关的 `dispatch \| oneMap`（2D/3D） | 阶段门控完全没有统一数据源 |
| `MapMode` **缺 `dispatchTrack`** | `useUserStore.ts:30` `MapPhase = 'loggedOut' \| 'onDuty' \| 'popup' \| 'inquiry' \| 'dispatch'`（**5 值**）。而 `seatSharedState.ts:70` `SharedMapStage` 是 **6 值**（多 `dispatchTrack`） | 调派跟踪阶段在 store 中**无法表达** |
| `MapMode` **是裸 phase，非投影值** | `useUserStore.ts:97` `store.MapMode = shared?.phase ?? 'onDuty'`，而 `parseSharedMapStage`（`seatSharedState.ts:73`）做了 4 层投影：`v!==1 → null`、`auth===null → loggedOut`、`inquiry + currentAlarm.incidentId非空 → 投影为 dispatch` | **同一份数据两种解读结果**：`inquiry` 阶段已立案时，门控看到 `inquiry`，而路由拦截/刷新恢复看到 `dispatch` |
| 阶段监听**分散在 5 处** | `messageStageGate.ts:52`、`seatSharedState.ts:131`(`whenDispatchTrack`)、`pageCondition.ts:90`、`incidentLocationMessage.ts:390`、`InputController.ts:116` | 同一阶段变化在 5 个地方解析/分发，语义已分叉（如 `pageCondition.ts:101` 多一行 `console.info`） |

**设计结论（不可能只把监听换成 watch）**：

把 5 处监听改成 `watch(() => useUserStore().MapMode)` **会引入行为回差**——原 `parseSharedMapStage` 的 `inquiry + incidentId → dispatch` 投影是**语义一部分**，不能丢。故采用下列两步步改造：

```
① 先建立真正的数据源（移入 store）
   useUserStore.MapMode = parseSharedMapStage(raw)  // 复用 seatSharedState 的投影逻辑，一份代码
   不再是 shared?.phase 裸值
② 再把依赖旧解读的地方改成消费 store
   5 处监听改读 useUserStore().MapMode（watch 或 storeToRefs 取值）
   parseSharedMapStage 在非 store 处保留一份（供不能用 Pinia 的场景）
```

**阶段门控 vs 切页的边界（不变）**：

| | 阶段门控（F8） | 切页编排（F9） |
|---|---|---|
| 语义 | 「消息只在其应属阶段被消费」（丢弃不匹配消息） | 「阶段变化引起页面跳转」 |
| 容器 | `Control/messageStageGate.ts`（现被 `initMessage.ts` 内联一份） | `Control/pageCondition.ts` |
| 所属 | **不是控制器职责**，是消息链路的准入策略 | **不是控制器职责**，是应用装配职责 |
| 设计落位 | 推荐移入 `interceptor` 链末端守卫（`registry.run` 后、`dispatch` 前）或 `InputController` 内包装一层准入；**不用 `setIngressGate` 全局钩子**（新 store 已无该 API） | 继续留在 `Control/pageCondition.ts`，仅把触发源从 `mapMessageHandlers` 改为读 `MapMode` |
| 数据源 | 两者统一读 `useUserStore().MapMode` | 同左 |

> **当前实现的异常一并按待修正**：`messageStageGate.ts:4` 的 `stages` 映射表内 `DISASTER_PROFILE_ADDRESS_UPDATED → 'dispatch'`，但平台写入时可能写 `inquiry`（未立案）。改用 store 后这个不匹配问题由 store 统一投影解决（§10.3.2），不再需在门控层补 `if` 。


### 4.6 不走控制器的显示逻辑（用户明确点名）——纳入清单

以下组件当前**绕过控制器**直连消息/OL 实例，需一并收口：

| 组件 | 绕过点 | 收口建议 |
|------|--------|-----------|
| `dispatchMap.vue` | `:2343` subscribe `MAP_LOCATE_CALL`；`:596/726/834` watcher 直绘点位/辖区/队站 | F1/F4 迁移后删除 |
| `DispatchT1.vue` / `DispatchT1.ts` | `:502` subscribe `TRACKING_VEHICLE_GPS_UPDATE` 直绘车点 | F6 定 DTO 后迁 `TrackingController` |
| `incidentRelocate.ts` | `:161` 自行构造 envelope 投递 | 改调控制器方法，不再自造信封 |
| `views/amap/AmapApiDemo.vue` | `:104` 直接读 `getSharedAccessToken` | 工具调用，不属迁移范围 |
| `incidentRelocate.ts`（二次定位） | `:26,52,118,200,211` 通过 `getGisPointChannel()` 直接收发 BC 并注册 `onAck` | 迁 `src/composables/useGisPointSelection.ts`（通用 BC 工具 + 业务分发两层，见 §11.10）；协议 V1.0 逻辑不变 |
| `Control/mapRelayReader.ts` / `mockCallLocationBridge.ts` | 各自 `ingest` 造事件 | 迁入 `register/initMessage.ts` + 拦截器 |

---

### 4.7 迁移核心：把 916 的 5 段归一链补进拦截器层（行为对齐）

> **这是本次迁移的技术内核**。目标不是「重新设计」，而是把**已验证可用的 916 归一逻辑**等价移植到拦截器层，做到**行为零变化**。

#### 4.7.1 916 的 5 段归一链（迁移源，按代码顺序）

| # | 归一器 | 源文件 | 产出 eventKey | 覆盖业务 |
|---|--------|--------|--------------|---------|
| 1 | `normalizePositionFrames` | `Control/positionMessage.ts` | `MAP_LOCATE_CALL` | F4 来电粗定位 |
| 2 | `normalizeCarLocationFrames` | `Control/carLocationMessage.ts` | `TRACKING_VEHICLE_GPS_UPDATE` | F6 车辆 GPS |
| 3 | `normalizeAlarmCallFrame` | `Control/alarmCallMessage.ts` | `ALARM_CALL_ANSWER_STATUS_CHANGED` | F3 来电应答 |
| 4 | `normalizeAlarmStateFrame` | `Control/alarmMessage.ts` | `ALARM_INCIDENT_STATE_CHANGED` | F2 立案状态 |
| 5 | `normalizeAddressUpdatedFrame` | `Control/incidentLocationMessage.ts` | `DISASTER_PROFILE_ADDRESS_UPDATED` | F1 画像地址 |
| — | 内联特判 | `useMessageStore916.ts:229-231` | `ADDRESS_ROBOT_GIS_SEARCH` | F7 地址机器人 |
| — | 兜底 | `useMessageStore916.ts:337-344` | `payload.eventType ?? eventKey` | T1 派发事件 |

> ⚠️ **顺序敏感**：916 是**硬编码 if-return 链**，前一段命中即 `return`，**后段不再执行**。移植时必须保持相同优先级，否则一条帧可能被多个归一器误命中。

#### 4.7.2 新拦截器层的补齐清单

| 拦截器文件 | 状态 | 移植源 | priority | 说明 |
|-----------|------|--------|----------|------|
| `transforms/incidentLocation.ts` | ❌ **0 字节空文件** | `normalizeAddressUpdatedFrame` | 200 | F1 缺失，**必须新建**（§4.3） |
| `transforms/seat.ts` → `dispatchers/locateCall.ts` | ✅ 已有 | `normalizePositionFrames` | 150 | ⚠️ 但 SEAT 路径与 916 的**独立 POSITION 订阅**不同，需确认两种来源都覆盖 |
| `transforms/carLocation.ts` | ✅ 已有 | `normalizeCarLocationFrames` | 200 | ⚠️ 载荷口径已变化，见 §4.2 |
| `transforms/alarmCall.ts` | ✅ 已有 | `normalizeAlarmCallFrame` | 200 | 基本等价 |
| `transforms/alarm.ts` | ✅ 已有 | `normalizeAlarmStateFrame` | 200 | ⚠️ 916 有 `findAlarmCustomContent` 深搜包装层，新版仅取 `customContent.data`，**需回归** |
| `dispatchers/addressRobot.ts` | ✅ 已有 | 916 内联特判 | 150 | 基本等价 |
| **T1 兜底** | ❌ 缺失 | `useMessageStore916.ts:337-344` | — | 建议加 `transforms/t1Fallback.ts`，priority 最低（300），`stop: false` |

#### 4.7.3 阶段门控回补（`setIngressGate` 缺失修复）

**问题**：新 store 无 `setIngressGate`（当前无消费方故**未报错**），但新走线**无任何阶段过滤**——阶段门控能力已随旧走线一起丢失，需在迁移时补回。

**方案（二选一，评审定）**：

| 方案 | 做法 | 优点 | 代价 |
|------|------|------|------|
| **A. 移植回 store**（推荐） | 把 916 的 `setIngressGate` + `ingest` 前置过滤（约 8 行）移植到 `useMessageStore.ts` | 行为与 916 **完全一致**；`Control/messageStageGate.ts` 可直接复用 | store 承担「业务阶段」职责，略有分层污染 |
| B. 移入 `InputController` | 在 `InputController` 的每个订阅回调外层包准入判断 | 分层更干净 | 需在 40+ 订阅点重复写准入逻辑，易漏 |

> **建议 A**：阶段门控是**消息准入**而非数据归一，放在 `ingest` 入口最贴近 916 语义，且改动面最小（8 行）。

#### 4.7.4 订阅异常可观测性回补

916 的 `triggerSubscriptions` 会 `console.error` 打日志（`916:198-201`），新 store 是空 `catch`（静默失败）。迁移时应回补日志：

```ts
// src/store/useMessageStore.ts — triggerSubscriptions
list.forEach(sub => {
  if (!sub.system || sub.system === system) {
    try {
      sub.callback(envelope)
    } catch (error) {
      console.error('[message-handler] 业务消息处理失败', { eventKey, error })
    }
  }
})
```

> 理由：空 `catch` 会让「订阅抛异常」完全不可见，线上排障成本极高。这是有明确收益的最小改动。

#### 4.7.5 新中枢独有能力的保留

| 能力 | 说明 | 迁移时注意 |
|------|------|-----------|
| `bindBroadcastChannel` / `bcClients` | 916 **没有**；F11 转发通道 / F12 二次定位 / mock 桥依赖 | ✅ 新中枢保留，**不可回退到 916** |
| `installDefaultInterceptors()` 懒加载 | `ingest` 首次调用自动装配 | ✅ 保留 |
| `dispatch()` 多结果分发 | SEAT 泛订阅扇出 | ✅ 保留 |

#### 4.7.6 归一链行为对齐验证（迁移后必做）

| # | 用例 | 期望 |
|---|------|------|
| 1 | 一帧含 `slotChanges` 且带 `ALARM_INCIDENT` topics | **只**产出 `ALARM_INCIDENT_STATE_CHANGED`，不误命中 addressUpdated |
| 2 | 一帧含 `datas` 数组（GPS） | 只产出 `TRACKING_VEHICLE_GPS_UPDATE`，且 `datas` 完整 |
| 3 | 一帧含 `taskType: 'weizhiwang'`（SEAT 来电定位） | 只产出 `MAP_LOCATE_CALL` |
| 4 | 一帧含 `notifyType: ADDRESSBOT` | 只产出 `ADDRESS_ROBOT_GIS_SEARCH` |
| 5 | 跨阶段消息（如 `dispatchTrack` 阶段收 `ALARM_INCIDENT_STATE_CHANGED`） | 被 `setIngressGate` 拦截，不投递给订阅方 |
| 6 | `payload.eventType` 的 T1 事件 | 经 T1 兜底归一为对应 eventKey |
| 7 | 同一帧重复推送（eventId 相同） | 下游幂等去重生效，不重复上图 |

## 5. 涉及文件清单（按迁移项）

### 新增
- `src/controller/core/business/IncidentLocationController.ts` — F1 业务编排
- `src/controller/core/business/index.ts` — 聚合新增控制器
- `src/interceptor/transforms/incidentLocation.ts` — **补写**（现为空文件）

### 修改
- `src/controller/core/io/InputController.ts` — 新增 F1/F2/F3/F4 订阅
- `src/controller/core/business/AlarmController.ts` — 加 `onIncidentStateChanged`（F2）
- `src/controller/core/business/CallController.ts` — 加 `onCallAnswerStatusChanged`（F3）
- `src/controller/core/business/TrackingController.ts` — 修 DTO 冲突（F6，§4.2）
- `src/controller/core/protocol/BusinessProtocol.ts` — 加 `AddressUpdatedData`、修 `TrackingVehicleGpsUpdateData`（F1/F6）
- `src/interceptor/install.ts` — 注册 `incidentLocationInterceptor`（F1）
- `src/interceptor/transforms/seat.ts` — 若新增 seat dispatcher（F1 兜底）
- `src/interceptor/transforms/t1Fallback.ts` — **新增**：T1 `payload.eventType` 兜底归一（移植 916 逻辑，§4.7.2）
- `src/store/useMessageStore.ts` — 回补 `setIngressGate`（约 8 行，§4.7.3）+ 订阅异常 `console.error` 日志（§4.7.4）
- `src/register/initMessage.ts` — 启用阶段门控 + 迁入 mapRelayReader/profileSync/（决定 mockBridge）+ 装配 `createGisPointSelection()`（F8/F10/F11/F12/F13）
- `src/store/useIncidentLocationStore.ts` — 接收迁入的 slotChanges 缓存（F1）
- `src/baseComponent/OpenlayersMap/dispatchMap.vue` — 删组件内订阅（F1/F4）
- `src/baseComponent/OpenlayersMap/DispatchT1.vue` / `DispatchT1.ts` — 删组件内订阅（F6）
- `src/baseComponent/OpenlayersMap/incidentRelocate.ts` — 改调控制器（F1/F12）
- `src/controller/core/io/InputController.ts:9`、`vehicleManager.ts:16` 等 — `CarLocationBatch` 类型 import 改到 protocol（F6）
- `docs/source/07-协议事件清单.md`、`docs/source/协议层DTO Schema.tsd` — 同步 F1/F6 DTO 变更

### 删除（**仅在 P2 人工调试全部通过后**，§12.1）
- `src/store/interceptor-integration.ts`、`src/store/messageInterceptors.ts`（无引用的双实现）
- `src/Control/initMessage.ts`（入口已断，0 消费者）
- `src/Control/initMessage916.ts`（装配基准，确认后删）
- `src/store/useMessageStore916.ts`（**旧中枢基准，最后删除**）
- `src/Control/mapMessageHandlers.ts`
- `src/Control/alarmCallMessage.ts`、`src/Control/positionMessage.ts`
- `src/Control/messageStageGate.ts`（迁走后）
- 其余 `Control/**` 按 §3.2 逐项处置

---

## 6. 风险与兜底

| 风险 | 影响 | 兜底 |
|------|------|------|
| **F6 DTO 冲突未先定** | 车点渲染回归失败 | 迁移前先改 `TrackingVehicleGpsUpdateData` 并同步契约文档 |
| **`dispatchMap.vue`（2400+ 行）渲染 watcher 众多** | F1 迁移工作量极大，易引入多点/辖区残留 | 分 3 批：点位→辖区→队站/路径；每批保留 store 渲染兜底开关 |
| **阶段门控位置变更** | 消息被误消费或漏消费 | 先以「拦截器末端守卫」实现，与旧 `setIngressGate` 行为逐条比对 |
| **`CallController` 单例化** | 来电定位丢失或多绘 | 双实例→单实例过渡期保留组件内兜底，灰度后删 |
| **`ALARM_PROFILE_SYNC` 无生产者** | 该键实际无效 | 补生产者或按契约移除，避免长期僵尸键 |
| **类型门禁基线 191 报错（实测）** | 难判断新增 | 改动前后各跑 `pnpm lint:baseline` 对比，只对自己新增负责 |
| **`Control/seatSharedState` 被广泛 import** | 移动文件引发大范围改动 | 迁 F1/F6 时最后再考虑移出 `Control/`，与业务迁移解耦 |

---

## 7. 建议实施顺序（对齐 916 行为基准）

> 完整四阶段纪律见 **§12.1**。本节是 §12.1「P1 代码迁移」阶段**内部**的技术排序。
> 排序原则：**先补齐新中枢缺失能力（对齐 916），再迁业务 handler，最后才动旧文件**。

### 7.1 P1 阶段（代码迁移，`Control/` 原样不动）

| 步 | 动作 | 对齐 916 的哪个能力 | 出口判据 |
|----|------|------------------|---------|
| **M1** | 回补 `setIngressGate` 到 `useMessageStore.ts`（约 8 行）+ 订阅异常 `console.error` | `916:103-105,190` + `916:198-201` | 阶段过滤生效（对照 §12.6 第 14 项）；新 store 与 916 的 API 算法一致 |
| **M2** | 新建 `transforms/incidentLocation.ts`（F1 归一）+ `install.ts` 注册 | `916:314-323` 的 `normalizeAddressUpdatedFrame` | 画像地址消息可归一（当前为空文件，**完全缺失**） |
| **M3** | 定 `TrackingVehicleGpsUpdateData` 口径（§4.2） | `916:267-282` 的 `normalizeCarLocationFrames` | 载荷与生产者一致，`layerId` 不再是 `undefined` |
| **M4** | 新建 `transforms/t1Fallback.ts`（T1 兜底） | `916:337-344` 的 `payload.eventType` 兜底 | T1 事件可归一 |
| **M5** | 新建 `IncidentLocationController` + `InputController` 订阅 F1 | `mapMessageHandlers.ts:onAddressUpdated` | 警情定位经控制器链路通 |
| **M6** | `AlarmController.onIncidentStateChanged` + `CallController.onCallAnswerStatusChanged` | `mapMessageHandlers.ts` F2/F3 两个 handler | 立案切页、来电应答切页通 |
| **M7** | F4 来电定位单例化（删 `dispatchMap.vue` 内订阅） | `CallController.locateCall` | 一通来电仅一个粗定位圈 |
| **M8** | F6 车点渲染收口到 `TrackingController` + `vehicleManager` | `DispatchT1.vue` 自绘逻辑 | 控制器承担渲染 |
| **M9** | F8 阶段门控接入 `InputController`（M1 已回补 store 门控，此处接业务门控实现） | `messageStageGate.ts` | 各阶段消息按序消费 |
| **M10** | F11/F12/F13 启用（转发通道、二次定位 composable、HTTP 补源） | `mapRelayReader` / `gisPointChannel` / `incidentLocationProfileSync` | 三个旁支归位 |
| **M0**（**新增·最前**） | P0-0：在 `main.ts`（`app.use(router)` 之前）调用 `initUserStore()` | —（916 无此依赖） | ① `session`/`seatNumber` 已填 → WS 真正建立；② 路由拦截能读到 `MapMode` |
| **M0b**（**新增**） | 修正 `MapMode` 语义：补 `dispatchTrack` + 改用 `parseSharedMapStage` 投影 + 补 `currentAlarm`/`mode`/`rawState` 字段 | `916` 阶段门控依赖的投影逻辑 | §10.3.3 三项修正全部落地；阶段值与 `SharedMapStage` 完全对齐 |
| **M0c**（**新增**） | 6 处 storage 监听 → `watch(MapMode)`（L4/L5/L6/L7/L8/L9/L10，见 §10.3.5） | §4.5 边界定义 | 全项目 `rg "addEventListener\('storage'" src/` 仅剩 `initUserStore.ts` 一处（正交 `utils/storage.ts` 除外） |
| **M12** | F1 渲染收口：`dispatchMap.vue` 点位 → 辖区 → 队站/路径 分 3 批 | `dispatchMap.vue` 20+ watcher | 组件内直连 OL 全部消除 |

### 7.2 P2 阶段（人工调试，§12.6 的 19 项）

新旧**双跑对照**：旧 916 链路保持在线，新链路同时订阅同一批消息，逐项比对输出。

### 7.3 P3 阶段（清理，按 §12.3 档位执行）

| 顺序 | 文件 | 档位 | 前置条件 |
|------|------|-----|---------|
| 1 | `interceptor-integration.ts` / `messageInterceptors.ts` | 档 1 全注释 | 无引用，可立即 |
| 2 | `mapMessageHandlers.ts` | 档 1 全注释 | M5~M7 完成 + 调试通过 |
| 3 | `positionMessage.ts` / `alarmMessage.ts` / `alarmCallMessage.ts` / `carLocationMessage.ts` | 档 1/档 2 | 对应拦截器已验证 |
| 4 | `incidentLocationMessage.ts` | 档 2 | M2 + M5 完成 |
| 5 | `messageStageGate.ts` / `mapRelayReader.ts` / `incidentLocationProfileSync.ts` | 档 1 | M9/M10 完成 |
| 6 | `mockCallLocationBridge.ts` / `pageCondition.ts` | 档 2 | F9/F10 定论 |
| 7 | `initMessage.ts` | 档 1 | 入口已断，0 消费者 |
| 8 | `initMessage916.ts` | 档 2 → 档 4 删除 | 装配已对齐 916 |
| 9 | **`useMessageStore916.ts`** | 档 2 → **档 4 最后删除** | **全部 19 项调试通过** |

---
## 8. 验证方式

| 项 | 方式 |
|----|------|
| 类型门禁 | `pnpm lint:baseline` 改动前后对比，无新增（当前基线 **191**，实测） |
| 拦截器归一 | Vitest 单测：给 `interceptor/transforms/incidentLocation.ts` 补样例帧 → 断言 `AddressUpdatedData` 字段 |
| 车点回归 | F6 改动后手动验证：GPS 推送 → `DispatchT1` 车点移动正常 |
| 来电定位 | F4 后验证：一通来电仅一个粗定位圈；连续 `POSITION_SYNC` 不重复定位视图 |
| 警情定位 | F1 后验证：切警情 → 旧点位/辖区/队站/路径全清；`slotChanges` 增量合并正确 |
| 阶段门控 | 各阶段（popup/inquiry/dispatch/dispatchTrack）消息按时序消费，跨阶段消息被忽略 |
| **人工调试确认** | **§12.6 的 19 项清单，逐条打勾后方可进入清理阶段** |

---
## 9. 关键事实引用（代码真相源）

| 事实 | 位置 |
|------|------|
| App 引导新入口 `register/initMessage.ts` | `src/App.vue:12,31` |
| 新入口只连 WS/postMessage/BC + 发订阅，无业务 subscribe | `src/register/initMessage.ts:52-54` |
| 旧入口未被引用（handler 注册断链） | `src/Control/initMessage.ts:50-56`；全项目无 import |
| 控制器栈只在 `/map` 挂载 | `src/baseComponent/OpenlayersMap/map.vue:300-302,426` |
| `/dispatch1` 另建控制器实例 | `src/baseComponent/OpenlayersMap/dispatchMap.vue:2029-2030` |
| 拦截器 `incidentLocation.ts` 为空且未注册 | 文件 0 字节；`install.ts` 无对应注册 |
| GPS DTO 契约冲突 | `transforms/carLocation.ts:55` vs `BusinessProtocol.ts:160` vs `DispatchT1.vue:504` |
| **旧中枢是 916 而非新 store** | `useMessageStore916.ts` 391 行，5 段硬编码归一链 + `setIngressGate`；新 `useMessageStore.ts` 317 行仅 3 类拦截器 |
| **916 归一链 5 段覆盖** | `916:247` position / `:267` carLocation / `:285` alarmCall / `:303` alarmState / `:314` addressUpdated |
| **新中枢缺 2 段归一** | 无 `normalizePositionFrames` 等价物；`transforms/incidentLocation.ts` 为 0 字节空文件 |
| **`setIngressGate` 已从新 store 移除** | 阶段门控能力丢失（无消费方、暂无报错）；仅 916 仍存在该 API |
| **新中枢独有 `bindBroadcastChannel`** | 916 无；F11/F12/mock 桥依赖此能力 |
| 废案双实现无引用 | `store/interceptor-integration.ts`、`store/messageInterceptors.ts` 无 import（**不含 916**） |
| 阶段门控未启用 | `msg.setIngressGate` 仅在 `Control/initMessage.ts`（断链入口） |

---

## 10. localStorage 监听的收口设计（本轮补充）

> 目标：把旧 `src/Control/**` 中散落的 `window.addEventListener('storage')` 统一收口到 `useUserStore`，由 store 集中读取 + 分发；mock 补丁通道因属「注入型演示数据」而非真实会话状态，**独立成文件**，不混入 `useUserStore`。

### 10.1 现状盘点：全项目 10 处 storage 监听（业务相关 9 + 正交工具 1）

| # | 位置 | 监听键 | 语义 | 是否该进 useUserStore |
|---|------|--------|------|-------------------|
| L1 | `store/useUserStore.ts:155` | 5 个键（`seat-shared-state` / `seat-auth-session` / `seat-store` / `seat_id` / `seat_ip`） | **集中式分发器** | ✅ 已是目标形态 |
| L2 | `Control/initMessage.ts:216` | `seat-shared-state` + `seat-shared-state-mock` | WS 连接重建 + 特灾模式切页 + mock 桥分发 | ❌ 入口已断；mock 部分→独立文件 |
| L3 | `Control/initMessage916.ts:120` | `seat-shared-state` | **旧装配基准的** WS 重连 | ⚠️ 档 2 保留为装配基准；其 WS 重连逻辑比 `initMessage.ts` 完整（§12.3） |
| L4 | `Control/messageStageGate.ts:52` | `seat-shared-state` | 阶段门控稳定窗口重置 | ✅ 改 `watch(MapMode)`，窗口逻辑见 §10.3.7 |
| L5 | `Control/seatSharedState.ts:131`（`whenDispatchTrack`） | `seat-shared-state` | 等 `dispatchTrack` 阶段触发一次回调 | ✅ 改 `watch(MapMode)`，见 §10.3.5 |
| L6 | `Control/pageCondition.ts:115`（`initPageConditionListener`） | `seat-shared-state` + `ids-gis:page-condition` | phase 变化 → 切页编排 | ✅ 前半改 `watch(MapMode)`；后半自有键保留，见 §10.3.5 |
| L7 | `Control/incidentLocationProfileSync.ts:161` | `seat-shared-state` | 监听 `currentAlarm.incidentId` 变化拉画像 | ✅ 改 `watch(currentAlarm?.incidentId)`，见 §10.3.4 |
| L8 | `Control/incidentLocationMessage.ts:390` | `seat-shared-state` | slotChanges 缓存按阶段清空 | ✅ 改 `watch(MapMode)`，见 §10.3.5 |
| L9 | `controller/core/io/InputController.ts:126` | `seat-shared-state` | 回值守清来电粗定位 | ✅ 改 `watch(MapMode)`，见 §10.3.5 / §10.3.7 |
| L10 | `utils/storage.ts:181`（`subscribe`） | 命名空间化 key（`app:*`） | 通用跨标签页订阅工具 | ✅ 保留（与本议题正交） |
| **L11**（新增） | `router/index.ts:155,168` | `seat-shared-state`（**直读而非听**） | 刷新恢复拦截 | ✅ 改读 `useUserStore().MapMode`，见 §10.3.5 |

### 10.2 阻塞级发现：`initUserStore` 从未被调用

`initUserStore()`（`src/store/useUserStore.ts:141`）已实现完整的「按 key 分发 + 初始读取 + dispose」，但**全项目无任何调用点**：

```
rg "initUserStore\(" src  →  只有定义，无调用
```

后果：
1. `useUserStore` 的 `session` / `accessToken` / `seatNumber` / `MapMode` 等字段**永远不会被 storage 事件填充**；
2. `src/register/initMessage.ts:38-45` 的 WS 连接 `watch(() => [userStore.userId, userStore.sessionId])` 因两个值恒为 `null`，**WS 实际上永远不会连接**；
3. `register/initMessage.ts:67` 的 `SEAT()` 订阅（`const.message.type.ts:45` 内调用 `useUserStore().seatNumber`）取到的 `key` 恒为 `undefined`。

> ⚠️ 这意味着**当前新走线的 WS 连接链路本身是断的**。这是比 §4.2 的 GPS DTO 冲突更上游的阻塞项，应列为 **P0-0**。

**此处必须一并解决的时序问题（本轮新增）**：

| 依赖 | 为什么 | 要求 |
|------|----------|------|
| `router.beforeEach` 首次导航 | 路由守卫在 `app.use(router)` 之后立即执行，早于 `App.vue` 的 `onBeforeMount` | `initUserStore()` 必须在 **`main.ts`** 中、`app.use(router)` **之前**调用 |
| 阶段 watch 注册时机 | 首次赋值不惠漏 | `initUserStore` 内部已有同步遍历读取，放到 `main.ts` 即可满足 |

→ 对应实施步骤为 **M0**（§7.1），必须先于 M1（阶段门控回补）实施。

### 10.3 `MapMode` 单一数据源收口设计（本轮按用户要求重写）

> 目标：**阶段数据全系统只有一个入口**——`initUserStore()` → `useUserStore.MapMode`；所有消费方（门控 / 切页 / 缓存清理 / 路由拦截 / 回值守）只读 store，**不再各自监听 localStorage**。

#### 10.3.1 现状事实（实测）

| 事实 | 证据 | 影响 |
|------|------|------|
| `MapMode` 存在但**零消费方** | `rg "MapMode" src/` 仅命中定义处（`useUserStore.ts:69,84,97`）；`config/mapConfig.ts` 的同名 `MapMode` 是无关的 `dispatch \| oneMap`（2D/3D） | 阶段数据当前**没有**统一数据源，各处各自监听 |
| `MapMode` **缺 `dispatchTrack`** | `useUserStore.ts:30` `MapPhase` 为 5 值；`seatSharedState.ts:70` `SharedMapStage` 为 6 值（多 `dispatchTrack`） | 调派跟踪阶段在 store 中无法表达 |
| `MapMode` 是**裸 phase、非投影值** | `useUserStore.ts:97` `store.MapMode = shared?.phase ?? 'onDuty'`；而 `parseSharedMapStage`（`seatSharedState.ts:73`）做了 4 层投影：`v!==1 → null`、`auth===null → loggedOut`、`inquiry + currentAlarm.incidentId 非空 → 投影为 dispatch` | **同一份数据两种解读**：已立案的 `inquiry` 阶段，门控若改读裸 `phase` 会看到 `inquiry` 而非 `dispatch` |
| 阶段监听**分散在 5 处** | `messageStageGate.ts:45-52`、`seatSharedState.ts:111-131`（`whenDispatchTrack`）、`pageCondition.ts:90-113`、`incidentLocationMessage.ts:373,420`、`InputController.ts:101,116-129`、`router/index.ts:155,168` | 同一阶段变化在多处解析/分发，语义已分叉（如 `pageCondition.ts:101` 多一行 `console.info`） |

#### 10.3.2 数据流

```
受理席 ids-seat-web 写入 localStorage['seat-shared-state']
        ↓ 唯一监听点
initUserStore()  ──→ applySharedState(raw)
                     ├─→ useUserStore.MapMode        = parseSharedMapStage(raw) ?? 'onDuty'   ← 本次改造核心
                     ├─→ useUserStore.currentAlarm?.incidentId
                     ├─→ useUserStore.mode           （flood 特灾）
                     ├─→ useUserStore.rawState       （整份 blob）
                     └─→ session / currentUser / seatNumber（不变）
        ↓ 只读消费（无一处再监听 localStorage）
   InputController         watch(() => MapMode)    回值守清来电粗定位
   messageStageGate        watch(() => MapMode)    消息准入门控
   pageCondition           watch(() => MapMode)    阶段 → 切页
   incidentLocationCache   watch(() => MapMode)    slotChanges 按阶段清空
   router.beforeEach       读 MapMode              刷新恢复拦截
   DispatchT1 / whenDispatchTrack   watch(() => MapMode)   调派跟踪
```

#### 10.3.3 `MapMode` 语义修正（P0 前置，不先做这步则改造不成立）

| 问题 | 现状 | 修正方式 |
|------|------|----------|
| **缺 `dispatchTrack`** | `MapPhase` 5 值（`useUserStore.ts:30`），`SharedMapStage` 6 值（`seatSharedState.ts:70`） | `MapPhase` 补入 `'dispatchTrack'`，与 `SharedMapStage` 对齐；两类型合并为**单一类型定义**（见 §10.3.6） |
| **裸 phase 非投影** | 取 `shared.phase` 原值 | 改用 `parseSharedMapStage(raw)`，**复用现有投影逻辑一份代码**，不另写一份 |
| **无效值误判** | `?? 'onDuty'` 把非法 blob 也当成 onDuty | 保留安全回退但明确语义：非法 → `'onDuty'`（按"无有效阶段=值守"处理，与旧 `parseSharedMapStage → null` 后的兜底一致） |

```ts
// 修正后的 applySharedState（结构示意）
const applySharedState = (raw: string | null) => {
  const store = useUserStore()
  store.MapMode = parseSharedMapStage(raw) ?? 'onDuty'   // 不再是 shared?.phase
  store.currentAlarm = tryJson<SharedState>(raw)?.currentAlarm ?? null
  store.mode = tryJson<SharedState>(raw)?.mode ?? null
  store.rawState = tryJson<SharedState>(raw)
  // session / currentUser / seatNumber 逻辑不变
}
```

#### 10.3.4 store 字段扩展

| 字段 | 类型 | 来源 | 供哪个消费方用 |
|------|------|------|---------------|
| `MapMode` | `MapPhase`（6 值，§10.3.6） | `parseSharedMapStage(raw) ?? 'onDuty'` | 全部门控 / 切页 / 清理 |
| `currentAlarm` | `{ incidentId?: string } \| null` | `shared.currentAlarm` | `incidentLocationProfileSync` 画像补源、`pageCondition` 判定是否已立案 |
| `mode` | `string \| null` | `shared.mode`（特灾 `flood`） | 路由守卫特灾分支、mock 桥分流 |
| `rawState` | `SharedState \| null` | `tryJson(raw)` 原对象 | 读 `auth.Tenantid` / `X-Trace-Id` 等非响应式字段，避免再读 localStorage |

> `rawState` 是本次收口的关键：`seatSharedState.ts` 的 `getSharedAccessToken` / `getSharedTenantId` / `applySharedAuthTraceHeaders` 都是**每次直接读 localStorage**，有 7 处调用方（`service/alova.ts` 等）。收口后应改读 `useUserStore().rawState`，否则每个 HTTP 请求前重新 parse，且与阶段数据不同步。

#### 10.3.5 消费方改造清单（6 处监听 → watch）

| # | 现状位置 | 目标改造 | 注意 |
|---|----------|----------|------|
| **L4** | `Control/messageStageGate.ts:45-52`（`onStorage`） | `observe()` 改读 `useUserStore().MapMode`；候选队列与 500ms 稳定窗口保留 | 稳定窗口需改为"监听 `MapMode` 变化时重置时间戳"，见 §4.5 |
| **L5** | `Control/seatSharedState.ts:111-131`（`whenDispatchTrack`） | 改为基于 `watch(() => useUserStore().MapMode)` 的一次性触发；当前已是 `dispatchTrack` 时仍**立即执行**（保留原语义） | 返回 stop handle；发起方 `DispatchT1.vue:507` 需改为组件内 `watch` |
| **L6** | `Control/pageCondition.ts:90-113` | `seat-shared-state` 分支改 `watch(() => useUserStore().MapMode)`；`ids-gis:page-condition` 保留监听（自有键，非 seat 写入） | `mode=flood` 防护改为同时读 `MapMode` 与 `mode` 两个字段 |
| **L7** | `Control/incidentLocationProfileSync.ts:161` | 监听 `seat-shared-state` 改为 `watch(() => useUserStore().currentAlarm?.incidentId)` | 这是 `currentAlarm` 而非 `MapMode`；语义不变，仅换数据源 |
| **L8** | `Control/incidentLocationMessage.ts:373,420` | 监听改 `watch(() => useUserStore().MapMode)`；队列内部 `read()` 校验仍保留（`stage` 重算） | 该处有"监听变化 + 内部重算"两个逻辑，改造时分开处理 |
| **L9** | `controller/core/io/InputController.ts:101,116-129` | 初始 `initialStage` 直接读 `useUserStore().MapMode`；`onSharedStageStorage` 整体移除改 `watch` | 该文件存在未使用的反向 import（`TS6192`，§12.5 死锁），本次统一影响应叠加 |
| **L10** | `router/index.ts:155,168` | 直接读 `useUserStore().MapMode` 替代 `parseSharedMapStage(localStorage.getItem(...))` | 路由守卫在首次导航前执行，需确认 `initUserStore()` 已启动（见下方时序说明） |
| **保留** | `utils/storage.ts:181` | 正交工具，不动 | — |

> **无法回避的时序问题**：`router.beforeEach` 在首次导航前运行，而 `initUserStore()` 若放在 `App.vue` 的 `onBeforeMount` 调用，晚于路由守卫。因此 P0-0（启用 `initUserStore`）**不能只加一行到 `App.vue`**，应放在 `main.ts`（早于 `app.use(router)`），并保证 `initUserStore` 内部先同步读一次 `localStorage`（现有实现已在注册时遍历读取，改位置即可满足）。

#### 10.3.6 类型定义收口（避免两份漂移）

当前存在两份互不引用且**不一致**的阶段类型：

```
useUserStore.ts:30      MapPhase      = 'loggedOut' | 'onDuty' | 'popup' | 'inquiry' | 'dispatch'        （5 值）
seatSharedState.ts:70   SharedMapStage = 上述 + 'dispatchTrack'                                                                （6 值）
```

| 方案 | 做法 | 优点 | 代价 |
|------|------|------|------|
| **① 推荐** | 阶段类型唯一定义放 `useUserStore.ts`（或新建 `src/types/mapPhase.ts`），`seatSharedState.ts` 反向 import 后删除自己的定义 | 阶段定义唯一 | `Control/` 依赖 `store/`（上层依赖下层），但 S13 后 `Control/` 整体消解，该依赖自然消失 |
| ② | 定义留在 `seatSharedState.ts`，`useUserStore` import 它 | 无依赖方向问题 | 阶段定义继续留在待消解的 `Control/`，与 §11 冲突 |
| ③ | 两者都从 `const/` 引入第三方模块 | 无依赖 | 多一个落点，不推荐 |

#### 10.3.7 稳定窗口与回值守的交叉分析（必读）

现有阶段门控有两个特征，改 watch 后**不能丢**：

1. **500ms 稳定窗口**：收到消息后至少等 500ms，且阶段变化每次都重算稳定窗口。目的：阶段上下文与消息制会分步写入（多个 storage 事件分开到达，不能命中单一时刻）
2. **回值守过渡语义**：原实现是「任意时刻读到 `onDuty` 就清」，而 `watch` 的 `immediate: true` 会在首次注册时以 `onDuty` 触发一次（此时尚未图面上图，清除无意义但可能清掉 F5 恢复的快照）

对应的新实现（示意）：

```ts
watch(() => useUserStore().MapMode, (next, prev) => {
  changedAt = Date.now()                                  // 每次阶段变化重置稳定窗口
  if (next === 'onDuty' && prev !== 'onDuty') clearLocateCalls()   // 只在回值守过渡时清
}, { immediate: true })
```

> **一处待人工确认的语义变更**（已列为 §12.6 第 13 项，调试时需重点核对）：
> - 原 `InputController.ts:120` 是 `if (stage === 'onDuty')`（**不区分是否刚回值守**，任何时候读到 onDuty 都清一次）
> - 上述示意改成了「仅 `prev !== 'onDuty'` 时清」，以避免 `watch` 初次 immediate 触发时的误清
> - **两种语义在"首次进入"场景下行为不同**，需人工确认保留哪一种；本文档默认取「仅过渡时清」

#### 10.3.8 同步写入的循环风险

`storage` 事件**只在其他标签页触发，当前页 `localStorage.setItem` 不会触发自己**——因此「`applySharedState` 写 store」与「消费方 watch store」之间**不存在循环**，无需额外防重入。

但需注意：`initUserStore` 注册时的**初始遍历读取**（`handler(localStorage.getItem(key))`）会**同步触发一次**所有 store 字段赋值，进而触发所有已注册的 `watch`（若 `immediate: true`）。因此 `initUserStore()` 的调用位置（`main.ts`）需早于任何 `watch` 注册，否则首次赋值会被漏掉——这是 P0-0 与本次改造的耦合点。

### 10.4 两种消费方式的取舍

| 方式 | 适用 | 优点 | 代价 |
|------|------|------|------|
| **A. watch store 字段** | 阶段门控、切页编排、缓存清理、画像补源 | 响应式、可测试、单一数据源、无 localStorage 解析重复 | 需 `useUserStore()` 在 Pinia 激活后可读；纯 `create*()` 工厂函数需改为 composable 或由调用方注册 watch |
| **B. 保留 storage 监听但集中到一个文件** | 生命周期需独立于组件的场景 | 改动最小、不改现有工厂签名 | 仍存在多处 `addEventListener`，未真正收口；与用户"全系统统一走 MapMode"要求冲突 |

**结论**：按用户要求**全面走 A**。`messageStageGate` 这类需早于地图挂载的，不再用「独立 storage 监听」兜底，而是**在 `main.ts` 注册阶段门控的 watch**（此时 `initUserStore` 已同步读过 localStorage，`MapMode` 已是初值，watch 不会漏首值）。

### 10.5 `useUserStore` 的扩展点设计

`initUserStore(handlers)` 已支持「传入自定义 handler 覆盖同名 key」，可直接复用：

```ts
// register/initMessage.ts（或 main.ts）
const stopUserStore = initUserStore({
  'seat-shared-state': (raw) => {
    // 默认 handler 已被覆盖，需自行合并或调用导出的默认实现
  },
})
```

> ⚠️ 注意：`merged = { ...DEFAULT_HANDLERS, ...handlers }` 为**浅合并**，传入同名 key 会**完全覆盖**默认实现（`applySharedState`），导致 `MapMode`/`session` 不再更新。**建议改造为「默认 + 追加」语义**（默认先跑、追加的后跑），或导出 `DEFAULT_HANDLERS` 供组合。这是 mock 桥（§10.6）接入的前置条件。

### 10.6 mockBridge 独立成文件（按要求单独设计）

`SEAT_SHARED_STATE_MOCK_KEY = 'seat-shared-state-mock'` 是**受理席注入的演示/联调补丁数据**，与真实会话状态（`seat-shared-state`）语义不同、生命周期不同，不应进入 `useUserStore`。

**现状问题**：
- `Control/initMessage.ts:174-208` 用 `event.newValue?.includes('dispatchVehicles')` 等**字符串包含判断**决定走哪个 mock 分支——脆弱且互斥（一个 blob 同时含多个字段时只会命中第一个分支并 `return`）；
- 7 个 `apply*` 函数全靠 `msg.ingest()` 造事件，绕过拦截器链。

**建议设计**：新建 `src/Control/mockSeatBridge.ts`（或 `src/interceptor/mock/`），由 `initUserStore` 的自定义 handler 接入（或独立 `initMockBridge()`），结构如下：

```ts
// 单一入口：解析 blob 后分发到各业务分支（不再用字符串 includes 分流）
export const createMockSeatBridge = () => {
  const msg = useMessageStore()

  /** 按字段存在性并行分发，不再互斥 return */
  const dispatch = (raw: string | null, initial = false) => {
    const blob = tryParseMockBlob(raw)          // v=1 校验
    if (!blob) { if (!initial) emitMockLocateCallRemove(); return }

    // 各分支独立判定，可同时触发
    applyCallLocation(blob, initial)             // blob.callLocation
    applyDispatchVehicles(blob)                  // blob.dispatchVehicles
    applySpecialMapSimulate(blob)                // blob.flood.dispatchCommand
    applyDisasterSite(blob)                      // blob.disasterSite
    applySecondJQLocation(blob)                  // blob.isSecondJQLocation
  }

  return { dispatch, dispose: () => {} }
}
```

**要点**：
1. **去字符串分流**：改为「解析 blob → 按字段存在性并行判定」，消除 `includes()` 互斥缺陷；
2. **复用拦截器**：mock 事件若需与真实消息同等清洗，可在 `src/interceptor/transforms/mock/` 加 transform；否则保持 `ingest` 直投但补齐 `meta.mock = true`；
3. **与 `useUserStore` 解耦**：仅通过 `initUserStore` 的自定义 handler key `'seat-shared-state-mock'` 接入；
4. **`seat-shared-state.mode === 'flood'`** 属真实状态而非 mock，其切页逻辑留 `pageCondition`，mock 只管 `seat-shared-state-mock` 的注入字段。

### 10.7 localStorage 收口的影响与风险

| 项 | 说明 |
|----|------|
| **WS 连接恢复** | 一旦 `initUserStore` 真正启用，WS 会**首次真正连上**——所有此前因 `userId`/`sessionId` 恒 null 而未触发的消息链路会同时激活。**必须先解 §4.2 的 GPS DTO 冲突，否则会立刻暴露**。 |
| **多监听者语义变化** | `storage` 事件只在**其他标签页**触发，本标签页 `setItem` 不触发。改 watch store 后，本标签页内部写 `localStorage` 也会响应——行为增强但需确认无副作用。 |
| **`initUserStore` 浅合并缺陷** | 传入同名 key 会覆盖默认 handler（§10.5），需先修。 |
| **测试** | `storage` 事件无法在同标签页触发，需用 `dispatchEvent(new StorageEvent(...))` 手动派发或跨窗口 E2E；建议补 Vitest 单测覆盖 §10.3 各 watch 分支。 |

### 10.8 与主迁移方案的衔接

§10 的 P0-0（`initUserStore` 未调用）应插到 §7 实施顺序的**最前面**：

```
0. P0-0  启用 initUserStore（App.vue 调用）+ 扩展 store 字段 + 修浅合并缺陷
1. P0-a  定 GPS DTO 契约（同步 docs/source/**）
2. P0-b  F1 骨架：incidentLocation 拦截器 + IncidentLocationController + InputController 订阅
3. P0-c  F2/F3：立案切页、来电应答切页迁入控制器
...
```

> ⚠️ **顺序理由**：第 0 步一旦完成，原本「因 WS 连接未建立而未暴露」的下游缺陷会**立即暴露**（此前 `userId`/`sessionId` 恒为 null，所有 WS 消息链路都处于未激活状态）。因此必须先解 §4.2 的 GPS DTO 冲突与 §10.3 的 `incidentLocation` 拦截器缺失，否则会带着已知缺陷上线。

---

## 11. `src/Control/` 目录消解与业务归属重构（本轮补充）

> 目标：**删除 `src/Control/` 目录本身**，消除与 `src/controller/` 的大小写/语义冲突；同时把其中「仍被业务使用、此前未纳入迁移清单」的模块按分层铁律归位到唯一正确的层。

### 11.1 为什么必须消解整个目录（而非只迁已梳理的功能）

1. **命名冲突**：Windows/macOS 文件系统**大小写不敏感**，`src/Control/` 与 `src/controller/` 仅靠大小写区分；在大小写敏感环境（Linux CI、Docker 构建）会出现解析歧义，`@/Control/x` 与 `@/controller/x` 极易误改。
2. **语义重叠**：`Control` 与 `controller` 在英文语义上完全同义，读者无法从目录名判断「该找哪个」。
3. **归属混乱**：目录内混放了 **9 类不同层次**的代码（见 §11.3），违反分层铁律：
   - 协议 DTO（`AddressUpdatedData`）应在 `controller/core/protocol/`
   - HTTP 适配器（`dispatchVehicleAdapter`）应在 `src/service/`
   - 共享状态工具（`seatSharedState`）应在 `src/store/` 或 `src/utils/`
   - OL 控件（`Swiper`）应在 `src/baseComponent/OpenlayersMap/`
   - 消息入口（`initMessage`）应在 `src/register/`
4. **反向依赖**：控制器层反向 import 上层目录——`src/controller/core/io/InputController.ts:9` 与 `src/controller/core/business/vehicleManager.ts:16` 都 `import` 了 `@/Control/xxx`，这是**明确的架构倒挂**。

### 11.2 实测的消费者全景（决定每个文件的去处）

| `Control/` 文件 | 行数 | 消费者 | 处置 |
|----------------|-----|--------|------|
| `seatSharedState.ts` | 129 | **7 处**：`service/alova.ts`、`service/alovaMapProxy.ts`、`router/index.ts`、`views/amap/AmapApiDemo.vue`、`controller/core/io/InputController.ts`、`DispatchT1.vue`、`dispatchMap.vue` | 迁 `src/utils/seatSharedState.ts`（纯工具层，见 §11.4） |
| `carLocationMessage.ts` | 125 | 4 处：`controller/core/business/vehicleManager.ts`、`DispatchT1.ts`、`DispatchT1.vue`、`store/useMessageStore916.ts`（**旧中枢，非废案**） | 拆：类型→`protocol/`；解析→删（已由 interceptor 接管） |
| `dispatchVehicleAdapter.ts` | 126 | 1 处：`service/methods/dispatchVehicles.ts` | 迁 `src/service/methods/dispatchVehicleAdapter.ts` |
| `Swiper.ts` + `Swiper.css` | 278 | 1 处：`components/map/dragPanel/swipeControl.vue` | 迁 `src/baseComponent/OpenlayersMap/SwipeControl.ts` |
| `incidentLocationMessage.ts` | 401 | 3 处：`store/useIncidentLocationStore.ts`、`baseComponent/OpenlayersMap/incidentRelocate.ts`、`dispatchMap.vue` | 拆：DTO→`protocol/`；解析→`interceptor/transforms/incidentLocation.ts`；缓存→store（§4.3 F1） |
| `mockCallLocationBridge.ts` | 341 | 1 处：`dispatchMap.vue`（仅 `consumePendingSpecialMapRender` + `SharedDispatchVehicleMock` 类型） | 迁独立文件 `src/interceptor/mock/mockSeatBridge.ts`（§10.6） |
| `gisPointChannel.ts` | 193 | 1 处：`baseComponent/OpenlayersMap/incidentRelocate.ts`（`getGisPointChannel`，5 个调用点） | **迁 `src/composables/`**（拆通用工具 + 业务分发两层，见 §11.10）；二次定位为新业务，**保留不删** |
| `pageCondition.ts` | 104 | 1 处：`App.vue`（`initPageConditionListener`） | 迁 `src/register/pageCondition.ts`（应用装配职责） |
| `initMessage.ts` | 234（HEAD）/68（工作区） | **0 处**（仅 `register/initMessage.ts:9` 有一行注释引用） | **删除**；⚠️ **工作区存在未提交改动**（非本轮所为）：HEAD 仍为 234 行旧入口（含 `setIngressGate` / mock 桥 / `createMapMessageHandlers` / `createGisPointChannel`），但工作区已被替换为与 `messageStageGate.ts` **MD5 一致**的阶段门控实现 |
| `initMessage916.ts` | 125 | 0 处 | **档 2 保留为装配基准**（§12.3）；`initSend` 五类订阅报文清单是现网可用配置，新入口装配时以它为对照，P2 通过后按 §7.3 步 8 删除 |
| `mapMessageHandlers.ts` | 133 | 0 处 | **删除**（职责拆入控制器，§4.3） |
| `mapRelayReader.ts` | 261 | 0 处 | **迁移**到 `register/` 后随 F1 合并（§4.3） |
| `messageStageGate.ts` | 66 | 0 处 | **迁移**到 `interceptor/准入` 或 `InputController`（§4.5） |
| `alarmMessage.ts` | 183 | 1 处：`useMessageStore916.ts`（**旧中枢，非废案**） | **删除**（`transforms/alarm.ts` 已接管）；`toDispatchAlarmProfile` 迁入 `AlarmController` |
| `alarmCallMessage.ts` | 80 | 1 处：`useMessageStore916.ts`（**旧中枢，非废案**） | **删除**（`transforms/alarmCall.ts` 已接管） |
| `positionMessage.ts` | 92 | 1 处：`useMessageStore916.ts`（**旧中枢，非废案**） | **删除**（`dispatchers/locateCall.ts` 已接管） |
| `incidentLocationProfileSync.ts` | 154 | 0 处 | **迁移**到 F1 控制器（§4.3） |

### 11.3 目录内混放的 9 类层次（违反分层铁律的证据）

| 层次 | 文件 | 正确归属 | 现状问题 |
|------|------|---------|---------|
| 协议 DTO | `incidentLocationMessage.ts` 的 `AddressUpdatedData` | `controller/core/protocol/` | DTO 定义在业务解析文件里，被 store/组件跨层 import |
| 协议 DTO | `carLocationMessage.ts` 的 `CarLocationBatch/Point` | `controller/core/protocol/` | 同上，且被控制器层 import |
| HTTP 适配 | `dispatchVehicleAdapter.ts` | `src/service/methods/` | 适配器在「控制」目录，被 service 层反向依赖 |
| 共享状态 | `seatSharedState.ts` | `src/store/` | 凭证/阶段解析工具，被 service/router/view/controller 四层同时 import |
| 装配入口 | `initMessage.ts` / `initMessage916.ts` | `src/register/` | 消息入口在「控制」目录 |
| 路由编排 | `pageCondition.ts` | `src/register/` | 切页逻辑在「控制」目录 |
| 跨标签页通道 | `gisPointChannel.ts` | `src/composables/` | BroadcastChannel 适配器混在业务目录（详见 §11.10） |
| OL 控件 | `Swiper.ts` | `src/baseComponent/OpenlayersMap/` | OpenLayers 控件在「控制」目录（与 core/generic 语义冲突） |
| 缓存 | `incidentLocationMessage.ts` 的 `createAddressUpdatedCache` | `src/store/` | 状态缓存混在协议文件 |

### 11.4 重构后的目标目录结构（`src/Control/` 消失）

```
src/
├── register/
│   ├── initMessage.ts                 ← 唯一消息装配入口（WS/postMessage/BC + 订阅报文）
│   └── pageCondition.ts               ← 路由编排（从 Control/pageCondition.ts 迁入）
├── interceptor/
│   ├── transforms/incidentLocation.ts ← 画像地址归一（补写，F1）
│   └── mock/mockSeatBridge.ts         ← mock 补丁桥（独立文件，§10.6）
├── composables/
│   ├── useBroadcastChannelBridge.ts    ← 【新】通用 BC 收发工具（无业务语义，见 §11.10）
│   └── useGisPointSelection.ts         ← 【新】二次定位业务分发（协议类型 + 会话 + ACK + 事件投递）
├── store/
│   └── useUserStore.ts                ← localStorage 集中分发（P0-0，§10.2）
├── utils/
│   └── seatSharedState.ts             ← 共享状态/凭证/阶段解析（纯工具，非响应式，迁入 utils/）
├── service/
│   └── methods/dispatchVehicleAdapter.ts ← 车辆 HTTP 适配（从 Control/dispatchVehicleAdapter.ts 迁入）
├── controller/core/
│   ├── protocol/BusinessProtocol.ts   ← 新增 AddressUpdatedData / CarLocationBatch / CarLocationPoint
│   └── business/IncidentLocationController.ts ← 新增（F1）
└── baseComponent/OpenlayersMap/
    ├── SwipeControl.ts + .css         ← OL 卷帘控件（从 Control/Swiper.ts 迁入）
    ├── dispatchMap.vue                ← 组件内订阅已删除，改为控制器消费
    └── incidentRelocate.ts            ← 改调控制器，不再自造信封
```

### 11.5 迁移动作清单（按依赖顺序，保证每步可编译）

| 步 | 动作 | 涉及文件 | 编译影响 |
|----|------|---------|---------|
| **S1** | 迁 `seatSharedState.ts` → `src/utils/seatSharedState.ts`（纯工具层：只做 JSON.parse + 阶段投影，无响应式状态） | 移动 1 | 改 7 个 import 路径（`@/Control/seatSharedState` → `@/utils/seatSharedState`），**符号名全部不变**，零行为差异 |
| **S2** | 迁 `dispatchVehicleAdapter.ts` → `src/service/methods/` | 移动 1 | 改 1 个 import（`dispatchVehicles.ts` 改为相对同目录 `./dispatchVehicleAdapter`） |
| **S3** | 迁 `Swiper.ts`/`.css` → `src/baseComponent/OpenlayersMap/SwipeControl.ts` | 移动 2 | 改 1 个 import（`swipeControl.vue`）+ 修内部相对 import（`../baseComponent/...` → `@/baseComponent/...`） |
| **S4** | 迁 `pageCondition.ts` → `src/register/pageCondition.ts` | 移动 1 | 改 2 个 import（`App.vue`；内部 `@/Control/seatSharedState` 已在 S1 改） |
| **S5** | 迁 `gisPointChannel.ts` → `src/composables/` 两层：`useBroadcastChannelBridge.ts`（通用工具）+ `useGisPointSelection.ts`（二次定位业务分发）。**协议 V1.0 逻辑一字不改**，仅换归属（见 §11.10） | 新增 2，删除 1 | 改 1 个 import（`incidentRelocate.ts`）；保持 `getGisPointChannel()` 同名导出或改为 composable 调用，业务行为零变化 |
| **S6** | DTO 归位：`AddressUpdatedData` / `CarLocationBatch` / `CarLocationPoint` 进 `protocol/BusinessProtocol.ts` | 改 2 | 改 5 个 import（store/组件/控制器）；`alarmMessage` 等解析逻辑随文件删除 |
| **S7** | mock 桥独立：`mockCallLocationBridge.ts` → `src/interceptor/mock/mockSeatBridge.ts` | 移动 1 + 重构 | 改 1 个 import（`dispatchMap.vue`）；按 §10.6 改为「解析 blob + 并行分发」 |
| **S8** | F1 落地：`interceptor/transforms/incidentLocation.ts` 补写 + 新建 `IncidentLocationController` + `InputController` 订阅 + `install.ts` 注册 | 新增 3，修改 2 | 删除 `mapMessageHandlers.ts` / `incidentLocationProfileSync.ts` / `mapRelayReader.ts` / `messageStageGate.ts` |
| **S9** | F2/F3：`AlarmController.onIncidentStateChanged` / `CallController.onCallAnswerStatusChanged` + `InputController` 订阅 | 修改 3 | 删除 `alarmMessage.ts` / `alarmCallMessage.ts` / `positionMessage.ts` |
| **S10** | F4/F6：删除 `dispatchMap.vue`/`DispatchT1.vue` 组件内订阅；统一 `CallController` 单例；修 `TrackingVehicleGpsUpdateData` DTO | 修改 4 | — |
| **S11** | P0-0：启用 `initUserStore()`（`App.vue` 调用）+ 扩展 store 字段 + 修浅合并 | 修改 2 | — |
| **S12** | 清理废案：`interceptor-integration.ts` / `messageInterceptors.ts` / `initMessage.ts` / `mapMessageHandlers.ts` | 删除 4 | — |
| **S13** | **最后一步**：`initMessage916.ts` → `src/store/useMessageStore916.ts`（旧中枢）。**仅在 §7.3 的全部 15 项人工调试通过后**按§7.3 步 8→9 顺序删除（§12.6 出口判据） | 删除 2 | 删除前必须逐项比对 5 段归一链输出（§4.7.6） |

### 11.6 分层合规性自检

| 铁律 | 本次重构的合规保证 |
|------|-------------------|
| 通用控制层零业务 | `core/generic/**` 不动；`Swiper` 从「控制」移到 `baseComponent/`，不进入 `core/generic`（它是 OL 控件原语，非控制层 DTO 编排） |
| 业务控制层不碰引擎 | `IncidentLocationController` 只用注入的 `genericController`；`vehicleManager`（已 `import 'ol'`）保持现状但 DTO 改走 `protocol/`；`SwipeControl` 不进 `core/business` |
| DTO 用 protocol 类型 | `AddressUpdatedData` / `CarLocationBatch` / `CarLocationPoint` 全部迁入 `protocol/BusinessProtocol.ts`；消除 `store`/`component` 反向 import 业务解析文件 |
| 消息收发唯一出口 | `mockSeatBridge` 走 `useMessageStore().ingest`（唯一入口）；`gisPointChannel` 保留 `useMessageStore`；无裸 WS / 裸 message |
| 新控制器登记 | `IncidentLocationController` 在 `business/index.ts` `export *` |
| 视图不越层 | `dispatchMap.vue` / `DispatchT1.vue` 的组件内订阅删除后改经控制器；`Swiper` 由 `swipeControl.vue` 经 props 驱动 |
| 禁改文件 | 不动 `auto-imports.d.ts` / `components.d.ts` / `dist/` |
| 目录唯一 | 消除 `@/Control/` 与 `@/controller/` 的大小写冲突（`src/Control/` 删除后仅 `@/controller/` 存在） |

### 11.7 类型门禁策略

- **基线已实测（本轮重测 2026-10-15）**：`pnpm lint` 当前 **190 个报错**（存档基线 `lint-baseline.json` 为 191，差异来自并发的其他任务）。
- **判定标准**：改动后报错数 ≤ 当期基线，且**新增报错文件**不涉及本次迁移涉及的模块。
- **预期收益**：S12 删除废案文件可消除其自身携带的既有报错（如 `interceptor-integration.ts` 的 4 条、`messageInterceptors.ts` 的 1 条）。
- **不能以删除代替验证**：`useMessageStore916.ts` 的删除（S13）**不会**自动带来报错下降——它是人工调试阶段的**对照基准**，且当前带有未提交的调试改动（§2.1），不属于本轮清理范围。
### 11.8 本轮边界说明（重要）

- 本节 §11 目前**仅为方案设计**，本轮**未执行任何代码迁移**。
- 文中 S1~S13 是**待评审的迁移动作清单**，需在方案确认后按批次实施。
- 实施前的前置事实（已实测确认，未随回退失效）：
  - `pnpm lint` 基线 **190 个报错**（本轮重测；存档 `lint-baseline.json` 为 191），判定标准为「无新增」。
  - `initUserStore()` 全项目零调用（§10.2 P0-0）。
  - `interceptor/transforms/incidentLocation.ts` 为 **0 字节空文件**且未在 `install.ts` 注册。
  - `TrackingVehicleGpsUpdateData`（`BusinessProtocol.ts`）声明 `{incidentId, layerId}` 与生产者 `{datas}` 不一致（§4.2）。

### 11.9 迁移动作的取舍与争议点（供评审拍板）

| 议题 | 选项 A | 选项 B | 建议 | 理由 |
|------|--------|--------|------|------|
| `seatSharedState.ts` 落位 | `src/utils/`（纯工具） | `src/store/`（状态层） | **A：`utils/`** | 无响应式状态、不返回 ref、只做 JSON.parse + 阶段投影；放 store 会误导为「有状态」 |
| `Swiper.ts` 落位 | `src/baseComponent/OpenlayersMap/` | `src/controller/core/generic/` | **A：`baseComponent/`** | 它是 OL `Control` 原语（直接 `extends Control`），不是「业务图形指令编排」；放 generic 会违反「零业务 + 只执行图形指令」的边界 |
| `pageCondition.ts` 落位 | `src/register/` | `src/controller/core/business/` | **A：`register/`** | 它做的是「路由编排 + 特灾模式拦截」，属应用装配职责，控制器层不负责导航 |
| `gisPointChannel.ts` 落位 | `src/composables/`（拆「通用 BC 工具 + 业务分发」两层） | `src/hooks/`（当纯通道工具）/ `src/controller/core/business/`（当业务控制器） | **A：`composables/` 两层** | 它**是二次定位新业务**，不是废代码；业务语义（协议类型 + 会话 token + ACK + 事件投递）必须独立成 composable。`hooks/` 只放零业务的 BC 收发。协议 V2 文档未出，**V1.0 逻辑本轮一字不改** |
| `AddressUpdatedData` 落位 | `controller/core/protocol/BusinessProtocol.ts` | 留在解析文件 | **A：protocol** | 消除 store/组件跨层 import 业务解析文件（分层铁律 #3） |
| 渲染迁移范围 | 一次全迁（点位+辖区+队站+路径） | 分批（先点位，后其余） | **B：分批** | `dispatchMap.vue` 有 2400+ 行、20+ watcher，一次全迁回归面过大 |
| `messageStageGate` 落位 | 拦截器链末端守卫 | `InputController` 内准入 | **B：`InputController` 内准入** | 拦截器只做「数据归一」，阶段判定是业务准入；放拦截器会把业务写进通用层 |
| `mockSeatBridge` 落位 | `src/interceptor/mock/` | `src/utils/mockSeatBridge.ts` | **B：`utils/` 或 `register/`** | 它不是消息归一（不做 transform），而是「blob → 事件」的适配器；建议 `src/register/mockSeatBridge.ts` 由 `initMessage` 装配 || `gisPointChannel.ts` 落位 | `src/composables/`（拆通用工具 + 业务分发两层） | `src/hooks/`（当纯通道工具） | **A：`composables/` 两层** | 它**是二次定位新业务**，不是通用通道；业务语义（协议类型 + 会话 + ACK + 事件投递）必须独立成 composable，`hooks/` 只放无业务的 BC 收发 |

---

### 11.10 F12 二次定位选点通道：`gisPointChannel.ts` 迁移设计（保留业务，不删）

> **定位修正**：`gisPointChannel.ts` **不是废代码，是二次定位新业务的核心通道**。协议文档（V2）尚未产出，**V1.0 逻辑本轮一字不改**，只做归属迁移与职责拆分。

#### 11.10.1 现状职责混装

当前单文件承担了三层职责，违反分层：

| 现状职责 | 所在代码 | 应归 |
|---------|---------|------|
| **① BroadcastChannel 收发** | `new BroadcastChannel(channelName)`、`sendGisMessage`、`channel.close()` | 通用工具（无业务语义） |
| **② 协议类型与校验** | `SeatPickMessage` / `GisPickMessage` / `GisPointInfo` / `isSeatMessage` / `matchesSession` | 二次定位业务 composable |
| **③ 业务事件投递** | `PICK_START → msg.ingest(MOCK_INCIDENT_RELOCATE)`、`ACK → ackCallback`、`PICK_PING → PONG` | 二次定位业务 composable |

#### 11.10.2 目标：两层拆分（均落 `src/composables/`）

```
src/composables/
├── useBroadcastChannelBridge.ts   ← ① 通用工具：零业务，只管收发与生命周期
└── useGisPointSelection.ts        ← ② 业务分发：协议类型 + 会话 + ACK + 事件投递
```

**① `useBroadcastChannelBridge.ts`（通用工具，零业务）**

职责仅四项，**不含任何 `PICK_*` 语义**：

| 能力 | 签名（建议） |
|------|-------------|
| 建通道 | `createChannel(name: string): { supported: boolean; close(): void }` |
| 发消息 | `send(data: unknown): boolean` |
| 收消息 | `onMessage(cb: (data: unknown) => void): () => void` |
| 生命周期 | `dispose(): void`（App 卸载时调用） |

> ⚠️ **复用优先**：`src/hooks/useBroadcastChannel.ts` 已有 `BroadcastChannelClient`（含 `send` / `sendEvent` / `disconnect` / `onMessage` / `onClose` / `onError`）。**先评估能否直接复用**；若其 `sendEvent` 的信封语义与本场景冲突，则新建本 composable 作为薄封装，**不得重复实现 BC 底层**（公共工具复用铁律）。

**② `useGisPointSelection.ts`（二次定位业务分发）**

保留 V1.0 全部协议类型与状态机，**逻辑逐行等价迁移**：

| 迁移项 | 来源 | 目标 |
|--------|------|------|
| 协议类型 | `GisPointInfo` / `GisPointCancelReason` / `GisFailureCode` / `SeatPickMessage` / `GisPickMessage` | 原样迁入（导出不变，调用方 import 路径改） |
| 会话 token | `activeSession {ownerId, requestId, incidentID}` | 迁入 composable 内部私有状态 |
| 校验 | `isSeatMessage` / `matchesSession` | 原样迁入 |
| 状态机 | `switch (data.type)` 的 `PICK_START/PING/APPLIED/FAILED/CANCEL` 分支 | 原样迁入 |
| 事件投递 | `PICK_START → msg.ingest(MOCK_INCIDENT_RELOCATE)` | 保留（仍走 `useMessageStore().ingest`，符合消息唯一出口） |
| ACK 回调 | `onAck(callback)` | 保留同签名 |
| 单例访问 | `getGisPointChannel()` | 保留同名单例（`incidentRelocate.ts:52` 依赖），内部改由 ① 建通道 |

**对外接口保持兼容**（避免改动 `incidentRelocate.ts` 业务逻辑）：

```ts
// src/composables/useGisPointSelection.ts 对外导出（与现状同名同语义）
export const createGisPointSelection = (): (() => void) => { /* ... */ }
export const getGisPointSelection = (): GisPointChannel => { /* 单例 */ }
// 兼容别名（过渡期保留，@deprecated，V2 协议落地后统一改名）
export const createGisPointChannel = createGisPointSelection
export const getGisPointChannel = getGisPointSelection
```

#### 11.10.3 消费方改动（仅 import 路径，业务零改动）

| 文件 | 现状 | 目标 |
|------|------|------|
| `src/baseComponent/OpenlayersMap/incidentRelocate.ts:26` | `import { getGisPointChannel } from '@/Control/gisPointChannel'` | `import { getGisPointSelection } from '@/composables/useGisPointSelection'` |
| `incidentRelocate.ts:52,118,200,211` | `getGisPointChannel()` / `.send()` / `.onAck()` | **调用代码不变**（仅函数名或保留别名） |
| `src/register/initMessage.ts`（P1 新增装配） | 未调用 `createGisPointChannel` | 新增装配：`createGisPointSelection()` 并纳入 `cleanups` |

#### 11.10.4 「协议文档未出」的处置纪律

| 约束 | 落地方式 |
|------|---------|
| **V2 协议未定，不改协议行为** | V1.0 的 `type` 枚举、字段名、`v: 1` 版本号**一字不动**；迁移只换文件归属与内部分层 |
| **协议可替换点预留** | 协议类型集中在 `useGisPointSelection.ts` 顶部独立区块，标注 `// ===== 协议区（V2 落地时仅改此块）=====`，便于后续替换 |
| **迁移后仍保留旧文件对照** | 旧 `src/Control/gisPointChannel.ts` 按 §12.3 **档 2 保留**，人工调试确认后再删 |
| **V2 协议文档到位后的动作** | 另起一轮：更新协议区类型 + 同步 `docs/source/07-协议事件清单.md` 与 `协议层DTO Schema.tsd`（不在本轮范围） |

#### 11.10.5 验证（并入 §12.6 清单第 8 项）

- 受理席 `PICK_START` → 地图激活选点交互（`MOCK_INCIDENT_RELOCATE` 被消费）
- GIS 选点完成 → 回发 `PICK_RESULT` → 受理席收到
- 受理席回 `PICK_APPLIED` / `PICK_FAILED` / `PICK_CANCEL` → `onAck` 回调触发、停止重试、清理会话
- `PICK_PING` → 自动回 `PICK_PONG`
- 切警情 / 切页 → 会话 token 正确清理，无残留重试

## 12. 迁移执行纪律：先禁用、后清理（重要）

> 核心原则：**功能迁移 → 人工调试确认 → 再清理 `Control/`**。代码迁移完成 ≠ 允许删除旧文件。旧文件在调试确认前必须以「已注释 / 入口禁用」方式保留在仓库中，作为可回滚的对照实现。

### 12.1 四阶段执行纪律（不可跳步）

| 阶段 | 名称 | 允许动作 | 禁止动作 | 出口判据 |
|------|------|---------|--------|---------|
| **P0** | 方案评审 | 只改 `herness/**` 文档 | 动任何业务代码 | 本方案 §11.9 的 7 项取舍已拍板 |
| **P1** | 代码迁移 | 新增/改造**新走线**代码；旧 `Control/` **保持原样不动** | 删改 `Control/` 任何文件 | 新走线可编译；`pnpm lint` 无新增 |
| **P2** | 人工调试确认 | 新旧**双跑**对照验证 | 删除 `Control/` | 全部迁移项（F1~F14）人工逐项确认通过 |
| **P3** | 清理 | 注释或删除 `Control/` | — | `pnpm lint` 报错数 ≤ 基线且无新增；`rg "@/Control"` 只剩文档 |

> ⚠️ **P1 阶段绝对禁止删改 `Control/`**：新走线尚未验证，若此时删除旧实现，线上出现回归时**没有任何可回滚的对照实现**。

### 12.2 旧代码的「注释掉」策略（四档，按风险递增）

| 档位 | 做法 | 适用 | 优点 | 代价 |
|------|------|------|------|------|
| **档 1：全文件注释** | 整个文件内容包在 `/* ... */` | 废案文件（`interceptor-integration`、`messageInterceptors`、`mapMessageHandlers`、`Control/initMessage.ts`）。**不含 `useMessageStore916` / `initMessage916`**（它们是基准，进 P3 时仍在线，见§12.3） | 最彻底，彻底断引用；避免「删了才知道谁在用」 | 需确认无引用；需回写标记 |
| **档 2：入口禁用 + 文件保留** | 只注释/删除**入口调用**（如 `App.vue` 的 `initPageConditionListener`、`register/initMessage.ts` 的 mock 桥装配） | 仍有引用的旧模块（`pageCondition`、`mockCallLocationBridge`、`seatSharedState`） | 改动最小、可秒级回滚 | 文件仍在编译范围，自身报错不消失 |
| **档 3：类型降级 + 入口禁用** | 入口禁用 + 自身类型错误**局部修正**（见 §12.4） | 自身携带真实类型错误的模块（`dispatchVehicleAdapter`、`initMessage`） | 编译干净、不丢代码 | 需逐条修类型 |
| **档 4：删除** | `git rm` | 人工调试**已确认通过**的废案 | 彻底 | **不可逆**，需 P2 出口判据满足 |

> 用户要求「可以先注释掉（也可以全部注释）」→ **推荐档 1 + 档 2 组合**：废案文件全部注释（档 1）；仍被引用的模块注释掉入口调用（档 2）；自身带类型错误的先做档 3 局部修正（§12.4）。**P1~P2 阶段一律不删文件。**

### 12.3 逐文件处置矩阵（P3 阶段执行，本轮不执行）

| `Control/` 文件 | 消费者 | 处置档位 | 具体动作 | 对 lint 的影响 |
|----------------|--------|---------|---------|--------------|
| `initMessage916.ts` | 0 | **档 2** 保留 | 装配基准（`initSend` 五类订阅报文清单是现网配置），人工调试后按 §7.3 步 8 删除 | — |
| `useMessageStore916.ts`（在 `src/store/`，非 `Control/`） | 1（仅 `initMessage916`） | **档 2** 保留 | **旧走线中枢，迁移行为基准**；P2 人工调试通过前不得删除。§12.3 处置仅适用于 `Control/` 目录，此文件在 `store/` 下需单独评估 | — |
| `mapMessageHandlers.ts` | 0 | **档 1** 全注释 | 整文件注释（职责已入控制器） | 同上 |
| `initMessage.ts` | 0 | **档 1** 全注释 | 注意工作区已被替换为 `messageStageGate.ts` 相同内容（未提交）；正式实施前需先确认该改动是否保留，否则应恢复 HEAD 版旧入口作为装配参考 | 无报错需消除 |
| `messageStageGate.ts` | 0 | **档 1** 全注释 | 整文件注释（阶段门控迁 `InputController`） | — |
| `incidentLocationProfileSync.ts` | 0 | **档 1** 全注释 | 整文件注释（迁入 `IncidentLocationController`） | — |
| `mapRelayReader.ts` | 0 | **档 1** 全注释 | 整文件注释（迁 `register/` + F1） | — |
| `positionMessage.ts` / `alarmMessage.ts` / `alarmCallMessage.ts` | 1（**旧中枢 `useMessageStore916.ts`） | **档 2 保留** | 逐个回归校验对应 `transforms/*` 的输出后，再对旧中枢的**调用点**（非文件本身）停用；旧中枢本体不动 | — |
| `mockCallLocationBridge.ts` | 1（`dispatchMap.vue`） | **档 2** 入口禁用 | 注释 `dispatchMap.vue` 的 `consumePendingSpecialMapRender` 调用；文件保留 | 报错（若有）不消失 |
| `pageCondition.ts` | 1（`App.vue`） | **档 2** 入口禁用 | 新走线切页先由控制器接；`App.vue` 注释旧入口；文件保留 | — |
| `seatSharedState.ts` | **7** | **档 2** | 7 个 import 改指新位置；旧文件保留（对照实现） | — |
| `carLocationMessage.ts` | 4 | **档 2** | 3 个消费方改指 protocol；文件保留 | — |
| `gisPointChannel.ts` | 1 | **档 2** | `incidentRelocate.ts` 改指 `@/composables/useGisPointSelection`；旧文件保留（对照实现） | — |
| `incidentLocationMessage.ts` | 3 | **档 2** | DTO 已入 protocol、解析已入 interceptor；旧文件保留 | — |
| `Swiper.ts` + `.css` | 1 | **档 2** | 迁 `baseComponent/OpenlayersMap/SwipeControl.ts`；旧文件保留 | — |
| `dispatchVehicleAdapter.ts` | 1 | **档 3** 类型降级 | 迁 `service/methods/` 后修复 §12.4 的 2 个 TS 错误 | 消除 2 个 TS 错误 |

### 12.4 `Control/` 自身携带的类型错误（实测 `pnpm lint`）

> **实测基线（本轮重测 2026-10-15）**：`pnpm lint` 当前 **190 个报错**（既有 `lint-baseline.json` 记 191，差异来自并发的其他任务）；其中 **2 个在 `src/Control/`**（均在 `dispatchVehicleAdapter.ts`），**8 个在 `src/controller/**`**（含 `InputController.ts:10` 的 `TS6192`，即 §12.5 死锁）。

| 文件:行 | 错误 | 性质 | 处置 |
|--------|------|------|------|
| `dispatchVehicleAdapter.ts:121` | `TS2677: A type predicate's type must be assignable to its parameter's type` | 真实类型错误 | 档 3：过滤前把 `(T \| null)[]` 收窄为 `T[]` 再用 type predicate |
| `dispatchVehicleAdapter.ts:128` | `TS2322: (T \| null)[] is not assignable to DispatchVehicleDTO[]` | 真实类型错误（与上条同源） | 档 3：修正上条后自动消除 |
| ~~`initMessage.ts:48`~~ | ~~`TS2339 setIngressGate`~~ | **HEAD 上成立，工作区不成立**：HEAD 的 234 行版本确实调用 `setIngressGate`；工作区已把该文件替换为 `messageStageGate.ts` 的相同内容，**报错因此消失**（属并发改动，非本轮所为） | 无需处理；阶段门控能力的补回改在 §4.7.3（M1） |
| `initMessage916.ts:41` | `setIngressGate` 注入点 | **未报错**（916 store 仍存在该 API） | 档 2：保留为装配基准，P2 通过后删除 |

### 12.5 ⚠️ 清理死锁：`InputController` 反向依赖 `@/Control/seatSharedState`

`src/controller/core/io/InputController.ts:9` 仍 `import { parseSharedMapStage, SEAT_SHARED_STATE_KEY } from '@/Control/seatSharedState'`，并且该 import 整体未使用（`TS6192`）。

**这意味着 `Control/` 无法在 S1 之前删除**——否则控制器层直接编译失败。清理顺序必须是：

```
S1  seatSharedState 迁到新位置 + 改 7 个 import（含 InputController）
  ↓
S2~S11  其余文件迁移，Control/ 全部文件转为「已注释 / 入口禁用」
  ↓
S12  人工调试全部通过后，才执行真正的文件删除
```

### 12.6 人工调试确认清单（P2 强制出口判据，逐条打勾）

> 任何一项未确认通过，**不得进入 P3 清理阶段**。

| # | 调试项 | 验证方法 | 关联 |
|---|--------|---------|------|
| 1 | **WS 连接建立** | DevTools Network 可见 WS `open`，且已发出 `SEAT` / `ALARM_CALL` / `ALARM_INCIDENT` / `GPS_MSG` / `DISASTER_PROFILE` 五类订阅报文 | §10.2 P0-0 / M0 |
| 2 | 立案切页 | 推 `ALARM_INCIDENT/STATE_CHANGED`（`newState=CREATED`）→ 自动切 `/dispatch1` + 点位 + 呼吸动画 | F2 |
| 3 | 来电应答切页 | 推 `ALARM_CALL/ANSWER_STATUS_CHANGED` → 按 `answered` 判定切页/清理 page condition | F3 |
| 4 | 来电粗定位 | 推 `SEAT/POSITION_SYNC` → 粗定位圈 + 点位 + 文本；**同一通来电连续 2 条同步不得重复定位视图** | F4 |
| 5 | 来电定位单例 | `/map` ↔ `/dispatch1` 切换时粗定位圈**不被重绘**（仅 1 个 `CallController` 实例） | F4 |
| 6 | 画像地址变更（增量） | 推 `DISASTER_PROFILE/UPDATED`（`slotChanges` 含 `longitude`）→ 点位移动 + 辖区重查 + 队站过滤 | F1 |
| 7 | 画像全量快照 | 切警情 → `profile-sync-` 全量替换；**旧警情点位/辖区/队站/路径全清**（无残留） | F1 |
| 8 | 警情二次定位（`useGisPointSelection`） | 受理席 `PICK_START` → 地图选点 → `PICK_RESULT` → 点位更新；`PICK_PING` → `PICK_PONG`；`PICK_APPLIED/FAILED/CANCEL` → `onAck` 触发并清理会话（详见 §11.10.5） | F12 |
| 9 | 车辆 GPS 渲染 | 推 `GPS_MSG` → 车点移动；首次推送缩放至 zoom 16 | F6 |
| 10 | 车辆 GPS 控制器化 | 真实图面渲染由 `TrackingController` + `vehicleManager` 承担，`DispatchT1.vue` **不再自行 subscribe** | F6 |
| 11 | 特灾模式（mock） | `mode=flood` → 切入 `/dispatch1` 特殊地图并清空；`flood.dispatchCommand` → 车辆模拟运行 | F10 |
| 12 | 地址机器人 | 推 `SEAT/ADDRESSBOT` + `AddressLocationUpdated` → 面板展示；无该事件时**旧标注无残留** | F7 |
| 13 | 回值守清理 | 阶段回到 `onDuty` → 来电粗定位圈清除、来电缓存清空。**⚠️ 重点核对§10.3.7 的语义变更**：原实现是「任意刻读到 `onDuty` 就清」，新实现可能改为「仅回值守过渡时清」——两者在**F5 恢复**场景下表现不同，需人工确认采用哪种 | F8 / §10.3.7 |
| 14 | 阶段门控 | `popup`/`inquiry`/`dispatch`/`dispatchTrack` 各阶段按时序消费；跨阶段消息被忽略。**⚠️ 重点核对 `dispatchTrack`**：改 store 前 `MapPhase` 缺这个值（§10.3.3），若无补全则 GPS 消息在跟踪阶段会被永久丢弃 | F8 / §10.3.3 |
| 15 | F5 刷新恢复 | F5 后 `seat-shared-state` 仍在 → 点位/辖区/来电定位按持久化快照重建 | F1 |

### 12.7 项目文档标记规范（P3 注释时同步回写）

所有被注释/禁用的 `Control/` 文件，需在文件头部保留统一标记，便于检索与后续清理：

```ts
/**
 * @deprecated 已被 XXX 替代（迁移批次 SXX，2026-10-XX）
 * @see src/controller/core/business/XXXController.ts
 * @status 注释待清理（P2 人工调试确认通过后执行 git rm）
 * @reason 迁移说明：原职责为 XXX，现由 XXX 承担
 */
// TODO(cleanup-SXX): 人工调试确认后删除本文件
```

**需同步回写的文档**（SOP 收尾要求）：

| 文档 | 回写内容 |
|------|---------|
| `herness/05-共享上下文/当前状态摘要.md` | 新增「`Control/` 已注释待清理」条目 + 剩余报错基线变化 |
| `herness/05-共享上下文/项目结构速查.md` | 删除 `src/Control/**` 条目，标注「已注释待清理」 |
| `herness/02-技术设计/前端/_index.md` | 更新本方案状态（已评审/实施中/已完成） |
| `herness/09-工作日志/YYYY-MM/YYYY-MM-DD.md` | 追加当日迁移记录 |
| `docs/source/07-协议事件清单.md` | 事件键 / 载荷口径变更时同步（§4.2 GPS DTO） |
| `docs/source/协议层DTO Schema.tsd` | DTO 变更时同步（`AddressUpdatedData` / `CarLocationBatch`） |

### 12.8 清理阶段的验证命令

```bash
# 1. 确认无残留引用（应只在文档中命中）
rg "@/Control" src/            # 期望：0 命中
rg "src/Control" src/          # 期望：0 命中

# 2. 类型门禁：无新增（基线 190 §本轮重测，可因废案注释/删除而下降）
pnpm lint                      # 期望：报错数 ≤ 当期基线
pnpm lint:baseline             # 对比改动前后

# 3. 构建验证
pnpm build                     # 库模式与双形态均需通过

# 4. 待清理文件清单（人工核对）
git ls-files src/Control/      # P3 结束后应为空
```

### 12.9 本轮（方案阶段）边界重申

- 本轮**仅完善方案文档**，**未改动任何业务代码**；`src/Control/` 保持 18 个原始文件不变。
- §12.1 的 P1~P3 三阶段均**未开始**。
- `src/store/useMessageStore916.ts` 当前存在**未提交的调试改动**（未属于本轮范围），本文档已将其定位为**行为基准**，本轮**未改动该文件**。
- 前罾事实（本轮 2026-10-15 重测）：`pnpm lint` 基线 **190**（`lint-baseline.json` 存 191）；`Control/initMessage.ts` 在工作区有未提交改动（HEAD 234 行旧入口 → 工作区变为 `messageStageGate.ts` 相同内容），**非本轮所为**；`initUserStore()` 零调用；`incidentLocation.ts` 为 0 字节空文件；GPS DTO 口径冲突；`InputController` 反向依赖 `@/Control/seatSharedState`。

---
