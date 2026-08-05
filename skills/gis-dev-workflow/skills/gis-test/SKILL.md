---
name: gis-test
description: Use when GIS Vue 3 + TypeScript + OpenLayers/ThreeJS implementation is complete and final acceptance evidence (unit/E2E/perf) must be produced.
stage: 5
stage_name: 测试
compatible_agents:
  - codex
  - hermes
  - claude-code
  - cursor
  - trae
prerequisites:
  - gis-implementation
entry_command: $gis-dev-workflow:gis-test
superpowers_skills:
  - superpowers:verification-before-completion
  - superpowers:requesting-code-review
gate:
  type: multi-gate
  coverage:
    threshold: 80
  scenario_ac:
    scenarios:
      - duty
      - incoming-call
      - inquiry
      - dispatch
      - tracking
  performance_sla:
    frame_rate: ">= 30fps (P95)"
    call_popup_latency: "<= 500ms"
    route_planning: "<= 1s (P95)"
  comprehensive_score:
    threshold: 80
    rubric: docs/source/10-前端实现完整度评分规则.md
  artifact: tests/report/final-acceptance.md
timeout_seconds: 172800
tools_required:
  - read_documentation
  - write_stage_artifact
  - run_quality_gate
  - invoke_superpowers
---

# GIS Test

## 共享工作流契约（强制）

- 执行本阶段前，必须读取 `../../references/workflow-contract.md` 并遵守其中的默认基线、全局约束和阶段门禁。
- 必须确认实现阶段的全部未跳过计划都已完成；不满足时停止测试并提示使用 `gis-dev-workflow:gis-implementation` 补齐。
- 本技能只执行测试阶段，不自动交付生产。

## 约束（强制）

- 必须调用 `superpowers:verification-before-completion` 完成最终验收。
- 除非用户明确覆盖，必须采用 `../../references/workflow-contract.md` 规定的项目默认基线。
- 测试过程必须遵守 `../../references/vue3-conventions.md` 的强制开发规约。
- 测试过程必须遵守 `../../references/gis-architecture.md` 的五层职责、模块依赖矩阵和严禁事项。
- 测试过程必须遵守 `../../references/gis-coord-system.md` 的坐标系责任分工。
- 测试过程必须遵守 `../../references/gis-business-scenarios.md` 的 5 个核心场景 AC。
- 测试过程必须遵守 `../../references/gis-performance-sla.md` 的 SLA 指标。
- 测试过程必须遵守 `../../references/gis-controller-patterns.md` 的 DTO 拼装模式。
- 测试过程必须遵守 `../../references/gis-state-machines.md` 的状态机定义。
- `references/*` 后续新增的任意规约自动成为对应测试步骤的强制输入和门禁。
- 缺陷修复必须先添加能复现缺陷的失败测试，再修复并执行回归。
- 不得对性能 SLA 妥协以完成交付；SLA 不达标时记录现象与原因，由用户决定是否继续。
- 跨基线（vendor chunk、首屏 payload）的优化必须以数据支撑（before/after 体积表）。

## 测试范围

### 1. 单元测试
- 范围：composable、store、controller、协议解析、坐标系转换、空间算法纯函数、Worker 抽稀。
- 工具：Vitest 2+。
- 覆盖率要求：≥ 80%（`references/vue3-conventions.md` 第 9 节）。
- 命名：使用中文 `describe` / `it`。
- 关键测试逻辑必须有中文注释。

### 2. 组件测试
- 范围：OpenLayers 组件、ThreeJS 组件、amap 组件、通用 UI 组件。
- 工具：@vue/test-utils 2+ + Vitest 2+。
- 至少覆盖：props 渲染、emits 触发、slots 渲染、store 响应。

### 3. 端到端测试
- 范围：5 个核心场景（值守、来电、问询、调派、跟踪）。
- 工具：Playwright + Headless Chrome。
- 覆盖：
  - 路由进入、场景切换。
  - 协议事件触发的渲染结果。
  - 业务控制层 → 通用控制层 → 渲染层的完整链路。
  - 业务状态机转移。
  - 临时图元清理（按业务前缀匹配）。
  - 场景切换时 store `reset()` 行为。
- 当测试要使用真实地图引擎时，可以选择使用 mock 服务或地图数据回放。

### 4. 性能 SLA 验证
- 范围：`../../references/gis-performance-sla.md` 全部指标。
- 工具：
  - Vitest `bench` 用于关键计算函数（坐标系转换、抽稀、算路）。
  - Playwright + `page.evaluate(performance.now())` 用于端到端性能数据。
- 产物：`tests/perf/report.json` 与性能报告。

### 5. 静态检查
- ESLint 通过（`pnpm lint`）。
- TypeScript strict 通过（`pnpm type-check`）。
- Prettier 格式检查通过。
- 包体积检查（`pnpm build` 后 `gzip -c`）。

## 验收标准

1. **覆盖率**：composable、store、controller、纯函数覆盖率 ≥ 80%。
2. **场景 AC**：5 个核心场景 AC 全部通过（`references/gis-business-scenarios.md`）。
3. **SLA**：性能 SLA 全部达标（`references/gis-performance-sla.md`）。
4. **回归**：所有缺陷修复都有对应回归测试。
5. **静态检查**：ESLint、TypeScript、Prettier 全部通过。
6. **状态机**：合法与非法转移全部有测试（`references/gis-state-machines.md`）。
7. **架构合规**：严禁事项清单无违反（`references/gis-architecture.md` 第 6 节）。
8. **坐标系合规**：WGS84 责任分工无违反（`references/gis-coord-system.md`）。
9. **DTO 合规**：业务控制层与通用控制层 DTO 严格分离（`references/gis-controller-patterns.md`）。

## 测试报告

生成 `tests/report/final-acceptance.md`，包含：

1. 测试环境（Node、pnpm、浏览器版本、机器配置）。
2. 测试命令与结果（含 `pnpm test`、`pnpm bench`、`pnpm lint`、`pnpm type-check`、`pnpm build`）。
3. 覆盖率报告（composable、store、controller、纯函数四档）。
4. 5 个核心场景 AC 通过证据（截图、E2E 脚本、性能数据）。
5. 性能 SLA 通过证据（`tests/perf/report.json` + 解读）。
6. 缺陷与回归记录。
7. 架构合规自检（严禁事项清单逐条勾选）。
8. 坐标系与 DTO 合规自检。
9. 风险与未覆盖项。
10. 最终验收结论（通过 / 不通过 / 有条件通过）。

## 门禁

- 任何 SLA 不达标时，先记录现象与可复现步骤，禁止"先合并后修复"。
- 缺陷修复必须先添加能复现缺陷的失败测试，再修复并执行回归。
- 修复后必须重新跑全套性能测试并对比基线。
- 跨基线（vendor chunk、首屏 payload）的优化必须以数据支撑（before/after 体积表）。
- `superpowers:verification-before-completion` 报告未生成前禁止宣称完成。
