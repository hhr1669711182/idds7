# GIS 前端插件化架构设计方案 (Plugin-Based Architecture)

**版本**：v1.0  
**定位**：面向多项目、跨团队赋能的 GIS 核心能力输出方案。通过依赖包（npm private package）形式分发，支持在任意宿主项目中即插即用。
**核心思想**：基于“微内核 + 插件”架构，实现核心闭源保护、严格的边界隔离与高度的功能内聚。

---

## 一、 架构核心理念与边界控制

在插件化架构下，GIS 不再是一个具体的业务模块，而是一个**“能力的容器”**。为了保持闭源特性与避免边界效应，需遵循以下原则：

1. **微内核 (Micro-Kernel)**：内核仅提供地图底座生命周期、总线通信与插件注册机制，绝不包含任何消防业务代码。内核代码闭源、混淆压缩后发布。
2. **严格的沙箱隔离 (Sandbox)**：插件不能直接操作地图 DOM 或底层引擎 API，必须通过内核暴露的 `Context API` 进行操作，防止插件间的样式污染或实例冲突。
3. **高内聚的插件包 (Cohesive Plugins)**：一个插件即一个 NPM 包（或 umd 文件），内部闭环包含自己的 UI 面板、逻辑控制与数据请求。

---

## 二、 架构分层设计

### 1. 宿主环境 (Host Application)
- **职责**：Vue/React 主前端项目，提供容器 DOM，安装并实例化 GIS 微内核，按需注册业务插件。

### 2. GIS 微内核 (`@fire-gis/core`)
- **定位**：闭源的基座包，所有项目必须引入。
- **职责**：
  - 封装 OpenLayers/ThreeJS 引擎底座。
  - 提供 `PluginManager`，管理插件的安装、启用、卸载。
  - 提供 `EventBus`，实现插件与插件、插件与宿主之间的通信。
  - 暴露标准化的 `MapContext API`（如标绘点、画面、视角移动），屏蔽底层引擎差异。

### 3. 插件体系 (Plugins)
插件根据职责划分为三种类型，均以独立的 npm 包发布：

#### a) 基础能力插件 (`@fire-gis/plugin-xxx`)
- **测绘插件** (`plugin-measure`)：提供测距、测面工具与面板。
- **标绘插件** (`plugin-draw`)：提供态势标绘工具。
- **资源插件** (`plugin-geoserver`)：提供 WMS/WFS 图层接入能力。

#### b) 消防业务插件 (`@fire-business/plugin-xxx`)
- **来电定位插件** (`plugin-call-locate`)：监听来电事件，自动绘制 500m 粗定位圈，提供定位 UI 面板。
- **调派跟踪插件** (`plugin-dispatch`)：实现四级围栏联动、路径预计算、车辆点选调派逻辑。
- **微观作战插件** (`plugin-micro-scene`)：首车到场后触发，展示 BIM 模型与微观要素。

---

## 三、 核心实现机制

### 1. 插件的定义与注册契约

内核规定了严格的插件接口契约（Interface），任何插件必须实现该契约：

```typescript
// @fire-gis/core/types.ts
export interface IGisPlugin {
  /** 插件唯一标识 */
  name: string;
  /** 插件版本 */
  version: string;
  /** 
   * 插件安装钩子
   * @param ctx 内核注入的上下文 API，限制了插件的能力边界
   */
  install(ctx: PluginContext): void;
  /** 插件卸载钩子，必须清理自身产生的图层与事件监听 */
  uninstall(): void;
}

// Context API 示例 (沙箱隔离的体现)
export interface PluginContext {
  // 只能调用受限的地图绘制方法，不能拿到原生 map 实例
  drawMarker(id: string, options: MarkerOptions): void;
  drawPolygon(id: string, options: PolygonOptions): void;
  // 只能在分配给该插件的 UI 挂载点渲染面板
  mountUI(component: any, position: 'left' | 'right' | 'toolbar'): void;
  // 通信能力
  on(event: string, callback: Function): void;
  emit(event: string, payload: any): void;
}
```

### 2. 宿主项目的使用方式 (即插即用)

宿主项目（如调度指挥端）只需安装核心包和所需的业务插件包：

```javascript
import { GisCore } from '@fire-gis/core';
import { MeasurePlugin } from '@fire-gis/plugin-measure';
import { DispatchPlugin } from '@fire-business/plugin-dispatch';

// 1. 实例化内核，挂载到 DOM
const gisApp = new GisCore({
  container: 'map-div',
  center: [116.39, 39.90],
  zoom: 12
});

// 2. 注册插件 (按需加载)
gisApp.use(new MeasurePlugin());
gisApp.use(new DispatchPlugin({ 
  // 插件可接受宿主传入的个性化配置
  autoFitPadding: [50, 50, 50, 50] 
}));

// 3. 宿主与插件通信 (解耦)
gisApp.emit('host:alarm_confirmed', { incidentId: '123' });
```

### 3. 边界效应与内聚能力的保障策略

#### 边界隔离 (隔离污染)
- **命名空间隔离**：内核在 `PluginContext` 中自动为插件生成带前缀的 ID。例如 `DispatchPlugin` 调用 `ctx.drawMarker('car_1')`，底层引擎实际存储的 ID 为 `plugin_dispatch_car_1`。当插件卸载时，内核自动根据前缀清空其所有资产。
- **UI 隔离**：内核在地图上划分了固定的插槽（Slot），插件的 UI 面板只能注入到指定的插槽中，防止插件自由操作 DOM 遮挡核心视图。

#### 高内聚能力
- **自包含数据流**：业务插件内部包含自己的 API 请求逻辑。例如 `DispatchPlugin` 内部自己去请求车辆状态和路径规划，不依赖宿主提供数据，宿主只给一个“警情 ID”作为触发器。

---

## 四、 插件化架构的优劣势分析

### 优势
1. **极致的闭源保护**：`@fire-gis/core` 可以作为公司的核心资产，经过深度混淆和鉴权（License 机制）后，直接对外输出给第三方集成商使用。
2. **多业务线并行开发**：
   - **代码物理隔离**：消防接警团队维护 `plugin-call-locate` 仓库，调度团队维护 `plugin-dispatch` 仓库，架构团队维护 `@fire-gis/core` 仓库。各团队在各自的 Git 仓库中开发，互不干扰。
   - **独立版本发布**：每个插件是一个独立的 NPM 包。如果调度插件修复了 Bug，只需发布 `plugin-dispatch@1.0.1`，宿主项目更新该依赖即可，不需要等待整个 GIS 系统统一发版。
   - **本地 Mock 调试**：业务团队开发插件时，只需在本地拉起一个极简的测试宿主页面，挂载 `GisCore` 并注入自己的插件进行调试，无需启动庞大的完整业务系统。
3. **灵活的商业化售卖**：根据客户购买的模块组合发包。客户只买接警模块，就只提供基础插件和接警插件。

### 劣势 / 挑战
1. **设计难度极高**：内核暴露的 `Context API` 必须经过极其严密的推演。一旦设计不合理，后续插件无法实现复杂需求，或者频繁引发 API 破坏性变更（Breaking Change）。
2. **通信链路变长**：宿主 ↔ 内核 ↔ 插件 的通信链路会增加调试和排障的难度。

---

## 五、 总结

插件化方案是 GIS 前端架构演进的**最终形态**，特别适合**有对外商业化输出（ToB 赋能集成商）**或**内部研发团队极为庞大**的场景。它通过微内核和严格的 Context 沙箱，完美解决了闭源保护、能力内聚和防代码污染的核心诉求。