# GIS-W46 路径规划数据分析 + GeoServer 代码加固 — 技术方案

## 0. 设计先行：方案确认状态

- 当前状态：`已确认`
- 确认时间：2026-11-09
- 确认依据（用户原话）：「都按推荐来，然后 geoserverWorkspace 的 workspace 在 geoserver 中配置工作空间都不一定一样的，单一配置入口不现实」
- 迭代来源：`GIS-W46-实现阶段代码落地清单.md`（实现版 v2）

## 1. 文档信息

- 关联迭代：GIS W46（G 域 GeoServer 加固 + P 域路径规划数据分析，共 9 项）
- 作者 / 日期：huanghuanrong / 2026-11-09
- 关联需求：`GIS-W46-实现阶段代码落地清单.md`

## 2. 方案概述

- **背景**：本迭代实现范围 = G 域（GeoServer 代码加固，G03～G05）+ P 域（路径规划数据分析，P01～P06），全部落 `src/**`。
- **目标**：把 GeoServer 接口层收口为「类型明确 + 工作空间可推导 + 有探活降级」；把 4 类路径入口的分析口径收敛为单一 DTO，并在此之上做 TMC 指标、候选对比、轨迹统计、结果面板、路段衔接。
- **范围**：9 个 Task 全部落地，分两批（B1 = G 域，B2 = P 域）。
- **明确不做**：
  - 不做「迁移 4 个路径消费方」——实测前 3 个已接入 `routeBase`，`useDispatchEntangled` 无路线上图逻辑（详见 §11 偏差 1）。
  - 不改 `docs/source/**` 协议契约（本次无消息事件键 / 协议 DTO 变更）。
  - 不改 `package.json` / `vite.config.ts` / `tsconfig.json`，不新增 npm 依赖（turf 已在依赖内）。
  - 不新增全局 workspace 配置（用户明确否决，理由见 §3-G03）。

## 3. 分层落点

| # | Task | 落点层 | 文件 | 理由 |
|---|------|--------|------|------|
| 1 | G03 | 接口层 + 配置层 | `src/apis/geoserver.ts`（改）、`src/apis/geoserverTypes.ts`（新）、`src/config/env.ts`（改） | 接口层按业务域集中；返回类型属接口契约 |
| 2 | G04 | 工具层 + 接口层调用点 | `src/utils/cql.ts`（新）、`src/controller/core/business/IncidentNearbyResourceQuery.ts`（改）、`src/apis/searchQuery.ts`（改）、`src/components/map/MapTools/drawMapTools/CircleQueryTool.ts`（改）、`src/baseComponent/OpenlayersMap/FeatureClickQuery.ts`（改） | CQL 字符串拼接无业务语义 → `utils`；图层名/字段名等业务语义留在原位 |
| 3 | G05 | 传输层 + 接口层 + 组合式函数 | `src/service/alovaGeo.ts`（改）、`src/apis/geoserver.ts`（改）、`src/composables/useGeoServerHealth.ts`（新） | 超时属传输层；探活属接口层；健康态属可复用 UI 状态 |
| 4 | P01 | 类型层 + 工具层 | `src/types/routeAnalysis.ts`（新）、`src/baseComponent/tools/routeAnalysis.ts`（新） | 分析 DTO 与消息协议无关，接口层/跨层 DTO 先例是 `src/apis/types.ts` 与 `src/types/search.ts` |
| 5 | P02 | 工具层 | `src/baseComponent/amap/routeCongestion.ts`（改） | 已有路况归一文件，扩指标不另起炉灶 |
| 6 | P03 | 工具层 | `src/baseComponent/tools/routeAnalysis.ts`（扩 `compareCandidates`） | 与 P01 同模块，复用 `routeAlternatives.ts` 已有档位判定 |
| 7 | P04 | 工具层 | `src/utils/trackStatistics.ts`（新） | 纯计算、无 OL 依赖，可单测 |
| 8 | P05 | 视图层 | `src/components/map/component/routePlanPanel.vue`（改）、`src/components/dispatchMap/VehicleTrackPanel.vue`（改） | 扩既有面板，不新建面板 |
| 9 | P06 | 工具层 + hooks | `src/baseComponent/tools/routeContinuity.worker.ts`（新）、`src/hooks/useRouteContinuityWorker.ts`（新）、`src/baseComponent/tools/routeAnalysis.ts`（扩 `ensureSegmentContinuity`） | 照现有 `routeMetrics.worker.ts` + `useRouteMetricsWorker.ts` 范式 |

> 自检：无越层。`core/generic/**` 未触碰；`core/business/**` 只把纯字符串计算下沉到 utils，未引入引擎依赖；跨层数据全部用具名 interface，无 `any`。

## 4. 涉及文件清单

### 新增

- `src/apis/geoserverTypes.ts` — WFS / WMS / DescribeFeatureType 返回 DTO
- `src/utils/cql.ts` — CQL 条件构造（空间 + 字面量转义 + 多图层拼接）
- `src/composables/useGeoServerHealth.ts` — GeoServer 健康态 + 降级提示
- `src/types/routeAnalysis.ts` — `RouteAnalysisDTO` 等分析契约
- `src/baseComponent/tools/routeAnalysis.ts` — `buildRouteAnalysis` / `compareCandidates` / `ensureSegmentContinuity`
- `src/utils/trackStatistics.ts` — 轨迹速度分布 / 停留点 / 异常检测 / 分段指标
- `src/baseComponent/tools/routeContinuity.worker.ts` — 路段衔接 Worker
- `src/hooks/useRouteContinuityWorker.ts` — Worker 句柄与主线程兜底
- `tests/unit/cql.spec.ts`
- `tests/unit/geoserverApi.spec.ts`
- `tests/unit/routeAnalysis.spec.ts`
- `tests/unit/trackStatistics.spec.ts`

### 修改

- `src/apis/geoserver.ts` — 泛型化返回类型、workspace 逐请求推导、参数顺序统一、新增探活方法
- `src/config/env.ts` — 新增 `geoserverWorkspace` 缺省值读取（**仅作缺省兜底**，非全局单一来源）
- `src/service/alovaGeo.ts` — 挂 `timeout` 缺省值
- `src/controller/core/business/IncidentNearbyResourceQuery.ts` — CQL 构造下沉，业务常量留在原位
- `src/apis/searchQuery.ts` — 圈选口径统一为 INTERSECTS + 复用 utils
- `src/components/map/MapTools/drawMapTools/CircleQueryTool.ts` — 圈选口径统一
- `src/baseComponent/OpenlayersMap/FeatureClickQuery.ts` — 多图层 CQL 占位复用 utils
- `src/baseComponent/amap/routeCongestion.ts` — 扩 TMC 指标
- `src/components/map/component/routePlanPanel.vue` — 恢复并升级分析区
- `src/components/dispatchMap/VehicleTrackPanel.vue` — 加轨迹统计区块

## 5. 关键流程

### 5.1 G03 · GeoServer 接口层

```
调用方 → geoserverApi.getWFSFeatures(params, workspace?)
      → workspace 缺省推导：显式入参 > 从 typeName 前缀推导（'gis:env_area' → 'gis'）> appEnv.geoserverWorkspace（'gis'）
      → alovaGeoInstance.Get<WfsFeatureCollection<T>>(url, { params })
```

- **工作空间不做全局单一配置**（用户决策）：GeoServer 工作空间是服务端图层属性，不是部署环境属性。
  - 图层工作空间的正确载体已存在：`src/config/layers.ts` 的 `LayerConfig.workspace`、`MarkDrawLayer.workspace`——逐图层配置，本就不共用一个值。
  - typeName 本身是 `workspace:layer` 形式，可直接推导。
  - `appEnv.geoserverWorkspace` 仅作**推导不出时的缺省兜底**（`'gis'`），不新增 env 变量——现有各环境行为完全不变。

### 5.2 G04 · CQL 口径统一

```
CQL 构造统一走 src/utils/cql.ts
  ├─ buildCircleIntersectsCql(geomField, center, radiusMeters)  ← 测地圆 INTERSECTS（口径统一后唯一入口）
  ├─ buildDwithinCql(center, radiusMeters)                      ← 保留但不作为默认口径
  ├─ buildViewportCql(viewport)                                 ← BBOX
  ├─ buildKeywordCql(keyword)                                   ← LIKE
  ├─ buildMultiLayerCql(filters)                                ← 多图层 WMS CQL 占位（';' 分隔）
  └─ buildLiteral(value)                                        ← 单引号转义

圈选检索链路：useSearchActions.runCircleSearch
  → apis/searchQuery.buildResourceFilter → buildCircleIntersectsCql
  → 同一份 CQL 同时给 WFS（列表）与 WMS（上图）→ 图与列表口径一致
```

- **空间口径统一为 `INTERSECTS` 测地圆**：依据 `IncidentNearbyResourceQuery.ts` 既有实测结论（该 GeoServer 的 `DWITHIN(...meters)` 不可靠）。
- 影响面（**产品行为变更**）：圈选检索结果集与 `CircleQueryTool` 上图范围会变化，需人工验收比对。

### 5.3 G05 · 探活与降级

```
底座 attach 后 → useGeoServerHealth.check()
  → geoserverApi.pingGeoServer(workspace)  （GetCapabilities，timeout 3000ms）
  → 成功：health='online'
  → 失败：health='offline' → ElMessage.warning 一次（带重试入口）
           + WMS 图层 error 事件 → 图层占位说明
```

- 探活**不阻塞**地图渲染：GeoServer 只服务业务图层，底图与前端矢量功能不依赖它。

### 5.4 P 域 · 分析链路

```
P01 buildRouteAnalysis({ path, tmcs, distanceMeters, durationSeconds, rank })
      → RouteAnalysisDTO { distanceMeters, durationSeconds, tmc, candidateRank, segments }
P02 routeCongestion.summarizeTmc(tmcs, path)  → TmcMetrics { smoothRatio, slowRatio, jamRatio, unknownRatio, coverage, jamDurationSeconds }
P03 compareCandidates(candidates[])          → 对比表 + 最优标尺（复用 routeAlternatives 的 fastest/shortest/balanced）
P04 analyzeTrackStatistics(points[])         → 速度分布 / 停留点 / 异常 / 分段指标
P05 面板消费上述 DTO（routePlanPanel / VehicleTrackPanel）
P06 ensureSegmentContinuity(segments)        → 段末≠下段首时补点，保证几何连续
```

## 6. 接口与契约影响

| 项 | 是否变更 | 同步位置 |
|----|---------|---------|
| 消息事件键 | 否 | — |
| 协议 DTO | 否 | `docs/source/**` 不同步 |
| HTTP 接口 | 是 | `src/apis/geoserver.ts`：返回类型泛型化、`getWMSFeatureInfo` 参数顺序统一、新增 `pingGeoServer` |
| 状态机 | 否 | — |
| 环境变量 | 否 | 不新增（`appEnv.geoserverWorkspace` 为代码内缺省常量，不读 env） |

### 6.1 `getWMSFeatureInfo` 签名统一（本次变更点）

```ts
// 现状（与其余 3 个方法顺序相反）
getWMSFeatureInfo(workspace: string, params: WMSFeatureInfoParams)
// 改为
getWMSFeatureInfo(params: WMSFeatureInfoParams, workspace?: string)
```

影响 4 个调用点：`FeatureClickQuery.ts`（2 处）、`DispatchT1.ts`（1 处）、`DispatchT1.vue`（1 处）、`apis/layers.ts`（1 处）。

## 7. 异常与兜底

| 场景 | 处理 |
|------|------|
| GeoServer 不可达 | 探活失败 → 一次性 warning 提示（带重试入口）+ 图层占位；地图底图 / 前端矢量不受影响 |
| WFS 返回空 | 沿用现状空态提示，不改口径 |
| TMC 段缺失 / status 未知 | 归 `unknown` 单列，**不并入畅通**（避免高估畅通占比） |
| 轨迹无数据 | 面板空态；沿用现状口径（仅贵州车辆有历史轨迹） |
| Worker 不可用（`typeof Worker === 'undefined'`） | 回退主线程同步计算，照 `useRouteMetricsWorker` 现有兜底模式 |
| 轨迹样本有限 | 统计面板标注「样本有限」，不外推结论 |

## 8. 验证方式

- [ ] `pnpm lint` — 目标 **0 报错**（基线已归零，判定标准为零报错）
- [ ] `pnpm lint:baseline` — 无新增
- [ ] `pnpm harness:check` — 文档体量 / css-vars / backdrop-filter / asset manifest 全过
- [ ] `pnpm test` — 现有 55 文件 579 项不回归 + 新增 4 个用例文件
- [ ] `pnpm build` — 构建通过
- [ ] 手动验证路径：
  - 路径规划面板 → 出距离/时长/路况占比/候选对比表
  - 车辆轨迹面板 → 出速度分布/停留点/分段指标
  - 断开 GeoServer（或改错 `VITE_GEOSERVER_URL`）→ 出降级提示且地图仍可用
  - 圈选检索 → 图与列表结果一致（口径统一后人工比对）

### 8.1 待测接缝（先定接缝再写用例）

| 接缝 | 测法 | 用例 |
|------|------|------|
| `src/utils/cql.ts` 纯函数 | vitest 直接调 | `tests/unit/cql.spec.ts` |
| `geoserverApi` 接口层 | vitest + `@alova/mock` | `tests/unit/geoserverApi.spec.ts` |
| `routeAnalysis` 纯函数 | vitest 直接调 | `tests/unit/routeAnalysis.spec.ts` |
| `trackStatistics` 纯函数 | vitest 直接调 | `tests/unit/trackStatistics.spec.ts` |

## 9. 依赖与风险

- 依赖：现有依赖即可（turf 已在依赖内；OL 10 / Vue 3.5 / Pinia 3 / alova 3.5.1 `timeout` 原生支持已核 typings）。
- 风险：
  - **G03 类型收窄**：`WFSFeatureParams` 的 `[key: string]: any` 索引签名必须移除，改为显式字段；21 个调用点若有未列字段会 TS 报错 → 当场真修，不攒基线。
  - **G04 口径变更**：圈选结果集变化（产品行为变更）→ 回滚 = 恢复 `searchQuery.ts` / `CircleQueryTool.ts` 原条件。
  - **P05 样式**：违反 token 规范会被 `check-css-vars.mjs` 拦下。
  - **G05 探活噪音**：探活失败提示需限次，避免反复弹。
- 回滚方式：B1（B 域）与 B2（P 域）分批落地，可独立 revert；单 Task 均为新增文件为主，回滚面小。

## 10. 待确认项

已全部按推荐确认：

- [x] P01 收敛范围 = 只建 DTO + 单一分析入口，**不迁消费方**（「迁移 4 个消费方」对象已不存在）
- [x] G04 空间口径 = 统一到 `INTERSECTS` 测地圆（圈选结果集变化，需人工验收）
- [x] TMC 缺省兜底 = 归 `unknown` 单列，不按畅通
- [x] `getWMSFeatureInfo` 参数顺序 = 统一为 `(params, workspace?)`
- [x] workspace = **逐图层 / 逐请求推导**，不做全局单一配置入口

## 11. 与实现清单的偏差（实测核对结果）

| # | 清单说法 | 代码实测 | 本方案处置 |
|---|---------|---------|-----------|
| 1 | P01 迁移 4 个消费方（DispatchT1 / VehicleTrackRenderer / useDispatchEntangled / SearchResultTool） | 前 3 个已接入 `routeBase`；`useDispatchEntangled` 无路线上图逻辑（只做路线预览数据准备） | 不迁；P01 收敛为 DTO + 单一分析入口 |
| 2 | G04 新建 `buildCircleIntersectsCql` 放 `src/utils/` | 已存在 `IncidentNearbyResourceQuery.ts:160`（turf 测地圆 + `SRID=4326` 轴序前缀） | 下沉归位到 `src/utils/cql.ts`，business 层改 import，不重复造 |
| 3 | G04 统一 CQL 口径 | 既有实测结论：`DWITHIN(...meters)` 在该 GeoServer 不可靠；但 `searchQuery.ts` / `CircleQueryTool.ts` 仍用 DWITHIN | 统一到 INTERSECTS（产品行为变更，已确认） |
| 4 | P06 新建 `src/worker/` | 无该目录；已有范式 `routeMetrics.worker.ts` + `useRouteMetricsWorker.ts` | 照现有范式，纯算法留可单测普通函数 |
| 5 | geoserverApi 22 个消费方 | 实测 21 个；多数已自带类型断言 | 按「不预先列全调用点」执行，重点改造 `addressRobot.ts`（GeoJSON 入参）与 `FeatureClickQuery.ts` |
| 6 | P01/P05 DTO 放 `controller/core/protocol/` | `protocol/` 是跨系统消息协议层（真相源 `docs/source/协议层DTO Schema.tsd`）；接口层类型先例 `src/apis/types.ts`，跨层面板 DTO 先例 `src/types/search.ts` | 偏离：落 `src/types/routeAnalysis.ts` + `src/apis/geoserverTypes.ts` |

---

> 实现过程中若分层、文件范围、对外契约、数据结构、安全策略、风险或回滚方式发生实质变化，先更新本方案并重新获得用户确认，再继续编码。