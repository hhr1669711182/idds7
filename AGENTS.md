# AGENTS.md — ids-gis-web Agent 工作规范

> 本文件是本仓库**所有 AI agent 的统一入口**，会在会话启动时被自动读取。
> 作用范围：本文件适用于整个仓库。

---

## 强制规则（每次任务开始前必做）

**本项目有一套专门为 AI 准备的工作台 `herness/`，开工前必须先读它，而不是直接动手。**

```
1. 读 herness/00-SOP.md            ← 【强制第一站】工作 SOP、分层铁律、质量门禁
2. 读 herness/README.md            ← 目录导航与读取策略
3. 按任务类型追加（见下方路由表）
```

未读 `herness/00-SOP.md` 就开始写代码 = 违规。

---

## 任务路由（决定该读 herness 下的哪些文档）

| 任务类型 | 追加读取 |
|---------|---------|
| 任何编码任务 | `herness/05-共享上下文/项目结构速查.md` + `herness/05-共享上下文/设计规范速查.md` |
| 需求 / 功能设计 | `herness/01-产品设计/_流程规范.md` |
| 技术方案 / 重构 | `herness/02-技术设计/_流程规范.md` |
| 测试 / 验收 | `herness/03-测试/_流程规范.md` |
| 迭代 / 周计划 | `herness/04-迭代管理/_index.md` |
| 代码审查 / MR | `herness/06-PR审查/_流程规范.md` |
| 涉及消息 / WS / postMessage / 控制器 | `herness/05-共享上下文/消息协议速查.md` |
| 涉及构建 / 依赖 / 接口 | `herness/05-共享上下文/技术栈速查.md` |
| 涉及业务名词 | `herness/05-共享上下文/核心概念术语.md` |
| 接手任务 / 了解进度 | `herness/05-共享上下文/当前状态摘要.md` |

> 按需读，不要一次读完 `herness/**` 全部文档。

---

## 三条最容易踩的坑（务必先知道）

1. **分层不可越界**。本项目采用控制层分层（详见 `herness/00-SOP.md`「分层铁律」）：
   - `src/controller/core/generic/**` 是**通用图形控制**，必须零业务
   - `src/controller/core/business/**` 是**业务控制**，只组装通用 DTO，**不得 `import 'ol/...'` 或 `'three'`**
   - 跨层数据必须用 `src/controller/core/protocol/**` 的 interface，禁止 `any`

2. **消息收发只有一个出口**：必须经 `useMessageStore().publish/subscribe`，禁止裸 `new WebSocket()`、禁止裸 `window.addEventListener('message')` 处理业务。改消息事件键或 DTO 时必须同步 `docs/source/07-协议事件清单.md` 与 `docs/source/协议层DTO Schema.tsd`。

3. **类型门禁基线不干净**：`pnpm lint` 当前约有 **193 个既有报错**（绝大多数是未用变量 `TS6133`），另有 **6 个 `TS2339/TS2551`** 是 `src/controller/map/index.ts`、`src/controller/three/index.ts` 引用了常量中不存在的消息事件键（真实缺陷，详见 `herness/05-共享上下文/当前状态摘要.md`）。
   → **判定标准是「没有引入新增报错」，不是「零报错」。** 改动前后各跑一次并对比。

---

## 自动生成文件：禁改

- `src/types/auto-imports.d.ts`、`src/types/components.d.ts`（由 vite 插件生成）
- `dist/`、`dist-lib/`、`node_modules/`

完整清单与编码约定见 `herness/05-共享上下文/设计规范速查.md`。

---

## 项目速览

- **项目**：ids-gis-web — IDS 智能调度系统 GIS 前端（Vue 3.5 + TS 6 + Vite 8 + Pinia 3 + OpenLayers 10 + Three 0.169 + Cesium）
- **形态**：应用（`pnpm dev`）+ 库（`pnpm build:lib`，入口 `src/lib/index.ts`）
- **代码真相源**：`src/**`；业务契约源：`docs/source/**`
- **无单元测试框架**：`tests/**` 是遗留脚本

---

## 常用命令

```bash
pnpm dev            # 开发（端口 8888）
pnpm build          # 构建
pnpm build:lib      # 库模式构建
pnpm lint           # 类型检查（vue-tsc，无 ESLint）
```

---

## 收尾要求

任务完成后：

1. 在 `herness/00-SOP.md`「工作日志」追加一条记录
2. 若新增/修改了设计文档，同步更新对应 `_index.md`
3. 若代码结构、协议、技术栈发生变化，回写 `herness/05-共享上下文/**` 对应速查