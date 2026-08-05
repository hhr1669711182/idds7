---
name: gis-design
description: Use when GIS five-layer analysis is complete and Vue 3 + TypeScript + OpenLayers/ThreeJS design documents must be created before implementation planning.
stage: 2
stage_name: 设计
compatible_agents:
  - codex
  - hermes
  - claude-code
  - cursor
  - trae
prerequisites:
  - gis-analysis
entry_command: $gis-dev-workflow:gis-design
superpowers_skill: superpowers:brainstorming
gate:
  type: design-review
  artifacts:
    - docs/design/00-设计总览.md
    - docs/design/01-业务域设计.md
    - docs/design/02-协议层设计.md
    - docs/design/03-控制层设计.md
    - docs/design/04-渲染层设计.md
    - docs/design/05-状态机设计.md
    - docs/design/06-异常与降级设计.md
  review: user
timeout_seconds: 432000
tools_required:
  - read_documentation
  - write_stage_artifact
  - invoke_superpowers
---

# GIS Design

## 共享工作流契约（强制）

- 执行本阶段前，必须读取 `../../references/workflow-contract.md` 并遵守其中的默认基线、全局约束和设计阶段人工门禁。
- 必须确认 `docs/analysis/01-五层索引目录.md` 存在且用户已完成审阅；不满足时停止设计并提示先使用 `gis-dev-workflow:gis-analysis`。
- 本技能只执行设计阶段，不自动进入计划阶段。

## Brainstorming 硬门禁（强制）

- 编写任何 `docs/design/*.md` 之前，业务问题必须先调用 `superpowers:brainstorming` 技能。
- `superpowers:brainstorming` 仅用于确认业务目标、业务边界、业务规则、异常场景、成功标准和用户验收口径。
- 非业务问题采用本技能或对应 references 推荐方案，不进入 brainstorming：Vue 3.5+、TypeScript 6.0+、Vite 8+、Pinia 3+、OpenLayers 10+、ThreeJS 0.169+、Vitest 2+、五层架构、WGS84 强约束、Auto-Fit 10-15% Padding、业务 ID 前缀隔离。
- 写入设计文档前，业务问题必须完整通过 `superpowers:brainstorming` 的前置关口：
  - 已完成澄清问答（至少一轮）。
  - 已提供 2~3 个可选方案并给出推荐。
  - 用户已明确确认设计方向。
- 写入全部设计文档后，必须让用户完成最终审阅确认，才允许用户选择 `gis-dev-workflow:gis-planning`。
- 若业务前置关口未满足：立即停止设计落盘，回到 `superpowers:brainstorming` 阶段补齐。

## 约束（强制）

- 使用 `superpowers:brainstorming` 完成业务问题确认；非业务问题直接采用本技能推荐方案。
- 除非用户明确覆盖，必须采用 `../../references/workflow-contract.md` 规定的项目默认基线。
- 设计过程必须遵守 `../../references/vue3-conventions.md` 的强制开发规约；所有层级设计产物都必须显式落地适用规约要求，不得只写"遵守开发规约"。
- 设计过程必须遵守 `../../references/gis-architecture.md` 的五层职责、模块依赖矩阵和严禁事项。
- 设计过程必须遵守 `../../references/gis-coord-system.md` 的坐标系责任分工。
- 设计过程必须遵守 `../../references/gis-business-scenarios.md` 的 5 个核心场景 AC。
- 设计过程必须遵守 `../../references/gis-performance-sla.md` 的 SLA 指标。
- 设计过程必须遵守 `../../references/gis-controller-patterns.md` 的 DTO 拼装模式。
- 设计过程必须遵守 `../../references/gis-state-machines.md` 的状态机定义。
- `references/*` 后续新增的任意规约自动成为对应设计文档的强制输入和门禁。
- 设计文档必须显式落地五层架构基线：模块职责、依赖矩阵、对象流转（业务 DTO / 通用 DTO / IO 事件）与命名规则。
- 设计命名必须遵循驼峰规则。
- 设计必须详细到字段级别：所有 DTO、interface、composable、store action、controller 方法都必须定义字段名、类型、必填性、业务含义、约束、来源/去向。
- 设计必须详细到方法级别：所有 controller 方法、composable 副作用、store action 都必须定义方法名、输入、输出、业务规则、异常/失败分支。
- 设计过程必须按照生产级别推进，严禁裁剪。
- 设计状态机相关产物前，必须检查 `mds/minmax_output/05-核心场景端到端流程与渲染实现.md` 与 `references/gis-state-machines.md` 是否已经覆盖所有业务流；如未覆盖，先增补状态机定义。
- 禁止跳过用户确认直接进入 planning 或 implementation。

## 参考文件加载

- 需要五层架构基线时，读取 `../../references/gis-architecture.md`。
- 需要协议契约时，读取 `../../references/gis-coord-system.md`（坐标系）和 `mds/minmax_output/01-协议层与后端I O契约.md`。
- 需要控制层 DTO 拼装模式时，读取 `../../references/gis-controller-patterns.md`。
- 需要业务场景 AC 时，读取 `../../references/gis-business-scenarios.md`。
- 需要性能 SLA 时，读取 `../../references/gis-performance-sla.md`。
- 需要状态机定义时，读取 `../../references/gis-state-machines.md`。
- 需要开发规约时，读取 `../../references/vue3-conventions.md`。
- 进入设计阶段或编写任一设计文档前，必须读取 `../../references/workflow-contract.md`。
- 只在对应设计小节需要时读取参考文件，禁止一次性加载全部参考资料。

## 产出顺序

按以下顺序产出设计文档：

1. `docs/design/00-五层架构设计.md`
2. `docs/design/01-协议层设计.md`
3. `docs/design/02-计算层设计.md`
4. `docs/design/03-控制层设计.md`（业务 + 通用 + IO）
5. `docs/design/04-渲染层设计.md`
6. `docs/design/05-状态机设计.md`（仅在新增业务流时产出）
7. `docs/design/06-整体设计.md`（最后产出，用于汇总前述设计）

## 五层架构设计

- 输入：
  - `../../references/gis-architecture.md`
  - `docs/analysis/01-五层索引目录.md`
- 输出：`docs/design/00-五层架构设计.md`
- 要求：
  - 必须包含五层蓝图：`Service / Protocol / Calc / Ctrl / Render`
  - 必须包含每层职责矩阵（输入、输出、允许依赖、禁止依赖）
  - 必须包含对象流转与模型归属：`BusinessDTO / GenericDTO / IODTO` 与 `composable / controller / store` 职责边界
  - 必须包含模块依赖矩阵（`package.json` 内依赖、Pinia store 之间、composable 之间、controller 之间）
  - 必须包含资源图层 ID 清单（参考 `references/gis-architecture.md` 第 4 节）
  - 必须包含严禁事项清单（参考 `references/gis-architecture.md` 第 6 节）

## 协议层设计

- 输入：
  - `mds/minmax_output/01-协议层与后端I O契约.md`
  - `src/controller/core/protocol/*` 现有文件
  - `docs/design/00-五层架构设计.md`
- 输出：`docs/design/01-协议层设计.md`
- 要求：
  - 必须包含 `MessageEnvelope<T>` 完整字段定义（`eventId`、`occurredAt`、`scene`、`payload`）。
  - 必须包含 `BusinessProtocol.ts`、`GenericProtocol.ts`、`IOProtocol.ts` 三个文件的字段级设计。
  - 必须包含坐标字段 WGS84 强约束。
  - 必须包含每个协议事件的业务含义、触发条件、消费方。
  - 业务控制层与通用控制层 DTO 必须严格分离（不允许共用类型）。
  - 必须包含协议解析方法（纯函数）的输入、输出、异常分支。

## 计算层设计

- 输入：
  - `mds/minmax_output/02-计算层与控制层I O契约.md`
  - `mds/minmax_output/06-坐标系统与转换规范.md`
  - `src/composables/`、`src/hooks/useRouteMetricsWorker.ts` 现有文件
  - `docs/design/00-五层架构设计.md`
- 输出：`docs/design/02-计算层设计.md`
- 要求：
  - 必须包含所有 composable 的字段级设计（参数、返回、副作用、缓存策略）。
  - 必须包含所有 Worker 的输入输出 Schema（含 Transferable Objects 传输协议）。
  - 必须包含坐标系转换函数（`coordTransform.ts`）的完整方法列表与边界条件。
  - 计算函数必须显式标注性能预算（`references/gis-performance-sla.md`）。
  - 计算层禁止持有 DOM/Map/Scene 引用，必须在设计中显式说明。
  - 必须包含空间算法（Turf buffer、intersect、union）的接口设计。

## 控制层设计

- 输入：
  - `mds/minmax_output/08-业务协议到通用控制指令的拼装映射与数据流转.md`
  - `mds/GIS整体设计/Controller层详细设计.md`
  - `src/controller/core/business/`、`src/controller/core/generic/`、`src/controller/core/io/` 现有文件
  - `docs/design/00-五层架构设计.md`
  - `docs/design/01-协议层设计.md`
  - `docs/design/02-计算层设计.md`
- 输出：`docs/design/03-控制层设计.md`
- 要求：
  - 必须覆盖 6 个业务控制层（Alarm / Call / Config / Dispatch / Duty / Tracking）的字段级 + 方法级设计。
  - 必须覆盖 4 个通用控制层（Geometry / Kinematic / Spatial / View）的字段级 + 方法级设计。
  - 必须覆盖 2 个 IO 控制层（Input / Output）的字段级 + 方法级设计。
  - 每个业务控制层方法必须给出：业务规则、状态机转移（如适用）、拼装的通用控制层 DTO。
  - 每个通用控制层方法必须给出：图形指令语义、幂等性、性能预算、依赖的 store 字段。
  - 业务控制层禁止直接调用 OL/ThreeJS API，必须在设计中显式说明通过 `genericController` 间接调用。
  - 通用控制层禁止读业务 store，必须在设计中显式说明。
  - 业务状态机设计必须参考 `references/gis-state-machines.md`。

## 渲染层设计

- 输入：
  - `mds/minmax_output/05-核心场景端到端流程与渲染实现.md`
  - `src/components/`、`src/baseComponent/`、`src/views/` 现有结构
  - `docs/design/00-五层架构设计.md`
  - `docs/design/03-控制层设计.md`
- 输出：`docs/design/04-渲染层设计.md`
- 要求：
  - 必须覆盖 OpenLayers 渲染层（`OpenlayersMap/`）。
  - 必须覆盖 ThreeJS 渲染层（`components/BIM/`、`views/modelAssess/`）。
  - 必须覆盖 amap 渲染层（`baseComponent/amap/`）。
  - 必须给出每个组件的 props、emits、slots 字段级定义。
  - 必须给出每个组件订阅的 Pinia store 字段。
  - 渲染层禁止进行空间计算，必须在设计中显式说明只做 store 监听与视觉呈现。
  - 必须包含资源图层 ID 命名规范（参考 `references/gis-architecture.md` 第 4 节）。
  - 必须包含 5 个核心场景的渲染结果（参考 `references/gis-business-scenarios.md`）。

## 状态机设计（条件性）

- 输入：
  - `references/gis-state-machines.md`
  - 业务控制层当前覆盖的所有业务流
- 规则：当 `references/gis-state-machines.md` 已覆盖所有业务流时，可以跳过本文件；不得跳过在 `03-控制层设计.md` 中的状态机描述。
- 输出：`docs/design/05-状态机设计.md`
- 要求：
  - 包含新增/调整的状态机定义（状态、转移、事件、业务规则）。
  - 每个状态机必须实现位置（业务控制层 + Pinia 字段）显式说明。
  - 必须包含状态机的可测试性设计（构造函数注入 store mock）。

## 整体设计

- 输入：`docs/design/**`
- 输出：`docs/design/06-整体设计.md`
- 要求：
  - 必须包含"设计确认记录"章节（`superpowers:brainstorming` 结论、用户确认结论与待确认项）。
  - 汇总五层职责边界与依赖方向。
  - 给出五层工程蓝图。
  - 给出对象流转链路：`BusinessProtocol → 业务控制层 → 通用控制层 DTO → 通用控制层 → Pinia → 渲染层`。
  - 给出 Vue 3 模块依赖矩阵（package.json 依赖 + 模块 import 关系），禁止循环依赖。
  - 覆盖 5 个核心场景 AC（`references/gis-business-scenarios.md`）。
  - 覆盖性能 SLA（`references/gis-performance-sla.md`）。
  - 覆盖坐标系责任（`references/gis-coord-system.md`）。
  - 覆盖状态机集成（`references/gis-state-machines.md`）。

## 门禁

- 用户选择 `gis-dev-workflow:gis-planning` 前，五层文档之间必须无职责冲突、无循环依赖。
- `BusinessProtocol` 与 `GenericProtocol` / `IOProtocol` 之间的字段映射必须可逐字段追踪。
- 5 个核心场景 AC 全部映射到具体的设计产物（controller 方法、composable、组件）。
- 性能 SLA 全部映射到具体的设计产物（计算函数、Worker、Pagination）。
- 状态机定义与业务控制层方法必须一一对应。
- 所有未决项（待确认）必须显式列出并编号。
- 所有设计文档必须达到字段级别与方法级别；若存在"字段待补充""对象略""映射略"等占位表达，禁止用户选择 `gis-dev-workflow:gis-planning`。
- 必须完成设计文档落盘后的用户最终审阅确认。
