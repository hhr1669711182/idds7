# agent-huanghuanrong · 2026-11-18

## 14:30 落地《测试策略.md》项目级测试文档

- 任务：为项目生成整体性测试用例文档（测试内容 / 测试环境 / 如何测试，覆盖单元、黑盒、功能、业务、全流程）。
- 落点：新增 `herness/03-测试/测试策略.md`（525 行），补齐 `_index.md` 中「测试策略.md 待补充」项。
- 内容：测试目标（守/不守边界）、测试环境（Vitest 5 + jsdom / Playwright 系统 Chrome / mock 测试台 :18080 / 场景引擎 8 mode）、分层金字塔（单元 60 文件 / 组件 4 / E2E 5）、黑盒八维度用例矩阵 + 异常场景清单、9 个业务域用例（消息/坐标/检索/调派/警情画像/值守天气/地址机器人/追踪轨迹/地图配置）、全流程 8 个场景 mode 与手动冒清单、GIS 三契约测法、用例编号与追溯、P0~P2 缺口清单、执行手册。
- 顺手核实修正（事实与文档冲突，以代码为准）：
  - `_index.md` 原写「55 文件 / 579 项」→ 实测 `tests/unit` 为 **60 文件**，已更正；
  - `tests/*.test.ts` 遗留脚本**已不存在**（tests/ 根目录仅剩 unit/components/e2e/harness/fixtures/__artifacts 六个子目录），`_index.md` 的「⚠️ 待删除」与测试策略缺口清单中对应 P0 项均撤销。
- 验证：`pnpm harness:check` 通过（文档体量正常）；测试策略中引用的 spec 文件名已逐一比对 `tests/unit` 实际 60 文件清单，无臆造。
- 未改动：`src/**`、`tests/**`、`docs/source/**`、构建配置。

## 14:33 追加《测试组操作手册.md》

- 用户要求为测试组单独输出一份文档。
- 落点：`herness/03-测试/测试组操作手册.md`（184 行），面向人工测试：环境准备（含三地数据中心说明）、自动化命令速查、场景引擎 8 场景实操（前置条件 / 结果判读 / 地图对照）、手工测试要点（异常 / 权限 / 状态机 / 视觉）、缺陷提报规范（GIS 特有条目）、FAQ。
- 与 `测试策略.md` 分工：策略文档讲「测什么」，手册讲「怎么操作」；已同步登记 `_index.md`。

## 14:39 测试手册改投 `docs/`（按用户指示重构）

- 用户要求：手册放到 `docs/` 下；测试环境固定为 **test 测试环境**（已打包推送部署，**不需要准备环境依赖**）。
- 动作：
  - 删除 `herness/03-测试/测试组操作手册.md`（原 184 行开发侧版本，含 mock 服务 / pnpm 命令，test 环境 mock 关闭不适用）；
  - 新建 `docs/测试组测试手册.md`（125 行）：基于 `.env.test` 实测事实改写——消息服务 `ids-test.ks.telewave.tech`（真实 WS 网关，VITE_USE_MOCK=false）、GeoServer `192.168.169.58:8080`、地图代理 `192.168.169.28:33082`、数据中心=北京（`VITE_MAP_ADMCODE=110000`）、BC 通道 `ids-map-screen-relay` 启用、在线图标模式；
  - 结构：环境信息表（访问即测，无需搭环境）/ 冒烟 S1~S5 / 全流程 8 步人工对照（原场景引擎 fullCycle 的观察点表，注明 test 环境 mock 关闭、本地场景引擎不可用）/ 专项场景 / 门禁行为易误报说明 / 异常·权限·状态机·视觉 / 缺陷提报规范 / FAQ。
  - `_index.md` 中该手册登记行撤销，改为指向 `docs/测试组测试手册.md`。

## 16:05 按用户指示清除多消防站表述

- 用户明确：**当前业务仅单消防站派车**。
- `docs/测试组测试手册.md`：全流程第 4 步「模拟派车（多消防站候选）」改为「单消防站，1 辆出动车」；专项场景表删除「多消防站派车」行。
- `herness/03-测试/测试策略.md`（开发侧文档保留事实但加限定）：§5.4 调派黑盒关注点改「单消防站候选路线上图（当前业务仅单消防站派车）」；§5.4 缺口、§6.1 `multiStation` 场景表、§九 P1 压测项均标注「多站为开发侧 mock 压测场景 / 多站能力上线后再纳入，测试组不测」。

## 18:20 视口跟随改为边界触发+animate 平滑居中 (450a6763)

- 用户反馈：持续 100ms setCenter 太频繁，希望车辆走到视口附近再刷新，且改用 animate 平滑。
- 三个渲染器统一改造：
  1. VehicleTrackRenderer.ts：followIfNeeded 改为像素级边界检测（getPixelFromCoordinate + 100px margin），距边缘 <100px 才 animate({center, duration:500})；质心在视口中央区域时不做操作。
  2. VehicleRenderer.ts：同上，车辆坐标距视口边缘 <100px 才 animate 居中。
  3. useAmapTools.ts：followVehicleView 同逻辑，新增 followVehicleViewMarginPx=100 字段。
- 节流间隔从 100ms 提升到 500ms，避免动画期间频繁触发。
- JSDoc 同步更新。

## 19:15 WFS 2.0.0 分页改造（searchGisResources 由全量 10000 条改为每页 100 条）

- 目标：降低 DOM 数据量、提升性能；路径规划/资源检索场景从「一次性拉全量」改为「首屏 100 条 + 滚动加载更多」。
- 变更文件（7 个）：
  1. `src/apis/geoserver.ts`：`WFSFeatureParams` 加 `version` / `startIndex` / `count` / `crs` 四个可选字段（WFS 1.0.0 默认，2.0.0 支持分页）。
  2. `src/apis/searchQuery.ts`：`searchGisResources` 改用 WFS 2.0.0（`version:'2.0.0'`, `crs:'EPSG:4326'`, `count=100`），`'1=1'` 时省略 `cql_filter`；写回 `bucket.totalCount`（`numberMatched`）。`runSearch` 首屏调 `searchGisResources(params, getLayerNameMap(), 100, 0)`。
  3. `src/composables/useWfsPagination.ts`（**新建**）：通用分页 composable，`loadInitial()` / `loadMore()` / `resetWithFilter()`，`shallowRef` + generation 计数器防竞态，`onUnmounted` 自动清理。
  4. `src/composables/useSearchActions.ts`：`runViewSearch` 第二次改直调 `searchAmapAddress`（原来调 `runSearch` 会触发全量图层 WFS 请求）；新增 `loadMoreResource()` 翻页加载；三个搜索流程均初始化分页游标（`resourceStartIndex=0` / `resourceHasMore` / `resourceSearchParams`）。
  5. `src/store/useSearchPanelStore.ts`：新增 4 个共享分页字段：`resourceStartIndex` / `resourceHasMore` / `resourceLoadingMore` / `resourceSearchParams`。
  6. `src/types/search.ts`：`SearchResultBucket` 加 `totalCount?: number`（WFS `numberMatched` 全量命中数）。
  7. `src/components/map/component/circleQueryPanel.vue`：`.cq-list` 加 scroll 监听（距底部 60px 触发 `loadMoreResource`）；tab 标题从 `items.length` 改为 `totalCount ?? items.length`；截断提示改为「还有更多资源，下拉加载更多…」。
- 顺手修复 `VehicleRenderer.ts` 的存量 `Icon` 未使用 import（TS6133），`pnpm lint` 归零。
- 验证：`pnpm lint` 0 报错。
