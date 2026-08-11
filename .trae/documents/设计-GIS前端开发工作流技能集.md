# 设计 GIS 前端开发工作流技能集（gis-dev-workflow）

> 类型：Phase 3 — 计划生成
> 状态：草稿
> 创建时间：2026-07-16

## 1. 总结

仿照 `skills/20260717-培训材料-肖志威/ddd-dev-workflow`（Java 17 Spring Boot DDD/COLA 后端分阶段开发工作流）的设计思想，在同一目录层级新增 `gis-dev-workflow` 技能集，专门用于编排本仓库（`d:\work\telewave\ids\ids-gis-web`）前端 GIS 工程的"分析→设计→计划→实现→测试"五阶段开发。

技能集遵循以下原则：
- **基线对齐**：复用现有五层架构（Service → Protocol → Calc → Ctrl → Render）、控制层切分（业务控制层 + 通用控制层）、WGS84 坐标系责任分工、Auto-Fit Padding、业务 ID 前缀隔离等硬约束。
- **可分阶段独立调用**：每个阶段独立一个 SKILL.md，由用户显式选择，不设置总控。
- **门禁驱动**：每阶段都有强门禁；进入下一阶段前必须由用户完成审阅。
- **TDD 友好**：测试与实现解耦，测试先于代码。
- **配套文档**：自带培训材料与交接模板，可作为团队工作流规范。

## 2. 当前状态分析

### 2.1 现有技能盘点
| 目录 | 类型 | 用途 |
| --- | --- | --- |
| `skills/20260717-培训材料-肖志威/ddd-dev-workflow` | 后端开发工作流 | Java Spring Boot DDD/COLA 分阶段开发 |
| `.hermes/skills/*`（20 个） | 通用 superpowers 框架 | brainstorming、writing-plans、test-driven-development、verification-before-completion 等 |
| `skills/20260717-培训材料-肖志威/ids-command-center-client/docs/source` | 示例业务项目 | 用于培训演示 |
| `mds/minmax_output/*` | 架构设计文档 | GIS 前端五层架构整合版（v2.0，2026-07-14） |

### 2.2 项目工程特点
- 技术栈：Vue 3.5 + TypeScript 6.0 + Vite 8 + Pinia 3 + Element Plus 2.13
- 地图与渲染：OpenLayers 10.2、ThreeJS 0.169、ol-ext 4.0、@turf/turf 7.1
- 性能：Web Worker + Transferable Objects（路径算路 / 抽稀）
- 控制层组织（`src/controller/core/`）：
  - `business/`：AlarmController、CallController、ConfigController、DispatchController、DutyController、TrackingController
  - `generic/`：GeometryController、KinematicController、SpatialController、ViewController
  - `io/`：InputController、OutputController
  - `protocol/`：BusinessProtocol、GenericProtocol、IOProtocol
- 强约束：
  - 协议层与服务层统一 WGS84，进入渲染层前由底座插件负责转换。
  - Auto-Fit 需保留 10%~15% 视距留边。
  - 业务 ID 前缀隔离（`marker_`、`polygon_` 等）。
- SLA 指标：核心场景帧率 ≥ 30fps，车辆跟踪端到端延迟 ≤ 500ms，算路耗时 ≤ 1s。

### 2.3 现有 ddd-dev-workflow 可借鉴要素
- `.codex-plugin/plugin.json` 元数据格式
- `references/workflow-contract.md` 共享工作流契约
- `references/development-conventions.md` 强制开发规约
- `references/cola.md` 分层基线
- `references/component-usage.md` 通用组件复用指南
- 5 阶段 SKILL.md + 1 总培训材料
- 配套技能：handover-doc + intg-*

### 2.4 现有 ddd-dev-workflow 不能直接照搬之处
- 目标语言：Java → TypeScript / Vue 3 SFC / .ts
- 构建：Maven → pnpm / vite
- 分层：COLA（adapter/app/client/domain/infrastructure/start）→ 五层（Service/Protocol/Calc/Ctrl/Render）
- 持久化：Spring Data JDBC → 无（前端无持久化层；状态由 Pinia + LocalStorage 承担）
- 测试：JUnit 5 → Vitest + Vue Test Utils + @vue/test-utils
- 业务约束：状态机来自 `docs/source/**` → GIS 状态机来自 `mds/minmax_output/05-核心场景端到端流程与渲染实现.md`

## 3. 提议的变更

### 3.1 新增目录与文件清单

**根目录**：`d:\work\telewave\ids\ids-gis-web\skills\20260717-培训材料-肖志威\gis-dev-workflow\`

```text
gis-dev-workflow/
├── .codex-plugin/
│   └── plugin.json                            # 插件元数据
├── references/
│   ├── workflow-contract.md                   # 共享工作流契约（默认基线、阶段门禁、人工确认点）
│   ├── vue3-conventions.md                    # Vue3/TS/OL/ThreeJS 强制开发规约
│   ├── gis-architecture.md                    # 五层架构（Service→Protocol→Calc→Ctrl→Render）
│   ├── gis-coord-system.md                    # 坐标系与转换规范（WGS84 责任分工）
│   ├── gis-business-scenarios.md              # 5 个核心场景 AC（值守/来电/问询/调派/跟踪）
│   ├── gis-performance-sla.md                 # SLA 性能指标与验收标准
│   ├── gis-controller-patterns.md             # 业务控制层 / 通用控制层 DTO 拼装模式
│   ├── gis-state-machines.md                  # 警情 / 车辆 / 调派状态机定义
│   ├── component-usage.md                     # 通用组件、composable、worker 复用指南
│   └── handover-template.md                   # 交接文档模板
├── skills/
│   ├── gis-analysis/SKILL.md                  # 阶段 1：分析
│   ├── gis-design/SKILL.md                    # 阶段 2：设计
│   ├── gis-planning/SKILL.md                  # 阶段 3：计划
│   ├── gis-implementation/SKILL.md            # 阶段 4：实现
│   ├── gis-test/SKILL.md                      # 阶段 5：测试
│   └── handover-doc/SKILL.md                  # 配套：交接文档生成
└── gis-dev-workflow-技能使用培训.md            # 团队培训与操作手册
```

总计 18 个新文件（17 个 markdown + 1 个 json）。

### 3.2 插件元数据 `.codex-plugin/plugin.json`

参考 `ddd-dev-workflow/.codex-plugin/plugin.json` 的结构，修改以下字段：
- `name: gis-dev-workflow`
- `description: Vue 3 + TypeScript + OpenLayers/ThreeJS 前端 GIS 工程分阶段开发技能集`
- `keywords: ["vue3", "typescript", "openlayers", "threejs", "gis", "frontend"]`
- `interface.category: "Frontend"`
- `interface.defaultPrompt`：使用 3 条 gis-* 提示词
- `interface.longDescription`：强调五层架构、≥30fps、SLA 指标

### 3.3 共享契约 `references/workflow-contract.md`

核心内容：
- 5 阶段顺序：analysis → design → planning → implementation → test
- 默认技术基线：Vue 3.5+、TypeScript 6.0+、Vite 8+、Pinia 3+、OpenLayers 10+、ThreeJS 0.169+、Vitest 2+、@vue/test-utils 2+
- 全局约束：五层架构、坐标系责任、WGS84 强制、Auto-Fit 10-15% Padding、业务 ID 前缀、SLA 指标
- 阶段前置条件与产物表格
- 设计阶段两次人工确认门禁（设计方向确认 / 设计文档最终审阅）
- 与 superpowers 的协作：brainstorming 用于业务确认，writing-plans 用于计划，test-driven-development 用于实现

### 3.4 强制开发规约 `references/vue3-conventions.md`

内容（参考 ddd 的 `development-conventions.md` 风格做前端化）：
- 通用：所有 `.ts` 强制 ES Module 严格模式；命名驼峰；枚举与常量使用 `as const`；TypeScript `strict: true`
- 业务控制层：必须组合业务事件为通用控制层 DTO；禁止直接调用 OL/ThreeJS API
- 通用控制层：仅接收 DTO；禁止业务规则；只调用底层 `useMapStore` / `useLayersStore` / Worker
- 渲染层：只通过 Pinia store + composable 获取图元；禁止业务计算
- 协议层：必须使用统一信封（参考 `mds/minmax_output/01-协议层与后端I O契约.md`）；WGS84 强约束
- 渲染图层：必须加业务前缀（`marker_`、`polygon_`、`line_`）；命名必须出现在 `Layer IDs` 清单
- 测试：组件测试使用 Vue Test Utils；composable 使用 Vitest 单元测试；E2E 不在五阶段内
- 注释：所有公开 class / interface / composable / 关键业务方法必须有中文注释，说明业务意图与不变量

### 3.5 架构基线 `references/gis-architecture.md`

- 五层全局数据流图（Mermaid）
- 每层职责、输入、输出、禁止事项表格
- 控制层 DTO 拼装映射示例（参考 `mds/minmax_output/08-业务协议到通用控制指令的拼装映射与数据流转.md`）
- 业务控制层与通用控制层依赖方向
- 模块依赖矩阵（Pinia store 之间、composable 之间、controller 之间）
- 严禁事项清单：跨层调用、绕过 store 渲染、计算层持有 DOM/Map 引用

### 3.6 坐标系与转换规范 `references/gis-coord-system.md`

- 协议层 / 服务层：强约束 WGS84（[lng, lat]）
- 计算层：可消费任意坐标系，输出必须转回 WGS84
- 渲染层：底座插件负责 WGS84 → 视图坐标（OL 内部 / ThreeJS 内部）
- 转换函数清单（`coordTransform.ts` 的所有方法）
- 经纬度精度（保留 6 位小数 ≈ 0.1m）
- Auto-Fit Padding 计算公式

### 3.7 核心场景验收标准 `references/gis-business-scenarios.md`

5 个场景的 AC（参考 `mds/minmax_output/05-核心场景端到端流程与渲染实现.md`）：
- **值守**：默认 15 级缩放、辖区图层加载、警情分布
- **来电弹屏**：18 级缩放、500m 圈、自动 fit
- **问询研判**：微围栏聚焦、周边设施查询
- **图上调派**：四级围栏联动、车辆路径规划（Worker）
- **跟踪到场**：Zoom-in 微观视图、≥2fps GPS 推送

每个场景需定义：触发条件、协议事件、控制器动作、渲染结果、SLA 要求。

### 3.8 SLA 性能指标 `references/gis-performance-sla.md`

- 帧率：核心场景 ≥ 30fps
- 端到端延迟：车辆跟踪 ≤ 500ms
- 算路耗时：≤ 1s（Worker 异步）
- 协议解析：≤ 50ms
- 视野切换：≤ 200ms
- 打包体积预算：vendor chunk ≤ 2MB（gzipped）

### 3.9 控制器 DTO 拼装模式 `references/gis-controller-patterns.md`

- 业务协议事件 → 业务控制层方法 → 通用控制层 DTO
- 通用控制层 DTO → 通用控制层方法 → 渲染指令
- 拼装示例（基于 `AlarmController.syncAlarmProfile` 实际代码）
- 反模式：业务控制层直接调 OL API、通用控制层持有业务状态

### 3.10 状态机清单 `references/gis-state-machines.md`

- 警情状态机：`CREATED → DISPATCHED → ON_SCENE → CLOSED`
- 车辆状态机：`IDLE → DISPATCHED → EN_ROUTE → ON_SCENE → RETURNING → IDLE`
- 调派方案状态机
- 实现位置：业务控制层持有状态；通用控制层无状态

### 3.11 通用组件与复用指南 `references/component-usage.md`

- composables：`useMapStore`、`useLayersStore`、`useRouteMetricsWorker`、`useIncomingCallFeatures`、`useAlarmHotspot`、`useCarFeatures`
- 通用组件：`OpenlayersMap/`、`amap/`、`BIM/`、`map/MapTools/`
- 复用规则：优先使用 composable + store；新增通用能力前必须查阅本表
- Worker 使用规则：高频数据（GPS ≥2fps、轨迹 ≥30s/批）必须走 Worker + Transferable Objects

### 3.12 阶段 1：分析 `skills/gis-analysis/SKILL.md`

- 输入：`mds/minmax_output/**`（架构整合版）、`mds/external/map-message-events.md`（事件清单）、`src/controller/core/protocol/*Protocol.ts`（协议契约）
- 输出：`docs/analysis/01-分层索引目录.md`（五层索引：Service / Protocol / Calc / Ctrl / Render）
- 执行步骤：
  1. 扫描 `mds/**` 文档
  2. 按五层做相关性分析（强/中/弱）
  3. 为每份文档写明归属原因
- 门禁：进入 gis-design 前必须存在五层索引

### 3.13 阶段 2：设计 `skills/gis-design/SKILL.md`

- 输入：分析产物 + 五层架构基线 + 业务场景 AC + 协议契约
- 输出：
  - `docs/design/00-五层架构设计.md`
  - `docs/design/01-协议层设计.md`
  - `docs/design/02-计算层设计.md`
  - `docs/design/03-控制层设计.md`（业务 + 通用）
  - `docs/design/04-渲染层设计.md`
  - `docs/design/05-状态机设计.md`（仅在源文档存在时）
  - `docs/design/06-整体设计.md`（最后产出，含设计确认记录）
- 设计必须字段级：每个 DTO、interface、composable 都要字段说明
- 设计必须方法级：每个 controller 方法都要入参/出参/异常
- 必须使用 `superpowers:brainstorming` 完成业务确认
- 两次人工确认：设计方向、设计最终审阅

### 3.14 阶段 3：计划 `skills/gis-planning/SKILL.md`

- 输入：已审阅的设计文档
- 输出：
  - `docs/plan/00-五层架构计划.md`
  - `docs/plan/01-协议层计划.md`
  - `docs/plan/02-计算层计划.md`
  - `docs/plan/03-控制层计划.md`
  - `docs/plan/04-渲染层计划.md`
  - `docs/plan/05-状态机计划.md`（条件性）
  - `docs/plan/06-整体计划.md`
- 计划内容：文件路径、新增/修改清单、测试要求、验收标准
- 不允许 TODO/TBD/待补充
- 必须使用 `superpowers:writing-plans`

### 3.15 阶段 4：实现 `skills/gis-implementation/SKILL.md`

- 输入：完整计划 + 五层架构 + 开发规约
- 子步骤：
  1. 协议层（MessageStore / gisBridge）
  2. 计算层（SpatialController / RoutePlanner / Worker）
  3. 通用控制层（Geometry / Kinematic / Spatial / View）
  4. 业务控制层（Alarm / Call / Dispatch / Tracking / Duty / Config）
  5. 渲染层（OpenlayersMap / ThreeJS）
  6. 集成（main.ts 装配 / router 接入 / 状态初始化）
- 要求：
  - 严格 TDD：每个 composable / store / controller 方法先写失败测试
  - Vitest 单元测试 + Vue Test Utils 组件测试
  - 必须使用 `superpowers:test-driven-development`
  - 关键实现必须使用 `superpowers:subagent-driven-development` 并行
- 注释规范：业务意图、不变量、SLA 关联

### 3.16 阶段 5：测试 `skills/gis-test/SKILL.md`

- 范围：composable、store、controller、组件、Worker、协议解析、性能
- 工具：Vitest 覆盖率、Vue Test Utils、性能 Profiling
- 验收：
  - 单元测试覆盖率 ≥ 80%
  - 5 个核心场景 AC 全部通过
  - 性能 SLA 全部达标
  - 缺陷修复含回归测试
- 输出：测试报告、未覆盖风险、最终验收结论
- 必须使用 `superpowers:verification-before-completion`

### 3.17 配套：交接文档 `skills/handover-doc/SKILL.md`

- 输入：仓库事实（README、package.json、mds/**、src/controller/**、tests/**）
- 输出：`docs/handover/<project-name>-交接文档.md`
- 内容：项目介绍、技术栈、五层架构、阅读路线（按 control → store → composable → component）、5 场景演示、关键命令、性能 SLA、风险

### 3.18 培训材料 `gis-dev-workflow-技能使用培训.md`

参考 `ddd-dev-workflow-技能使用培训.md` 的 10 章结构：
1. 文档说明
2. 技能定位（适用 / 不适用 / 默认基线）
3. 技能依赖与使用前准备
4. 工作流总览（Mermaid）
5. 标准操作演示（5 阶段各 1 节）
6. 五层架构速查
7. 开发规约重点
8. 配套技能
9. 项目验收清单
10. 参考资料索引

## 4. 假设与决策

### 4.1 关键决策
| 决策点 | 选择 | 理由 |
| --- | --- | --- |
| Skill 形态 | 5 阶段 + 1 配套 + 1 培训 + 10 参考 | 与 ddd-dev-workflow 对齐，学习成本低 |
| 默认测试框架 | Vitest + Vue Test Utils | 与 Vite 原生集成、配置最简 |
| 状态机实现位置 | 业务控制层持有，状态机组件用 `xstate` 或自研 | 状态机属于业务流转，由业务控制层管理 |
| 业务控制层粒度 | 6 个已有 Controller + 1 个 ConfigController | 复用现有结构，不重构 |
| 通用控制层粒度 | 4 个已有 Controller（Geometry/Kinematic/Spatial/View） | 复用现有结构 |
| 是否引入总控技能 | 不引入 | 与 ddd-dev-workflow 一致，由用户显式选择阶段 |
| 是否覆盖 E2E | 不在五阶段内 | 性能 SLA 由单测 + 性能 Profiling 覆盖 |
| 是否覆盖 Worker | 覆盖（计算层子步骤） | 是 GIS 高频数据处理核心 |
| 是否覆盖 ThreeJS | 覆盖（渲染层子步骤） | 3D 模型评估是已有能力 |

### 4.2 不在范围内
- 实际执行 5 阶段产出（仅设计技能集本身）
- 改造现有 controller / store 代码
- 引入新的依赖（xstate、pinia-plugin-persistedstate 等已在 package.json 中的除外）
- 重构 `mds/minmax_output/**` 文档
- 适配器 / monorepo / 包发布配置

### 4.3 风险与缓解
| 风险 | 缓解 |
| --- | --- |
| 用户已习惯 ddd-dev-workflow 的命名规范 | 命名沿用 analysis/design/planning/implementation/test |
| Vue 3 生态变化快 | 版本基线只给下限，README 注明"以现有 package.json 为准" |
| superpowers 技能是英文 SKILL.md | gis-* 技能提供中文 SKILL.md，并通过 superpowers 引用 |
| 性能 SLA 验证成本高 | 在 gis-test 阶段用 mock + 基准测试，避免依赖真实地图引擎 |
| 与现有 mds 文档重复 | gis-* 技能只做流程编排，详细设计仍引用 mds 文档 |

## 5. 验证步骤

执行本计划后，验证方式：

1. **结构验证**：
   ```powershell
   Test-Path d:\work\telewave\ids\ids-gis-web\skills\20260717-培训材料-肖志威\gis-dev-workflow\.codex-plugin\plugin.json
   Get-ChildItem -Recurse d:\work\telewave\ids\ids-gis-web\skills\20260717-培训材料-肖志威\gis-dev-workflow -Filter *.md | Measure-Object
   ```
   预期：18 个 .md 文件 + 1 个 .json 文件

2. **可解析性验证**：
   - `plugin.json` 是合法 JSON
   - 每个 SKILL.md 包含 `name` / `description` frontmatter

3. **一致性验证**：
   - 每个 SKILL.md 引用 `references/workflow-contract.md`（共享契约）
   - gis-design / gis-planning / gis-implementation 显式引用对应 references
   - 5 阶段门禁与 ddd-dev-workflow 对齐

4. **培训材料验证**：
   - 培训材料包含 10 个一级章节
   - 每章有可执行示例

5. **入库验证**：
   - 提示词格式与 ddd-dev-workflow 一致：`使用 $gis-dev-workflow:gis-analysis ...`
   - plugin.json 的 defaultPrompt 提供 3 条默认提示词

## 6. 文件输出位置

所有文件输出到：
```
d:\work\telewave\ids\ids-gis-web\skills\20260717-培训材料-肖志威\gis-dev-workflow\
```

与现有 `ddd-dev-workflow/` 平级，方便 Codex CLI 一次性挂载两个工作流。
