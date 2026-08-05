# 调派功能交互 - 外部通信协议

## 1. 概述

本协议定义“地图调派模块 ↔ 外部业务系统”之间的双向通信接口，统一使用 WebSocket 通道及 `{ eventKey, data }` 结构。

### 1.1 系统与通道标识

```ts
export const MESSAGE_SYSTEM = {
  HOST: 'host',           // 主系统（上游/父窗口）
  DISPATCH: 'dispatch',   // 调度/调派系统
} as const

export const MESSAGE_CHANNEL = {
  WS: 'ws',              // WebSocket通道
} as const
```

---

## 2. 事件目录

### 2.1 接收外部数据事件（HOST → DISPATCH）

| eventKey | 方向 | 说明 | data 类型 |
|---------|------|------|----------|
| `dispatch.init` | → dispatch | 初始化调派数据（警情+待命车辆），内部触发路径规划 | `DispatchInitData` |
| `dispatch.vehicle.add` | → dispatch | 新增待命车辆上图及路径规划 | `DispatchVehicleAddData` |
| `dispatch.vehicle.remove` | → dispatch | 取消待命车辆上图（移除点位与关联路径） | `DispatchVehicleRemoveData` |
| `dispatch.vehicle.plan.toggle` | → dispatch | 待命车辆方案上图切换显示/隐藏（内部缓存路径数据） | `DispatchVehiclePlanToggleData` |
| `dispatch.linked_unit.filter` | → dispatch | 联动单位数据类型过滤 | `LinkedUnitFilterData` |

### 2.2 发送数据到外部事件（DISPATCH → HOST）

| eventKey | 方向 | 说明 | data 类型 |
|---------|------|------|----------|
| `dispatch.vehicle.pick` | → host | 点击地图图标拾取车辆（获取数据传给外部用于新增待命车辆） | `DispatchVehiclePickData` |

---

## 3. 接收外部数据事件详细定义 (HOST → DISPATCH)

### 3.1 初始化调派数据（dispatch.init）

**触发方**：HOST
**目标方**：DISPATCH
**说明**：外部系统传入警情与待命车辆数据，调派模块在地图上渲染警情点与车辆点，并内部触发获取到达警情点的路径规划进行绘制。

```ts
interface DispatchInitData {
  requestId: string
  alarmInfo: {
    id: string
    lonlat: [number, number] // [lon, lat]
    address?: string
    type?: string
  }
  standbyVehicles: {
    id: string
    plateNo: string
    lonlat: [number, number] // [lon, lat]
    carType?: string
    status?: string
  }[]
}
```

### 3.2 新增待命车辆上图（dispatch.vehicle.add）

**触发方**：HOST
**目标方**：DISPATCH
**说明**：外部系统主动添加新的待命车辆，调派模块负责将其上图并触发到达当前警情的路径规划。

```ts
interface DispatchVehicleAddData {
  requestId: string
  vehicle: {
    id: string
    plateNo: string
    lonlat: [number, number]
    carType?: string
    status?: string
    [key: string]: any
  }
}
```

### 3.3 取消待命车辆上图（dispatch.vehicle.remove）

**触发方**：HOST
**目标方**：DISPATCH
**说明**：取消特定待命车辆，调派模块需将该车辆的点位及关联的路径规划元素从地图上移除。

```ts
interface DispatchVehicleRemoveData {
  requestId: string
  vehicleId: string // 需要移除的车辆ID
}
```

### 3.4 待命车辆方案上图切换显示隐藏（dispatch.vehicle.plan.toggle）

**触发方**：HOST
**目标方**：DISPATCH
**说明**：控制已存在的待命车辆规划方案在地图上的显示与隐藏，内部通过数据缓存实现，无需重新发起路径规划请求。
*(注意：当前接口定义为草案，具体字段待确认)*

```ts
// [草案] 待补充具体的接口定义
interface DispatchVehiclePlanToggleData {
  requestId: string
  planId: string
  vehicleIds: string[] // 目标车辆ID集合 (待确认)
  visible?: boolean  // true为显示，false为隐藏 (待确认)
  [key: string]: any // 预留扩展字段
}
```

### 3.5 联动单位数据类型过滤（dispatch.linked_unit.filter）

**触发方**：HOST
**目标方**：DISPATCH
**说明**：根据外部传入的类型对地图上的联动单位进行过滤显示。

```ts
interface LinkedUnitFilterData {
  requestId: string
  types: string[] // 需要显示的联动单位类型编码数组（如为空数组则隐藏全部，包含"all"则显示全部）
}
```

---

## 4. 发送数据到外部事件详细定义 (DISPATCH → HOST)

### 4.1 车辆拾取（dispatch.vehicle.pick）

**触发方**：DISPATCH
**目标方**：HOST
**说明**：用户在地图上点击某车辆图标后，将该车辆的数据传递给外部系统（通常用于外部确认并新增为待命车辆）。

```ts
interface DispatchVehiclePickData {
  pickId: string
  vehicle: {
    id: string
    plateNo: string
    lonlat: [number, number]
    carType?: string
    status?: string
    [key: string]: any
  }
}
```