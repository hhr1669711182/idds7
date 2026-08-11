# Tasks

- [x] Task 1: 初始化基类与插件架构
  - [x] SubTask 1.1: 创建 `MapCore` 核心基类，管理 OpenLayers Map 实例生命周期、插件注册 (`use` 方法) 及销毁。
  - [x] SubTask 1.2: 定义基础的 `Plugin` 接口/抽象类，统一插件初始化与销毁的钩子规范。

- [x] Task 2: 实现基础资源与控件管理插件
  - [x] SubTask 2.1: 实现 `useBaseMap` (或 `BaseMapPlugin`)，支持多源底图（XYZ/OSM/Tile/Image 等）切换与管理。
  - [x] SubTask 2.2: 实现 `useCoreControl`，用于快速注册和移除缩放、比例尺、鹰眼、全屏等原生及自定义控件。
  - [x] SubTask 2.3: 实现 `useFeatureStyle`，封装一套基于预设和动态传参的样式构造工厂，并结合缓存机制。

- [x] Task 3: 实现素材与交互状态管理
  - [x] SubTask 3.1: 实现 `useMapStatus`，提供统一的 API 用于对地图资源（Layer、Feature 等）进行增删改查和显隐控制。
  - [x] SubTask 3.2: 实现 `useOverlay`，基于面向对象实现动态挂载、位置更新、偏移配置及销毁的弹窗管理。

- [x] Task 4: 实现高级业务功能插件
  - [x] SubTask 4.1: 实现 `useDraw`，封装一套完整的绘图工具链（点、线、面、多边形、圆等），并提供绘制开始、结束及修改事件的回调。
  - [x] SubTask 4.2: 实现 `useRoutePlan`，支持起终点/途经点参数输入，调用外部 API 实现路径规划并自动上图。
  - [x] SubTask 4.3: 实现 `useBusUpWMS`，封装 WMS/WFS 资源的请求和加载逻辑，支持外部传入请求实例 (Alova/Fetch)。

- [x] Task 5: 综合工具及 NPM 出口整合
  - [x] SubTask 5.1: 实现 `useMapUtils` 集合类，包含视图定位 (FlyTo)、视图动画、地址正/逆解析 (Geocoding)。
  - [x] SubTask 5.2: 创建 `index.ts`，导出所有 Class 构造器、Hooks 函数和核心 TypeScript 类型声明，确保完全兼容 ESM 标准并能够被项目解构引入。

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 1]
- [Task 5] depends on [Task 1, 2, 3, 4]
