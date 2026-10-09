# ids-gis-web Agent 工作规范

本项目有专门为 AI 准备的 `herness/` 工作台。**开工前必须先读 `herness/00-SOP.md`。**

## 强制流程
1. `herness/00-SOP.md` — 强制第一站：工作 SOP、分层铁律、质量门禁
2. `herness/README.md` — 目录导航
3. 按任务类型追加读取对应文档（路由见 `herness/00-SOP.md`）

## 关键约束
- **分层不可越界**：`src/controller/core/generic/**` 必须零业务；`src/controller/core/business/**` 禁止 `import 'ol/...'` / `'three'`，只组装通用 DTO；跨层数据用 `src/controller/core/protocol/**` 的 interface，禁止 `any`。
- **消息唯一出口**：所有 WS / postMessage 收发经 `useMessageStore().publish/subscribe`，禁止裸 WebSocket 或裸 `message` 监听处理业务。改事件键/DTO 须同步 `docs/source/07-协议事件清单.md` 与 `协议层DTO Schema.tsd`。
- **禁改文件**：`src/types/auto-imports.d.ts`、`src/types/components.d.ts`、`dist/`、`dist-lib/`、`node_modules/`。
- **类型门禁**：`pnpm lint` 基线约 193 个既有报错；判定标准是「无新增报错」，非「零报错」。改动前后各跑一次对比。
- **坐标**：协议层统一 WGS84 `[经度, 纬度]`。
- **测试**：项目无单元测试框架，`tests/**` 为遗留脚本。

## 项目
ids-gis-web — IDS 智能调度系统 GIS 前端。Vue 3.5 + TS 6 + Vite 8 + Pinia 3 + OpenLayers 10 + Three 0.169 + Cesium。
命令：`pnpm dev` / `pnpm build` / `pnpm build:lib` / `pnpm lint`