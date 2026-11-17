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

