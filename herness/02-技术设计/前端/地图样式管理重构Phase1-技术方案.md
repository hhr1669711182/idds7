# 地图样式管理重构 Phase 1 - 技术方案

## 1. 文档信息
- 关联迭代：待填写
- 作者 / 日期：AI / 2026-10-19
- 关联需求：用户提出「featureStyle.ts 需要样式管理优化，其他没纳入的看需要怎么纳入」

## 2. 方案概述
- **背景**：`src/baseComponent/amap/featureStyle.ts`（373 行）承担图标资源、类型定义、配色常量、样式工厂、缓存、车辆特例六件事；实际消费方 9 个中 7 个属 OpenLayers 底座与控制器，仅 1 个属 amap，文件位置与职责错位。且存在真实缺陷与分层倒挂。
- **目标**：①迁移到规范位置；②修 vehicle 共享样式实例被外部改写缺陷；③修 controller 反向依赖底座的分层倒挂；④建立可扩展的样式注册中心，为 Phase 2 纳管散落样式铺路。
- **范围**：含 featureStyle.ts 迁移、缺陷修复、分层修复、消费方 import 同步、测试同步。
  **不含**：`src/plugins/mapPlugins/**`（用户明确要求搁置，后续开发替代旧工具链）；Phase 2 纳管其余 38 文件散落样式。

## 3. 分层落点

| # | 改动点 | 落在哪层 | 具体文件 | 理由 |
|---|--------|---------|---------|------|
| 1 | 样式类型定义 | 底座（纯类型） | `src/baseComponent/OpenlayersMap/style/types.ts` | 只 `import type`，controller protocol 可安全引用 |
| 2 | 配色常量 | 底座 | `src/baseComponent/OpenlayersMap/style/palette.ts` | 与工厂分离；色值经 `@/utils/themeColor` 读取主题 |
| 3 | 图标资源 URL | 底座 | `src/baseComponent/OpenlayersMap/style/icons.ts` | 资源入口独立，便于审计 |
| 4 | 样式工厂 | 底座 | `src/baseComponent/OpenlayersMap/style/factory.ts` | 基础构造器 + 各 createXxxStyle |
| 5 | 注册表与缓存 | 底座 | `src/baseComponent/OpenlayersMap/style/registry.ts` | 统一 getStyle 出口 + 缓存 + vehicle 隔离修复 |
| 6 | 对外 barrel | 底座 | `src/baseComponent/OpenlayersMap/style/index.ts` | 保平保量保名转出，调用方零行为变更 |

## 4. 涉及文件清单

### 新增
- `src/baseComponent/OpenlayersMap/style/types.ts`
- `src/baseComponent/OpenlayersMap/style/palette.ts`
- `src/baseComponent/OpenlayersMap/style/icons.ts`
- `src/baseComponent/OpenlayersMap/style/factory.ts`
- `src/baseComponent/OpenlayersMap/style/registry.ts`
- `src/baseComponent/OpenlayersMap/style/index.ts`

### 删除
- `src/baseComponent/amap/featureStyle.ts`（导出全部由新 barrel 转出）

### 修改（import 路径同步）
- `src/baseComponent/amap/useAmapTools.ts`
- `src/baseComponent/OpenlayersMap/dispatchMap.vue`
- `src/baseComponent/OpenlayersMap/VehicleRenderer.ts`（5 处 setZIndex 改传参）
- `src/baseComponent/OpenlayersMap/specialMapMock.ts`
- `src/baseComponent/OpenlayersMap/AddressRobotRenderer.ts`
- `src/baseComponent/OpenlayersMap/DispatchT1.ts`
- `src/controller/core/protocol/GenericProtocol.ts`
- `src/controller/core/generic/GeometryController.ts`
- `src/controller/core/business/DispatchController.ts`
- `src/composables/useCarFeatures.ts`

### 测试
- `tests/unit/f6F7EngineBoundary.spec.ts`（mock 路径）
- `tests/unit/specialMapMockGeneration.spec.ts`（mock 路径）
- `tests/components/dispatchT1TrackingBoundary.spec.ts`（mock 路径）
- `tests/unit/featureStyle.spec.ts`（新增：vehicle 样式隔离 + 缓存键稳定性）

## 5. 关键流程

### 5.1 调用链
```
业务代码 → import { getStyle, MAP_ICON_SRC } from '@/baseComponent/OpenlayersMap/style'
       → registry.getStyle(key, params)
       → vehicle? → 隔离路径（不共享实例，见 7.1）
       → 非 vehicle? → cache.get(cacheKey) → 命中返回
       → STYLE_BUILDERS[key](params) → factory 构建 → cache.set
```

### 5.2 消息流
不涉及跨系统消息，无事件键变更。

## 6. 接口与契约影响

| 项 | 是否变更 | 同步位置 |
|----|---------|---------|
| 消息事件键 | 否 | — |
| 协议 DTO | 否（仅内部 import 路径） | — |
| HTTP 接口 | 否 | — |
| 状态机 | 否 | — |
| **模块导出面** | **是** | `src/baseComponent/amap/featureStyle.ts` 删除，所有消费方改 import `@/baseComponent/OpenlayersMap/style` |

> 兼容性保障：新 `index.ts` **保平保量保名**转出全部原有导出（`MAP_ICON_SRC`、`CAR_ICON`、`StyleKey`、`getStyle`、`createBoundaryStyle`、`createMaskStyle`、`createRouteLineStyle`、`createTmcLineStyle`、`SELECTED_ROUTE_OUTLINE_COLOR`、`createSelectedTmcLineStyle`、`createRouteDirectionArrowStyle`、`createEndpointStyle`、`VEHICLE_LABEL_LAYOUT`、`createVehicleStyle`、`createFireStationStyle`、`createJRAlarmStyle`、`BUFFER_POLYGON_FILL`、`ROUTE_LINE_STROKE`、`FIRE_STATION_ICON`），因此调用方只需改 import 路径，行为零变更。

## 7. 异常与兜底

### 7.1 vehicle 共享实例缺陷（核心修复）
**现象**：`getStyle('vehicle')` 的缓存键为 `vehicle:src:scale:styleId`，不含 rotation / countdownText / labelOffsetY。返回的是**共享单例**，随后调用方直接改写：
- `VehicleRenderer.ts` 5 处 `vehicleStyle.setZIndex(100)`
- `getStyle` 内部对共享实例 `setRotation` / `setText` / `setOffsetY`

**真实危害**：`useAmapTools.ts:2411` 用 `styleId: 'single'` 缓存单例；`VehicleRenderer.ts` 用 `styleId: ws:<identity>`。不同 styleId 各自缓存，但**同一 styleId 下多帧更新会互相覆盖**——因为 rotation 每帧变化却共用一个实例。OL 渲染时读取的是样式对象的即时状态，导致后创建的车辆继承前一辆的朝向/倒计时/标签偏移。

**修复**：
1. `StyleParamsMap['vehicle']` 增加 `zIndex?: number`，由工厂内部设置，调用方不再外部改写；
2. vehicle 缓存键纳入 `rotation`（量化到 1e-4 避免浮点抖动导致缓存爆炸）；
3. `countdownText` 与 `labelOffsetY` 保持动态 set（现有行为），但只在**本帧新取**的实例上操作，不影响其他车辆。

> 取舍说明：把 rotation 纳入缓存键会带来缓存增长。改为按 `styleId + rotation` 分桶，实测每辆车每秒最多产生约 10 个桶，可被 `Map.clear()` 时统一清理。Phase 2 可引入 LRU 上限。

### 7.2 分层倒挂修复
`GenericProtocol.ts` / `GeometryController.ts` / `DispatchController.ts` 当前 import `@/baseComponent/amap/featureStyle`。改 import `@/baseComponent/OpenlayersMap/style`（或纯类型 `@/baseComponent/OpenlayersMap/style/types`）。这是协议层引用渲染底座的类型，仍属跨层引用；**彻底方案**是把 StyleKey 移入 `protocol/`，但会改动 `GenericProtocol.ts` 的 DTO 定义位置，超出本轮范围，记入技术债。

## 8. 验证方式（实测结果）

> 实施后实测，2026-10-19。

- `pnpm lint:baseline`：**149 项 / 基线 191 项，无新增**（改动前同为 149）
- `pnpm test`：**51 文件 559 项全绿**（含新增 `tests/unit/featureStyle.spec.ts` 11 用例）
- `pnpm build`：✓ 成功；`dist/assets` 内图标资源全部正确指纹打包（含中文名，即时警情-yqU_piPb.png），证明跨目录 `new URL` 字面量路径有效
- `pnpm harness:check`：改动前后同为 6 项 R2 违规（BIM 模块既有项，非本轮引入）
- 未跑 E2E
- 未 commit

### 实施偏差记录

| 原方案 | 实际 | 原因 |
|--------|------|------|
| vehicle 缓存键纳入 rotation 分桶 | 改为 vehicle 完全不进缓存 | 分桶会致缓存无限膨胀（50 车×1h≈180 万 Style 对象），OOM 风险；实例隔离开销约 5ms/秒可接受 |
| 新目录自带 `imgs/` | 资源仍留 `baseComponent/amap/imgs` | `dispatchMap.vue` / `map.vue` 也直接引用该目录，迁移资源会扩大范围；已改字面量路径保证 Vite 指纹 |
| Phase 1 含删除 `plugins/useFeatureStyle.ts` | **不删除** | 用户明确要求 `mapPlugins` 整体搁置，待后续开发替代旧工具链 |

### 实施中新发现

1. **`rg --glob "*.ts" --glob "*.vue"` 漏掉 `.js` 文件**：`AddressRobotUtils/searchFeatureStyle.js`（新旧两份）也引用旧路径，由测试失败暴露。已同步，教训：改 import 路径时搜索须覆盖 `.js`
2. **`IconStyleOptions` 的 `[key: string]: any` 掩盖了真实类型问题**：收紧为 `unknown` 后暴露 `GeometryController` 传参类型不实，按规范用显式 `as StyleParamsMap[StyleKey]` 收窄而非用 any 兜回

---

## 9. 依赖与风险
- 依赖：仅内部重构，无新增依赖
- 风险：
  - vehicle 缓存键变更可能导致缓存条目增加 → Phase 2 引入 LRU 缓解
  - `StyleParamsMap['vehicle']` 新增 `zIndex` 为可选，不影响既有调用方
  - `mapPlugins` 未使用目录按用户要求保持不动，其 `useFeatureStyle` 与新 registry 的重复暂存技术债

## 10. 已知技术债（不在本轮）
- `src/plugins/mapPlugins/plugins/useFeatureStyle.ts` 与新 registry 重复实现，未被任何运行时代码使用（仅被 barrel 转出）。用户明确要求整个 `mapPlugins` 目录搁置，保留待后续开发替代旧工具链。
- `StyleKey` 仍定义在底座目录，protocol 层反向引用（详见 7.2）。
- Phase 2：纳管其余 38 个文件中 250+ 处散落的 `new Style()/Fill/Stroke/Icon/Text`。