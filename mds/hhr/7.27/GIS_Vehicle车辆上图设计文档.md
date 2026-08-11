# GIS地图模块 — 车辆上图（Vehicle Overlay）资源专题设计文档

> 版本：v2.0（基于 7.0 技术开发讨论会议纪要重构）
> 日期：2026-07-28
> 状态：评审版
> 视图标识：`gis:view_res_vehicle` / 动态图层 `vehicle_icons`
> 资源类别：**资源类 + 事件类**（动态移动对象，含高频位置事件）
> 所属标准件：`ResourceLayerController`（资源类） + `EventLayerController`（事件类）

---

## 〇、变更说明（相对 v1.0）

依据 [智能纪要：接处警系统 7.0 技术开发讨论 2026 年 7 月 28 日](file:///d:/work/telewave/ids/ids-gis-web/mds/7.27/智能纪要：接处警系统7.0技术开发讨论%202026年7月28日.md) 关键决策，对本文档进行以下重构：

| 维度 | v1.0 写法 | v2.0 重构（依据纪要） |
|------|---------|---------------------|
| 资源分类 | 笼统"动态资源类" | 明确"资源类 + 事件类"双归属 |
| 接口设计 | 多套独立接口 | 统一复用 `ResourceLayerController` + `EventLayerController` 标准件 |
| 控制能力 | 散落在各场景 | 抽离"范围过滤 + 字段选择 + 状态过滤"三类标准控制能力 |
| 位置更新 | 自定义 MQ 订阅逻辑 | 复用 `EventLayerController.position` 标准能力 |
| 客户配置 | 隐含大量可配置项 | 反对无边界自定义，仅保留产品/运维侧可控配置 |
| 大状态跳转 | 与调派逻辑耦合 | 设置控制接口占位，逻辑归属杨作城团队 |

---

## 一、模式受控跳转（控制接口）

### 1.1 资源定位与分层归属

车辆是 GIS 模块中**唯一同时具备资源类属性和事件类属性**的资源：

- **资源类属性：** 队站归属、类型、容量、关联预案（与消防栓同构）
- **事件类属性：** 实时位置（30s/次）、速度、航向（与警情事件同构）

```
┌──────────────────────────────────────────────────────────────┐
│ 面板层（GIS Frontend）                                         │
│   - 资源类交互：调用 ResourceLayerController                   │
│   - 事件类订阅：调用 EventLayerController                      │
│   - 不接触 DDD 域细节                                          │
└────────────────────────┬─────────────────────────────────────┘
                         │ 标准接口（双标准件）
┌────────────────────────▼─────────────────────────────────────┐
│ BFF 层（GIS-BFF）                                              │
│   - 资源类控制：范围过滤 + 字段选择 + 状态过滤                  │
│   - 事件类控制：位置事件订阅 + 状态机映射 + 轨迹缓存            │
│   - 控制逻辑集中地                                              │
└────────────────────────┬─────────────────────────────────────┘
                         │ 领域接口
┌────────────────────────▼─────────────────────────────────────┐
│ 领域适配层（车辆管理域 + 调派模块 + 高德路径规划）              │
│   - 静态属性：车辆管理域                                        │
│   - 动态事件：车辆管理域 MQ 推送                                │
│   - 调派逻辑：调派模块（杨作城团队）                            │
└──────────────────────────────────────────────────────────────┘
```

> **解耦原则**：车辆上图不写硬编码业务逻辑，所有控制通过标准件 action 触发。

#### 1.1.1 分层关系梳理

| 层级 | 直接依赖 | 向上输出 | 不负责什么 |
|------|---------|---------|-----------|
| 面板层 | BFF 层 | UI 展示、交互动作、订阅结果消费 | 不直接接触领域语义 |
| BFF 层 | 领域适配层 | `LayerMeta`、事件订阅配置、交互编排结果 | 不持有底层业务真值源 |
| 领域适配层 | 车辆管理域 / 调派模块 / 高德路径规划 | 领域字段、位置事件、状态事件、路径结果 | 不负责面板渲染 |

#### 1.1.2 关键关系

- **面板层 -> BFF 层**：获取资源类控制配置、事件类订阅配置和交互编排结果
- **BFF 层 -> 领域适配层**：获取车辆基础字段、状态事件、位置事件和调派同步结果
- **车辆管理域 -> BFF 层**：提供静态属性、实时 GPS、状态机变更
- **调派模块 -> BFF 层**：提供调派车辆列表、勾选同步、主管队站标记
- **高德路径规划 -> BFF 层**：提供 ETA、距离和路径结果

### 1.2 标准控制能力（双标准件复用）

#### 1.2.1 资源类标准件：`ResourceLayerController`

| 标准能力 | 车辆实例化配置 | 配置主体 |
|---------|--------------|---------|
| 范围过滤 | `BY_ORG`（S4）/ `BY_INCIDENT`（S5）/ `BBOX+CLUSTER`（S1） | 产品/运维 |
| 字段选择 | `BASE + STATUS + DISPATCH + REALTIME` | 产品/运维 |
| 状态过滤 | S4=`DAILY_STANDBY`；S5=`DISPATCHED\|ARRIVED\|RETURNING` | 产品/运维 |
| 类型过滤 | 6 类子集或 ALL | 坐席可切换 |
| 启用过滤 | `is_enabled=true`（默认仅显示可用车辆） | 产品/运维 |
| 机构过滤 | `org_id`（所属队站）SINGLE/MULTI/EXCLUDE/NONE | 产品/运维 |
| 文本过滤 | `car_name`（车辆名称）CONTAINS/STARTS_WITH/EXACT | 坐席输入（受控） |

#### 1.2.2 事件类标准件：`EventLayerController`

会议明确：**"事件类按位置、类型、阶段定义展示规则"**。车辆完整覆盖三类事件：

| 事件维度 | 字段 | 渲染规则 | 配置主体 |
|---------|------|---------|---------|
| **位置（Position）** | `longitude` / `latitude` / `speed_kmh` / `heading` | 图标平滑插值 + 朝向旋转 | BFF 规则 |
| **类型（Type）** | car_type | 类型-图标映射 | 产品/运维配置 |
| **阶段（Stage）** | status | 状态机-颜色映射 | 产品/运维配置 |
| 其他 | fuel / water | 阈值告警 | 产品/运维配置 |

**事件类展示规则配置示例：**

```yaml
# 事件类配置（产品/运维侧维护）
vehicle_event_map:
  type_map:
    WATER_TANKER:    { icon: "vehicle_water",   color: "#1890FF", label: "水罐车" }
    FOAM_TRUCK:      { icon: "vehicle_foam",    color: "#52C41A", label: "泡沫车" }
    RESCUE_TRUCK:    { icon: "vehicle_rescue",  color: "#FAAD14", label: "抢险救援车" }
    AERIAL_LADDER:   { icon: "vehicle_ladder",  color: "#722ED1", label: "云梯车" }
    HIGH_RISE:       { icon: "vehicle_high",    color: "#F5222D", label: "高喷车" }
    COMMAND_VEHICLE: { icon: "vehicle_command", color: "#262626", label: "指挥车" }
  stage_map:
    DAILY_STANDBY: { color: "#1890FF", label: "待命", selectable: true }
    RESERVED:      { color: "#FAAD14", label: "已预订", selectable: false }
    DISPATCHED:    { color: "#F5222D", label: "已出动", selectable: false, track: true }
    ARRIVED:       { color: "#722ED1", label: "已到场", selectable: false, track: true }
    RETURNING:     { color: "#8C8C8C", label: "返程中", selectable: false }
    MAINTENANCE:   { color: "#D4380D", label: "检修中", selectable: false }
```

### 1.3 车辆控制接口（标准件复用）

#### 1.3.1 资源加载接口（复用）

```http
POST /gis/v2/layers/resource/load
Content-Type: application/json

{
  "incident_id": "INC001",
  "resource_type": "res_vehicle",
  "scope": {
    "mode": "BY_ORG",                    // S4 模式
    "org_ids": ["ORG001", "ORG002", "ORG003"],
    "fallback_rule": "NEAREST_3_NODES"   // 最近 3 个支撑队站
  },
  "fields": ["BASE", "STATUS", "DISPATCH"],
  "status_filter": ["DAILY_STANDBY"],
  "enable_filter": {              // 启用过滤
    "field": "is_enabled",
    "value": true,
    "include_disabled": false
  },
  "org_filter": {                 // 机构过滤（所属队站）
    "field": "org_id",
    "mode": "MULTI",
    "org_ids": ["ORG001", "ORG002", "ORG003"]
  },
  "text_filter": {                // 文本过滤（与消防水源同构）
    "field": "car_name",
    "mode": "CONTAINS",
    "keyword": "泡沫",
    "case_sensitive": false
  }
}
```

> **S5 模式差异**：仅 `scope.mode = BY_INCIDENT` + `incident_id`，其余字段同 S4。

#### 1.3.2 资源状态控制接口

```http
POST /gis/v2/layers/resource/state
Content-Type: application/json

{
  "incident_id": "INC001",
  "resource_type": "res_vehicle",
  "resource_id": "C001",
  "action": "SELECT" | "DESELECT" | "HIGHLIGHT" | "FOCUS" | "RESET" | "DETAIL"
}
```

#### 1.3.3 资源注销接口（复用）

```http
POST /gis/v2/layers/resource/cleanup
Content-Type: application/json

{ "incident_id": "INC001", "resource_type": "res_vehicle" }
```

#### 1.3.4 事件类订阅接口

```http
POST /gis/v2/layers/event/subscribe
Content-Type: application/json

{
  "incident_id": "INC001",
  "event_source": "vehicle",
  "event_types": ["position", "stage", "type", "others"],
  "scope_resource_ids": ["C001", "C003", "C005"]  // 调派方案内车辆
}
```

> **设计原则**：车辆是**唯一**在资源类之外还需要事件类订阅的资源。事件订阅接口为公共件，车辆仅作为 `event_source = "vehicle"` 的实例接入。

### 1.4 模式跳转控制

```
[S1-值守]      [S2-来电]      [S3-问询]          [S4-调派]              [S5-跟踪]              [结案]
可选全量          │              │                   │                     │                     │
（聚合显示）       │              │                   ▼                     ▼                     ▼
   ▼               │              │              资源类加载           资源类加载              注销
───────          ─────         ─────         +事件类订阅            +事件类订阅            （含轨迹）
（默认关）                            待命车辆上线           全部调度车上线
```

**S4 → S5 切换的差异：**

| 维度 | S4 调派 | S5 跟踪 |
|------|--------|--------|
| scope.mode | BY_ORG | BY_INCIDENT |
| status_filter | DAILY_STANDBY | DISPATCHED\|ARRIVED\|RETURNING |
| 字段集 | BASE + STATUS + DISPATCH | BASE + STATUS + DISPATCH + REALTIME |
| 事件类订阅 | 不订阅 | 订阅 position + stage + others |
| 轨迹缓存 | 不开启 | 开启（S5 会话期） |

> **切换逻辑由警情生命周期域（杨作城团队）触发**，GIS 仅消费 `incident.scene.changed` 事件。

---

## 二、图层展示

### 2.1 用户故事驱动

#### US-V1：待命车辆列表上图（受控加载）

**故事描述：** S4 阶段，主管队站 + 最近 3 个支撑队站的待命车辆（DAILY_STANDBY）按 `ResourceLayerController` 受控加载，预案推荐车辆叠加金色边框，主管队站车辆叠加 ⭐ 特殊标识。

**验收标准：**
- AC-V1.1：受控加载延迟 ≤1s
- AC-V1.2：待命车辆亮色（按 stage_map 渲染），非待命灰色半透明
- AC-V1.3：预案推荐/主管队站标注由产品/运维配置驱动
- AC-V1.4：图标按类型差异化（6 类车辆）

#### US-V2：车辆勾选与调派表单同步（标准件 action）

**故事描述：** 地图上勾选/取消车辆通过 `action: SELECT` / `DESELECT` 标准件触发，BFF 同步至调派模块（杨作城团队），与右侧表单双向同步。

**验收标准：**
- AC-V2.1：勾选/取消动作 ≤200ms 内同步
- AC-V2.2：SELECT/DESELECT 通过标准接口，不在面板层写调派逻辑
- AC-V2.3：后端调派单警告由调派模块主动推送，GIS 仅消费

#### US-V3：调派方案内车辆全量上线（事件类订阅）

**故事描述：** S5 阶段，调派方案内所有车辆一次性上图 + 开启 `EventLayerController` 订阅，30s/次 GPS 推送自动绘制历史轨迹。

**验收标准：**
- AC-V3.1：资源加载 ≤1.5s + 事件订阅 ≤500ms
- AC-V3.2：GPS 位置更新延迟 ≤1s（事件类标准 SLA）
- AC-V3.3：历史轨迹在 S5 会话期内全程保留
- AC-V3.4：主管队站车辆 ⭐ 标注由 stage_map 扩展配置驱动

#### US-V4：车辆详情与导航（标准交互）

**故事描述：** 坐席点击车辆图标触发 `action: DETAIL`，弹出标准详情卡片；点击"查看轨迹"触发 `action: TRACK_HISTORY`，点击"路径规划"触发 `action: NAVIGATE`。

**验收标准：**
- AC-V4.1：详情卡片为标准件复用，不为车辆定制
- AC-V4.2：轨迹查询通过 BFF 转发，不直接对接车辆管理域
- AC-V4.3：路径规划通过 BFF 调用高德 API
- AC-V4.4：双击聚焦通过 `action: FOCUS` 标准件触发

---

### 2.2 按模式分类

| 模式 | 是否上图 | 加载方式 | 资源实例 | 事件订阅 | 关键控制点 |
|------|:-------:|---------|---------|---------|-----------|
| S1 值守 | 默认否（运维可控） | 全量 + 聚合 | 全市 DAILY_STANDBY | 否 | 默认关闭 |
| S2 来电 | 否 | — | — | — | — |
| S3 问询 | 否 | — | — | — | 资源不加载 |
| S4 调派 | **是** | 受控（按队站） | 主管 + 3 个最近支撑队站 | 否 | status_filter=DAILY_STANDBY |
| S5 跟踪 | **是** | 受控（按警情） | 调派方案内车辆 | **是** | 订阅 position/stage/others |
| 结案 | 否 | 注销 | — | 退订 | cleanup + 清除轨迹 |

> **设计约束**：模式跳转的业务逻辑由**警情生命周期域**驱动（杨作城团队），GIS 仅消费配置。

---

### 2.3 资源类加载规则

#### 2.3.1 受控加载（CONTROLLED）

**复用标准件** `ResourceLayerController`

**S4 按队站加载：**

```yaml
# 产品/运维侧配置
res_vehicle:
  scene_S4:
    scope:
      mode: BY_ORG
      org_strategy: PRIMARY_PLUS_NEAREST_3  # 主管+3最近
    fields: [BASE, STATUS, DISPATCH]
    status_filter: [DAILY_STANDBY]
    highlight_rules:
      - when: preplan_recommended
        style: gold_border
      - when: primary_org
        style: star_marker
```

**S5 按警情加载：**

```yaml
res_vehicle:
  scene_S5:
    scope:
      mode: BY_INCIDENT
      incident_ref: incident_id
    fields: [BASE, STATUS, DISPATCH, REALTIME]
    status_filter: [DISPATCHED, ARRIVED, RETURNING]
    track_history:
      enabled: true
      ttl: session
```

#### 2.3.2 全量加载（FULL）

**复用标准件** `ResourceLayerController.scope = BBOX + CLUSTER`

**适用场景：** S1 值守（运维侧开启）

> **反对无边界自定义**：全量加载仅在**明确业务场景**下启用。

---

### 2.4 事件类展示规则

会议明确：**"事件类按位置、类型、阶段定义展示规则"**。车辆是事件类要素的**典型代表**，完整覆盖三类。

#### 2.4.1 位置（Position）

**事件源：** `vehicle.position.changed`（MQ 30s/次）

**渲染规则：**

| 子规则 | 描述 | 实现 |
|--------|------|------|
| 平滑插值 | 前后帧位置线性插值 | 公共件提供 |
| 朝向旋转 | heading 角度应用到图标 | 公共件提供 |
| 历史轨迹 | S5 会话期内累积缓存 | Redis TTL=session |
| 视口剔除 | 视口外车辆降低更新频率 | BFF 规则 |

#### 2.4.2 类型（Type）

**事件源：** 加载时确定（不变化），但**展示规则**由产品/运维配置驱动。

| 车辆类型 | 图标 | 颜色 | 配置项 |
|---------|------|------|--------|
| WATER_TANKER（水罐车） | 蓝色水罐 | #1890FF | 产品配置 |
| FOAM_TRUCK（泡沫车） | 绿色泡沫 | #52C41A | 产品配置 |
| RESCUE_TRUCK（抢险救援） | 黄色救援 | #FAAD14 | 产品配置 |
| AERIAL_LADDER（云梯） | 紫色云梯 | #722ED1 | 产品配置 |
| HIGH_RISE（高喷） | 红色高喷 | #F5222D | 产品配置 |
| COMMAND_VEHICLE（指挥） | 黑色指挥 | #262626 | 产品配置 |

#### 2.4.3 阶段（Stage）

**事件源：** `vehicle.status.changed`（MQ 实时）

**状态机：**

```
[OFFLINE] ── 上线 ──> [DAILY_STANDBY] ── 勾选 ──> [RESERVED]
                            │                            │
                            │                       调派确认
                            │                            │
                            │                            ▼
                            │                       [DISPATCHED]
                            │                            │
                            │                       到达灾害点
                            │                            │
                            │                            ▼
                            │                       [ARRIVED]
                            │                            │
                            │                       任务完成
                            │                            │
                            │                            ▼
                            │                       [RETURNING]
                            │                            │
                            └──── 归队 ──────────────────┘
```

**状态-渲染映射（由 BFF 维护，配置驱动）：**

| 阶段 | 颜色 | 可选 | 可追踪 | 配置项 |
|------|------|:---:|:-----:|--------|
| DAILY_STANDBY | 蓝色 #1890FF | ✓ | — | stage_map |
| RESERVED | 黄色 #FAAD14 | — | — | stage_map |
| DISPATCHED | 红色 #F5222D | — | ✓ | stage_map |
| ARRIVED | 紫色 #722ED1 | — | ✓ | stage_map |
| RETURNING | 灰色 #8C8C8C | — | — | stage_map |
| MAINTENANCE | 橙色 #D4380D | — | — | stage_map |
| OFFLINE | 半透明 | — | — | stage_map |

#### 2.4.4 其他数据（Others）

| 数据项 | 来源 | 阈值告警 | 配置主体 |
|--------|------|---------|---------|
| 油量（fuel_level） | 车辆管理域/IoT | <20% 告警 | 产品/运维 |
| 水量（water_level） | 车辆管理域/IoT | <30% 告警 | 产品/运维 |
| 速度（speed_kmh） | GPS | 超速阈值 | 产品/运维 |
| 航向（heading） | GPS | — | — |

---

### 2.5 人的交互

**全部交互通过标准件 `ResourceLayerController` / `EventLayerController` 的 action 接口触发：**

| 交互 | 标准 action | 标准件 | BFF 处理 |
|------|------------|--------|---------|
| 单击车辆 | `DETAIL` | ResourceLayerController | 返回字段集范围内数据 |
| 双击车辆 | `FOCUS` | ResourceLayerController | 地图 fitBounds |
| 勾选加入调派 | `SELECT` | ResourceLayerController | 通知调派模块 |
| 取消勾选 | `DESELECT` | ResourceLayerController | 通知调派模块 |
| 鼠标悬停 | `HOVER` | ResourceLayerController | 弹出 Tooltip |
| 查看历史轨迹 | `TRACK_HISTORY` | EventLayerController | 查询轨迹缓存 |
| 路径规划 | `NAVIGATE` | EventLayerController | 调用高德 API |
| 高亮提示 | `HIGHLIGHT` | ResourceLayerController | 广播给同图层 |

> **设计原则**：人机交互由**公共交互库 + 标准件 action**实现，车辆不定义独立交互。

---

## 三、BFF 设计

### 3.1 数据梳理边界（依据会议要求）

会议明确：**"数据梳理需覆盖前端交互层可用受控选项、GIS 自有库内可选择数据项两类"**。

#### 3.1.1 GIS 自有库内可选择数据项

| 数据项 | 字段标识 | 来源 | 字段选择范围 |
|--------|---------|------|-------------|
| 车辆 ID | car_id | 车辆管理域 | BASE（基础） |
| 车辆名称 | car_name | 车辆管理域 | BASE（基础） |
| 车辆类型 | car_type | 车辆管理域 | BASE（基础） |
| 类型标签 | car_type_label | BFF 映射 | BASE（基础） |
| 车牌号 | plate_number | 车辆管理域 | BASE（基础） |
| 所属队站 | org_id / org_name | 车辆管理域 | BASE（基础） |
| **是否可用** | **is_enabled** | **车辆管理域** | **BASE（基础，布尔型）** |
| 容量规格 | capacity | 车辆管理域 | DISPATCH（可控） |
| 关联预案 | preplan_id | 预案管理域 | DISPATCH（可控） |
| 关联人员 | crew_ids | 车辆管理域 | DISPATCH（可控） |
| 当前状态 | status | 车辆管理域 | STATUS（基础） |
| 当前 GPS | longitude / latitude | 车辆管理域 | REALTIME（S5 基础） |
| 速度/航向 | speed_kmh / heading | 车辆管理域 | REALTIME（S5 基础） |
| GPS 时间 | gps_time | 车辆管理域 | REALTIME（可控） |
| 油量/水量 | fuel_level / water_level | 车辆管理域 | OTHERS（可控） |
| 关联警情 | incident_id | 警情生命周期域 | DISPATCH（可控） |
| 主管队站标记 | is_primary_org | 调派模块 | DISPATCH（可控） |
| 预案推荐标记 | is_preplan_recommended | 调派模块 | DISPATCH（可控） |
| 可勾选标记 | is_selectable | BFF 计算 | STATUS（基础） |
| ETA | eta_minutes | 高德路径规划 | REALTIME（S5 可选） |
| 距离 | distance_km | 高德路径规划 | REALTIME（S5 可选） |

#### 3.1.1.1 位置字段统一词典

| 语义 | 统一字段名 | 说明 | 约束 |
|------|-----------|------|------|
| 经度 | `longitude` | WGS84 经度 | 禁止再使用 `lng` 简写 |
| 纬度 | `latitude` | WGS84 纬度 | 禁止再使用 `lat` 简写 |
| 速度 | `speed_kmh` | 车辆速度，单位 km/h | 与坐标字段分开表达 |
| 航向 | `heading` | 车辆朝向角度 | 仅用于图标旋转 |

> **命名约束**：本文档中的位置字段统一采用**全量英文名** `longitude` / `latitude`，不再混用 `lng` / `lat`。

#### 3.1.2 前端交互层可用受控选项

| 受控选项 | 选项值 | 默认值 | 配置主体 |
|---------|--------|--------|---------|
| 加载模式 | CONTROLLED / FULL | CONTROLLED | 产品/运维 |
| 范围模式（S4） | BY_ORG | BY_ORG | 产品/运维 |
| 范围模式（S5） | BY_INCIDENT | BY_INCIDENT | 产品/运维 |
| 范围模式（S1） | BBOX + CLUSTER | — | 产品/运维 |
| 队站策略 | PRIMARY_PLUS_NEAREST_3 / PRIMARY_ONLY | PRIMARY_PLUS_NEAREST_3 | 产品/运维 |
| 字段集 | BASE / STATUS / DISPATCH / REALTIME / OTHERS | 按场景配置 | 产品/运维 |
| 启用过滤 | is_enabled=true / false / all | is_enabled=true | 产品/运维 |
| 机构过滤 | SINGLE / MULTI / EXCLUDE / NONE | MULTI（主管+3最近支撑） | 产品/运维 |
| **文本过滤** | **CONTAINS / STARTS_WITH / EXACT / REGEX** | **空=不过滤** | **坐席输入（受控）** |
| 状态过滤 | DAILY_STANDBY / DISPATCHED / ARRIVED / RETURNING / ALL | 按场景配置 | 坐席可切换 |
| 类型过滤 | 6 类子集 / ALL | ALL | 坐席可切换 |
| 主管队站标注 | 是 / 否 | 是 | 产品/运维 |
| 预案推荐标注 | 是 / 否 | 是 | 产品/运维 |
| Top-N 高亮 | 0 / 1 / 3 / 5 | 3 | 产品/运维 |
| 轨迹保留 | 不保留 / S5 会话期 | S5 会话期 | 产品/运维 |

> **反对无边界自定义**：仅暴露上述**有限受控选项**，客户**不能**新增选项或修改选项值域。

---

### 3.2 输入（Inbound）— 数据来源与关系清单

| 来源 | 类型 | 用途 | 接口形态 |
|------|------|------|---------|
| 车辆管理域 | 静态属性 | 车辆基座 | HTTP API |
| 车辆管理域 | 位置事件 | 实时 GPS | MQ `vehicle.position.changed` |
| 车辆管理域 | 状态事件 | 状态机变更 | MQ `vehicle.status.changed` |
| 调派模块 | 调派方案 | 调派车辆列表 | HTTP API（杨作城团队） |
| 调派模块 | 勾选状态 | 双向同步 | WebSocket（杨作城团队） |
| 预案管理域 | 预案匹配 | 预案推荐标注 | HTTP API |
| 警情生命周期域 | 大状态跳转 | S4/S5 切换 | MQ `incident.scene.changed`（杨作城团队） |
| 高德路径规划 | 路径 + ETA | 实时导航 | HTTP API |
| GeoServer | 队站几何 | BY_ORG 范围 | WFS（前端直连） |

> **精简原则**：仅对接与车辆相关的状态机与事件，**不**加载全量 DDD 资料。

#### 3.2.1 关系梳理

| 对象 | 依赖谁 | 产出什么 | 给谁用 |
|------|-------|---------|-------|
| 领域适配层 | 车辆管理域 / 调派模块 / 预案管理域 / 高德路径规划 / 警情生命周期域 | 车辆基础字段、事件流、调派结果、路径结果 | BFF |
| BFF | 领域适配层 | `LayerMeta`、事件订阅配置、交互编排结果 | 前端 |
| 前端 | BFF | 图层展示、轨迹展示、交互结果回传 | 用户 |

---

### 3.3 输出（Outbound）— 标准化渲染数据

#### 3.3.1 图层元数据（透传，不代理数据）

```typescript
interface LayerMeta {
  layer: string;            // "gis:view_res_vehicle"
  visible: boolean;
  style?: string;
  scope?: ScopeConfig;      // 资源类范围配置
  fields?: FieldSelector[]; // 资源类字段配置
  event_config?: {          // 事件类订阅配置
    source: "vehicle";
    event_types: ("position" | "stage" | "type" | "others")[];
    position_interval_ms: 30000;
    track_history: boolean;
  };
}
```

#### 3.3.2 资源渲染数据

```typescript
interface VehicleRenderData {
  // BASE（基础）
  car_id: string;
  car_name: string;          // 车辆名称（文本过滤字段）
  car_type: VehicleType;
  car_type_label: string;
  plate_number: string;
  org_id: string;            // 所属队站（机构过滤字段）
  org_name: string;
  longitude: number;
  latitude: number;
  is_enabled: boolean;       // 是否可用

  // STATUS（基础）
  status: VehicleStatus;
  is_selectable: boolean;

  // DISPATCH（可选）
  capacity?: string;
  preplan_id?: string;
  crew_ids?: string[];
  incident_id?: string;
  is_primary_org?: boolean;
  is_preplan_recommended?: boolean;

  // REALTIME（S5 可选）
  speed_kmh?: number;
  heading?: number;
  gps_time?: string;
  eta_minutes?: number;
  distance_km?: number;

  // OTHERS（可选）
  fuel_level?: number;
  water_level?: number;
}
```

> **字段可选性**：除 `car_id`、`car_name`、`car_type`、`org_id`、`longitude`、`latitude`、`is_enabled`、`status` 等资源模型核心字段外，其余字段按场景配置按需输出。

#### 3.3.3 WebSocket 推送

```
通道 A（资源类）：gis.resource.{incident_id}.res_vehicle
  事件：LAYER_UPDATE / LAYER_REMOVE
  载荷：DIFF 增量

通道 B（事件类）：gis.event.{incident_id}.vehicle
  事件：POSITION_CHANGED / STAGE_CHANGED / TYPE_CHANGED / OTHERS_CHANGED
  载荷：增量更新
```

---

### 3.4 BFF 控制逻辑集中点

| 控制逻辑 | 实现位置 | 配置驱动 |
|---------|---------|---------|
| 资源类：范围过滤 | BFF | YAML 配置 |
| 资源类：字段选择 | BFF | YAML 配置 |
| 资源类：状态过滤 | BFF | YAML 配置 |
| 资源类：类型-图标映射 | BFF | YAML 配置 |
| 资源类：状态-颜色映射 | BFF | YAML 配置 |
| 资源类：主管/预案标注 | BFF | YAML 配置 |
| 事件类：位置插值 | BFF | 公共件 |
| 事件类：轨迹缓存 | BFF | Redis |
| 事件类：阈值告警 | BFF | YAML 配置 |
| 双向同步 | BFF | WebSocket |
| 高德路径规划 | BFF 调用 | 公共件 |
| 大状态跳转消费 | BFF | 订阅警情生命周期域 |
| GeoServer WFS | **前端直连** | BFF 仅透传 LayerMeta |

> **核心原则**：控制逻辑**集中在 BFF**，面板层**不写任何业务判断逻辑**。

---

### 3.5 数据流转时序

#### 3.5.1 S4 受控加载时序

```
[前端业务控制层]   [GIS-BFF]          [车辆管理域]       [调派模块]      [GeoServer]
      │              │                   │                │              │
      │ POST /load   │                   │                │              │
      ├─────────────>│                   │                │              │
      │              │ GET /cars/by-org  │                │              │
      │              ├──────────────────>│                │              │
      │              │  VehicleList      │                │              │
      │              │<──────────────────┤                │              │
      │              │ GET WFS (org_geom)│                │              │
      │              ├───────────────────────────────────────────────────>│
      │              │      LayerMeta    │                │              │
      │              │<───────────────────────────────────────────────────┤
      │  RenderData  │                   │                │              │
      │<─────────────┤                   │                │              │
```

#### 3.5.2 S5 实时跟踪时序

```
[前端]         [GIS-BFF]            [车辆管理域]            [MQ Broker]
  │              │                      │                       │
  │ POST /load   │                      │                       │
  ├─────────────>│                      │                       │
  │              │ GET /cars/by-incident│                       │
  │              ├─────────────────────>│                       │
  │              │  VehicleList         │                       │
  │              │<─────────────────────┤                       │
  │  RenderData  │                      │                       │
  │<─────────────┤                      │                       │
  │              │                      │                       │
  │ POST /event/subscribe               │                       │
  ├─────────────>│                      │                       │
  │              │ 订阅 mq.gis.vehicle.position/stage            │
  │              ├──────────────────────────────────────────────>│
  │              │                      │                       │
  │              │  30s/次 GPS 推送     │                       │
  │              │<─────────────────────────────────────────────┤
  │  WebSocket推送                      │                       │
  │<═════════════┤                      │                       │
```

#### 3.5.3 勾选同步时序

```
[地图]      [表单]    [GIS-BFF]       [调派模块]
  │           │           │              │
  │  勾选车辆  │           │              │
  ├──────────>│           │              │
  │           │ action:SELECT           │
  │           ├──────────>│              │
  │           │           │ 同步推送      │
  │           │           ├─────────────>│
  │           │           │  返回状态     │
  │           │           │<─────────────┤
  │  图标标亮  │           │              │
  │<──────────┤           │              │
  │           │  状态推送  │              │
  │<══════════╪═══════════╪═ WebSocket ══╪═>
```

---

## 四、非功能性指标

| 指标 | 目标 | 说明 |
|------|------|------|
| 资源加载延迟（S4） | ≤1s | 队站车辆上图 |
| 资源加载延迟（S5） | ≤1.5s | 调派方案车辆上图 |
| 事件订阅建立 | ≤500ms | S5 事件类订阅 |
| GPS 更新延迟 | ≤1s | 事件类 SLA |
| 状态更新延迟 | ≤500ms | 状态机→图标重绘 |
| 同时监控车辆数 | ≤500 辆 | S5 上限 |
| 位置更新频率 | 30s/次 | 单车位置推送 |
| 历史轨迹保留 | S5 会话期 | Redis TTL |
| 接口复用度 | ≥80% | 标准件覆盖率 |
| 跨项目可移植 | ✓ | 不含业务硬编码 |

---

## 五、与其他资源协同

| 资源 | 协同方式 | 标准件复用 |
|------|---------|-----------|
| 队站（res_org_dept） | BY_ORG 范围 | ResourceLayerController |
| 消防栓（env_hydrant） | 占用关系（S5） | AssociationService |
| 建筑（building） | 路径规划终点 | EventLayerController.NAVIGATE |
| 出入口（entrance_exit） | 路径规划节点 | EventLayerController.NAVIGATE |
| 警情（incident） | 大状态跳转触发 | 消费杨作城团队事件 |
| 预案（preplan） | 推荐标注 | ConfigurationService |
| 路况（traffic） | 路径规划叠加 | EventLayerController.NAVIGATE |

> **设计目标**：车辆作为**唯一**需要双标准件（资源类 + 事件类）的资源，是事件类标准件的**典型示范**。

---

## 六、附录：精简对接资料

### 6.1 需对接的领域事件清单（已精简）

| 事件名 | 来源 | 用途 | 归属 |
|--------|------|------|------|
| `incident.scene.changed` | 警情生命周期域 | 大状态跳转 | 杨作城团队 |
| `vehicle.position.changed` | 车辆管理域 | 实时 GPS | GIS 直接消费 |
| `vehicle.status.changed` | 车辆管理域 | 状态机变更 | GIS 直接消费 |
| `dispatch.selection.changed` | 调派模块 | 勾选双向同步 | 杨作城团队 |
| `dispatch.conflict.warning` | 调派模块 | 后端警告 | 杨作城团队 |

### 6.2 需剔除的非相关状态

- 问询中、判定中等**错误状态定义**（会议决策，已标红剔除）
- 车辆管理域中与 GIS 无关的维保流程、车辆盘点
- 调派模块中与地图无关的工单流转、纸质回执
