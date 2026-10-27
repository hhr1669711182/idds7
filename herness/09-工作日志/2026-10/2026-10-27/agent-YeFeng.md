# 工作日志 2026-10-27

> 本文是 `2026-10-27` 当天的**一次性流水账**，写完不再修改。
> 有长期价值的结论沉淀到 `herness/05-共享上下文/当前状态摘要.md`。

| 日期 | 内容 | 涉及文件 | 关联文档 | 备注 |
|------|------|----------|----------|------|
| 2026-10-27 | **历史轨迹车辆朝向改为对齐「警情上图」链路**（方案 B，经用户确认后实施）。**问题**：`setCursor` 原以 `projected[Math.max(lower - 1, 0)]` 为参考点算朝向，得到的是「上上点 → 当前位置」的弦方向，段内一直是斜向、过弯前提前斜切、过弯后仍沿旧段，游标正好落在数据点时车头指向上一段。**改造**：①新增 `lastRenderedCoordinate` 记录上一次渲染坐标，朝向按「上一渲染位置 → 本次渲染位置」的位移计算（与 `VehicleRenderer` 的 `lastProjectedCoordinate` 同款口径），逐帧 `normalizeRotation` 归一化；②方案 B 回退保护——位移与 `segmentVectorAt(lower)` 段切线点积小于 0（回拖滑块）时改用段切线，车头始终沿轨迹前进方向；③无位移（首帧 / 停点）时用当前段切线定向，起点仍沿首段，保留此前确认的「打开面板车头不朝北」行为；④删除 `headingOf` 与回看一段逻辑，`render`/`clear` 重置 `lastRenderedCoordinate`，换轨迹后按首段重新定向。 | `src/baseComponent/OpenlayersMap/VehicleTrackRenderer.ts` | — | 验证：`pnpm lint` 零报错；待实测：播放过急弯车头即时跟随、不再斜穿，回拖滑块车头不翻转 |
