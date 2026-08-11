# OpenLayers 插件化地图工具库 Spec

## Why
当前项目中的地图逻辑可能存在与业务代码深度耦合、难以复用、维护成本高的问题。为了实现跨项目复用、支持 NPM 化和 ESM 导出，需要构建一个基于 OpenLayers 的高度封装、面向对象、组合式的地图工具库。该工具库需具备低耦合、高内聚的特性，支持多场景的业务扩展。

## What Changes
- **核心基类 (MapCore)**：设计负责地图实例生命周期管理、插件注册与通信的入口基类。
- **模块化插件 (Plugins)**：将具体业务拆分为独立的插件类/Hook，支持按需组合和重载：
  - `useBaseMap`: 多图源底图资源加载管理。
  - `useCoreControl`: OpenLayers 核心控件管理。
  - `useFeatureStyle`: 上图资源样式与管理。
  - `useMapStatus`: 全局全地图素材资源状态管理（增删改查、显示/隐藏等）。
  - `useOverlay`: 弹窗资源管理。
  - `useDraw`: 完整的绘图工具链（多种绘图方式）。
  - `useRoutePlan`: 实时路径规划管理。
  - `useBusUpWMS`: WMS 方式加载上图资源展示（支持 fetch/alova 适配注入）。
  - `useMapUtils`: 包含定位、动画、地址查询、逆地址查询等常用工具集合。
- **出入口闭环**：完善 `index.ts` 统一导出，支持 ESM 规范，暴露完整的 TypeScript 类型声明。

## Impact
- Affected specs: 地图相关的初始化、资源上图、交互逻辑、弹窗逻辑。
- Affected code: `src/plugins/mapPlugins` 目录下的全新架构，可作为独立依赖引入。

## ADDED Requirements
### Requirement: 核心基类与插件架构
系统 SHALL 提供一个 `MapCore` 类，允许通过 `.use(Plugin)` 的方式动态挂载地图能力。

#### Scenario: 按需加载插件
- **WHEN** 开发者需要一个只包含底图和绘图工具的地图实例
- **THEN** 开发者可以实例化 `MapCore` 并仅注入 `BaseMapPlugin` 和 `DrawPlugin`，有效减少打包体积。

### Requirement: 高级业务封装
系统 SHALL 提供针对 WMS、路径规划、弹窗管理的高度抽象类，并允许传入自定义请求实例（如 Alova/Fetch）以解耦具体请求库。

## MODIFIED Requirements
无（全新模块）。

## REMOVED Requirements
无。
