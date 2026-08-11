# GIS 前端架构调优改进方案

> **版本**：1.0 | **日期**：2026-07-10  
> **目标**：基于设计文档，分析当前架构差距，提出调优改进方案

---

## 一、现状分析

### 1.1 模块完成度

| 模块 | 完成度 | 说明 |
|------|--------|------|
| Controller 层总体 | **85%** | 大部分协议已实现，部分缺失 |
| 消息中枢 (MessageStore) | **100%** | 完整实现 |
| 协议定义 | **90%** | 核心协议已定义，场景协议缺失 |
| 组件层 | **80%** | 基础组件完整，业务组件待增强 |
| 图层体系 | **60%** | 需要按设计文档补充 |

### 1.2 关键差距概览

```
┌─────────────────────────────────────────────────────────────┐
│                      差距分析                               │
├─────────────────────────────────────────────────────────────┤
│ P0 阻塞级                                                    │
│   ├─ scene.transition 协议完全缺失                          │
│   ├─ OutputController 缺失 2 个方法                          │
│   └─ TrackingController 不完整                               │
├─────────────────────────────────────────────────────────────┤
│ P1 核心功能                                                  │
│   ├─ 四级围栏联动不完整                                     │
│   ├─ 车辆分类图标未实现                                      │
│   └─ 围栏颜色区分未实现                                     │
├─────────────────────────────────────────────────────────────┤
│ P2 优化功能                                                  │
│   ├─ AOI 微围栏聚焦逻辑缺失                                │
│   ├─ 预案推荐高亮未实现                                      │
│   └─ 微观作战视图未实现                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、P0 阻塞级问题（必须修复）

### 2.1 场景切换协议缺失

**问题**：`scene.transition` 协议完全缺失，导致无法实现值守/来电/问询/调派/跟踪/到场 6 个场景的切换。

**影响**：
- 无法实现 AC-来电、AC-问询 的场景切换
- 无法实现 FP-4.15 首车到场触发微观视图
- 无法实现 FP-4.16 微观作战视图

**改进方案**：

| 文件 | 改动 | 说明 |
|------|------|------|
| `src/const/const.message.type.ts` | 新增 `SCENE_TRANSITION` | 场景切换事件键 |
| `src/controller/core/protocol/IOProtocol.ts` | 新增 `SceneTransitionData` | 场景切换数据结构 |
| `src/controller/core/io/OutputController.ts` | 新增 `emitSceneTransition` | 发布场景切换 |
| `src/store/useMessageStore.ts` | 注册订阅 | 消息分发 |

**数据结构**：
```typescript
interface SceneTransitionData {
  from: SceneType;
  to: SceneType;
  reason?: string;
}

enum SceneType {
  DUTY = 'duty',
  INCOMING_CALL = 'incoming_call',
  INQUIRY = 'inquiry',
  DISPATCH = 'dispatch',
  TRACKING = 'tracking',
  ON_SCENE = 'on_scene'
}
```

---

### 2.2 OutputController 方法缺失

**问题**：`emitVehicleDisplayStateChange` 和 `emitRouteVisibleChange` 方法缺失。

**影响**：
- 车辆选中/调派状态无法通知外部
- 路径显隐变更无法反馈

**改进方案**：

| 文件 | 改动 | 说明 |
|------|------|------|
| `src/controller/core/io/OutputController.ts` | 实现 `emitVehicleDisplayStateChange` | 车辆状态变更通知 |
| `src/controller/core/io/OutputController.ts` | 实现 `emitRouteVisibleChange` | 路径显隐变更通知 |

---

### 2.3 TrackingController 不完整

**问题**：`trackingVehicleRouteRealtime` 方法缺失或未注册。

**影响**：FP-4.14 动态ETA实时刷新无法实现

**改进方案**：

| 文件 | 改动 | 说明 |
|------|------|------|
| `src/controller/core/io/InputController.ts` | 注册 `TRACKING_VEHICLE_ROUTE_REALTIME` | 协议订阅 |
| `src/controller/core/business/TrackingController.ts` | 实现 `trackingVehicleRouteRealtime` | 实时路径规划 |

---

## 三、P1 核心功能问题

### 3.1 四级围栏联动不完整

**问题**：`DispatchViewportFitData` 简化为单一 center，未支持四级围栏数组。

**影响**：FP-4.1 四级围栏联动、FP-4.2 颜色区分、FP-4.3 Auto-Fit+留边

**改进方案**：

| 文件 | 改动 | 说明 |
|------|------|------|
| `src/controller/core/protocol/BusinessProtocol.ts` | 扩展 `DispatchViewportFitData` | 增加 fences[] 数组和 isPrimary |
| `src/controller/core/business/DispatchController.ts` | 完善 `dispatchViewportFit` | 遍历围栏数组，按 isPrimary 区分颜色 |

**数据结构**：
```typescript
interface DispatchViewportFitData {
  incidentId: string;
  fitType: 'four_fences' | 'single' | 'aoi';
  fences: Array<{
    station_id: string;
    stationName: string;
    isPrimary: boolean;      // 新增：主管 vs 支撑
    geometry: GeoJSON.Polygon;
  }>;
  padding?: number[];       // 10-15%
  includeAlarmPoint?: boolean;
}
```

---

### 3.2 车辆分类图标未实现

**问题**：`MarkerAddData` 未包含 vehicleType 和 isMainStation。

**影响**：FP-4.7 车辆分类图标、FP-4.8 预案推荐高亮、FP-4.9 主管强化

**改进方案**：

| 文件 | 改动 | 说明 |
|------|------|------|
| `src/controller/core/protocol/GenericProtocol.ts` | 扩展 `MarkerAddData` | 增加 vehicleType、isMainStation、recommended |
| `src/baseComponent/OpenlayersMap/` | 扩展 `getStyle` | 根据 vehicleType 返回对应图标 |

---

### 3.3 围栏颜色区分未实现

**问题**：`PolygonDrawData` 未包含 style 字段。

**影响**：FP-4.2 围栏颜色差异化

**改进方案**：

| 文件 | 改动 | 说明 |
|------|------|------|
| `src/controller/core/protocol/GenericProtocol.ts` | 扩展 `PolygonDrawData` | 增加 style: 'primary' \| 'secondary' |
| `src/baseComponent/OpenlayersMap/` | 扩展渲染逻辑 | 根据 style 区分颜色 |

---

### 3.4 定位类型标注缺失

**问题**：`LocateCallData` 未包含 positionType。

**影响**：AC-来电 验收标准中"标注定位类型"

**改进方案**：

| 文件 | 改动 | 说明 |
|------|------|------|
| `src/controller/core/protocol/BusinessProtocol.ts` | 扩展 `LocateCallData` | 增加 positionType: 'cell_tower' \| 'landline' \| 'precise' |

---

## 四、P2 优化功能问题

### 4.1 AOI 微围栏聚焦逻辑缺失

**问题**：`CallController.aoiEsQuery` 未实现"生成微围栏后隐藏前两圈"逻辑。

**影响**：AC-问询 验收标准

**改进方案**：

| 文件 | 改动 | 说明 |
|------|------|------|
| `src/controller/core/business/CallController.ts` | 完善 `aoiEsQuery` | 微围栏确认后，自动调用 feature_remove 移除粗定位圈和管辖圈 |

---

### 4.2 预案推荐高亮未实现

**问题**：未实现霓虹高亮样式。

**影响**：FP-4.8 预案推荐高亮

**改进方案**：

| 文件 | 改动 | 说明 |
|------|------|------|
| `src/baseComponent/OpenlayersMap/featureStyle.ts` | 新增霓虹高亮样式 | 橙色/橙红色外环或光晕 |
| `src/controller/core/business/DispatchController.ts` | 调用高亮样式 | recommended=true 时应用霓虹样式 |

---

## 五、改进文件清单

### 5.1 需修改的文件

| 文件 | 优先级 | 改动类型 |
|------|--------|---------|
| `src/const/const.message.type.ts` | P0 | 新增协议常量 |
| `src/controller/core/protocol/IOProtocol.ts` | P0 | 新增数据结构 |
| `src/controller/core/io/InputController.ts` | P0 | 注册订阅 |
| `src/controller/core/io/OutputController.ts` | P0 | 实现方法 |
| `src/controller/core/protocol/GenericProtocol.ts` | P1 | 扩展字段 |
| `src/controller/core/protocol/BusinessProtocol.ts` | P1 | 扩展字段 |
| `src/controller/core/business/DispatchController.ts` | P1 | 完善逻辑 |
| `src/controller/core/business/CallController.ts` | P2 | 完善逻辑 |
| `src/controller/core/business/TrackingController.ts` | P0 | 完善逻辑 |
| `src/baseComponent/OpenlayersMap/featureStyle.ts` | P2 | 新增样式 |

### 5.2 需新增的文件

| 文件 | 用途 |
|------|------|
| `src/controller/core/business/SceneController.ts` | 场景管理器（可选，如场景逻辑复杂可独立） |

---

## 六、实施优先级

```
阶段一：P0 阻塞级（1-2天）
├─ 1. 新增 scene.transition 协议
├─ 2. 完成 OutputController
└─ 3. 完成 TrackingController

阶段二：P1 核心功能（3-5天）
├─ 1. 四级围栏联动
├─ 2. 车辆分类图标
├─ 3. 围栏颜色区分
└─ 4. 定位类型标注

阶段三：P2 优化功能（2-3天）
├─ 1. AOI 聚焦逻辑
├─ 2. 预案推荐高亮
└─ 3. 微观作战视图
```

---

## 七、验收标准关联

| 验收标准 | 关联改动 |
|----------|----------|
| AC-值守 | 图层配置 |
| AC-来电 | positionType + scene.transition |
| AC-问询 | aoiEsQuery 逻辑 + scene.transition |
| FP-4.1 | DispatchViewportFitData.fences[] |
| FP-4.2 | PolygonDrawData.style |
| FP-4.3 | fit_bounds + padding |
| FP-4.4 | aoi_circle |
| FP-4.5 | POI marker |
| FP-4.6 | trafficColor |
| FP-4.7 | vehicleType + ETA |
| FP-4.8 | recommended + 霓虹样式 |
| FP-4.9 | isMainStation + 强化样式 |
| FP-4.11 | vehicle.display.state.change |
| FP-4.12 | dispatch.route.toggle |
| FP-4.13 | smooth_move |
| FP-4.14 | trackingVehicleRouteRealtime |
| FP-4.15 | scene.transition |
| FP-4.16 | scene.transition + 微观视图 |

---

## 八、总结

### 核心改进点

1. **场景切换机制**：新增 `scene.transition` 协议，实现 6 场景完整切换
2. **输出协议完善**：补全车辆状态和路径显隐通知
3. **数据结构调整**：扩展 `DispatchViewportFitData`、`MarkerAddData`、`PolygonDrawData`
4. **业务逻辑增强**：四级围栏、车辆分类、围栏颜色区分

### 风险评估

| 风险 | 等级 | 应对 |
|------|------|------|
| scene.transition 影响范围广 | 中 | 先实现协议框架，后续完善 |
| 图层体系重构可能影响现有功能 | 中 | 保持向后兼容，新增图层ID |
| 样式变更影响 UI 一致性 | 低 | 复用现有样式体系 |

---

**版本记录**：1.0 (2026-07-10) 初始版本
