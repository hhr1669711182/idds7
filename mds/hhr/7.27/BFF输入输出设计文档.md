# GIS地图模块 — BFF输入输出设计文档

> 版本：v2.1（用户故事基线对齐版）
> 日期：2026-07-22
> 状态：正式版

***

## 一、模块定位与BFF职责

### 1.1 定位

GIS地图模块是消防接处警系统的**态势呈现层**，通过订阅DDD领域事件获取实时态势数据，在地图上广播呈现，不驱动任何状态机流转。

**BFF（Backend for Frontend）层**是GIS模块的前置聚合服务，承担三大职责：

1. **场景编排**：管理5大场景（S1-S5）的状态切换、图层组合配置、入口参数校验
2. **领域数据聚合**：聚合DDD领域服务（警情生命周期、车辆管理、接警问询、预案管理等）的实时态势数据，通过WebSocket推送给前端
3. **GeoServer元数据透传**：**不代理GeoServer数据**，仅传递视图名称（layer name）+ 默认可见性（visible），前端直接用视图名调用GeoServer WMS/WFS获取图层数据

### 1.2 GeoServer调用模式（关键设计）

```
┌──────────────────────────────────────────────────────────────┐
│                         前端（Web / 坐席）                    │
│   BFF只提供 layer: "视图名" + visible: 布尔值               │
│   前端直接调用GeoServer WMS/WFS获取图层数据                   │
└────────────────────────────┬─────────────────────────────────┘
                             │  前端直连
                             ▼
                      ┌──────────────┐
                      │  GeoServer   │
                      │  WMS / WFS   │
                      └──────────────┘

BFF不转发、不缓存GeoServer数据
```

### 1.3 技术边界

```
┌─────────────────────────────────────────────────────────────┐
│                    前端（Web / 坐席）                        │
│  WebSocket订阅 / HTTP API调用 / GeoServer直连WMS/WFS         │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼───────────────────────────────────┐
│                    GIS-BFF 层                               │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ 场景管理器   │  │ 态势数据聚合 │  │ GeoServer元数据透传 │ │
│  │ SceneMgr    │  │ LayerAgg    │  │ LayerMetaPassThrough│ │
│  └──────────────┘  └──────────────┘  └───────────────────┘ │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP / WS / MQ
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ 警情生命  │  │ 车辆管理  │  │ 接警问询  │
    │  周期     │  │           │  │           │
    └──────────┘  └──────────┘  └──────────┘
    ┌──────────┐  ┌──────────┐
    │ 调派模块  │  │ 预案管理  │
    └──────────┘  └──────────┘
```

***

## 二、场景定义与状态机

### 2.1 五大场景

| 场景编号 | 场景名称 | 触发条件           | 来源模块                              |
| ---- | ---- | -------------- | --------------------------------- |
| S1   | 值守模式 | 登录坐席 / 由其他模式返回 | seat\_state → FREE                |
| S2   | 来电弹屏 | 主屏振铃中          | call\_status → Ring               |
| S3   | 问询阶段 | 问询已创建          | inquiry\_state → CREATED          |
| S4   | 图上调派 | 警情已立案          | alarmincident\_state → CREATED    |
| S5   | 跟踪到场 | 车辆已出动          | alarmincident\_state → DISPATCHED |

### 2.2 场景切换链路

```
[S1-值守] ←————→ [S2-来电弹屏] ———→ [S3-问询] ———→ [S4-调派] ———→ [S5-跟踪]
                ↓ 挂断未立案                      ↓ 全部归队结案
               返回[S1]                           返回[S1-值守]
```

***

## 三、BFF输入（Inbound）— 场景数据需求矩阵

> 说明：BFF汇总各场景所需的**输入数据**，明确每个场景需要调用哪些下游服务、获取哪些字段。

### 3.1 场景1（S1）— 值守模式

**用户故事：**

- US1-1：以坐席技能组对应区域几何中心点为地图中心，智能缩放展示全城态势总览
- US1-2：地图默认加载未结案警情、主管队站及辖区、实时路况、重点单位/微围栏/建筑等图层，可单独开关
- US1-3：支持切换3D白膜
- **US1-4（新增）：地图中心点经纬度同步至前端store，微区域模型跟随地图中心点移动加载**

| 数据类别          | 下游服务       | 调用方式     | 获取字段                                                         | 过滤条件                                   |
| ------------- | ---------- | -------- | ------------------------------------------------------------ | -------------------------------------- |
| 坐席状态          | 状态管理模块     | 前端同步     | scene\_state = "DAILY\_STANDBY"                              | operator\_id                           |
| 实时路况          | 高德路况API    | BFF轮询30s | 拥堵路段geom                                                     | —                                      |
| 主管队站          | GeoServer  | WFS查询    | gis:view\_res\_org\_dept                                     | operator\_id                           |
| 辖区围栏          | GeoServer  | WFS查询    | gis:view\_juris\_zone                                        | operator\_id或辖区围栏                      |
| 重点单位          | GeoServer  | WFS查询    | gis:view\_env\_enterprises                                   | 微围栏范围内（可选）                             |
| 人员密集场所        | GeoServer  | WFS查询    | gis:env\_build\_aoi                                          | 微围栏范围内（可选）                             |
| 微围栏（兴趣面/小区围栏） | GeoServer  | WFS查询    | gis:env\_micro\_fence（待确认）                                   | 微围栏范围内（可选）                             |
| 建筑图层          | GeoServer  | WFS查询    | gis:view\_env\_building                                      | 微围栏范围内（可选）                             |
| 未结案警情         | 警情生命周期     | MQ订阅     | incident\_id / status / address / lng / lat / org\_id / type | status NOT IN (POST\_ACTION\_REVIEWED) |
| 静态图标资源        | 本地/GIS-BFF | 静态配置     | 图标URL集合（红/蓝各6类灾情图标）                                          | —                                      |

**输出给前端（S1）：**

| 图层类型     | 元数据格式                   | GeoServer视图名               | 默认可见 | 说明                    |
| -------- | ----------------------- | -------------------------- | :--: | --------------------- |
| 主管队站图标   | LayerMeta\[]            | gis:view\_res\_org\_dept   |   ✅  | 点图标                   |
| 辖区围栏     | LayerMeta\[]            | gis:view\_juris\_zone      |   ✅  | 面围栏                   |
| 局部道路     | LayerMeta\[]            | gis:env\_greatchina\_road  |   ✅  | 路网数据                  |
| 拥堵路段     | LayerMeta\[]            | gis:env\_greatchina\_road  |   ✅  | 颜色编码：绿/黄/红/灰          |
| 重点单位     | LayerMeta\[]            | gis:view\_env\_enterprises |   ✅  | —                     |
| 微围栏（兴趣面） | LayerMeta\[]            | gis:env\_entrance\_exit    |   ✅  | 兴趣面/小区围栏              |
| 消防车出入口   | LayerMeta\[]            | gis:env\_entrance\_exit    |   ✅  | 微围栏范围内                |
| 建筑       | LayerMeta\[]            | gis:view\_env\_building    |   ✅  | —                     |
| 警情图标     | ECharts scatter overlay | —                          |   —  | 由BFF通过MQ订阅实时推送        |
| 图层配置     | JSON                    | —                          |   —  | operator\_id维度的图层开关状态 |

> **GeoServer调用说明**：BFF仅提供 `layer: "视图名"` + `visible: 布尔值`，前端据此直连GeoServer WMS/WFS获取图层数据，BFF不代理、不转发GeoServer数据。

**US1-4 联动输出（新增）：**

| 数据项                   | 方向     | 说明                                   |
| --------------------- | ------ | ------------------------------------ |
| map\_center\_changed  | 前端→BFF | 地图中心点变更时，BFF将中心点(lng, lat)同步至前端store |
| micro\_region\_reload | BFF→前端 | 微区域模型根据新中心点触发重新加载请求                  |

***

### 3.2 场景2（S2）— 来电弹屏

**用户故事：**

- US2-1：主屏手机来电，以基站坐标绘制500m圈，完整居中展示；无基站坐标则不展示
- US2-2：主屏固话来电，以装机地址坐标绘制500m圈，完整居中展示；无装机地址则不展示
- US2-3：500m圈内文字清晰展示定位类型（基站粗定位/固话装机定位）
- **US2-4（新增）：切换3D白膜时，模型中心点同步至当前定位位置，同步展示定位素材和半径圈效果**
- **US2-5（新增）：来电未接听/挂断后，执行已上图资源注销操作，返回值守模式**

| 数据类别   | 下游服务       | 调用方式      | 获取字段                                      | 过滤条件   |
| ------ | ---------- | --------- | ----------------------------------------- | ------ |
| 坐席状态   | 状态管理模块     | 前端同步      | scene\_state = "CALL\_RINGING"            | —      |
| 运营商定位  | 接警问询-运营商定位 | HTTP/WS推送 | location\_id / lng / lat / location\_type | 当前通话   |
| 装机地址定位 | 接警问询       | HTTP/WS推送 | address / lng / lat                       | 固话三字段  |
| 主管队站   | GeoServer  | WFS查询     | gis:view\_res\_org\_dept                  | 主管队站ID |
| 辖区围栏   | GeoServer  | WFS查询     | gis:view\_juris\_zone                     | 主管队站ID |
| 重点单位   | GeoServer  | WFS查询     | gis:view\_env\_enterprises                | 微围栏范围内 |
| 人员密集场所 | GeoServer  | WFS查询     | gis:env\_build\_aoi                       | 微围栏范围内 |
| 微围栏    | GeoServer  | WFS查询     | gis:env\_micro\_fence（待确认）                | 微围栏范围内 |
| 建筑图层   | GeoServer  | WFS查询     | gis:view\_env\_building                   | 微围栏范围内 |

**输出给前端（S2）：**

| 图层类型    | 元数据格式                  | GeoServer视图名             | 默认可见 | 说明                         |
| ------- | ---------------------- | ------------------------ | :--: | -------------------------- |
| 500m定位圈 | GeoJSON Circle Polygon | —                        |   —  | BFF生成，中心=(lng, lat)，半径500m |
| 定位类型标签  | ECharts text overlay   | —                        |   —  | "基站粗定位" / "固话装机定位"         |
| 主管队站图标  | LayerMeta\[]           | gis:view\_res\_org\_dept |   ✅  | 主管队站图标                     |
| 辖区围栏    | LayerMeta\[]           | gis:view\_juris\_zone    |   —  | 微围栏过滤后                     |
| 重点地标    | LayerMeta\[]           | gis:view\_key\_landmarks |   ✅  | 图标点图层                      |
| 建筑      | LayerMeta\[]           | gis:view\_env\_building  |   —  | 微围栏过滤后                     |
| 人员密集场所  | LayerMeta\[]           | gis:env\_build\_aoi      |   —  | 微围栏过滤后                     |

> **GeoServer调用说明**：BFF仅提供 `layer: "视图名"` + `visible: 布尔值`，前端直连GeoServer WMS/WFS获取数据。

**输出给前端（S2）— 来电拒接/挂断：**

| 指令类型                    | 触发条件                          | 前端动作          |
| ----------------------- | ----------------------------- | ------------- |
| CLEAR\_LOCATION\_CIRCLE | call\_status → HANGUP（未立案）    | 立即清除500m圈     |
| FADE\_LOCATION\_CIRCLE  | inquiry\_state → CREATED（已立案） | 2-3s渐隐淡出500m圈 |

**US2-4 联动输出（3D白膜同步定位，新增）：**

| 指令类型                         | 内容                                        | 说明                                                 |
| ---------------------------- | ----------------------------------------- | -------------------------------------------------- |
| 3D\_MODEL\_CENTER\_SYNC      | { lng, lat, zoom\_level }                 | 切换3D白膜时，模型中心点自动对齐至当前定位坐标(lng, lat)，zoom自动适配500m圈范围 |
| 3D\_LOCATION\_CIRCLE\_RENDER | { lng, lat, radius: 500, location\_type } | 3D视图下同步渲染500m定位圈及类型标签                              |

**US2-5 联动输出（资源注销，新增）：**

| 事件名                     | 方向     | 说明                                |
| ----------------------- | ------ | --------------------------------- |
| GIS\_RESOURCES\_CLEANUP | BFF→前端 | 挂断后执行已上图资源注销，清理500m圈、定位标签等，返回值守模式 |
| SCENE\_SWITCH\_TO\_S1   | BFF→前端 | 携带S1值守全城图层配置，前端加载值守视图             |

***

### 3.3 场景3（S3）— 问询阶段

**用户故事：**

- US3-1：保持粗定位圈展示；确认主管队站后展示管辖范围圈（不规则多边形辖区围栏），高亮主管队站图标
- US3-2：确认地址后反查预制微围栏（AOI3），自动隐藏粗定位圈
- US3-3：确认微围栏后展示微围栏内建筑/消防栓/出入口，聚焦核心灾情区域
- US3-4：支持切换3D白膜
- **US3-5（新增）：从问询研判模块获取相似警情事件集合，展示微缩模型+微缩地图位置定位+相似度**
- **US3-6：从灾害画像模块获取建筑ID，调用`gis:view_env_building`展示建筑模型**
- **US3-7（新增）：从灾害画像获取着火楼层/被困人数/烟雾情况，表单列表展示+3D模型着火楼层高亮**

| 数据类别      | 下游服务       | 调用方式      | 获取字段                                                        | 过滤条件           |
| --------- | ---------- | --------- | ----------------------------------------------------------- | -------------- |
| 坐席状态      | 状态管理模块     | 前端同步      | scene\_state = "INQUIRY"                                    | —              |
| 主管队站      | GeoServer  | WFS查询     | gis:view\_res\_org\_dept                                    | 主管队站ID         |
| 其他管辖边界圈   | 接警问询模块     | HTTP API  | org\_id / geom\_polygon / priority                          | 主辖区+重叠辖区       |
| 粗定位圈      | 接警问询（延续S2） | WS订阅      | lng / lat / location\_type                                  | 微围栏确认前保留       |
| 微围栏（AOI3） | 接警问询确认触发   | 本地/GIS库查询 | geom / aoi\_id / aoi\_name                                  | 问询确认地址后        |
| 建筑        | GeoServer  | WFS查询     | gis:view\_env\_building                                     | 微围栏范围内+外延500m  |
| 消防栓       | GeoServer  | WFS查询     | gis:env\_hydrant                                            | 微围栏+周边1km缓冲    |
| 小区/建筑出入口  | GeoServer  | WFS查询     | gis:env\_entrance\_exit                                     | 微围栏范围内         |
| 本警情事件     | 警情生命周期     | MQ订阅      | status / address / lng / lat / org\_id / type / alarm\_time | 当前incident\_id |
| 灾害画像      | 灾害画像模块     | HTTP API  | building\_id / fire\_floor / trapped\_count / smoke\_status | 当前incident\_id |
| 相似警情      | AI相似警情推荐   | HTTP API  | inquiry\_id / similarity / incident\_list\[]                | 当前incident\_id |
| 附近重点单位    | GeoServer  | WFS查询     | gis:view\_env\_enterprises                                  | 微围栏外延500m      |

**输出给前端（S3）：**

| 图层类型      | 元数据格式           | GeoServer视图名               | 默认可见 | 说明                                                                    |
| --------- | --------------- | -------------------------- | :--: | --------------------------------------------------------------------- |
| 粗定位圈      | GeoJSON Circle  | —                          |   —  | S2延续，确认微围栏后渐隐消除                                                       |
| 管辖范围圈（主）  | GeoJSON Polygon | —                          |   —  | BFF/接警问询模块提供坐标                                                        |
| 管辖范围圈（其他） | GeoJSON Polygon | —                          |   —  | 淡化色                                                                   |
| 微围栏（兴趣面）  | LayerMeta\[]    | gis:env\_entrance\_exit    |   ✅  | 接警问询确认触发                                                              |
| 消防车出入口    | LayerMeta\[]    | gis:env\_entrance\_exit    |   ✅  | 微围栏范围内                                                                |
| 建筑        | LayerMeta\[]    | gis:view\_env\_building    |   ✅  | 微围栏范围内+外延500m                                                         |
| 消防栓       | LayerMeta\[]    | gis:env\_hydrant           |   ✅  | 微围栏内+1km缓冲                                                            |
| 出入口       | LayerMeta\[]    | gis:env\_entrance\_exit    |   ✅  | 微围栏范围内                                                                |
| 重点单位      | LayerMeta\[]    | gis:view\_env\_enterprises |   —  | 微围栏外延500m                                                             |
| 本警情图标     | ECharts scatter | —                          |   —  | 红/蓝色按状态，BFF实时推送                                                       |
| 相似警情图标    | ECharts scatter | —                          |   —  | 边框高亮区分                                                                |
| 模型交互数据    | JSON            | —                          |   —  | building\_id / fire\_floor / trapped\_count / smoke\_status（送3D左侧详情窗） |

> **GeoServer调用说明**：BFF仅提供 `layer: "视图名"` + `visible: 布尔值`，前端直连GeoServer WMS/WFS获取数据。

**US3-5 相似警情研判输出（新增）：**

| 数据项    | 格式               | 说明                                                                                                      |
| ------ | ---------------- | ------------------------------------------------------------------------------------------------------- |
| 相似警情列表 | JSON Array       | inquiry\_id / similarity（相似度分数）/ incident\_info（状态/报警时间/地址/经纬度/主管队站/类型）/ micro\_thumbnail\_url（微缩地图定位图） |
| 微缩模型数据 | JSON             | incident\_id → 3D模型微缩快照URL                                                                              |
| 微缩地图   | Static Image URL | 相似警情在地图上的微缩位置标注图                                                                                        |

**US3-6 建筑模型展示输出（新增）：**

| 数据项         | 格式      | 说明                                             |
| ----------- | ------- | ---------------------------------------------- |
| 建筑模型GeoJSON | GeoJSON | gis:view\_env\_building                        |
| 建筑基础信息      | JSON    | 名称/结构类型/火灾风险等级                                 |
| 3D模型数据      | JSON    | building\_id → 3D模型资源URL（供ECharts GL或Mapbox渲染） |

**US3-7 着火楼层/被困/烟雾表单输出（新增）：**

| 数据项      | 格式   | 说明                                                                |
| -------- | ---- | ----------------------------------------------------------------- |
| 着火楼层     | JSON | building\_id / floor\_number / fire\_intensity                    |
| 被困人数     | JSON | count / location\_description                                     |
| 烟雾情况     | JSON | smoke\_level（浓烟/轻烟/无烟）/ spread\_direction                         |
| 3D模型高亮指令 | JSON | floor\_highlight: { building\_id, floor, color }（3D模型着火楼层发光/变色高亮） |
| 表单展示     | JSON | 统一聚合为表单数据结构，3D左侧详情窗口展示，地图不叠加标签                                    |

***

### 3.4 场景4（S4）— 图上调派

**用户故事：**

- US4-1：主管队站+最近3个支撑队站围栏，智能缩放+留边；支撑队站筛选：直线10km范围→不足则倍增，直至凑满3个；最终以导航距离排序
- **US4-2（新增）：调用`gis:view_juris_zone`接口根据警情地址查询主管队站ID，自动加载该站全部可调度车辆列表（主管队站为单数）**
- US4-3：待命车辆亮色可勾选；非待命灰色半透明不可勾选
- US4-4：点击其他队站图标也可拉取车辆列表；待命在前
- US4-5：车辆选中为前端临时状态，不持久化
- **US4-6（新增）：地图勾选与右侧调派表单实时双向同步；以触发调派按钮的方案为准，若后端调派单已生成但前端未刷新，后端触发警告提醒（已触发调派单）**
- US4-7：点击"提交调派"，批量提交给调派后台，HTTP等待响应
- US4-8：高亮微围栏，明确灾害位置范围
- US4-9：高亮微围栏内消防栓（1km缓冲）+出入口+主干道/支路
- US4-10：支持切换3D白膜

| 数据类别                              | 下游服务          | 调用方式            | 获取字段                                          | 过滤条件                            |
| --------------------------------- | ------------- | --------------- | --------------------------------------------- | ------------------------------- |
| 坐席状态                              | 状态管理模块        | 前端同步            | scene\_state = "DISPATCHING"                  | —                               |
| **主管队站辖区（gis:view\_juris\_zone）** | **GeoServer** | **WFS查询（新增接口）** | **juris\_zone\_id / org\_id / geom\_polygon** | **警情地址模糊匹配**                    |
| 主管队站                              | GeoServer     | WFS查询           | gis:view\_res\_org\_dept                      | 主管队站ID                          |
| 最近3个支撑队站                          | 调派模块          | HTTP API        | org\_id / geom / distance                     | 导航距离排序                          |
| 微围栏                               | 接警问询确认触发      | 本地/GIS库         | geom / aoi\_id                                | 继承S3                            |
| 建筑                                | GeoServer     | WFS查询           | gis:view\_env\_building                       | 微围栏范围内                          |
| 消防栓                               | GeoServer     | WFS查询           | gis:env\_hydrant                              | 微围栏内+周边1km                      |
| 出入口                               | GeoServer     | WFS查询           | gis:env\_entrance\_exit                       | 微围栏范围内                          |
| 本警情事件                             | 警情生命周期        | MQ订阅            | status / address / lng / lat                  | 当前incident\_id                  |
| 主管队站待命车辆                          | 车辆管理模块        | HTTP API        | car\_id / car\_name / car\_type / status      | org\_id + status=DAILY\_STANDBY |
| AI调派方案                            | 调派模块-方案推荐     | HTTP API        | dispatch\_plan\_id / vehicle\_list\[]         | 当前incident\_id                  |
| 预案推荐车辆                            | 预案管理模块        | HTTP API        | preplan\_id / recommended\_vehicle\_list\[]   | 当前incident\_id                  |
| 路径规划（静态）                          | 高德路径规划        | HTTP API        | route\_geom / distance / duration             | 车辆→灾害点（预规划）                     |
| 高德路况（实时）                          | 高德路况API       | BFF轮询30s        | traffic\_status / route\_geom                 | 动态路况                            |

**输出给前端（S4）：**

| 图层类型        | 元数据格式              | GeoServer视图名              | 默认可见 | 说明               |
| ----------- | ------------------ | ------------------------- | :--: | ---------------- |
| 主管队站围栏      | LayerMeta\[]       | gis:view\_juris\_zone     |   ✅  | 粉色高亮             |
| 支撑队站围栏      | LayerMeta\[]       | gis:view\_juris\_zone     |   ✅  | 与主管颜色区分          |
| 微围栏（兴趣面）    | LayerMeta\[]       | gis:env\_entrance\_exit   |   ✅  | 接警问询确认触发         |
| 消防车出入口      | LayerMeta\[]       | gis:env\_entrance\_exit   |   ✅  | 微围栏范围内           |
| 建筑          | LayerMeta\[]       | gis:view\_env\_building   |   ✅  | 微围栏范围内           |
| 消防栓         | LayerMeta\[]       | gis:env\_hydrant          |   ✅  | 微围栏+1km缓冲        |
| 出入口         | LayerMeta\[]       | gis:env\_entrance\_exit   |   ✅  | 微围栏范围内           |
| 核心路网（主干+支路） | LayerMeta\[]       | gis:env\_greatchina\_road |   ✅  | 分级渲染             |
| 本警情图标       | ECharts scatter    | —                         |   —  | 红色，BFF实时推送       |
| 队站图标        | GeoJSON Point      | —                         |   —  | 点击弹出车辆列表卡片       |
| 车辆图标（待命）    | ECharts scatter    | —                         |   —  | 亮色，可勾选           |
| 车辆图标（非待命）   | ECharts scatter    | —                         |   —  | 灰色/半透明，不可勾选      |
| 预案推荐车辆      | ECharts scatter    | —                         |   —  | 金色醒目标注           |
| 导航连线        | GeoJSON LineString | —                         |   —  | 绿色（车辆→灾害点），出动后消失 |
| 缺车提示        | JSON               | —                         |   —  | 右上角提示：缺车类型\*N    |
| 画中画（特种车辆）   | JSON               | —                         |   —  | 角落展示外辖区特种车位置     |

> **GeoServer调用说明**：BFF仅提供 `layer: "视图名"` + `visible: 布尔值`，前端直连GeoServer WMS/WFS获取数据。

**BFF → 前端交互事件（S4）：**

| 事件名                             | 方向             | 说明                        |
| ------------------------------- | -------------- | ------------------------- |
| VEHICLE\_SELECTED               | 前端→BFF         | 车辆被勾选加入调派列表               |
| VEHICLE\_DESELECTED             | 前端→BFF         | 车辆取消勾选                    |
| ONE\_CLICK\_DISPATCH            | 前端→BFF         | 点击"一键调派"按钮                |
| DISPATCH\_CONFIRMED             | BFF→前端         | 调派已确认，显示"等待队站确认"          |
| DISPATCH\_SHORTAGE              | BFF→前端         | 缺车类型+数量提示                 |
| **DISPATCH\_CONFLICT\_WARNING** | **BFF→前端（新增）** | **后端调派单已生成但前端未刷新，后端主动警告** |

**US4-6 双向同步+后端警告机制（新增）：**

| 机制     | 说明                                                          |
| ------ | ----------------------------------------------------------- |
| 前端→BFF | 前端勾选/取消车辆时实时同步勾选状态至BFF                                      |
| BFF→前端 | BFF将调派表单当前勾选车辆列表实时同步至前端                                     |
| 后端警告   | 若后端调派单已生成但BFF未收到前端刷新确认（5s超时），BFF主动推送给前端告警弹窗："已有调派单生成，请刷新页面" |
| 同步频率   | WebSocket实时推送，延迟≤200ms                                      |

**BFF → 调派模块接口（S4）：**

```
POST /dispatch/v1/dispatch-orders
Body: {
  incident_id: string,
  vehicle_ids: string[],   // 已勾选车辆ID列表
  dispatch_type: "ONE_CLICK",
  operator_id: string
}
Response: {
  dispatch_order_id: string,
  status: "PENDING_CONFIRM" | "CONFIRMED" | "REJECTED",
  message: string
}
```

***

### 3.5 场景5（S5）— 跟踪到场

**用户故事：**

- **US5-1（新增）：上图展示调派方案内所有在线车辆位置，实时跟踪轨迹（MQ接收GPS，30s间隔），历史轨迹在当前跟踪会话中全程保留展示**
- US5-2：ETA由GIS调用高德路径规划根据车辆GPS变化计算，30s步长更新
- US5-3：首车到场事件触发，地图动画无缝切入微观视图（微围栏自适应），所有图层状态保留
- US5-4：工作重心从"宏观途中调度"过渡到"现场战术支撑"
- US5-5：支持切换3D白膜

| 数据类别    | 下游服务      | 调用方式     | 获取字段                                              | 过滤条件             |
| ------- | --------- | -------- | ------------------------------------------------- | ---------------- |
| 坐席状态    | 状态管理模块    | 前端同步     | scene\_state = "TRACKING"                         | —                |
| 主管队站    | GeoServer | WFS查询    | gis:view\_res\_org\_dept                          | 主管队站ID           |
| 车辆GPS位置 | 车辆管理/移动指挥 | MQ订阅     | car\_id / lng / lat / gps\_time / speed / heading | 调派方案内车辆，30s      |
| 车辆历史轨迹  | 车辆管理模块    | HTTP API | car\_id / track\_points\[] / geom                 | 调派方案内车辆          |
| 高德路径规划  | 高德路径规划    | HTTP API | route\_geom / eta / distance / traffic\_status    | 车辆当前位置→灾害点，30s更新 |
| 微围栏     | 接警问询确认触发  | 本地/GIS库  | geom / aoi\_id                                    | 继承S3/S4          |
| 集结区     | GeoServer | WFS查询    | gis:env\_muster\_zone                             | 微围栏范围内           |
| 消防栓     | GeoServer | WFS查询    | gis:env\_hydrant                                  | 微围栏+周边1km        |
| 出入口     | GeoServer | WFS查询    | gis:env\_entrance\_exit                           | 微围栏范围内           |
| 建筑      | GeoServer | WFS查询    | gis:view\_env\_building                           | 微围栏范围内           |
| 本警情事件   | 警情生命周期    | MQ订阅     | status / address / lng / lat                      | 当前incident\_id   |

**输出给前端（S5）：**

| 图层类型        | 元数据格式                | GeoServer视图名             | 默认可见 | 说明               |
| ----------- | -------------------- | ------------------------ | :--: | ---------------- |
| 主管队站图标      | LayerMeta\[]         | gis:view\_res\_org\_dept |   ✅  | 主管队站特殊颜色区分       |
| 辖区围栏        | LayerMeta\[]         | gis:view\_juris\_zone    |   ✅  | 辖区围栏             |
| 微围栏（兴趣面）    | LayerMeta\[]         | gis:env\_entrance\_exit  |   ✅  | 高亮               |
| 消防车出入口      | LayerMeta\[]         | gis:env\_entrance\_exit  |   ✅  | 微围栏范围内           |
| 集结区         | LayerMeta\[]         | gis:env\_muster\_zone    |   ✅  | 静态               |
| 建筑          | LayerMeta\[]         | gis:view\_env\_building  |   ✅  | 微围栏范围内           |
| 消防栓         | LayerMeta\[]         | gis:env\_hydrant         |   ✅  | 微围栏+周边1km        |
| 出入口         | LayerMeta\[]         | gis:env\_entrance\_exit  |   ✅  | 微围栏范围内           |
| 本警情图标       | ECharts scatter      | —                        |   —  | 红色，BFF实时推送       |
| 车辆图标（主管）    | ECharts scatter      | —                        |   —  | ⭐特殊颜色标注          |
| 车辆图标（其他）    | ECharts scatter      | —                        |   —  | 普通颜色             |
| 历史轨迹线       | GeoJSON LineString   | —                        |   —  | 灰色，全会话保留（US5-1）  |
| 预测轨迹线（选中）   | GeoJSON LineString   | —                        |   —  | 深绿色              |
| 预测轨迹线（备选×2） | GeoJSON LineString   | —                        |   —  | 浅绿色              |
| 高德导航路线      | GeoJSON LineString   | —                        |   —  | 颜色=交通状态（绿/黄/红/灰） |
| ETA标签       | ECharts text overlay | —                        |   —  | "约8分钟 / 3.2km"   |

> **GeoServer调用说明**：BFF仅提供 `layer: "视图名"` + `visible: 布尔值`，前端直连GeoServer WMS/WFS获取数据。

**US5-1 全量车辆上线+历史轨迹保留机制（新增）：**

| 机制     | 说明                                                                  |
| ------ | ------------------------------------------------------------------- |
| 车辆上线范围 | 调派方案内所有车辆（含主管队站+支撑队站），全部上图                                          |
| 实时位置推送 | MQ接收`vehicle.position.changed`事件，30s间隔更新，推送至gis.vehicle.{car\_id}通道 |
| 历史轨迹存储 | BFF维护S5会话内历史轨迹（Redis，TTL=会话周期），前端可随时查询展示                            |
| 轨迹清除时机 | S5会话结束（归队/结案）时统一清除                                                  |
| 主管车辆标注 | 主管队站车辆在所有车辆中以⭐特殊颜色区分，持续跟踪                                           |

| 事件名                     | 来源             | BFF动作                                  |
| ----------------------- | -------------- | -------------------------------------- |
| FIRST\_VEHICLE\_ARRIVED | 车辆管理/移动指挥/处警指挥 | BFF推送 `VIEW_SWITCH_TRIGGER` 事件，携带3s倒计时 |
| VIEW\_SWITCH\_CANCELLED | 前端（用户取消）       | BFF取消切换，维持宏观视图                         |
| MICRO\_VIEW\_ENGAGED    | BFF内部定时器触发     | 前端切换至微观视图（微围栏自适应）                      |

***

## 四、BFF输出（Outbound）— WebSocket实时推送协议

### 4.1 订阅通道定义

| 通道名                       | 协议        | 说明        |
| ------------------------- | --------- | --------- |
| `gis.layer.{scene}`       | WebSocket | 场景图层数据推送  |
| `gis.event.{incident_id}` | WebSocket | 单警情相关事件订阅 |
| `gis.vehicle.{car_id}`    | WebSocket | 单车实时位置订阅  |

### 4.2 消息格式（统一JSON封装）

```json
{
  "channel": "gis.layer.S4",
  "message_id": "uuid-v4",
  "timestamp": "2026-07-22T15:25:00.000+08:00",
  "event_type": "LAYER_UPDATE" | "LAYER_REMOVE" | "VIEW_SWITCH" | "ALERT",
  "payload": { ... }
}
```

### 4.2 LayerMeta 数据类型（GeoServer元数据）

BFF传递给前端的GeoServer图层元数据，前端据此**直连GeoServer WMS/WFS**获取图层数据：

```typescript
interface LayerMeta {
  layer: string;      // GeoServer视图/图层名称，如 "gis:view_res_org_dept"
  visible: boolean;   // 默认是否展示
  style?: string;     // 可选，GeoServer样式名称
}
```

**前端调用GeoServer示意：**

```
BFF仅提供 layer + visible，前端持有GeoServer访问凭证直连调用：

WFS查询：
GET {GeoServer}/geoserver/workspace/wfs?
  service=WFS&version=2.0.0&request=GetFeature&
  typeNames=workspace:{layer}&
  outputFormat=application/json&
  filter=<CQL_FILTER>

WMS渲染：
GET {GeoServer}/geoserver/workspace/wms?
  service=WMS&version=1.3.0&request=GetMap&
  layers=workspace:{layer}&
  styles={style}&
  bbox=<bbox>&width=800&height=600&format=image/png
```

> **安全说明**：GeoServer访问凭证由前端持有，BFF不代理、不转发GeoServer数据，不参与数据转发。

***

### 4.3 推送事件类型定义

#### LAYER\_UPDATE（图层数据更新）

```json
{
  "event_type": "LAYER_UPDATE",
  "payload": {
    "layer_name": "vehicle_icons",
    "scene": "S4",
    "data": [
      {
        "car_id": "C001",
        "lng": 120.123456,
        "lat": 30.234567,
        "car_type": "泡沫车",
        "car_name": "泡沫车-杭州01",
        "status": "DISPATCHED",
        "is_primary_org": true,
        "is_preplan_recommended": true,
        "is_selectable": true
      }
    ],
    "update_mode": "FULL" | "DIFF"
  }
}
```

#### LAYER\_REMOVE（图层元素移除）

```json
{
  "event_type": "LAYER_REMOVE",
  "payload": {
    "layer_name": "navigation_lines",
    "entity_ids": ["C001", "C003"],
    "reason": "VEHICLE_DEPARTED"
  }
}
```

#### VIEW\_SWITCH（视图切换触发）

```json
{
  "event_type": "VIEW_SWITCH",
  "payload": {
    "trigger": "FIRST_VEHICLE_ARRIVED",
    "countdown_seconds": 3,
    "target_view": "MICRO",
    "center_lng": 120.123456,
    "center_lat": 30.234567,
    "zoom_level": 16,
    "cancelable": true
  }
}
```

#### ALERT（告警提示）

```json
{
  "event_type": "ALERT",
  "payload": {
    "alert_type": "DISPATCH_SHORTAGE",
    "message": "泡沫车 ×2",
    "vehicle_types_needed": ["泡沫车"],
    "count": 2,
    "position": "TOP_RIGHT"
  }
}
```

***

## 五、HTTP API 接口清单

### 5.1 场景初始化接口

#### POST /gis/v2/scenes/{scene}/init

**描述：** 前端切换场景时，BFF聚合该场景所需的全量图层数据

**路径参数：**

| 参数    | 类型     | 说明             |
| ----- | ------ | -------------- |
| scene | string | S1/S2/S3/S4/S5 |

**Query参数：**

| 参数               | 类型     | 说明                  |
| ---------------- | ------ | ------------------- |
| operator\_id     | string | 必填，操作员ID            |
| incident\_id     | string | 场景S3/S4/S5必填，当前警情ID |
| inquiry\_id      | string | 场景S3必填，当前问询ID       |
| primary\_org\_id | string | 场景S3/S4必填，主管队站ID    |
| call\_id         | string | 场景S2必填，当前通话ID       |

**响应：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "scene": "S4",
    "layers": {
      "city_base": { "type": "BASE_MAP" },
      "geo_layers": [
        { "layer": "gis:view_res_org_dept", "visible": true, "style": "org_zone_style" },
        { "layer": "gis:view_env_building", "visible": true },
        { "layer": "gis:env_hydrant", "visible": true },
        { "layer": "gis:env_entrance_exit", "visible": true },
        { "layer": "gis:env_greatchina_road", "visible": true },
        { "layer": "gis:view_env_enterprises", "visible": true }
      ],
      "dynamic_layers": {
        "incident_icons": { "type": "MQ_PUSH", "data": [...] },
        "vehicle_icons": { "type": "MQ_PUSH", "data": [...] },
        "traffic_realtime": { "type": "AMAP_POLL", "interval_ms": 30000, "data": {...} }
      }
    },
    "scene_config": {
      "zoom_range": [1, 19],
      "center_constraint": "JURISDICTION",
      "default_zoom": 12,
      "traffic_poll_interval_ms": 30000
    }
  }
}
```

### 5.2 地理查询接口

#### GET /gis/v2/geoserver/juris-zone

**描述（US4-2）：** 根据警情地址查询主管队站辖区围栏，调用GeoServer `gis:view_juris_zone` 接口

**Query参数：**

| 参数           | 类型     | 说明         |
| ------------ | ------ | ---------- |
| address      | string | 警情地址（模糊匹配） |
| incident\_id | string | 关联警情ID     |

**响应：**

```json
{
  "code": 0,
  "data": {
    "juris_zone_id": "JZ001",
    "org_id": "ORG001",
    "org_name": "杭州消防支队",
    "geom": "POLYGON((...))",
    "center_lng": 120.123456,
    "center_lat": 30.234567
  }
}
```

### 5.3 车辆调派接口

#### POST /gis/v2/dispatch/vehicles/select

**描述：** 前端勾选/取消车辆，BFF记录前端临时状态并转发给调派模块

**请求体：**

```json
{
  "incident_id": "INC001",
  "car_id": "C001",
  "action": "SELECT" | "DESELECT",
  "operator_id": "OP001"
}
```

**响应：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "selected_vehicles": ["C001", "C003"],
    "dispatch_ready": true,
    "shortage_warning": null
  }
}
```

#### POST /gis/v2/dispatch/submit

**描述：** 一键调派，BFF将已勾选车辆批量提交给调派模块

**请求体：**

```json
{
  "incident_id": "INC001",
  "vehicle_ids": ["C001", "C003"],
  "dispatch_type": "ONE_CLICK",
  "operator_id": "OP001"
}
```

**响应：**

```json
{
  "code": 0,
  "message": "调派单已提交，等待队站确认",
  "data": {
    "dispatch_order_id": "DO001",
    "status": "PENDING_CONFIRM",
    "submitted_at": "2026-07-22T15:25:00.000+08:00"
  }
}
```

### 5.3 车辆相关接口

#### GET /gis/v2/vehicles/station/{org\_id}

**描述：** 获取指定队站的可用车辆列表（S4队站卡片点击）

**响应：**

```json
{
  "code": 0,
  "data": {
    "org_id": "ORG001",
    "org_name": "杭州消防支队",
    "vehicles": [
      {
        "car_id": "C001",
        "car_name": "泡沫车-杭州01",
        "car_type": "泡沫车",
        "plate_number": "浙A·12345",
        "status": "DAILY_STANDBY",
        "eta_minutes": 8,
        "distance_km": 3.2,
        "capacity": "泡沫4吨",
        "is_preplan_recommended": true,
        "is_selectable": true
      }
    ]
  }
}
```

#### GET /gis/v2/vehicles/multi/query

**描述：** 多车位置批量查询（最多500辆）

**Query参数：**

| 参数           | 类型     | 说明          |
| ------------ | ------ | ----------- |
| car\_ids     | string | 逗号分隔，最多500个 |
| incident\_id | string | 关联警情ID      |

**响应：**

```json
{
  "code": 0,
  "data": {
    "vehicles": [
      {
        "car_id": "C001",
        "lng": 120.123456,
        "lat": 30.234567,
        "speed_kmh": 45,
        "heading": 90,
        "gps_time": "2026-07-22T15:24:30.000+08:00",
        "car_type": "泡沫车",
        "status": "DISPATCHED"
      }
    ]
  }
}
```

#### GET /gis/v2/vehicles/{car\_id}/track

**描述：** 车辆历史轨迹查询

**Query参数：**

| 参数           | 类型     | 说明        |
| ------------ | ------ | --------- |
| incident\_id | string | 必填，关联警情ID |
| start\_time  | string | 可选，轨迹开始时间 |
| end\_time    | string | 可选，轨迹结束时间 |

**响应：**

```json
{
  "code": 0,
  "data": {
    "car_id": "C001",
    "track_points": [
      { "lng": 120.111, "lat": 30.222, "gps_time": "...", "speed_kmh": 0 },
      { "lng": 120.115, "lat": 30.228, "gps_time": "...", "speed_kmh": 30 }
    ],
    "total_distance_km": 3.2,
    "duration_seconds": 420
  }
}
```

### 5.4 路径规划接口

#### GET /gis/v2/routes/plan

**描述：** 调用高德路径规划，计算车辆到灾害点的路线

**Query参数：**

| 参数            | 类型     | 说明           |
| ------------- | ------ | ------------ |
| vehicle\_lng  | number | 车辆当前经度       |
| vehicle\_lat  | number | 车辆当前纬度       |
| dest\_lng     | number | 目的地经度        |
| dest\_lat     | number | 目的地纬度        |
| vehicle\_type | string | 车辆类型（影响路径规划） |

**响应：**

```json
{
  "code": 0,
  "data": {
    "routes": [
      {
        "route_id": "R001",
        "geom": "LINESTRING(...)",
        "distance_km": 3.2,
        "duration_seconds": 480,
        "traffic_status": "SMOOTH",
        "traffic_color": "#52C41A"
      }
    ],
    "eta_minutes": 8,
    "alternative_routes": [
      { "route_id": "R002", "distance_km": 3.5, "duration_seconds": 520, "traffic_status": "SLOW" },
      { "route_id": "R003", "distance_km": 4.1, "duration_seconds": 600, "traffic_status": "CONGESTED" }
    ]
  }
}
```

### 5.5 警情相关接口

#### GET /gis/v2/incidents/{incident\_id}/layer-data

**描述：** 获取指定警情的图层数据（S3/S4/S5共用）

**响应：**

```json
{
  "code": 0,
  "data": {
    "incident_id": "INC001",
    "location": { "lng": 120.123456, "lat": 30.234567, "address": "杭州市上城区..." },
    "status": "CREATED",
    "alarm_time": "2026-07-22T15:00:00.000+08:00",
    "org_id": "ORG001",
    "incident_type": "火灾",
    "micro_fence": { "geom": "...", "aoi_id": "AOI001", "aoi_name": "XXX小区" },
    "building_info": {
      "building_id": "B001",
      "name": "XXX大厦",
      "structure_type": "钢混",
      "fire_risk_level": "高",
      "fire_floor": 5,
      "trapped_count": 3,
      "smoke_status": "浓烟"
    }
  }
}
```

#### GET /gis/v2/incidents/{incident\_id}/similar（US3-5新增）

**描述：** 获取相似警情列表，用于问询阶段相似警情研判

**响应：**

```json
{
  "code": 0,
  "data": {
    "inquiry_id": "IQ001",
    "incident_id": "INC001",
    "similar_incidents": [
      {
        "incident_id": "INC000",
        "similarity": 0.85,
        "status": "DISPATCHED",
        "alarm_time": "2026-07-21T10:00:00.000+08:00",
        "address": "杭州市上城区...",
        "lng": 120.124000,
        "lat": 30.235000,
        "org_id": "ORG001",
        "incident_type": "火灾",
        "micro_thumbnail_url": "https://.../thumbnail/INC000.png",
        "micro_model_url": "https://.../model/INC000.glb"
      }
    ]
  }
}
```

#### GET /gis/v2/incidents/{incident\_id}/building-model（US3-6新增）

**描述：** 获取建筑模型数据，用于展示当前警情建筑3D模型

**响应：**

```json
{
  "code": 0,
  "data": {
    "building_id": "B001",
    "name": "XXX大厦",
    "structure_type": "钢混",
    "fire_risk_level": "高",
    "geom": "POLYGON((...))",
    "model_url": "https://.../models/B001.glb",
    "floors": 22,
    "height_m": 66
  }
}
```

#### GET /gis/v2/incidents/{incident\_id}/fire-situation（US3-7新增）

**描述：** 获取着火楼层/被困人数/烟雾情况，用于3D模型高亮+表单展示

**响应：**

```json
{
  "code": 0,
  "data": {
    "incident_id": "INC001",
    "building_id": "B001",
    "fire_situation": {
      "fire_floor": 5,
      "fire_intensity": "猛烈燃烧",
      "smoke_status": "浓烟",
      "smoke_spread_direction": "向上蔓延"
    },
    "rescue_info": {
      "trapped_count": 3,
      "trapped_location": "5层东侧",
      "emergency_ exits_blocked": true
    },
    "3d_highlight_instruction": {
      "building_id": "B001",
      "floor": 5,
      "highlight_color": "#FF4D4F",
      "highlight_mode": "GLOW"
    }
  }
}
```

### 5.6 图层配置接口

#### GET /gis/v2/layers/config

**描述：** 获取操作员图层配置（登录时自动还原）

**Query参数：**

| 参数           | 类型     | 说明      |
| ------------ | ------ | ------- |
| operator\_id | string | 必填      |
| scene        | string | 可选，指定场景 |

**响应：**

```json
{
  "code": 0,
  "data": {
    "operator_id": "OP001",
    "configs": {
      "S1": { "layer_toggle": { "org_zones": true, "road_network": true, "incident_icons": true, ... } },
      "S4": { "layer_toggle": { "hydrants": true, "entrances": true, ... } }
    }
  }
}
```

#### PUT /gis/v2/layers/config

**描述：** 保存操作员图层配置

**请求体：**

```json
{
  "operator_id": "OP001",
  "scene": "S4",
  "layer_toggle": {
    "org_zones": true,
    "road_network": true,
    "aoi_micro": true,
    "buildings": true,
    "hydrants": true,
    "entrances": true,
    "incident_icons": true,
    "vehicle_icons": true,
    "navigation_lines": true
  }
}
```

***

## 六、输入输出总览矩阵

### 6.1 场景 × 数据来源矩阵

| 数据项                              | S1值守 | S2来电 | S3问询 | S4调派 | S5跟踪 |
| -------------------------------- | :--: | :--: | :--: | :--: | :--: |
| 状态管理（坐席状态）                       |   ✅  |   ✅  |   ✅  |   ✅  |   ✅  |
| 高德实时路况                           |   ✅  |   —  |   —  |   ✅  |   ✅  |
| GeoServer队站围栏                    |   ✅  |   ✅  |   ✅  |   ✅  |   ✅  |
| GeoServer重点单位                    |   ✅  |   ✅  |   ✅  |   —  |   —  |
| GeoServer微围栏（兴趣面）                |   ✅  |   ✅  |   ✅  |   —  |   —  |
| GeoServer建筑                      |   ✅  |   ✅  |   ✅  |   ✅  |   ✅  |
| GeoServer消防栓                     |   —  |   —  |   ✅  |   ✅  |   ✅  |
| GeoServer出入口                     |   —  |   —  |   ✅  |   ✅  |   ✅  |
| GeoServer集结区                     |   —  |   —  |   —  |   —  |   ✅  |
| **gis:view\_juris\_zone（US4-2）** |   —  |   —  |   —  |   ✅  |   —  |
| 运营商定位                            |   —  |   ✅  |   —  |   —  |   —  |
| 管辖范围圈                            |   —  |   —  |   ✅  |   —  |   —  |
| 微围栏                              |   —  |   —  |   ✅  |   ✅  |   ✅  |
| 警情生命周期（MQ）                       |   ✅  |   —  |   ✅  |   ✅  |   ✅  |
| 灾害画像（HTTP）                       |   —  |   —  |   ✅  |   —  |   —  |
| AI相似警情（HTTP）                     |   —  |   —  |   ✅  |   —  |   —  |
| **相似警情-微缩模型/地图（US3-5）**          |   —  |   —  |   ✅  |   —  |   —  |
| **建筑模型（US3-6）**                  |   —  |   —  |   ✅  |   —  |   —  |
| **着火楼层/被困/烟雾（US3-7）**            |   —  |   —  |   ✅  |   —  |   —  |
| 车辆管理-待命车列表                       |   —  |   —  |   —  |   ✅  |   —  |
| 车辆管理-GPS位置（MQ）                   |   —  |   —  |   —  |   —  |   ✅  |
| 车辆管理-历史轨迹                        |   —  |   —  |   —  |   —  |   ✅  |
| 调派模块-方案推荐                        |   —  |   —  |   —  |   ✅  |   —  |
| 预案管理-推荐车辆                        |   —  |   —  |   —  |   ✅  |   —  |
| 高德路径规划                           |   —  |   —  |   —  | ✅(预) | ✅(动) |

### 6.2 BFF转换处理对照

| 转换项                     | 源格式            | 目标格式                      | BFF处理逻辑                 |
| ----------------------- | -------------- | ------------------------- | ----------------------- |
| GeoServer WFS → GeoJSON | XML/WFS        | GeoJSON FeatureCollection | BFF解析WFS响应，提取features字段 |
| WMS瓦片 → ECharts         | WMS GetMap URL | ECharts image overlay     | BFF生成带token的WMS URL返回前端 |
| 警情状态 → 图标颜色             | status\_code   | color\_hex                | BFF维护状态-颜色映射表           |
| 车辆GPS → 导航路线            | (lng,lat)列表    | GeoJSON LineString        | BFF调用高德API转换            |
| 粗定位坐标 → 500m圈           | (lng,lat)      | GeoJSON Circle Polygon    | BFF生成立即 GeoJSON圆        |
| 路况状态 → 颜色               | traffic\_code  | color\_hex                | BFF维护路况-颜色映射表           |

***

## 七、非功能性指标

| 指标名           | 目标值    | 说明               |
| ------------- | ------ | ---------------- |
| 场景初始化加载时间     | ≤1.5s  | S1-S5场景切换首帧到达时间  |
| 图层数据更新延迟      | ≤500ms | MQ消息到达→前端渲染完成    |
| 车辆GPS更新延迟     | ≤1s    | GPS上报→位置更新的端到端延迟 |
| 路径规划计算时间      | ≤2s    | BFF调用高德API→返回前端  |
| WebSocket断连重连 | ≤3s    | 断连检测到重连完成        |
| 同时监控车辆数       | ≤500辆  | S5场景下多车实时跟踪上限    |
| 支持前端坐席并发      | ≥200席  | BFF服务水平扩展支持      |

