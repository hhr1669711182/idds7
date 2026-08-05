# 地图消息事件体系 - 外部通信协议

## 1. 概述

本事件体系定义“地图模块 ↔ 外部业务系统”之间的双向通信协议，兼容 **WebSocket** 与 **postMessage** 两种通道，统一使用 `{ eventKey, data }` 结构。

### 1.1 通信架构

```
┌─────────────┐         WebSocket          ┌─────────────────┐
│ 外部业务系统 │ ←────────────────────────→ │ useMessageStore │
└─────────────┘                            └────────┬────────┘
       ↑ postMessage                                 │ subscribe()
       └─────────────────────────────────────────────┘
```

### 1.2 消息信封

所有消息均封装为标准信封：

```ts
interface MessageEnvelope<T = any> {
  v: '1.0.0'            // 协议版本
  id: string             // 消息唯一ID
  ts: number             // 时间戳
  system: MessageSystem  // 来源/目标系统
  channel: MessageChannel// 通道: ws | postMessage
  eventKey: string       // 事件标识
  data: T                // 业务数据
  targetSystem?: MessageSystem  // 目标系统（可选）
  meta?: Record<string, any>    // 元信息
}
```

### 1.3 系统标识

```ts
export const MESSAGE_SYSTEM = {
  HOST: 'host',           // 主系统（上游/父窗口）
  MAP: 'map',             // 地图系统
  DISPATCH: 'dispatch',   // 调度系统
  PANEL_25D: 'panel_25d', // 2.5D面板
  PANEL_3D: 'panel_3d',   // 3D面板
} as const
```

### 1.4 通道标识

```ts
export const MESSAGE_CHANNEL = {
  WS: 'ws',              // WebSocket通道
  POST_MESSAGE: 'postMessage', // postMessage通道
} as const
```

---

## 2. 事件目录

### 2.1 地图核心事件（MAP）

| eventKey | 方向 | 说明 | data 类型 |
|---------|------|------|----------|
| `map.ready` | → host | 地图初始化完成 | `{ mapId: string }` |
| `map.click` | → host | 地图点击 | `{ lon: number, lat: number, coordinate: [number, number] }` |
| `map.moveend` | → host | 地图移动结束 | `{ center: [number, number], zoom: number }` |
| `map.poi.pick` | ↔ host/dispatch | POI地址拾取 | `PickPOIData` |
| `map.poi.search` | ↔ host/dispatch | POI地址搜索 | `SearchPOIData` |
| `map.coord.transform` | ↔ host/dispatch | 坐标转换 | `CoordTransformData` |

### 2.2 路径规划事件（MAP ↔ DISPATCH/HOST）

| eventKey | 方向 | 说明 | data 类型 |
|---------|------|------|----------|
| `route.plan.start` | → map | 发起路径规划 | `RoutePlanStartData` |
| `route.plan.multiple` | → map | 多路径规划 | `RoutePlanMultipleData` |
| `route.plan.result` | → host/dispatch | 路径规划结果 | `RoutePlanResultData` |
| `route.plan.cancel` | → map | 取消路径规划 | `{ routeId: string }` |
| `route.plan.error` | → host/dispatch | 路径规划异常 | `{ routeId: string, code: string, message: string }` |
| `route.waypoint.update` | ↔ map | 途经点更新 | `WaypointUpdateData` |

### 2.3 地址定位事件（MAP ↔ DISPATCH/HOST）

| eventKey | 方向 | 说明 | data 类型 |
|---------|------|------|----------|
| `addr.sync.start` | → map | 发起地址同步定位 | `AddrSyncStartData` |
| `addr.sync.result` | → host/dispatch | 同步定位结果 | `AddrSyncResultData` |
| `addr.sync.cancel` | → map | 取消同步定位 | `{ syncId: string }` |
| `addr.geocode` | ↔ host/dispatch | 地理编码/逆地理编码 | `GeocodeData` |
| `addr.poi.pick` | → host/dispatch | 地址POI拾取结果 | `AddrPOIPickData` |

### 2.4 调度/告警事件（MAP ↔ DISPATCH）

| eventKey | 方向 | 说明 | data 类型 |
|---------|------|------|----------|
| `dispatch.update` | ↔ dispatch | 分派数据更新 | `DispatchUpdateData` |
| `alarm.update` | ↔ dispatch | 告警数据更新 | `AlarmUpdateData` |
| `unit.location.update` | ↔ dispatch | 单位位置更新 | `UnitLocationData` |
| `unit.status.change` | ↔ dispatch | 单位状态变化 | `UnitStatusData` |

---

## 3. 事件详细定义

### 3.1 多路径规划（route.plan.multiple）

**触发方**：HOST / DISPATCH

**目标方**：MAP

**说明**：同时发起多条路径规划（如：推荐路线、最快路线、最短路线）

```ts
// 发起多路径规划
interface RoutePlanMultipleData {
  requestId: string           // 请求唯一ID
  routes: {
    routeId: string          // 路线ID
    start: [number, number]  // [lon, lat]
    end: [number, number]    // [lon, lat]
    waypoints?: [number, number][] // 途经点
    strategy?: 'recommend' | 'fastest' | 'shortest' | 'avoidCongestion'
  }[]
  options?: {
    avoidHighSpeed?: boolean
    avoidTunnel?: boolean
    avoidBridge?: boolean
  }
}

// 路径规划结果
interface RoutePlanResultData {
  requestId: string
  routeId: string
  success: boolean
  distance?: number           // 总距离(m)
  duration?: number          // 预计时间(s)
  steps?: {
    instruction: string
    distance: number
    duration: number
    startLocation: [number, number]
    endLocation: [number, number]
  }[]
  points?: [number, number][] // 路线坐标点(GCJ-02)
  errorCode?: string
  errorMessage?: string
}
```

### 3.2 地址同步定位（addr.sync）

**触发方**：HOST / DISPATCH

**目标方**：MAP

**说明**：将外部地址信息同步到地图，并自动定位/跳转

```ts
// 发起地址同步定位
interface AddrSyncStartData {
  syncId: string             // 同步ID
  address?: string           // 地址文本（优先）
  lonlat?: [number, number] // 经纬度坐标（二选一）
  options?: {
    autoZoom?: number        // 自动缩放级别，默认16
    offsetCenter?: boolean   // 是否偏移中心点
    markerLabel?: string     // 标注名称
    markerIcon?: string      // 标注图标
    showPopup?: boolean      // 是否显示弹窗
    triggerClick?: boolean   // 是否触发点击事件
  }
}

// 同步定位结果
interface AddrSyncResultData {
  syncId: string
  success: boolean
  address?: string           // 标准地址
  formattedAddress?: string  // 格式化地址
  lonlat?: [number, number] // GCJ-02坐标
  cityCode?: string         // 城市编码
  cityName?: string         // 城市名称
  district?: string         // 区县
  road?: string             // 道路
  number?: string           // 门牌号
  poiType?: string          // POI类型
  errorCode?: string
  errorMessage?: string
}
```

### 3.3 地址拾取（addr.poi.pick / map.poi.pick）

**触发方**：HOST / DISPATCH / MAP

**目标方**：MAP / HOST / DISPATCH

**说明**：用户在地图上点击拾取POI/地址，或通过输入搜索地址

```ts
// 地址POI拾取（地图点击）
interface AddrPOIPickData {
  pickId: string             // 拾取ID
  lonlat: [number, number]  // GCJ-02坐标
  address?: string           // 地址
  name?: string              // POI名称
  type?: string              // POI类型编码
  typeName?: string          // POI类型名称
  tel?: string               // 电话
  distance?: number          // 距离中心点距离
  photoUrls?: string[]       // 照片URL
}

// POI搜索
interface SearchPOIData {
  requestId: string
  keyword: string
  city?: string
  cityLimit?: boolean
  types?: string[]           // POI类型
  offset?: number            // 每页数量
  page?: number              // 页码
}

// POI搜索结果
interface SearchPOIResultData {
  requestId: string
  keyword: string
  total: number
  suggestions?: {
    district: string
    address: string
    name: string
    type: string
  }[]
  pois?: {
    id: string
    name: string
    address: string
    lonlat: [number, number]
    type: string
    tel?: string
    distance?: number
    photoUrls?: string[]
  }[]
  errorCode?: string
}
```

---

## 4. 订阅机制

### 4.1 订阅API

```ts
// 订阅特定事件键
messageStore.subscribe(eventKey: string, callback: (envelope: MessageEnvelope) => void): () => void

// 订阅特定系统和事件键
messageStore.subscribeForSystem(system: MessageSystem, eventKey: string, callback: (envelope: MessageEnvelope) => void): () => void

// 订阅所有消息（慎用）
messageStore.subscribeAll(callback: (envelope: MessageEnvelope) => void): () => void

// 取消订阅（所有同名回调）
messageStore.unsubscribe(eventKey: string): void
```

### 4.2 使用示例

```ts
// 在 controller 中订阅
const unsub = messageStore.subscribe('route.plan.result', (envelope) => {
  const { routeId, distance, duration, points } = envelope.data
  // 处理路径规划结果
})

// 组件卸载时取消订阅
onUnmounted(() => unsub())
```

---

## 5. 发布机制

### 5.1 发布API

```ts
// 发布消息
messageStore.publish(
  eventKey: string,
  data: any,
  options: {
    system: MessageSystem      // 目标系统
    channel: MessageChannel    // 通道
    targetSystem?: MessageSystem
    targetOrigin?: string      // postMessage用
    iframe?: () => HTMLIFrameElement | null
  }
)
```

### 5.2 使用示例

```ts
// 发起多路径规划
messageStore.publish('route.plan.multiple', {
  requestId: 'req-001',
  routes: [
    { routeId: 'r1', start: [116.404, 39.915], end: [116.414, 39.925], strategy: 'recommend' },
    { routeId: 'r2', start: [116.404, 39.915], end: [116.414, 39.925], strategy: 'fastest' },
  ]
}, {
  system: MESSAGE_SYSTEM.MAP,
  channel: MESSAGE_CHANNEL.WS,
})

// 发起地址同步定位（postMessage给父窗口）
messageStore.publish('addr.sync.start', {
  syncId: 'sync-001',
  address: '北京市朝阳区建国路',
  options: { autoZoom: 16, showPopup: true }
}, {
  system: MESSAGE_SYSTEM.HOST,
  channel: MESSAGE_CHANNEL.POST_MESSAGE,
})
```

---

## 6. 错误码

| errorCode | 说明 |
|-----------|------|
| `ROUTE_NOT_FOUND` | 路径规划无结果 |
| `ROUTE_TOO_LONG` | 路径距离超出范围 |
| `ADDR_GEOCODE_FAILED` | 地址解析失败 |
| `ADDR_REVERSE_FAILED` | 逆地理编码失败 |
| `WS_CONNECT_FAILED` | WebSocket连接失败 |
| `WS_SEND_FAILED` | 消息发送失败 |
| `TIMEOUT` | 请求超时 |
