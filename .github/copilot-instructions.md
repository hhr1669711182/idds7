# ids-gis-web Agent 工作规范

本项目有专门为 AI 准备的 `herness/` 工作台。**开工前必须先读 `herness/00-SOP.md`。**

## 强制流程
1. `herness/00-SOP.md` — 强制第一站：工作 SOP、分层铁律、质量门禁
2. `herness/README.md` — 目录导航
3. 按任务类型追加读取对应文档（路由见 `herness/00-SOP.md`）
4. 跨会话交接 / 恢复任务（`/handoff`、`/handoff resume <路径>`）→ `herness/08-会话交接/_流程规范.md`

## 设计先行硬门禁（不可跳过）

任何会产生文件改动的任务，必须先**只读调查并输出设计方案**，然后**停止并等待用户明确确认**；确认前禁止修改 `src/**`、`tests/**`、`package.json`、构建配置、脚本或测试文件。

方案至少包含：目标与范围、分层落点、涉及文件清单、关键调用链/消息流、契约影响、异常兜底、验证方式、风险与待确认项。

- 用户明确说「确认 / 按方案实现 / 可以 / 开始 / 落地」才视为确认；单独的「继续」不算。
- 只有用户明确要求「跳过方案直接实现」时才可豁免。
- 确认后若分层、文件范围、对外契约、数据结构、安全策略、风险或回滚方式发生实质变化，必须先说明并重新确认。

## 关键约束
- **分层不可越界**：`src/controller/core/generic/**` 必须零业务；`src/controller/core/business/**` 禁止 `import 'ol/...'` / `'three'`，只组装通用 DTO；跨层数据用 `src/controller/core/protocol/**` 的 interface，禁止 `any`。
- **消息唯一出口**：所有 WS / postMessage 收发经 `useMessageStore().publish/subscribe`，禁止裸 WebSocket 或裸 `message` 监听处理业务。改事件键/DTO 须同步 `docs/source/07-协议事件清单.md` 与 `协议层DTO Schema.tsd`。
- **禁改文件**：`src/types/auto-imports.d.ts`、`src/types/components.d.ts`、`dist/`、`dist-lib/`、`node_modules/`。
- **类型门禁**：`pnpm lint` 基线约 193 个既有报错；判定标准是「无新增报错」，非「零报错」。改动前后各跑一次对比。
- **坐标**：协议层统一 WGS84 `[经度, 纬度]`。
- **注释规范**：新增/改动编码文件读 `herness/05-共享上下文/代码注释规范.md`。业务代码非必要不注释；公共文件导出符号必须有 JSDoc；JSDoc ≤ 10 行、连续注释块 ≤ 15 行；TODO 必须 `TODO(责任人, 日期, 问题号)` 三要素齐全。**存量注释不追溯、不清理。**
- **样式规范**：新增/改动样式读 `herness/05-共享上下文/代码样式规范.md` + `herness/05-共享上下文/主题与调色盘速查.md`。Less 优先；组件样式只写 `var(--token)`，禁止 `data-theme` 覆盖块；禁止 `-webkit-backdrop-filter`。**存量不追溯。**
- **样式规范**：新增/改动样式读 `herness/05-共享上下文/代码样式规范.md`。默认适配主题：只用 `var(--token)`，禁裸色值、禁 `html[data-theme]` 夜间覆盖块；圆角/阴影/间距/毛玻璃走变量，毛玻璃必须同时写 `-webkit-backdrop-filter`。
- **测试**：项目无单元测试框架，`tests/**` 为遗留脚本。

## 项目
ids-gis-web — IDS 智能调度系统 GIS 前端。Vue 3.5 + TS 6 + Vite 8 + Pinia 3 + OpenLayers 10 + Three 0.169 + Cesium。
命令：`pnpm dev` / `pnpm build` / `pnpm build:lib` / `pnpm lint`
