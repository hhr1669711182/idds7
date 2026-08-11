# GIS地图模块 — 消防栓（env_hydrant）资源专题设计文档

> 版本：v2.0（基于 7.0 技术开发讨论会议纪要重构）
> 日期：2026-07-28
> 状态：评审版
> 视图标识：`gis:env_hydrant`
> 资源类别：资源类（静态基础设施）
> 所属标准件：`ResourceLayerController`（资源类通用控制器）
> 底层字段对齐：`public.res_water`（环境域-消防水源信息快照表）

---

## 〇、变更说明（相对 v1.0）

依据 [智能纪要：接处警系统 7.0 技术开发讨论 2026 年 7 月 28 日](file:///d:/work/telewave/ids/ids-gis-web/mds/7.27/智能纪要：接处警系统7.0技术开发讨论%202026年7月28日.md) 关键决策，对本文档进行以下重构：

| 维度 | v1.0 写法 | v2.0 重构（依据纪要） |
|------|---------|---------------------|
| 接口设计 | 直接暴露 DDD 字段 | 抽象为 `ResourceLayerController` 标准件，控制逻辑集中在 BFF |
| 数据边界 | 数据来源、字段、状态混写 | 明确拆分"GIS 自有库可选数据项"与"前端交互层可用受控选项" |
| 控制能力 | 散落在各场景 | 抽离"范围过滤 + 字段选择"两类标准控制能力 |
| 客户配置 | 隐含大量可配置项 | 明确反对无边界自定义，仅保留产品/运维侧可控配置 |
| 大状态跳转 | 与场景切换耦合 | 设置控制接口占位，逻辑归属杨作城团队 |

---

## 一、模式受控跳转（控制接口）

### 1.1 资源定位与分层归属

```
┌──────────────────────────────────────────────────────────────┐
│ 面板层（GIS Frontend）                                         │
│   - 向 BFF 请求控制配置、过滤结果、交互编排结果                │
│   - 持 GeoServer 凭证，直连地图资源接入层                      │
└──────────────┬──────────────────────────────┬────────────────┘
               │ 标准接口（ResourceLayerController） │ WMS/WFS
┌──────────────▼──────────────────────────────┐ ┌────────────────▼──────────────────────────┐
│ BFF 层（GIS-BFF）                             │ │ 地图资源接入层（GeoServer WMS/WFS）         │
│ - 控制逻辑集中地：范围过滤 + 字段选择 + 状态映射│ │ - 提供图层名、样式名、几何字段、过滤字段     │
│ - 输出 LayerMeta / 过滤串 / 交互编排结果       │ │ - 提供 WMS/WFS 能力边界与图层发布能力        │
│ - 不代理 GeoServer 数据                        │ │ - 不负责领域状态机，仅负责地图资源发布       │
└──────────────────────┬──────────────────────┘ └────────────────────────────────────────────┘
                       │ 领域字段/事件
┌──────────────────────▼───────────────────────────────────────┐
│ 领域适配层（消防设施域 / 调派域 / 警情域）                      │
│ - 输出标准控制能力所需领域字段                                  │
│ - 输出领域状态、领域事件                                        │
│ - 不负责地图渲染，不直接暴露 GeoServer                          │
└──────────────────────────────────────────────────────────────┘
```

> **解耦原则**：面板层一方面只通过 BFF 获取控制结果，另一方面按凭证直连地图资源接入层；BFF 只编排领域适配层，不代理地图服务数据。**"能解耦的东西才是交付成果"** —— 7.0 会议金句。

#### 1.1.1 分层关系梳理

| 层级 | 直接依赖 | 向上输出 | 不负责什么 |
|------|---------|---------|-----------|
| 面板层 | BFF 层 + 地图资源接入层 | UI 展示、交互动作、WMS/WFS 请求 | 不直接接 DDD 语义 |
| BFF 层 | 领域适配层 | `LayerMeta`、过滤配置、交互结果 | 不存储底层业务真值，不代理 WMS 瓦片 |
| 领域适配层 | 消防设施域 / 调派域 / 警情域 | `is_enabled`、`org_id`、`watertype_id`、事件流 | 不负责地图发布 |
| 地图资源接入层 | GeoServer | `layer`、`style`、`geom`、可过滤字段映射、WMS/WFS 服务 | 不负责领域状态机 |

#### 1.1.2 关键关系

- **面板层 -> BFF 层**：获取控制配置、过滤串、交互编排结果
- **面板层 -> 地图资源接入层**：按 `LayerMeta` 直连 WMS/WFS 获取地图资源
- **BFF 层 -> 领域适配层**：拿标准控制能力所需的领域字段与事件
- **领域适配层 -> GeoServer 视图映射**：部分字段会被下沉/映射进 GeoServer 图层视图，供 WMS `cql_filter` 使用
- **地图资源接入层 -> 面板层**：返回瓦片、要素或查询结果

### 1.2 资源类标准控制能力（公共件）

会议明确要求：**"资源类按统一逻辑封装控制能力"**，消防栓作为资源类一员，**必须复用如下两类标准控制能力**，不另行定义：

#### 1.2.1 范围过滤（Scope Filter）

| 过滤模式 | 描述 | 适用场景 |
|---------|------|---------|
| `CENTER_RADIUS` | 以中心点 + 半径过滤 | 弹屏定位圈周边资源 |
| `FENCE` | 指定围栏（GeoJSON Polygon） | 微围栏 / 主管队站辖区 |
| `BBOX` | 视口矩形范围 | 当前视口可见资源 |
| `MIXED` | 围栏 + 缓冲半径 | 微围栏 + 1km 缓冲（消防栓默认） |

**消防栓采用：** `MIXED`（FENCE=micro_fence + radius=1000m）

#### 1.2.2 字段选择（Field Selector）

| 选项类型 | 描述 | 配置主体 |
|---------|------|---------|
| `BASE` | 基础字段：`water_id` / `water_name` / `geom` / `longitude` / `latitude` | 基础资源字段，默认保留 |
| `TYPE` | 类型字段：`watertype_id` / `waternature_id` / `intake_form` | 产品/运维可控 |
| `STATUS` | 状态字段：`is_enabled` / `launched_time` / `revoke_time` / `is_deleted` | 产品/运维可控 |
| `ASSOCIATION` | 关联字段：`org_id` / `aoi_id` / `annex_id` | 产品/运维可控 |

> **设计约束**：字段白名单由**产品 + 运维侧统一定义**，GIS 模块不开放无边界自定义配置。

#### 1.2.3 启用过滤（Enable Filter）

`is_enabled` 表示水源是否可用。现行上图口径下，**WMS 默认展示全部数据源**，该过滤用于受控加载场景，基线配置为关闭。

| 配置 | 含义 | 默认 |
|------|------|:----:|
| `enabled=false` | 不启用过滤，展示全部 | ✓ |
| `enabled=true,value=true` | 仅展示可用水源 | — |

过滤优先级：
- `is_enabled`：是否参与上图
- `is_deleted`：是否参与展示
- `revoke_time`：是否已撤销

> `is_enabled` 由资产数据维护，不建议坐席在线修改。

#### 1.2.4 机构过滤（Org Filter）

消防栓文档当前对齐真实表 `public.res_water`，所属机构字段统一使用 `org_id`。

| 模式 | 含义 | 默认 |
|------|------|:----:|
| `SINGLE` | 单机构过滤 | — |
| `MULTI` | 多机构并集 | — |
| `EXCLUDE` | 排除指定机构 | — |
| `NONE` | 不过滤 | ✓ |

> 机构过滤由产品/运维配置，不开放坐席在线维护机构列表。

#### 1.2.5 文本过滤（Text Filter）

文本过滤默认以 `water_name` 为主查询字段，同时兼容 `address` 联合过滤，用于在当前图层结果内快速定位水源。

| 模式 | 含义 | 默认 |
|------|------|:----:|
| `CONTAINS` | 包含匹配 | ✓ |
| `STARTS_WITH` | 前缀匹配 | — |
| `EXACT` | 精确匹配 | — |
| `REGEX` | 正则匹配（仅运维侧） | — |

约束：
- 关键词由坐席输入，但**只在当前受控结果集内二次过滤**
- 默认支持中文分词与拼音索引
- `REGEX` 不对普通坐席开放
- 默认查询规则：`water_name` 命中优先，`address` 作为兼容补充字段

### 1.3 消防栓控制接口（标准件复用）

#### 1.3.1 资源加载接口

```http
POST /gis/v2/layers/resource/load
Content-Type: application/json

{
  "incident_id": "INC001",
  "resource_type": "env_hydrant",
  "scope": {
    "mode": "MIXED",
    "fence_id": "AOI-001",        // 复用微围栏几何
    "radius_meters": 1000
  },
  "fields": ["BASE", "STATUS", "ASSOCIATION"],
  "enable_filter": {              // 启用过滤
    "field": "is_enabled",
    "enabled": false,             // false：展示全部数据源
    "value": true,                // 开启后仅保留 is_enabled=true
    "include_disabled": true      // true：包含停用水源
  },
  "org_filter": {                 // 机构过滤
    "field": "org_id",            // 所属消防机构ID
    "mode": "NONE",
    "org_ids": ["ORG001", "ORG002"]
  },
  "text_filter": {                // 文本过滤
    "fields": ["water_name", "address"],
    "primary_field": "water_name",
    "mode": "CONTAINS",
    "keyword": "",
    "case_sensitive": false
  }
}
```

#### 1.3.2 资源状态控制接口

```http
POST /gis/v2/layers/resource/state
Content-Type: application/json

{
  "incident_id": "INC001",
  "resource_type": "env_hydrant",
  "resource_id": "HYD-001",
  "action": "HIGHLIGHT" | "FOCUS" | "RESET"
}
```

#### 1.3.3 资源注销接口

```http
POST /gis/v2/layers/resource/cleanup
Content-Type: application/json

{ "incident_id": "INC001", "resource_type": "env_hydrant" }
```

> **接口说明**：以上三组接口为**资源类公共接口**，消防栓仅作为 `resource_type = "env_hydrant"` 的实例接入，**不定义独立接口**。

### 1.5 WMS 图层渲染架构（关键设计）

会议明确消防栓**使用 GeoServer WMS 渲染上图**，本节说明**数据过滤**与**WMS 渲染**的边界与衔接。

#### 1.5.0 现行实现口径

现行消防水源资源上图采用 **GeoServer WMS**，并且**默认展示全部数据源**。即在未显式传入 `cql_filter` 或 `cql_filter` 为空时，前端直接请求：

```http
GET {GeoServer}/geoserver/workspace/wms?
  service=WMS&
  version=1.3.0&
  request=GetMap&
  layers=workspace:env_hydrant&
  styles=hydrant_style&
  bbox=<bbox>&width=800&height=600&format=image/png
```

此时：
- 不按 `is_enabled` 过滤
- 不按 `org_id` 过滤
- 不按 `water_name` / `address` 文本过滤
- 仅受地图视口 `bbox` 影响

> **结论**：现行上图口径为“**WMS 全量展示**”，文档中定义的 `enable_filter / org_filter / text_filter / valid_filter` 属于**受控加载场景的标准控制能力**。

#### 1.5.1 双层架构

消防栓上图分为两层：
- **控制层**：BFF 组装 `LayerMeta`
- **渲染层**：前端直连 GeoServer WMS

基础链路：

```text
前端 -> BFF 请求图层配置 -> BFF 返回 LayerMeta(layer/style/visible) -> 前端直连 WMS -> 显示 bbox 下全部数据源
```

受控过滤链路：

```text
前端 -> BFF 传入过滤条件 -> BFF 组装 cql_filter -> 前端携带 cql_filter 直连 WMS -> 显示过滤后的结果
```

> BFF 不转发 WMS 数据，只透传 `layer + visible + style + cql_filter`。

#### 1.5.2 data_filter → CQL 转换规则

BFF 将四层数据过滤条件**按需合并为单一 `CQL_FILTER`** 字符串，透传给前端拼接至 WMS 请求。**若无过滤条件，则不拼接 `cql_filter`，保持全量展示行为。**

| 过滤条件 | CQL 转换 | 示例 |
|---------|---------|------|
| 范围过滤（scope） | `WITHIN(geom, BUFFER(...))` 或 `BBOX` | `WITHIN(geom, POLYGON((...)))` |
| 启用过滤 | `is_enabled=true` | `is_enabled=true` |
| 机构过滤 | `org_id IN ('ORG001','ORG002')` | `org_id IN ('ORG001','ORG002')` |
| 文本过滤 | `water_name LIKE '%延安路%' OR address LIKE '%延安路%'` | `(water_name ILIKE '%延安路%' OR address ILIKE '%延安路%')` |
| 有效记录过滤 | `is_deleted=false` | `is_deleted=false` |

#### 1.5.2.1 字段归属矩阵（实现口径）

下表用于统一“字段来自哪里、是否参与 WMS CQL、是否参与样式渲染”的实现口径，避免开发评审阶段产生歧义。

| 字段名 | 来源系统 | GeoServer 图层字段 | 是否参与 CQL | 是否参与 WMS 样式 | 说明 |
|-------|---------|:------------------:|:-----------:|:----------------:|------|
| `water_id` | GeoServer / `res_water` 视图 | ✓ | 可选 | 否 | 水源唯一标识 |
| `water_number` | GeoServer / `res_water` 视图 | ✓ | 否 | 否 | 水源编号，不纳入前端字段选择 |
| `water_name` | GeoServer / `res_water` 视图 | ✓ | **是** | 否 | 文本模糊过滤主字段 |
| `geom` | GeoServer | ✓ | **是** | 否 | 空间范围过滤字段 |
| `watertype_id` | GeoServer / `res_water` 视图 | ✓ | 可选 | 否 | 水源类型主分类，现行 WMS 样式未直接使用 |
| `intake_form` | GeoServer / `res_water` 视图 | ✓ | 可选 | 否 | 取水形式字段，现行 WMS 样式未直接使用 |
| `is_enabled` | GeoServer 视图透出或库视图映射 | ✓ | **是** | **是** | 启用过滤字段，也是现行样式状态字段 |
| `org_id` | GeoServer 视图透出或库视图映射 | ✓ | **是** | 否 | 所属消防机构过滤字段 |
| `aoi_id` | GeoServer / `res_water` 视图 | ✓ | 可选 | 否 | AOI 关联字段 |
| `waternature_id` | GeoServer / `res_water` 视图 | ✓ | 可选 | 否 | 水源性质 |
| `annex_id` | GeoServer / `res_water` 视图 | ✓ | 否 | 否 | 缩略图附件 |
| `is_deleted` | GeoServer 视图透出或库视图映射 | ✓ | 可选 | 否 | 有效记录过滤 |
| `address` | GeoServer / `res_water` 视图 | ✓ | **是** | 否 | 地址兼容过滤字段 |

> 进入 `cql_filter` 的字段必须能被 GeoServer 图层 `env_hydrant` 直接识别。

**合并逻辑（AND 串联）：**

```typescript
// BFF 转换逻辑
function buildCQLFilter(req: LoadRequest): string {
  const clauses: string[] = [];

  // 1. 空间范围
  if (req.scope?.mode === "MIXED") {
    clauses.push(`WITHIN(geom, BUFFER(..., ${req.scope.radius_meters}))`);
  }

  // 2. 启用过滤
  if (req.enable_filter?.enabled === true && req.enable_filter?.value === true) {
    clauses.push("is_enabled=true");
  }

  // 3. 机构过滤
  if (req.org_filter?.mode && req.org_filter.mode !== "NONE" && req.org_filter?.org_ids?.length > 0) {
    clauses.push(`org_id IN ('${req.org_filter.org_ids.join("','")}')`);
  }

  // 4. 文本过滤
  if (req.text_filter?.keyword) {
    clauses.push(`(water_name ILIKE '%${req.text_filter.keyword}%' OR address ILIKE '%${req.text_filter.keyword}%')`);
  }

  // 5. 有效记录过滤
  if (req.valid_filter?.enabled === true) {
    clauses.push(`is_deleted=false`);
  }

  return clauses.join(" AND ");
}
```

**前端收到的 LayerMeta：**

```typescript
interface LayerMeta {
  layer: string;      // "gis:env_hydrant"
  visible: boolean;   // 默认 true
  style?: string;     // "hydrant_style"
  cql_filter?: string; // 为空时表示全量展示
}
```

#### 1.5.3 WMS 图层渲染流程

```text
1. 前端调用 POST /gis/v2/layers/resource/load
2. BFF 返回 LayerMeta
3. 前端直连 GeoServer WMS
4. GeoServer 返回 PNG 瓦片
5. 前端完成图层渲染
```

全量展示模式：
- 不传 `cql_filter`
- 展示当前 `bbox` 下全部数据源

受控过滤模式：
- BFF 按需拼接 `cql_filter`
- 前端带过滤条件重发 WMS 请求

#### 1.5.4 WMS 样式配置

| 样式要素 | 配置 | 说明 |
|---------|------|------|
| 样式文件 | GeoServer SLD XML | 现行样式由 SLD 文件统一维护 |
| 启用图标 | `is_enabled=true` 对应启用状态图标 | SLD `Rule` 按布尔值匹配 |
| 停用图标 | `is_enabled=false` 对应停用状态图标 | SLD `Rule` 按布尔值匹配 |
| 类型样式 | 本版未启用 | `watertype_id` / `intake_form` 暂不参与现行 WMS 图标区分 |
| 告警叠加 | 本版未启用 | 现行样式不内置压力或其他告警规则 |
| 高亮闪烁 | `HIGHLIGHT` action → 描边 + 脉冲 | 前端 Canvas 叠加 |
| 默认可见 | `visible: true` | 可由坐席图层开关控制 |

**现行样式说明：**

```xml
<FeatureTypeStyle>
  <Rule>
    <ogc:Filter>
      <ogc:PropertyIsEqualTo>
        <ogc:PropertyName>is_enabled</ogc:PropertyName>
        <ogc:Literal>true</ogc:Literal>
      </ogc:PropertyIsEqualTo>
    </ogc:Filter>
    <!-- 启用状态图标 -->
  </Rule>
  <Rule>
    <ogc:Filter>
      <ogc:PropertyIsEqualTo>
        <ogc:PropertyName>is_enabled</ogc:PropertyName>
        <ogc:Literal>false</ogc:Literal>
      </ogc:PropertyIsEqualTo>
    </ogc:Filter>
    <!-- 停用状态图标 -->
  </Rule>
</FeatureTypeStyle>
```

> **安全说明**：GeoServer 访问凭证由前端持有，BFF **不代理、不转发 WMS 数据**，仅透传 CQL_FILTER 字符串。

#### 1.5.5 真实请求样例

**样例 A：全量展示**

```http
GET {GeoServer}/geoserver/workspace/wms?
  service=WMS&
  version=1.3.0&
  request=GetMap&
  layers=workspace:env_hydrant&
  styles=hydrant_style&
  bbox=120.08,30.20,120.18,30.30&
  width=1024&
  height=768&
  format=image/png
```

**样例 B：按 `is_enabled=true` 过滤**

```http
GET {GeoServer}/geoserver/workspace/wms?
  service=WMS&
  version=1.3.0&
  request=GetMap&
  layers=workspace:env_hydrant&
  styles=hydrant_style&
  bbox=120.08,30.20,120.18,30.30&
  width=1024&
  height=768&
  format=image/png&
  cql_filter=is_enabled=true
```

**样例 C：联合过滤**

```http
GET {GeoServer}/geoserver/workspace/wms?
  service=WMS&
  version=1.3.0&
  request=GetMap&
  layers=workspace:env_hydrant&
  styles=hydrant_style&
  bbox=120.08,30.20,120.18,30.30&
  width=1024&
  height=768&
  format=image/png&
  cql_filter=is_enabled=true AND org_id IN ('ORG001','ORG002') AND (water_name ILIKE '%延安路%' OR address ILIKE '%延安路%')
```

#### 1.5.6 异常与边界处理

| 场景 | 处理策略 | 前端表现 |
|------|---------|---------|
| `cql_filter` 为空 | 不拼接过滤，走全量展示 | 正常展示全部数据源 |
| 文本关键字为空 | 忽略 `text_filter` | 不报错 |
| 机构列表为空或 mode=NONE | 忽略 `org_filter` | 不报错 |
| 过滤后无结果 | WMS 返回空瓦片 | 地图无图元，右上角提示“无匹配水源” |
| 非法关键字（引号/通配符污染） | BFF 做转义/白名单校验 | 提示“查询条件非法” |
| 组合过滤过长 | BFF 拒绝构造 CQL | 提示“过滤条件过长，请缩小范围” |
| GeoServer WMS 超时 | 前端重试 1 次，失败降级为提示 | 提示“消防栓图层加载失败” |
| GeoServer 字段不存在 | BFF 启动字段校验，拒绝拼接该条件 | 提示“过滤字段未映射到图层” |

#### 1.5.7 全量展示与受控加载对照

| 维度 | 全量展示口径 | 受控加载口径 |
|------|-------------|-----------------------|
| 上图方式 | GeoServer WMS | GeoServer WMS |
| 数据范围 | bbox 下全部数据源 | 可保持全部数据源，也可叠加过滤 |
| `is_enabled` | 不启用 | 场景可开启 |
| `org_filter` | 不启用 | 场景可开启 |
| `text_filter` | 仅用户主动输入时生效 | 用户主动输入时生效 |
| `cql_filter` | 为空 | 有条件时按需拼接 |
| BFF 角色 | 透传 LayerMeta | 透传 LayerMeta + 构造过滤串 |

### 1.6 模式跳转控制（接口占位，逻辑归属杨作城团队）

```
[S1-值守] ── 不上图 ──> [S2-来电] ── 不上图 ──> [S3-问询]
                                                       │
                                                微围栏确认触发
                                                       ▼
                                                ┌──────────────┐
                                                │ env_hydrant  │
                                                │ 受控加载     │
                                                └──────┬───────┘
                                                       │
   ┌───────────────────────────────────────────────────┼────────────────┐
   ▼                                    ▼                                ▼
[S4-调派]                          [S5-跟踪]                          [结案清理]
高亮强化                            状态实时刷新                      资源注销
```

**BFF 侧设置控制接口占位：**

```typescript
// 大状态跳转事件由警情生命周期域（杨作城团队）发布，GIS 仅消费
interface SceneStateEvent {
  scene: "S1" | "S2" | "S3" | "S4" | "S5";
  incident_id: string;
  trigger: "MICRO_FENCE_CONFIRMED" | "DISPATCH_CONFIRMED" | ...;
  aoi_geom?: GeoJSON.Polygon;  // S3 触发时携带微围栏
}
```

---

## 二、图层展示

### 2.1 用户故事驱动

#### US-H1：值守阶段消防水源全量展示

**故事描述：** 在 S1 值守阶段，当运维侧开启消防水源图层时，前端直连 GeoServer WMS 展示全市范围消防水源，全量展示以值守态总览为目标，不叠加问询阶段的受控范围过滤。

**验收标准：**
- AC-H1.1：S1 值守阶段支持按运维配置开启/关闭全量展示
- AC-H1.2：未显式传入 `cql_filter` 时，默认展示全部有效水源数据
- AC-H1.3：值守阶段展示目标为全局态势浏览，不要求按微围栏或 1km 缓冲裁剪
- AC-H1.4：图层样式、图标映射与各业务阶段保持统一，不因阶段切换重定义资源类型

#### US-H2：接警问询阶段消防水源按需上图（受控加载）

**故事描述：** 在 S3 接警问询阶段，微围栏确认后，消防水源按 `FENCE + 1km 缓冲` 范围受控加载，按"基础+类型+状态+关联"字段集渲染，现行 WMS 样式按 `is_enabled` 展示启用/停用两种状态图标。

**验收标准：**
- AC-H2.1：受控加载延迟 ≤800ms
- AC-H2.2：缓冲半径可由运维侧配置（默认 1000m）
- AC-H2.3：WMS 图标按 `is_enabled` 展示启用/停用两种状态
- AC-H2.4：状态字段由产品/运维侧控制是否渲染

#### US-H3：调派阶段高亮强化（基础能力复用）

**故事描述：** S4 阶段，消防水源高亮、Top-3 标注均通过标准件 `ResourceLayerController` 的 `action: HIGHLIGHT` 实现，**不写硬编码业务逻辑**。

**验收标准：**
- AC-H3.1：高亮通过标准接口触发，不在面板层硬编码
- AC-H3.2：Top-3 均为配置项，由产品侧定义
- AC-H3.3：S4 → S5 高亮状态自动保留，无需重复触发

#### US-H4：跟踪阶段状态实时刷新（事件类规则）

**故事描述：** S5 阶段，状态变更通过 `ResourceLayerController` 的 `state` 事件推送，前端按"事件类展示规则"渲染图标颜色变化。

**验收标准：**
- AC-H4.1：状态更新事件 → BFF 转换 → 前端重绘 ≤1s
- AC-H4.2：状态变更规则由 BFF 集中维护（不在面板层散落）
- AC-H4.3：S5 会话结束前资源状态全程保留

#### US-H5：消防水源详情查看（标准交互）

**故事描述：** 点击图标触发标准件 `ResourceLayerController` 的 `action: DETAIL`，弹出详情卡片。

**验收标准：**
- AC-H5.1：详情卡片为标准件复用，不为消防水源定制
- AC-H5.2：详情字段受"字段选择"配置控制
- AC-H5.3：交互事件（聚焦/关闭/ESC）由公共交互库处理

---

### 2.2 按模式分类

| 模式 | 是否上图 | 加载方式 | 资源实例 | 关键控制点 | 对应故事 |
|------|:-------:|---------|---------|-----------|---------|
| S1 值守 | 默认否（运维可控开启） | 全量加载 | 全市消防水源 | 默认不带 `cql_filter`，用于全局态势浏览 | `US-H1` |
| S2 来电 | 否 | — | — | 不单独展示消防水源图层 | — |
| S3 问询 | **是** | 受控加载 | 微围栏 + 1km 缓冲 | 字段集：`BASE + TYPE + STATUS + ASSOCIATION` | `US-H2` |
| S4 调派 | **是** | 受控加载（高亮） | 继承 S3 | 继承 S3 结果集并叠加高亮、Top-N | `US-H3` |
| S5 跟踪 | **是** | 受控加载（实时） | 继承 S4 | 继承 S4 结果集并响应状态刷新 | `US-H4` / `US-H5` |

> **设计约束**：模式跳转的**业务逻辑**（哪些模式上图、字段集如何变化）由**产品/运维侧配置**，GIS 模块仅消费配置。

---

### 2.3 资源类加载规则

#### 2.3.1 受控加载（CONTROLLED）

**复用标准能力** `ResourceLayerController.scope = MIXED(FENCE, RADIUS)`

**配置驱动：**

```yaml
# 资源类配置（产品/运维侧维护）
env_hydrant:
  default_scope:
    mode: MIXED
    fence_ref: micro_fence   # 引用微围栏
    radius_meters: 1000
  field_selector:
    - BASE
    - TYPE
    - STATUS
  enable_filter:                   # 启用过滤
    field: is_enabled
    enabled: false                 # false 表示不启用
    default_value: true            # 开启后仅保留可用水源
    include_disabled: true         # true 表示包含停用水源
  org_filter:                      # 机构过滤
    field: org_id                  # 所属消防机构ID
    default_mode: NONE
    org_ids: []                    # 空=不过滤
  text_filter:                     # 文本过滤
    fields: [water_name, address]  # 名称主查，地址兼容
    primary_field: water_name
    default_mode: CONTAINS
    case_sensitive: false
    pinyin_index: true             # 启用拼音索引
    tokenize: true                 # 启用中文分词
    regex_enabled: false           # 正则仅运维侧可开
  scene_overrides:
    S4:
      highlight: true
      top_n_nearest: 3
    S5:
      realtime_status: true
```

#### 2.3.2 全量加载（FULL）

**复用标准能力** `ResourceLayerController.scope = BBOX + CLUSTER`

**适用场景：**
- S1 值守（运维侧开启）
- 资源总览独立视图

> **反对无边界自定义**：全量加载仅在**明确业务场景**下启用，**不开放给客户自助配置**。

---

### 2.4 事件类展示规则

> 消防栓为资源类，**本身不定义事件类**。此处的事件类特指**状态变更事件**如何影响资源展示，由 BFF 统一规则处理。

| 事件类型 | 字段 | 渲染规则 | 配置主体 |
|---------|------|---------|---------|
| 位置（Position） | `longitude` / `latitude` | 资源类位置由加载时确定，**不响应位置变更事件** | 静态 |
| 阶段（Stage） | `launched_time` / `revoke_time` / `is_deleted` | 启用、撤销、删除决定是否展示 | 产品/运维 |
| 类型（Type） | `watertype_id` / `intake_form` | 类型字段保留在数据字典中，现行 WMS 样式不按类型区分图标 | 产品/运维 |
| 其他（Others） | `waternature_id` / `annex_id` | 性质分类、缩略图等扩展信息 | 产品/运维 |

**类型字段字典示例：**

```yaml
# 资源类字段字典（产品/运维侧维护）
env_hydrant_type_map:
  MUNICIPAL:   { label: "市政" }
  GROUND:      { label: "地上式" }
  UNDERGROUND: { label: "地下式" }
  MANUAL:      { label: "手动" }
```

---

### 2.5 人的交互

**全部交互通过标准件 `ResourceLayerController` 的 action 接口触发，** 不在面板层写业务硬编码：

| 交互 | 标准 action | 前端动作（公共件提供） | BFF 处理 |
|------|------------|---------------------|---------|
| 单击图标 | `DETAIL` | 弹出详情卡片 | 返回字段集范围内数据 |
| 详情卡片"聚焦" | `FOCUS` | fitBounds + 描边 | 触发范围过滤重查询 |
| 详情卡片"高亮" | `HIGHLIGHT` | 闪烁 + 描边 | 广播给同图层其他实例 |
| 关闭详情 | `RESET` | 恢复默认 | 广播给同图层其他实例 |
| ESC 关闭 | `RESET` | 恢复默认 | 广播给同图层其他实例 |

> **设计原则**：人机交互由**公共交互库**实现，资源类自身**不定义交互**。

---

## 三、BFF 设计

### 3.1 数据梳理边界（依据会议要求）

会议明确：**"数据梳理需覆盖前端交互层可用受控选项、GIS 自有库内可选择数据项两类"**。

#### 3.1.1 GIS 自有库内可选择数据项

消防栓的资源底座由 **GeoServer 图层视图** 承载，部分控制字段来源于**领域适配层映射后的字段**。

| 数据项 | 字段标识 | 来源 | 字段选择范围 |
|--------|---------|------|-------------|
| 水源唯一标识 | water_id | GeoServer | BASE（基础） |
| 水源名称 | water_name | GeoServer | BASE（基础） |
| 水源类型 | watertype_id | GeoServer | TYPE（可控） |
| 取水形式 | intake_form | GeoServer | TYPE（可控） |
| 水源性质 | waternature_id | GeoServer | TYPE（可控） |
| 几何位置 | geom (`longitude` / `latitude`) | GeoServer | BASE（基础） |
| 经度 | longitude | GeoServer | BASE（基础） |
| 纬度 | latitude | GeoServer | BASE（基础） |
| 位置描述 | address | GeoServer | BASE（基础） |
| **是否可用** | **is_enabled** | **GeoServer 视图字段（源自消防设施域映射）** | **BASE（基础，布尔型）** |
| **所属消防机构** | **org_id** | **GeoServer 视图字段（源自消防设施域映射）** | **ASSOCIATION（可控）** |
| 所属 AOI | aoi_id | GeoServer | ASSOCIATION（可控） |
| 缩略图附件 | annex_id | GeoServer | ASSOCIATION（可控） |
| 建造时间 | manuf_date | GeoServer | STATUS（可控） |
| 启用时间 | launched_time | GeoServer | STATUS（可控） |
| 撤销时间 | revoke_time | GeoServer | STATUS（可控） |
| 是否已删除 | is_deleted | GeoServer | STATUS（可控） |
| 数据来源 | datafrom_by | GeoServer | STATUS（可控） |

> `water_number` 存在于底表 `res_water`，但本版文档**不纳入前端字段字典**，原则上不透出给面板层；如出现明确检索或对账场景，再按扩展字段接入。

#### 3.1.1.1 位置字段统一词典

| 语义 | 统一字段名 | 说明 | 约束 |
|------|-----------|------|------|
| 经度 | `longitude` | WGS84 经度 | 禁止再使用 `lng` 简写 |
| 纬度 | `latitude` | WGS84 纬度 | 禁止再使用 `lat` 简写 |
| 空间几何 | `geom` | GeoServer / PostGIS 几何字段 | 需要时可由 `geom` 解析出 `longitude` / `latitude` |
| 位置描述 | `address` | 地址描述字段 | 与坐标字段解耦，不混作定位主键 |

> **命名约束**：本文档中的位置字段统一采用**全量英文名** `longitude` / `latitude`，不再混用 `lng` / `lat`。

#### 3.1.1.2 注释已给出的现成取值明细

| 字段 | 注释语义 | 现成取值/规则 | 使用说明 |
|------|---------|--------------|---------|
| `intake_form` | 取水形式 | `地下式` / `地上式` / `手动` / `市政` | 现行用于字段字典归类，未直接参与 WMS 样式区分 |
| `is_enabled` | 水源是否可用 | `true=可用` / `false=不可用` | 可直接用于启用过滤 |
| `is_deleted` | 是否已删除 | `false=未删除` / `true=已删除` | 可直接用于有效记录过滤 |
| `datafrom_by` | 数据归属业务系统来源 | 默认值：`7.0` | 适合做来源标识，不建议作为前端筛选首选项 |
| `watertype_id` | 水源类型ID | 引用维表 `res_watertype.watertype_id` | 本表注释未给出枚举值，需查维表 |
| `waternature_id` | 水源性质ID | 引用维表 `res_waternature.waternature_id` | 本表注释未给出枚举值，需查维表 |

#### 3.1.2 前端交互层可用受控选项

| 受控选项 | 选项值 | 默认值 | 配置主体 |
|---------|--------|--------|---------|
| 加载模式 | CONTROLLED / FULL | CONTROLLED | 产品/运维 |
| 范围模式 | CENTER_RADIUS / FENCE / BBOX / MIXED | MIXED | 产品/运维 |
| 缓冲半径 | 500m / 1000m / 2000m | 1000m | 产品/运维 |
| 字段集 | BASE / TYPE / STATUS / ASSOCIATION | BASE + TYPE + STATUS | 产品/运维 |
| 启用过滤 | is_enabled=true / false / all | false（默认不启用） | 产品/运维 |
| 机构过滤 | SINGLE / MULTI / EXCLUDE / NONE | NONE（按需配置） | 产品/运维 |
| **文本过滤** | **CONTAINS / STARTS_WITH / EXACT / REGEX（作用于 `water_name` + `address`）** | **空=不过滤** | **坐席输入（受控）** |
| 有效记录过滤 | is_deleted=false / all | is_deleted=false | 产品/运维 |
| 类型过滤 | watertype_id 子集 / intake_form 子集 / ALL | ALL | 坐席可切换 |
| Top-N 高亮 | 0 / 1 / 3 / 5 | 3 (S4) | 产品/运维 |

> **反对无边界自定义**：仅暴露上述**有限受控选项**，客户**不能**新增选项或修改选项值域。

---

### 3.2 输入（Inbound）— 数据来源与关系清单

| 来源 | 类型 | 用途 | 接口形态 |
|------|------|------|---------|
| GeoServer `gis:env_hydrant`（映射 `public.res_water`） | 地图资源 | 图层名、样式、几何、可过滤字段承载 | WMS/WFS |
| 消防设施域 / 资源库快照 | 领域数据 | `is_enabled` / `org_id` / `watertype_id` / `intake_form` 真值来源 | DB 快照 / HTTP API |
| 警情生命周期域 | 触发事件 | 大状态跳转 | MQ `incident.scene.changed`（杨作城团队发布） |

#### 3.2.1 关系梳理

| 对象 | 依赖谁 | 产出什么 | 给谁用 |
|------|-------|---------|-------|
| 领域适配层 | 消防设施域 / 资源库快照 / 警情生命周期域 | 领域字段、字段映射、领域事件 | BFF |
| 地图资源接入层 | GeoServer | `layer` / `style` / `geom` / 过滤字段映射 / WMS/WFS 服务 | 前端 |
| BFF | 领域适配层 | `LayerMeta`、过滤串、交互编排结果 | 前端 |
| 前端 | BFF + 地图资源接入层 | WMS 图层展示、交互结果回传 | 用户 |

> **精简原则**：仅对接与消防栓相关的状态机、字段和图层映射，**不**把 GeoServer 混入 DDD 概念层。

---

### 3.3 输出（Outbound）— 标准化渲染数据

#### 3.3.1 图层元数据（透传，不代理数据）

```typescript
interface LayerMeta {
  layer: string;            // "gis:env_hydrant"
  visible: boolean;
  style?: string;
  // 配置驱动，运维侧维护
  scope?: ScopeConfig;
  fields?: FieldSelector[];
}
```

#### 3.3.2 资源渲染数据

```typescript
interface HydrantRenderData {
  water_id: string;         // BASE
  water_name: string;       // BASE
  watertype_id: string;     // TYPE
  waternature_id?: string;  // TYPE
  intake_form?: string;     // TYPE
  longitude?: number;       // BASE
  latitude?: number;        // BASE
  geom: GeoJSON.Geometry;   // BASE
  address?: string;         // BASE
  is_enabled: boolean;      // STATUS
  is_deleted: boolean;      // STATUS
  org_id?: string;          // ASSOCIATION
  aoi_id?: string;          // ASSOCIATION
  annex_id?: string;        // ASSOCIATION
  manuf_date?: string;      // STATUS
  launched_time?: string;   // STATUS
  revoke_time?: string;     // STATUS
}
```

> **字段可选性**：除 `water_id`、`water_name`、`watertype_id`、`geom`、`is_enabled` 等资源模型核心字段外，其余字段按配置驱动按需输出。

#### 3.3.3 WebSocket 推送

```
通道：gis.resource.{incident_id}.env_hydrant
事件类型：LAYER_UPDATE / LAYER_REMOVE
载荷：DIFF 增量更新（added / updated / removed）
```

---

### 3.4 BFF 控制逻辑集中点

| 控制逻辑 | 实现位置 | 配置驱动 |
|---------|---------|---------|
| 范围过滤 | BFF | YAML 配置 |
| 字段选择 | BFF | YAML 配置 |
| 文本/机构/启用过滤拼装 | BFF | YAML 配置 |
| WMS 样式文件管理 | GeoServer SLD | XML 文件 |
| Top-N 距离计算 | BFF | 调用高德路径规划 |
| 有效记录/撤销记录判断 | BFF | YAML 配置 |
| 大状态跳转消费 | BFF | 订阅警情生命周期域事件 |
| GeoServer 地图服务调用 | **前端直连** | BFF 仅透传 LayerMeta |

> **核心原则**：控制逻辑**集中在 BFF**，面板层仅消费渲染数据，**不做任何业务逻辑判断**。

---

## 四、非功能性指标

| 指标 | 目标 | 说明 |
|------|------|------|
| 资源加载延迟 | ≤800ms | 受控加载到首要素渲染 |
| 状态更新延迟 | ≤1s | MQ 事件到图标重绘 |
| 详情查询响应 | ≤300ms | 点击到详情卡片 |
| 资源清除延迟 | ≤500ms | cleanup 到图层移除 |
| 缓冲半径精度 | ±50m | GeoServer 空间查询 |
| 接口复用度 | ≥80% | 资源类标准接口覆盖率 |
| 跨项目可移植 | ✓ | 不含业务硬编码 |

---

## 五、与其他资源协同

| 资源 | 协同方式 | 标准件复用 |
|------|---------|-----------|
| 建筑（building） | 同一围栏范围 | ResourceLayerController |
| 出入口（entrance_exit） | 同一围栏范围 | ResourceLayerController |
| 队站（res_org_dept） | 占用关系 | AssociationService |
| 微围栏（micro_fence） | 范围引用 | ScopeConfig.fence_ref |

> **设计目标**：所有资源类资源**复用同一 `ResourceLayerController`**，仅 `resource_type` 不同。

---

## 六、附录：精简对接资料

### 6.1 需对接的领域事件清单（已精简）

| 事件名 | 来源 | 用途 |
|--------|------|------|
| `incident.scene.changed` | 警情生命周期域 | 大状态跳转（杨作城团队） |
| `hydrant.status.changed` | 消防设施域 | 资源状态刷新 |
| `hydrant.pressure.changed` | 物联网/消防设施域 | 水压阈值告警 |

### 6.2 需剔除的非相关状态

- 问询中、判定中等**错误状态定义**（会议决策，已标红剔除）
- 消防设施域中与 GIS 无关的资产盘点流程
- 警情生命周期域中与地图无关的工单流转
