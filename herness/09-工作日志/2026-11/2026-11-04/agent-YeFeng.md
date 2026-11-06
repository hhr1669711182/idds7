# 2026-11-04 — YeFeng

## 修复：phase 从 inquiry 切 dispatchTrack 时警情上图被清除

### 问题
宿主系统 phase 在 `inquiry`（有 incidentId）和 `dispatchTrack` 之间切换时，警情 marker 被清空。

### 根因
`IncidentLocationStore.setContext` 把 `dispatch` 和 `dispatchTrack` 视为不同 stage，phase 变化时触发 `clearAll()`。但 dispatchMap.vue 的 onMounted 刷新恢复门控明确把两者视为同一组（`stage !== "dispatch" && stage !== "dispatchTrack"` 才清），两处逻辑不一致。

### 改动
- `src/store/useIncidentLocationStore.ts` — `setContext` 中新增 `inDispatchFamily()` 判断，`dispatch` ↔ `dispatchTrack` 视为等价，不触发 clearAll。其他 stage 变化、sessionEpoch / sessionKey / incidentId 变化仍保持原有 clearAll 语义。

### 修复记录（踩坑）
- 第一版 `stageChanged` 逻辑用了 `||` 导致 bug：`!(A && B) || (valA !== valB)` 在两边都在 family 但值不同时，后半段仍返回 true → 误触发 clearAll。
- 正确写法是 `&&`：`!(A && B) && (valA !== valB)` ——两边同属 family 时短路为 false。

### 验证
- `pnpm lint` — 零新增报错（仅既有 carTrack.ts TS6133）
- 待用户联调验证

## 补充确认：问题 2（模拟调派不执行）的根因

用户反馈先切调派后写 mock blob（seat-shared-state-mock 写入 dispatchVehicles），
按 useMockCallLocationBridge 的 watch 逻辑，mock blob 写入会触发 rawChanged=true → syncMock() → MOCK_DISPATCH_VEHICLES 正常 emit。

但 receiveMockDispatchVehicles（dispatchMap.vue:1437）里的 resolveMockDestination()
依赖 incidentLocationStore.markers / routePlanRequest 找警情终点——marker 被问题 1 清掉后终点为 undefined → 静默 return。

结论：**问题 2 的根因即问题 1**，修复 setContext 后 marker 保留，终点可达，模拟调派自动恢复。
