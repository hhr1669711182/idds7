# GIS地图模块 — 技术架构设计文档

> 版本：v2.1（用户故事基线对齐版）
> 日期：2026-07-22
> 状态：正式版

---

## 一、模块定位与架构目标

### 1.1 定位

GIS地图模块是消防接处警系统的**态势呈现层**，承载5大业务场景（S1-S5）的地图可视化与交互能力。模块通过订阅DDD领域事件获取实时态势数据，在地图上广播呈现，**不驱动任何状态机流转**。

### 1.2 架构目标

| 目标 | 描述 |
|------|------|
| 高性能 | 场景初始化 ≤1.5s，地图更新延迟 ≤500ms |
| 高可用 | WebSocket断连3s内自动重连，降级由前端兜底 |
| 可扩展 | BFF层无状态水平扩展，支持 ≥200 坐席并发 |
| 协议统一 | 屏蔽下游多协议（HTTP/MQ/WSS），统一输出给前端 |

---

## 二、系统架构图

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端（Web / 坐席终端）                       │
│   地图组件（ECharts/Mapbox/Leaflet）  │  状态管理（Redux/Vuex）   │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP REST / WebSocket
┌────────────────────────▼────────────────────────────────────────┐
│                      GIS-BFF 服务                               │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │  SceneMgr    │  │ LayerAgg     │  │ ProtocolConverter  │   │
│  │  场景管理器   │  │ 图层聚合器    │  │ 协议转换器          │   │
│  └──────────────┘  └──────────────┘  └────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ EventRouter  │  │ TrafficPoller│  │ RoutePlanner       │   │
│  │ 事件路由器    │  │ 路况轮询器    │  │ 路径规划器          │   │
│  └──────────────┘  └──────────────┘  └────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
    ┌──────────┐   ┌──────────┐  ┌────────────┐
    │ GeoServer │   │ 警情生命 │  │ 高德开放平台│
    │  (WMS/WFS)│   │  周期    │  │ (路径/路况) │
    └──────────┘   └──────────┘  └────────────┘
    ┌──────────┐   ┌──────────┐  ┌────────────┐
    │ 车辆管理  │   │ 接警问询  │  │ 调派模块   │
    └──────────┘   └──────────┘  └────────────┘
    ┌──────────┐   ┌──────────┐  ┌────────────┐
    │ 预案管理  │   │ 移动指挥  │  │ 灾害画像   │
    └──────────┘   └──────────┘  └────────────┘
```

### 2.2 GIS-BFF 内部模块划分

```
GIS-BFF
├── SceneMgr（场景管理器）
│   ├── 场景状态机（S1-S5切换链路）
│   ├── 场景切换时的图层组合计算
│   └── 场景配置下发（zoom_range / center_constraint）
│
├── LayerAgg（图层聚合器）
│   ├── GeoServerAdapter（WFS/WMS适配）
│   │   ├── WFS查询 → GeoJSON转换
│   │   ├── 过滤器构建（operator_id / geom_within / buffer）
│   │   └── 缓存策略（静态图层TTL=∞，动态图层TTL=0）
│   ├── DomainEventListener（DDD领域事件监听）
│   │   ├── 警情事件订阅（MQ Consumer）
│   │   ├── 车辆事件订阅（MQ Consumer）
│   │   └── 调派事件订阅（MQ Consumer）
│   └── LayerMerger（图层合并）
│       ├── 多源数据按layer_name合并
│       └── DIFF模式下计算增量更新
│
├── ProtocolConverter（协议转换器）
│   ├── HttpController（HTTP接口层）
│   │   └── Spring MVC / FastAPI 路由
│   ├── WebSocketHandler（WebSocket会话管理）
│   │   ├── ChannelManager（通道管理）
│   │   ├── SessionRegistry（会话注册/注销）
│   │   └── HeartbeatManager（心跳15s检测）
│   └── MessageFormatter（消息格式化）
│       └── 统一JSON封装（channel / message_id / timestamp / event_type / payload）
│
├── EventRouter（事件路由器）
│   ├── 接收前端交互事件（VEHICLE_SELECTED / ONE_CLICK_DISPATCH）
│   ├── 路由至下游服务（调派模块 / 车辆管理）
│   └── 统一错误处理和重试
│
├── TrafficPoller（路况轮询器）
│   ├── 30s固定频率轮询高德路况API
│   └── 广播路况变更事件至WebSocket通道
│
└── RoutePlanner（路径规划器）
    ├── 接收车辆GPS位置更新
    ├── 调用高德路径规划API
    ├── 30s更新频率
    └── 计算ETA和备选路线
```

---

## 三、技术选型

### 3.1 核心框架

| 组件 | 选型 | 说明 |
|------|------|------|
| 运行环境 | Node.js 18+ / Java 17+ | 推荐Node.js（与OpenClaw一致） |
| Web框架 | Express / NestJS 或 Spring Boot | REST + WebSocket联合承载 |
| MQ消费 | RabbitMQ / Kafka Client | 订阅警情/车辆/调派事件 |
| DB | PostgreSQL + PostGIS | GIS数据持久化，图层配置存储 |
| 缓存 | Redis | 场景状态缓存 / WebSocket会话状态 |
| GIS引擎 | GeoServer | WMS/WFS服务，前端直连调用，BFF仅提供视图名称+可见性 |
| 地图渲染（前端） | ECharts + Leaflet / Mapbox | 推荐ECharts GL（支持大规模散点） |
| 实时通信 | Socket.IO / ws | WebSocket，双通道支持 |

### 3.2 关键库

| 用途 | 库名 | 说明 |
|------|------|------|
| WFS查询 | node-fetch + xml2js | GeoServer WFS请求 |
| GeoJSON圆生成 | @turf/circle | 将(lng,lat,radius)转为GeoJSON Polygon |
| MQ消费 | amqplib / kafkajs | RabbitMQ或Kafka消费者 |
| Redis客户端 | ioredis | 图层配置缓存 / 会话状态 |
| 日志 | pino / logback | 结构化日志 |
| 链路追踪 | OpenTelemetry | 全链路可观测 |

---

## 四、接口设计

### 4.1 HTTP REST API（场景初始化 & 命令）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /gis/v2/scenes/{scene}/init | 场景初始化（全量图层数据） |
| GET | /gis/v2/layers/config | 获取图层配置 |
| PUT | /gis/v2/layers/config | 保存图层配置 |
| POST | /gis/v2/dispatch/vehicles/select | 车辆选中/取消选中 |
| POST | /gis/v2/dispatch/submit | 一键调派提交 |
| GET | /gis/v2/vehicles/station/{org_id} | 队站车辆列表 |
| GET | /gis/v2/vehicles/multi/query | 多车位置查询（≤500辆） |
| GET | /gis/v2/vehicles/{car_id}/track | 车辆历史轨迹 |
| GET | /gis/v2/routes/plan | 高德路径规划 |
| GET | /gis/v2/incidents/{incident_id}/layer-data | 警情图层数据 |

### 4.2 WebSocket订阅通道

| 通道 | 方向 | 内容 |
|------|------|------|
| `gis.layer.{scene}` | BFF→前端 | 场景图层数据推送（实时） |
| `gis.event.{incident_id}` | BFF→前端 | 单警情相关事件 |
| `gis.vehicle.{car_id}` | BFF→前端 | 单车实时位置（30s更新） |
| `gis.traffic` | BFF→前端 | 实时路况（30s刷新） |
| `gis.ws.cmd` | 前端→BFF | 前端命令（场景切换确认/取消视图切换） |

---

## 五、核心流程设计

### 5.1 场景初始化流程（S4-调派为例）

```
前端                        GIS-BFF                      下游服务
  │                            │                             │
  │ POST /gis/v2/scenes/S4/init│                             │
  │  incident_id=INC001       │                             │
  │  primary_org_id=ORG001     │                             │
  │───────────────────────────>│                             │
  │                            │ GET gis:view_juris_zone    │
  │                            │  address=警情地址            │
  │                            │───────────────────────────>GeoServer
  │                            │<───────────────────────────GeoServer
  │                            │                             │
  │                            │ GET gis:view_res_org_dept   │
  │                            │  filter: org_id=ORG001      │
  │                            │───────────────────────────>GeoServer
  │                            │<───────────────────────────GeoServer
  │                            │                             │
  │                            │ GET /vehicles?org_id=ORG001│
  │                            │  &status=DAILY_STANDBY    │
  │                            │───────────────────────────>车辆管理
  │                            │<───────────────────────────车辆管理
  │                            │                             │
  │                            │ GET /dispatch/plan?         │
  │                            │  incident_id=INC001       │
  │                            │───────────────────────────>调派模块
  │                            │<───────────────────────────调派模块
  │                            │                             │
  │                            │ GET /preplan/recommended?  │
  │                            │  incident_id=INC001       │
  │                            │───────────────────────────>预案管理
  │                            │<───────────────────────────预案管理
  │                            │                             │
  │                            │ 并行：WFS建筑/消防栓/出入口   │
  │                            │───────────────────────────>GeoServer
  │                            │<───────────────────────────GeoServer
  │                            │                             │
  │<──────────────────────────│ { layers: {...} }           │
  │                            │                             │
  │ WS订阅 gis.layer.S4       │                             │
  │<──────────────────────────│ 订阅成功                     │
  │                            │                             │
  │ 30s后                      │                             │
  │<──────────────────────────│ LAYER_UPDATE(traffic)       │
  │                            │                             │
```

### 5.2 车辆调派交互流程（S4）

```
前端                     GIS-BFF                    调派模块               车辆管理
  │                       │                          │                     │
  │ 点击车辆图标           │                          │                     │
  │ VEHICLE_SELECTED       │                          │                     │
  │──────────────────────>│                          │                     │
  │                       │ 记录前端临时选中状态        │                     │
  │                       │ [Redis: selected_vehicles]│                     │
  │                       │ 同步至右侧调派表单          │                     │  ← US4-6双向同步
  │<──────────────────────│ { selected_vehicles }     │                     │
  │                       │                          │                     │
  │ 点击"一键调派"         │                          │                     │
  │ ONE_CLICK_DISPATCH     │                          │                     │
  │──────────────────────>│                          │                     │
  │                       │ POST /dispatch/orders    │                     │
  │                       │────────────────────────>│                     │
  │                       │<────────────────────────│ DISPATCH_CONFIRMED  │
  │                       │                          │                     │
  │                       │ 启动5s超时监控             │                     │  ← US4-6冲突检测
  │                       │ MQ: DispatchConfirmed     │                     │
  │                       │────────────────────────>│                     │
  │                       │                          │<────────────────────│
  │                       │                          │                     │
  │ 前端已刷新，同步确认     │                          │                     │
  │<──────────────────────│ [超时内收到前端刷新]        │                     │
  │                       │ 取消警告                   │                     │
  │                       │                          │                     │
  │ 或 5s内未刷新          │                          │                     │
  │<──────────────────────│ DISPATCH_CONFLICT_WARNING │                     │
  │  弹窗：已有调派单生成    │                          │                     │
  │                       │                          │                     │
  │<──────────────────────│ DISPATCH_CONFIRMED       │                     │
  │ 显示"等待队站确认"      │                          │                     │
  │                       │                          │                     │
```

### 5.3 首车到场视图切换流程（S5）

```
车辆管理/移动指挥           GIS-BFF                   前端
     │                       │                        │
     │ VehicleArrived(first)  │                        │
     │ MQ事件                 │                        │
     │──────────────────────>│                        │
     │                       │ 判断是否为"首车"         │
     │                       │                        │
     │                       │ WS: VIEW_SWITCH         │
     │                       │ { countdown: 3s }      │
     │                       │──────────────────────->│
     │                       │                        │
     │                       │        3s倒计时中...     │
     │                       │                        │
     │                       │ WS: VIEW_SWITCH_CANCELLED（用户取消）│
     │                       │<──────────────────────│
     │                       │  取消切换，维持宏观视图    │
     │                       │                        │
     │                       │ 或 3s后：               │
     │                       │                        │
     │                       │ WS: MICRO_VIEW_ENGAGED  │
     │                       │ { zoom: 16, center: }   │
     │                       │──────────────────────->│
     │                       │                        │
```

---

## 六、数据模型

### 6.1 BFF核心实体

#### SceneContext（场景上下文）

```typescript
interface SceneContext {
  scene: 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
  operator_id: string;
  incident_id?: string;
  inquiry_id?: string;
  call_id?: string;
  primary_org_id?: string;
  status: 'ACTIVE' | 'TRANSITIONING' | 'DISPOSED';
  entry_time: string;           // ISO8601
  layer_config: LayerToggle;
  // US1-4 新增：地图中心点同步
  map_center: { lng: number; lat: number; zoom: number };
  micro_region_enabled: boolean; // 微区域模型联动开关
}
```

#### LayerToggle（图层开关配置）

```typescript
interface LayerToggle {
  city_base: boolean;
  org_zones: boolean;
  road_network: boolean;
  traffic_realtime: boolean;
  key_enterprises: boolean;      // 重点单位
  micro_fence: boolean;         // 微围栏（兴趣面/小区围栏，同一数据）
  buildings: boolean;
  key_landmarks: boolean;        // 重点地标
  hydrants: boolean;             // 消防栓
  entrances: boolean;            // 出入口
  muster_zone: boolean;         // 集结区
  location_circle: boolean;      // 500m定位圈
  jurisdiction_circle: boolean;  // 管辖范围圈
  micro_fence: boolean;          // 微围栏
  incident_icons: boolean;
  similar_icons: boolean;
  vehicle_icons: boolean;
  navigation_lines: boolean;
  trajectory_lines: boolean;
}
```

#### VehicleContext（车辆上下文）

```typescript
interface VehicleContext {
  car_id: string;
  car_name: string;
  car_type: string;
  plate_number: string;
  org_id: string;
  status: VehicleStatus;         // DAILY_STANDBY / DISPATCHED / ARRIVED / ...
  lng: number;
  lat: number;
  speed_kmh: number;
  heading: number;               // 方向角，0-360
  gps_time: string;
  is_primary_org: boolean;       // 是否主管队站车辆
  is_preplan_recommended: boolean;
  is_selected: boolean;          // 前端临时选中状态
  is_selectable: boolean;        // 是否可勾选（非待命车不可勾选）
  eta_minutes?: number;
  distance_km?: number;
  capacity?: string;             // 如"泡沫4吨"
}
```

### 6.2 新增模块：MapCenterSync（US1-4联动）

```
前端地图中心点变更 → BFF接收center坐标 → 同步至前端store → 微区域模型触发重新加载
```

**接口：**

| 事件名 | 方向 | payload |
|--------|------|---------|
| MAP_CENTER_CHANGED | 前端→BFF | { operator_id, lng, lat, zoom } |
| MICRO_REGION_RELOAD | BFF→前端 | { center_lng, center_lat, zoom } |

### 6.3 新增模块：SimilarIncidentAggregator（US3-5）

```
BFF接收inquiry_id → 调用AI相似警情推荐API → 聚合微缩模型URL+微缩地图URL → 返回前端
```

**接口：**

| 接口 | 说明 |
|------|------|
| GET /gis/v2/incidents/{id}/similar | 返回相似警情列表含微缩模型/地图 |
| BFF内部聚合 | 合并灾害画像建筑ID + AI推荐相似度 + GeoServer地图瓦片 |

### 6.4 新增模块：BuildingModelProvider（US3-6/3-7）

```
BFF接收building_id → 查询GeoServer gis:view_env_building → 聚合建筑3D模型URL + 着火楼层高亮指令 → 推送至前端
```

**3D着火楼层高亮指令格式：**

```json
{
  "building_id": "B001",
  "floor": 5,
  "highlight_color": "#FF4D4F",
  "highlight_mode": "GLOW"
}
```

### 6.5 新增模块：DispatchConflictDetector（US4-6）

```
BFF记录前端勾选状态 → 后端调派单生成但前端未刷新（5s超时） → BFF推送DISPATCH_CONFLICT_WARNING → 前端告警弹窗
```

**双向同步机制：**

| 方向 | 内容 | 延迟 |
|------|------|------|
| 前端→BFF | 车辆勾选/取消勾选 | ≤100ms |
| BFF→前端 | 当前勾选车辆列表 | ≤200ms（WebSocket实时） |
| BFF告警 | 后端单已生成但前端未刷新 | 5s超时触发 |

### 6.6 新增模块：VehicleHistoryTracker（US5-1）

```
MQ接收vehicle.position.changed → BFF写入Redis（会话级TTL） → 前端查询历史轨迹 → 全会话保留
```

**存储策略：**

| 数据 | 存储 | TTL |
|------|------|-----|
| 车辆实时位置 | Redis GeoHash | 会话周期 |
| 历史轨迹点 | Redis List（car_id → [(lng,lat,gps_time)...]) | 会话周期 |
| 会话生命周期 | S5开始→归队/结案 | — |

---

### 6.7 消息队列Topic定义

| Topic | 来源 | BFF消费动作 |
|-------|------|------------|
| `alarm.created` | 警情生命周期 | 新增红色警情图标 |
| `alarm.status.changed` | 警情生命周期 | 更新图标颜色 |
| `alarm.location.changed` | 警情生命周期 | 更新图标位置 |
| `vehicle.status.changed` | 车辆管理 | 更新车辆图标状态 |
| `vehicle.position.changed` | 车辆管理/移动指挥 | 更新车辆位置/轨迹 |
| `vehicle.arrived` | 车辆管理 | 触发首车到场倒计时 |
| `vehicle.returned` | 车辆管理 | 消除车辆图标 |
| `dispatch.confirmed` | 调派模块 | 切换到跟踪模式 |
| `dispatch.car.added` | 调派模块 | 显示绿色导航连线 |
| `dispatch.car.removed` | 调派模块 | 消除导航连线 |
| `dispatch.shortage` | 调派模块 | 显示缺车提示 |
| `call.ringing` | 报警接入 | 绘制500m定位圈 |
| `call.ended` | 报警接入 | 清除/渐隐定位圈 |
| `inquiry.created` | 接警问询 | 展示管辖范围圈 |
| `micro.fence.confirmed` | 接警问询 | 隐藏粗定位圈，展示微围栏 |
| `preplan.recommended` | 预案管理 | 金色高亮推荐车辆 |

---

## 七、前端地图组件设计

### 7.1 ECharts 地图层叠结构

```
┌─────────────────────────────────────────────┐
│  ECharts GL Map Canvas                       │
│  ┌───────────────────────────────────────┐  │
│  │ Layer 0: 矢量底图 / 3D白膜             │  │
│  │ Layer 1: GeoJSON 静态图层（WFS渲染）   │  │
│  │ Layer 2: 动态点位图层（scatter）       │  │
│  │ Layer 3: 动态线图层（line）            │  │
│  │ Layer 4: 标签/文字overlay（text）      │  │
│  │ Layer 5: 圆/面填充overlay（polygon）   │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### 7.2 图层渲染协议

前端接收BFF推送的图层数据后，按以下规则渲染：

| layer_name | ECharts type | 关键配置 |
|------------|--------------|---------|
| `org_zones` | `graphgl` / `scatter` | GeoJSON polygon fill |
| `road_network` | `lines` | lineStyle: { width: 分级宽度 } |
| `traffic_realtime` | `lines` | lineStyle.color = traffic_color |
| `incident_icons` | `scatter` | symbol = icon_url, color = status_color |
| `vehicle_icons` | `scatter` | symbol = icon_url, symbolSize分级 |
| `navigation_lines` | `lines` | lineStyle.color = `#52C41A` |
| `trajectory_lines` | `lines` | 灰色=历史，深绿=选中预测，浅绿=备选 |
| `location_circle_500m` | `polygon` | fillColor=rgba半透明，border=醒目色 |
| `micro_fence` | `polygon` | fillColor=半透明高亮色 |
| `muster_zone` | `polygon` | 静态展示 |
| `building_model` | `custom` | 3D模型渲染（Mapbox GL或ECharts GL），支持楼层高亮指令 |
| `similar_incident_markers` | `scatter` | 相似警情微缩地图标注，symbol=微缩图 |

### 7.3 状态-图标颜色映射

| 警情状态 | 图标颜色 |
|---------|---------|
| CREATED / PRE_DISPATCHED / FORMAL_DISPATCHED / DISPATCHED / ARRIVED / OPERATION_COMPLETED | `#FF4D4F`（红） |
| RETURNED | `#1890FF`（蓝） |
| POST_ACTION_REVIEWED | 地图消除 |

| 路况状态 | 路线颜色 |
|---------|---------|
| 畅通 SMOOTH | `#52C41A`（绿） |
| 缓慢 SLOW | `#FAAD14`（黄） |
| 拥堵 CONGESTED | `#FF4D4F`（红） |
| 未知 UNKNOWN | `#BFBFBF`（灰） |

---

## 八、关键设计决策

| # | 决策点 | 结论 | 理由 |
|---|--------|------|------|
| D1 | BFF vs 直连前端 | BFF聚合下游服务，前端不直连DDD领域服务 | 减少前端复杂度，统一协议，隐藏下游接口细节 |
| D2 | GeoServer格式 | WFS GeoJSON优先，非WMS Image | 前端直连GeoServer直接调用，BFF不代理；WFS GeoJSON格式便于前端直接渲染 |
| D3 | 车辆GPS推送 | MQ订阅，非HTTP轮询 | 实时性要求高（30s），MQ更高效 |
| D4 | 实时路况 | BFF 30s轮询，非前端直连 | BFF统一处理高德API限流和token管理 |
| D5 | 路径规划 | BFF调用高德，非前端直连 | 涉及敏感坐标，API Key不宜暴露前端 |
| D6 | 场景状态存储 | Redis，按operator_id分key | 支持坐席多端漫游（同一坐席不同终端） |
| D7 | 500m定位圈 | BFF生成GeoJSON圆Polygon，不依赖GeoServer | 快速响应，GeoServer不擅长动态圆生成 |
| D8 | 图层DIFF更新 | BFF计算DIFF后推送增量，非全量 | 减少WebSocket带宽占用 |
| D9 | 首车到场切换 | BFF推送倒计时，前端执行动画 | 减少前端耦合，确保时序一致性 |
| D10 | 降级策略 | BFF故障时前端读取缓存+提示"数据暂不更新" | 不阻断核心业务流程 |

---

## 九、部署架构

### 9.1 容器化部署

```
┌──────────────────────────────────────────────┐
│  Kubernetes Cluster                          │
│                                              │
│  ┌─────────────┐  ┌─────────────┐           │
│  │  GIS-BFF    │  │  GIS-BFF    │  (≥2副本)  │
│  │  Pod        │  │  Pod        │            │
│  └──────┬──────┘  └──────┬──────┘           │
│         │                │                   │
│  ┌──────▼────────────────▼──────┐           │
│  │     LoadBalancer (ClusterIP)  │           │
│  └──────────────┬───────────────┘           │
└─────────────────┼────────────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
 GeoServer    RabbitMQ     PostgreSQL
                             + PostGIS
```

### 9.2 资源配置建议

| 组件 | 规格 | 说明 |
|------|------|------|
| GIS-BFF Pod | 2核CPU / 4GB内存 | 建议≥2副本，HPA自动扩缩 |
| GeoServer | 4核CPU / 8GB内存 | 静态图层服务，SSD存储 |
| PostgreSQL/PostGIS | 4核CPU / 16GB内存 | GIS数据存储，SSD |
| Redis | 2核 / 4GB | 缓存+会话，Redis Cluster |

---

## 十、可观测性设计

### 10.1 关键指标

| 指标名 | 类型 | 告警阈值 |
|--------|------|---------|
| 场景初始化耗时P99 | Histogram | >1500ms |
| MQ消息处理延迟 | Histogram | >500ms |
| WebSocket连接数 | Gauge | <2 或 >上限×0.9 |
| 高德API调用失败率 | Counter | >1% |
| GeoServer WFS响应时间 | Histogram | >2000ms |

### 10.2 日志规范

```
字段：timestamp / level / trace_id / scene / operator_id / incident_id / action / duration_ms / status
结构化JSON输出，trace_id贯穿一次完整请求链路
```

### 10.3 链路追踪

```
前端请求 → GIS-BFF HTTP入口 → LayerAgg.WFS查询 → GeoServer
                     ↓
              MQ事件消费 → DomainEventListener → WebSocket推送
```

---

## 十一、后续工作项

- [ ] 与预案管理模块确认微围栏数据接口
- [ ] 与高德/第三方确认路况API接入规格和配额
- [ ] 与移动指挥模块确认车辆主动上报MQ协议
- [ ] 与调派模块确认"等待确认"状态定义
- [ ] 与UI团队确认2D/3D切换技术方案和图标资源
- [ ] 性能压测：200坐席并发下场景初始化P99
- [ ] 故障演练：BFF单节点挂掉后前端降级验证
