# 核心业务场景验收标准

5 个核心场景的 AC（Acceptance Criteria）。每个场景必须满足：触发条件、协议事件、控制器动作、渲染结果、SLA 要求。所有场景的状态机定义详见 `references/gis-state-machines.md`。

## 场景 1：值守（Duty）

### 触发条件
- 警员登录成功，进入 GIS 主页面默认场景。
- 路由：`/duty` 或根路径。

### 协议事件
- `duty.scene.enter`：进入值守场景。
- `duty.layers.sync`：辖区图层、警情分布、消防设施图层批量同步。
- `alarm.profile.snapshot`：当前可见警情列表（用于分布热力）。

### 控制器动作
- `DutyController.enterScene()`：加载默认中心点、缩放级别 15，触发 `mapViewLoad`。
- `DutyController.loadLayers()`：批量加载 `gis:env_build_aoi`、`gis:env_fire_water`、`gis:env_greatchina_road` 图层。
- `DutyController.renderAlarmDistribution()`：根据警情快照渲染热力图或聚合点。

### 渲染结果
- 默认中心点为辖区几何中心，默认 zoom = 15。
- 辖区建筑白模显示；消防栓、出入口按图层显示。
- 警情分布按热度聚合，hover 显示警情计数。

### SLA 要求
- 首次进入场景首帧 ≤ 800ms（含图层加载）。
- 值守场景稳态帧率 ≥ 30fps。
- 缩放/平移操作响应 ≤ 100ms。

## 场景 2：来电弹屏（Incoming Call）

### 触发条件
- 后端推送 `call.incoming` 事件（来电）。
- 弹屏优先级最高，必须立即抢占值守场景视野。

### 协议事件
- `call.incoming`：来电主事件，含 `id`（来电唯一 ID）、`longitude`、`latitude`、`radius`（默认 500m）、`address`、`carrier_loc`。
- `call.location.remove`：来电结束或转接，移除弹屏。

### 控制器动作
- `CallController.onIncomingCall(data)`：
  1. 通用控制层 DTO：`view.locate({ lngLat, zoom: 18, duration: 800 })`。
  2. 通用控制层 DTO：`geometry.addCircle({ id: 'call_' + id, center: lngLat, radius, style: 'incoming' })`。
  3. 通用控制层 DTO：`geometry.addMarker({ id: 'call_' + id, lngLat, iconType: 'call' })`。
  4. 弹屏组件 `IncomingCallOverlay` 显示，路由 `/incoming-call/{id}`。

### 渲染结果
- 视野自动 fit 至 500m 圆，zoom = 18。
- 来电点以红色脉动图标显示，500m 圈高亮显示。
- 弹屏 UI 显示来电号码、地址、归属辖区。

### SLA 要求
- 弹屏端到端延迟 ≤ 500ms（从收到 WebSocket 到画面呈现）。
- 500m 圈 fit 留边 12%。
- 来电结束 200ms 内清除弹屏与图元。

## 场景 3：问询研判（Inquiry）

### 触发条件
- 用户在来电弹屏或警情详情点击"问询"。
- 路由：`/inquiry/{incidentId}`。

### 协议事件
- `inquiry.start`：问询开始。
- `inquiry.aoi.query`：查询警情点周边兴趣面（围栏内建筑、出入口）。
- `inquiry.microfence.focus`：聚焦微围栏。

### 控制器动作
- `DispatchController.startInquiry(data)`：
  1. 通用控制层 DTO：`view.fit({ extent: microFenceExtent, paddingRatio: 0.12 })`。
  2. 通用控制层 DTO：`geometry.addPolygon({ id: 'microfence_' + incidentId, extent, style: 'inquiry' })`。
  3. 通用控制层 DTO：`geometry.highlight({ ids: aoiIds, style: 'inquiryFocus' })`。
  4. 计算层调用 `SpatialController.queryAoiByFence(extent)` 返回命中 AOI 列表。
  5. 计算层调用 `SpatialController.queryEntranceExit(extent)` 返回出入口列表。

### 渲染结果
- 视野聚焦微围栏（建筑 + 50m 缓冲）。
- 微围栏高亮（黄色描边、淡黄填充）。
- 命中 AOI 高亮显示，hover 显示建筑名称、楼层、风险等级。
- 出入口、消防栓以小图标显示。

### SLA 要求
- 微围栏 fit ≤ 300ms。
- AOI 查询 ≤ 200ms（含 WFS 调用）。
- 命中结果逐项呈现，每项 ≤ 50ms。

## 场景 4：图上调派（Dispatch）

### 触发条件
- 用户在警情详情或问询界面点击"调派"。
- 路由：`/dispatch/{incidentId}`。

### 协议事件
- `dispatch.route.plan`：路径规划请求（含起点站、终点灾情点、车辆列表）。
- `dispatch.route.toggle`：切换单条路径可见性。
- `dispatch.station.eta.filter`：按 ETA 过滤可见站点。
- `dispatch.resource.query.highlight`：高亮辖区资源（消防车、救援车、社会联动）。
- `dispatch.viewport.fit`：视野 fit 调派视图。

### 控制器动作
- `DispatchController.planRoute(data)`：
  1. 业务控制层状态机：`incident` 从 `CREATED` 转入 `DISPATCHED`。
  2. 计算层调用 `RoutePlanner.plan(start, end, vehicleList)` 异步计算多车路径。
  3. 通用控制层 DTO：`geometry.addRoute({ id, path, style: 'dispatch' })`。
  4. 通用控制层 DTO：`view.fit({ extent: routeExtent, paddingRatio: 0.12 })`。
- `DispatchController.toggleRoute(data)`：根据 `routeList` 切换单条路径可见性。
- `DispatchController.etaFilter(data)`：按 ETA 阈值隐藏远端站点。
- `DispatchController.highlightResource(data)`：高亮资源图层（车辆、联动单位）。

### 渲染结果
- 多车路径以不同颜色绘制，路径包含方向箭头。
- 推荐路径加粗高亮（recommended = true）。
- 站点按 ETA 由近到远排列；远端站点（>ETA_MAX）半透明。
- 调派围栏四级联动：辖区 → 责任区 → 微型围栏 → 灾情点。

### SLA 要求
- 单车路径算路 ≤ 1s（Worker 异步）。
- 多车路径并行计算 ≤ 2s（≤ 5 辆车）。
- 路径切换响应 ≤ 100ms。
- 围栏 fit 留边 12%。

## 场景 5：跟踪到场（Tracking）

### 触发条件
- 调派方案生效后，警情进入 `DISPATCHED` 状态。
- 车辆 GPS 开始高频推送（≥ 2fps）。

### 协议事件
- `tracking.vehicle.gps.update`：车辆位置更新。
- `tracking.vehicle.route.realtime`：实时路径回传。
- `tracking.scene.zoom.in`：进入微观视图（zoom ≥ 19）。

### 控制器动作
- `TrackingController.onGpsUpdate(data)`：
  1. 业务控制层更新 `vehicle.state`：`IDLE → DISPATCHED → EN_ROUTE → ON_SCENE → RETURNING`。
  2. 通用控制层 DTO：`kinematics.moveMarker({ id, lngLat, rotate: bearing })`。
  3. 通用控制层 DTO：`view.follow({ id, duration: 600 })`（持续跟踪目标车辆）。
- `TrackingController.onRouteRealtime(data)`：
  1. 计算层 Worker 抽稀：`RouteMetricsWorker.throttle(points, maxPoints=200)`。
  2. 通用控制层 DTO：`geometry.updatePolyline({ id, points })`。

### 渲染结果
- 车辆 marker 跟随 GPS 实时移动，方向角与车头一致。
- 跟踪模式下视野自动 follow 当前车辆（不锁死，允许用户拖动解除）。
- 微观视图（zoom ≥ 19）显示车辆细节（车号、状态、ETA）。
- 实时路径以渐变色绘制（已通过部分深色，未通过部分浅色）。

### SLA 要求
- GPS 端到端延迟 ≤ 500ms。
- 跟踪场景稳态帧率 ≥ 30fps。
- 路径抽稀（≤ 200 点/批）≤ 100ms。
- 视野 follow 平滑（无明显跳变）。

## 场景通用 AC

- 任何场景切换都必须清理上一场景的临时图元（按业务前缀匹配）。
- 任何场景的 Auto-Fit 都必须保留 10%~15% Padding。
- 任何场景切换都必须重置 Pinia store 的临时状态（通过 `reset()` action）。
- 任何高频数据（GPS、轨迹）必须走 Worker + Transferable Objects。
- 任何业务控制层方法都必须接收 `protocol/BusinessProtocol.ts` 类型参数。
- 任何通用控制层方法都必须接收 `protocol/GenericProtocol.ts` 类型参数。
