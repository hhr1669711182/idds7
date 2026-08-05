---
name: gis-implementation
description: Use when approved GIS five-layer plans must be implemented for a Vue 3 + TypeScript + OpenLayers/ThreeJS GIS frontend project.
stage: 4
stage_name: 实现
compatible_agents:
  - codex
  - hermes
  - claude-code
  - cursor
  - trae
prerequisites:
  - gis-planning
entry_command: $gis-dev-workflow:gis-implementation
superpowers_skills:
  - superpowers:test-driven-development
  - superpowers:subagent-driven-development
gate:
  type: multi-gate
  quality_gates:
    - pnpm type-check
    - pnpm lint
    - pnpm test
  coverage_threshold: 80
  architecture_compliance:
    - 业务控制层不直接调 OpenLayers
    - 通用控制层不读业务 store
    - 业务 ID 必须加业务前缀
    - Auto-Fit Padding 必须保留 10-15%
timeout_seconds: 864000
tools_required:
  - read_documentation
  - write_stage_artifact
  - run_quality_gate
  - invoke_superpowers
---

# GIS Implementation

## 共享工作流契约（强制）

- 执行本阶段前，必须读取 `../../references/workflow-contract.md` 并遵守其中的默认基线、全局约束和阶段门禁。
- 必须确认全部未跳过计划文档已完成、可执行且不存在 `TODO`、`TBD`、`待补充`；不满足时停止实现并提示使用 `gis-dev-workflow:gis-planning` 补齐。
- 本技能只执行实现阶段，不自动进入最终测试阶段。

## 约束（强制）

- 必须调用 `superpowers` 相关技能，可按需使用 `superpowers:using-superpowers`、`superpowers:test-driven-development`、`superpowers:subagent-driven-development`、`superpowers:executing-plans`、`superpowers:requesting-code-review`。
- 除非用户明确覆盖，必须采用 `../../references/workflow-contract.md` 规定的项目默认基线。
- 实现过程必须遵守 `../../references/vue3-conventions.md` 的强制开发规约。
- 实现过程必须遵守 `../../references/gis-architecture.md` 的五层职责、模块依赖矩阵和严禁事项。
- 实现过程必须遵守 `../../references/gis-coord-system.md` 的坐标系责任分工。
- 实现过程必须遵守 `../../references/gis-business-scenarios.md` 的 5 个核心场景 AC。
- 实现过程必须遵守 `../../references/gis-performance-sla.md` 的 SLA 指标。
- 实现过程必须遵守 `../../references/gis-controller-patterns.md` 的 DTO 拼装模式。
- 实现过程必须遵守 `../../references/gis-state-machines.md` 的状态机定义。
- 实现过程必须遵守 `../../references/component-usage.md` 的通用组件复用规则；新增通用能力前必须先查阅本表。
- `references/*` 后续新增的任意规约自动成为对应实现步骤的强制输入和门禁。
- 实现过程命名必须遵循驼峰规则。
- 实现过程必须按照生产级别推进，严禁裁剪。
- 实现过程中需要路径算路、坐标转换、抽稀、空间算法等通用基础能力时，必须先检查 `../../references/component-usage.md`，确认是否有对应 composable、Worker、函数；若已有，优先复用，禁止在业务代码中重复实现。只有确认组件不存在、能力不满足或用户/设计明确要求时，才可自研或引入其他方案，并在实现交接说明中记录原因。
- 实现状态机相关代码前，必须检查 `references/gis-state-machines.md` 是否已经覆盖所有业务流；如未覆盖，先增补状态机定义。
- 当 `references/gis-state-machines.md` 未变化时，可以跳过状态机实现；不得跳过领域建模实现、聚合行为实现或其他非状态机实现。
- 只有当前步骤测试通过后才能进入下一步。

## 参考文件加载

- 需要五层架构时，读取 `../../references/gis-architecture.md`。
- 需要协议契约时，读取 `../../references/gis-coord-system.md`（坐标系）。
- 需要控制层 DTO 拼装模式时，读取 `../../references/gis-controller-patterns.md`。
- 需要业务场景 AC 时，读取 `../../references/gis-business-scenarios.md`。
- 需要性能 SLA 时，读取 `../../references/gis-performance-sla.md`。
- 需要状态机定义时，读取 `../../references/gis-state-machines.md`。
- 需要开发规约时，读取 `../../references/vue3-conventions.md`。
- 需要通用组件复用时，读取 `../../references/component-usage.md`。
- 进入实现阶段或编写任一层级代码前，必须读取 `../../references/workflow-contract.md`。
- 只在当前实现步骤需要时读取参考文件，禁止一次性加载全部参考资料。

## 注释

- 业务控制层 class、通用控制层 class、composable、Pinia store、关键 controller 方法必须有中文 JSDoc 注释，说明业务意图、不变量约束、所属分层。
- 关键业务行为方法必须注释：业务意图、领域规则、不变量约束、调用前置条件、状态变化（如存在）。
- 状态机转移方法必须注释：触发事件、业务含义、状态变化。
- 复杂业务判断、业务规则、异常处理必须注释业务依据。
- 接口、DTO、枚举必须注释含义，方便团队理解。
- 测试类、测试类方法、关键测试逻辑必须注释。
- 所有注释使用中文，简洁、专业、不冗余。

## 五层架构实现

- 输入：
  - `docs/plan/00-五层架构计划.md`
  - `docs/design/00-五层架构设计.md`
- 要求：仅搭建工程骨架，不写业务代码。
- 输出：五层工程骨架（package.json、tsconfig.json、vite.config.ts、目录结构、Pinia store 骨架、composable 骨架、controller 骨架）。

## 协议层实现

- 输入：
  - `docs/plan/01-协议层计划.md`
  - `docs/design/01-协议层设计.md`
- 要求：
  - 实现 `BusinessProtocol.ts`、`GenericProtocol.ts`、`IOProtocol.ts` 的 DTO 类型。
  - 实现 `MessageStore` / `gisBridge` 统一信封解析与派发（纯函数 + 类型守卫）。
  - 实现坐标字段 WGS84 强校验。
  - TDD 必须覆盖所有协议事件。
  - 协议解析方法必须单元可测。
- 输出：协议层代码与测试。

## 计算层实现

- 输入：
  - `docs/plan/02-计算层计划.md`
  - `docs/design/02-计算层设计.md`
- 要求：
  - 实现所有 composable（纯函数 + 可注入）。
  - 实现 `coordTransform.ts` 全部转换函数。
  - 实现所有 Worker（基于 Worker + Transferable Objects）。
  - TDD 必须覆盖所有计算函数。
  - 计算函数必须有性能基准测试（vitest bench）。
  - 不得持有 DOM/Map/Scene 引用。
- 输出：计算层代码与测试。

## 业务控制层实现

- 输入：
  - `docs/plan/03-控制层计划.md`
  - `docs/design/03-控制层设计.md`
  - `references/gis-controller-patterns.md`
  - `references/gis-state-machines.md`
- 要求：
  - 实现 6 个业务控制层 class：AlarmController、CallController、ConfigController、DispatchController、DutyController、TrackingController。
  - 每个方法都接收 `BusinessProtocol` 类型入参，调用通用控制层 DTO。
  - 实现业务状态机（持状态 + 转移方法 + mitt 事件广播）。
  - TDD 必须覆盖所有业务规则与状态机合法/非法转移。
  - 业务控制层禁止直接调用 OL/ThreeJS API。
  - 业务控制层禁止持有地图或画布引用。
  - 业务控制层方法必须以"业务动词 + 业务名词"命名。
  - 单元可测：构造函数注入 `genericController` mock。
- 输出：业务控制层代码与测试。

## 通用控制层实现

- 输入：
  - `docs/plan/03-控制层计划.md`
  - `docs/design/03-控制层设计.md`
  - `references/gis-controller-patterns.md`
- 要求：
  - 实现 4 个通用控制层 class：GeometryController、KinematicController、SpatialController、ViewController。
  - 每个方法都接收 `GenericProtocol` 类型入参。
  - Auto-Fit 必须使用 `view.fit(extent, { padding: [0.1, 0.1, 0.1, 0.1] })`；不得贴边。
  - 通用控制层禁止读业务 store，只允许读 `useMapStore`、`useLayersStore`。
  - 通用控制层方法必须幂等。
  - 通用控制层方法必须单元可测（注入 store mock）。
- 输出：通用控制层代码与测试。

## IO 控制层实现

- 输入：
  - `docs/plan/03-控制层计划.md`
  - `docs/design/03-控制层设计.md`
- 要求：
  - 实现 `InputController`（视图事件 → IO 协议）。
  - 实现 `OutputController`（通用控制层结果 → 视图回写）。
  - 不得参与业务流转。
- 输出：IO 控制层代码与测试。

## 渲染层实现

- 输入：
  - `docs/plan/04-渲染层计划.md`
  - `docs/design/04-渲染层设计.md`
  - `references/component-usage.md`
- 要求：
  - 实现 OpenLayers 渲染层组件。
  - 实现 ThreeJS 渲染层组件。
  - 实现 amap 渲染层组件。
  - 实现所有通用组件（`baseComponent/`）。
  - 实现所有视图 store（`useMapStore`、`useLayersStore` 等）。
  - 组件只通过 Pinia store 与 composable 获取图元。
  - 组件必须使用 `defineOptions({ name })` 声明组件名。
  - 组件 props 必须显式声明类型与默认值。
  - 渲染图层必须使用业务前缀命名。
  - 渲染层禁止进行空间计算。
- 输出：渲染层代码与测试。

## 状态机实现（条件性）

- 输入：
  - `docs/plan/05-状态机计划.md`（仅在存在时）
  - `docs/design/05-状态机设计.md`（仅在存在时）
  - `references/gis-state-machines.md`
- 规则：当 `docs/plan/05-状态机计划.md` 缺失时，跳过本步骤。
- 要求：
  - 在业务控制层 class 内置状态机。
  - TDD 必须覆盖所有合法与非法转移。
  - 状态机必须与业务逻辑解耦。
  - 状态变化通过 mitt 事件广播。
- 输出：状态机代码与测试。

## 整体实现

- 输入：
  - `docs/plan/06-整体计划.md`
  - `docs/design/06-整体设计.md`
- 要求：
  - 将五层全部集成起来，使系统可以正常工作。
  - 完成整体端到端测试（5 个核心场景）。
  - 性能 SLA 验证（`references/gis-performance-sla.md`）使用 Playwright/Headless Chrome + Performance API。
  - 当测试要使用真实地图引擎时，可以选择使用 mock 服务或地图数据回放。
  - 存在状态机时，状态机能正常工作。
- 输出：整体可用代码。

## 门禁

- 每个实现步骤必须先有失败测试，再写生产代码。
- 每个实现步骤必须测试通过后才能进入下一步。
- 每个实现步骤必须检查 `references/*` 中适用于当前层级、对象或主题的规则，并通过代码、依赖和测试验证落地。
- 当前 `references/vue3-conventions.md` 已定义的通用规约必须在实现中验证：ESLint + Prettier 通过、TypeScript strict 通过、Vitest 覆盖率 ≥ 80%、业务 ID 前缀命名一致、Auto-Fit Padding ≥ 0.10。
- 当前 `references/gis-controller-patterns.md` 已定义的 DTO 拼装模式必须在实现中验证：业务控制层与通用控制层 DTO 严格分离、单元可测。
- 当前 `references/gis-state-machines.md` 已定义的状态机必须在实现中验证：所有合法/非法转移都有测试。
- 当前 `references/gis-business-scenarios.md` 已定义的 5 个核心场景 AC 必须在实现中验证：每个场景都有端到端测试覆盖。
- 当前 `references/gis-performance-sla.md` 已定义的 SLA 必须在实现中验证：基准测试覆盖关键计算函数。
- 因缺少状态机计划而按规则跳过的状态机实现不计入计划内未完成项，但必须在实现交接说明中记录跳过依据。
- 用户选择 `gis-dev-workflow:gis-test` 前，必须完成所有计划内实现项，并保留测试命令与结果。
