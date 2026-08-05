# 统一语言词典 — GIS 前端（v1.0 完整版）

> 版本: v1.0 | 日期: 2026-07-24 | 范围: GIS 前端运行时上下文
> Author: GIS 前端架构组
> 适用文档集: 00~12 + 协议层 DTO Schema
> 维护原则: 与五层架构 (Service→Protocol→Calc→Ctrl→Render) 一一对应；任何新增术语必须先入词典再写代码。

---

## 1. 业务对象完整表

| 术语ID | 业务术语 | 模型角色 | 业务定义 |
| ------ | -------- | -------- | -------- |
| GL-G001 | 警情 | 聚合根 | 消防接处警系统的核心业务实体，承载灾情位置、类型、严重等级、生命周期等 |
| GL-G002 | 来电 | 实体 | 报警人通过电话渠道触发的入站事件，绑定地理位置与基础问询信息 |
| GL-G003 | 问询 | 值对象 | 接警员在电话中收集的灾情要素（地址、类型、伤亡等），归属某次来电 |
| GL-G004 | 调派计划 | 聚合根 | 接警员基于警情制定的派车方案，包含目标车辆、算路结果、围栏 |
| GL-G005 | 调派路径 | 值对象 | 调派计划下的算路结果，WGS84 坐标串 |
| GL-G006 | 车辆 | 聚合根 | 出警车辆实体，承载 GPS、状态、绑定警情 |
| GL-G007 | 跟踪会话 | 值对象 | 车辆跟踪的运行时绑定关系（车辆+地图+摄像头联动） |
| GL-G008 | 值守视图 | 值对象 | 接警员未接警时的全中心基础地图视图 |
| GL-G009 | 围栏 | 值对象 | 地图上以某点为圆心的可视化范围（四级：1km/500m/200m/100m） |
| GL-G010 | 资源图层 | 实体 | GIS 底图之上的业务图层（兴趣面、出入口、消防栓、道路、车辆等） |
| GL-G011 | 视野 | 值对象 | 地图当前的可视范围（中心点 + 缩放级别 + 旋转角） |
| GL-G012 | 焦点 | 值对象 | 当前拥有视野控制权的业务域标记 |
| GL-G013 | 协议事件 | 业务事件 | 业务控制层发布的 `MessageEnvelope<T>` 标准事件 |
| GL-G014 | 通用控制指令 | 值对象 | 通用控制层输入指令集（Generic Control Input DTOs） |
| GL-G015 | 操作记录 | 值对象 | 关键节点操作记录（操作人、原因、时间、结果） |
| GL-G016 | 业务控制层 | 架构层 | 6 个业务控制器的统称（Alarm/Call/Inquiry/Dispatch/Duty/Tracking） |
| GL-G017 | 通用控制层 | 架构层 | 4 个通用控制器的统称（Geometry/Kinematic/Spatial/View） |
| GL-G018 | IO 控制层 | 架构层 | 2 个 IO 控制器的统称（Input/Output） |
| GL-G019 | 协议层 | 架构层 | Service 与 Ctrl 之间的标准契约层，定义 `MessageEnvelope<T>` |
| GL-G020 | 渲染层 | 架构层 | OpenLayers/ThreeJS 渲染引擎与图元管理 |
| GL-G021 | Web Worker | 基础设施 | 高频计算（GPS 围栏）的跨线程容器 |
| GL-G022 | 业务 ID 前缀 | 规约 | 图元 ID 的强制前缀（`alarm_` / `call_` / `route_` / `plan_` / `vehicle_` / `trail_`） |
| GL-G023 | 坐标系 | 规约 | 协议层 / 服务层强约束 WGS84，进入渲染层前由底座插件转换 |
| GL-G024 | Auto-Fit Padding | 规约 | 视野自适应保留 10%~15% 留边 |
| GL-G025 | 视野失联 | 业务事件 | 车辆 GPS 信号丢失 > 30s，标记 `GPS_LOST` 并保留最后位置 |
| GL-G026 | 算路降级 | 业务事件 | 算路失败时降级为直线段并打点 `ROUTE_FALLBACK` |
| GL-G027 | 焦点冲突 | 业务事件 | 同帧多个业务域争夺焦点时按优先级裁决 |
| GL-G028 | 跟踪聚合 | 值对象 | 跟踪车辆 > 50 辆时进入的聚合渲染模式（热力图） |
| GL-G029 | 弹屏排队 | 值对象 | 同时来电 > 3 路时进入的排队模式 |
| GL-G030 | 业务不变量 | 规约 | protectInvariants 校验的 5 条强制规则（坐标系、ID 前缀、状态机、焦点、权限） |

---

## 2. 详细术语定义

### GL-G001 警情（AlarmProfile）｜聚合根

**业务定义**：消防接处警系统的核心业务实体，承载灾情位置、类型、严重等级、生命周期等。

**关键属性**

| 字段 | 业务术语名称 | 类型 | 必填 | 业务定义 | 来源 |
| ---- | ------------ | ---- | ---- | -------- | ---- |
| alarmId | 警情 ID | String | ✅ | 全局唯一警情标识 | 系统生成 |
| alarmLocation | 警情位置 | GeoPoint(WGS84) | ✅ | 警情发生地点（经度、纬度） | 订阅通道 |
| alarmType | 警情类型 | AlarmType | ✅ | 火灾 / 救援 / 抢险等 | 订阅通道 |
| severityLevel | 严重等级 | SeverityLevel | ✅ | 1~5 级 | 订阅通道 |
| occurredAt | 发生时间 | DateTime | ✅ | 警情发生时间戳 | 订阅通道 |
| status | 警情状态 | AlarmStatus | ✅ | CREATED/INQUIRING/DISPATCHED/ON_SCENE_HANDLING/RE_DISPATCH/CLOSED | 业务控制层 |
| callId | 关联来电 ID | String | | 警情绑定的来电 ID | 业务控制层 |
| vehicleIds | 关联车辆 ID 列表 | String[] | | 警情派出的车辆 ID 列表 | 业务控制层 |

---

### GL-G002 来电（CallLocation）｜实体

**业务定义**：报警人通过电话渠道触发的入站事件，绑定地理位置与基础问询信息。

**关键属性**

| 字段 | 业务术语名称 | 类型 | 必填 | 业务定义 | 来源 |
| ---- | ------------ | ---- | ---- | -------- | ---- |
| callId | 来电 ID | String | ✅ | 全局唯一来电标识 | 系统生成 |
| callerNumber | 主叫号码 | String | ✅ | 报警人电话号码 | CTI |
| callLocation | 来电位置 | GeoPoint(WGS84) | ✅ | 来电定位（基站/手动） | CTI |
| arrivedAt | 弹屏时间 | DateTime | ✅ | 来电进入前端时间 | 系统记录 |
| alarmId | 关联警情 ID | String | | 转警情后的关联 ID | 业务控制层 |
| payload | 问询信息 | InquiryPayload | | 来电过程中收集的问询内容 | 接警员输入 |

---

### GL-G003 问询（InquiryPayload）｜值对象

**业务定义**：接警员在电话中收集的灾情要素（地址、类型、伤亡等），归属某次来电。

**关键属性**

| 字段 | 业务术语名称 | 类型 | 必填 | 业务定义 | 来源 |
| ---- | ------------ | ---- | ---- | -------- | ---- |
| address | 事发地址 | String | ✅ | 接警员确认的精确地址 | 接警员输入 |
| disasterType | 灾情类型 | DisasterType | ✅ | 火灾 / 车祸 / 溺水等 | 接警员输入 |
| casualties | 伤亡情况 | String | | 人员伤亡描述 | 接警员输入 |
| trappedPersons | 受困人数 | Integer | | 受困人员数量 | 接警员输入 |
| extraInfo | 补充信息 | String | | 其他需要说明的信息 | 接警员输入 |

---

### GL-G004 调派计划（DispatchPlan）｜聚合根

**业务定义**：接警员基于警情制定的派车方案，包含目标车辆、算路结果、围栏。

**关键属性**

| 字段 | 业务术语名称 | 类型 | 必填 | 业务定义 | 来源 |
| ---- | ------------ | ---- | ---- | -------- | ---- |
| planId | 调派计划 ID | String | ✅ | 全局唯一调派计划标识 | 系统生成 |
| alarmId | 关联警情 ID | String | ✅ | 调派对应的警情 ID | 业务控制层 |
| vehicleIds | 调派车辆 ID 列表 | String[] | ✅ | 本次调派的车辆集合 | 接警员选择 |
| status | 调派状态 | DispatchStatus | ✅ | DRAFT/READY/DISPATCHED/EXECUTING/REVOKED/COMPLETED | 业务控制层 |
| route | 调派路径 | DispatchRoute | | 算路结果 | 算路服务 |
| fences | 围栏列表 | Fence[] | | 四级围栏 | 业务控制层 |
| createdAt | 创建时间 | DateTime | ✅ | 接警员创建时间 | 系统记录 |
| submittedAt | 提交时间 | DateTime | | 接警员提交派警时间 | 系统记录 |

---

### GL-G005 调派路径（DispatchRoute）｜值对象

**业务定义**：调派计划下的算路结果，WGS84 坐标串。

**关键属性**

| 字段 | 业务术语名称 | 类型 | 必填 | 业务定义 | 来源 |
| ---- | ------------ | ---- | ---- | -------- | ---- |
| planId | 调派计划 ID | String | ✅ | 关联调派计划 | 业务控制层 |
| coordinates | 路径坐标串 | GeoPoint[](WGS84) | ✅ | 算路返回的 WGS84 坐标点数组 | 算路服务 |
| distance | 路径距离 | Number | ✅ | 单位米 | 算路服务 |
| duration | 路径耗时 | Number | ✅ | 单位秒 | 算路服务 |
| fallback | 是否降级 | Boolean | ✅ | 算路失败时为 true | 业务控制层 |

---

### GL-G006 车辆（VehicleGPS）｜聚合根

**业务定义**：出警车辆实体，承载 GPS、状态、绑定警情。

**关键属性**

| 字段 | 业务术语名称 | 类型 | 必填 | 业务定义 | 来源 |
| ---- | ------------ | ---- | ---- | -------- | ---- |
| vehicleId | 车辆 ID | String | ✅ | 全局唯一车辆标识 | 系统生成 |
| plateNumber | 车牌号 | String | ✅ | 车辆车牌 | 车辆管理 |
| position | 当前位置 | GeoPoint(WGS84) | ✅ | 车辆实时位置 | GPS 推送 |
| status | 车辆状态 | VehicleStatus | ✅ | IN_GARAGE/EN_ROUTE/ON_SCENE/TRANSFERRING/HANDLING/RETURNING/UNAVAILABLE/CLOSED | 业务控制层 |
| currentAlarmId | 当前警情 ID | String | | 当前正在处置的警情 | 业务控制层 |
| lastGpsAt | 最后 GPS 时间 | DateTime | | GPS 最后推送时间 | GPS 推送 |
| gpsLost | GPS 是否丢失 | Boolean | ✅ | GPS 信号丢失 > 30s 标记 | Web Worker |

---

### GL-G007 跟踪会话（TrackingSession）｜值对象

**业务定义**：车辆跟踪的运行时绑定关系（车辆+地图+摄像头联动）。

**关键属性**

| 字段 | 业务术语名称 | 类型 | 必填 | 业务定义 | 来源 |
| ---- | ------------ | ---- | ---- | -------- | ---- |
| sessionId | 会话 ID | String | ✅ | 跟踪会话唯一标识 | 系统生成 |
| vehicleId | 车辆 ID | String | ✅ | 被跟踪的车辆 | 接警员选择 |
| alarmId | 关联警情 ID | String | | 跟踪关联的警情 | 业务控制层 |
| cameraIds | 联动摄像头 ID 列表 | String[] | | 车辆关联的摄像头 | 业务控制层 |
| startedAt | 启动时间 | DateTime | ✅ | 跟踪启动时间 | 系统记录 |

---

### GL-G008 值守视图（DutyView）｜值对象

**业务定义**：接警员未接警时的全中心基础地图视图。

**关键属性**

| 字段 | 业务术语名称 | 类型 | 必填 | 业务定义 | 来源 |
| ---- | ------------ | ---- | ---- | -------- | ---- |
| centerId | 所属指挥中心 ID | String | ✅ | 接警员归属中心 | 权限模块 |
| view | 视野 | View | ✅ | zoom=15 + 全中心 | 业务控制层 |
| layerIds | 加载图层 ID 列表 | String[] | ✅ | 基础底图 + 中心点 | 业务控制层 |

---

### GL-G009 围栏（Fence）｜值对象

**业务定义**：地图上以某点为圆心的可视化范围。

**关键属性**

| 字段 | 业务术语名称 | 类型 | 必填 | 业务定义 | 来源 |
| ---- | ------------ | ---- | ---- | -------- | ---- |
| fenceId | 围栏 ID | String | ✅ | 围栏唯一标识 | 系统生成 |
| center | 圆心 | GeoPoint(WGS84) | ✅ | 围栏圆心坐标 | 业务控制层 |
| radius | 半径 | Number | ✅ | 单位米（四级：1000/500/200/100） | 业务控制层 |
| level | 围栏级别 | FenceLevel | ✅ | L1/L2/L3/L4 | 业务控制层 |
| color | 颜色 | String | ✅ | 淡蓝/浅蓝/中蓝/深蓝 | 业务控制层 |
| style | 线型 | LineStyle | ✅ | 虚线/实线 | 业务控制层 |

---

### GL-G010 资源图层（ResourceLayer）｜实体

**业务定义**：GIS 底图之上的业务图层。

**关键属性**

| 字段 | 业务术语名称 | 类型 | 必填 | 业务定义 | 来源 |
| ---- | ------------ | ---- | ---- | -------- | ---- |
| layerId | 图层 ID | String | ✅ | 资源图层唯一标识 | 资源管理 |
| layerCode | 图层编码 | String | ✅ | gis:env_build_aoi / gis:env_entrance_exit / gis:env_fire_water / gis:env_greatchina_road / gis:fire_vehicle 等 | 资源管理 |
| minZoom | 最小缩放 | Integer | | 图层显示的最小缩放级别 | 资源管理 |
| maxZoom | 最大缩放 | Integer | | 图层显示的最大缩放级别 | 资源管理 |
| visible | 是否可见 | Boolean | ✅ | 当前图层是否可见 | 业务控制层 |

---

### GL-G011 视野（View）｜值对象

**业务定义**：地图当前的可视范围。

**关键属性**

| 字段 | 业务术语名称 | 类型 | 必填 | 业务定义 | 来源 |
| ---- | ------------ | ---- | ---- | -------- | ---- |
| center | 中心点 | GeoPoint(WGS84) | ✅ | 视野中心 | 通用控制层 |
| zoom | 缩放级别 | Number | ✅ | 0~22 | 通用控制层 |
| rotation | 旋转角 | Number | | 视野旋转角度（弧度） | 通用控制层 |
| padding | 留边 | Number | | Auto-Fit 留边 10%~15% | 通用控制层 |

---

### GL-G012 焦点（Focus）｜值对象

**业务定义**：当前拥有视野控制权的业务域标记。

**关键属性**

| 字段 | 业务术语名称 | 类型 | 必填 | 业务定义 | 来源 |
| ---- | ------------ | ---- | ---- | -------- | ---- |
| focusId | 焦点 ID | String | ✅ | 焦点唯一标识 | 系统生成 |
| owner | 焦点拥有者 | FocusOwner | ✅ | 值守/来电/问询/调派/跟踪 | 业务控制层 |
| acquiredAt | 获取时间 | DateTime | ✅ | 焦点获取时间戳 | 系统记录 |

---

### GL-G013 协议事件（MessageEnvelope）｜业务事件

**业务定义**：业务控制层发布的 `MessageEnvelope<T>` 标准事件。

**关键属性**

| 字段 | 业务术语名称 | 类型 | 必填 | 业务定义 | 来源 |
| ---- | ------------ | ---- | ---- | -------- | ---- |
| messageId | 消息 ID | String | ✅ | 全局唯一消息标识 | 系统生成 |
| messageType | 消息类型 | String | ✅ | AlarmChanged/VehicleChanged/DispatchChanged/CallChanged 等 | 业务控制层 |
| payload | 消息载荷 | T | ✅ | 业务数据（业务控制层输出 / 通用控制层输入） | 业务控制层 |
| timestamp | 时间戳 | DateTime | ✅ | 事件发生时间 | 系统记录 |
| source | 消息来源 | String | ✅ | 业务控制层标识 | 业务控制层 |
| version | 协议版本 | String | ✅ | 协议版本号 v1.0 | 协议层 |

---

### GL-G014 通用控制指令（GenericControlInput）｜值对象

**业务定义**：通用控制层输入指令集（Generic Control Input DTOs）。

**关键指令**

| 指令 | 控制器 | 说明 |
| ---- | ------ | ---- |
| `LocateInput` | ViewCtrl | 视野定位指令 |
| `FitInput` | ViewCtrl | 视野自适应指令 |
| `FollowInput` | ViewCtrl | 镜头跟随指令 |
| `DrawGeometryInput` | GeometryCtrl | 几何图形绘制指令 |
| `UpdateKinematicsInput` | KinematicCtrl | 运动学更新指令 |
| `SpatialQueryInput` | SpatialCtrl | 空间查询指令 |

---

### GL-G015 操作记录（OperationLog）｜值对象

**业务定义**：关键节点操作记录（操作人、原因、时间、结果）。

**关键属性**

| 字段 | 业务术语名称 | 类型 | 必填 | 业务定义 | 来源 |
| ---- | ------------ | ---- | ---- | -------- | ---- |
| recordId | 记录 ID | String | ✅ | 操作记录唯一标识 | 系统生成 |
| operationType | 操作类型 | String | ✅ | 派警/结案/视野切换/状态迁移等 | 业务控制层 |
| operatorId | 操作人 ID | String | ✅ | 触发的接警员 / 值班长 ID | 权限模块 |
| reason | 操作原因 | String | | 操作原因描述 | 操作人输入 |
| result | 操作结果 | String | ✅ | 成功/失败/异常 | 业务控制层 |
| operationAt | 操作时间 | DateTime | ✅ | 操作发生时间戳 | 系统记录 |
| context | 操作上下文 | Object | | 操作的业务上下文（警情 ID、车辆 ID 等） | 业务控制层 |

---

### GL-G016~G018 五层架构层

- **GL-G016 业务控制层**：6 个业务控制器（`AlarmCtrl` / `CallCtrl` / `InquiryCtrl` / `DispatchCtrl` / `DutyCtrl` / `TrackingCtrl`），负责装配"业务参数"。
- **GL-G017 通用控制层**：4 个通用控制器（`GeometryCtrl` / `KinematicCtrl` / `SpatialCtrl` / `ViewCtrl`），接收 `GenericControlInput` 执行。
- **GL-G018 IO 控制层**：2 个 IO 控制器（`InputCtrl` / `OutputCtrl`），负责 UI 输入与协议输出。
- **GL-G019 协议层**：Service 与 Ctrl 之间的标准契约层，定义 `MessageEnvelope<T>`。
- **GL-G020 渲染层**：OpenLayers/ThreeJS 渲染引擎与图元管理。

---

### GL-G021 Web Worker

**业务定义**：高频计算（GPS 围栏）的跨线程容器。

**关键规约**：

- 主线程与 Worker 之间通过 `Transferable Objects` 传输 `Float64Array`（避免拷贝）。
- Worker 负责坐标转换、距离计算、围栏命中判断。
- Worker 崩溃时降级为主线程同步计算并打点 `WORKER_DEGRADED`。

---

### GL-G022~G024 硬约束规约

- **GL-G022 业务 ID 前缀**：所有图元 ID 必须加业务前缀（`alarm_` / `call_` / `route_` / `plan_` / `vehicle_` / `trail_`），关闭/离场时通过 `release(id)` 精准回收。
- **GL-G023 坐标系**：协议层 / 服务层强约束 WGS84，进入渲染层前由底座插件负责转换。
- **GL-G024 Auto-Fit Padding**：视野自适应必须保留 10%~15% 留边。

---

### GL-G025~G029 业务事件

- **GL-G025 视野失联**：车辆 GPS 信号丢失 > 30s，标记 `GPS_LOST` 并保留最后位置。
- **GL-G026 算路降级**：算路失败时降级为直线段并打点 `ROUTE_FALLBACK`。
- **GL-G027 焦点冲突**：同帧多个业务域争夺焦点时按优先级裁决。
- **GL-G028 跟踪聚合**：跟踪车辆 > 50 辆时进入聚合渲染模式（热力图）。
- **GL-G029 弹屏排队**：同时来电 > 3 路时进入排队模式。

---

### GL-G030 业务不变量

**业务定义**：protectInvariants 校验的 5 条强制规则。

| 序号 | 不变量 | 违反响应 |
| ---- | ------ | -------- |
| 1 | 坐标系 WGS84 | 阻断渲染并打点 `COORD_VIOLATION` |
| 2 | 图元 ID 加业务前缀 | 阻断发布并打点 `ID_PREFIX_MISSING` |
| 3 | 状态机迁移在 08 定义的有向边内 | 阻断并打点 `ILLEGAL_TRANSITION` |
| 4 | 业务焦点互斥（同时仅一个业务域拥有焦点） | 丢弃后到指令并打点 `FOCUS_CONFLICT` |
| 5 | 操作人权限满足角色权限矩阵 | 拒绝操作并打点 `PERMISSION_DENIED` |

---

#### 断言清单

1. 词典共收录 30 个 GIS 前端术语，覆盖五层架构、核心业务实体、协议契约、硬约束规约、业务事件。
2. 任何新增术语必须先入词典再写代码，词典与五层架构（Service→Protocol→Calc→Ctrl→Render）一一对应。
3. 业务 ID 前缀、坐标系、Auto-Fit Padding 是 3 条硬约束，违反时阻断并打点。
4. 业务不变量（5 条）由 `protectInvariants()` 强制校验，违反率必须为 0%。
5. 业务事件（GPS 丢失、算路降级、焦点冲突、跟踪聚合、弹屏排队）均定义了降级策略。
