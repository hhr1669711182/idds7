# 消防栓组件设计文档

​     

同步外部的数据到库

 GIS有自己的库

时空计算（同步到外面 、自己上图）



消防栓-》静态的、



模式--》控制层--》图层--》组件--》过滤



范围选择



消防栓特征



筛选（）



输出



## 一、场景

| 模式     | 控制层                                         | 图层         | 组件   |
| -------- | ---------------------------------------------- | ------------ | ------ |
| 值守模式 | -                                              | -            | -      |
| 来电弹屏 | -                                              | -            | -      |
| 接警问询 | -                                              | -            | -      |
| 图上调派 | 地图显示≥18级，以警情事件中心点为中心1KM范围内 | 消防资源图层 | 消防栓 |
| 跟踪到场 | 地图显示≥18级，以警情事件中心点为中心1KM范围内 | 消防资源图层 | 消防栓 |

## 二、消防栓/水鹤组件设计

### 2.1 范围过滤场景

| 范围模式   | 动态范围传入参数                                             | 几何描述                           | 输出                        | 适用场景           |
| ---------- | ------------------------------------------------------------ | ---------------------------------- | --------------------------- | ------------------ |
| `CIRCLE`   | `center`（经纬度）+ `radius_meters` + `radius_unit`（`m`/`km`） | 以中心点为圆心，指定半径的圆形范围 | 点亮圆形范围内的消防栓      | 定位圈周边资源     |
| `AOI`      | `aoi_geom`（aoi2、aoi3）【数据命名一致】                     | 指定多边形几何区域                 | 点亮 AOI 几何范围内的消防栓 | 小区围栏/ 辖区围栏 |
| `VIEWPORT` | 无需传入参数                                                 | 当前地图视口范围                   | 点亮视口内的消防栓          | 视口内资源浏览     |

### 2.2 定制条件状态过滤场景

| 过滤类型 | 过滤字段                     | 接口参数                         | 过滤含义         | 适用场景 |
| ---- | ------------------------ | ---------------------------- | ------------ | ---- |
| 状态过滤 | `is_enabled`（水源是否可用）     | `enable_filter.enabled=true` | 仅展示可用 / 停用水源 | 启用过滤 |
| 文本过滤 | `water_name` / `address` | `text_filter.keyword`        | 名称或地址模糊检索    | 文本检索 |

### 2.3 组件点击详情展示

点击消防栓图标后，在详情面板中展示该水源的基础信息。以下字段均来源于 `public.res_water` 真实表结构，暂无数据的字段标注"——"，后续如需展示应向产品/运维侧确认数据来源。

| 字段中文名       | 数据库字段     | 字段归属 | 详情面板展示                               | 备注                                                 |
| ---------------- | -------------- | -------- | ------------------------------------------ | ---------------------------------------------------- |
| 消火栓编号       | `water_number` | BASE     | `water_number` 值                          | 消防栓水源编码标识                                   |
| 坐标（经纬度）   |                |          |                                            | 存在库里，不直接在详情展示（通过这个坐标值放到图上） |
| 上次巡查状态     | `is_enabled`   | BASE     | `is_enabled=true` → 可用；`false` → 不可用 | WMS 样式状态：灰色：false；红色：true                |
| 最近巡检时间     | —              | —        | —                                          |                                                      |
| 安装类型         | `intake_form`  | TYPE     | `intake_form` 值                           | 取值示例：`地上式` / `地下式`                        |
| 口径（官方名）   | —              | —        | —                                          |                                                      |
| 管网（地下支撑） |                |          |                                            |                                                      |

> **字段归属说明**：`BASE` 为基础资源字段；`TYPE` 为类型字段；`STATUS` 为状态字段。详见 ods7gis 数据库 res\_water 表

***

## 三、GIS 图层资源加载接口输入模板

### 接口基础信息

| 项目   | 详情                             |
| ---- | ------------------------------ |
| 请求方式 | POST                           |
| 接口路径 | `/gis/v2/layers/resource/load` |
| 内容类型 | `application/json`             |

***

### 完整请求体模板

```json
{ 
  "Component_type": "组件类型",
  "scope": {
    "mode": "范围模式",
    "fence_id": "复用微围栏几何ID",
    "center": [经度, 纬度],
    "radius_meters": 搜索半径（米）,
    "radius_unit":"m",
    "aoi_geom": "AOI几何范围（WKT/WKB格式）"
  },
  "fields": ["*"],
  "enable_filter": {
    "field": "is_enabled",
    "enabled": false,
    "value": true,
    "include_disabled": true
  },
  "text_filter": {
    "fields": ["water_name", "address"],
    "primary_field": "water_name",
    "mode": "CONTAINS",
    "keyword": "搜索关键词",
    "case_sensitive": false
  }
}
```

***

### 参数详细说明

#### 1. 基础参数

| 参数名             | 类型     | 必填 | 说明                         |
| --------------- | ------ | -- | -------------------------- |
| Component\_type | string | 是  | 组件类型，消防栓图层固定为`env_hydrant` |

#### 2. 范围配置 `scope`（对应图层动态加载规则）

| 参数名            | 类型     | 必填 | 说明                                                                               | 对应图层加载场景               |
| -------------- | ------ | -- | -------------------------------------------------------------------------------- | ---------------------- |
| mode           | string | 是  | 范围模式枚举：`CIRCLE`（圆形范围）、`AOI`（几何范围）、`STATION`（队站辖区）、`VIEWPORT`（地图窗口）、`MIXED`（混合模式） | 匹配不同的空间加载逻辑            |
| fence\_id      | string | 否  | 复用已有微围栏几何 ID，`mode=MIXED`时必填                                                     | 微围栏场景，点亮 AOI 几何范围内的消防栓 |
| center         | array  | 否  | 圆形范围中心点经纬度数组，格式`[经度, 纬度]`，`mode=CIRCLE`时必填                                       | 定位圈周边资源场景，配合半径生成圆形范围   |
| `radius_meters` | number | 否  | 圆形范围搜索半径，单位由 `radius_unit` 指定，默认`m`（米），`mode=CIRCLE`时必填  | 配合中心点，圈定周边资源范围 |
| radius\_unit   | string | 否  | 半径单位枚举：`m`（米）、`km`（公里），默认`m`                                    | 指定半径数值单位               |
| aoi\_geom      | string | 否  | AOI 几何范围，支持 WKT/WKB 格式，`mode=AOI`时必填                                | 自定义几何范围匹配             |



#### 3. 状态过滤 `enable_filter`

| 参数名               | 类型      | 必填 | 说明                                      |
| ----------------- | ------- | -- | --------------------------------------- |
| field             | string  | 是  | 过滤字段名，固定为`is_enabled`（水源是否可用）           |
| enabled           | boolean | 是  | 是否启用该过滤规则，`false`表示关闭过滤，展示全部数据源         |
| value             | boolean | 否  | 过滤目标值，`true`表示仅保留可用水源，`false`表示仅保留不可用水源 |
| include\_disabled | boolean | 否  | 是否包含停用水源，`true`表示包含，`false`表示仅启用水源      |

```
                   |
```

#### 4. 文本过滤 `text_filter`

| 参数名             | 类型      | 必填 | 说明                                                              |
| --------------- | ------- | -- | --------------------------------------------------------------- |
| fields          | array   | 是  | 文本匹配的字段列表，消防栓图层支持`water_name`（水源名称）、`address`（水源地址）             |
| primary\_field  | string  | 是  | 主匹配字段，优先匹配该字段，消防栓图层固定为`water_name`                              |
| mode            | string  | 是  | 匹配模式：`CONTAINS`（包含）、`EXACT`（精确匹配）、`PREFIX`（前缀匹配）、`SUFFIX`（后缀匹配） |
| keyword         | string  | 否  | 搜索关键词，为空则不生效文本过滤                                                |
| case\_sensitive | boolean | 否  | 是否区分大小写，默认`false`（不区分）                                          |

***

### 消防栓图层专用示例

#### 示例 1：查询全部字段（使用 \["\*"]）

```json
{
  "incident_id": "INC001",
  "resource_type": "env_hydrant",
  "scope": {
    "mode": "CIRCLE",
    "center": [116.403874, 39.914885],
    "radius_meters": 1000,
    "radius_unit":"m"
  },
  "fields": ["*"],
  "enable_filter": {
    "field": "is_enabled",
    "enabled": true,
    "value": true,
    "include_disabled": false
  },
  "text_filter": {
    "fields": ["water_name", "address"],
    "primary_field": "water_name",
    "mode": "CONTAINS",
    "keyword": "深圳软件园一期1栋1层室内消火栓",
    "case_sensitive": false
  }
}
```

#### 示例 2：按需指定部分分组字段

```json
{
  "incident_id": "INC001",
  "resource_type": "env_hydrant",
  "scope": {
    "mode": "VIEWPORT"
  },
  "fields": ["BASE", "STATUS"],
  "enable_filter": {
    "field": "is_enabled",
    "enabled": false
  },
  "text_filter": {
    "fields": ["water_name"],
    "primary_field": "water_name",
    "mode": "CONTAINS",
    "keyword": "深圳软件园一期1栋1层室内消火栓",
    "case_sensitive": false
  }
}
```



