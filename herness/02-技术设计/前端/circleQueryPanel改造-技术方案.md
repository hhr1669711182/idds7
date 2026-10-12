# circleQueryPanel 改造 + 路径规划面板 - 技术方案

## 1. 文档信息

- **关联迭代**：—
- **作者 / 日期**：2026-10-12
- **关联需求**：本轮对话需求 + `docs/source/07-协议事件清单.md`（无消息协议改动）
- **状态**：待评审

## 2. 方案概述

### 背景

`src/components/map/component/circleQueryPanel.vue` 当前的 `input-panel` 是**空壳**（只有一个注释掉的 `el-input`），`cq-panel` 只提供「半径滑块 + 资源类型勾选 + 汇总统计」，**没有检索入口、没有结果列表**。`CircleQueryTool` 已具备 WFS `DWITHIN` 圈选查询、WMS 图层渲染、`updateStats` 汇总统计三项能力，但这些能力目前只服务于「圈选」这一种交互，没有被「文字检索」复用。

同时，高德代理已封装地址模糊检索（`amapApi.keywordSearch` / `inputTips`）与路径规划（`amapApi.driving` / `drivingV2`），但**没有独立的 UI 入口**——目前只有 `NavPanel.vue` 在警情调派场景下用了一小部分。

### 目标

1. 把 `input-panel` 建成真正的检索入口：一次输入，同时命中「高德地址」与「GIS 消防资源」两个数据源，结果按 tab 分开展示。
2. 保留并强化现有圈选联动检索能力；统一「模糊（可选视口约束）」与「圈选」两种检索模式的结果回显与 1 万条上限。
3. 在检索框前缀加一个路径规划图标，点击打开**独立**的路径规划面板（车型 tab + 地图选点 + el-autocomplete 模糊 + 货车条件 + 分析按钮 + 上图 fit）。
4. 两个面板互不干扰：input-panel 是共用搜索框，折叠/展开可切换两个面板的显示隐藏。

### 范围

**含**：`circleQueryPanel.vue` 改造、`input-panel` 检索框新建、结果 tab 面板新建、路径规划面板新建、结果上图（关注点特效）、检索上限治理。
**不含**：消息协议 / 事件键 / DTO 改动；`NavPanel.vue` 重构（仅参照不改动）；地图 WMS 圈选渲染逻辑改动（复用现有）。

### 设计决策（已确认）

| # | 议题 | 决策 |
|---|------|------|
| D1 | 「gis 库视图选项」数据源 | `src/config/layers.ts` 的 `LAYER_SOURCE_CONFIGS`，`name` = 视图中文名（下拉显示），`id` = GeoServer typeName（WFS/WMS 查询用） |
| D2 | 路径规划面板形态 | **两个独立弹窗面板**，input-panel 的检索框与图标联动切换显示/隐藏/折叠 |
| D3 | 图层/资源范围 | 检索范围遍及 `LAYER_SOURCE_CONFIGS` 全部项（不限于 `ALL_RESOURCE_TYPES` 的 2 类） |
| D4 | 检索模式 | 两种模式共享结果回显与 1 万条上限：① 模糊（可选视口约束）；② 圈选（现有 `DWITHIN`） |
| D5 | 坐标体系 | 高德 POI 类接口返回**已是 WGS84**，直接用；仅路径规划保留 GCJ-02，需经 `amapGcj02ToWgs84` 转换 |
| D6 | 视图联动 | 选中视图下拉项时：**展开检索面板 + 自动重查该 `id` 图层资源 + 自动切到消防资源 tab**（不触发视口移动）；拖图联动仍不实现 |
| D7 | 图层文本名 | `name` **仅用于页面展示**；所有数据逻辑（查询、上图、过滤）**只认 `id`**（GeoServer typeName） |

---

## 3. 分层落点（对照分层铁律自检）

| # | 改动点 | 落在哪层 | 具体文件 | 理由 |
|---|--------|---------|---------|------|
| 1 | 检索状态（当前 tab、两个数据源结果、检索模式、上限计数、选中项） | **store** | `src/store/useSearchPanelStore.ts`（新增） | 跨 `circleQueryPanel` / `routePlanPanel` / 地图工具三处共享，需脱离组件生命周期 |
| 2 | 检索编排（模糊+视口 / 圈选 双模式、高德+WFS 双数据源、1 万条截断、坐标系归一） | **service** | `src/service/searchQuery.ts`（新增） | 纯数据编排，不含 UI，不碰 OL 实例；两个面板共用 |
| 3 | 常用视图下拉数据 | **const** | `src/config/layers.ts`（不改，复用 `LAYER_SOURCE_CONFIGS`） | 已是一份事实，不新建 |
| 4 | 资源上图（**WMS 图层**，条件过滤）+ 列表定位聚焦 + 路径线 | **plugin** | `src/components/map/MapTools/drawMapTools/SearchResultTool.ts`（新增，参照 `CircleQueryTool` 的 `ImageLayer<ImageWMS>` 模式） | 资源**不走前端渲染**，复用 GeoServer WMS 按 CQL 条件出图；仅路径线与单点聚焦特效用前端渲染 |
| 5 | 检索框 + 结果 tab 面板 UI | **view** | `src/components/map/component/circleQueryPanel.vue`（改造） | 视图层，只读 store、调 tool 公开方法 |
| 6 | 路径规划面板 UI | **view** | `src/components/map/component/routePlanPanel.vue`（新增） | 同上 |
| 7 | 面板类型常量 | **const** | `src/const/const.panel.ts`（改） | 新增 `SEARCH_PANEL` / `ROUTE_PLAN` 复用 |
| 8 | 面板 store 扩展（面板互斥/折叠状态） | **store** | `src/store/usePanelStore.ts`（改） | 承接两面板显示隐藏与折叠 |
| 9 | 面板挂载 | **view** | `src/components/map/index.vue`、`src/components/DrawMap/index.vue`（改） | 两处宿主都要挂载 |

> **自检**：无消息协议改动；无 controller 层改动（本次不涉及跨系统消息）；视图层不 import OL 实例（全部经 `SearchResultTool`）；资源上图经 WMS 服务端渲染，前端不持有要素几何；无 `any` 承接跨层 DTO（检索结果用 `src/types/search.ts` 的 interface）。

## 4. 涉及文件清单

### 新增（5）

| 文件 | 内容 |
|------|------|
| `src/types/search.ts` | `SearchResultItem` / `SearchResultList` / `SearchMode` / `SearchSourceTab` / `RoutePlanForm` 等跨面板 DTO |
| `src/service/searchQuery.ts` | `searchAmapAddress()` / `searchGisResources()` / `searchByCircle()` / `searchByViewport()` 四个查询编排函数 + 上限截断 + 坐标归一 |
| `src/store/useSearchPanelStore.ts` | 检索状态机：`queryText`、`activeTab`、`results`、`mode`、`loading`、`truncated`、`selectedView`；action `runSearch` / `switchTab` / `clearResults` |
| `src/components/map/MapTools/drawMapTools/SearchResultTool.ts` | 结果上图工具：`showPoints()`（关注点特效 + fit）/ `showRoute()`（路径线 + fit）/ `clear()` |
| `src/components/map/component/routePlanPanel.vue` | 路径规划面板（车型 tab、起终点选点与自动补全、货车条件、分析按钮） |

### 修改（4）

| 文件 | 修改点 |
|------|--------|
| `src/components/map/component/circleQueryPanel.vue` | `input-panel` 建成检索框（前置路径规划图标 + 后缀查询按钮）；`cq-panel` 加结果 tab（地址信息 / 消防资源）+ 列表 + 圈选半径与统计（保留）；两面板折叠联动 |
| `src/store/usePanelStore.ts` | 新增 `searchPanelOpen` / `routePlanOpen` / `searchPanelCollapsed` 状态与 setter |
| `src/const/const.panel.ts` | `PANEL_TYPES` 新增 `SEARCH_PANEL` |
| `src/components/map/index.vue`、`src/components/DrawMap/index.vue` | 挂载 `routePlanPanel`（`circleQueryPanel` 已挂载，改条件即可） |

### 不改（明确排除）

- `CircleQueryTool.ts` — 圈选 DWITHIN / WMS / updateStats **原样复用**，不改一行
- `apis/amap.ts` — `keywordSearch` / `inputTips` / `driving` / `drivingV2` 已具备，直接调用
- `service/geoserver.ts` — `getWFSFeatures` 已支持 `cql_filter` / `maxFeatures`，直接调用
- `config/layers.ts` — `LAYER_SOURCE_CONFIGS` 直接复用
- `baseComponent/amap/amapCoordinate.ts` — GCJ-02↔WGS84 转换直接复用
## 5. 关键流程

### 5.1 检索流程（需求 1）

```
用户点击 input-panel 检索框
  └─ 展开常用视图下拉（LAYER_SOURCE_CONFIGS 全部项）
       ├─ 展示文本 = name（仅页面展示）
       └─ 选项值   = id（GeoServer typeName，唯一数据依据）
            └─ 选中 → 输入框回填 name
                      + 展开检索结果面板
                      + 自动切 activeTab='resource'
                      + 自动重查该 id 图层资源（不触发视口移动 —— D6）

用户直接输入文本（不选视图）
  └─ activeTab='address'（默认地址信息 tab）

用户点击查询按钮
  ▼
store.runSearch()
  ├─ 无 selectedView（纯文本）
  │    ├─ searchAmapAddress(keyword)  → 高德 WGS84 → results.address（列表 + 单点定位）
  │    └─ searchGisResources(keyword) → WFS CQL LIKE 模糊 → results.resource（列表）
  └─ 有 selectedView（选了某个视图 id）
       └─ searchGisResources(keyword, { typeName: selectedView })
          → 只查该 id 对应的单个图层 → results.resource（列表）

【资源上图 = WMS 图层，不走前端渲染】
  ▼
同一份 CQL 条件同时喂给两个通道：
  ├─ WMS 通道：SearchResultTool.showResources(cqlFilter)
  │     → ImageLayer<ImageWMS> 的 LAYERS + CQL_FILTER 参数（沿用 CircleQueryTool 模式）
  │     → GeoServer 服务端出图，前端零渲染负担，1 万条也不卡
  └─ WFS 通道：geoserverApi.getWFSFeatures({ typeName, cql_filter, maxFeatures:10000 })
        → 只用于回显列表项（名称/地址/坐标/属性），不回显几何

用户点击列表某一条
  ▼
SearchResultTool.focusPoint(item.lngLat)
  ├─ 单点高亮 + 聚焦特效（脉冲/涟漪，区别于 WMS 的静态图钉）
  └─ view.animate({ center, zoom: max(cur+2, 17), duration: 400 })
```

**两种检索模式（共用同一份结果回显组件）**：

| 模式 | 触发 | 空间约束（CQL） | 列表上限 | 上图方式 |
|------|------|----------------|---------|---------|
| 模糊（可选叠加视口） | 点查询按钮；选中视图项（自动触发） | `strToLowerCase(name) LIKE '%kw%'`（+ 可选 `BBOX`） | `maxFeatures=10000` | WMS 图层按同一 CQL 出图 |
| 圈选 | `CircleQueryTool` 画圆完成 | `DWITHIN(geom, Point, r, meters)` | `maxFeatures=10000` | 复用 CircleQueryTool 已有 WMS 图层 |

> **D6 说明**：视图下拉选中 → **展开面板 + 自动重查该 `id` 图层资源 + 切资源 tab**（不触发视口移动）。拖图自动重查仍**不实现**。
> **Q4 说明（重要）**：资源**不走前端渲染**，完全沿用现有 WMS 模式（与 `CircleQueryTool` 一致）——WMS 用同一份 CQL 条件出图，WFS 只负责列表回显。因此**不存在 1 万条前端渲染卡顿问题**，1 万条上限只约束 WFS 列表与 WMS 的 CQL 条件。
> **Q2 说明**：模糊字段统一用 `name`，不探查；单图层失败用 `Promise.allSettled` 兜底跳过。
> 圈选模式的**统计总数据保持现状不变**（`updateStats` 的 `total` / `perType` 继续走），只是在其下追加结果列表回显；列表与统计数据同源于同一次 WFS 查询，避免"统计数与列表数不一致"。
### 5.2 路径规划流程（需求 2）

```
用户点击 input-panel 前缀的路径规划图标
  ▼
panelStore.setRoutePlanOpen(true)   → routePlanPanel 独立弹出（与 cq-panel 互斥）
  ▼
用户选择车型 tab
  ├─ 'car'（小汽车）→ amapApi.driving({ origin, destination, strategy:0 })
  └─ 'truck'（货车） → amapApi.drivingV2({ origin, destination, walk:false, load, height, width })
| 驾车路径规划（货车/步行 v5） | `amapApi.drivingV2({ origin, destination, walk, load, height, width })` | 货车条件 = 载重/限高/限宽，来自面板输入框 |
                                            ↑ 货车条件输入框的值在此拼入

起点/终点录入（二选一）
  ├─ 地图选点：map.once('singleclick') → 捕获 lngLat → 反查地址文本回填输入框
  └─ 文本模糊：el-autocomplete → amapApi.inputTips({ keywords }) → 候选列表
                └─ 选中后写入对应 coord + 回填文本 + 标记「已选中」（可清除）

起点与终点均已选中
  ▼
实时查询（car/truck tab：自动触发；货车条件 tab：需点「分析」按钮手动触发）
  ▼
amapApi.driving / drivingV2 → RouteResult
  ▼
RouteResult.features[].geometry.coordinates (GCJ-02)
  ▼
amapGcj02ToWgs84（逐点转换）→ SearchResultTool.showRoute(LineString)
  ├─ 绘制路径线（沿用现有 route 线样式）
  ├─ 起点/终点标记（不同颜色 + 图标）
  └─ view.fit(pathExtent, { padding:[80,80,80,80], duration:300 })
```

**历史记忆**：起终点文本按 tab 分别存入 `useSearchPanelStore`（走 `piniaPersist` 封装），下次打开面板自动回填。清除按钮单独清空对应项的文本 + 坐标 + 已选中标记。

### 5.3 两面板联动规则

| 事件 | 行为 |
|------|------|
| 点路径规划图标 | `routePlanOpen = true` + **折叠检索资源面板**（`searchPanelCollapsed = true`） |
| 点检索框（input-panel） | **收起路径规划面板**（`routePlanOpen = false`）+ 展开视图下拉 |
| 关闭路径规划面板 | `routePlanOpen = false`，检索面板保持原状 |
| 折叠按钮（检索面板自带） | `searchPanelCollapsed` 取反 |
| 选中视图下拉项 | 展开检索面板（`searchPanelCollapsed = false`）+ 切资源 tab + 自动重查（D6） |
| 圈选工具激活 | 强制展开检索面板（结果需在此回显） |

> **互斥原则**：两个面板任一时刻只有一个处于展开态，互斥折叠而非并存。
## 6. 接口与契约影响

| 项 | 是否变更 | 同步位置 |
|----|---------|---------|
| 消息事件键 | **否** | — |
| 协议 DTO | **否** | — |
| HTTP 接口 | **否**（复用已有 `amapApi` / `geoserverApi`） | — |
| `config/layers.ts` | **否**（复用，不新增视图） | — |
| 新增事件键需求 | 否 | — |

> **注意**：本次不新增任何 `MESSAGE_EVENT_KEY`，因此**不触发** `docs/source/07-协议事件清单.md` 与 `协议层DTO Schema.tsd` 的同步流程。

### 6.1 复用的接口清单（关键参数）

| 用途 | 接口 | 关键参数 |
|------|------|---------|
| 地址模糊查询 | `amapApi.keywordSearch({ keywords, offset:10 })` | `keywords` = 输入文本；返回 `PoiFeatureCollection` |
| 输入提示（自动补全） | `amapApi.inputTips({ keywords, city })` | 同上，用于路径规划起终点 |
| 驾车路径规划（小汽车） | `amapApi.driving({ origin, destination, strategy:0 })` | `origin`/`destination` = `lng,lat` 串 |
| 驾车路径规划（货车/步行 v5） | `amapApi.drivingV2({ origin, destination, walk, load, height, width })` | 货车条件 = 载重/限高/限宽，来自面板输入框 |
| GIS 资源模糊查询（**列表**） | `geoserverApi.getWFSFeatures({ typeName, cql_filter, maxFeatures:10000 })` | `typeName` = `LAYER_SOURCE_CONFIGS[].id`（GeoServer typeName）；`cql_filter` = `strToLowerCase(name) LIKE '%kw%'` |
| GIS 资源**上图** | WMS 服务端出图：`ImageLayer<ImageWMS>` 的 `LAYERS` + `CQL_FILTER` 参数（沿用 `CircleQueryTool.ts:276` 模式） | 与列表**共用同一份 CQL**；WMS 负责出图，WFS 负责列表 |

> **多图层检索策略**：无 selectedView 时检索范围为 `LAYER_SOURCE_CONFIGS` **全部项**（D3，不按 `enabled` 过滤），一次检索 `Promise.allSettled` 并发 N 个 WFS 请求（仅回显列表）+ 1 个多图层 WMS 请求（`LAYERS` 逗号拼接 + `CQL_FILTER` 分号分隔，与 `CircleQueryTool.updateWMSLayer` 完全一致）。有 selectedView 时只处理该 `id` 单个图层。**上限 1 万条只约束 WFS 列表**（`maxFeatures=10000`，超出即截断 + 提示）；WMS 是服务端出图，不受条数影响。

### 6.2 WMS 上图参数规格（沿用 CircleQueryTool 模式）

资源上图**完全复用** `CircleQueryTool.updateWMSLayer`（`src/components/map/MapTools/drawMapTools/CircleQueryTool.ts:255-297`）已验证的模式：

```ts
new ImageLayer({
  source: new ImageWMS({
    url: geoserverApi.getWMSServiceUrl('gis'),
    params: {
      LAYERS: 'gis:xxx,gis:yyy',        // 多图层逗号拼接
      VERSION: '1.1.0',
      FORMAT: 'image/png',
      TRANSPARENT: true,
      CQL_FILTER: 'filterA;filterB',      // 每图层一个 filter，分号分隔（顺序与 LAYERS 一一对应）
    },
    serverType: 'geoserver',
    crossOrigin: 'anonymous',
    ratio: 1.5,
  }),
  className: LAYER_NAMES.ES_WMS_LAYER,
  zIndex: 100,
})
```

**要点**：

| # | 要点 | 说明 |
|---|------|------|
| 1 | `CQL_FILTER` 与 `LAYERS` 按序一一对应 | N 图层 → N 个 filter 用 `;` 分隔，顺序必须与 `LAYERS` 一致，否则过滤错位 |
| 2 | 同一份 CQL 同时喂 WMS 与 WFS | WMS 出图、WFS 出列表，两边看到的过滤结果必须一致，避免「图上有、列表无」 |
| 3 | 图层已存在则 `updateParams` 不重建 | 与 `CircleQueryTool` 一致，避免每次查询重建图层导致闪烁 |
| 4 | 无结果时用 `CQL_FILTER: '1=0'` | 沿用现有做法：显式返回空图，而非保留上次结果造成误解 |
| 5 | `ratio: 1.5` | 提升 WMS 出图清晰度（沿用现有配置） |
| 6 | `zIndex: 100` | 保证在业务矢量图层之上、底图之下 |

> **单点聚焦特效与 WMS 图层不冲突**：WMS 是服务端栅格出图（无法对单个要素加特效），所以「点击列表项聚焦」用前端单独渲染的一个高亮点（`VectorLayer` + 单 Feature + 脉冲样式），叠在 WMS 图层之上即可。
## 7. 异常与兜底

| 场景 | 处理 |
|------|------|
| 高德接口失败 | 该 tab 显示"地址查询失败"，另一 tab 结果**不受影响**（两源并行、互不阻塞）。`alovaMapProxy` 已配置错误统一走 `AppError` |
| GeoServer WFS 失败 | 单图层失败只丢该图层，`Promise.allSettled` 不用 `all`；面板显示"部分图层查询失败"，其余图层结果照常显示 |
| WFS 返回 0 条 | 该 tab 显示空状态"未找到匹配结果"，不报错 |
| 超过 1 万条 | WFS 列表静默截断到 10000 + 提示条"结果已截断，仅显示前 10000 条"，`truncated=true`；WMS 出图不受影响 |
| 结果坐标越界/NaN | WFS 返回的坐标过滤掉非有限值（不影响 WMS 出图）；WFS 无坐标的项在列表里置灰不可点 |
| 高德 POI 返回坐标 | **无需转换**（代理已归一为 WGS84），直接上图并可直接用作 WFS 空间约束 |
| 路径规划失败 | `ElMessage.error` 提示（如"未找到可用路径"），保留已填起终点供重试 |
| 起终点只选了一个 | 规划按钮置灰 / 实时查询不触发 |
| 视图选项对应的图层不存在 | `selectedView` 置空、退回纯文本检索路径 |
| 组件卸载 | store 的 action 里持有请求，卸载后 `onUnmounted` 调 `clearResults()`；`SearchResultTool` 在 `destroy()` 里清图层与监听 |

### 7.1 坐标体系（已澄清，非风险）

高德代理服务的坐标系行为**已由接口文档明确**（§1.3）：

| 接口类别 | 返回坐标系 | 本项目处理 |
|---------|-----------|-----------|
| POI 类（keyword-search / around-search / polygon-search / polygon-detail / detail / regeo / input-tips） | **已转为 WGS84** | **直接用，不转换** |
| 路径规划类（driving / driving-v2 / multi-waypoint） | 保留高德 **GCJ-02** | 经 `amapGcj02ToWgs84` 逐点转换后上图 |
| 地址解析（analyze-address） | 保留 GCJ-02 | 下游固定消费方刻意不转换，本次不用 |

> **结论**：R1 风险降级为「路径规划结果需转换」这一个明确动作，POI 检索链路无偏移风险。
> POI 的 WGS84 坐标还能**直接用作 WFS 的空间约束**（BBOX / DWITHIN），无需中转。
## 8. 验证方式

- [ ] `pnpm lint` 无**新增**报错（基线 193）
- [ ] `pnpm build` 通过
- [ ] **检索-地址**：输入"深圳"→ 点查询 → 地址信息 tab 出高德结果 → 点某条 → 地图 flyTo + 关注点脉冲
- [ ] **检索-资源**：输入"消防"→ 点查询 → 消防资源 tab 出 WFS 结果 → 点某条 → 同上
- [ ] **视图下拉**：点检索框 → 下拉出 `LAYER_SOURCE_CONFIGS` 的中文名 → 选"消防栓"→ 输入框回填"消防栓" → 查询 → 自动落在消防资源 tab 且范围为该视图
- [ ] **纯文本默认地址**：不选视图直接输入文本 → 查询 → 自动落在地址信息 tab
- [ ] **上限**：构造 >1 万条查询 → 列表截断到 10000 + 显示截断提示
- [ ] **圈选联动**：画圆 → cq-panel 统计数更新 + 列表回显圈选内资源 + 与统计数一致
- [ ] **路径规划-小汽车**：点图标 → 面板弹出 → 地图选起点 → autocomplete 输终点 → 自动出路径 → fit + 上图
- [ ] **路径规划-货车**：切货车 tab → 填货车条件 → 点分析 → 出货车路径
- [ ] **历史记忆**：填过起终点 → 关闭再开面板 → 自动回填
- [ ] **清除**：点清除 → 该项文本 + 坐标 + 标记全清
- [ ] **两面板联动**：开路径规划面板时检索面板收起；关闭路径规划面板时检索面板恢复

## 9. 依赖与风险

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| R1 | 路径规划坐标为 GCJ-02（POI 类已是 WGS84） | 路径线偏移数百米 | 仅路径规划结果经 `amapGcj02ToWgs84` 转换后上图（§7.1） |
| R2 | 多图层并发 WFS（≈8 个请求） | 首屏慢、GeoServer 压力大 | `Promise.allSettled` 并发 + 每层 `maxFeatures` 封顶 + 总量 1 万截断；必要时加请求节流 |
| R3 | GIS 图层模糊字段是否统一为 `name` | 若某图层无 `name` 字段，CQL 报错 → 该图层查询失败 | ✅ 已定不探查：`Promise.allSettled` 兜底，失败图层跳过并在 UI 标注「该图层不支持模糊检索」 |
| R4 | （拖图联动已明确不做） | — | D6 仅保留"选中视图项自动重查" |
| R5 | 资源上图性能 | ~~1 万条前端渲染卡顿~~ | ✅ **已消除**：资源走 WMS 服务端出图（前端零渲染），1 万条只影响 WFS 列表回显；列表用虚拟滚动即可 |
| R6 | 旧系统截图仅供参考 | 布局细节与实际需求可能有出入 | UI 以截图参考、以需求文字为准；实现后请用户验收并微调 |
| R7 | `LAYER_SOURCE_CONFIGS` 里 `enabled` 大多为 `false` | 视图下拉可能为空或太少 | 下拉取**全部** `LAYER_SOURCE_CONFIGS`（不过滤 enabled），检索时才按需求决定是否限 enabled |

## 10. 待确认事项（实现前请拍板）

| # | 议题 | 我的建议 |
|---|------|---------|
| Q1 | 视图下拉是否过滤 `enabled` | ✅ 已定：**不过滤**，取全部 `LAYER_SOURCE_CONFIGS`（`name` 展示、`id` 查询，见 D7） |
| Q2 | GIS 资源检索的模糊字段 | ✅ 已定：**不探查**，直接用统一字段名 `name` 构造 CQL（各图层同构，见 D7 只认 id） |
| Q3 | 拖图是否自动重查 | ✅ 已定：**不做**。仅"选中视图项 → 展开面板 + 自动重查该 id 图层 + 切资源 tab"（D6） |
| Q4 | 1 万条资源上图方式 | ✅ 已定：**WMS 图层按 CQL 条件出图**（沿用 `CircleQueryTool` 模式，服务端渲染）；**WFS 仅回显列表**；点击列表项单点聚焦 + 特效定位 |
| Q5 | 检索框点开时是否收起路径规划面板 | ✅ 已定：**互斥折叠** —— 点检索框收起路径规划面板；点路径规划图标展开时折叠检索资源面板 |
