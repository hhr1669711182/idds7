## 2026-11-13 街道级选区不查天气

- 背景: WeatherPanel 街道级(末级)区划高德查不到天气, 逐级回退请求浪费
- 改动: AreaWeatherController 新增 isStreetLevel 私有判断(在 expandedChildren 且不在 rootChildren);
  selectArea 末级只 loadFence 不 loadWeather, 区县级及以上维持天气+围栏;
  refreshWeather 定时器选中末级时直接跳过
- 验证: pnpm lint 0 报错

---

## 2026-11-13 FeatureClickQuery 取数管道合并：队站并入单次多图层查询

### 背景
用户反馈「点一次地图触发两次接口调用」。根因：`resolveClick` 串行两步取数——
Call 1 `resolveWmsStation` 单独查队站层（`FEATURE_COUNT=1`），未命中再 Call 2 `queryGenericFeature`
查全部勾选层（`FEATURE_COUNT=20`）。命中**资源**（消防栓/重点单位）时 Call 1 恒 null，白跑一次。
用户确认「精确队站过滤服务端 CQL 已做（`useDispatchEntangled` 把队站 source 设成
`buildStationCqlFilter(dispatchIds)`），前端不维护 dispatchIds 白名单，读实时 CQL 回填即可」。

### 方案（方向 B，已确认）
砍掉 `resolveWmsStation`，队站层并入 `queryGenericFeature` 的单次 `GetFeatureInfo`（`query_layers` 含 `gis:view_res_org_dept`）：

1. **实时 CQL 回填**（新增 `readLayerCqlFilter(layerName)`）：per-layer `cql_filter` 从各可见 WMS 图层真实 source `getParams().CQL_FILTER` 读（替换原写死全 `1=1`）；无对应图层回落 `1=1`。调派态过滤完全靠服务端 CQL，前端零白名单。
2. **客户端优先挑选 + kind 归一化**（新增 `normalizeHit(...)`）：命中后按 `feature.id` 图层前缀 `view_res_org_dept`（去 `gis:` workspace 前缀，与 `featureDetailPanel` 的 `isStation` 口径一致）优先挑队站要素、挑不到回落 `features[0]`（保持旧首位语义）；队站还原 `kind:'station'`，其余 `kind:'feature'`（全量 `features` 仍下发供 handler 挑选）。下游 `route()`、`DispatchT1.ts:703` 的 `result.kind === 'station'` 分支**零改动**。

### 涉及文件
- `src/baseComponent/OpenlayersMap/FeatureClickQuery.ts`：删 `resolveWmsStation`（~50 行）；`resolveClick` 去掉对它的调用；`queryGenericFeature` 改 `cql_filter` 逐层 `readLayerCqlFilter` + 返回改走 `normalizeHit`；新增 `readLayerCqlFilter`/`normalizeHit` 两私有方法。`STATION_LAYER_NAME`/`TileLayer`/`TileWMS`/`LayerConfig`/`WfsFeature` 均仍被使用，无未使用告警。
- `tests/components/featureClickQuery.spec.ts`：路径3 mock `id='env_fire_water.7'` 不含队站前缀→仍 `feature`，断言不变；fake map `getLayers()` 空→`readLayerCqlFilter` 安全回落。**无需改测试。**
- `herness/05-共享上下文/当前状态摘要.md`：点击链路条目追加「2026-11-13 取数管道合并约定」。

### 门禁
- `pnpm lint`（vue-tsc --noEmit）→ 0 报错 ✅
- vitest runner 因 Node v25 + undici 8.12.1 预存在 worker-bootstrap 故障本地无法执行（与本次无关）；测试改动靠 lint + 浏览器手动点验。

### 待用户浏览器验证
- 主图点资源（消防栓/重点单位）：单次请求、弹资源详情、不再重复
- 主图点队站：单次请求、弹队站详情（`kind:'station'` → `openStation`）
- 调派态点被 dispatchIds 过滤的队站：不返回、不弹
- 调派态点保留的队站：正常弹队站详情

---

## 2026-11-16 路径规划路段高亮修复

### 问题
1. 关闭路径规划面板后，路段高亮线未清除（残留地图上）
2. 点击同一步骤无法取消高亮（无 toggle 逻辑）
3. 高亮色与"未知"路段颜色撞色（都用 cyan 系 #25C2F2）

### 改动
1. `routePlanPanel.vue` — `onClose` 增加 `resultTool?.clearFocus()` 调用，关闭时同步清除高亮层
2. `routePlanPanel.vue` — `onSelectStep` 增加二次点击同一步骤取消高亮的 toggle 逻辑
3. `SearchResultTool.ts` — `focusRouteSegment` 改用 `shiftHue(+60°)` 色相偏移色，与未知路段区分
4. `src/lib/index.ts` — 移除未使用的 `createMapRelayReader` 导入（lint TS6133）

### 门禁
- `pnpm lint` — 0 报错 ✅
- `pnpm lint:baseline` — 0 新增 ✅
- `pnpm harness:check` — 全部通过 ✅
