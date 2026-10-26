# 2026-10-26 工作日志（huanghuanrong）

## 缺陷修复：检索结果与路径规划面板同时展开时，路径规划面板溢出屏幕

**问题**：`circleQueryPanel.vue` 的 `.search-panel-wrapper` 纵向 flex 列（检索输入框 → `cq-panel` 检索结果 → `RoutePlanPanel`）无整体高度约束；`routePlanPanel` 根节点为 `flex: 0 0 auto` 且不设 max-height，自身 `overflow: hidden`。两面板同时全展开时，列总高超出视口，路径规划面板底部（分析按钮 / 规划结果 / 路况区）被屏幕裁断，无法操作。

**修复（已落地）**：
- `src/components/map/component/circleQueryPanel.vue`
  - `.search-panel-wrapper` 追加 `max-height: calc(100vh - 1em)`（top 0.5em 对称留白），列整体受视口约束
  - `.cq-panel` 追加 `min-height: 0`（允许被 flex 压缩）
  - `cq-panel` 展开态内容整体包一层 `<div class="cq-content">`，新增样式 `flex: 1 1 auto; min-height: 0; overflow-y: auto`——面板被压缩时检索内容（tab / 列表 / 圈选配置）内部滚动，不再被 `overflow: hidden` 裁切
  - `.cq-list` 既有 120–260px 内滚保留不动
- `src/components/map/component/routePlanPanel.vue`（模板零改动，仅样式）
  - `.route-plan-panel`：`flex: 0 0 auto` → `flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column`
  - `.rp-header` / `.rp-tabs` 追加 `flex: 0 0 auto`（固定不压缩）
  - `.rp-body` 追加 `flex: 1 1 auto; min-height: 0; overflow-y: auto`（空间不足时表单 + 规划结果 + 路况区在此内部滚动）

**行为结果**：
- 空间充足时（单面板 / 高度富余）：容器为 max-height 非 height，各面板维持自然高度，外观与现状一致
- 双面板同时展开且超视口（缺陷场景）：`cq-panel` 与 `route-plan-panel` 按 flex-shrink 均分压缩，路径面板 `.rp-body` 出现内部滚动，内容完整可达，整列不出屏幕

**验证**：
- `pnpm lint`（vue-tsc）0 报错 ✅
- 待人工 `pnpm dev` 目检：①同开双面板确认路径面板内部滚动且不出屏；②单独只开路径面板确认无回归（无滚动条、自然高度）

**涉及文件**（仅 2 个，view 层）：
- `src/components/map/component/circleQueryPanel.vue`
- `src/components/map/component/routePlanPanel.vue`

无契约 / 协议 / store 变化；`routePlanPanel` 仅被 `circleQueryPanel.vue` 一处引用，影响面封闭。

## 交互增强：view-dropdown 外部点击隐藏

**问题**：检索面板的视图下拉（.view-dropdown）原先只有面板内部交互路径（点查询/点路径图标/点下拉项/聚焦输入框）会隐藏，点击地图空白、其他面板等外部区域时下拉保持展开。

**修复（已落地，方案 A：新增公共 composable）**：
- 新增 src/composables/useClickOutside.ts（document mousedown 捕获阶段判定 + onMounted/onBeforeUnmount 自动绑定/解绑，公共文件带 JSDoc）
- circleQueryPanel.vue：input-panel 根节点挂 inputPanelRef + 调用 useClickOutside(inputPanelRef, () => viewSelectVisible.value = false)；面板内点击（输入框/查询按钮/路径图标/下拉项，均在 .input-panel 子树内）不触发关闭
- 选定 mousedown 捕获而非 focusout：地图 canvas 不可聚焦，focusout 覆盖不到「点地图失焦」这一核心场景
- 同步 herness 公共工具速查.md 零表：登记 useClickOutside，注明禁止组件内散落裸 document mousedown + contains

**验证**：pnpm lint（vue-tsc）0 报错 OK；待 pnpm dev 目检：展开视图下拉后点地图/其他面板 -> 下拉隐藏；点面板内输入框/查询按钮 -> 下拉保持

## 缺陷修复：小汽车路径规划只上图第一条路段 + 面板展示红绿灯数量

**问题**：
1. 「路径规划」结果只画了整条路线第一个路段（feature[0]）的路况着色线，后面 30+ 个路段折线缺失。
2. 结果区未展示红绿灯数量（接口 `trafficLights` 字段被丢弃）。

**根因**（`routePlanPanel.vue` → `parseRouteFeatures`）：
- 去重守卫写成 `if (seenPolyline.size) return;`（Set 非空即跳过整个后续 feature），本意是逐条 polyline 去重却被写成跨 feature 一刀切，导致只有 `feature[0]` 的 tmcs 进 `segments`；`showRoute` 走分段分支时只画第一段，后面 30+ 路段折线缺失。

**修复**：
- 删除外层 `if (seenPolyline.size) return;` 守卫
- 改为逐条 polyline 去重：`if (segCoords.length >= 2 && !seenPolyline.has(rawPolyline))`

**红绿灯（方案 A：数量提示）**：
- 实测代理 `/api/amap/route/driving`（`http://192.168.169.28:33082`）带 `show_fields=navi / navi,citymaps / all` 三档，均只回 `trafficLights`（数量字符串），`features[i].properties` 仅 `distance / partDesc / roadName / tmcs`，`tmcs.lcode` 是车道编码（空），无逐路口坐标 → 无法标注真实路口位置
- 故只展示数量：`parseRouteFeatures` 返回值补 `trafficLights`；`routeSummary` 类型补 `trafficLights: number`；模板「规划结果」区加「红绿灯 N 个」一项

**涉及文件**（仅 1 个，view 层）：
- `src/components/map/component/routePlanPanel.vue`

**验证**：
- `pnpm lint`（vue-tsc）0 报错 ✅
- 待人工 `pnpm dev` 目检：路径规划完整折线全部上图（不再只一段）、结果区展示红绿灯数量

**遗留待办**：若需红绿灯「真实路口位置图标」，需后端/高德代理透出逐路口坐标（跨团队，本期不做）
