# 消息归一与业务接收

> 事实来源：`src/interceptor/**`、`src/store/useMessageStore.ts`、`src/controller/core/io/**`。
> 本文记录 P1 已接入的实际走线；自动化回归已收口，人工验收与旧实现清理仍待确认。

## 1. 分层与入口

```text
WS / postMessage / BroadcastChannel / localStorage 桥 / HTTP 补水
  → useMessageStore.ingest(raw, channel, system, meta?)
  → 标准 Envelope 直接分发；否则 interceptorRegistry.run()
  → InputController + messageStagePolicy
  → BusinessController / IncidentLocationController / store
  → BusinessMapPort → baseComponent/OpenlayersMap 适配与渲染
```

公共 `ingest` 顺序：已带 `v: '1.0.0'`、`eventKey/system/channel` 的 Envelope → 拦截器链 → Legacy `eventKey/type` 兼容。WS 回调使用同一 receive 流程但关闭最后的 Legacy 回退，未命中的原始 eventKey/type 不额外扩展。接收参数覆盖信封的 channel/system；归一结果 metadata 按 raw.meta → 入站 meta → transform meta 合并。inbox/lastByEventKey 表示收到过，不等于业务 accepted 状态。

`unwrap.ts` 只解包；`matcher.ts` 只匹配/排除路由冲突；`transforms/**` 只产出 `NormalizedMessage[]`。导航、阶段门控和地图操作不放在归一器中。业务发送仍经 `@/controller/publish`，总线为 `useMessageStore`。

## 2. 公共解包与匹配

- `unwrapMessageFrames` 遍历数组及 `request/data/body/message/payload/userMsgBodyList`，支持多层 JSON 字符串，继承外层路由与 metadata，避免循环对象重复展开。
- `normalize` 兼容对象 topics[]、字符串 topic（例如 `seat/8001`、`GPS_MSG/car-location-broadcast-all`），归一 type/customType/notifyType/notifySubType 大小写。
- `getMessagePayload` 优先取 customContent/content；`getFrameMetadata` 保留 recordId、eventId、source、topics、notify、request.channel 等。
- `matchSubscription` 对 SEAT 仅匹配 topic；CUSTOM 先由 `matchesMessageRoute` 排除不相容的 topic/notify/eventName/source，再按 topic、notify、eventName、结构兼容条件匹配。不能把任意含 data 的帧直接视作同一业务。

## 3. 当前顺序与多结果语义

`installDefaultInterceptors()` 在首次 ingest 时惰性装配，必须在 Pinia 激活后调用。

| priority | 文件 | 作用 |
| --- | --- | --- |
| 50 | `transforms/seat.ts` | SEAT，dispatch: 'multi' |
| 100 | `transforms/addressRobot.ts` | 地址机器人 |
| 110 | `transforms/position.ts` | 来电位置 |
| 120 | `transforms/carLocation.ts` | GPS |
| 130 | `transforms/alarmCall.ts` | 接听状态 |
| 140 | `transforms/alarm.ts` | 警情状态 |
| 150 | `transforms/incidentLocation.ts` | 画像地址 |
| 900 | `transforms/t1.ts` | T1 最后兜底，fallback: true |

`transforms/business.ts::normalizeBusinessFrames` 先按 916 原生识别范围扫描地址机器人 → 位置 → GPS → 接听 → 警情 → 画像地址；整轮未命中才按相同顺序尝试包装增强。增强不能抢走另一类别已被 916 原生识别的结果。`install.ts` 用同一 context 的统一归一结果包装各业务 interceptor，保持 SEAT 与非 SEAT 入口一致。

单多结果保留各类别语义：位置/GPS 可按顺序产生多条且去重，answer/incident 只取首个匹配结果。地址机器人/画像地址在旧原生范围只识别根对象，包装增强可收集同类多结果。SEAT multi 是承载 results[] 的能力，不表示每个业务都扇出全部帧。

SEAT 先调用统一业务归一器，有结果即 `results[] + stop: true`。未命中才遍历 `defineSeatDispatcher` 登记的扩展列表（默认为空）。addressRobot dispatcher 供地址机器人归一器使用，locateCall dispatcher 保留兼容委托。

Registry 按 priority 升序收集单条/多条结果，stop 才终止；已有结果时跳过 fallback。T1 只接受根对象的 eventType，或根 payload 单对象的 eventType/eventKey；保留其原值与 data，不做常量名映射，不递归展开 T1 列表/深层包装。位置/GPS 不钻入 T1 载荷抢走其 data。模板匹配与 transform 均在异常边界内；公共解包逐帧容错，坏帧不阻断合法兄弟帧。

## 4. 实际载荷

类型路径均相对 `src/controller/core/`：

| 内部事件键 | 实际数据 | 类型来源 |
| --- | --- | --- |
| `map.locate.call` | id/longitude/latitude/radius/Carrier_Loc 等 | `protocol/BusinessProtocol.ts::LocateCallData` |
| `tracking.vehicle.gps.update` | `{ datas: CarLocationPoint[] }` | `protocol/LegacyMessageProtocol.ts`、`BusinessProtocol.ts` |
| `alarm.call.answer_status_changed` | 接听状态 | `protocol/LegacyMessageProtocol.ts::AlarmCallAnswerStatusData` |
| `alarm.incident.state_changed` | 警情状态 | `protocol/LegacyMessageProtocol.ts::AlarmIncidentStateData` |
| `disaster_profile.address_updated` | AddressUpdatedData；种类在 meta.snapshotKind | `protocol/IncidentLocationProtocol.ts` |
| `address_robot.gis_search` | 地址机器人 customContent 整体 | `protocol/BusinessProtocol.ts::AddressRobotGisSearchData` |

GPS 点字段为 carId、longitude、latitude、plateNumber，可选 orgId/orgName/gpsTime；不得包装为需要 layerId 的通用图层更新。

画像归一复用 `src/service/incidentLocation.ts`：slots[] 为 full，slotChanges[] 默认 delta；已归一的 slots 字典仍需保留 `meta.snapshotKind`。full 替换，delta 合并；省略与显式清空不同。`MessageMetadata.snapshotKind?: 'full' | 'delta'` 在 `src/types/message.ts`，由 WS transform、relay、HTTP 入口传递。

## 5. Runtime、共享态与底座

- `src/controller/core/io/BusinessMessageRuntime.ts` 提供 start、attachMap、attachTracking、prepareDispatchLeave、leaveDispatch、dispose。两个 attach 返回解绑函数；attachTracking 同步 hydrate 最新 accepted GPS，消费者控制器须先就绪。换图/解绑会将未完成 mock job 交还 pending，已完成任务不重放。
- `src/register/businessMapLifecycle.ts::bindBusinessMapLifecycle` 由 lib/index.ts 装配：beforeEach 捕获 prepareDispatchLeave 闭包，afterEach 仅在导航成功时清对应 generation/contextRevision，避免旧离页回调清除新 flood 状态。
- `messageStagePolicy.ts` 对受控事件等待接收与最新共享态之后的 500ms 稳定窗口，再按阶段投递；会话变化/卸载清队列。阶段计算复用 `@/utils/seatSharedState`。
- `IncidentLocationController` 接收完整信封、维护上下文；`useIncidentLocationStore` 做身份/版本/上下文/HTTP 水位校验，保存 marker/槽位快照并派生辖区、队站与周边资源；地图读取 store 渲染。
- `useUserStore` 是共享态业务读源，`initUserStore` 管理 storage 监听。原始 MapMode = phase；有效阶段由 getSharedMapStage 投影，不能只判断 MapMode 字面量。
- `protocol/BusinessMapPort.ts` 是无引擎边界。`baseComponent/OpenlayersMap/businessMapPort.ts::createBusinessMapPort(generic)` 返回 { port, dispose } 并装配 AddressRobotRenderer；TrackingController 调用 port.trackingVehicleGpsUpdate，Runtime 将 accepted GPS 交给跟踪 attachment。
- `VehicleRenderer.ts` 承载车辆引擎实现，由 DispatchT1 使用；`AddressRobotRenderer.ts` 保留搜索 Feature/样式/面板语义并清理自身 timer、fit 动画与 generation；`SwipeControl.ts/.css` 承载卷帘适配。

## 6. F10～F13 落位

| 路径 | 责任 |
| --- | --- |
| `src/composables/useMockCallLocationBridge.ts` | F10 解析 mock blob、差异检测/命令去重，经 LOCAL_STORAGE ingest；请求导航，不渲染 |
| `BusinessMessageRuntime` + `BusinessMapAttachment.mock` | 排队执行 render/disasterSite/simulate/clear/dispatchVehicles；仅 dispatch attachment 执行，按会话/generation 作废旧任务 |
| `src/composables/useGisPointSelection.ts` | F12 冻结选点协议；PICK_START 转现有 mock.incident.relocate，保留 ownerId/requestId、ACK 与发送接口 |
| `src/composables/useMapRelayReader.ts` | F11 relay 识别、hello、清理，转现有事件后 ingest；本轮修正快照种类/上下文接入，不属 F12 冻结 |
| `src/composables/useIncidentLocationProfileSync.ts` | F13 HTTP 画像补水、首次拉取/上下文竞态检查，经 HTTP ingest，meta.snapshotKind = 'full'；不属 F12 冻结 |
| `src/composables/useBroadcastChannelBridge.ts` | 通用 BC send/listen/close/dispose，无业务状态 |
| `src/hooks/useBroadcastChannel.ts` | 总线使用的 BroadcastChannelClient，无业务分支 |

HTTP 是入站补水通道，store.publish 对 HTTP 返回 false。仅 F12 GIS 选点/ACK 会话按现有 V1.0 协议等价迁位，既有可靠性问题保持冻结；不得将此冻结范围扩到 F11 relay 或 F13 HTTP。PICK_* / relay kind 是各自线协议字段，不是新增 MESSAGE_EVENT_KEY。

## 7. 保留对照与清理条件

`src/Control/**` 与 `src/store/useMessageStore916.ts` 保留对照。916 仍引用旧 normalizer，旧测试/兼容入口也可能引用，不能标注为「全部无引用」。`src/Control/messageStageGate.ts` 仍存在，活动阶段门控为 `core/io/messageStagePolicy.ts`。

迁位索引：normalizers → interceptor/transforms/**；订阅声明 → interceptor/subscriptions.ts（register/messageSubscriptions.ts 兼容导出）；共享态工具 → utils/seatSharedState.ts；装配/导航 → register/initMessage.ts、pageCondition.ts；F10～F13 桥 → 上表 composables。

完整人工验收后，须由用户另行确认清理 Control/916；本轮文档同步不授权删除。
