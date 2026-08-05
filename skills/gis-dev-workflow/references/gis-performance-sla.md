# GIS 性能 SLA 与验收标准

## 1. 性能 SLA 指标

| 指标 | 目标 | 测量方法 | 关联场景 |
| --- | --- | --- | --- |
| 核心场景稳态帧率 | ≥ 30fps | Chrome DevTools Performance / `requestAnimationFrame` 采样 | 值守、来电、调派、跟踪 |
| 弹屏端到端延迟 | ≤ 500ms | WebSocket 接收时间戳 → 首帧渲染时间戳 | 来电 |
| GPS 端到端延迟 | ≤ 500ms | GPS 网关推送时间戳 → marker 移动时间戳 | 跟踪 |
| 单车路径算路耗时 | ≤ 1s | Worker 输入到路径结果时间差 | 调派 |
| 多车路径并行计算（≤5 辆） | ≤ 2s | Worker pool 全部完成时间 | 调派 |
| 协议解析耗时 | ≤ 50ms | `MessageEnvelope` 解析到 controller 派发时间 | 全场景 |
| 视野切换响应 | ≤ 200ms | 业务事件触发到 `view.fit` 完成 | 调派、问询、跟踪 |
| 路径抽稀（≤200 点/批） | ≤ 100ms | Worker 抽稀函数耗时 | 跟踪 |
| Auto-Fit 计算 | ≤ 50ms | extent + padding 计算耗时 | 全场景 |
| WFS 查询（AOI/出入口/消防栓） | ≤ 200ms | HTTP 请求到 GeoServer 响应 | 问询 |
| 首次进入场景首帧 | ≤ 800ms | 路由进入 → 第一帧渲染（含图层） | 值守 |
| 场景切换清理临时图元 | ≤ 100ms | `useLayersStore.removeByPrefix` 耗时 | 全场景 |

## 2. 体积与构建预算

| 指标 | 目标 | 测量方法 |
| --- | --- | --- |
| vendor chunk（gzipped） | ≤ 2MB | `vite build --mode production` 后 `gzip -c` |
| 首屏 JS payload（gzipped） | ≤ 800KB | 路由懒加载后首屏引入 chunk |
| 首屏 CSS payload（gzipped） | ≤ 100KB | 入口 CSS 文件 |
| 字体资源 | ≤ 500KB | ThreeJS 字体 JSON（按需） |
| Worker bundle（gzip） | ≤ 200KB | `RouteMetricsWorker` 等独立 bundle |

## 3. 内存预算

| 指标 | 目标 |
| --- | --- |
| 稳态堆内存 | ≤ 200MB |
| 长会话（≥ 4h）内存增长 | ≤ 30% |
| Web Worker 堆 | ≤ 50MB |
| 离屏 canvas | 关闭后立即释放 |

## 4. 网络预算

| 指标 | 目标 |
| --- | --- |
| WebSocket 断线重连 | ≤ 3s 内自动重连 |
| WFS 查询超时 | 5s 自动重试 1 次 |
| 高德/百度 API 调用 | 单次 ≤ 300ms |
| 静态资源 CDN 缓存 | 30 天 |

## 5. 验收测试流程

性能 SLA 验证在 `gis-test` 阶段执行，工具与流程如下：

1. **基准测试（vitest bench）**：
   - 算路函数、坐标转换、抽稀函数必须有 `vitest bench` 基准。
   - CI 中跑 `pnpm bench`，对比上一次结果，差异 > 20% 必须有原因说明。

2. **E2E 性能测试（Playwright + Headless Chrome）**：
   - 5 个核心场景的端到端流程（值守 → 来电 → 问询 → 调派 → 跟踪）。
   - 使用 `page.evaluate` 注入帧率采样器与时间戳记录器。
   - 性能数据导出到 `tests/perf/report.json`，由 CI 归档。

3. **手工验收**：
   - 开发机执行 `pnpm dev`，按 `references/gis-business-scenarios.md` 走完 5 个场景。
   - 录制屏幕并使用 DevTools Performance 工具分析。

## 6. SLA 不达标处理

- 任何 SLA 不达标时，先记录现象与可复现步骤，禁止"先合并后修复"。
- 修复必须先添加能复现 SLA 失败的基准测试，再优化代码。
- 优化后必须重新跑全套性能测试并对比基线。
- 跨基线（vendor chunk、首屏 payload）的优化必须以数据支撑（before/after 体积表）。

## 7. SLA 与 references 关联

| SLA 指标 | 关联 references |
| --- | --- |
| ≥30fps 帧率 | `gis-architecture.md`（五层性能责任）、`gis-business-scenarios.md`（场景） |
| ≤500ms 延迟 | `gis-architecture.md`（推模式 + Worker 责任）、`gis-state-machines.md`（状态机切换） |
| ≤1s 算路 | `gis-controller-patterns.md`（DTO 拼装）、`component-usage.md`（Worker 复用） |
| ≤50ms 协议解析 | `workflow-contract.md`（强制基线）、`vue3-conventions.md`（协议层） |
| 10-15% Padding | `gis-coord-system.md`（Auto-Fit 公式）、`gis-architecture.md`（严禁事项） |
