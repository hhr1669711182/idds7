---
name: gis-planning
description: Use when approved GIS five-layer design documents must be turned into implementation plans before writing Vue 3 + TypeScript + OpenLayers/ThreeJS code.
stage: 3
stage_name: 计划
compatible_agents:
  - codex
  - hermes
  - claude-code
  - cursor
  - trae
prerequisites:
  - gis-design
entry_command: $gis-dev-workflow:gis-planning
superpowers_skill: superpowers:writing-plans
gate:
  type: plan-completeness
  artifacts:
    - docs/plan/00-计划总览.md
    - docs/plan/01-Service与Protocol层计划.md
    - docs/plan/02-Calc层计划.md
    - docs/plan/03-Ctrl业务控制层计划.md
    - docs/plan/04-Ctrl通用控制层计划.md
    - docs/plan/05-Ctrl-IO控制层与Render层计划.md
    - docs/plan/06-测试与验收计划.md
  forbidden_keywords:
    - TODO
    - TBD
    - 待补充
    - TBC
timeout_seconds: 172800
tools_required:
  - read_documentation
  - write_stage_artifact
  - invoke_superpowers
---

# GIS Planning

## 共享工作流契约（强制）

- 执行本阶段前，必须读取 `../../references/workflow-contract.md` 并遵守其中的默认基线、全局约束和阶段门禁。
- 必须确认设计方向已获用户确认、全部设计文档已落盘且用户已完成最终审阅；不满足时停止计划并提示使用 `gis-dev-workflow:gis-design` 补齐。
- 本技能只执行计划阶段，不自动进入实现阶段。

## 约束（强制）

- **REQUIRED SUB-SKILL:** Use `superpowers:writing-plans` to complete the implementation plan.
- 除非用户明确覆盖，必须采用 `../../references/workflow-contract.md` 规定的项目默认基线。
- 计划过程必须遵守 `../../references/vue3-conventions.md` 的强制开发规约；所有层级计划都必须包含适用规约的落地步骤和验收标准。
- 计划过程必须遵守 `../../references/gis-architecture.md` 的五层职责、模块依赖矩阵和严禁事项。
- 计划过程必须遵守 `../../references/gis-coord-system.md` 的坐标系责任分工。
- 计划过程必须遵守 `../../references/gis-business-scenarios.md` 的 5 个核心场景 AC。
- 计划过程必须遵守 `../../references/gis-performance-sla.md` 的 SLA 指标。
- 计划过程必须遵守 `../../references/gis-controller-patterns.md` 的 DTO 拼装模式。
- 计划过程必须遵守 `../../references/gis-state-machines.md` 的状态机定义。
- `references/*` 后续新增的任意规约自动成为对应计划文档的强制输入和门禁。
- 计划命名必须遵循驼峰规则。
- 计划过程必须按照生产级别推进，严禁裁剪。
- 编写状态机计划前，必须检查 `references/gis-state-machines.md` 是否已经覆盖所有业务流；如未覆盖，先增补状态机定义。
- 当状态机定义未变化时，可以跳过 `docs/plan/05-状态机计划.md`；不得跳过 `docs/plan/03-控制层计划.md` 或其他非状态机计划。
- 禁止在设计文档未完成用户最终审阅确认前进入本阶段。

## 参考文件加载

- 需要五层架构时，读取 `../../references/gis-architecture.md`。
- 需要协议契约时，读取 `../../references/gis-coord-system.md`（坐标系）和 `mds/minmax_output/01-协议层与后端I O契约.md`。
- 需要控制层 DTO 拼装模式时，读取 `../../references/gis-controller-patterns.md`。
- 需要业务场景 AC 时，读取 `../../references/gis-business-scenarios.md`。
- 需要性能 SLA 时，读取 `../../references/gis-performance-sla.md`。
- 需要状态机定义时，读取 `../../references/gis-state-machines.md`。
- 需要开发规约时，读取 `../../references/vue3-conventions.md`。
- 需要通用组件时，读取 `../../references/component-usage.md`。
- 进入计划阶段或编写任一计划文档前，必须读取 `../../references/workflow-contract.md`。
- 只在计划步骤需要时读取参考文件，禁止一次性加载全部参考资料。

## 计划产物

所有计划公共输入：

- `../../references/workflow-contract.md`
- `../../references/vue3-conventions.md`
- `../../references/gis-architecture.md`
- 当前计划对应的设计文档
- 当前计划对应的源文档、参考资料（如存在）

### 五层架构计划

- 输入：
  - `../../references/gis-architecture.md`
  - `docs/design/00-五层架构设计.md`
- 输出：
  - `docs/plan/00-五层架构计划.md`

### 协议层计划

- 输入：
  - `docs/design/01-协议层设计.md`
  - `docs/design/00-五层架构设计.md`
- 输出：
  - `docs/plan/01-协议层计划.md`

### 计算层计划

- 输入：
  - `docs/design/02-计算层设计.md`
  - `docs/design/00-五层架构设计.md`
- 输出：
  - `docs/plan/02-计算层计划.md`

### 控制层计划

- 输入：
  - `docs/design/03-控制层设计.md`
  - `docs/design/01-协议层设计.md`
  - `docs/design/02-计算层设计.md`
  - `docs/design/00-五层架构设计.md`
- 输出：
  - `docs/plan/03-控制层计划.md`

### 渲染层计划

- 输入：
  - `docs/design/04-渲染层设计.md`
  - `docs/design/03-控制层设计.md`
  - `docs/design/00-五层架构设计.md`
- 输出：
  - `docs/plan/04-渲染层计划.md`

### 状态机计划（条件性）

- 输入：
  - `docs/design/05-状态机设计.md`（仅在存在时）
  - `docs/design/03-控制层设计.md`
  - `references/gis-state-machines.md`
- 规则：当 `docs/design/05-状态机设计.md` 缺失时，跳过本步骤。
- 输出：
  - `docs/plan/05-状态机计划.md`

### 整体计划

- 输入：
  - `docs/design/06-整体设计.md`
- 输出：
  - `docs/plan/06-整体计划.md`

## 计划内容要求

每份计划至少要回答：

- 修改或新增哪些具体文件（含绝对路径或 `src/...` 相对路径）？
- 每一步落实哪条设计、规约与 SLA？
- 先编写哪个失败测试？
- 生产代码如何让测试转绿？
- 使用什么命令验证（`pnpm test`、`pnpm lint`、`pnpm type-check`）？
- 验收标准是什么（覆盖率、AC、SLA）？

## 计划评审检查项

- 每个计划都能追溯到对应设计文档。
- 文件范围、测试要求和验收标准明确。
- 没有 `TODO`、`TBD`、`待补充` 代替计划内容。
- 因缺少状态机设计而跳过的步骤已记录依据。
- 开发规约已经转换为具体实现和测试步骤。
- 性能 SLA 已转换为对应计算函数与 Worker 的测试步骤。
- 五层架构严禁事项已转换为代码审查检查项。
- 坐标系责任分工已转换为具体 import 限制。
- 业务控制层与通用控制层 DTO 拼装示例已包含在控制层计划中。

## 门禁

- 用户选择 `gis-dev-workflow:gis-implementation` 前，必须完成全部未跳过计划文档。
- 每个计划必须能追溯到对应设计文档。
- 每个计划必须包含可执行步骤、文件范围、测试要求和验收标准。
- 每个计划必须检查 `references/*` 中适用于当前层级、对象或主题的规则，并显式列出落地步骤与验收标准。
- 当前 `references/vue3-conventions.md` 已定义的通用规约必须在所有计划中落地：ESLint + Prettier、TypeScript strict、Vitest 单元测试覆盖率 ≥ 80%、业务 ID 前缀、Auto-Fit 10-15% Padding。
- 当前 `references/gis-controller-patterns.md` 已定义的 DTO 拼装模式必须在控制层计划中落地：业务控制层 → 通用控制层 DTO 拼装示例、单元可测性。
- 当前 `references/gis-state-machines.md` 已定义的状态机必须在控制层计划与状态机计划中落地：状态字段、转移事件、单元测试。
- 因缺少状态机设计而按规则跳过的状态机计划不计入"全部未跳过计划文档"，但必须在整体计划或交接说明中记录跳过依据。
- 不允许出现 `TODO`、`TBD`、`待补充` 作为计划内容。
