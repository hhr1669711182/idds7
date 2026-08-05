# GIS地图模块 — 通用资源图层过滤方案设计文档（消防栓示例版·汇报版）

> 版本：v1.1
> 日期：2026-07-29
> 状态：定版汇报版
> 协议标识：`map.base.es_query`
> 适用范围：资源类图层统一过滤方案，按消防栓示例收口

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

### 1.2 资源类标准控制能力（公共件）

- 第一层定义：范围过滤，统一定义为 `CENTER_RADIUS` / `FENCE` / `BBOX` / `MIXED`
- 第二层定义：图层内部特定字段集过滤，仅在候选结果集内生效
- 本版字段集：`is_enabled` / `org_id` / `water_name` / `address`
- 错误治理：非法输入直接拒绝编译

范围过滤清单：

- `CENTER_RADIUS`：中心点 + 半径
- `FENCE`：围栏面范围
- `BBOX`：视口矩形范围
- `MIXED`：围栏 + 缓冲半径

典型输入对象：

`CENTER_RADIUS`

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

`FENCE`

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

`BBOX`

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

`MIXED`

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

消防栓默认口径：

- 问询阶段默认采用 `CENTER_RADIUS`
- 典型语义：警情事件中心点经纬度 + 半径 `1000m`

第二层字段集过滤：

- 按图层名内聚定义，不做泛字段展开
- `gis:env_hydrant` 开放字段：`is_enabled` / `org_id` / `water_name` / `address`
- 只在范围过滤结果集内继续收缩
- 文本过滤统一收口：`TEXT_ANY(water_name,address)`

治理层：

- 也按图层名收口
- `gis:env_hydrant` 允许操作符：`EQ` / `IN` / `TEXT_ANY`
- 基线规则：无
- 拒绝原则：未开放字段、非法操作符、空数组、非法范围对象直接拒绝

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

### 1.5 WMS 图层渲染架构（关键设计）

- 前端直连 GeoServer
- `GenericLayerFilterController` 仅是前端 core 协议控制器
- BFF 不代理地图数据
- 过滤顺序先范围、后字段集
- BFF 输出 `render_plan` 与 `filter_expr`
- 当前主链路为 GeoServer `WMS`

---

## 二、图层展示

### 2.1 用户故事驱动

- 值守阶段：消防栓图层可全量展示
- 问询阶段：`map.base.es_query` 的 `geometry.center` 取自警情事件 `longitude`/`latitude`，`type` 为 `Circle`，`radius` 固定为 `1000`（米），以警情位置为中心划定 `1000m` 圆形候选范围，再叠加图层内部字段集过滤

### 2.2 按模式分类

| 模式 | 加载方式 | 关键口径 |
|------|---------|---------|
| S1 值守 | 全量展示 | 默认不带 `cql_filter` |
| S3 问询 | 受控过滤 | `geometry.type=Circle`，`center` 取自警情 `longitude`/`latitude`，`radius=1000`（米） |
| S4/S5 | 继承结果 | 复用既有结果集 |

### 2.3 资源类加载规则

- FULL：返回 `render_plan`
- CONTROLLED：返回 `render_plan + filter_expr + total`

控制顺序：

```text
范围过滤 -> 字段集过滤
```

### 2.4 事件类展示规则

- 位置字段：`longitude` / `latitude` / `geom`
- 状态字段：`is_enabled`
- 文本字段：`water_name` / `address`
- 机构字段：`org_id`

### 2.5 人的交互

- 发起过滤：前端发送 `map.base.es_query`
- 展示结果：前端按 `render_plan` 直连 WMS
- 错误容错：错误响应不清空当前图层

---

## 三、BFF 设计

### 3.1 数据梳理边界（依据会议要求）

- 接收 `geometry`、`types`、`sql_filter`
- 前端 `GenericLayerFilterController` 负责组装协议与消费返回结果
- 先编译范围过滤
- 再编译图层内部字段集过滤
- 校验类型、字段、操作符
- 输出 `render_plan` 与 `query_result.total`

### 3.2 输入（Inbound）— 数据来源与关系清单

- GeoServer `gis:env_hydrant`
- `public.res_water` 映射字段
- `GenericLayerFilterController`（前端 core）
- 面板层协议输入

### 3.3 输出（Outbound）— 标准化渲染数据

- `render_plan`
- `filter_expr`
- `query_result.total`

### 3.4 BFF 控制逻辑集中点

- 协议组装与结果消费：前端 `GenericLayerFilterController`
- 范围过滤编译
- 字段白名单控制
- 图层内部字段集过滤编译
- 错误码映射

---

## 四、非功能性指标

- 结构可复用
- 错误可治理
- 前端可容错

---

## 五、与其他资源协同

- 建筑、出入口、车辆后续复用同一过滤模板

---

## 六、附录：精简对接资料

### 6.1 需对接的协议与字段

- 协议：`map.base.es_query`
- 图层：`gis:env_hydrant`
- 范围过滤：`geometry`
- 字段：`is_enabled` / `org_id` / `water_name` / `address` / `geom`

### 6.2 需剔除的非本版内容

- 自由字段过滤
- 前端透传原始 SQL / CQL
- 与主链路无关的业务硬编码
