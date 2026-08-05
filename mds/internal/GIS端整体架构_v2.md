# GIS 端整体架构（适配多独立前端项目模式）

> **基于用户故事重构**：统一 GIS 底图基础设施与跨模块协作，支持「手动操作 + 程序化控制」双模式。

---

## 目录

- [一、整体架构总览](#一整体架构总览)
- [二、GISAppService 层](#二gisappservice-层前端应用服务层--浏览器内运行非后端服务)
- [三、统一事件系统（Event Bus）](#三统一事件系统event-bus)
- [四、场景生命周期管理器（SceneManager）](#四场景生命周期管理器scenemanager)
- [五、跨项目共享 GIS 组件包（`@fire/gis-components`）](#五跨项目共享-gis-组件包firegis-components)
  - [1. GIS 基础组件层（纯能力原子）](#1-gis-基础组件层纯能力原子)
  - [2. GIS 业务基础组件层（消防领域通用）](#2-gis-业务基础组件层消防领域通用)
- [六、各前端项目私有 GIS 应用组件](#六各前端项目私有-gis-应用组件)
- [七、架构设计要点 & 技术决策](#七架构设计要点--技术决策)
- [附录一：核心接口定义示例](#附录一核心接口定义示例)
- [附录二：术语表](#附录二术语表)
- [附录三：架构决策记录（ADR）](#附录三架构决策记录adr)

---

## 一、整体架构总览

```
+------------------------------------------------------------------+
|             接警项目 / 调度项目 / 值守项目 / 移动项目               |
|  +-----------+ +----------+ +---------+ +--------------+         |
|  | 接警问询端 | | 调度指挥端 | | 值守总览 | | 移动指挥(MDT) |      |
|  +-----+-----+ +----+-----+ +----+----+ +------+-------+        |
|        |            |            |              |                |
|        +------------+------------+--------------+                |
|                      |   调用                                    |
|              +-------v-------+                                  |
|              |   GISAppService |                                  |
|              |   Service     | <- 程序化接口统一门面               |
|              | (Event Bus)   | <- 所有变更发布事件                 |
|              | (Scene Mgr)   | <- 场景生命周期管理                 |
|              +-------+-------+                                  |
|                      | 使用                                      |
|              +-------v-------+                                  |
|              |  @fire/gis-   |                                  |
|              |  components   | <- 共享组件包                      |
|              |  (基础+业务)   |                                  |
|              +---------------+                                  |
+------------------------------------------------------------------+
```

### 双层级结构

| 层级 | 说明 | 用户故事对应 |
|------|------|-------------|
| **GISAppService** | 前端应用服务层（浏览器内运行）；程序化接口统一门面，暴露 setCenter()、toggleLayer()、loadDataLayer() 等；内含 Event Bus 和 SceneManager | AC-01~AC-03, AC-06 |
| **共享组件包** (@fire/gis-components) | 通用 GIS 能力封装为私有 npm 包，所有前端项目构建时引入 | 各故事共享 |
| **项目私有组件** | 每个前端项目内部维护专属的 GIS 业务视图组件，耦合各自业务流程 | 各项目独立 |

### 双模式协作原理

```
  +----------------+          +----------------+
  |  接警员手动操作  |          | 其他模块程序化调用 |
  |  (滚轮/拖拽/点击)|          | (接口触发)        |
  +--------+-------+          +--------+-------+
           |                           |
           v                           v
  +-----------------------------------------+
  |           GISAppService                  |
  |  +-----------------------------------+   |
  |  |          Event Bus                |   |
  |  |  ZoomChanged / CenterChanged      |   |
  |  |  LayerToggled / DataUpdated       |   |
  |  |  SceneTransition / ...            |   |
  |  +-----------------------------------+   |
  |         |              +                 |
  |         v              |                 |
  |  地图实例 ---> 执行操作 -+                 |
  +-----------------------------------------+
           |
           v
    地图引擎（高德/超图/天地图/ArcGIS）
```

**核心原则**：手动操作和程序化调用走同一条 Event Bus，产生相同的事件和最终状态（AC-06）。

---

## 二、GISAppService 层（前端应用服务层 — 浏览器内运行，非后端服务）

### 定位

所有对外能力通过 GISAppService 统一暴露，其他业务模块**不允许直接操作地图实例**。GISAppService 是浏览器内运行的前端模块，非后端 GIS 服务。

### 核心接口

| 接口 | 签名 | 触发事件 | 对应AC |
|------|------|---------|--------|
| setCenter | (lat, lng, zoom?) | CenterChanged、ZoomChanged | AC-01 |
| zoomTo | (level) | ZoomChanged | -- |
| toggleLayer | (layerId, visible) | LayerToggled | AC-02 |
| loadDataLayer | (layerId, data, options?) | DataLayerLoaded | AC-03 |
| updateDataLayer | (layerId, data, merge?) | DataLayerUpdated | AC-03 |
| fitBounds | (bounds, padding?) | BoundsChanged | 3.4.1 |
| setScene | (scene, params?) | SceneTransition | 全场景 |

### 约束

- **接口响应时间（非动画类，如 toggleLayer、loadDataLayer）<= 300ms**；**带动画的接口（如 setCenter 包含地图平移动画）动画完成 <= 3000ms（符合 AC-01）**
- 关键操作（setCenter 跳转 > 10km、大批量数据加载）需**审计日志 + 权限校验**
- 默认中心点、缩放级别、图层可见性支持**后台配置化**
- **监听后端事件**：GISAppService 订阅后端事件总线上的「警情已定位」消息（由后端业务服务发布，GIS 后端不关心消息来源），收到后自动触发 hide(粗定位圈) + hide(管辖围栏) + load(微围栏)

---

## 三、统一事件系统（Event Bus）

### 发布者（唯一）：`GISAppService`

所有事件均由 GISAppService 统一发布。手动操作（接警员滚轮/拖拽/点击）和程序化调用（其他模块调用 API）都经过 GISAppService → 更新地图状态 → 发布事件，没有任何组件可以绕过它直接 `emit`。`source` 字段区分两条入参路径。

```
                     ┌─────────────────────────────┐
                     │          GISAppService        │
                     │       （唯一发布者）           │
                     │  手动操作 -> setCenter / ...   │
                     │  程序化调用 -> setCenter / ... │
                     └─────────────┬───────────────┘
                                   │ publish(event, payload)
                                   v
                     ┌─────────────────────────────┐
                     │          Event Bus           │
                     │  subscribe(event, handler)   │
                     └──────┬──────────────┬───────┘
                            │              │
              ┌─────────────┼───────┐      │
              v             v       v      v
        SceneManager   私有组件   业务模块  AuditLogger
```

### 订阅拓扑

| 订阅者 | 订阅事件 | 消费行为 |
|--------|---------|---------|
| **SceneManager** | `VehicleArrived` | 自动触发 scene 切换到 on_scene |
| | `SceneTransition` | 校验链路合法性，驱动图层卸载/加载 |
| **IncomingCallPopupMap** | `PositionCircleUpdated` | 渲染/更新粗定位圈 |
| | `SceneTransition(to='incoming_call')` | 激活来电弹屏 GIS 视图 |
| **InquiryLocationPanel** | `FenceChanged` | 管辖围栏高亮同步 |
| | `PositionCircleUpdated` | 粗定位圈叠加显示 |
| **DispatchResourceMap** | `FenceChanged` | 四级围栏联动刷新 |
| | `VehicleDispatched` | 调派完成的 UI 反馈（勾选状态重置） |
| **VehicleTrackingView** | `CenterChanged`（throttled） | 地图跟随移动车辆 |
| | `SceneTransition` | 跟踪/到场场景切换 |
| **DutyOverviewMap** | `LayerToggled` | 图层面板状态同步 |
| | `DataLayerUpdated` | 警情/资源数据实时刷新 |
| **AuditLogger** | 全部事件 | 审计日志落库（关键操作：setCenter 跨区跳转、loadDataLayer 批载、一键调派） |
| **其他业务模块** | 按需订阅 | 如通话模块监听 `PositionCircleUpdated` 联动主屏 |

### 事件列表

所有事件载荷统一携带 `source: 'manual' | 'programmatic'` 字段（下表省略该字段以聚焦业务载荷）。

| 事件名称 | 业务载荷 | 触发时机 |
|---------|---------|---------|
| MapReady | `{ engine, version }` | 地图引擎初始化完成 |
| CenterChanged | `{ lat, lng }` | 中心点变更（拖拽中 throttle 200ms） |
| ZoomChanged | `{ level }` | 缩放级别变更 |
| BoundsChanged | `{ bounds, padding? }` | 视野适配完成 |
| LayerToggled | `{ layerId, visible }` | 图层开关 |
| DataLayerLoaded | `{ layerId, featureCount }` | 数据图层加载完成 |
| DataLayerUpdated | `{ layerId, diff }` | 数据增量更新 |
| FeatureClicked | `{ featureId, coordinates, properties }` | 点击地图要素 |
| PositionCircleUpdated | `{ center, radius, type }` | 粗定位圈变更 |
| FenceChanged | `{ fenceId, type, action: 'add' | 'remove' | 'update' }` | 围栏增删改 |
| SceneTransition | `{ from: SceneType, to: SceneType, reason? }` | 场景切换 |
| VehicleDispatched | `{ vehicleIds }` | 一键调派下发 |
| VehicleArrived | `{ vehicleId, position }` | 车辆进入灾害点围栏 |

### 事件规范

- **唯一发布者原则**：所有事件由 `GISAppService` 统一发布，组件禁止直接 `emit`
- **source 字段全局携带**：每个事件载荷必含 `source`，上表省略以突出业务载荷
- **帧节流**：高频事件（`CenterChanged` 拖拽中）做 200ms throttle
- **按需订阅，自动清理**：订阅方各自声明，组件销毁时自动 unsubscribe

---

## 四、场景生命周期管理器（SceneManager）

### 定位

接处警业务是一条**链式场景流**：值守 -> 来电弹屏 -> 问询研判 -> 图上调派 -> 途中跟踪 -> 到场作战。每个场景对地图的状态、图层、控件有不同的组合要求。SceneManager 负责场景间的状态迁移和图层自动管理。

### 场景定义

| 场景 | 枚举值 | 触发时机 | 核心图层 | 核心控件 |
|------|--------|---------|---------|---------|
| 值守总览 | duty | 登录进入值守模式 | 未结案警情、主管站区围栏、实时路况、重点单位、人员密集场所、小区围栏 | 图层面板、缩放 |
| 来电弹屏 | incoming_call | 来电弹屏弹出 | 粗定位圈(500m)、定位类型标签 | 圆圈标记 |
| 问询研判 | inquiry | 通话中定位 | 粗定位圈、管辖围栏 -> 微围栏圈(AOI3)、建筑 | 图层切换、地址输入 |
| 图上调派 | dispatch | 确认警情/救援对象后 | 四站围栏、车辆+ETA、AOI3、**战术路网高亮**、消火栓 | 车辆点选、一键调派 |
| 途中跟踪 | tracking | 车辆出动 | 车辆轨迹、动态ETA、沿途路况 | 跟踪面板 |
| 到场作战 | on_scene | 首车到场触发 | AOI3微围栏、集结点、消火栓、出入口；**自动隐藏远端中队围栏和非到场车辆** | 微观视图 |

### 场景切换行为

**正向流程（主路径）：**
```
duty --来电--> incoming_call --定位--> inquiry --确认警情--> dispatch
                                                               |
                                                    车辆出动 ---|
                                                               v
                                                           tracking --首车到场--> on_scene
```

**回退路径：**

| 当前场景 | 可回退到 | 触发条件 | 清理动作 |
|---------|---------|---------|---------|
| incoming_call | duty | 来电挂断 / 误报 | 移除粗定位圈、恢复值守图层 |
| inquiry | incoming_call | 重新定位 | 移除管辖围栏和微围栏，恢复粗定位圈 |
| inquiry | duty | 取消问询 | 移除所有问询图层，恢复值守全貌 |
| dispatch | inquiry | 重评估警情 | 移除四站围栏、车辆、调派控件，恢复问询图层 |
| dispatch | duty | 取消/重置警情 | 移除所有调派图层，恢复值守全貌 |
| tracking | dispatch | 全部车辆召回 | 停止实时跟踪，恢复调派图层 |

**双向切换统一机制：** 无论正向还是回退，SceneManager 执行相同的 4 步：
1. 发布 `SceneTransition` 事件（含 from / to）
2. 自动卸载当前场景的非复用图层（正向隐藏旧图层，回退亦然）
3. 自动加载目标场景所需的图层和控件
4. 自动执行 `fitBounds` / `zoomTo` 适配视野

---

## 五、跨项目共享 GIS 组件包（@fire/gis-components）

### 1. GIS 基础组件层（纯能力原子，无消防业务语义）

定位：封装底层地图引擎差异，提供标准化 GIS 原子能力。**所有对外能力走 GISAppService，基础组件不直接对外暴露**。

| 组件名 | 核心职责 | 关键能力 | 用户故事映射 |
|--------|----------|----------|-------------|
| GisMap | 核心地图容器 | 统一初始化 API，封装高德/超图/天地图/ArcGIS 引擎差异；缩放、鹰眼、比例尺等内置控件；暴露地图实例引用 | 全场景基础 |
| MapMarker | 通用地图标记 | 自定义图标、弹窗、点击事件；状态样式切换；统一坐标格式 | 全场景 |
| **PositionCircle** | **定位圈渲染器（新增）** | **绘制以某点为中心的指定半径圆圈（如 500m 基站圈）；支持定位类型标签（基站粗定位/固话装机/精确地址）；边界线可自定义颜色、虚线/实线；支持多圈叠加** | **3.2 来电弹屏、3.3 问询研判** |
| LayerManager | 图层统一管理器 | 图层显隐、层级控制、懒加载/卸载；支持热力、围栏、瓦片、预案等多类型图层 | 全场景 |
| RoutePlanner | 路径规划器 | 路线绘制 + ETA 预计时长；支持消防车限高/限宽/禁行约束；多路线对比 | 3.4.5 途中跟踪 |
| SpatialQuery | 空间查询组件 | 周边查询、缓冲区分析、辖区内筛选；统一对接后端空间计算服务 | 3.3 周边资源 |
| GeofenceDetector | 地理围栏检测器 | 自定义多边形/圆形围栏；进出围栏自动触发事件；批量围栏检测；**支持传入查询几何体检测与哪些围栏相交（如粗定位圈跨越管辖边界检测）** | **3.3 问询研判** |
| RealTimeTracker | 实时位置跟踪引擎 | 封装 WebSocket 订阅、**自动断线重连（3 次递增间隔 1s/2s/4s，失败后降级 REST 轮询 5s）**、心跳；**平滑移动动画（position tick >= 2fps）；ETA 独立刷新通道（路况变更触发或 >= 30s 定时重算），避免每帧触发路径重算** | 3.4.5 途中跟踪 |
| InfoPopup | 地图通用信息弹窗 | 位置自动跟随、内容插槽、统一视觉样式；支持多实例管理 | 全场景 |
| MapToolbar | 通用地图工具栏 | 缩放、测距、全屏、清图、图层切换等通用操作按钮 | 全场景 |
| **EngineAdapter** | **引擎适配器接口** | **定义 GisEngineAdapter 接口（init/destroy/addLayer/removeLayer/panTo/zoomTo/fitBounds 等），各引擎实现此接口；新增引擎只需写一个 Adapter** | **可扩展性** |

### 2. GIS 业务基础组件层（消防领域通用，跨项目复用）

| 组件名 | 核心职责 | 复用场景 | 用户故事映射 |
|--------|----------|---------|-------------|
| VehicleMarker | 车辆专用标记 | 方向箭头、**车辆类型图标（主战/高喷/泡沫/抢险）**、状态色（待命/在途/到场）、轨迹尾迹；**主管队站车辆高亮突出**；**ETA 悬浮标签** | **3.4.3** |
| IncidentMarker | 警情专用标记 | 紧急等级闪烁、灾害类型图标、警情编号标签 | 3.1、3.4 |
| ResourceMarker | 资源分类标记 | 消火栓、微站、重点单位、水源等分类图标与样式 | 3.4.2 |
| **RoadHighlightLayer** | **战术路网高亮图层（新增）** | **对指定路段集合进行视觉加粗/发光高亮渲染；支持按路况实时着色（红/黄/绿）并随交通数据动态刷新；适用于「队站→灾害点」沿途主干道及支路路网高亮** | **3.4.2 调度研判、3.1 值守路况** |
| **FenceLayer** | **围栏图层系统（新增）** | **管理多类型围栏：管辖围栏、AOI3 微围栏、建筑围栏；支持四级围栏联动（主管站 + 3 支撑站）、颜色/线型区分；传入 queryGeometry（如粗定位圈）后自动计算各围栏重叠面积，按面积降序排列，重叠最大的围栏自动标记为主围栏（高亮实线）；Auto-Fit Bounds + 留边 10%~15%** | **3.4.1、3.3** |
| **DispatchInteractor** | **图上调派交互器（新增）** | **车辆点选/取消（视觉反馈：虚变实/打勾/光晕）、一键调派按钮、一键下发调派单；预案推荐车辆高亮（霓虹色外环）** | **3.4.4** |
| **SceneLayerManager** | **场景联动图层管理器（新增）** | **根据当前场景自动加载/卸载图层组合；管理粗定位圈->管辖围栏->微围栏->车辆跟踪->到场视图的过渡链条** | **全场景** |
| JurisdictionLayer | 辖区围栏图层 | 统一辖区边界样式、高亮交互、点击事件 | 3.1、3.3 |
| ResourceListMapPanel | 地图-列表联动面板 | 左侧资源列表 + 右侧地图标记双向联动高亮 | 调度、值守 |

---

## 六、各前端项目私有 GIS 应用组件

### 1. 接警问询项目（座席端）

> **注意**：地址录入不在 GIS 屏。系统分三屏——GIS 屏、资源调派屏、**录入主界面**。地址输入和候选选择全部发生在录入主界面，GIS 屏作为被动监听方接收后端服务发布的「警情已定位」事件后渲染微围栏。

| 组件名 | 核心职责 | 依赖的共享组件 | 用户故事映射 |
|--------|----------|---------------|-------------|
| IncomingCallPopupMap | 来电弹屏地图 | GisMap + PositionCircle + IncidentMarker + InfoPopup | **3.2** |
| | 监听 `incoming_call.position` WS 推送（链路：运营商 → 后端事件总线 → GIS 后端 → WS → 前端），收到后绘制 500m 粗定位圈并标注定位类型；合理占用纵向 25%~35% 屏幕空间 | | |
| InquiryLocationPanel | 问询定位面板 | GisMap + MapMarker + SpatialQuery + FenceLayer + PositionCircle | **3.3** |
| | 监听「警情已定位」事件（由后端业务服务发布，录入主界面仅触发请求）；接收后隐藏粗定位圈和管辖围栏、加载微围栏圈(AOI3) + 出入口；**建筑展示维度三态切换（single / nearby / aoi）** | | |

### 2. 调度指挥项目（指挥员端）

| 组件名 | 核心职责 | 依赖的共享组件 | 用户故事映射 |
|--------|----------|---------------|-------------|
| DispatchResourceMap | 调派资源地图 | GisMap + FenceLayer + VehicleMarker + LayerManager + RoutePlanner + **RoadHighlightLayer** + DispatchInteractor + SpatialQuery | **3.4.1~3.4.4** |
| | 四级围栏联动 Auto-Fit、车辆+ETA 展示、**沿途路网高亮（实时路况着色）**、预案推荐高亮、图上点选调派/取消、一键调派 | | |
| VehicleTrackingView | 车辆跟踪视图 | GisMap + VehicleMarker + RealTimeTracker + RoutePlanner + FenceLayer | **3.4.5** |
| | 多车实时轨迹跟踪、平滑移动（>=2fps）、ETA 动态刷新；到场切换由 `vehicle.status_changed` WS 推送驱动 GISAppService → VehicleArrived 事件 → SceneManager | | |

### 3. 值守总览项目（大屏/值守班长端）

| 组件名 | 核心职责 | 依赖的共享组件 | 用户故事映射 |
|--------|----------|---------------|-------------|
| DutyOverviewMap | 值守总览地图 | GisMap + LayerManager + IncidentMarker + VehicleMarker + JurisdictionLayer + ResourceMarker | **3.1** |
| | 全域警情聚合、主管队站及辖区围栏、资源分布热力、实时路况图层、重点单位标注；图层可单独开关；默认中心点/缩放级别支持配置 | | |

### 4. 移动指挥项目（MDT/单兵端）

| 组件名 | 核心职责 | 依赖的共享组件 |
|--------|----------|---------------|
| MobileTrackingMap | 移动端导航跟踪地图 | GisMap + VehicleMarker + RoutePlanner + RealTimeTracker |
| | 出警路线导航、实时位置上报、到场状态同步（触控手势适配、低流量模式） | |
| MobileSceneMap | 现场作战简化地图 | GisMap + ResourceMarker + IncidentMarker + FenceLayer |
| | 现场周边资源查看、作战标绘、位置上报（轻量化，支持离线瓦片缓存） | |

---

## 七、架构设计要点 & 技术决策

### 1. 地图实例完全独立
共享包只提供组件类和能力方法，不持有全局单例；**GISAppService 在每个项目中独立实例化**，项目间彻底隔离。

### 2. 程序化 vs 手动双路径收敛
**两者的状态变更流经同一套 Event Bus**，确保地图最终状态一致（AC-06）。手动操作标记 source: 'manual'，程序化标记为 'programmatic'，便于审计。

### 3. 引擎差异统一收敛（Engine Adapter 模式）
```
interface GisEngineAdapter {
  init(container, options): Promise<MapInstance>;
  destroy();
  addLayer(config): string;
  removeLayer(layerId): void;
  panTo(lat, lng, options?): void;
  zoomTo(level, options?): void;
  fitBounds(bounds, options?): void;
  getCenter(): LngLat;
  getZoom(): number;
}
```
所有地图引擎的适配工作在共享包内完成。信创替换时，只需升级共享包版本 + 新增 Adapter 实现。

### 4. 后端 GIS 服务统一对接
空间查询、路径规划等后端 GIS 微服务的接口调用封装在共享包内部。**地址解析由录入主界面和 AI 语音分析直接调用后端 GIS 服务，不走 GIS 前端组件**。

### 5. 性能优化统一落地
| 优化策略 | 说明 | 量化指标 |
|---------|------|---------|
| 标记聚合 | 超过 200 个标记自动聚合为簇 | Cluster 合并阈值 <= 200 |
| 视口裁剪 | 距视口边界 2 倍以外的标记/图层自动卸载 | 裁减阈值 2 倍视口外 |
| 帧节流 | Event Bus 中高频事件 200ms 节流 | Throttle <= 200ms |
| 图层懒加载 | 场景切换时只加载当前所需图层 | 首屏加载 <= 2s |
| 请求缓存 | 瓦片请求 LRU 缓存，缓存上限 500 张 | LRU Cache <= 500 tiles |
| 平滑动画 | RealTimeTracker tick 间隔 500ms | >= 2 帧/秒 |

### 6. 场景驱动的图层生命周期
由 SceneManager 统一编排。每个场景定义其生效的图层集合，场景切换时自动卸载旧图层、加载新图层。

### 7. 版本语义化治理
GIS 共享包独立发版，遵循 SemVer 2.0。

| 版本号 | 含义 | 示例场景 |
|-------|------|---------|
| MAJOR | 破坏性变更 | EngineAdapter 接口签名修改、组件 Props 重命名 |
| MINOR | 新增能力 | 新增 PositionCircle 组件、新增 zoomTo 接口 |
| PATCH | 缺陷修复 / 内部优化 | 帧节流逻辑优化、LRU 缓存 Bug 修复 |

### 8. 性能约束汇总

| 场景 | 指标 | 目标值 | 对应 AC |
|------|------|-------|--------|
| 手动缩放/平移 | 响应时间 | <= 100ms | AC-04 |
| 程序化接口（非动画） | 响应时间 | <= 300ms | AC-02~03 |
| 程序化跳转定位（含动画） | 动画完成 | <= 3000ms | AC-01 |
| 图层开关 | 响应时间 | <= 500ms | AC-02 |
| 车辆位置刷新 | 更新频率 | >= 2fps（500ms） | 3.4.5 |
| ETA（到达时间） | 刷新频率 | 路况变更触发 / >= 30s 定时重算 | 3.4.5 |
| 值守模式首屏 | 加载完成 | <= 3s | 3.1 |

### 9. 错误处理规范

| 异常场景 | 表现 | 降级策略 |
|---------|------|---------|
| 地图引擎 SDK 加载超时(>5s) | 显示「地图加载失败」占位 | 展示静态底图/空容器 |
| 地图 API Key 过期/鉴权失败 | 错误提示 + 日志告警 | 显示静态底图 |
| Geocoder 后端 500 | 由录入主界面展示错误提示 | 录入主界面提示用户重试或手动在地图上点击修正 |
| WebSocket 断线（RealTimeTracker） | 自动重连(3 次递增 1s/2s/4s) | 降级为 REST 轮询（5s 间隔） |
| 数据格式异常（GeoJSON 解析失败） | 控制台警告，跳过该图层 | 不阻塞其他图层加载 |

### 10. 审计日志 & 权限

- **审计日志记录**：setCenter（跨区域跳转）、loadDataLayer（批量数据加载）、一键调派、取消调派
- **权限校验**：调派操作需要「调度员」及以上角色
- **日志格式**：{ userId, action, params, timestamp, source }

---

## 附录一：核心接口定义示例

### PositionCircle Props（新增）

```typescript
interface PositionCircleProps {
  center: [number, number];           // [lng, lat]
  radius: number;                     // 单位：米，默认 500
  type: 'cell_tower' | 'landline' | 'precise';  // 定位类型，驱动默认标签文本
  labelText?: string;                 // 自定义标签文本，未传时自动按 type 生成（如"基站粗定位"/"固话定位"/"精确地址"）
  strokeColor?: string;
  strokeStyle?: 'solid' | 'dashed';
  fillColor?: string;
  fillOpacity?: number;
  showLabel?: boolean;                // 是否显示定位类型标签
}
```

### FenceLayer Config

```typescript
interface FenceLayerConfig {
  fences: FenceDef[];
  autoFit?: boolean;
  padding?: number;              // 留边比例 0.1~0.15
  queryGeometry?: Circle | Polygon; // 用于重叠面积计算的查询几何体（如粗定位圈），传入后自动按重叠面积排序并标记主围栏
  buildingScope?: BuildingScope;    // 建筑围栏展示维度（仅对 type='building' 生效）
}

type BuildingScope =
  | 'single'   // 仅展示目标单建筑
  | 'nearby'   // 展示目标建筑 + 附近建筑
  | 'aoi'       // 展示当前 AOI3 内全部建筑

interface FenceDef {
  id: string;
  type: 'jurisdiction' | 'aoi3' | 'building' | 'custom';
  name: string;
  geometry: Polygon | MultiPolygon;
  priority?: 'primary' | 'secondary';  // 静态优先级（如已知主管站 vs 支撑站）。若同时传入 queryGeometry，则以重叠面积计算结果为准，此字段仅作为无重叠计算时的降级
  overlapArea?: number;                // 只读：由 FenceLayer 根据 queryGeometry 计算填充。重叠面积最大的围栏自动标记主围栏样式（高亮实线 + 宽边）
  style?: {
    strokeColor: string;
    strokeWidth: number;
    fillColor: string;
    fillOpacity: number;
  };
}
```

### DispatchInteractor 事件

```typescript
interface DispatchEvents {
  onVehicleSelect: (vehicleId: string) => void;
  onVehicleDeselect: (vehicleId: string) => void;
  onBatchDispatch: (vehicleIds: string[]) => void;
  onPreplanHighlight: (vehicleIds: string[]) => void;
}
```

---

## 附录二：术语表

| 术语 | 说明 |
|------|------|
| AOI3 | 微围栏（小区/厂区/重点单位的地理边界，精准度高） |
| MDT | 移动数据终端（Mobile Data Terminal），消防车内终端 |
| ETA | 预计到达时间（Estimated Time of Arrival） |
| 信创 | 信息技术应用创新，国产化替代 |
| 粗定位圈 | 基于基站或固话位置绘制的 500m 半径不确定性圈 |
| 微围栏 | AOI3 级别的精确地理围栏 |
| 四站围栏联动 | 主管站 + 最近 3 个支撑站的管辖围栏同时展示 |
| 矢量瓦片 | 可缩放的轻量级矢量地图数据格式 |
| Engine Adapter | 地图引擎适配器模式，统一不同引擎的调用差异 |

---

## 附录三：架构决策记录（ADR）

### ADR-001：选择共享包 + 独立实例模式而非微前端

**背景**：多项目间 GIS 能力如何共享。

**决策**：采用统一 npm 包 + 各项目独立实例化地图，不使用微前端方案。

**理由**：
- 各项目独立部署、独立迭代，微前端带来的实例冲突、样式污染、部署耦合问题大于收益
- GIS 组件以 npm 包引入，版本锁定灵活
- 地图实例隔离彻底，排障简单

### ADR-002：引入 GISAppService + Event Bus 而非直接操作地图实例

**背景**：用户故事明确要求「程序化控制」和「手动操作双路径」。

**决策**：增加 GISAppService 层作为唯一的程序化入口，所有变更通过 Event Bus 发布。

**理由**：
- 防止业务模块直接操作地图实例导致的状态不同步
- 所有变更走同一套事件系统，满足 AC-06
- 审计日志和权限校验可集中拦截

### ADR-003：引入 SceneManager 统一管理场景迁移

**背景**：接处警业务是一条链式场景流（值守->来电->问询->调派->跟踪->到场）。

**决策**：增加 SceneManager，定义场景枚举和迁移规则，自动编排图层加载/卸载。

**理由**：
- 原方案各项目手动管理图层切换，重复代码多、容易遗漏清理
- 场景间有明确的状态机关系，适合集中管理
- 新需求增加场景时，只需在 SceneManager 中注册映射表

---
