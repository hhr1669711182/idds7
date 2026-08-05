# 消防栓组件设计文档

## 一、场景

| 场景 | 模式 | 消防栓是否上图 | 控制条件 | 范围加载 | 图层 | 备注 |
|------|------|:-----------:|---------|---------|------|------|
| 场景 1 | S1 值守 | 否 | — | — | — | 值守阶段不单独展示消防栓图层 |
| 场景 2 | S2 来电弹屏 | 否 | — | — | — | 来电阶段暂不加载消防栓 |
| 场景 3 | S3 接警问询 | 否 | — | — | — | 问询阶段暂不加载消防栓 |
| 场景 4 | S4 图上调派 | 是 | 地图显示 ≥18 级 | 以警情事件中心点为中心，半径 1KM | 消防资源图层 → 消防栓组件 | 受控加载，支持机构过滤、文本过滤 |
| 场景 5 | S5 跟踪到场 | 是 | 地图显示 ≥18 级 | 以警情事件中心点为中心，半径 1KM | 消防资源图层 → 消防栓组件 | 继承 S4 结果集，状态刷新复用 |

## 二、消防栓组件设计

|组件|加载模式|范围动态加载|输出|适用场景|字段过滤|过滤规则|
|---|---|---|---|---|---|---|
|消防栓|受控|传入中心坐标、半径|根据坐标和半径，生成圆，点亮圆范围内的消防栓|定位圈周边资源|is\_enabled，水源是否可用|WITHIN，BBOX 范围过滤|
|||传入 AOI2，AOI3|点亮 AOI 几何范围内的消防栓|微围栏|intake\_form，取水形式|org\_id IN 机构过滤|
||| 无传入参数         | 不显示消防栓                                 | 默认           |launched\_time，启用时间|LIKE '% 软件园 %' 文本过滤|
|||                    |                                              |\-|manuf\_date，建造时间|is\_deleted=false 有效记录过滤|
|||\-|\-|\-|org\_id，所属消防机构|watertype 类型过滤|
|||\-|\-|\-|water\_name，名称匹配|\-|

 **组件点击详情：**

- 消火栓编号：
-  状态：可用/不可用 
- 地址： 
- 安装类型：地上式/地下式
-  口径：
-  流速： 
- 水压： 
- 水位（带蓄水池消火栓）： 
- 维护单位： 
- 最近巡检时间：



---

## 三、GIS 图层资源加载接口输入模板

### 接口基础信息

|项目|详情|
|---|---|
|请求方式|POST|
|接口路径|`/gis/v2/layers/resource/load`|
|内容类型|`application/json`|

---

### 完整请求体模板

```json
{ 
  "Component_type": "组件类型",
  "scope": {
    "mode": "范围模式",
    "fence_id": "复用微围栏几何ID",
    "center": [经度, 纬度],
    "radius_meters": 搜索半径（米）,
    "aoi_geom": "AOI几何范围（WKT/WKB格式）"
  },
  "fields": ["*"],
  "enable_filter": {
    "field": "is_enabled",
    "enabled": false,
    "value": true,
    "include_disabled": true
  },
  "org_filter": {
    "field": "org_id",
    "mode": "NONE",
    "org_ids": ["机构ID1", "机构ID2"]
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

---

### 参数详细说明

#### 1\. 基础参数

|参数名|类型|必填|说明|
|---|---|---|---|
|Component\_type|string|是|组件类型，消防栓图层固定为`env_hydrant`|

#### 2\. 范围配置 `scope`（对应图层动态加载规则）

|参数名|类型|必填|说明|对应图层加载场景|
|---|---|---|---|---|
|mode|string|是|范围模式枚举：`CIRCLE`（圆形范围）、`AOI`（几何范围）、`STATION`（队站辖区）、`VIEWPORT`（地图窗口）、`MIXED`（混合模式）|匹配不同的空间加载逻辑|
|fence\_id|string|否|复用已有微围栏几何 ID，`mode=MIXED`时必填|微围栏场景，点亮 AOI 几何范围内的消防栓|
|center|array|否|圆形范围中心点经纬度数组，格式`[经度, 纬度]`，`mode=CIRCLE`时必填|定位圈周边资源场景，配合半径生成圆形范围|
|radius\_meters|number|否|圆形范围搜索半径，单位：米，`mode=CIRCLE`时必填|配合中心点，圈定周边资源范围|
|aoi\_geom|string|否|AOI 几何范围，支持 WKT/WKB 格式，`mode=AOI`时必填|自定义几何范围匹配|

#### 3\. 字段配置 `fields`

- 类型：字符串数组

- 说明：指定接口返回的字段集，支持两种写法

    1. `["*"]`：返回该图层**全部字段**（包含基础、状态、关联、扩展所有字段）

    2. 分组枚举按需组合：

        - `BASE`：基础字段（水源编号、水源名称、水源类型、水源性质、取水形式、水源地址）

        - `STATUS`：状态字段（建造时间、启用时间、水源是否可用）

        - `ASSOCIATION`：关联字段（所属消防机构）

        - `EXTEND`：扩展字段（其他业务拓展字段）

- 示例：

    - 只返回基础 \+ 状态字段：`["BASE", "STATUS"]`

    - 返回全部字段：`["*"]`

#### 4\. 状态过滤 `enable_filter`

|参数名|类型|必填|说明|
|---|---|---|---|
|field|string|是|过滤字段名，固定为`is_enabled`（水源是否可用）|
|enabled|boolean|是|是否启用该过滤规则，`false`表示关闭过滤，展示全部数据源|
|value|boolean|否|过滤目标值，`true`表示仅保留可用水源，`false`表示仅保留不可用水源|
|include\_disabled|boolean|否|是否包含停用水源，`true`表示包含，`false`表示仅启用水源|

#### 5\. 机构过滤 `org_filter`

|参数名|类型|必填|说明|
|---|---|---|---|
|field|string|是|过滤字段名，固定为`org_id`（所属消防机构 ID）|
|mode|string|是|过滤模式：`NONE`（不过滤）、`IN`（包含指定机构）、`EXCLUDE`（排除指定机构）|
|org\_ids|array|否|机构 ID 列表，`mode≠NONE`时必填|

#### 6\. 文本过滤 `text_filter`

|参数名|类型|必填|说明|
|---|---|---|---|
|fields|array|是|文本匹配的字段列表，消防栓图层支持`water_name`（水源名称）、`address`（水源地址）|
|primary\_field|string|是|主匹配字段，优先匹配该字段，消防栓图层固定为`water_name`|
|mode|string|是|匹配模式：`CONTAINS`（包含）、`EXACT`（精确匹配）、`PREFIX`（前缀匹配）、`SUFFIX`（后缀匹配）|
|keyword|string|否|搜索关键词，为空则不生效文本过滤|
|case\_sensitive|boolean|否|是否区分大小写，默认`false`（不区分）|

---

### 消防栓图层专用示例

#### 示例 1：查询全部字段（使用 \["\*"\]）

```json
{
  "incident_id": "INC001",
  "resource_type": "env_hydrant",
  "scope": {
    "mode": "CIRCLE",
    "center": [116.403874, 39.914885],
    "radius_meters": 1000
  },
  "fields": ["*"],
  "enable_filter": {
    "field": "is_enabled",
    "enabled": true,
    "value": true,
    "include_disabled": false
  },
  "org_filter": {
    "field": "org_id",
    "mode": "IN",
    "org_ids": ["ORG001"]
  },
  "text_filter": {
    "fields": ["water_name", "address"],
    "primary_field": "water_name",
    "mode": "CONTAINS",
    "keyword": "XX路",
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
  "org_filter": {
    "field": "org_id",
    "mode": "NONE"
  },
  "text_filter": {
    "fields": ["water_name"],
    "primary_field": "water_name",
    "mode": "CONTAINS",
    "keyword": "",
    "case_sensitive": false
  }
}
```

> 
