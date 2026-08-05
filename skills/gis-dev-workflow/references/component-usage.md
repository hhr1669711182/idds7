# 通用组件、Composable、Worker 复用指南

新增通用能力前必须查阅本表，优先复用已有能力。`workflow-contract.md` 后续新增的能力会自动并入本表。

## 1. Composable（src/composables/）

| Composable | 用途 | 关联场景 | 备注 |
| --- | --- | --- | --- |
| `useAlova` | HTTP 请求封装（alova） | 全场景 | 统一请求入口，自动注入 tenantId |
| `useCurrentMap` | 当前地图实例引用 | 全场景 | 由 `mapPlugins` 注入；禁止组件直接持有 map |
| `useMapConfigStore` | 地图配置（中心、缩放、底图类型） | 值守、来电 | 持久化到 LocalStorage |
| `useResponsive` | 响应式断点（PC/Pad/大屏） | 渲染层 | 三档断点 ≥ 1920/1366/1024 |
| `useAlarmHotspot` | 警情热力分布计算 | 值守 | 计算层（纯函数） |
| `useIncomingCallFeatures` | 来电弹屏图元管理 | 来电 | 仅与 `CallController` 配套使用 |
| `useCarFeatures` | 车辆 marker 与轨迹管理 | 跟踪 | 与 `TrackingController` 配套使用 |
| `useRouteMetricsWorker` | 路径算路/抽稀 Worker 封装 | 调派、跟踪 | 基于 `src/baseComponent/amap/routeMetrics.worker.ts` |
| `useWebSocket` | WebSocket 客户端封装 | 全场景 | 支持自动重连、心跳 |
| `usePostMessage` | 跨窗口 postMessage 封装 | Host → GIS | 用于主前端与 GIS iframe 通信 |
| `useEncryptedStorage` | LocalStorage 加密封装 | 全场景 | 敏感配置加密存储 |

### 1.1 使用规则
- 优先使用 composable 而不是直接调用底层 API。
- composable 内禁止直接持有 map/Scene 引用；只持有 store 引用。
- composable 必须单元可测（依赖注入 store mock）。

## 2. Pinia Store（src/store/）

| Store | 类型 | 用途 |
| --- | --- | --- |
| `useMapStore` | 视图 | 当前地图状态（center、zoom、extent、followTarget） |
| `useLayersStore` | 视图 | 图层注册、可见性、图元集合 |
| `useBaseSourceStore` | 视图 | 底图源（WMS、矢量切片、amap） |
| `useMapConfigStore` | 视图 | 用户偏好（持久化） |
| `useDispatchStore` | 业务 | 警情、车辆、调派方案状态 |
| `useAlarmStore` | 业务 | 警情画像详情 |
| `useCardStore` / `useCardStore1` | 业务 | 弹屏卡片状态 |
| `useModalStore` / `useModalMap` | 业务 | 模态对话框 |
| `useMessageStore` | 业务 | 消息总线（与 mitt 配合） |
| `usePanelStore` | 视图 | 面板显隐 |
| `useTabsStore` | 视图 | 多页签 |
| `useTopicLayerStore` | 业务 | 主题图层（警情分布热力等） |
| `useCommonStore` | 业务 | 全局通用状态 |
| `useModelAssessStore` | 业务 | 三维模型评估状态 |
| `useDispatchMapStore` | 视图 | 调派地图子状态 |

### 2.1 使用规则
- 视图 store（`useMapStore`、`useLayersStore`、`useBaseSourceStore`）由通用控制层调用。
- 业务 store（`useDispatchStore`、`useAlarmStore` 等）由业务控制层调用。
- 组件只读 store，修改必须通过 action。
- 跨 store 通信通过 `mitt` 或派生 store，禁止双向依赖。

## 3. 通用组件（src/baseComponent/）

### 3.1 OpenLayers 组件

| 组件 | 用途 | 关联场景 |
| --- | --- | --- |
| `baseSource.ts` | 底图源（WMS、矢量、amap）工厂 | 值守、来电、问询、调派 |
| `layers.ts` | 图层管理（注册、可见性、Z 序） | 全场景 |
| `map.vue` | OpenLayers 地图容器 | 全场景 |
| `dispatchMap.vue` | 调派专用地图（带四级围栏） | 调派 |
| `NavPanel.vue` | 导航面板（缩放、定位、指北） | 全场景 |
| `ZoomLevelControl.vue` | 缩放等级控制 | 全场景 |
| `AlarmDetailPopup.vue` | 警情详情弹窗 | 来电、问询 |
| `IncomingCallOverlay.vue` | 来电弹屏 | 来电 |
| `useMapPopups.ts` | 弹窗管理器（composable） | 全场景 |
| `FeatureClickQuery.ts` | 要素拾取查询 | 问询 |
| `overlayTemplate.vue` | 弹窗模板 | 全场景 |

### 3.2 amap 组件

| 组件 | 用途 | 关联场景 |
| --- | --- | --- |
| `useAmapTools.ts` | 高德地图工具封装 | 值守、来电（高德底图时） |
| `amapCoordinate.ts` | WGS84 ↔ GCJ-02 转换 | 全场景 |
| `mapData.ts` | 高德数据源封装 | 值守、来电 |
| `featureStyle.ts` | 图元样式工厂 | 全场景 |
| `routeMetrics.ts` | 路径度量 | 调派 |
| `routeMetrics.worker.ts` | 路径算路 Worker | 调派 |

### 3.3 ThreeJS 组件（src/components/BIM/、src/views/modelAssess/）

| 组件 | 用途 |
| --- | --- |
| `ThreejsViewerBuilding.vue` | 建筑 3D 视图 |
| `ThreejsViewerRegion.vue` | 区域 3D 视图 |
| `createAroundFacilities.js` | 周边设施 3D 创建 |
| `createBIMBuilding.js` | BIM 建筑创建 |
| `createBuildingByFloors.js` | 按楼层创建建筑 |
| `createFireFacilities.js` | 消防设施 3D 创建 |
| `createWhiteBuildings.js` | 白模建筑 |
| `drawTruckPath.js` | 车辆路径 3D 绘制 |
| `generateFireSprite.js` | 火焰精灵图 |
| `initThreeBuilding.js` | 3D 建筑初始化 |
| `initThreeRegion.js` | 3D 区域初始化 |
| `transformCoordinate.js` | 3D 坐标转换 |
| `viewerInquiryBuilding.vue` | 问询建筑查看 |

### 3.4 地图工具（src/components/map/MapTools/）

- `ThemeTools/`：聚合（Cluster）、热力（HeatMap）、遮罩（Mask）、时间（Time）、交通（Traffic）、天气（Weather）。
- `drawMapTools/`：方位（Azimuth）、圆查询（CircleQuery）、绘制（Draw）、测角（MeasureAngle）、测面（MeasureArea）、测距（MeasureDistance）、点（Point）、拉框选择（SelectExtent）。
- `Overlay.ts`：弹窗容器。
- `index.ts`：工具注册中心。

### 3.5 通用工具组件（src/baseComponent/）

- `Common.ts`：通用工具函数集合。
- `FeatureHandler.js`：要素处理工具。
- `address.ts`：地址解析与展示。
- `amap.ts`：高德地图工具。
- `baidu.ts`：百度地图工具。
- `transform.ts`：坐标转换工具。
- `GithubIcon.vue`、`Slider.vue`、`ThemeSwitch.vue`、`keyboardNote.vue`：UI 工具。

## 4. Web Worker 使用规则

### 4.1 必须使用 Worker 的场景
- 路径算路（>100 个顶点）。
- 路径抽稀（>50 个点）。
- GPS 高频更新聚合（≥2fps）。
- 大批量 WFS 结果解析（>1000 个要素）。
- 复杂空间计算（Turf buffer、intersect）。

### 4.2 Worker 实现位置
- `src/baseComponent/amap/routeMetrics.worker.ts`（已有）
- `src/hooks/useRouteMetricsWorker.ts`（已有封装）
- 新增 Worker 必须：
  - 放在 `src/baseComponent/` 或 `src/hooks/` 目录。
  - 提供同名 composable 封装。
  - 大数据传输使用 Transferable Objects（`Float32Array`、`ArrayBuffer`）。

### 4.3 Worker 测试
- 使用 Vitest `worker_threads` mock 验证。
- 必须覆盖边界输入（空数组、单点、巨大数组）。
- 必须覆盖错误处理（Worker 崩溃、超时）。

## 5. 新增通用能力的流程

1. 先查阅本表确认无重复能力。
2. 在 `references/component-usage.md` 增补新能力的章节。
3. 在 `docs/design/03-控制层设计.md` 或 `docs/design/04-渲染层设计.md` 中增补新能力设计。
4. 提供 composable、组件、单元测试。
5. 提交时附带使用示例与测试报告。

## 6. 严禁事项

- 禁止在组件中直接调用 `ol/Map`、`three/Scene` 等底层 API。
- 禁止在 composable 中持有 DOM/Map 引用。
- 禁止跨 store 双向依赖。
- 禁止在多个组件中重复实现同一 composable。
- 禁止在生产代码中硬编码坐标、缩放等级、底图 URL。
