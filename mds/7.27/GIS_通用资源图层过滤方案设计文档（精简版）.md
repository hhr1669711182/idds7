# GIS地图模块 — 通用资源图层过滤方案设计文档（消防栓示例版·精简版）

> 版本：v1.1
> 日期：2026-07-29
> 状态：定版精简版
> 协议标识：`map.base.es_query`
> 所属前端控制器：`GenericLayerFilterController`
> 适用范围：资源类图层统一过滤方案，本文档按消防栓示例收口

---

## 一、模式受控跳转（控制接口）

### 1.1 资源定位与分层归属

```text
面板层（GIS Frontend）
  -> 地图资源接入层（GeoServer）
  -> 前端 core（GenericLayerFilterController）
  -> 向 BFF 请求控制配置、过滤结果、交互编排结果

BFF
  -> BFF（GIS 专用后端服务）
  -> 领域适配层（DDD/业务服务）
```

分层口径：

- 面板层属于前端范畴，内部包含地图资源接入调用、前端 core 协议控制器，以及向 BFF 发起请求的编排逻辑
- `GenericLayerFilterController` 属于面板层内部的 core 协议控制器，负责协议组装、调用 BFF、消费返回结果
- BFF 是 GIS 专用后端服务，是面板层向下依赖的独立后端能力
- BFF 是专用后端服务，负责协议校验、字段白名单控制、过滤表达式编译
- 地图资源接入层负责 WMS/WFS 发布与执行
- 领域适配层负责业务字段和规则补充

### 1.2 资源类标准控制能力（公共件）

本文档对资源类过滤能力的定义，按以下优先级收口：

| 控制层级 | 定义重点 | 通用口径 | 消防栓本版落地 |
|------|---------|---------|--------------|
| 第一层 | 范围过滤 | `CENTER_RADIUS` / `FENCE` / `BBOX` / `MIXED` | `CENTER_RADIUS` |
| 第二层 | 图层内部特定字段集过滤 | 仅在候选结果集内做字段过滤 | `is_enabled` / `org_id` / `water_name` / `address` |
| 治理层 | 白名单与错误控制 | 非法字段、非法操作符直接拒绝 | 支持 |

#### 1.2.1 范围过滤（Scope Filter）

| 过滤模式 | 描述 | 输入对象 | 适用场景 |
|------|------|---------|---------|
| `CENTER_RADIUS` | 以中心点 + 半径过滤 | 见下方 JSON 示例 | 来电定位圈、中心点周边资源 |
| `FENCE` | 指定围栏面范围过滤 | 见下方 JSON 示例 | 微围栏、辖区围栏、AOI |
| `BBOX` | 以视口矩形范围过滤 | 见下方 JSON 示例 | 当前视口可见资源 |
| `MIXED` | 围栏 + 缓冲半径联合过滤 | 见下方 JSON 示例 | 微围栏 + 周边缓冲资源 |

`CENTER_RADIUS` 输入对象：

```json
{
  "types": ["hydrant"],
  "limit": 50,
  "geometry": {
    "type": "Circle",
    "center": [120.10, 30.20],
    "radius": 1000
  }
}
```

`FENCE` 输入对象：

```json
{
  "types": ["hydrant"],
  "limit": 50,
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [
        [120.10, 30.20],
        [120.20, 30.20],
        [120.20, 30.30],
        [120.10, 30.30],
        [120.10, 30.20]
      ]
    ]
  }
}
```

`BBOX` 输入对象：

```json
{
  "types": ["hydrant"],
  "limit": 50,
  "geometry": {
    "type": "BBox",
    "bbox": [120.10, 30.20, 120.20, 30.30]
  }
}
```

`MIXED` 输入对象：

```json
{
  "types": ["hydrant"],
  "limit": 50,
  "geometry": {
    "type": "Polygon",
    "coordinates": [
      [
        [120.10, 30.20],
        [120.20, 30.20],
        [120.20, 30.30],
        [120.10, 30.30],
        [120.10, 30.20]
      ]
    ]
  },
  "scope_ext": {
    "mode": "MIXED",
    "radius": 1000
  }
}
```

通用口径：

- 范围过滤是第一层通用过滤定义，用于先划定候选结果集
- 图层内部字段集过滤只能在范围过滤结果集内继续收缩，不能替代范围过滤
- 若不传范围过滤，则按全量展示链路处理

消防栓示例口径：

- 问询阶段默认采用 `CENTER_RADIUS`
- 典型语义为：以警情事件中心点经纬度为中心，半径 `1000m`
- 若仅做值守全量展示，则不启用范围过滤

#### 1.2.2 图层内部特定字段集过滤（Field Selector）

第二层不再做通用散列字段定义，而是按图层名做内聚配置。对于 `gis:env_hydrant`，第二层字段集过滤只关心该图层当前开放的业务过滤字段。

| 图层名 | 开放字段 | 过滤含义 |
|------|---------|---------|
| `gis:env_hydrant` | `is_enabled` | 可用状态过滤 |
| `gis:env_hydrant` | `water_name` / `address` | 名称与地址文本过滤 |
|核心口径：|||

- 第二层字段集过滤只能在第一层范围过滤结果集内执行
- 第二层开放字段与图层名强绑定，不做跨图层复用拼装
- `gis:env_hydrant` 当前字段集统一收口为 `is_enabled`、`org_id`、`water_name`、`address`
- 文本过滤统一收口为 `TEXT_ANY(water_name,address)`

#### 1.2.3 治理层（Governance）

治理层也按图层名收口，不做泛化规则堆叠；其核心只有“允许什么”和“拒绝什么”。

| 图层名 | 允许字段 | 允许操作符 | 基线规则 |
|------|---------|-----------|---------|
| `gis:env_hydrant` | `is_enabled` / `org_id` / `water_name` / `address` | `EQ` / `IN` / `TEXT_ANY` | 无 |

拒绝原则：

- 未注册图层或未开放字段，直接拒绝
- 字段与操作符不匹配，直接拒绝
- 空数组机构过滤、非法范围对象，直接拒绝
- 不开放原始 SQL / 原始 CQL / 无边界自定义查询

### 1.3 通用过滤控制接口（标准件复用）

```json
{
  "eventType": "map.base.es_query",
  "data": {
    "types": ["hydrant"],
    "limit": 50,
    "request_id": "REQ-HYD-S3-001",
    "geometry": {
      "type": "Circle",
      "center": [120.10, 30.20],
      "radius": 1000
    },
    "sql_filter": {}
  }
}
```

> 接口说明：本文档按 `map.base.es_query` 统一收口，消防栓以 `type = hydrant` 的方式接入，不定义独立协议。

### 1.5 WMS 图层渲染架构（关键设计）

现行实现口径：

- 当前主链路为 GeoServer `WMS`
- 前端默认可走全量展示链路
- 受控过滤场景下，前端先做范围过滤，再叠加图层内部字段集过滤
- 前端经 BFF 获取 `render_plan` 与 `filter_expr`
- `sql_filter` 是结构化过滤 DSL，不是原始 SQL

基础链路：

```text
Frontend -> BFF -> render_plan -> Frontend -> GeoServer WMS
```

---

## 二、图层展示

### 2.1 用户故事驱动

#### US-G1：值守阶段全量展示

- 在值守阶段，不传 `geometry`、不传 `sql_filter`
- 前端根据 `render_plan` 直连 WMS 展示消防栓图层

#### US-G2：问询阶段受控过滤

- 在问询阶段，`map.base.es_query` 的 `geometry` 中 `center` 取值来源于警情事件的 `longitude` 和 `latitude`
- `geometry.type` 为 `Circle`，`radius` 固定为 `1000`（单位：米），用于以警情位置为中心划定半径 `1000m` 圆形候选范围

协议示例：

```json
{
  "eventType": "map.base.es_query",
  "data": {
    "types": ["hydrant"],
    "limit": 50,
    "geometry": {
      "type": "Circle",
      "center": [120.10, 30.20],
      "radius": 1000
    },
    "sql_filter": {
      "layer": {
        "hydrant": {
          "logic": "AND",
          "conditions": [
            { "field": "is_enabled", "operator": "EQ", "value": true },
            { "field": "org_id", "operator": "IN", "value": ["ORG001"] },
            { "field": "keyword", "operator": "TEXT_ANY", "fields": ["water_name", "address"], "value": "延安路" }
          ]
        }
      }
    }
  }
}
```

### 2.2 按模式分类

| 模式 | 是否上图 | 加载方式 | 关键控制点 |
|------|:-------:|---------|-----------|
| S1 值守 | 否 | — | — |
| S2 来电 | 否 | — | 不单独展开 |
| S3 问询 | 是 | 受控过滤 | `geometry.type=Circle`，`center` 取自警情 `longitude`/`latitude`，`radius=1000`（米） |
| S4 调派 | 是 | 继承受控结果 | 结果集高亮复用 |
| S5 跟踪 | 是 | 继承受控结果 | 状态刷新复用 |

### 2.3 资源类加载规则

| 加载方式 | 输入特点 | 输出特点 |
|------|---------|---------|
| FULL | 不传 `geometry`、不传 `sql_filter` | 返回 `render_plan` |
| CONTROLLED | 传 `geometry` 与 `sql_filter` | 返回 `render_plan + filter_expr + total` |

控制顺序：

```text
第一步：范围过滤（确定候选图层结果集）
第二步：图层内部字段集过滤（在候选集内继续收缩）
```

### 2.4 事件类展示规则

消防栓属于资源类，本版仅保留与过滤方案直接相关的展示规则：

- 位置字段：`longitude` / `latitude` / `geom`
- 状态字段：`is_enabled`
- 文本字段：`water_name` / `address`
- 机构字段：`org_id`

### 2.5 人的交互

| 交互 | 通用处理口径 |
|------|-------------|
| 发起过滤 | 前端发送 `map.base.es_query` |
| 展示结果 | 前端按 `render_plan` 直连 WMS |
| 错误处理 | 收到错误响应后保留当前已渲染图层 |

---

## 三、BFF 设计

### 3.1 数据梳理边界（依据会议要求）

`map.base.es_query` 的 BFF 责任边界如下：

- 接收几何范围、资源类型、结构化过滤条件
- 先编译通用范围过滤条件
- 再编译图层内部特定字段集过滤条件
- 校验字段白名单、操作符合法性
- 合并输出 `filter_expr`
- 输出 `render_plan` 与 `query_result.total`

### 3.2 输入（Inbound）— 数据来源与关系清单

| 来源 | 类型 | 用途 |
|------|------|------|
| GeoServer `gis:env_hydrant` | 地图资源 | 承载图层、几何字段、过滤字段 |
| 面板层协议输入 | 前端请求 | 传入 `geometry`、`types`、`sql_filter` |
| `public.res_water` 映射字段 | 资源底座 | 承载消防栓真实字段口径 |

### 3.3 输出（Outbound）— 标准化渲染数据

```ts
interface RenderPlanItem {
  type: "hydrant";
  layer: "gis:env_hydrant";
  query_mode: "WMS";
  filter_expr?: string;
}
```

### 3.4 BFF 控制逻辑集中点

| 控制逻辑 | 实现位置 |
|---------|---------|
| 协议组装与结果消费 | 前端 `GenericLayerFilterController` |
| 范围过滤编译 | BFF |
| 字段白名单控制 | BFF |
| 文本过滤编译 | BFF |
| 图层内部字段集过滤编译 | BFF |
| 错误码映射 | BFF |
| GeoServer 地图服务调用 | 前端直连 |

---

## 四、非功能性指标

| 指标 | 目标 |
|------|------|
| 过滤编译稳定性 | 标准字段与标准错误码可复用 |
| 前端容错性 | 错误响应不清空当前图层 |
| 结构复用性 | 可扩展到其他资源图层 |

---

## 五、与其他资源协同

| 资源 | 协同方式 |
|------|---------|
| 建筑 | 复用同一过滤协议 |
| 出入口 | 复用同一过滤协议 |
| 车辆 | 后续按同模板扩展 |

---

## 六、附录：精简对接资料

### 6.1 需对接的协议与字段

- 协议：`map.base.es_query`
- 图层：`gis:env_hydrant`
- 范围过滤：`geometry`
- 真实字段：`is_enabled` / `org_id` / `water_name` / `address` / `geom`

### 6.2 需剔除的非本版内容

- 未开放的自由字段过滤
- 前端直接透传原始 SQL / CQL
- 与当前消防栓过滤主链路无关的业务硬编码
