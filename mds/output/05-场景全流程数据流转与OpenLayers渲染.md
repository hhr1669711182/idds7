# 05-场景全流程数据流转与OpenLayers渲染

> 本文档深入剖析 GIS 系统中，从**后端服务**发出数据，经由**前端协议层/控制层**处理，最终在 **OpenLayers** 中完成渲染的端到端数据流转过程。
>
> 覆盖六大场景状态：**值守 → 来电 → 问询 → 调派 → 跟踪 → 到场**。

***

## 一、场景流转全景图

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        场景状态流转 (Scene Lifecycle)                             │
│                                                                                   │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐              │
│  │   值守   │ ────►│   来电   │ ────►│   问询   │ ────►│   调派   │              │
│  │Standby   │      │Incoming  │      │Inquiry   │      │Dispatch  │              │
│  └──────────┘      └──────────┘      └──────────┘      └─────┬────┘              │
│       ▲                        │                              │                     │
│       │                        ▼                              ▼                     │
│       │                  ┌──────────┐                  ┌──────────┐                │
│       │                  │   跟踪   │ ◄────────────────│   到场   │                │
│       │                  │Tracking  │                  │Arrived   │                │
│       └──────────────────┴──────────┘                  └──────────┘                │
│                                                                                   │
│  关键数据源:                                                                        │
│  - 值守: 默认图层加载、车辆静态数据                                                  │
│  - 来电: 119热线录音转文字、来电定位坐标                                              │
│  - 问询: 知识库查询结果、BIM模型属性                                                 │
│  - 调派: 警情JSON、力量列表、调度指令                                                 │
│  - 跟踪: WebSocket 实时 GPS 流、BIM 楼层状态                                         │
│  - 到场: 签到坐标、现场照片、灾情反馈                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

***

## 二、端到端数据流转详解：以"警情到达"为例

这是最核心的场景：**后端推送新警情 → 前端解析 → OpenLayers 渲染警情点**。

### 2.1 阶段一：后端发出 (Backend Source)

后端通过 WebSocket 推送 JSON 数据。

```json
{
  "id": "ws-msg-998877",
  "ts": 1720944000000,
  "source": "backend-ws",
  "eventKey": "alarm.new-arrival",
  "msgType": "push",
  "data": {
    "alarm": {
      "alarmNo": "20260714-0001",
      "alarmTime": 1720943900000,
      "location": {
        "address": "北京市朝阳区建国路88号",
        "lng": 116.475285,
        "lat": 39.909702,
        "building": "CBD大厦",
        "floor": 12
      },
      "alarmType": "fire",
      "severity": "level-2",
      "sourceChannel": "119-hotline",
      "reporter": {
        "name": "张三",
        "phone": "13800138000"
      }
    }
  }
}
```

### 2.2 阶段二：协议层解析 (Protocol Layer Parsing)

协议层接收 WebSocket 消息，解析为标准 `MessageEnvelope`，并路由到业务控制器。

**代码逻辑：**

```typescript
// ProtocolLayer.ts
public handleWsMessage(rawJson: string) {
  // 1. 解析 JSON
  const wsMsg: InboundPushMessage = JSON.parse(rawJson);
  
  // 2. 验证信封
  if (!wsMsg.eventKey || !wsMsg.data) {
    this.logger.error('Invalid WS message');
    return;
  }

  // 3. 路由分发 (Event Bus)
  // 将数据转换为业务对象
  if (wsMsg.eventKey === 'alarm.new-arrival') {
    const alarmData: AlarmData = wsMsg.data.alarm as AlarmData;
    
    // 4. 触发控制层事件
    this.eventBus.emit('alarm:new-arrival', alarmData);
  }
}
```

**数据转换关键点：**

- `wsMsg.data.alarm` (Raw JSON) → `AlarmData` (Strongly Typed TS Interface)
- 字段校验：确保 `lng/lat` 存在，`severity` 合法。

### 2.3 阶段三：控制层处理 (Business Controller Processing)

业务控制器接收到警情事件，执行业务逻辑（如：播放提示音、弹出面板、**准备地图数据**）。

**代码逻辑：**

```typescript
// BusinessController.ts
public onNewAlarm(alarm: AlarmData): void {
  // 1. 更新UI面板
  this.uiService.showAlarmPanel(alarm);

  // 2. 转换为 OpenLayers 所需的数据结构
  const olFeature = this.convertAlarmToOLFeature(alarm);

  // 3. 添加到地图图层
  this.mapService.addAlarmFeature(olFeature);

  // 4. 飞行动画到报警位置
  this.mapService.flyTo(alarm.location.lng, alarm.location.lat);
}

private convertAlarmToOLFeature(alarm: AlarmData): ol.Feature {
  // 创建几何体 Point
  const geometry = new ol.geom.Point(
    ol.proj.fromLonLat([alarm.location.lng, alarm.location.lat])
  );

  // 创建要素
  const feature = new ol.Feature({
    geometry: geometry,
    // 存储业务元数据，供后续点击查询使用
    businessData: alarm,
    // 自定义属性，用于样式区分
    alarmType: alarm.alarmType,
    severity: alarm.severity,
    alarmNo: alarm.alarmNo
  });

  // 设置唯一ID，用于地图交互
  feature.setId(`alarm-${alarm.alarmNo}`);

  return feature;
}
```

**数据转换关键点：**

- `lng/lat` (Decimal Degrees) → `ol.proj.fromLonLat()` → `[x, y]` (Web Mercator EPSG:3857)
- `AlarmData` (JSON) → `feature.set('businessData', ...)` (嵌入要素)
- 几何类型选择：`ol.geom.Point` (单点报警) 或 `ol.geom.Polygon` (区域报警)。

### 2.4 阶段四：OpenLayers 渲染 (OpenLayers Rendering)

地图服务将 Feature 添加到 VectorSource，OpenLayers 自动渲染。

**代码逻辑：**

```typescript
// MapService.ts
private alarmSource: ol.source.Vector;
private alarmLayer: ol.layer.Vector;

constructor() {
  // 1. 初始化数据源
  this.alarmSource = new ol.source.Vector({
    wrapX: false // 警情点不需要世界复制
  });

  // 2. 初始化图层，绑定样式函数
  this.alarmLayer = new ol.layer.Vector({
    source: this.alarmSource,
    style: this.getAlarmStyleFunction // 动态样式
  });

  // 3. 添加到 Map
  this.map.addLayer(this.alarmLayer);
}

// 添加警情要素
public addAlarmFeature(feature: ol.Feature): void {
  // 去重：如果已有相同警情ID，先移除
  const existing = this.alarmSource.getFeatureById(feature.getId());
  if (existing) {
    this.alarmSource.removeFeature(existing);
  }
  
  // 添加新要素
  this.alarmSource.addFeature(feature);
}

// 动态样式函数：根据警情等级显示不同颜色
private getAlarmStyleFunction(feature: ol.Feature): ol.style.Style {
  const severity = feature.get('severity');
  const type = feature.get('alarmType');
  const geometry = feature.getGeometry();

  let color = '#FF0000'; // 默认红色
  if (severity === 'level-1') color = '#FF0000'; // 特别重大
  else if (severity === 'level-2') color = '#FF6600'; // 重大
  else if (severity === 'level-3') color = '#FFCC00'; // 较大
  else if (severity === 'level-4') color = '#00CC00'; // 一般

  return new ol.style.Style({
    image: new ol.style.Circle({
      radius: 10,
      fill: new ol.style.Fill({ color: color }),
      stroke: new ol.style.Stroke({ color: '#FFFFFF', width: 2 })
    }),
    text: new ol.style.Text({
      text: feature.get('alarmNo'),
      offsetY: -15,
      font: 'bold 12px Arial',
      fill: new ol.style.Fill({ color: '#000' }),
      stroke: new ol.style.Stroke({ color: '#fff', width: 3 })
    }),
    // 如果是区域报警，渲染多边形样式
    ...(geometry.getType() === 'Polygon' ? {
      fill: new ol.style.Fill({ color: color + '40' }), // 半透明填充
      stroke: new ol.style.Stroke({ color: color, width: 2 })
    } : {})
  });
}
```

**渲染效果：**

- 地图上出现一个红色圆点（或闪烁动画）。
- 旁边显示警情编号文本。
- 点击该点，弹出 `AlarmData` 详细信息。

***

## 三、其他场景数据流转速查

### 3.1 来电场景 (Incoming Call)

| 步骤 | 组件         | 动作                                    | 数据变化                                 |
| -- | ---------- | ------------------------------------- | ------------------------------------ |
| 1  | 后端         | WS 推送 `call.incoming`                 | JSON: `{ callId, caller, location }` |
| 2  | 协议层        | 解析 `MessageEnvelope`                  | 提取 `callData`                        |
| 3  | 控制层        | `BusinessController.onIncomingCall()` | 调用控制层组件工具（定位、标绘圆、信息块）                |
| 4  | 控制层        | 转换地图数据                                | `lng/lat` → `ol.geom.Point`          |
| 5  | OpenLayers | `callSource.addFeature()`             | 地图显示来电定位点（蓝色波纹动画）                    |

### 3.2 调派场景 (Dispatch)

| 步骤 | 组件         | 动作                                    | 数据变化                                                  |
| -- | ---------- | ------------------------------------- | ----------------------------------------------------- |
| 1  | 控制层        | `BusinessController.dispatchForces()` | 构造 `DispatchForcesReq`                                |
| 2  | 协议层        | HTTP POST `/api/dispatch/forces`      | 发送 JSON 到后端                                           |
| 3  | 后端         | 处理调度，返回 `DispatchResp`                | JSON: `{ dispatchId, forces: [...] }`                 |
| 4  | 协议层        | WS 推送 `dispatch.force-assigned`       | 实时通知各中队                                               |
| 5  | 控制层        | 解析力量列表                                | 遍历 `forces` 数组                                        |
| 6  | OpenLayers | `forceSource.addFeature()`            | 地图上显示消防车辆/中队图标（绿色三角）                                  |
| 7  | OpenLayers | 连接路径                                  | 调用 `map.analysis.route` 结果，绘制 `ol.geom.LineString` 路径 |

### 3.3 跟踪场景 (Tracking)

| 步骤 | 组件         | 动作                                   | 数据变化                                              |
| -- | ---------- | ------------------------------------ | ------------------------------------------------- |
| 1  | 控制层        | `BusinessController.startTracking()` | 订阅车辆 ID 列表                                        |
| 2  | 协议层        | WS Subscribe                         | 建立长连接                                             |
| 3  | 后端         | 定时推送 `tracking.vehicle-location`     | 高频 JSON 流 (1Hz-5Hz)                               |
| 4  | 协议层        | 解析并聚合                                | 避免 DOM 更新过频，使用 `requestAnimationFrame` 节流         |
| 5  | 控制层        | 更新 Feature 几何体                       | `feature.getGeometry().setCoordinates(newLngLat)` |
| 6  | OpenLayers | 重绘图层                                 | 车辆图标在地图上平滑移动                                      |
| 7  | OpenLayers | 轨迹线                                  | 将历史坐标点推入 `ol.geom.LineString`，形成轨迹                |

### 3.4 到场场景 (Arrival)

| 步骤 | 组件         | 动作                       | 数据变化                          |
| -- | ---------- | ------------------------ | ----------------------------- |
| 1  | 控制层        | 检测到车辆位置接近警情点             | 距离 < 50m                      |
| 2  | 协议层        | 发送 `scene.state-changed` | 状态流转：Tracking → Arrived       |
| 3  | 控制层        | 更新 UI                    | 标记力量为"已到达"                    |
| 4  | OpenLayers | 样式变更                     | 车辆图标变为"静止"状态，显示"到场"标签         |
| 5  | 控制层        | 用户上传现场照片                 | 图片上传至后端，URL 存入 `businessData` |
| 6  | OpenLayers | 弹窗显示                     | 点击图标显示现场照片轮播                  |

***

## 四、OpenLayers 数据结构映射总表

为了高效渲染，前端需要将业务数据映射为 OpenLayers 的标准对象。

### 4.1 几何体映射

| 业务数据 | 几何类型       | OpenLayers Class     | 示例                                   |
| ---- | ---------- | -------------------- | ------------------------------------ |
| 单点报警 | Point      | `ol.geom.Point`      | `new ol.geom.Point([x, y])`          |
| 区域火灾 | Polygon    | `ol.geom.Polygon`    | `new ol.geom.Polygon([[...]])`       |
| 疏散路线 | LineString | `ol.geom.LineString` | `new ol.geom.LineString([...])`      |
| 车辆位置 | Point      | `ol.geom.Point`      | `new ol.geom.Point([x, y])`          |
| 覆盖范围 | Circle     | `ol.geom.Circle`     | `new ol.geom.Circle([x, y], radius)` |

### 4.2 样式映射

| 业务属性 | OpenLayers Style 属性          | 说明              |
| ---- | ---------------------------- | --------------- |
| 警情等级 | `fill.color`, `stroke.color` | 颜色编码 (红/橙/黄/绿)  |
| 车辆状态 | `image.icon.src`             | 图标切换 (行驶/静止/故障) |
| 重要程度 | `text.font`, `image.radius`  | 字体大小/图标大小       |
| 可见性  | `style.display`              | 条件渲染            |

### 4.3 交互映射

| 业务操作   | OpenLayers 事件                          | 处理逻辑                                               |
| ------ | -------------------------------------- | -------------------------------------------------- |
| 点击查看详情 | `map.on('singleclick', ...)`           | `map.forEachFeatureAtPixel(...)` 获取 `businessData` |
| 拖拽标绘图元 | `interaction.on('change:active', ...)` | 更新 `feature.getGeometry()` 并同步后端                   |
| 框选批量操作 | `interaction.on('select', ...)`        | 获取选中 Feature 列表，执行批量删除/移动                          |

***

## 五、性能优化建议

在处理高频数据（如跟踪场景）时，需注意 OpenLayers 的性能瓶颈：

1. **数据节流 (Throttling)**:
   - 后端推送频率可能为 1Hz，但前端渲染可控制在 10fps-30fps。
   - 使用 `requestAnimationFrame` 批量更新几何体，而非每次 WS 消息立即更新。
2. **图层分离 (Layer Separation)**:
   - 将静态数据（底图、建筑轮廓）与动态数据（车辆、警情）分在不同图层。
   - 动态图层使用 `ol.source.Vector`，静态图层使用 `ol.source.Tile` 或 `ol.source.Image`。
3. **几何简化 (Geometry Simplification)**:
   - 对于复杂的 BIM 轮廓或多边形，使用 `simplify` 算法减少点数，提升渲染速度。
4. **对象池 (Object Pooling)**:
   - 对于频繁创建的 `ol.Feature`，考虑复用对象，减少 GC 压力。

***

## 六、总结

本文档展示了从后端数据源到 OpenLayers 地图渲染的完整链路：

1. **后端**: 产生 JSON 数据，通过 HTTP/WS 发出。
2. **协议层**: 解析信封，校验数据，路由事件。
3. **控制层**: 业务逻辑处理，将业务对象转换为 OpenLayers 友好的数据结构（Geometry + Properties）。
4. **OpenLayers**:
   - `ol.source.Vector` 管理 Feature 集合。
   - `ol.layer.Vector` 负责渲染。
   - `ol.style.Style` 根据业务属性动态决定视觉表现。
   - `ol.interaction` 处理用户交互。

通过这种分层架构，实现了**业务数据**与**渲染逻辑**的解耦，使得前端能够灵活应对各种场景变化。
