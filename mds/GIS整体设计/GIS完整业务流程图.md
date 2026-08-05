# GIS 完整业务流程图

> **版本**：1.1 | **日期**：2026-07-10
> **核心参考**：`GIS功能缝合.md`用户故事

---

## 一、全局业务生命周期流程

```mermaid
flowchart TD
    %% 系统初始化
    Start([系统启动]) --> Config[加载配置]
    Config --> MapReady[地图就绪]

    %% 值守阶段
    MapReady --> DutyLogin[接警员登录]
    DutyLogin --> DutyLoad[加载值守图层]
    DutyLoad --> Duty1[未结案警情]
    DutyLoad --> Duty2[主管队站辖区]
    DutyLoad --> Duty3[实时路况]
    DutyLoad --> Duty4[重点救援对象]
    Duty1 --> DutyStandby{值守监控}
    Duty2 --> DutyStandby
    Duty3 --> DutyStandby
    Duty4 --> DutyStandby

    %% 来电弹屏
    DutyStandby -->|119来电| CallIn[来电弹屏]
    CallIn --> CallLocate[WS接收粗定位]
    CallLocate --> CallDraw[绘制500m定位圈]
    CallDraw --> CallLabel[标注定位类型]
    CallLabel --> CallScreen[占用屏幕25-35%]
    CallScreen --> CallUser{继续?}
    CallUser -->|挂断| CallEnd[清除定位圈]
    CallUser -->|继续| InquiryEnter[进入问询]

    %% 问询研判
    InquiryEnter --> InquiryShow[显示粗定位圈+管辖范围圈]
    InquiryShow --> InquiryZone{跨越多管辖?}
    InquiryZone -->|是| InquiryMulti[展示所有相关辖区]
    InquiryZone -->|否| InquirySingle[高亮主辖区]
    InquiryMulti --> InquiryConfirm{精确定位?}
    InquirySingle --> InquiryConfirm
    InquiryConfirm -->|确认| InquiryHide[隐藏前两圈]
    InquiryConfirm -->|继续问询| InquiryLoop
    InquiryHide --> InquiryAoi[聚焦微围栏AOI3]
    InquiryAoi --> InquiryBuilding{建筑展示?}
    InquiryBuilding -->|单体| InquirySingleB[单体建筑]
    InquiryBuilding -->|附近| InquiryNearbyB[附近建筑]
    InquiryBuilding -->|AOI| InquiryAoiB[AOI内建筑]
    InquirySingleB --> InquiryDispatch[确认警情]
    InquiryNearbyB --> InquiryDispatch
    InquiryAoiB --> InquiryDispatch
    InquiryLoop -.-> InquiryShow

    %% 调派阶段
    InquiryDispatch --> DispatchFence[四级围栏联动]
    DispatchFence --> DispatchFit[Auto-Fit+10-15%留边]
    DispatchFit --> DispatchColor[主管围栏强色+支撑弱色]
    DispatchColor --> DispatchAoi[叠加微围栏AOI3]
    DispatchAoi --> DispatchPoi[POI置顶:出入口/栓]
    DispatchPoi --> DispatchRoad[战术路网高亮+路况着色]
    DispatchRoad --> DispatchVehicle[加载车辆+分类图标]
    DispatchVehicle --> DispatchEta[显示动态ETA]
    DispatchEta --> DispatchRecommend[预案推荐高亮]
    DispatchRecommend --> DispatchMain[主管站车辆强化]
    DispatchMain --> DispatchSelect{图上点选?}
    DispatchSelect -->|点选车辆| DispatchClick[选中视觉反馈]
    DispatchClick --> DispatchRoute[显示路径]
    DispatchSelect -->|取消| DispatchCancel[取消选中]
    DispatchCancel -.-> DispatchMain
    DispatchSelect -->|一键调派| DispatchExecute[HTTP调派下发]
    DispatchExecute --> DispatchSuccess[调派成功]

    %% 跟踪阶段
    DispatchSuccess --> TrackingStart[车辆出动]
    TrackingStart --> TrackingGps[订阅车辆GPS]
    TrackingGps --> GPSLoop{实时位置}
    GPSLoop -->|每500ms| TrackingSmooth[平滑轨迹跟踪]
    TrackingSmooth --> TrackingAppend[追加轨迹尾迹]
    TrackingAppend -.-> GPSLoop
    GPSLoop -->|每30s| TrackingEta[ETA重算刷新]
    TrackingEta -.-> GPSLoop

    %% 到场作战
    GPSLoop -->|首车到场| ArrivalStatus[WS vehicle.status_changed]
    ArrivalStatus --> ArrivalScene[场景切换on_scene]
    ArrivalScene --> ArrivalZoom[Zoom-in微围栏AOI3]
    ArrivalZoom --> ArrivalHide[隐藏远端围栏+车辆]
    ArrivalHide --> ArrivalMicro[加载微观要素]
    ArrivalMicro --> ArrivalFence[微围栏边界]
    ArrivalMicro --> ArrivalAssembly[集结点]
    ArrivalMicro --> ArrivalHydrant[消防栓]
    ArrivalMicro --> ArrivalEntrance[进出通道]
    ArrivalEntrance --> ArrivalEnd[到场作战完成]

    %% 场景回退
    CallEnd -.->|返回| DutyStandby
    ArrivalEnd -.->|返回| DutyStandby

    %% 样式
    style DutyStandby fill:#e1f5ff,stroke:#01579b
    style CallIn fill:#fff3e0,stroke:#e65100
    style InquiryEnter fill:#e8f5e9,stroke:#2e7d32
    style InquiryDispatch fill:#f3e5f5,stroke:#7b1fa2
    style DispatchSuccess fill:#fce4ec,stroke:#c2185b
    style TrackingStart fill:#fff8e1,stroke:#ff8f00
    style ArrivalEnd fill:#e3f2fd,stroke:#1565c0
```

---

## 二、验收标准映射图

```mermaid
flowchart LR
    subgraph AC["验收标准"]
        AC1[AC-值守]
        AC2[AC-来电]
        AC3[AC-问询]
    end

    subgraph FP["功能点"]
        FP4_1[FP-4.1 四级围栏]
        FP4_2[FP-4.2 颜色区分]
        FP4_3[FP-4.3 Auto-Fit]
        FP4_4[FP-4.4 微围栏叠加]
        FP4_5[FP-4.5 POI置顶]
        FP4_6[FP-4.6 路网高亮]
        FP4_7[FP-4.7 车辆ETA]
        FP4_8[FP-4.8 预案高亮]
        FP4_9[FP-4.9 主管强化]
        FP4_11[FP-4.11 图上点选]
        FP4_12[FP-4.12 一键调派]
        FP4_13[FP-4.13 平滑轨迹]
        FP4_14[FP-4.14 ETA刷新]
        FP4_15[FP-4.15 到场视图]
        FP4_16[FP-4.16 微观作战]
    end

    AC1 --> Duty
    AC2 --> Call
    AC3 --> Inquiry
    
    FP4_1 --> Dispatch
    FP4_2 --> Dispatch
    FP4_3 --> Dispatch
    FP4_4 --> Dispatch
    FP4_5 --> Dispatch
    FP4_6 --> Dispatch
    FP4_7 --> Dispatch
    FP4_8 --> Dispatch
    FP4_9 --> Dispatch
    FP4_11 --> Dispatch
    FP4_12 --> Dispatch
    FP4_13 --> Tracking
    FP4_14 --> Tracking
    FP4_15 --> Arrival
    FP4_16 --> Arrival
```

---

## 三、图层加载时序

```mermaid
sequenceDiagram
    participant Scene as 场景
    participant LM as 图层管理器
    participant GC as GenericController

    rect rgb(200, 220, 240)
        Note over Scene,LM: 值守阶段
        Scene->>LM: config.layers(值守配置)
        LM->>GC: add(incident_layer)
        LM->>GC: add(road_network)
        LM->>GC: add(jurisdiction_fence)
        LM->>GC: add(key_units)
        LM->>GC: add(crowded_areas)
    end

    rect rgb(255, 220, 200)
        Note over Scene,LM: 来电弹屏
        Scene->>LM: add(call_position)
        Scene->>LM: remove(incident_layer)
    end

    rect rgb(200, 255, 220)
        Note over Scene,LM: 问询研判
        Scene->>LM: add(jurisdiction_range)
        Scene->>LM: remove(call_position)
        Scene->>LM: add(aoi_circle)
        Scene->>LM: remove(jurisdiction_range)
    end

    rect rgb(255, 200, 255)
        Note over Scene,LM: 调派阶段
        Scene->>LM: add(support_fences)
        Scene->>LM: add(stations)
        Scene->>LM: add(route_line)
        Scene->>LM: add(hydrants)
        Scene->>LM: add(entrances)
    end

    rect rgb(255, 255, 200)
        Note over Scene,LM: 跟踪阶段
        Scene->>LM: add(vehicle_track)
        Scene->>LM: remove(stations部分)
    end

    rect rgb(200, 200, 255)
        Note over Scene,LM: 到场作战
        Scene->>LM: remove(jurisdiction_fence)
        Scene->>LM: remove(support_fences)
        Scene->>LM: add(assembly_point)
    end
```

---

## 四、消息流转总图

```mermaid
flowchart TB
    subgraph External["外部系统"]
        Carrier[运营商]
        Input[录入主界面]
        Backend[后端业务服务]
        GPS[GPS网关]
    end

    subgraph Message["MessageStore"]
        WSIn[WS接收]
        PMIn[postMessage接收]
        Publisher[发布者]
    end

    subgraph Controllers["控制器层"]
        IC[InputController]
        BC[BusinessController]
        GC[GenericController]
        OC[OutputController]
    end

    subgraph Map["地图层"]
        Core[MapCore]
        Plugins[MapPlugins]
    end

    Carrier -->|incoming_call.position| WSIn
    Input -->|incident.located| WSIn
    Backend -->|incident.created/closed| WSIn
    GPS -->|vehicle.position| WSIn
    GPS -->|vehicle.status_changed| WSIn

    WSIn -->|ingest| Publisher
    PMIn -->|ingest| Publisher
    Publisher -->|分发| IC
    Publisher -->|分发| BC
    Publisher -->|分发| OC

    IC -->|调用| GC
    BC -->|组合调用| GC
    OC -->|发布| Publisher

    GC -->|执行| Core
    Core -->|渲染| Plugins
```

---

## 五、调派功能流程

```mermaid
flowchart TD
    Start[确认警情] --> Fence[四级围栏联动]
    Fence --> Fit[Auto-Fit Bounds]
    Fit --> Style[颜色区分]
    Style --> Aoi[叠加微围栏AOI3]
    Aoi --> Poi[POI置顶]
    Poi --> Road[战术路网高亮]
    Road --> Vehicle[加载车辆]
    Vehicle --> Eta[动态ETA]
    Eta --> Recommend[预案推荐]
    Recommend --> Main[主管站强化]
    Main --> Select{操作}

    Select -->|点选| Click[选中反馈]
    Click --> Route[显示路径]
    Route --> Select

    Select -->|取消| Cancel[取消选中]
    Cancel --> Hide[隐藏路径]
    Hide --> Select

    Select -->|一键调派| Dispatch[HTTP调派]
    Dispatch --> Success[成功]
```

---

**版本记录**：
- 1.0 (2026-07-10) 初始版本
- 1.1 (2026-07-10) 按用户故事优化，标注验收标准
