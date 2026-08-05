# 业务控制层 / 通用控制层 DTO 拼装模式

本文档是 `references/gis-architecture.md` 的配套实操指南。所有 DTO 类型必须复用 `src/controller/core/protocol/GenericProtocol.ts`，不再重复定义。

## 1. 拼装链路总览

```text
[后端 WebSocket / postMessage]
        |
        v
[协议层: MessageEnvelope]  ──>  BusinessProtocol payload
        |
        v
[业务控制层: AlarmController/CallController/...]
        |  ① 解析业务事件
        |  ② 触发业务状态机
        |  ③ 拼装通用控制层 DTO
        v
[通用控制层 DTO: GenericProtocol]  ──>  view.locate / geometry.addMarker / ...
        |
        v
[通用控制层: ViewController / GeometryController / KinematicController / SpatialController]
        |  执行图形指令
        v
[Pinia: useMapStore / useLayersStore]
        |
        v
[渲染层: OpenLayers / ThreeJS 监听 store 变化]
```

## 2. 业务控制层示例（AlarmController.syncAlarmProfile）

```typescript
// src/controller/core/business/AlarmController.ts
import type { GenericController } from "../generic";
import type { AlarmProfileSyncData } from "../protocol";

/**
 * 警情控制器：负责警情业务事件的处理、状态机维护与通用控制层 DTO 拼装。
 * 不允许直接调用 OL/ThreeJS API；所有图形指令必须通过 genericController。
 */
export class AlarmController {
  constructor(private genericController: GenericController) {}

  /**
   * 警情精确上图控制 / 警情画像状态更新
   * 业务规则：
   * 1. 警情同步必须先定位再上图（视野先行）。
   * 2. 定位 zoom 强制 18 级（与"来电弹屏"场景一致）。
   * 3. 上图 marker 必须使用 incidentId 作为业务前缀。
   * 4. 必须触发警情状态机 CREATED → DISPATCHED。
   */
  public syncAlarmProfile(data: AlarmProfileSyncData) {
    const { view, geometry } = this.genericController;

    if (data.longitude && data.latitude) {
      // 通用控制层 DTO：视野定位
      view.locate({
        lngLat: [data.longitude, data.latitude],
        zoom: 18,
        duration: 800
      });

      // 通用控制层 DTO：上图 marker
      geometry.addMarker({
        id: data.incidentId,                     // 业务 ID，前缀由业务控制层保证
        lngLat: [data.longitude, data.latitude],
        iconType: "endpoint",
        iconParams: { type: "alarm" },
        animate: "breathe"
      });
    }
  }
}
```

## 3. 通用控制层 DTO 设计规范

### 3.1 命名约定
- 只承载图形指令参数，命名以"动词 + 名词"为单位：
  - `LocateDTO`：视野定位
  - `FitBoundsDTO`：视野 fit
  - `AddMarkerDTO`：上图 marker
  - `UpdateMarkerDTO`：更新 marker
  - `RemoveMarkerDTO`：移除 marker
  - `AddPolylineDTO`：上图线
  - `UpdatePolylineDTO`：更新线
  - `AddPolygonDTO`：上图多边形
  - `AddCircleDTO`：上图圆
  - `HighlightDTO`：高亮
  - `FollowDTO`：跟踪

### 3.2 字段约束
- 所有坐标字段统一 WGS84 `[lng, lat]`。
- 所有 ID 字段必须带业务前缀（`marker_`、`polygon_` 等）。
- 所有时间相关字段（`duration`、`interval`）单位为毫秒。
- 所有距离相关字段（`radius`、`padding`）单位为米。
- 所有样式字段使用 `as const` 字符串联合：`style: 'incoming' | 'dispatch' | 'inquiryFocus' | 'tracking'`。

### 3.3 类型来源
- 复用 `src/controller/core/protocol/GenericProtocol.ts`。
- 新增 DTO 必须在该文件中声明并补充 JSDoc。

## 4. 反模式（必须避免）

| 反模式 | 后果 | 正确做法 |
| --- | --- | --- |
| 业务控制层直接 `import ol/Map` | 破坏分层、无法测试 | 仅通过 `genericController` 调用 |
| 业务控制层在通用控制层 DTO 中加业务字段 | 通用层被污染 | 业务状态用业务 store 维护 |
| 通用控制层读 `useDispatchStore` | 通用层反依赖业务层 | 仅读 `useMapStore` / `useLayersStore` |
| 业务控制层和通用控制层共用 DTO 类型 | 后续拆分困难 | 业务/通用 DTO 分文件 |
| DTO 中坐标为 `[lat, lng]` | 与 GeoJSON 不一致 | 统一 `[lng, lat]` |
| 业务控制层调用 `view.fit` 不带 padding | 贴边 | 默认 `paddingRatio = 0.12` |
| 渲染层组件直接改 `useLayersStore` | 跨层破坏 | 通过 controller |

## 5. 多业务事件合并示例

当多个业务事件需要同时触发通用控制层动作时，业务控制层方法必须串行拼装：

```typescript
// DispatchController.planRoute 同时处理路径规划 + 资源高亮 + 视野 fit
public planRoute(data: DispatchRoutePlanData) {
  const { view, geometry, spatial } = this.genericController;

  // 1. 业务状态机：警情进入 DISPATCHED
  this.incidentStateMachine.transitionTo("DISPATCHED", data.incidentId);

  // 2. 通用控制层 DTO：上图路径
  geometry.addRoute({
    id: `route_${data.routeId}`,
    path: data.path,                            // 计算层已返回 WGS84
    style: data.recommended ? "dispatchRecommended" : "dispatch"
  });

  // 3. 通用控制层 DTO：上图车辆起点 marker
  geometry.addMarker({
    id: `vehicle_${data.start.carId}`,
    lngLat: [data.start.longitude, data.start.latitude],
    iconType: "vehicle",
    iconParams: { type: "fire" }
  });

  // 4. 通用控制层 DTO：上图灾情点
  geometry.addMarker({
    id: `incident_${data.incidentId}`,
    lngLat: [data.end.longitude, data.end.latitude],
    iconType: "endpoint",
    iconParams: { type: "alarm" }
  });

  // 5. 通用控制层 DTO：视野 fit（带 padding）
  view.fit({
    extent: spatial.computeBBox([data.start, data.end, ...data.path]),
    paddingRatio: 0.12,
    duration: 800
  });
}
```

## 6. 单元可测性

业务控制层方法必须允许注入 `genericController` mock：

```typescript
// tests/controller/AlarmController.test.ts
import { describe, it, expect, vi } from "vitest";
import { AlarmController } from "@/controller/core/business/AlarmController";

describe("AlarmController.syncAlarmProfile", () => {
  it("警情定位必须先 fit 再上图", () => {
    const callOrder: string[] = [];
    const mockGeneric = {
      view: {
        locate: vi.fn(() => callOrder.push("locate"))
      },
      geometry: {
        addMarker: vi.fn(() => callOrder.push("addMarker"))
      }
    } as any;

    const controller = new AlarmController(mockGeneric);
    controller.syncAlarmProfile({
      incidentId: "inc_001",
      longitude: 121.4737,
      latitude: 31.2304
    });

    expect(callOrder).toEqual(["locate", "addMarker"]);
  });
});
```

通用控制层方法也必须允许注入 store mock：

```typescript
// tests/controller/ViewController.test.ts
import { describe, it, expect } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useMapStore } from "@/store/useMapStore";
import { ViewController } from "@/controller/core/generic/ViewController";

describe("ViewController.locate", () => {
  it("调用时必须带 padding ≥ 0.10", () => {
    setActivePinia(createPinia());
    const store = useMapStore();
    const ctrl = new ViewController(store);

    ctrl.locate({ lngLat: [121.4737, 31.2304], zoom: 18, duration: 800 });

    expect(store.lastFitOptions.padding[0]).toBeGreaterThanOrEqual(0.1);
  });
});
```

## 7. 拼装流程自检清单

每个业务控制层方法落地前，必须自检：

- [ ] 入参类型来自 `protocol/BusinessProtocol.ts`。
- [ ] 触发业务状态机（如适用）并发布事件。
- [ ] 调用通用控制层方法时坐标已转 WGS84。
- [ ] 所有 ID 已加业务前缀。
- [ ] Auto-Fit 带 `paddingRatio = 0.12`。
- [ ] 没有直接调用 `ol/Map`、`ol/Feature`、`three/Scene`。
- [ ] 单元测试覆盖关键业务规则。
- [ ] JSDoc 注释包含业务意图、领域规则、不变量。
