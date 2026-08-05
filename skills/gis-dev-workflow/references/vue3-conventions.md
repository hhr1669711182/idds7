# Vue 3 / TypeScript / OpenLayers / ThreeJS 强制开发规约

本文档是 GIS 前端分阶段开发契约的强制配套规约。

## 1. 通用编码

- 所有 .ts 文件使用 ES Module 严格模式。
- 命名驼峰：类型与接口 PascalCase，函数与变量 camelCase，常量 UPPER_SNAKE_CASE。
- 枚举与状态常量使用 s const 对象 + 类型联合，禁止 enum 关键字。
- 	sconfig.json 启用 strict: true、
oImplicitAny: true、
oUncheckedIndexedAccess: true。
- 公开 class/interface/	ype/composable/store 必须有中文 JSDoc 注释。
- 关键业务方法必须有中文注释：业务意图、领域规则、不变量约束。
- 注释中文，简洁；禁止 // TODO 留在主分支。
- ESLint + Prettier 强制基线。

## 2. 协议层

- 统一信封 MessageEnvelope<T>：包含 eventId、occurredAt、scene、payload。
- 坐标字段强约束 WGS84：payload.lngLat: [longitude, latitude]，经度在前。
- BusinessProtocol.ts、GenericProtocol.ts、IOProtocol.ts 分开文件。
- 协议解析方法为纯函数，无副作用。

## 3. 计算层

- 纯函数或可注入 composable；不得持有 DOM/Map/ThreeJS 引用。
- 高频数据（GPS ≥2fps、轨迹批处理、抽稀）必须走 Web Worker + Transferable Objects。
- 计算结果坐标转回 WGS84 后再交给控制层。
- 计算函数必须有性能基准测试。

## 4. 业务控制层

- 只接受业务协议事件并组合为通用控制层 DTO。
- 禁止直接调用 OL/ThreeJS API；禁止持有地图或画布引用。
- 业务控制层负责业务状态机（警情、车辆、调派方案）。
- 方法命名以 业务动词 + 业务名词：如 syncAlarmProfile、dispatchVehicles、	rackVehicleRoute。

## 5. 通用控制层

- 只接受 DTO 并执行图形指令。
- 禁止承载业务规则；禁止读业务 store，只允许读 useMapStore、useLayersStore。
- 方法必须幂等。
- Auto-Fit 使用 iew.fit(extent, { padding: [0.1, 0.1, 0.1, 0.1] })；不得贴边。
- 方法必须单元可测，允许注入 store mock。

## 6. IO 控制器层

- InputController 只接收视图变化并转换为 IO 协议事件。
- OutputController 只把通用控制层结果回写到视图或外部系统。
- 不得参与业务流转。

## 7. 渲染层

- 组件只通过 Pinia store 与 composable 获取图元。
- 禁止进行空间计算（除动画帧内简单插值）。
- 渲染图层必须使用业务前缀命名；命名必须出现在 eferences/gis-architecture.md 的 Layer IDs 清单。
- 资源图层标识示例：兴趣面 gis:env_build_aoi、出入口 gis:env_entrance_exit、消防栓 gis:env_fire_water、道路 gis:env_greatchina_road、车辆 gis:fire_vehicle、警情 gis:incident_alarm、来电 gis:incoming_call、调派路径 gis:dispatch_route、跟踪轨迹 gis:tracking_track、围栏 gis:fence_*。
- 组件 props 显式声明类型与默认值；-model 显式声明 modelValue 与 update:modelValue。
- 组件必须使用 defineOptions({ name }) 声明组件名。

## 8. 状态管理

- 业务 store 由业务控制层调用；视图 store 由通用控制层调用。
- store 状态变更必须通过 action；组件不得直接修改 store state。
- 跨 store 通信通过 mitt 或派生 store。
- store 必须有 eset() action。

## 9. 测试

- composable、store、controller、纯函数使用 Vitest 单元测试；目标覆盖率 ≥ 80%。
- Vue 组件使用 @vue/test-utils 渲染测试。
- Worker 使用 Vitest worker_threads mock 验证。
- 性能 SLA 验证使用 Playwright/Headless Chrome + Performance API；不在单测中。
- 测试用例命名使用中文 describe / it；关键测试逻辑必须有中文注释。
- 缺陷修复必须先添加失败测试再修复并执行回归。

## 10. 规则冲突处理

1. 业务事实和五层架构以 eferences/gis-architecture.md 为准。
2. 坐标系与转换以 eferences/gis-coord-system.md 为准。
3. 业务场景 AC 以 eferences/gis-business-scenarios.md 为准。
4. 性能指标以 eferences/gis-performance-sla.md 为准。
5. 控制层 DTO 拼装模式以 eferences/gis-controller-patterns.md 为准。
6. 状态机定义以 eferences/gis-state-machines.md 为准。
7. 用户要改变强制基线或本规约时，需明确提出并确认影响范围。

当上述优先级仍无法解决冲突时，停止工作并向用户报告冲突详情，不得静默选择。
