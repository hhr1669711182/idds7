# 拦截器架构说明（ids-gis-web）

> 旧的 `src/Control/` 下各 `normalizeXxxFrame` 文件已废弃，WS / postMessage 的消息拦截与归一全部由 `src/interceptor/` 承担。

---

## 1. 总体分层

```
┌──────────────────────────────────────────────────────────┐
│  useMessageStore.ts  (Pinia)                             │
│  └─ ingest(raw, channel, system)                         │
│       └─ interceptorRegistry.run(raw, channel, system)   │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│  通用层  src/interceptor/                                 │
│    unwrap.ts     消息体归一 (字符串 parse / 大小写归一) │
│    matcher.ts    4 级兜底匹配 (topics/notify/eventName) │
│    registry.ts   拦截器注册 + 链式执行 + 结果收集       │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│  业务层  src/interceptor/transforms/                     │
│    CUSTOM 业务  alarm / alarmCall / carLocation          │
│      └─ subscribe  镜像 MESSAGE_SUBSCRIBE_TOPIC         │
│      └─ transform 命中后做数据归一 + eventKey 归一     │
│    SEAT 业务    seat.ts + dispatchers/*.ts              │
│      └─ subscribe  { type:''SEAT'', dispatch:''multi'' }│
│      └─ transform 遍历 dispatcher 列表, 返回 results[]   │
└──────────────────────────────────────────────────────────┘
```

---

## 2. 通用层

### 2.1 `unwrap.ts` — 消息体归一

```ts
normalize(raw) → {
  raw,            // 原始 raw (AnyRecord)
  content,        // 自动 JSON.parse, 一定是对象或 null
  customContent,  // 自动 JSON.parse, 一定是对象或 null
  topics,         // [{ type, customType?, key? }], 大写归一
  notifyType,     // 大写字符串
  notifySubType,  // 大写字符串
} | null
```

职责：
- 字符串 `content` / `customContent` 自动 `JSON.parse`
- `topics` 字段大小写归一
- 非对象 raw 返回 null

业务侧只读 `normalizeResult`，无需关心字符串还是对象。

### 2.2 `matcher.ts` — 公共订阅匹配

命中策略 (CUSTOM 适用 4 级兜底, SEAT 仅 topics):

1. `topics[]` 精确匹配 `{ type, customType?, key? }`
2. `notifyType / notifySubType` 兜底 (`{TYPE}_{SUBTYPE}` 合并比对)
3. `customContent.eventName` 兜底 (按 `{Type}{Key 驼峰}Event` 自动推导)
4. `customContent.data` 存在性兜底

```ts
matchSubscription(ctx, subscribeRule) → boolean
```

### 2.3 `registry.ts` — 注册 + 链式执行

```ts
interceptorRegistry.register(it) → unregister
interceptorRegistry.run(raw, channel, system) → NormalizedMessage[]
```

`run` 执行流程:
1. 按 priority 升序遍历所有 enabled 的拦截器
2. 若 `subscribe.type` 是 `CUSTOM` / `SEAT`: 先 `matchSubscription` 模板匹配
3. 命中后调 `transform(ctx)`, 收集结果 (单条或多条)
4. 首个 `stop: true` 终止后续

---

## 3. 业务层

### 3.1 CUSTOM 业务

每条规则是一个独立 transform 文件:

```
transforms/
├── alarm.ts           警情状态变更
├── alarmCall.ts       来电应答状态
└── carLocation.ts     车辆 GPS 位置
```

写法模板:

```ts
import { MESSAGE_EVENT_KEY, MESSAGE_SUBSCRIBE_TOPIC } from ''@/const/const.message.type''
import type { MessageInterceptor } from ''../types''
import { matchSubscription } from ''../matcher''
import { normalize } from ''../unwrap''

const SUBSCRIBE = {
  ...MESSAGE_SUBSCRIBE_TOPIC.ALARM_INCIDENT,
} as const

const transform: MessageInterceptor[''transform''] = (ctx) => {
  if (!matchSubscription(ctx, SUBSCRIBE)) return { matched: false }
  const m = normalize(ctx.raw)!
  const data = m.customContent?.data
  if (!data || !data.incidentId) return { matched: false }

  return {
    matched: true,
    eventKey: MESSAGE_EVENT_KEY.ALARM_INCIDENT_STATE_CHANGED,
    data,
    meta: { recordId: m.raw.id, ... },
    stop: true,
  }
}

export const alarmInterceptor: MessageInterceptor = {
  id: ''topic:alarm-incident'',
  priority: 200,
  describe: ''警情状态变更'',
  subscribe: SUBSCRIBE,
  transform,
}
```

### 3.2 SEAT 业务 (二次分发)

SEAT 是泛订阅, 同一个 key 上承载多种业务。用 dispatcher 列表实现"一对多"分发。

```
transforms/
├── seat.ts                       SEAT 容器 (调度所有 dispatcher)
└── dispatchers/
    ├── locateCall.ts             → MAP_LOCATE_CALL
    └── addressRobot.ts           → ADDRESS_ROBOT_GIS_SEARCH
```

`seat.ts` 关键结构:

```ts
let currentSubscribe: SubscribeRule = { type: ''SEAT'', dispatch: ''multi'' }
export const setSeatSubscribe = (rule) => { currentSubscribe = rule }

export const seatInterceptor: MessageInterceptor = {
  id: ''topic:seat'',
  priority: 150,
  get subscribe() { return currentSubscribe },  // getter 实时读
  transform({ normalized }) {
    if (!normalized) return { matched: false }
    const results = []
    for (const d of seatDispatchers) {
      const out = d(normalized)
      if (out) results.push(...out)
    }
    if (!results.length) return { matched: false }
    return { matched: true, results, stop: true }
  },
}
```

dispatcher 写法:

```ts
export const locateCallDispatcher: SeatDispatcher = (m) => {
  if (m.notifyType !== ''POSITION_SYNC''
    && String(m.customContent?.taskType ?? '''').toLowerCase() !== ''weizhiwang'') {
    return null
  }
  // 命中: 返回 NormalizedMessage[]
  return [{ eventKey, data, meta }]
}
```

---

## 4. 添加新业务的步骤

### 4.1 添加 CUSTOM 业务

1. 在 `const/const.message.type.ts`:
   - `MESSAGE_EVENT_KEY` 加内部事件常量
   - `MESSAGE_SUBSCRIBE_TOPIC` 加订阅项
2. `transforms/<name>.ts` 新建规则文件 (套模板)
3. `install.ts` 注册

### 4.2 添加 SEAT 业务 (同通道多业务)

1. `transforms/dispatchers/<name>.ts` 写一个 `SeatDispatcher`
2. `transforms/seat.ts` 的 `seatDispatchers` 数组里登记
3. `install.ts` 不动

---

## 5. 装配入口

`src/register/initMessage.ts` 内的 `useMessageStore` 在首次 `ingest` 时自动调 `installDefaultInterceptors()`, 也可显式调用:

```ts
import { installDefaultInterceptors } from ''@/interceptor''
installDefaultInterceptors()
```

装配顺序 (priority):
- 150  seatInterceptor (SEAT 二次分发)
- 200  alarm / alarmCall / carLocation (CUSTOM 三段)

---

## 6. 业务侧使用

业务侧 (Vue 组件 / controller) 不感知拦截器存在, 只通过 `useMessageStore.subscribe` 收结果:

```ts
const msgStore = useMessageStore()
msgStore.subscribe(MESSAGE_EVENT_KEY.ALARM_INCIDENT_STATE_CHANGED, (envelope) => {
  console.log(envelope.data)  // 已经是拦截器归一后的内部结构
})
```

---

## 7. 废弃文件 (已不使用)

以下 `src/Control/` 下文件已废弃, 业务拦截逻辑全部迁移至 `src/interceptor/`:

| 旧文件 | 替代 |
|---|---|
| `alarmMessage.ts` (normalizeAlarmStateFrame) | `interceptor/transforms/alarm.ts` |
| `alarmCallMessage.ts` (normalizeAlarmCallFrame) | `interceptor/transforms/alarmCall.ts` |
| `carLocationMessage.ts` (normalizeCarLocationFrames) | `interceptor/transforms/carLocation.ts` |
| `positionMessage.ts` (normalizePositionFrames) | `interceptor/transforms/dispatchers/locateCall.ts` |
| `messageStageGate.ts` | 已删除 (按需求) |
| `initMessage916.ts` / `useMessageStore916.ts` | 废案保留, 不再被引用 |