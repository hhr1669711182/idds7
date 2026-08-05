# GIS 前端分阶段开发契约

## 使用方式

- 由用户显式选择当前阶段技能，不设置总控技能，也不自动切换阶段。
- 核心阶段顺序为：分析 → 设计 → 计划 → 实现 → 测试。
- 每个阶段先检查自己的输入和前置门禁；不满足时停止当前阶段并说明缺失项，不得代替用户跨过确认点。
- 每次只加载当前阶段技能及其所需参考资料，禁止一次性加载全部阶段技能和参考资料。

## 项目默认基线

除非用户明确覆盖，否则统一使用以下技术基线：

| 类别 | 默认值 |
| --- | --- |
| 框架 | Vue 3.5+ |
| 语言 | TypeScript 6.0+（`strict: true`） |
| 构建 | Vite 8+ / pnpm |
| 状态管理 | Pinia 3+ |
| UI 库 | Element Plus 2.13+ |
| 地图 | OpenLayers 10.2+ / ol-ext 4.0+ |
| 3D | ThreeJS 0.169+ |
| 空间计算 | @turf/turf 7.1+ |
| 测试 | Vitest 2+ / @vue/test-utils 2+ |
| 端到端 | 不在五阶段范围内 |
| 跨线程 | Web Worker + Transferable Objects |

`superpowers:brainstorming` 只确认业务目标、业务边界、业务规则、异常场景、成功标准和用户验收口径；技术基线仅在用户明确要求覆盖时调整。

## 全局约束

- 全部阶段按生产级推进，不按 MVP 裁剪。
- 严格遵循五层架构：`Service → Protocol → Calc → Ctrl → Render`。
- 业务控制层与通用控制层必须切分清晰：业务控制层只组装通用控制层 DTO，禁止直接调用 OL/ThreeJS API；通用控制层只执行图形指令，禁止承载业务规则或持有业务状态。
- 协议层与服务层统一 WGS84（`[longitude, latitude]`），进入渲染层前由底座插件负责转换。
- Auto-Fit 必须保留 10%~15% 视距留边（Padding），不得贴边。
- 业务图元 ID 必须加业务前缀（`marker_`、`polygon_`、`line_`、`cluster_`），命名必须出现在 `references/gis-architecture.md` 的 Layer IDs 清单。
- 设计、计划、实现阶段必须读取并遵守 `references/vue3-conventions.md`、`references/gis-architecture.md`、`references/gis-coord-system.md`、`references/gis-business-scenarios.md`、`references/gis-performance-sla.md`；必须把适用于当前层级的规则显式落地到产物、代码和测试，不得只做引用。
- 状态机产物由 `mds/minmax_output/05-核心场景端到端流程与渲染实现.md` 与业务控制层共同决定；新增业务流必须先在 `references/gis-state-machines.md` 中增补状态机定义，再进入实现。
- 每个阶段必须完成对应产物并通过自身门禁，才允许用户选择下一阶段。
- 任何共享规则或阶段衔接说明都不得绕过阶段技能自身定义的输入、输出、约束和验收标准。

## 阶段前置条件与产物

| 阶段技能 | 前置条件 | 主要产物 |
| --- | --- | --- |
| `gis-analysis` | `mds/**` 中存在可分析的产品资料与架构文档 | `docs/analysis/01-五层索引目录.md` |
| `gis-design` | 分析产物存在且已由用户审阅 | `docs/design/**` |
| `gis-planning` | 设计方向已确认，设计文档已落盘并经用户最终审阅 | `docs/plan/**` |
| `gis-implementation` | 全部未跳过的计划已完成且可执行 | Vue 3 / TypeScript 工程代码和测试证据 |
| `gis-test` | 计划内实现已完成，并保留实现阶段测试结果 | 测试结果、缺陷修复记录、性能 SLA 报告和最终验收说明 |

## 设计阶段人工门禁

- 编写任何设计文档前，业务问题必须使用 `superpowers:brainstorming` 完成至少一轮澄清问答，比较 2~3 个候选方案，明确推荐方案，并取得用户对设计方向的确认。
- 技术栈、五层架构、协议契约、坐标系责任、控制层切分、命名规范、文档结构等非业务问题直接采用本文件或对应 `references/*` 规定，不进入 brainstorming。
- 全部设计文档落盘后，必须由用户完成最终审阅确认，才允许进入计划阶段。
- 设计文档必须保留 brainstorming 关键决策、用户确认结论和待确认项，确保设计过程可审计。
- 任一门禁缺失时，禁止进入计划、实现或测试阶段；应回到设计阶段补齐。

## 与 superpowers 的协作

- `superpowers:brainstorming`：用于设计阶段的业务问题确认。
- `superpowers:writing-plans`：用于计划阶段产出可执行计划。
- `superpowers:test-driven-development`：用于实现阶段的 TDD 循环。
- `superpowers:subagent-driven-development`：用于多文件、跨层实现的并行推进。
- `superpowers:verification-before-completion`：用于测试阶段的"完成前必须验证"门禁。
- `superpowers:requesting-code-review` / `receiving-code-review`：用于实现完成后的内部审阅。
