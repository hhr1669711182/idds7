# GIS 前端反模式目录（Anti-Patterns Catalog）

> 版本: v1.0 | 日期: 2026-07-24
> 范围: GIS 前端工程
> 配合: gis-dev-workflow 技能集
> 设计原则: 症状 → 后果 → 预防 → 检测规则 → 参考

---

## 0. 目录说明

本目录收录 GIS 前端开发中**反复出现、影响架构合规或性能 SLA** 的反模式。每条反模式均提供：

1. **症状**（代码示例）
2. **后果**（对架构 / 性能 / 维护性的影响）
3. **预防**（正确做法）
4. **检测规则**（CI / 静态扫描 / 运行时）
5. **参考**（对应 `docs/source/` 文档）

**配套强制基线**：

- 任何反模式触发必须立即阻断 + 打点
- 修复反模式必须先添加失败测试
- CI 流水线必须启用全部反模式检测规则

---

## 1. 反模式列表

### AP-001 业务控制层直接调 OpenLayers

| 字段 | 内容 |
| ---- | ---- |
| **症状** | 在 `src/controller/business/alarm/AlarmCtrl.ts` 中出现 `import { Map } from 'ol'` 或 `this.map.addLayer(...)` |
| **后果** | 1. 渲染层 API 变更会破坏业务逻辑 2. 单元测试无法 mock 渲染层 3. 违反五层架构边界 |
| **预防** | 业务控制层只装配 `GenericControlInput`，通过 `protocolLayer.publish(MessageEnvelope<T>)` 让通用控制层执行 |
| **检测规则** | 静态扫描：`src/controller/business/**/*.ts` 禁止 `import 'ol'` / `import 'three'` / `import '@amap/*'` |
| **参考** | [docs/source/06-模块边界与职责说明.md](../../../docs/source/06-模块边界与职责说明.md) §2.1 |

```typescript
// ❌ 反模式
import { Map } from 'ol'
class AlarmCtrl {
  addAlarmMarker(map: Map) {
    map.addLayer(new VectorLayer({ ... }))
  }
}

// ✅ 正确
class AlarmCtrl {
  addAlarmMarker(alarm: AlarmProfile) {
    this.protocolLayer.publish<MessageEnvelope<GenericControlInput>>({
      type: 'GenericControlInput',
      payload: { type: 'DrawGeometryInput', geometryId: `alarm_${alarm.alarmId}`, ... }
    })
  }
}
```

---

### AP-002 Auto-Fit 未保留 Padding

| 字段 | 内容 |
| ---- | ---- |
| **症状** | `view.fit(bbox)` 无第二个参数 |
| **后果** | 1. 图元贴边 2. 用户体验差 3. 违反硬约束 |
| **预防** | `view.fit(bbox, { padding: [0.1, 0.15, 0.1, 0.15] })` |
| **检测规则** | 静态扫描：禁止 `view.fit(bbox)` 无第二个参数 |
| **参考** | [docs/source/11-核心业务判断逻辑.md](../../../docs/source/11-核心业务判断逻辑.md) §1.1 |

```typescript
// ❌ 反模式
view.fit(bbox)

// ✅ 正确
view.fit(bbox, { padding: [0.1, 0.15, 0.1, 0.15] })
```

---

### AP-003 状态机非法迁移

| 字段 | 内容 |
| ---- | ---- |
| **症状** | `alarm.status = 'CLOSED'` 直接赋值 |
| **后果** | 1. 跳过中间状态 2. 联动规则失效 3. 状态机一致性被破坏 |
| **预防** | `alarmCtrl.transit(alarmId, 'close')` 经业务控制层执行 |
| **检测规则** | 静态扫描：禁止业务 store 中直接修改 `status` 字段 |
| **参考** | [docs/source/08-业务状态机定义.md](../../../docs/source/08-业务状态机定义.md) §5 |

```typescript
// ❌ 反模式
const alarm = useAlarmStore()
alarm.status = 'CLOSED'

// ✅ 正确
const alarmCtrl = useAlarmCtrl()
alarmCtrl.transit(alarmId, 'close', { reason: '误报归档', operatorId })
```

---

### AP-004 业务 ID 缺失前缀

| 字段 | 内容 |
| ---- | ---- |
| **症状** | `const marker = { id: '12345', ... }` 缺前缀 |
| **后果** | 1. 跨业务域 ID 冲突 2. `release(id)` 无法精准回收 3. 资源泄漏 |
| **预防** | `const marker = { id: \`alarm_${alarmId}\`, ... }` |
| **检测规则** | 静态扫描：所有 id 字段必须含 `alarm_` / `call_` / `route_` / `plan_` / `vehicle_` / `trail_` 前缀 |
| **参考** | [docs/source/09-前端业务逻辑设计.md](../../../docs/source/09-前端业务逻辑设计.md) §1.3 |

```typescript
// ❌ 反模式
const marker = { id: '12345', type: 'alarm' }

// ✅ 正确
const marker = { id: `alarm_${alarmId}`, type: 'alarm' }
```

---

### AP-005 GPS 高频数据未走 Worker

| 字段 | 内容 |
| ---- | ---- |
| **症状** | 主线程直接处理 GPS 流：`gpsStream.on('data', (point) => { updateMarker(point) })` |
| **后果** | 1. 主线程阻塞 2. 帧率下降（< 30fps） 3. 违反性能 SLA |
| **预防** | Worker 处理：`worker.postMessage(gpsBuffer, [gpsBuffer.buffer])` |
| **检测规则** | 静态扫描：GPS 处理函数禁止在主线程 `setInterval` |
| **参考** | [docs/source/09-前端业务逻辑设计.md](../../../docs/source/09-前端业务逻辑设计.md) §6.1 |

```typescript
// ❌ 反模式
gpsStream.on('data', (point) => {
  this.updateMarker(point)  // 主线程计算
})

// ✅ 正确
const worker = new Worker('./gps-worker.ts')
gpsStream.on('data', (point) => {
  worker.postMessage({ type: 'GPS_UPDATE', point }, [point.buffer])
})
```

---

### AP-006 业务控制层读取渲染层 store

| 字段 | 内容 |
| ---- | ---- |
| **症状** | 业务控制层方法内 `useMapStore()` / `useLayerStore()` |
| **后果** | 1. 业务逻辑与渲染耦合 2. 渲染层重构影响业务 3. 违反分层 |
| **预防** | 业务控制层只读业务 store（`useAlarmStore` 等），渲染层 store 由通用控制层读取 |
| **检测规则** | 静态扫描：`src/controller/business/**/*.ts` 禁止 `useMapStore` / `useLayerStore` |
| **参考** | [docs/source/06-模块边界与职责说明.md](../../../docs/source/06-模块边界与职责说明.md) §2.3 |

```typescript
// ❌ 反模式
import { useMapStore } from '@/stores/map'
class AlarmCtrl {
  fitToAlarm() {
    const map = useMapStore()
    map.zoom = 18
  }
}

// ✅ 正确
class AlarmCtrl {
  fitToAlarm(alarm: AlarmProfile) {
    this.protocolLayer.publish({
      type: 'GenericControlInput',
      payload: { type: 'LocateInput', target: alarm.alarmLocation, zoom: 18 }
    })
  }
}
```

---

### AP-007 通用控制层读取业务 store

| 字段 | 内容 |
| ---- | ---- |
| **症状** | 通用控制层方法内 `useAlarmStore()` / `useVehicleStore()` |
| **后果** | 1. 通用控制层失去通用性 2. 无法跨业务域复用 3. 违反分层 |
| **预防** | 通用控制层只接收 `GenericControlInput`，不感知业务语义 |
| **检测规则** | 静态扫描：`src/controller/generic/**/*.ts` 禁止 `useAlarmStore` / `useVehicleStore` / `useCallStore` |
| **参考** | [docs/source/06-模块边界与职责说明.md](../../../docs/source/06-模块边界与职责说明.md) §2.3 |

```typescript
// ❌ 反模式
import { useAlarmStore } from '@/stores/alarm'
class ViewCtrl {
  fitToAlarm() {
    const alarms = useAlarmStore()
    return alarms.list.map(...)
  }
}

// ✅ 正确
class ViewCtrl {
  fitToBBox(bbox: BoundingBox) {
    this.map.getView().fit(bbox, { padding: [0.1, 0.15, 0.1, 0.15] })
  }
}
```

---

### AP-008 协议层出现非 WGS84 坐标

| 字段 | 内容 |
| ---- | ---- |
| **症状** | 协议层 DTO 中出现 `coordinates: [lng, lat]` 之外的格式，或坐标值超出 `[-180, 180]` / `[-90, 90]` |
| **后果** | 1. 渲染层底图错位 2. 跨中心数据无法对齐 3. 违反硬约束 |
| **预防** | 协议层强约束 WGS84，由 `protectInvariants()` 校验 |
| **检测规则** | 静态扫描 + 运行时校验：`lng ∈ [-180, 180] && lat ∈ [-90, 90]` |
| **参考** | [协议层DTO Schema.tsd](../../../docs/source/协议层DTO Schema.tsd) §GeoPoint |

```typescript
// ❌ 反模式
const point = { x: 5000, y: 3000 }  // 墨卡托坐标

// ✅ 正确
const point: GeoPoint = { lng: 116.404, lat: 39.915 }  // WGS84
```

---

### AP-009 业务控制层 try-catch 吞掉异常

| 字段 | 内容 |
| ---- | ---- |
| **症状** | `try { ... } catch (e) { /* 静默 */ }` |
| **后果** | 1. 异常被吞掉 2. 无法触发降级策略 3. 排查困难 |
| **预防** | 业务控制层抛出业务异常，由 `protectInvariants()` 统一处理 + 打点 + 降级 |
| **检测规则** | 静态扫描：禁止空 catch 块 |
| **参考** | [docs/source/12-异常处理流程.md](../../../docs/source/12-异常处理流程.md) §4 |

```typescript
// ❌ 反模式
try {
  await this.routeService.planRoute(...)
} catch (e) {
  // 静默吞掉
}

// ✅ 正确
try {
  return await this.routeService.planRoute(...)
} catch (e) {
  throw new RoutePlanningError({ planId, reason: 'ROUTE_FALLBACK', fallback: this.buildStraightLine() })
}
```

---

### AP-010 状态机迁移不写 OperationLog

| 字段 | 内容 |
| ---- | ---- |
| **症状** | `alarmCtrl.transit(...)` 后未写 `OperationLog` |
| **后果** | 1. 关键节点缺失 2. 审计不可追溯 3. 违反 11 §1.6 |
| **预防** | `transit()` 内部统一写 `OperationLog`（操作人、原因、时间） |
| **检测规则** | 静态扫描：`transit()` 方法必须包含 `recordOperationLog` 调用 |
| **参考** | [docs/source/11-核心业务判断逻辑.md](../../../docs/source/11-核心业务判断逻辑.md) §1.6 |

```typescript
// ❌ 反模式
async transit(alarmId: string, toState: AlarmStatus) {
  this.store.setStatus(alarmId, toState)
}

// ✅ 正确
async transit(alarmId: string, toState: AlarmStatus, ctx: TransitionContext) {
  this.protectInvariants(alarmId, toState)
  this.store.setStatus(alarmId, toState)
  this.recordOperationLog({ alarmId, toState, operatorId: ctx.operatorId, reason: ctx.reason, at: Date.now() })
}
```

---

### AP-011 IO 控制层实现业务规则

| 字段 | 内容 |
| ---- | ---- |
| **症状** | `InputCtrl.onClick()` 内出现 `if (alarm.status === 'CREATED')` 等业务判断 |
| **后果** | 1. 业务逻辑散落 2. 难以单测 3. 违反分层 |
| **预防** | IO 控制层只做"事件 → 业务控制层方法"转发，业务判断由业务控制层 `decision()` 封装 |
| **检测规则** | 静态扫描：`src/controller/io/**/*.ts` 禁止 `useAlarmStore` / `useVehicleStore` |
| **参考** | [docs/source/06-模块边界与职责说明.md](../../../docs/source/06-模块边界与职责说明.md) §2.4 |

---

### AP-012 同时跨帧触发多个焦点

| 字段 | 内容 |
| ---- | ---- |
| **症状** | 同帧内多个业务域同时触发 `ViewCtrl.fitToXxx()` |
| **后果** | 1. 视野抢焦 2. 用户体验差 3. 违反焦点互斥 |
| **预防** | `ViewCtrl` 按"调派 > 跟踪 > 问询 > 来电 > 值守"优先级裁决 |
| **检测规则** | 静态扫描：业务控制层触发视野变化前必须先 `acquireFocus()` |
| **参考** | [docs/source/11-核心业务判断逻辑.md](../../../docs/source/11-核心业务判断逻辑.md) §4.1 |

---

### AP-013 渲染层直接调 Pinia store 写入

| 字段 | 内容 |
| ---- | ---- |
| **症状** | Vue 组件内 `useAlarmStore().setAlarm(...)` |
| **后果** | 1. 绕过业务控制层 2. 状态机一致性被破坏 3. 违反分层 |
| **预防** | 渲染层只读 Pinia，写入必须经业务控制层 |
| **检测规则** | 静态扫描：`src/views/**/*.vue` 与 `src/components/**/*.vue` 禁止 `store.set*` / `store.add*` / `store.remove*` |
| **参考** | [docs/source/06-模块边界与职责说明.md](../../../docs/source/06-模块边界与职责说明.md) §2.5 |

```vue
<!-- ❌ 反模式 -->
<script setup>
import { useAlarmStore } from '@/stores/alarm'
const alarmStore = useAlarmStore()
function onClick() {
  alarmStore.setStatus(alarmId, 'CLOSED')  <!-- 渲染层直接写入 -->
}
</script>

<!-- ✅ 正确 -->
<script setup>
import { useAlarmCtrl } from '@/controller/business/alarm'
const alarmCtrl = useAlarmCtrl()
function onClick() {
  alarmCtrl.transit(alarmId, 'close', { reason: '误报', operatorId: 'me' })
}
</script>
```

---

### AP-014 算路失败时阻塞主流程

| 字段 | 内容 |
| ---- | ---- |
| **症状** | `await this.routeService.planRoute(...)` 抛出未捕获错误 |
| **后果** | 1. 调派失败 2. 接警员无法继续操作 |
| **预防** | 算路失败时降级为直线段（`ROUTE_FALLBACK`），打点 + 提示 |
| **检测规则** | 静态扫描：`planRoute()` 必须有 try-catch + 降级路径 |
| **参考** | [docs/source/12-异常处理流程.md](../../../docs/source/12-异常处理流程.md) §4.3 |

---

### AP-015 同时弹屏超过 3 路来电

| 字段 | 内容 |
| ---- | ---- |
| **症状** | `CallCtrl.popup(call)` 无数量限制 |
| **后果** | 1. 屏幕被占满 2. 接警员无法操作 |
| **预防** | 同时最多 3 路弹屏，第 4 路进入排队 |
| **检测规则** | 静态扫描：`popup()` 必须检查当前弹屏数 |
| **参考** | [docs/source/09-前端业务逻辑设计.md](../../../docs/source/09-前端业务逻辑设计.md) §2.1 |

---

## 2. 反模式与硬约束的对应

| 反模式 | 对应硬约束 |
| ------ | ---------- |
| AP-001 | 严禁越层调用 |
| AP-002 | Auto-Fit Padding 10-15% |
| AP-003 | 状态机迁移符合 08 迁移表 |
| AP-004 | 业务 ID 前缀 |
| AP-005 | 高频数据走 Worker |
| AP-006 | 业务控制层不读渲染 store |
| AP-007 | 通用控制层不读业务 store |
| AP-008 | 坐标系 WGS84 |
| AP-009 | 异常不中断主流程 |
| AP-010 | 关键节点写 OperationLog |
| AP-011 | IO 控制层不实现业务规则 |
| AP-012 | 焦点互斥 |
| AP-013 | 渲染层不直接写入 store |
| AP-014 | 算路降级 |
| AP-015 | 同时来电排队 |

---

## 3. 检测规则落地

### 3.1 ESLint 自定义规则

```javascript
// .eslintrc.cjs
module.exports = {
  rules: {
    'gis/no-render-api-in-business': 'error',
    'gis/no-business-store-in-render': 'error',
    'gis/require-business-id-prefix': 'error',
    'gis/require-padding-on-fit': 'error',
    'gis/no-direct-state-mutation': 'error',
    'gis/no-empty-catch': 'error',
    'gis/require-operation-log-on-transit': 'error'
  }
}
```

### 3.2 CI 流水线检查

```yaml
# .gitlab-ci.yml
anti_patterns_check:
  stage: verify
  script:
    - node scripts/check-anti-patterns.js
    - pnpm lint
    - pnpm type-check
  artifacts:
    reports:
      junit: tests/report/anti-patterns.xml
```

---

#### 断言清单

1. 反模式目录共 **15 条**（AP-001 ~ AP-015），覆盖五层架构、硬约束、性能 SLA、异常处理。
2. 每条反模式含"症状 / 后果 / 预防 / 检测规则 / 参考"5 项。
3. 反模式与硬约束一一对应，违反均触发打点。
4. 静态扫描规则可通过 ESLint 自定义规则 + CI 流水线强制落地。
5. 修复反模式必须先添加失败测试，符合 TDD 流程。
