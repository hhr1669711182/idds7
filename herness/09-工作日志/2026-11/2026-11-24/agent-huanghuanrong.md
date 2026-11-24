## 车辆历史轨迹回放功能优化（2026-11-24）

### 目标
- 选路线播放只播放当前选中路线（地图渲染隔离）
- UI 面板美化（毛玻璃 / 胶囊路线 tab / 车辆 chip / 统计卡片）
- mock 数据时间更逼真（过去时间戳）
- 支持持久化 JSON 轨迹（高德真实道路轨迹 + 速度段）

### 修改文件

**1. src/baseComponent/OpenlayersMap/useDispatchEntangled.ts**
- `syncVehicleTrackLayer`：按 `activeRouteKey` 过滤 `trackEntries`（原来传全部 entries，导致切路线时地图仍显示所有车辆）
- 新增 `onActiveRouteKeyChange` 回调：面板打开时路线切换触发 `syncVehicleTrackLayer(false)` 重渲染（不 fit）
- 注册 `watch(() => vehicleTrackStore.activeRouteKey, onActiveRouteKeyChange)` 到 activate 的 watch 列表

**2. src/components/dispatchMap/VehicleTrackPanel.vue**
- 标题栏：加 `mdi:map-marker-path` 图标，视觉更清晰
- 路线切换：`el-select` 改为胶囊 tab 按钮（`vtp-route-tab`），色点 + 名称 + 车数，active 态用 `--toolbar-tile-active-*` 变量
- 新增车辆 chips 行（`vtp-vehicle-chips`）：显示当前路线下所有车辆车牌
- 统计区：改为 4 卡片网格（`vtp-stats-grid` + `vtp-stat-card`），数值 + 单位分离，`--toolbar-tile-bg` 卡片背景
- 停留点 / 异常：chips 样式（`vtp-chip stop` / `vtp-chip anomaly`），颜色用 `--tag-info-*` / `--tag-warning-*` 变量
- 面板容器：`backdrop-filter: blur(var(--glass-blur))`，背景 `var(--glass-bg)`，圆角 `--radius-lg`
- 全部色值走 `var(--token)`，无裸色值

**3. server/mock-data.js**
- 新增 `getCarTrackFullData()`：优先读 `server/mock-data/track-<region>.json`（高德真实道路轨迹 + 速度段），缺失时回退合成轨迹（PAST 时间戳：警情 30min 前发生 + 接警后 5min 出动）
- 新增 `getTurnoutVehicleTimes()`：turnout-vehicles 的 PAST 时间戳（第一辆有 endTime，表示已归队）
- 新增 `loadPersistentTrack()`：进程内缓存持久化 JSON，region 不匹配或文件缺失返回 null

**4. server/mock-ws.js**
- `turnout-vehicles`：`startTime` 从 `getTurnoutVehicleTimes()` 取（PAST，第一辆有 `endTime`）
- `car-track`：优先用 `getCarTrackFullData()` 的 PAST `gpsTimes`；回退时也改用 PAST 时间戳（now - 25min 起，每 5s 一个点），不再用 `Date.now() + i*5000`（未来时间）

**5. scripts/generate-track-mock.mjs（新增）**
- 调用 `VITE_MAP_PROXY_API` 的 `/api/amap/route/driving` 生成真实道路轨迹
- 从 TMC 路段（`tmcs[]`）推断各点速度（畅通=18 m/s，缓行=8，拥堵=4，严重拥堵=2）
- 输出 `server/mock-data/track-<region>.json`（支持 `--region shenzhen|beijing|guizhou`）
- 代理不可达时自动跳过该车辆，运行时 mock 回退合成数据

**6. package.json**
- 新增 `generate:track-mock` 脚本

### 验证
- `pnpm lint`：0 报错 ✅

### 备注
- 生成真实轨迹需先确认 `VITE_MAP_PROXY_API`（192.168.169.28:33082）可达；不可达时 `pnpm generate:track-mock` 跳过该车辆，mock 回退合成数据（PAST 时间戳已生效）
- `server/mock-data/` 目录下的 `dev.js` / `test.js` / `uat.js` 是遗留死代码（`getMockData` 全仓零引用），本次不动

## 资源检索输入联想（inputTips）模糊查询未限定城市修复（2026-11-24）

### 目标
- 资源检索输入框 el-autocomplete 联想走 `amapApi.inputTips`，此前漏传 `city` 行政区划码，`cityLimit: true` 无城市码时高德 input-tips 拿不到行政区划，联想候选错/空
- 对齐 `routePlanPanel.vue` 的既有正确用法（`city: appEnv.mapAdcode`），补回 adcode

### 根因
- `src/composables/useSearchActions.ts` `fetchSuggestions` 调用 `amapApi.inputTips({ keywords, cityLimit: true })` 未传 `city`
- 约定见 `src/config/env.ts` L42：`input-tips` 用 adcode（`mapAdcode` = `VITE_MAP_ADMCODE`）
- 正确对照：`routePlanPanel.vue` L183 传了 `city: appEnv.mapAdcode`

### 修改文件（仅 1 个）
**src/composables/useSearchActions.ts**
- 顶部补 `import { appEnv } from '@/config/env'`（L12）
- L56 调用补 adcode：`.inputTips({ keywords: keyword, city: appEnv.mapAdcode, cityLimit: true })`

### 验证
- `pnpm lint`（vue-tsc --noEmit）：exit 0，0 报错 ✅
- 类型安全：`inputTips` 入参已含 `city?: string`（apis/amap.ts L230），`mapAdcode` 为 string，无报错
- 手动验收：`pnpm dev` 资源检索输入框输入关键词，Network 看 `/api/amap/poi/input-tips` query 应带 `city=<VITE_MAP_ADMCODE>`，候选限定本市

### 备注
- 零契约变化，未改消息事件/DTO/接口/状态机；分层合规（composable 读 @/config/env，与 routePlanPanel/NavPanel/searchQuery 一致）
- `NavPanel.vue` L82 走 `fetchInputTips` 且用 `city: appEnv.mapCity`（城市名，非 adcode），与本 bug 不同源，未改动
