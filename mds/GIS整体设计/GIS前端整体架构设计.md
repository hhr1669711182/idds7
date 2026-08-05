# GIS 前端整体架构设计文档

**版本**：1.1 | **日期**：2026-07-10  
**核心参考**：`GIS控制.md`、`GIS功能缝合.md`用户故事

---

## 一、架构理念

采用 **「协议驱动 + 分层控制」** 理念，实现 GIS 能力与消防业务解耦：

- **通用控制层**：地图原子能力（标绘、高亮、空间计算、动画）
- **业务控制层**：组合通用能力实现消防业务目标
- **消息中枢**：统一发布-订阅，所有层间通信通过消息协议

---

## 二、分层架构

```
外部系统 ──WS/postMessage──→ MessageStore ──分发──→ InputController
                                                              │
                    ┌─────────────────────────────────────────┤
                    │                                         ▼
                    │                          GenericController
                    │                          (View/Geometry/Spatial/Kinematic)
                    │                                         │
                    └─────────────────────────────────────────┤
                                                              ▼
                                              BusinessController
                                              (Config/Alarm/Duty/Call/Dispatch/Tracking)
                                                              │
                                                              ▼
                                              OutputController
                                                              │
                                                              ▼
                                                            地图
```

---

## 三、核心模块

| 层级 | 组件 | 职责 |
|------|------|------|
| 消息中枢 | MessageStore | 统一消息分发、订阅管理、WebSocket连接 |
| 输入层 | InputController | 接收外部消息，分发到 Controller |
| 通用层 | ViewController | 视图控制（定位、缩放、图层） |
| 通用层 | GeometryController | 几何标绘（点、线、面） |
| 通用层 | SpatialController | 空间分析（查询、缓冲、路径） |
| 通用层 | KinematicController | 轨迹动画 |
| 业务层 | ConfigController | 系统配置 |
| 业务层 | AlarmController | 警情画像同步 |
| 业务层 | DutyController | 值守阶段控制 |
| 业务层 | CallController | 来电/问询控制 |
| 业务层 | DispatchController | 调派控制 |
| 业务层 | TrackingController | 跟踪控制 |
| 输出层 | OutputController | 输出消息发布 |

---

## 四、图层体系（按用户故事设计）

### 4.1 图层分类

| 图层类型 | 图层名称 | 说明 | 归属场景 |
|----------|----------|------|----------|
| **警情图层** | incident_layer | 未结案警情点 | 值守、调派、跟踪 |
| **警情图层** | current_alarm | 本警情（点亮） | 问询、调派 |
| **警情图层** | similar_alarm | 相似警情（点亮） | 问询 |
| **资源图层** | road_network | 路网（路况） | 值守、调派、跟踪 |
| **资源图层** | jurisdiction_fence | 主管队站辖区 | 值守、问询 |
| **资源图层** | support_fences | 支撑队站辖区（3个） | 调派、跟踪 |
| **资源图层** | stations | 队站待命车辆 | 调派、跟踪 |
| **资源图层** | call_position | 电话粗定位范围圈 | 来电、问询 |
| **资源图层** | jurisdiction_range | 责任队站管辖范围圈 | 问询 |
| **资源图层** | aoi_circle | 微围栏圈（AOI3） | 问询、调派、到场 |
| **救援对象** | key_units | 重点单位 | 值守 |
| **救援对象** | crowded_areas | 人员密集场所 | 值守、问询 |
| **救援对象** | communities | 小区围栏（兴趣面） | 值守 |
| **救援对象** | buildings | 建筑 | 值守、问询 |
| **救援对象** | single_building | 单体建筑 | 问询 |
| **救援对象** | nearby_buildings | 附近建筑 | 问询 |
| **救援对象** | hydrants | 消防栓 | 调派、到场 |
| **救援对象** | entrances | 出入口 | 调派、到场 |
| **救援对象** | assembly_point | 集结点 | 到场 |
| **导航图层** | route_line | 路径规划线 | 调派、跟踪 |
| **导航图层** | vehicle_track | 车辆轨迹 | 跟踪 |

### 4.2 场景图层配置

| 场景 | 启用图层 | 禁用图层 |
|------|---------|---------|
| **值守** | incident_layer、road_network、jurisdiction_fence、key_units、crowded_areas、communities、buildings | call_position、aoi_circle、support_fences、stations |
| **来电** | call_position、road_network、incident_layer | - |
| **问询** | current_alarm、similar_alarm、call_position、jurisdiction_range、single_building、nearby_buildings | stations、support_fences |
| **调派** | current_alarm、stations、road_network、jurisdiction_fence、support_fences、aoi_circle、hydrants、entrances、route_line | call_position |
| **跟踪** | current_alarm、stations、road_network、jurisdiction_fence、support_fences、aoi_circle、route_line、vehicle_track | call_position |
| **到场** | aoi_circle、assembly_point、hydrants、entrances | jurisdiction_fence（部分）、stations（部分） |

---

## 五、通用控制层协议

| 方法 | 协议 | 说明 |
|------|------|------|
| locate | `map.base.locate` | 视口平移缩放 |
| layerToggle | `map.base.layer_toggle` | 图层显隐 |
| fitBounds | `map.base.fit_bounds` | 面边界定位（支持10-15%留边） |
| addMarker | `map.base.marker_add` | 单点标绘 |
| drawPolygon | `map.base.polygon_draw` | 多边形高亮 |
| removeFeature | `map.base.feature_remove` | 要素移除 |
| setFeatureStyle | `map.base.style` | 要素样式设置（颜色区分主管/支撑） |
| esQuery | `map.base.es_query` | 空间检索 |
| calcBuffer | `map.base.buffer_calc` | 缓冲计算 |
| calcRoute | `map.base.route_calc` | 路径规划 |
| smoothMove | `map.base.smooth_move` | 平滑移动 |
| appendTrack | `map.base.track_append` | 轨迹追加 |
| playTrack | `map.base.track_play` | 轨迹回放 |

---

## 六、业务控制层协议（按用户故事）

### 6.1 值守阶段

| 协议 | 说明 | 用户故事验收标准 |
|------|------|-----------------|
| `config.layers` | 资源图层配置 | AC: 未结案警情、主管队站辖区、实时路况、重点救援对象图层，可单独关闭 |
| `map.view.load` | 城市地图围栏定位 | AC: 展示整个城市地图 |
| `alarm.profile.sync` | 警情数据同步 | 加载未结案警情 |

### 6.2 来电弹屏

| 协议 | 说明 | 用户故事验收标准 |
|------|------|-----------------|
| `map.locate.call` | 来电初略定位 | AC: 以基站定位为中心绘制500m圈，标注定位类型（基站粗定位/固话定位） |
| `map.locate.call.remove` | 来电挂断 | 清除定位圈 |
| `layer.set.visible` | 图层显隐 | AC: 合理占用屏幕空间（25%-35%） |

### 6.3 问询研判

| 协议 | 说明 | 用户故事验收标准 |
|------|------|-----------------|
| `alarm.profile.sync` | 警情画像同步 | AC: 高亮"电话粗定位范围圈"和"责任队站管辖范围圈" |
| `aoi.es_gisZone` | 辖区队站围栏 | AC: 管辖范围圈边界线与粗定位圈有明显区分，高亮主辖区 |
| `aoi.es_query` | 围栏内资源查询 | AC: 生成微围栏后隐藏前两个圈 |
| `map.view.load` | 视图加载 | AC: 切换建筑展示维度（单体/附近/AOI内） |

### 6.4 调派

| 协议 | 说明 | 用户故事验收标准 |
|------|------|-----------------|
| `dispatch.viewport.fit` | 四级围栏定位 | **AC-FP4.1-4.3**: 主管队站+3个支撑队站围栏，颜色区分，Auto-Fit+10-15%留边 |
| `dispatch.route.plan` | 路径规划 | **AC-FP4.6**: 战术路网高亮，实时路况着色（红/黄/绿） |
| `dispatch.station.eta.filter` | ETA过滤 | **AC-FP4.7**: 车辆分类图标，动态ETA悬浮标签 |
| `dispatch.route.toggle` | 路径显隐 | 图上点选调派/取消 |
| `alarm.profile.sync` | 警情同步 | **AC-FP4.4**: 微围栏(AOI3)精细叠加 |

### 6.5 跟踪

| 协议 | 说明 | 用户故事验收标准 |
|------|------|-----------------|
| `tracking.vehicle.gps.update` | 车辆GPS更新 | **AC-FP4.13**: 平滑轨迹跟踪，更新频率≥2秒/次 |
| `tracking.vehicle.route.realtime` | 实时路径 | **AC-FP4.14**: 动态ETA实时刷新 |
| `scene.transition` | 场景切换 | **AC-FP4.15-4.16**: 首车到场触发微观视图 |

---

## 七、输出控制协议

| 方法 | 协议 | 说明 |
|------|------|------|
| emitMapViewChanged | `map.view.changed` | 视图变更 |
| emitMapFeaturePick | `map.feature.pick` | 要素拾取（车辆/警情/资源） |
| emitRoutePlanResult | `route.plan.result` | 规划结果 |
| emitLayerVisibleChange | `map.layer.visible.change` | 图层显隐状态 |
| emitVehicleStateChange | `vehicle.display.state.change` | **车辆选中/调派状态** |
| emitRouteVisibleChange | `route.visible.change` | 路径显隐 |

---

## 八、业务场景

| 场景 | 枚举 | 触发条件 | 核心功能 |
|------|------|---------|----------|
| 值守 | `duty` | 登录进入 | AC-值守: 城市地图态势感知 |
| 来电 | `incoming_call` | 119来电 | AC-来电: 500m粗定位圈+定位类型 |
| 问询 | `inquiry` | 通话定位 | AC-问询: 粗定位圈+管辖圈→微围栏聚焦 |
| 调派 | `dispatch` | 确认警情 | AC-调派: 四级围栏+车辆ETA+图上调派 |
| 跟踪 | `tracking` | 车辆出动 | AC-跟踪: 平滑轨迹+动态ETA |
| 到场 | `on_scene` | 首车到场 | AC-到场: 微观视图+战场要素 |

### 场景切换

```
duty ──来电──→ incoming_call ──定位──→ inquiry ──确认──→ dispatch
                                                              │
                                                     车辆出动 ─┘
                                                              │
                                                         tracking ──到场──→ on_scene
```

---

## 九、验收标准速查（来自用户故事）

| 编号 | 验收标准 |
|------|----------|
| **AC-值守** | 城市地图展示，加载未结案警情、主管队站辖区、实时路况、重点救援对象，可单独关闭图层 |
| **AC-来电** | 500m粗定位圈，标注定位类型（基站粗定位/固话定位），占用屏幕25%-35% |
| **AC-问询** | 粗定位圈+管辖范围圈同时展示，可选高亮主辖区；微围栏聚焦后隐藏前两圈 |
| **FP-4.1** | 四级围栏联动（主管+3支撑） |
| **FP-4.2** | 围栏颜色差异化（主管醒目色 vs 支撑次级色） |
| **FP-4.3** | Auto-Fit Bounds + 10-15% Padding |
| **FP-4.4** | 微围栏(AOI3)精细化叠加 |
| **FP-4.5** | 出入口、消防栓POI置顶 |
| **FP-4.6** | 战术路网高亮+路况着色 |
| **FP-4.7** | 车辆分类图标+动态ETA悬浮 |
| **FP-4.8** | 预案推荐车辆霓虹高亮 |
| **FP-4.9** | 主管队站车辆视觉强化 |
| **FP-4.11** | 图上点选交互（选中/取消） |
| **FP-4.12** | 一键调派秒级下发 |
| **FP-4.13** | 平滑轨迹跟踪≥2秒/次 |
| **FP-4.14** | 动态ETA实时刷新 |
| **FP-4.15** | 首车到场触发微观视图 |
| **FP-4.16** | 微观作战视图（微围栏+集结+栓+通道） |

---

## 十、技术决策

| 决策 | 说明 |
|------|------|
| ADR-001 | 采用协议驱动的 Controller 分层架构 |
| ADR-002 | 统一 MessageStore 作为消息中枢 |
| ADR-003 | 业务层可调用通用层，通用层不可调用业务层 |
| ADR-004 | 坐标系统一为 WGS84 |
| ADR-005 | 图层生命周期由场景管理器统一控制 |
| ADR-006 | 车辆平滑移动使用 requestAnimationFrame |

---

**版本记录**：
- 1.0 (2026-07-10) 初始版本
- 1.1 (2026-07-10) 整合GIS功能缝合用户故事，按用户故事优化图层体系和验收标准
