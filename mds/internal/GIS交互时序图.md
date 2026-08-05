# GIS 交互时序图

> 本文档为《GIS 端整体架构_v2》子文档，覆盖接处警全场景中 GIS 相关的关键时刻序。

## 参与角色

| 角色 | 运行环境 | 说明 |
|------|---------|------|
| 运营商/第三方 | 外部 | 119 接警后主动推送来电 GPS |
| 后端事件总线 | 后端 | 解耦外部推送与 GIS 后端的消息中间件 |
| 后端 GIS 服务 | 后端 | 提供 HTTP API + WebSocket |
| GISAppService | 浏览器 | GIS 前端唯一门面，发布所有前端事件 |
| Event Bus | 浏览器 | 前端组件间通信的事件总线 |
| SceneManager | 浏览器 | 场景生命周期管理器 |
| 各 UI 组件 | 浏览器 | IncomingCallPopupMap、InquiryLocationPanel、DispatchResourceMap、VehicleTrackingView、DutyOverviewMap |

---

## 一、来电弹屏：粗定位圈呈现（3.2）

```mermaid
sequenceDiagram
    participant Carrier as 运营商/第三方
    participant Bus as 后端事件总线
    participant GIS as 后端 GIS 服务
    participant App as GISAppService
    participant Popup as IncomingCallPopupMap

    Carrier->>Bus: 119 来电后推送 GPS 坐标
    Bus->>GIS: publish incoming_call
    GIS->>App: WS incoming_call.position
    Note over GIS,App: {callId, lng, lat, type, radius}

    App->>App: publish PositionCircleUpdated
    App->>Popup: PositionCircleUpdated 事件
    Popup->>Popup: setCenter(来电 GPS)
    Popup->>Popup: 画 500m 粗定位圈
    Popup->>Popup: 标注定位类型（基站粗定位/固话定位）
```

---

## 二、问询研判：从粗定位圈到微围栏（3.3）

> **前提**：地址录入不在 GIS 屏。系统有三屏——**GIS 屏**、**资源调派屏**、**录入主界面**。地址输入和候选选择全部发生在录入主界面，GIS 屏作为监听方被动响应。

### 2.1 自动触发：AI 语音提取 → GIS 后端定位 → 录入主界面选中 → 后端服务发布「警情已定位」→ GIS 响应

```mermaid
sequenceDiagram
    participant Voice as AI 语音分析
    participant GIS as 后端 GIS 服务
    participant Input as 录入主界面
    participant Bus as 后端事件总线
    participant App as GISAppService
    participant Fence as FenceLayer

    Note over Voice: 从 119 通话语音流中提取地址关键字

    Voice->>GIS: HTTP GET 正向地理编码(address_keywords)
    GIS-->>Voice: [{lng, lat, address, confidence}]
    Voice->>Input: 推送候选地址列表

    Input->>Input: 接警员从候选列表中选择正确地址

    Note over Input: 录入主界面调用后端业务服务确认地址
    Note over Bus: 后端业务服务发布「警情已定位」到事件总线
    Note over Bus: GIS 后端不关心消息来源，只订阅消息本身
    Note over Input,Bus: {incidentId, lng, lat, address}
    Bus->>GIS: 订阅并接收 警情已定位 消息
    GIS->>App: WS 转发 incident.located

    App->>Fence: hide(粗定位圈)
    App->>Fence: hide(管辖围栏)
    App->>Fence: loadDataLayer(微围栏)
    Fence->>GIS: HTTP GET AOI3 微围栏
    GIS-->>Fence: {polygon, entrances}
    Fence->>Fence: 渲染微围栏 + 出入口
```

### 2.2 手动触发：录入主界面手动填地址 → 后端服务发布「警情已定位」→ GIS 响应

```mermaid
sequenceDiagram
    participant User as 接警员
    participant Input as 录入主界面
    participant GIS as 后端 GIS 服务
    participant Bus as 后端事件总线
    participant App as GISAppService
    participant Fence as FenceLayer

    User->>Input: 手动填入地址关键字
    Input->>GIS: HTTP GET 正向地理编码(address_keywords)
    GIS-->>Input: [{lng, lat, address, confidence}]
    Input-->>User: 显示候选地址列表

    User->>Input: 选择正确地址

    Note over Input: 录入主界面调用后端业务服务确认地址
    Note over Bus: 后端业务服务发布「警情已定位」到事件总线
    Note over Bus: GIS 后端不关心消息来源，只订阅消息本身
    Note over Input,Bus: {incidentId, lng, lat, address}
    Bus->>GIS: 订阅并接收 警情已定位 消息
    GIS->>App: WS 转发 incident.located

    App->>Fence: hide(粗定位圈)
    App->>Fence: hide(管辖围栏)
    App->>Fence: loadDataLayer(微围栏)
    Fence->>GIS: HTTP GET AOI3 微围栏
    GIS-->>Fence: {polygon, entrances}
    Fence->>Fence: 渲染微围栏 + 出入口
```

### 2.3 建筑展示维度切换（GIS 屏本地交互）

```mermaid
sequenceDiagram
    participant User as 接警员
    participant App as GISAppService
    participant Fence as FenceLayer
    participant GIS as 后端 GIS 服务

    User->>App: 点击切换建筑展示维度
    App->>Fence: set buildingScope(single/nearby/aoi)
    Fence->>GIS: HTTP GET 建筑围栏
    GIS-->>Fence: Building[]
    Fence->>Fence: 刷新建筑渲染
```

---

## 三、图上调派（3.4.1~3.4.4）

### 3.1 图层加载 + 全景呈现

```mermaid
sequenceDiagram
    participant User as 调度员
    participant App as GISAppService
    participant GIS as 后端 GIS 服务
    participant Fence as FenceLayer
    participant Vehicle as VehicleMarker
    participant Road as RoadHighlightLayer

    User->>App: 确认警情
    App->>App: setScene(dispatch)

    App->>Fence: load 四站围栏
    Fence->>GIS: HTTP GET 管辖围栏 x4
    GIS-->>Fence: [fencePolygons]
    Fence->>Fence: Auto-Fit Bounds + 留边 10%~15%

    App->>Vehicle: load 车辆+ETA
    Vehicle->>GIS: HTTP GET 可用车辆
    GIS-->>Vehicle: [{vehicleId, type, status, lng, lat}]
    Vehicle->>Vehicle: 按车型渲染图标 + ETA 标签

    App->>Vehicle: load 预案推荐编队
    Vehicle->>GIS: HTTP GET 预案匹配
    GIS-->>Vehicle: [{vehicleId, isRecommended}]
    Vehicle->>Vehicle: 推荐车辆霓虹高亮

    App->>Road: load 路网高亮
    Road->>GIS: HTTP GET 路段 + 路况
    GIS-->>Road: [{segmentId, color}]
    Road->>Road: 战术路网着色渲染

    App-->>User: 全景呈现（围栏+车辆+路网+消火栓）
```

### 3.2 图上点选 + 一键调派

```mermaid
sequenceDiagram
    participant User as 调度员
    participant App as GISAppService
    participant Dispatch as DispatchInteractor
    participant GIS as 后端 GIS 服务

    User->>Dispatch: 点选车辆
    Dispatch->>Dispatch: 选中视觉反馈（虚变实/打勾）

    User->>Dispatch: 取消点选
    Dispatch->>Dispatch: 取消视觉反馈

    User->>Dispatch: 一键调派
    Dispatch->>App: onBatchDispatch(vehicleIds)
    App->>GIS: HTTP POST 一键调派下发
    GIS-->>App: {dispatchId, status}
    App->>App: publish VehicleDispatched
    App-->>User: 调派成功
```

---

## 四、途中跟踪与到场作战（3.4.5）

```mermaid
sequenceDiagram
    participant GIS as 后端 GIS 服务
    participant App as GISAppService
    participant Tracker as RealTimeTracker
    participant View as VehicleTrackingView
    participant Scene as SceneManager

    App->>App: setScene(tracking)
    Tracker->>GIS: subscribe WS vehicle.position

    loop 每 500ms (>= 2fps)
        GIS->>App: WS vehicle.position
        App->>Tracker: publish CenterChanged (throttled)
        Tracker->>View: 平滑移动动画 (rAF, 坐标插值)
    end

    loop 每 30s / 路况变更
        App->>GIS: HTTP GET ETA 重算
        GIS-->>App: {eta, distance_remaining}
        App->>View: 更新 ETA 标签
    end

    Note over GIS: 车载终端/APP 手动设置到场
    GIS->>App: WS vehicle.status_changed(arrived)
    App->>App: publish VehicleArrived
    App->>Scene: VehicleArrived 事件

    Scene->>Scene: setScene(on_scene)
    Scene->>View: 卸载车辆图层
    Scene->>View: 隐藏远端中队围栏
    Scene->>View: 加载微观要素（AOI3/集结点/消火栓/出入口）
```

---

## 五、场景回退

```mermaid
sequenceDiagram
    participant User as 用户操作
    participant App as GISAppService
    participant Scene as SceneManager
    participant Layer as 各组件图层

    alt 来电挂断
        User->>App: 来电挂断 (incoming_call)
        App->>Scene: setScene(duty)
        Scene->>Layer: unload 粗定位圈
        Scene->>Layer: load 值守图层
        Scene->>Layer: fitBounds 城市全景
    else 取消调派
        User->>App: 取消调派 (dispatch)
        App->>Scene: setScene(duty)
        Scene->>Layer: unload 四站围栏 + 车辆标记 + 调派控件
        Scene->>Layer: load 值守图层
        Scene->>Layer: fitBounds 城市全景
    end
```

---

## 六、值守总览：警情实时刷新（3.1）

```mermaid
sequenceDiagram
    participant GIS as 后端 GIS 服务
    participant App as GISAppService
    participant Duty as DutyOverviewMap

    GIS->>App: WS incident.created
    App->>Duty: publish DataLayerUpdated
    Duty->>Duty: 新增警情标记（位置+等级+编号）

    GIS->>App: WS incident.closed
    App->>Duty: publish DataLayerUpdated
    Duty->>Duty: 移除警情标记
```

---

## 附录：Mermaid 渲染说明

本文档中的 Mermaid 时序图在以下环境中可直接渲染：
- GitHub / GitLab Markdown 预览
- VS Code（安装 Markdown Preview Mermaid Support 插件）
- Typora / Obsidian
- 任意支持 Mermaid 的 Markdown 渲染器