# GIS 后端微服务能力清单

> 本文档为《GIS 端整体架构_v2》子文档，定义后端需要向前端 GIS 模块提供的能力，按通信方式分为 HTTP API 和 WebSocket 推送两类。

---

## 一、WebSocket 推送（单连接，多频道订阅）

### 连接模型

前端建立一个 WebSocket 连接，通过订阅消息声明关心的频道，所有推送以 `{ type, data }` JSON 格式下发。

```
前端                                    后端
  │                                      │
  │──── WS 单连接 ──────────────────────→│
  │                                      │
  │  subscribe: {                         │
  │    channels: [                        │
  │      "vehicle.position",              │
  │      "vehicle.status_changed",        │
  │      "traffic.updated",              │
  │      "incident.*"                    │
  │    ]                                  │
  │  }                                    │
  │                                      │
  │←── { type: "vehicle.position",        │
  │      data: { vehicleId, lat, lng,     │
  │              heading, speed } }       │
  │←── { type: "vehicle.arrived",         │
  │      data: { vehicleId, timestamp } } │
```

**设计理由**：单连接避免移动端多连接开销（MDT/单兵端）；频道化订阅让前端按场景按需注册（如 `duty` 场景不需要 `vehicle.position`）。

---

### 推送消息清单

#### 1. 车辆实时位置

| 字段 | 说明 |
|------|------|
| type | `vehicle.position` |
| 载荷 | `{ vehicleId, lat, lng, heading, speed }` |
| 频率 | ≥ 2fps（500ms） |
| 消费方 | `RealTimeTracker` → 平滑移动动画 |
| 订阅时机 | `tracking` 场景进入时订阅，退出时取消 |

#### 2. 车辆状态变更（含到场）

| 字段 | 说明 |
|------|------|
| type | `vehicle.status_changed` |
| 载荷 | `{ vehicleId, status: 'standby' \| 'en_route' \| 'arrived' \| ... , timestamp }` |
| 触发条件 | 车载终端 / APP 手动变更车辆状态 |
| 消费方 | `GISAppService` → 发布 `VehicleArrived` 事件 → `SceneManager` 自动切 `on_scene` |
| 订阅时机 | `dispatch` 场景调派后订阅 |

> **注意**：到场不是通过 GPS 围栏碰撞检测的，而是车载终端（或单兵 APP）上人员手动设置状态为"到场"后，后端状态机变更推送。

#### 3. 路况实时更新

| 字段 | 说明 |
|------|------|
| type | `traffic.updated` |
| 载荷 | `{ segments: [{ segmentId, color: 'red' \| 'yellow' \| 'green' }] }` |
| 触发条件 | 路况数据源变更 |
| 消费方 | `RoadHighlightLayer` 动态着色 |
| 订阅时机 | `dispatch` 场景加载战术路网时订阅 |

#### 4. 来电定位推送（运营商/第三方 → 事件总线 → GIS 后端 → 前端）

| 字段 | 说明 |
|------|------|
| type | `incoming_call.position` |
| 载荷 | `{ callId, lng, lat, type: 'cell_tower' \| 'landline', radius }` |
| 触发条件 | 119 接警后运营商/第三方厂商推送来电 GPS 坐标到**后端事件总线服务**（方式不限，非 GIS 后端直收）；GIS 服务订阅该事件总线后，通过 WebSocket 转发给前端 |
| 消费方 | `GISAppService` → 发布 `PositionCircleUpdated` 事件 → `IncomingCallPopupMap` 绘制 500m 粗定位圈 |
| 订阅时机 | 坐席登录后即订阅（`duty` 场景） |

#### 4.1 警情已定位（录入主界面发布 → GIS 前端监听）

| 字段 | 说明 |
|------|------|
| type | `incident.located` |
| 载荷 | `{ incidentId, lng, lat, address }` |
| 触发条件 | 录入主界面选中地址 → 后端业务服务发布「警情已定位」到事件总线（GIS 后端不关心消息来源，仅订阅消息内容）；GIS 服务订阅后 WS 转发 |
| 消费方 | `GISAppService` → hide(粗定位圈) + hide(管辖围栏) + load(微围栏) |
| 订阅时机 | `inquiry` 场景进入时订阅 |

> **数据链路**：
> ```
> 运营商/第三方 →（任意方式）→ 后端事件总线服务 →（订阅）→ 后端 GIS 服务 →（WS）→ GIS 前端
> ```
> 前端不做 poll 也不做 HTTP GET。运营商和 GIS 后端没有直接耦合，中间通过事件总线解耦。

#### 5. 警情数据变更

| type | 载荷 | 触发条件 | 消费方 |
|------|------|---------|--------|
| `incident.created` | `{ incidentId, lat, lng, level, type }` | 新警情产生 | `DutyOverviewMap` 添加标记 |
| `incident.closed` | `{ incidentId }` | 警情关闭 | `DutyOverviewMap` 移除标记 |

订阅时机：`duty` 场景进入时订阅。

---

## 二、HTTP API（请求-响应）

### 1. 地址解析（录入主界面 / AI 语音分析调用，非 GIS 前端）

> 地址解析 API 由录入主界面和 AI 语音分析直接调用，不属于 GIS 前端组件的消费范围。

| 接口 | 方法 | 入参 | 出参 | 用户故事 |
|------|------|------|------|---------|
| `正向地理编码` | GET | address（文本）, city? | `[{ lng, lat, address, confidence }]` | 3.3 |
| `逆向地理编码` | GET | lng, lat | `{ address, poi? }` | 3.3 |
| — | — | **来电定位非 HTTP 拉取**，链路为 `运营商 → 事件总线 → GIS 后端 → WS → 前端`，见下方 WebSocket 第 4 类 | — |

### 2. 路径规划（RoutePlanner 消费）

| 接口 | 方法 | 入参 | 出参 | 用户故事 |
|------|------|------|------|---------|
| `路线规划` | POST | origins: [{lng,lat}], destination, vehicleType? | `{ routeId, geometry: LineString, eta, distance }` | 3.4.5 |
| `ETA 重算` | GET | routeId, currentPosition | `{ eta, distance_remaining }` | 3.4.5 |

> `vehicleType` 用于消防车限高/限宽/禁行约束（如云梯车 vs 普通主战车路径不同）。

### 3. 空间查询（SpatialQuery 消费）

| 接口 | 方法 | 入参 | 出参 | 用户故事 |
|------|------|------|------|---------|
| `周边查询` | GET | lng, lat, radius, resourceTypes[] | `[{ resourceId, type, lng, lat, name }]` | 3.3 |
| `几何相交检测` | POST | geometry: Circle \| Polygon, fenceTypes[] | `[{ fenceId, name, overlapArea }]` | 3.3 |

### 4. 图层数据（LayerManager / FenceLayer 消费）

| 接口 | 方法 | 入参 | 出参 | 用户故事 |
|------|------|------|------|---------|
| `未结案警情` | GET | — | GeoJSON FeatureCollection | 3.1 |
| `值守基础图层` | GET | city? | `{ jurisdictions, traffic, keyUnits, crowdedAreas, communities }` | 3.1 |
| `管辖围栏` | GET | stationId | Polygon \| MultiPolygon | 3.3, 3.4.1 |
| `AOI3 微围栏` | GET | lng, lat | `{ polygon, entrances: [{lng,lat}] }` | 3.3, 3.4.2 |
| `建筑围栏` | GET | aoiId | `[{ buildingId, polygon, name }]` | 3.3 |
| `资源点` | GET | aoiId | `[{ resourceId, type: 'hydrant' \| ..., lng, lat }]` | 3.4.2 |

### 5. 调派（DispatchInteractor 消费）

| 接口 | 方法 | 入参 | 出参 | 用户故事 |
|------|------|------|------|---------|
| `可用车辆查询` | GET | stationIds[] | `[{ vehicleId, type, status, lng, lat }]` | 3.4.3 |
| `预案推荐编队` | GET | incidentType, lng, lat | `[{ vehicleId, isRecommended }]` | 3.4.3 |
| `一键调派下发` | POST | `{ incidentId, vehicleIds[] }` | `{ dispatchId, status }` | 3.4.4 |

### 6. 配置

| 接口 | 方法 | 入参 | 出参 |
|------|------|------|------|
| `GIS 默认配置` | GET | — | `{ defaultCenter, defaultZoom, defaultLayers }` |

---

## 三、前端 vs 后端计算边界

| 能力 | 谁算 | 理由 |
|------|------|------|
| 粗定位圈跨越管辖边界相交检测 | **前端** `GeofenceDetector` | 非实时高频，后端 HTTP 返回几何体，前端本地做碰撞判定 |
| 重叠面积计算 | **后端** | 后端 HTTP 返回 overlapArea，前端 `FenceLayer` 做排序和主围栏标记 |
| 车辆到场检测 | **后端** | 车载终端手动设状态 → 后端状态机变更 → 推送 |
| ETA 计算/重算 | **后端** | 需要路径引擎 + 路况数据，前端不可能做 |
| 车辆平滑移动动画 | **前端** `RealTimeTracker` | 纯视觉渲染，后端只管推原始 [lng, lat] |
| 预案推荐编队匹配 | **后端** | 需要预案库 + 规则引擎 |

---

## 四、与前端组件的对应关系

| 前端消费组件 | HTTP API | WS 推送 |
|-------------|---------|---------|
| — | 地址解析 × 2（正向/逆向）— 由录入主界面和 AI 调用 | — |
| `RoutePlanner` | 路线规划 × 2 | — |
| `SpatialQuery` | 空间查询 × 2 | — |
| `GeofenceDetector` | 几何相交检测（辅助） | — |
| `RealTimeTracker` | — | `vehicle.position` |
| `IncomingCallPopupMap` | — | `incoming_call.position` |
| `FenceLayer` | 管辖围栏、AOI3 微围栏、建筑围栏 | — |
| `RoadHighlightLayer` | — | `traffic.updated` |
| `DispatchInteractor` | 可用车辆、预案推荐、一键调派 | — |
| `DutyOverviewMap` | 未结案警情、值守基础图层 | `incident.*` |
| `GISAppService` | — | `vehicle.status_changed` → 转 `VehicleArrived` 事件 |
| `LayerManager` | 图层数据 × 6 | — |

---

## 五、附录：修正历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1 | — | 初始版本 |
| v2 | — | 到场检测从"GPS 围栏碰撞"修正为"车载终端手动设置状态"；WebSocket 从多连接修正为单连接多频道订阅；移除 `GeofenceDetector` 的到场检测职责 |
