---
name: handover-doc
description: Use when a Vue 3 + TypeScript + OpenLayers/ThreeJS GIS frontend repository must be summarized into a structured handover document for new team members, SRE/DevOps, or architecture review.
stage: companion
stage_name: 项目交接
compatible_agents:
  - codex
  - hermes
  - claude-code
  - cursor
  - trae
prerequisites: []
entry_command: $gis-dev-workflow:handover-doc
callable_after_any_stage: true
gate:
  type: artifact-with-review
  artifact: docs/handover/<project-name>-交接文档.md
  review: user
  sanitization:
    - mask_secrets
    - mark_unknown_as_待确认
tools_required:
  - read_documentation
  - write_stage_artifact
---

# Handover Doc

## 共享工作流契约（强制）

- 执行本技能前，必须读取 `../../references/workflow-contract.md` 并遵守其中的默认基线、全局约束。
- 本技能是配套技能，不属于五阶段，可以独立调用。

## 目标

基于仓库事实（`README.md`、`package.json`、`mds/**`、`src/controller/**`、`tests/**`、`references/*`）生成一份结构化的项目交接文档。输出到 `docs/handover/<project-name>-交接文档.md`。如果用户明确指定路径，以用户指定路径为准。

## 模板

必须使用 `../../references/handover-template.md` 作为输出结构。

## 约束（强制）

- 文档内容必须基于仓库事实：可以引用源码、配置文件、测试报告，但不得臆测或编造不存在的能力。
- 终端输出含乱码时不要复制到文档；改用 UTF-8 读取或基于源码整理。
- 敏感信息（密码、令牌、地址、账号）必须脱敏或标 `待确认`。
- 推荐使用中文写项目介绍和风险说明。
- 第 1~9 节必须填写完整；无法从仓库确认的信息标 `待确认`。
- 第 10 节（风险与待确认）必须保留。
- 第 11 节（联系人）不知道时全部 `待确认`。
- 必须引用 references 中相关章节（链接到 `../../references/gis-architecture.md` 等）。
- 必须基于实际源码生成，不要无中生有。如果源代码与本技能预期不符，应当如实描述，并增加"风险与待确认"项说明。

## 信息收集步骤

1. **项目一句话介绍**：
   - 读取 `README.md` 第一段，提取项目目标与用户角色。
   - 若 `README.md` 缺失，读取 `package.json` 的 `name` 与 `description` 字段。

2. **技术栈与版本基线**：
   - 读取 `package.json` 的 `dependencies` 与 `devDependencies`。
   - 提取 Vue、TypeScript、Vite、Pinia、OpenLayers、ThreeJS、Vitest 等版本。
   - 列出 `references/workflow-contract.md` 的默认基线与实际版本差异（如有）。

3. **五层架构概览**：
   - 读取 `references/gis-architecture.md` 提炼 Mermaid 图。
   - 引用 `references/gis-architecture.md` 的分层职责表。

4. **推荐阅读路线**：
   - 基于 `src/controller/core/`、`src/store/`、`src/composables/`、`src/baseComponent/`、`src/components/`、`src/views/`、`src/plugins/mapPlugins/`、`src/router/` 的实际目录结构。
   - 引用 `references/component-usage.md`。

5. **5 个核心场景演示**：
   - 引用 `references/gis-business-scenarios.md`。
   - 列出每个场景的关键文件路径、关键控制器、关键 composable。

6. **关键命令**：
   - 读取 `package.json` 的 `scripts` 字段。
   - 列出 `pnpm install`、`pnpm dev`、`pnpm mock:server`、`pnpm build`、`pnpm lint`、`pnpm type-check`、`pnpm test`、`pnpm bench`、`pnpm preview` 等。
   - 若命令缺失，标 `待确认`。

7. **性能 SLA 速查**：
   - 引用 `references/gis-performance-sla.md` 的指标表格。

8. **资源图层 ID 速查**：
   - 引用 `references/gis-architecture.md` 第 4 节。

9. **状态机速查**：
   - 引用 `references/gis-state-machines.md`。

10. **风险与待确认**：
    - 基于仓库观察的潜在风险（如文档与代码不一致、测试覆盖不足、依赖版本偏离基线等）。
    - 列出所有需要用户进一步确认的事项。

11. **联系人**：
    - 全部 `待确认`（本技能无法自动从仓库识别）。

12. **附录**：
    - 五层架构整合文档路径。
    - 开发规约路径。
    - 工作流培训材料路径。
    - 业务协议事件清单路径。
    - 控制接口映射表路径。

## 门禁

- 输出文件存在且结构与模板一致。
- 所有引用 `references/*` 章节均可定位到实际文件。
- 第 1~9 节没有空白字段（无法确认的标 `待确认`）。
- 敏感信息已脱敏。
- 推荐阅读路线、关键命令、性能 SLA、资源图层 ID、状态机速查与仓库实际一致。
