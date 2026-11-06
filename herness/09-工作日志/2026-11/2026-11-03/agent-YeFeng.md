# agent-YeFeng 工作日志 2026-11-03

## 任务：警情出动车辆接口对接 + 多车多路线历史轨迹并行上图

### 背景
根据 `D:\work\接口对接\GIS出动车辆接口对接文档-2026-11-02.md`，新增按警情查询出动车辆接口
（`GET /bff-client/api/v1/gis/incidents/{incidentId}/turnout-vehicles`），并将历史轨迹模块从
"单车 + 写死时间"升级为"多车多路线并行查询 + 动态时间范围"。

### 改动文件（7 个）

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/utils/themeColor.ts` | 新增 | `shiftHue` 工具函数：hex → HSL 色相偏移 → hex（无外部依赖） |
| `src/baseComponent/OpenlayersMap/style/palette.ts` | 新增 | `VEHICLE_HISTORY_TRACK_ROUTE_COLORS`（4 色同色系派生）+ `getHistoryTrackRouteColor(index)` |
| `src/apis/carTrack.ts` | 新增 + 签名扩展 | 10 类型 + 4 函数 + `queryCarHistoryTrack` 新增可选 `timeRange` 参数（向后兼容） |
| `src/store/useVehicleTrackStore.ts` | 改造 | 新增 `trackEntries` Map + `routeGroups` + `activeRouteKey`；保留旧字段为兼容性别名 |
| `src/baseComponent/OpenlayersMap/VehicleTrackRenderer.ts` | 改造 | 从"固定单组 feature"改为"按 trackId 管理多组"，新增 `renderMulti` / `setCursorAll` |
| `src/baseComponent/OpenlayersMap/dispatchMap.vue` | 改造 | `loadVehicleTrack` 多车编排 + 降级策略；`syncVehicleTrackLayer` 支持多组渲染 |
| `src/components/dispatchMap/VehicleTrackPanel.vue` | 新增 UI | 路线分组切换器（el-select + 颜色圆标）+ 当前路线多车辆摘要 |

### 关键设计决策

1. **分组逻辑**：stationId 相同即同一路线；stationId 不同即不同路线。
   路线颜色按分组顺序从 palette 同色系派生池取模（基色 `#1D9BF0`，偏移 40°×4）。
2. **降级策略**：新接口整体失败（404 未上 dev / 503 上游不可用）→ catch 块内降级为
   旧单车逻辑（`extractLatestBatchFirstVehicleId` + 写死时间兜底），功能零中断。
3. **时间补充优先级**：startTime 兜底为 `批次 dispatchedAt → 警情接警时间 → 最早来电时间`；
   endTime 不补（归队时间只有实际归队后才有）。
4. **回放驱动**：store 单一 cursor → `setCursorAll` 同步推进所有分组；
   面板切换路线时只更新 activeRoute 下的旧字段别名，不影响所有组的 setCursorAll。

### 验证
- `pnpm lint` → 零报错 ✅
- 后端未上 dev（调用返回 404），新接口调用会降级到旧单车逻辑

### 待联调
- 后端上 dev 后，用三类警情联调：暂无调派、已出发未归队、多车多路线
- 验证 vehicles=null / [] / 正常数组三种边界状态
- 验证多路线颜色分配是否符合视觉预期
