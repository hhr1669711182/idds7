# Controller 层详细设计

> **版本**：1.0 | **日期**：2026-07-10

---

## 一、Controller 架构总览

```
InputController
    │
    ├── GenericController
    │   ├── ViewController       (视图控制)
    │   ├── GeometryController   (几何标绘)
    │   ├── SpatialController    (空间分析)
    │   └── KinematicController  (轨迹动画)
    │
    └── BusinessController
        ├── ConfigController     (配置)
        ├── AlarmController     (警情)
        ├── DutyController      (值守)
        ├── CallController      (来电)
        ├── DispatchController  (调派)
        └── TrackingController  (跟踪)
            │
            └── OutputController
```

---

## 二、InputController（输入控制层）

### 2.1 职责边界

- 订阅外部消息通道（WebSocket、postMessage）
- 将外部消息转换为内部事件
- 分发给对应的 GenericController 或 BusinessController

### 2.2 类签名

```typescript
export class InputController {
  private unsubscribers: Array<() => void> = [];

  constructor(
    private genericController: GenericController,
    private businessController: BusinessController
  ) {}

  /** 初始化所有协议订阅 */
  public initSubscriptions(): void

  /** 销毁所有订阅 */
  public destroy(): void
}
```

### 2.3 订阅映射表

| 协议 | Handler | 目标 Controller |
|------|---------|----------------|
| `map.base.*` | 对应方法 | GenericController.* |
| `config.*` | 对应方法 | BusinessController.config.* |
| `alarm.profile.sync` | syncAlarmProfile | BusinessController.alarm.* |
| `map.locate.call` | locateCall | BusinessController.call.* |
| `dispatch.*` | 对应方法 | BusinessController.dispatch.* |
| `tracking.*` | 对应方法 | BusinessController.tracking.* |

---

## 三、GenericController（通用控制层）

### 3.1 ViewController

**文件**：`src/controller/core/generic/ViewController.ts`

```typescript
export class ViewController {
  constructor(private mapCore: MapCore) {}

  /** 视口平移缩放 */
  locate(data: LocateData): void

  /** 图层显隐 */
  layerToggle(data: LayerToggleData): void

  /** 面边界定位 */
  fitBounds(data: FitBoundsData): void

  /** POI定位 */
  poiLocation(data: PoiLocationData): void

  /** 2.5D白膜渲染 */
  overlay3D(data: Overlay3DData): void

  /** WMS图层刷新 */
  layerRefresh(data: LayerRefreshData): void
}
```

### 3.2 GeometryController

**文件**：`src/controller/core/generic/GeometryController.ts`

```typescript
export class GeometryController {
  constructor(private mapCore: MapCore) {}

  /** 添加标记点 */
  addMarker(data: MarkerAddData): string

  /** 绘制多边形 */
  drawPolygon(data: PolygonDrawData): string

  /** 绘制线 */
  drawLine(data: LineDrawData): string

  /** 移除要素 */
  removeFeature(data: FeatureRemoveData): void

  /** 设置要素显隐 */
  setFeatureVisible(data: FeatureVisibleData): void

  /** 获取要素 */
  getFeature(id: string): Feature | null
}
```

### 3.3 SpatialController

**文件**：`src/controller/core/generic/SpatialController.ts`

```typescript
export class SpatialController {
  constructor(
    private mapCore: MapCore,
    private httpClient: HttpClient
  ) {}

  /** 空间检索 */
  async esQuery(data: EsQueryData): Promise<EsQueryResult[]>

  /** 缓冲计算 */
  calcBuffer(data: BufferCalcData): GeoJSON.Polygon

  /** 路径规划 */
  async calcRoute(data: RouteCalcData): Promise<RouteCalcResult>
}
```

### 3.4 KinematicController

**文件**：`src/controller/core/generic/KinematicController.ts`

```typescript
export class KinematicController {
  constructor(private mapCore: MapCore) {}

  /** 平滑移动 */
  smoothMove(data: SmoothMoveData): void

  /** 追加轨迹点 */
  appendTrack(data: TrackAppendData): void

  /** 轨迹回放 */
  playTrack(data: TrackPlayData): void

  /** 停止动画 */
  stopAnimation(featureId: string): void
}
```

---

## 四、BusinessController（业务控制层）

### 4.1 ConfigController

**文件**：`src/controller/core/business/ConfigController.ts`

```typescript
export class ConfigController {
  constructor(private mapCore: MapCore) {}

  /** 图层配置 */
  configLayers(data: ConfigLayersData): void

  /** 基础参数配置 */
  configBase(data: ConfigBaseData): void

  /** 清除策略配置 */
  configClearStrategy(data: ConfigClearStrategyData): void
}
```

### 4.2 AlarmController

**文件**：`src/controller/core/business/AlarmController.ts`

```typescript
export class AlarmController {
  private alarmStore: AlarmProfile;

  constructor(
    private mapCore: MapCore,
    private genericController: GenericController
  ) {}

  /** 同步警情画像 */
  syncAlarmProfile(data: AlarmProfileSyncData): void {
    // 1. 更新本地状态
    Object.assign(this.alarmStore, data);

    // 2. 根据变更类型触发对应操作
    if (data.longitude && data.latitude) {
      // 位置变更 -> 定位视口 + 标绘警情点
      this.genericController.view.locate({
        lngLat: [data.longitude, data.latitude],
        zoom: 15
      });
      this.genericController.geometry.addMarker({
        id: `alarm_${data.incidentId}`,
        lngLat: [data.longitude, data.latitude],
        iconType: data.disaster_type
      });
    }
  }
}
```

### 4.3 DutyController

**文件**：`src/controller/core/business/DutyController.ts`

```typescript
export class DutyController {
  constructor(
    private mapCore: MapCore,
    private genericController: GenericController
  ) {}

  /** 图层显隐设置 */
  layerSetVisible(data: LayerSetVisibleData): void {
    this.genericController.view.layerToggle({
      layerId: data.layerId,
      visible: data.visible ?? true
    });
  }

  /** 视图加载 */
  mapViewLoad(data: MapViewLoadData): void {
    if (data.longitude && data.latitude) {
      this.genericController.view.locate({
        lngLat: [data.longitude, data.latitude],
        zoom: data.zoom ?? 14
      });
    } else if (data.points?.length) {
      this.genericController.view.fitBounds({
        geometry: { type: 'MultiPoint', coordinates: data.points },
        padding: data.padding ?? [50, 50, 50, 50]
      });
    }
  }
}
```

### 4.4 CallController

**文件**：`src/controller/core/business/CallController.ts`

```typescript
export class CallController {
  private callMarkerId = 'incoming_call_marker';
  private callCircleId = 'incoming_call_circle';

  constructor(
    private mapCore: MapCore,
    private genericController: GenericController
  ) {}

  /** 来电定位 */
  locateCall(data: LocateCallData): void {
    // 1. 定位视口
    this.genericController.view.locate({
      lngLat: [data.longitude, data.latitude],
      zoom: 15
    });

    // 2. 添加呼吸点标记
    this.genericController.geometry.addMarker({
      id: this.callMarkerId,
      lngLat: [data.longitude, data.latitude],
      animate: 'breathe'
    });

    // 3. 绘制定位圈
    const bufferPolygon = this.genericController.spatial.calcBuffer({
      input: { center: [data.longitude, data.latitude], radius: data.radius }
    });
    this.genericController.geometry.drawPolygon({
      id: this.callCircleId,
      geometry: bufferPolygon,
      fillColor: 'rgba(255, 0, 0, 0.2)',
      strokeColor: '#ff0000'
    });
  }

  /** 移除来电定位 */
  locateCallRemove(_data: LocateCallRemoveData): void {
    this.genericController.geometry.removeFeature({
      featureIds: [this.callMarkerId, this.callCircleId]
    });
  }

  /** AOI空间查询 */
  aoiEsQuery(data: AoiEsQueryData): void {
    this.genericController.spatial.esQuery({
      geometry: { type: 'Polygon', coordinates: [data.points] },
      types: data.layerNames,
      limit: 50
    });
  }

  /** 辖区队站围栏查询 */
  aoiEsGisZone(data: AoiEsGisZoneData): void {
    // 调用后端获取围栏数据
    // 渲染围栏 + 高亮辖区
  }
}
```

### 4.5 DispatchController

**文件**：`src/controller/core/business/DispatchController.ts`

```typescript
export class DispatchController {
  constructor(
    private mapCore: MapCore,
    private genericController: GenericController,
    private httpClient: HttpClient
  ) {}

  /** 视口围栏定位 */
  dispatchViewportFit(data: DispatchViewportFitData): void {
    // 加载管辖围栏
    // 适配视口
  }

  /** 路径规划 */
  async dispatchRoutePlan(data: DispatchRoutePlanData): Promise<void> {
    const result = await this.genericController.spatial.calcRoute({
      start: [data.start.longitude, data.start.latitude],
      end: [data.end.longitude, data.end.latitude]
    });

    // 绘制路径 + 显示ETA
  }

  /** ETA过滤 */
  dispatchStationEtaFilter(data: DispatchStationEtaFilterData): void {
    // 按ETA过滤显示消防站
  }

  /** 路径显隐控制 */
  dispatchRouteToggle(data: DispatchRouteToggleData): void {
    data.routeList.forEach(route => {
      this.genericController.geometry.setFeatureVisible({
        featureId: route.routeId,
        visible: route.routeVisible
      });
    });
  }
}
```

### 4.6 TrackingController

**文件**：`src/controller/core/business/TrackingController.ts`

```typescript
export class TrackingController {
  constructor(
    private mapCore: MapCore,
    private genericController: GenericController
  ) {}

  /** 车辆GPS更新 */
  trackingVehicleGpsUpdate(data: TrackingVehicleGpsUpdateData): void {
    // 平滑移动 + 轨迹追加
    this.genericController.kinematic.smoothMove({
      featureId: `vehicle_${data.incidentId}`,
      targetLngLat: [data.lng, data.lat],
      duration: 500
    });

    this.genericController.kinematic.appendTrack({
      lineId: `track_${data.incidentId}`,
      newLngLat: [data.lng, data.lat]
    });
  }

  /** 实时路径规划 */
  async trackingVehicleRouteRealtime(
    data: TrackingVehicleRouteRealtimeData
  ): Promise<void> {
    // 重算ETA + 更新路径
  }
}
```

---

## 五、OutputController（输出控制层）

### 5.1 职责边界

- 将地图状态变更发布为输出消息
- 将用户交互结果发布为输出消息

### 5.2 类签名

```typescript
export class OutputController {
  constructor(
    private messageStore: MessageStore,
    private mapCore: MapCore
  ) {}

  /** 发布视图变更 */
  emitMapViewChanged(data: MapViewChangedData): void

  /** 发布要素拾取 */
  emitMapFeaturePick(data: MapFeaturePickData): void

  /** 发布规划结果 */
  emitRoutePlanResult(data: RoutePlanResultData): void

  /** 发布图层显隐变更 */
  emitMapLayerVisibleChange(data: MapLayerVisibleChangeData): void

  /** 发布车辆状态变更 */
  emitVehicleDisplayStateChange(data: VehicleDisplayStateChangeData): void

  /** 发布路径显隐变更 */
  emitRouteVisibleChange(data: RouteVisibleChangeData): void
}
```

---

## 六、方法签名汇总

| Controller | 方法 | 入参 | 出参 |
|------------|------|------|------|
| ViewController | locate | LocateData | void |
| ViewController | layerToggle | LayerToggleData | void |
| ViewController | fitBounds | FitBoundsData | void |
| GeometryController | addMarker | MarkerAddData | string |
| GeometryController | drawPolygon | PolygonDrawData | string |
| GeometryController | removeFeature | FeatureRemoveData | void |
| SpatialController | esQuery | EsQueryData | Promise |
| SpatialController | calcBuffer | BufferCalcData | GeoJSON |
| SpatialController | calcRoute | RouteCalcData | Promise |
| KinematicController | smoothMove | SmoothMoveData | void |
| KinematicController | appendTrack | TrackAppendData | void |
| AlarmController | syncAlarmProfile | AlarmProfileSyncData | void |
| CallController | locateCall | LocateCallData | void |
| CallController | locateCallRemove | LocateCallRemoveData | void |
| DispatchController | dispatchRoutePlan | DispatchRoutePlanData | Promise |
| DispatchController | dispatchRouteToggle | DispatchRouteToggleData | void |
| TrackingController | trackingVehicleGpsUpdate | TrackingVehicleGpsUpdateData | void |

---

**版本记录**：1.0 (2026-07-10) 初始版本
