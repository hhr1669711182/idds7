# GIS控制器生成计划

## 1. 目标概述
根据 `mds/external/GIS控制.md` 的协议内容，在 `src/controller/core` 目录下生成二维分层控制模式的核心控制器代码。主要包括：
1. **协议数据结构校验文件 (`Protocol.ts`)**：将文档中的所有 JSON 实例声明为 TypeScript `interface`，实现严格的类型校验。
2. **通用控制器 (`GenericController.ts`)**：接收 OpenLayers `Map` 实例，提供原子化的纯 GIS 操作实现（如平移、缩放、要素增删、图层显隐等）。
3. **业务控制器 (`BusinessController.ts`)**：接收 `GenericController` 实例，负责解析带有业务语义的事件（如警情画像同步、来电定位、调派初始化等），并编排、调用底层通用控制器完成复杂的业务场景。

## 2. 当前状态分析
- `src/controller/core` 目录目前尚未建立。
- `mds/external/GIS控制.md` 中已经规范化了所有接口的 JSON 数据结构，包含 `eventType` 和 `data`。
- 项目底层地图渲染依赖 OpenLayers (在 `src/plugins/mapPlugins/core/MapCore.ts` 等可见使用 `ol/Map`)。

## 3. 提议的变更步骤

### 步骤 1: 创建协议类型声明文件 `src/controller/core/Protocol.ts`
- **内容**：提取文档中的所有数据结构，声明为 TypeScript 接口。
- **关键结构**：
  - 定义通用事件的数据接口：`LocateData`, `LayerToggleData`, `MarkerAddData`, `PolygonDrawData`, `FeatureRemoveData`, `FitBoundsData` 等。
  - 定义业务事件的数据接口：`AlarmProfileSyncData`, `LocateCallData`, `AoiEsGisZoneData`, `DispatchViewportFitData`, `DispatchRoutePlanData` 等。
  - 定义统一的控制事件包裹泛型：
    ```typescript
    export interface GISControlEvent<T = any> {
      eventType: string;
      data: T;
    }
    ```

### 步骤 2: 创建通用控制器 `src/controller/core/GenericController.ts`
- **内容**：实现纯粹的 GIS 地图操作。
- **关键实现**：
  - 构造函数注入 `import OlMap from 'ol/Map'`。
  - **视图控制 (G-V)**：
    - `locate(data: LocateData)`: 使用 `map.getView().animate()` 平移缩放。
    - `layerToggle(data: LayerToggleData)`: 遍历 `map.getLayers()` 并设置 `setVisible()`。
    - `fitBounds(data: FitBoundsData)`: 使用 `map.getView().fit()` 定位到多边形边界。
  - **几何与标绘 (G-G)**：
    - `addMarker(data: MarkerAddData)`: 创建 `ol/Feature(Point)` 并添加到内部的临时 VectorLayer 中。
    - `drawPolygon(data: PolygonDrawData)`: 创建 `ol/Feature(Polygon)` 并设置样式。
    - `removeFeature(data: FeatureRemoveData)`: 从指定的 VectorLayer 中移除对应 ID 的 Feature。
  - **空间与轨迹 (G-S, G-K)**：对于涉及后端接口查询（es_query、算路）和复杂动画（轨迹回放）的方法，生成标准的空方法骨架与注释，等待后续具体接口接入。

### 步骤 3: 创建业务控制器 `src/controller/core/BusinessController.ts`
- **内容**：实现业务逻辑与地图原子操作的映射。
- **关键实现**：
  - 构造函数注入 `GenericController`。
  - **警情画像同步 (`alarm.profile.sync`)**: 解析 `AlarmProfileSyncData`，如果包含经纬度，则调用 `genericController.locate()` 定位并调用 `genericController.addMarker()` 在地图上绘制警情点图标。
  - **来电阶段控制 (`map.locate.call`)**: 解析数据，调用 `genericController.locate()` 以及 `addMarker()` 进行来电基站/运营商的定位展示。
  - **辖区围栏控制 (`aoi.es_gisZone`)**: 收到指令后，组合调用 `fitBounds`（围栏定位）与空间检索（高亮）。
  - **调派阶段控制 (`dispatch.*`)**: 解析调派指令，组合调用视图定位、路线高亮、周边资源检索等通用能力。

## 4. 假设与决策
- **"TS数据结构校验"** 解释为在编译期通过 TypeScript 的 `interface` 和类型推断来实现校验，这符合大多数 Vue3/TS 项目的常规做法，不额外引入运行时的 Schema 校验库以保持代码轻量。
- **OpenLayers 操作状态管理**：`GenericController` 内部会维护一个或多个专门用于临时标绘的 `ol/layer/Vector`，以便实现 `addMarker` 和 `removeFeature` 的闭环。
- 对于 `GIS控制.md` 中的部分配置项（如全局系统配置），如果不需要立即操作地图的，也将在 Protocol 中声明，但在 Controller 中保留空方法或简单代理。

## 5. 验证步骤
1. 检查 `src/controller/core` 目录及三个文件是否成功创建。
2. 验证 `Protocol.ts` 中的属性字段是否与 `GIS控制.md` 中的 JSON 结构完全匹配。
3. 验证 `GenericController` 中是否正确引入了 `ol` 的相关依赖，且类型无明显错误。
4. 验证 `BusinessController` 是否正确调用了 `GenericController` 的方法来响应业务事件。
