# GIS 前端文档结构设计（参考 ids-command-center-client）

> 类型：结构设计
> 版本：v1.0
> 日期：2026-07-16
> 参考：`skills/20260717-培训材料-肖志威/ids-command-center-client/docs/source/**`

## 1. 背景

`ids-command-center-client` 已建立 12 份文档 + 1 份统一语言词典 + 1 份 DDL 的"产品需求 → DDD 设计"完整链路，是团队设计文档的事实标准。

GIS 前端工程目前散落在 `mds/**` 各子目录（`minmax_output`、`external`、`internal`、`dd`、`sy`、`GIS整体设计` 等），缺少与 `ids-command-center-client` 对齐的目录化结构。

本文参考 `ids-command-center-client` 的设计思想，将 GIS 前端文档组织为同构的 `docs/source/**` 结构，并把现有 `mds/**` 文档作为"输入资料库"映射到对应章节。

## 2. 设计原则

- **同构对齐**：与 `ids-command-center-client` 的 12 份文档一一对应，便于跨产品线一致体验。
- **前端化翻译**：后端 DDD 概念 → 前端对应概念（详见第 5 节映射表）。
- **零资料丢失**：现有 `mds/**` 文档全部映射到新结构，作为各章节的输入引用，不删除。
- **可分阶段落地**：与 `gis-dev-workflow` 五阶段技能对齐，每份新文档都有对应阶段产物。
- **可审计可追溯**：每份文档明确版本、日期、作者、变更说明。

## 3. 目标目录结构

```
d:\work\telewave\ids\ids-gis-web\docs\source\
├── 01-业务需求规格说明书.md
├── 02-产品定位.md
├── 03-业务流程图.md
├── 04-角色与权限矩阵.md
├── 05-五层架构领域模型设计.md
├── 06-模块边界与职责说明.md
├── 07-协议事件清单.md
├── 08-业务状态机定义.md
├── 09-前端业务逻辑设计.md
├── 10-前端实现完整度评分规则.md
├── 11-核心业务判断逻辑.md
├── 12-异常处理流程.md
├── 统一语言词典 — GIS前端(v1.0 完整版).md
└── 协议层DTO Schema.tsd
```

共 14 份文件（12 文档 + 1 词典 + 1 Schema）。

## 4. 各文档定位与对应来源

| 新文档 | 标题 | 与 ids-command-center-client 对应 | 主要输入（现有 mds） |
| --- | --- | --- | --- |
| 01 | 业务需求规格说明书 | 01-业务需求规格说明书 | `mds/minmax_output/05-核心场景端到端流程与渲染实现.md`、业务方对接资料 |
| 02 | 产品定位 | 02-产品定位 | `mds/dd/GIS前端总体架构纲要设计.md`、产品立项资料 |
| 03 | 业务流程图 | 03-业务流程图 | `mds/GIS整体设计/GIS完整业务流程图.md`、`mds/external/地图控制配置config.md` |
| 04 | 角色与权限矩阵 | 04-角色与权限矩阵 | 主前端 Host 接入文档、用户/角色配置中心 |
| 05 | 五层架构领域模型设计 | 05-DDD领域模型设计 | `mds/minmax_output/00-文档集索引与前言.md`、`mds/minmax_output/GIS前端数据交互与架构全景设计(整合版).md`、`mds/dd/GIS前端分层架构与复用设计.md`、`mds/GIS整体设计/GIS前端整体架构设计.md`、`mds/GIS整体设计/Controller层详细设计.md` |
| 06 | 模块边界与职责说明 | 06-聚合边界与职责说明 | `mds/minmax_output/01-协议层与后端I O契约.md`、`mds/minmax_output/02-计算层与控制层I O契约.md`、`mds/sy/GIS前端最终架构文档_v3.0.md` |
| 07 | 协议事件清单 | 07-领域事件清单 | `mds/external/map-message-events.md`、`mds/external/dispatch-message-events.md`、`mds/external/控制接口映射表-01.md`、`mds/GIS整体设计/前端协议对象服务清单.md`、`mds/GIS整体设计/消息协议数据字典.md` |
| 08 | 业务状态机定义 | 08-业务状态机定义 | `mds/minmax_output/05-核心场景端到端流程与渲染实现.md`、`mds/GIS整体设计/场景状态机定义.md` |
| 09 | 前端业务逻辑设计 | 09-业务逻辑设计 | `mds/minmax_output/08-业务协议到通用控制指令的拼装映射与数据流转.md`、`mds/GIS整体设计/Controller层详细设计.md` |
| 10 | 前端实现完整度评分规则 | 10-完整度评分规则 | 团队内部规约、`gis-dev-workflow/references/gis-business-scenarios.md` |
| 11 | 核心业务判断逻辑 | 11-核心判断逻辑 | `mds/minmax_output/08-业务协议到通用控制指令的拼装映射与数据流转.md` |
| 12 | 异常处理流程 | 12-异常处理流程 | `mds/external/GIS功能缝合.md`、SRE 故障手册 |
| — | 统一语言词典 — GIS 前端（v1.0 完整版） | 统一语言词典 | `mds/GIS整体设计/消息协议数据字典.md`、`mds/minmax_output/04-各阶段业务ER关系与字段字典.md` |
| — | 协议层 DTO Schema.tsd | 表结构.ddl | `mds/minmax_output/01-协议层与后端I O契约.md`、现有 `src/controller/core/protocol/*.ts` |

## 5. 后端 DDD → 前端概念映射

| 后端 DDD 概念 | GIS 前端对应概念 | 落地位置 |
| --- | --- | --- |
| 聚合根 | 业务控制层 class | `src/controller/core/business/*.ts` |
| 实体（Entity） | Pinia store state + 业务类 | `src/store/useDispatchStore.ts` 等 |
| 值对象（Value Object） | TypeScript type / interface | `src/types/*`、`src/controller/core/protocol/*` |
| 仓储（Repository） | Service 层 | `src/service/*` |
| 领域事件（Domain Event） | 协议事件 `MessageEnvelope<T>` | `src/controller/core/protocol/BusinessProtocol.ts` |
| 领域服务（Domain Service） | 计算层 composable | `src/composables/*` |
| 应用服务（Application Service） | 业务控制层方法 | `src/controller/core/business/*Controller.ts` |
| 防腐层（Anti-Corruption Layer） | 通用控制层 + 底座插件 | `src/controller/core/generic/*`、`src/plugins/mapPlugins/*` |
| 上下文映射（Context Map） | 五层数据流转图 | `mds/minmax_output/03-综合数据流转关系图.md` |
| 限界上下文（Bounded Context） | 业务控制层（每 Controller 一上下文） | `src/controller/core/business/*` |
| 不变量（Invariant） | `protectInvariants()`（业务控制层方法） | `src/controller/core/business/*` |
| 单元测试 | Vitest 单元测试 | `tests/**/*.test.ts` |
| 集成测试 | Playwright E2E | `e2e/**` |
| 性能 SLA | `references/gis-performance-sla.md` | `skills/.../references/` |
| 状态机 | 业务控制层内置状态机 | `src/controller/core/business/*` |
| 数据字典 | 统一语言词典 + 协议层 DTO Schema | `docs/source/统一语言词典*.md`、`协议层DTO Schema.tsd` |
| 建表 DDL | TypeScript Schema（type + interface） | `src/types/*` |

## 6. 各文档章节结构（对照 ids-command-center-client）

### 6.1 01-业务需求规格说明书

- 项目代号、版本、日期
- 业务背景与目标
- 用户角色
- 功能需求清单（含：5 个核心场景）
- 非功能需求（性能 SLA、可用性、安全、可维护性）
- 验收标准
- 假设与依赖
- 范围边界
- 风险与缓解

### 6.2 02-产品定位

- 产品一句话定位
- 目标用户
- 核心价值
- 与主前端 Host 的关系
- 差异化能力（vs 独立部署 vs 嵌入主前端）
- 商业模式与运营模式
- 迭代路线

### 6.3 03-业务流程图

- 5 个核心场景流程（值守 / 来电 / 问询 / 调派 / 跟踪）
- 子流程（警情接入、调派协商、围栏切换、GPS 接入）
- 跨端流程（Host → GIS iframe 协作）
- 异常流（GPS 失联、Worker 崩溃、CTI 断连）
- Mermaid 流程图

### 6.4 04-角色与权限矩阵

- 角色列表（接警员、调度员、值班长、班长、运维、巡检）
- 角色 → 业务控制层方法 → 通用控制层动作矩阵
- 角色 → 视图操作矩阵
- 角色 → 数据权限矩阵
- 角色 → 协议事件订阅矩阵

### 6.5 05-五层架构领域模型设计

- 五层架构图（Service / Protocol / Calc / Ctrl / Render）
- 五层职责表
- 模块依赖矩阵
- 业务控制层领域模型（6 个 Controller 字段表 + 方法表）
- 通用控制层领域模型（4 个 Controller 字段表 + 方法表）
- IO 控制层领域模型（2 个 Controller）
- 协议层领域模型（BusinessProtocol / GenericProtocol / IOProtocol）
- 计算层领域模型（composable + Worker）
- 资源图层 ID 清单
- 严禁事项清单

### 6.6 06-模块边界与职责说明

- 业务控制层边界（每 Controller 负责的限界上下文）
- 通用控制层边界（每 Controller 负责的图形指令类型）
- IO 控制层边界
- 计算层边界
- 渲染层边界
- 跨边界调用禁止项
- Pinia store 依赖矩阵
- composable 复用矩阵

### 6.7 07-协议事件清单

- 协议事件分类（业务事件 / 通用事件 / IO 事件）
- 统一信封 `MessageEnvelope<T>` 定义
- 业务事件清单（`call.incoming` / `alarm.profile.sync` / `dispatch.route.plan` / `tracking.vehicle.gps.update` 等）
- 通用事件清单
- IO 事件清单
- 事件发布方 / 消费方
- 事件字段（入参/出参/异常）
- 事件版本演进规则

### 6.8 08-业务状态机定义

- 警情状态机（CREATED → DISPATCHED → ON_SCENE → CLOSED）
- 车辆状态机（IDLE → DISPATCHED → EN_ROUTE → ON_SCENE → RETURNING → IDLE）
- 调派方案状态机（DRAFT → CONFIRMED → ACTIVE → COMPLETED / CANCELED）
- 围栏状态机（待定）
- 来电状态机（待定）
- 状态机集成位置（业务控制层 + Pinia 字段）
- 状态机测试规范

### 6.9 09-前端业务逻辑设计

- 业务控制层方法详细设计（按 6 个 Controller × 关键方法）
- 通用控制层 DTO 拼装映射（参考 `mds/minmax_output/08-`）
- 业务控制层 → 通用控制层 DTO 字段级映射
- Pinia store 业务字段（useDispatchStore 等）
- 业务规则与边界条件

### 6.10 10-前端实现完整度评分规则

- 评分维度（架构合规 / 场景 AC / 性能 SLA / 测试覆盖 / 文档完整）
- 每维度评分细则（0-100 分）
- 等级划分（不合格 / 合格 / 良好 / 优秀）
- 评分流程
- 与 `gis-dev-workflow` 阶段门禁的对应关系

### 6.11 11-核心业务判断逻辑

- 警情同步判断（先定位再上图 / 18 级 zoom / 业务前缀）
- 调派判断（多车路径并行 / 推荐路径 / 围栏四级联动）
- 跟踪判断（GPS ≥2fps / Worker 抽稀 / Follow 模式）
- 状态机不变量保护（`protectInvariants`）
- 业务规则强制校验顺序
- 异常判断（GPS 失联 / Worker 崩溃 / CTI 断连）

### 6.12 12-异常处理流程

- 异常处理原则（不阻断主流程 + 关键节点操作记录 + 告警推送）
- 异常类型（GPS 失联 / Worker 崩溃 / WebSocket 断连 / WFS 超时 / 算路失败 / 坐标系错误）
- 异常触发条件
- 异常处理流程（每类型一节）
- 异常职责边界
- 异常恢复与回归

### 6.13 统一语言词典 — GIS 前端（v1.0 完整版）

- 业务对象完整表（GL-GIS-001 ~ GL-GIS-NNN）
- 详细术语定义（属性表 + 业务定义 + 来源）
- 协议事件术语
- 状态机术语
- 性能 SLA 术语
- 图层 ID 术语

### 6.14 协议层 DTO Schema.tsd

- 协议层类型（TypeScript Schema 形式）
- `MessageEnvelope<T>` Schema
- `BusinessProtocol` Schema
- `GenericProtocol` Schema
- `IOProtocol` Schema
- 坐标系 Schema
- 图层 ID Schema

## 7. 文档版本与协作规范

- 全部文档以 `v1.0` 为初始版本，每次重大变更递增 0.1。
- 文档头必须包含：版本、日期、作者、最近一次更新说明。
- 文档评审必须由架构组、产品、SRE 各出一名代表。
- 文档变更必须通过 GitLab MR 流程；重大变更需发起设计评审。
- 文档与代码必须保持一致；架构变更需同步更新对应文档。
- 文档存放于 `docs/source/`，**单一真相源**；`mds/**` 作为输入资料库，标注引用关系即可，不再独立维护。

## 8. 落地路径

### 8.1 阶段 1：初始化骨架（1 周）
- 创建 `docs/source/` 目录。
- 创建 12 份文档骨架（标题 + 章节占位 + "待补充"标记）。
- 创建统一语言词典 v1.0 骨架。
- 创建协议层 DTO Schema.tsd 骨架。
- 输出索引页 `docs/source/00-文档集索引与前言.md`。

### 8.2 阶段 2：内容填充（按 gis-dev-workflow 阶段并行）
- **分析阶段（gis-analysis）**：把 `mds/minmax_output/**`、`mds/GIS整体设计/**` 内容切片映射到 01~12。
- **设计阶段（gis-design）**：填充 05~09 五份架构设计文档。
- **计划阶段（gis-planning）**：填充 10 评分规则与 11 核心判断逻辑。
- **实现阶段（gis-implementation）**：填充 12 异常处理流程。
- **测试阶段（gis-test）**：使用 10 评分规则生成完整度报告。

### 8.3 阶段 3：词典与 Schema 冻结（持续）
- 统一语言词典在 v1.0 后必须严格版本管理；任何术语新增/调整必须发起评审。
- 协议层 DTO Schema 必须与 `src/controller/core/protocol/*.ts` 100% 一致；CI 自动校验。

## 9. 与现有 mds 文档关系

| mds 子目录 | 处置方式 |
| --- | --- |
| `mds/minmax_output/**` | 整合到 01~12 文档，保留 `mds/minmax_output/GIS前端数据交互与架构全景设计(整合版).md` 作为整合索引（指向 docs/source） |
| `mds/external/**` | 协议事件、外部依赖等内容引用至 07 协议事件清单；不再独立维护 |
| `mds/internal/**` | 内部设计稿整合到 05 / 06；不再独立维护 |
| `mds/GIS整体设计/**` | 整合到 03 / 05 / 08 / 09；不再独立维护 |
| `mds/dd/**` | 整合到 02 / 05；不再独立维护 |
| `mds/sy/**` | 整合到 05 / 06；不再独立维护 |
| `mds/io_design/**` | 整合到 07 协议事件清单 + 01 业务需求；不再独立维护 |
| `mds/ER/**` | 整合到 05 五层架构 + 07 协议事件清单；不再独立维护 |
| `mds/output/**` | 整合后归档；不再独立维护 |

## 10. 收益评估

| 维度 | 现状 | 落地后 |
| --- | --- | --- |
| 文档定位 | 散落 30+ 份，新人上手 ≥ 5 天 | 14 份结构化文档，新人上手 ≤ 2 天 |
| 跨产品线一致 | 与 ids-command-center-client 不可对比 | 同构 12 文档，跨产品线协同 |
| 文档可追溯 | 多版本分散、无法定位单一真相源 | `docs/source/` 单一真相源 |
| 文档与代码同步 | 文档与代码漂移无机制 | 协议层 DTO Schema 由 CI 强制校验 |
| 评分与验收 | 无统一标准 | 10 完整度评分规则 + 11 核心判断 + 12 异常处理 联合验证 |
| 团队协作 | 文档散落、跨人/跨组检索成本高 | 索引页 + 编号命名 + 单一目录 |

## 11. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 现有 30+ 份 mds 文档资料丢失 | 第 9 节表格逐份映射；映射不到的内容在 `docs/source/00-文档集索引与前言.md` 单独列出 |
| 落地工作量 ≥ 2 周 | 分 3 阶段渐进；先用骨架覆盖后并行填充 |
| 跨产品线评审标准不一致 | 与 ids-command-center-client 维护人保持同步评审 |
| 协议层 DTO Schema 与代码漂移 | CI 校验；任何协议变更必须先改 Schema 再改代码 |
| 词典 v1.0 冻结后变更成本高 | v1.0 评审充分；变更走变更流程 |

## 12. 验收标准

- 14 份文件全部落地于 `docs/source/`。
- 12 份文档结构与 `ids-command-center-client` 对应章节标题一致。
- 统一语言词典覆盖 `mds/GIS整体设计/消息协议数据字典.md` 100% 词条。
- 协议层 DTO Schema 与 `src/controller/core/protocol/*.ts` 100% 一致（CI 校验通过）。
- `docs/source/00-文档集索引与前言.md` 提供从 `mds/**` 到 `docs/source/**` 的逐文件映射表。
- 与 `gis-dev-workflow` 阶段门禁对齐：05/06/09 必须在 `gis-design` 产出；07/08/11/12 必须在 `gis-implementation` 同步落地。
- 文档评审通过架构组、产品、SRE 三方代表签字。

## 13. 参考资料

- `skills/20260717-培训材料-肖志威/ids-command-center-client/docs/source/**`：参考结构
- `skills/20260717-培训材料-肖志威/gis-dev-workflow/references/gis-architecture.md`：五层架构
- `skills/20260717-培训材料-肖志威/gis-dev-workflow/references/gis-business-scenarios.md`：5 个核心场景 AC
- `skills/20260717-培训材料-肖志威/gis-dev-workflow/references/gis-state-machines.md`：3 个状态机
- `skills/20260717-培训材料-肖志威/gis-dev-workflow/references/gis-coord-system.md`：坐标系
- `skills/20260717-培训材料-肖志威/gis-dev-workflow/references/gis-controller-patterns.md`：DTO 拼装模式
- `skills/20260717-培训材料-肖志威/gis-dev-workflow/references/gis-performance-sla.md`：性能 SLA
- `skills/20260717-培训材料-肖志威/gis-dev-workflow/references/component-usage.md`：组件复用
- `mds/minmax_output/GIS前端数据交互与架构全景设计(整合版).md`：整合索引
