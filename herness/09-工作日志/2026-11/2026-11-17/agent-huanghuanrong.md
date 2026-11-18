# 工作日志 2026-11-17

## 车辆轨迹回放卡顿修复（INP 优化）

- **时间**：2026-11-17 15:23
- **任务**：修复"模拟跟踪全流程（LocalStorage 轨迹回放）"动画渲染时左右抖动 + 卡顿（pointer INP ~1480ms）。
- **根因定位**：用户走的流程是 `useVehicleTrackPlayback`（LocalStorage 轨迹回放），每帧 rAF tick → `store.setCursor` → watcher → `VehicleTrackRenderer.updateGroupCursor`。该函数每帧做 3 件重活：
  1. `traveled` 已行驶线：`[...projected.slice(0, lower+1), coordinate]` 全量 slice + spread 复制（500 点轨迹每次复制 500 个坐标），再 `setCoordinates` 触发整个 VectorSource 全层重绘。
  2. 车辆 marker：`getStyle('vehicle')` 每帧新建 Style + Icon + Text + 2×Fill 共 5 个对象。
  3. 方向箭头 overlay 的命中检测在 pointer 交互时扫全量 feature。
- **修复**（`src/baseComponent/OpenlayersMap/VehicleTrackRenderer.ts`）：
  1. 已行驶灰线改为**段切换时原地重建 + 段内 100ms 节流** `setCoordinates`：段内只在 `traveledCoords` 末端原地改写，每 100ms 才触发一次 source refresh，其余帧 0 重绘。
  2. 车辆 marker 改为**Style 实例复用**：`createGroup` 时创建一次 `carStyle`，`updateGroupCursor` 内用 `carStyle.getImage().setRotation()` 原地变更，每帧 0 对象创建。
  3. 新增字段 `lastTraveledLower` / `carStyle` / `traveledCoords` / `lastTraveledUpdateAt`，`createGroup` 与 `renderMulti` 重置逻辑同步初始化。
- **验证**：`pnpm lint`（vue-tsc --noEmit）0 报错
- **提交**：
  - `7ff8dcdf` perf(vehicle-track): 轨迹回放卡顿修复——已行驶线节流更新 + Style 实例复用
  - `44f7ef41` docs: 追加车辆轨迹回放性能修复工作日志

## 车辆视口边界触发跟随

- **时间**：2026-11-17 15:56
- **任务**：车辆动画/回放时，地图视图自动跟随车辆，但只在车辆接近/超出视口边缘时才 setCenter（margin 40px），用户拖动地图后不会强制拉回。
- **实现**：
  1. `VehicleRenderer.ts`：`VehicleManagerOptions` 新增可选 `map: OlMap`；闭包内 `followIfNeeded(coordinate)` 使用 `map.getPixelFromCoordinate` 判断车辆像素位置是否靠近/超出四边 40px，是则 `view.setCenter(coordinate)`，100ms 节流；`startVehicleAnimation`、`startLocationInterpolation`、`applyVehicleLocation` 三处渲染末尾均调用；暴露 `setFollow(enabled)` 方法。
  2. `VehicleTrackRenderer.ts`：`createVehicleTrackRenderer` 闭包内同样新增 `followIfNeeded()`（取所有 group 最近渲染坐标的质心做边界判断），`setCursorAll` 末尾调用；暴露 `setFollow(enabled)` 方法。
  3. `DispatchT1.ts`：`createVehicleManager` 调用处传入 `map: this.map`。
- **设计说明**：边界触发而非每帧 setCenter——用户手动拖地图后，车辆坐标不变、视图中心已移走，车辆大概率不再靠近边缘，自然不触发，无需额外事件监听。
- **验证**：`pnpm lint`（vue-tsc --noEmit）0 报错
- **提交**：
  - `427b94de` perf(vehicle): 车辆视口边界触发跟随——出界才 setCenter，兼容用户手动拖动

## 车辆视口改为持续中心跟随

- **时间**：2026-11-17 16:30
- **任务**：`427b94de` 的边界触发（margin 40px）在 `renderMulti({ fit: true })` 场景下车辆始终在视口中心、永远不会靠近边缘，setCenter 不触发。
- **修复**：改为**持续中心跟随**——每 100ms 将 `view.setCenter` 对准车辆坐标（VehicleTrackRenderer 多车取质心），并用 `map.getView().getInteracting()` 守卫，用户拖动/缩放时跳过。
- **提交**：`3e123b0c` fix(vehicle): 视口跟随改为持续中心跟随 + getInteracting 守卫

## 环境配置自动同步脚本

- **时间**：2026-11-17 19:08
- **任务**：`.env.local.example` 每次新增 `VITE_*` 后需手动补，容易漏。
- **实现**：
  1. 新增 `scripts/check-env-sync.mjs`：解析 `src/config/env.ts` 全部非注释 `readEnvString('VITE_*')` 键，对比 `.env.local.example`，缺失即 `exit 1`；`--fix` 自动追加缺失键。
  2. 接入 `pnpm harness:check`（末尾追加 `node scripts/check-env-sync.mjs`）。
  3. `.env.local.example` 补 `VITE_MAP_KEYWORDS`（注释预留）+ `VITE_WEATHER_SOURCE=new`。
  4. `设计规范速查.md` 新增 **E5 模板自动校验** 规则；`env变量清单.md` 矩阵修正 + 维护规则补第5条。
- **验证**：`pnpm harness:check` 全部通过
- **提交**：`2e01349f` chore(env): 新增 check-env-sync 自动校验脚本 + 补齐 .env.local.example 缺失键

## 视口跟随改用 pointerdrag + 像素出界判断

- **时间**：2026-11-17 19:59
- **任务**：`3e123b0c` 用 `getInteracting()` 守卫的持续中心跟随，在 `view.fit(duration:400)` 动画结束后 `INTERACTING` hint 残留为 true，`followIfNeeded` 被持续 early-return，车辆跑出视口无人拉回。
- **修复**：
  1. 移除 `getInteracting()` 守卫（`View.js:1839` 的 `beginInteraction()` 在 fit 动画期间置 INTERACTING=1，`endInteraction()` 清除依赖帧循环 resolveConstraints，时序不确定）
  2. 改用**像素出界判断**：每帧计算车辆质心的像素位置，出视口 40px margin 才 `setCenter`，界内不动
  3. 用户操作检测改用 `map.on('pointerdrag')`（只有按住拖拽地图触发，`setCenter`/`view.fit` 不触发），pointerdrag 后 1.5s 冷却期
  4. 两个渲染器同步改：`VehicleRenderer.ts`（实时车辆）+ `VehicleTrackRenderer.ts`（LocalStorage 轨迹回放）
- **验证**：`pnpm lint`（vue-tsc --noEmit）0 报错
- **提交**：`1cf48dfd` fix(vehicle): 视口跟随改用 pointerdrag 检测 + 像素出界判断

## 视口跟随回归持续中心跟随（修复轨迹回放不跟随）

- **时间**：2026-11-17 20:25
- **背景**：`1cf48dfd` 的像素出界判断在 LocalStorage 轨迹回放场景失效——`renderMulti({ fit: true })` 把整条轨迹 extent fit 进视口，车辆沿轨迹移动时**一直在视口内**，40px 边界永不触发，表现为"轨迹在动但视口完全不动"。
- **修复**（`e7e7bb79`）：
  1. 两个渲染器统一回归**持续中心跟随**：每 100ms `setCenter` 对准车辆（TrackRenderer 多车取质心）
  2. 用 `map.getView().getInteracting()` 守卫：用户正在拖动/缩放时暂停跟随，松手后下一拍恢复
  3. 删除像素出界判断、`pointerdrag` 冷却时间戳、残留的 `lastFitAt` 变量
  4. 净减 44 行，代码更简洁
- **验证**：`pnpm lint`（vue-tsc --noEmit）0 报错
- **提交**：`e7e7bb79` fix(vehicle): 视口跟随改持续中心跟随，修复轨迹回放车辆出视口不跟随

## 视口跟随彻底移除所有守卫（无守卫纯 setCenter 版）

- **时间**：2026-11-17 20:46
- **背景**：历次守卫策略（`getInteracting()` / `pointerdrag` 冷却 / `movestart`）各有卡死风险，导致"车辆出视口但视口不跟"反复出现。
- **修复**（`5008a44e`）：两个渲染器的 `followIfNeeded` 统一为**无守卫纯 100ms 节流 `setCenter`**，彻底移除所有交互守卫。用户想自由查看地图时用已有的 `setFollow(false)` 关闭跟随。
  - `VehicleTrackRenderer.ts`：移除 `getInteracting()` 守卫 + `movestart`/`moveend` 监听 + 残留 `userMovingView`/`lastFitAt`
  - `VehicleRenderer.ts`：同步移除所有守卫
- **验证**：`pnpm lint`（vue-tsc --noEmit）0 报错
- **提交**：`5008a44e` fix(vehicle): 视口跟随彻底移除交互守卫，修复车辆出视口不跟随

## AmapRealtimeNav 车辆沿路动画补视口跟随（真正的根因文件）

- **时间**：2026-11-17 21:30
- **背景**：前 5 轮改的 `VehicleTrackRenderer`/`VehicleRenderer` 全改错了文件。
  "模拟车辆沿路行驶动画-LocalStorage" 实际走的是 `AmapRealtimeNav`（`useAmapTools.ts`），
  它的 `startVehicleAnimation` / `startVehicleAnimationMulti` 两个 rAF tick 循环
  只更新车辆 marker 坐标/朝向/倒计时，**从不调用 `setCenter`**，视口永远不跟。
- **修复**（`a33b77b8`）：
  1. `AmapRealtimeNavOptions` 新增 `followVehicle?: boolean`（默认 true）
  2. `AmapRealtimeNav` 新增 `lastFollowAt` 节流字段 + `followVehicleView()` 私有方法：
     每 100ms 将视口中心对准主车辆（`vehicleFeatures[0] ?? vehicleFeature`）
     不设任何交互守卫（守卫可能在动画结束后卡住，导致 setCenter 从此不执行）
  3. 两个 tick 循环末尾各接入 `this.followVehicleView()`
- **验证**：`pnpm lint`（vue-tsc --noEmit）0 报错
- **提交**：`a33b77b8` fix(nav): AmapRealtimeNav 车辆沿路动画加视口跟随，修复模拟车辆行驶视口不跟

