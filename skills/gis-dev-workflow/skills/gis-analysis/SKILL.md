---
name: gis-analysis
description: Use when GIS product/architecture documents under mds must be converted into a five-layer (Service/Protocol/Calc/Ctrl/Render) source index before design work begins.
stage: 1
stage_name: 分析
compatible_agents:
  - codex
  - hermes
  - claude-code
  - cursor
  - trae
prerequisites: []
entry_command: $gis-dev-workflow:gis-analysis
gate:
  artifact: docs/analysis/01-五层索引目录.md
  review: user
timeout_seconds: 7200
tools_required:
  - read_documentation
  - write_stage_artifact
---

# GIS Analysis

## 共享工作流契约（强制）

- 执行本阶段前，必须读取 `../../references/workflow-contract.md` 并遵守其中的默认基线、全局约束和阶段门禁。
- 必须确认 `mds/**` 中存在可分析的产品资料与架构文档；资料缺失或无法支撑分层索引时，停止并列出缺失项，不得生成臆测内容。
- 本技能只执行分析阶段，不自动进入设计阶段。

## 目标

将产品/架构文档转化为按五层（Service / Protocol / Calc / Ctrl / Render）分层的索引目录，输出到 `docs/analysis/01-五层索引目录.md`。

## 标准分层

1. **Service（服务层）**
   - 后端微服务（接处警、调度、车辆管理）
   - GPS 网关（车辆/单兵）
   - 主前端 Host（UI/列表）
   - 外部系统（高德、百度、GeoServer）

2. **Protocol（协议层）**
   - `src/controller/core/protocol/BusinessProtocol.ts`：业务协议 DTO
   - `src/controller/core/protocol/GenericProtocol.ts`：通用控制层 DTO
   - `src/controller/core/protocol/IOProtocol.ts`：视图事件协议
   - `MessageStore` / `gisBridge`：统一信封

3. **Calc（计算层）**
   - `src/composables/`：纯函数 composable（`useAlarmHotspot` 等）
   - `src/hooks/useRouteMetricsWorker.ts`：Worker 封装
   - `src/baseComponent/amap/routeMetrics.worker.ts`：算路 Worker
   - `src/util/coordTransform.ts`：坐标系转换
   - 空间算法（Turf）

4. **Ctrl（控制层）**
   - 业务控制层 `src/controller/core/business/`：AlarmController / CallController / ConfigController / DispatchController / DutyController / TrackingController
   - 通用控制层 `src/controller/core/generic/`：GeometryController / KinematicController / SpatialController / ViewController
   - IO 控制层 `src/controller/core/io/`：InputController / OutputController

5. **Render（渲染层）**
   - `src/components/`、`src/baseComponent/`、`src/views/`
   - OpenLayers / ThreeJS / amap 渲染
   - Pinia 视图 store

## 执行步骤

1. 检索 `mds/**` 下所有文档，重点：
   - `mds/minmax_output/GIS前端数据交互与架构全景设计(整合版).md`
   - `mds/minmax_output/01-协议层与后端I O契约.md`
   - `mds/minmax_output/02-计算层与控制层I O契约.md`
   - `mds/minmax_output/05-核心场景端到端流程与渲染实现.md`
   - `mds/minmax_output/08-业务协议到通用控制指令的拼装映射与数据流转.md`
   - `mds/external/map-message-events.md`
   - `mds/external/控制接口映射表-01.md`
2. 按五层做相关性分析（强/中/弱）。
3. 为每份被索引文档写明归属原因，禁止只列文件名。
4. 输出强相关到 `docs/analysis/01-五层索引目录.md`。

## 输出样例

```markdown
## 按 GIS 五层分层的索引目录（mds）

### Service 索引

- `mds/external/控制接口映射表-01.md`：业务系统接入、API 路径、外部依赖
- `mds/external/GIS后端微服务能力清单.md`：后端服务能力矩阵

### Protocol 索引

- `mds/minmax_output/01-协议层与后端I O契约.md`：统一信封定义、业务/通用/IO 协议契约
- `mds/external/map-message-events.md`：消息事件清单（`call.incoming`、`alarm.profile.sync` 等）

### Calc 索引

- `mds/minmax_output/02-计算层与控制层I O契约.md`：空间/路径/抽稀计算接口定义
- `mds/minmax_output/06-坐标系统与转换规范.md`：坐标系转换规则

### Ctrl 索引

- `mds/minmax_output/08-业务协议到通用控制指令的拼装映射与数据流转.md`：业务控制层 → 通用控制层 DTO 拼装映射
- `mds/GIS整体设计/Controller层详细设计.md`：现有 6+4+2 Controller 详细设计

### Render 索引

- `mds/minmax_output/05-核心场景端到端流程与渲染实现.md`：5 个核心场景的渲染链路
- `mds/dd/GIS前端分层架构与复用设计.md`：渲染层组件复用设计

### Cross-Layer 索引

- `mds/minmax_output/07-SLA性能指标与验收标准矩阵.md`：跨层性能基线
- `mds/GIS整体设计/GIS前端整体架构设计.md`：全局架构
```

## 门禁

- 用户选择 `gis-dev-workflow:gis-design` 前，必须存在 `docs/analysis/01-五层索引目录.md` 并完成审阅。
- 索引必须覆盖 Service、Protocol、Calc、Ctrl、Render；没有来源时显式说明"未发现直接来源"。
- 每份被索引文档必须写明归属原因，禁止只列文件名。
