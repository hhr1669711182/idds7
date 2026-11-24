# 2026-11-24 agent-YeFeng

## GeoPicker 对外选点/选辖区能力落地（收尾）

**需求**：外部项目需地图「画点回传」和「画辖区回传」两个能力（分开使用），均支持外部传经纬度定位；同域 iframe 嵌入，postMessage 通信。

**方案（已确认）**：
- 新建独立路由 `/pickPoint`、`/pickJurisdiction`，**不改** `/markDraw`（后者是内部全功能标绘系统，依赖 GeoServer 落库）
- 通信：经 `useMessageStore.bindParent` 入站 + `publish` 出站（system=host）
- 工具栏：撤销 / 重做 / 清除 3 按钮（无编辑按钮）；点击图上已有要素直接进入编辑（Select+Modify 常驻，绘制时命中检测让位）
- 单一结果：每页只保留 1 个要素，新画覆盖旧的；辖区回传不带面积；定位后不自动画、用户手动单击；画完立即回传无确认按钮

**落地文件**（前序会话已建，本次收尾验证）：
- 新增 6 文件：`GeoPickerProtocol.ts`（DTO）、`useGeoPicker.ts`（核心 composable）、`GeoPickerSurface.vue`、`GeoPickerToolbar.vue`、`views/pickPoint`、`views/pickJurisdiction`
- 修改 10 文件：`protocol/index` 导出、消息事件键 +6、`publish/host` +4 函数、`BaseTool` 加可选 `drawCondition`（向后兼容）、`DrawTools` 接入、router 加 2 条顶层路由、`协议层DTO Schema.tsd`、`07-协议事件清单.md`、`消息协议速查.md`

**本次修复**：
1. **`parseQuery` 初始定位 bug**：hash 路由下 URL 形如 `#/pickPoint?lng=..`，「?」在「#」之后，`window.location.search` 恒为空串 → 原实现 `Number(null)=0` 通过有限性校验 → 错误定位到 `[0,0]`（大西洋几内亚湾）。改用 `useRoute().query` 解析（`useGeoPicker` 在 setup 顶层调用，`useRoute` 可用），并加 `string | string[]` 归一。dev 实测地图正确飞到北京 `(116.40, 39.90)`。
2. **补全 `消息协议速查.md` 事件键清单**：新增「对外 iframe 嵌入 `geoPicker.*`」分组，列出 6 个键（此前只更新了 publish 函数表与映射表，漏了事件键列表）。

**验证**（dev server，端口 8889，因 8888 被占用）：
- `pnpm lint`（vue-tsc）：0 报错 ✓
- `node scripts/check-css-vars.mjs`：149 个变量引用均有定义 ✓
- `node scripts/check-backdrop-filter.mjs`：26 处均无 `-webkit-` 前缀 ✓
- 浏览器手测 `/#/pickPoint?lng=116.40&lat=39.90&zoom=14`：地图渲染、北京底图瓦片可见、正确居中定位 ✓；右上角工具栏 3 按钮（撤销/重做禁用态正确）✓；单击画红点 ✓；控制台无红色报错 ✓
- 端到端（临时宿主 iframe 测试页，验证后已删除）：收到 `geoPicker.ready` / `geoPicker.pointPicked` / `geoPicker.cleared`；宿主发 `geoPicker.clear` 指令入站生效 ✓
- 注：底图瓦片首次加载偶发不可达（本地网络环境），不影响功能；坐标转换 `toLonLat` 逻辑经真实点击落点验证正确

**契约**（见 `docs/source/07-协议事件清单.md` §0.7）：
- 出站（子→宿主）：`geoPicker.ready` / `geoPicker.pointPicked` / `geoPicker.jurisdictionPicked` / `geoPicker.cleared`
- 入站（宿主→子）：`geoPicker.locate` / `geoPicker.clear`
- 坐标：协议层统一 WGS84 `[lng, lat]`；辖区回传 GeoJSON `coordinates`（轴序 WGS84）

## GeoPicker interaction 重写（对齐 OL 官方 demo）

**问题**：前序实现为「Select(常驻) + Modify(绑 select) + Draw(MarkDraw.DrawTool)」三 interaction 常驻 + gate 协调。DrawTool 里错误加了 `singleClick(evt)` condition——Draw 的 `handleDownEvent` 在 **POINTERDOWN** 事件触发，event.type 是 `'pointerdown'` 不是 `'singleclick'` → condition 永远 false → Draw 永远不激活 → polygon 第一点都加不上。同时 PointTool/DrawTool 还附带 help overlay 等 MarkDraw 专属逻辑，GeoPicker 用不上。

**重写方向**：对齐 OL 官方 `draw-and-modify-features` demo——**Draw(常驻) + Modify(绑 source，仅辖区模式)**，不需要 Select 中转。

**改动（3 文件）**：
1. **`BaseTool.ts` + `DrawTools.ts` 完整回滚**：删掉之前加的 `drawCondition`、`showHelp`、`singleClick` 所有临时改动，恢复 git HEAD 原始版本（MarkDraw 原行为零回归）
2. **`useGeoPicker.ts` 重写**：
   - import 删 Select / singleClick / PointTool / DrawTool / BaseTool；新增 `Draw` from `ol/interaction/Draw`
   - interaction 层：`Draw(type=Point|Polygon)` 常驻 + `Modify({source})`（仅 jurisdiction），删 Select 和 hitFeature gate 逻辑
   - draw.drawend → `source.clear()` 覆盖旧要素 + `history.push` + `emitCurrent`
   - Modify modifyend → 历史栈 + 回传

**收益**：从 3 interaction + gate 协调 → 2 interaction 官方 demo 模式；删除 ~60 行冗余代码（hitFeature / 常量 / 条件分支 / Select 清理）；polygon 绘制路径清晰无分叉。

**验证**（dev server，端口 8890，因 8888/8889 被占用）：
- `pnpm lint`：0 报错 ✓
- pickJurisdiction / pickPoint 两页面 canvas 正常渲染 ✓
- 控制台无红色 error ✓（Draw/Modify 原生 interaction 加载无异常）

**后续需用户端实机点测**：polygon 连续点击添加节点、双击结束闭合、Modify 顶点拖动、再画自动覆盖、撤销/重做/清除按钮禁用态、postMessage 端到端（宿主 iframe 嵌入）。浏览器自动化工具受 OL `isTrusted` 限制无法合成本地 pointerdown 序列。
