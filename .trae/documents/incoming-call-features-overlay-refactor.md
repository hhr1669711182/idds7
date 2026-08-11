# 来电电话定位上图逻辑改造

## 1. 概要

将"来电电话定位上图"从 `map.vue` 内的全屏告警 modal（`IncomingCallOverlay`）改造成"地图 marker + 精度圈 + 点击小信息卡"的标准上图闭环，并迁移到 `composables/useIncomingCallFeatures.ts` 形成自包含模块。

- 新文件：`src/composables/useIncomingCallFeatures.ts`
- 修改文件：
  - `src/baseComponent/OpenlayersMap/layers.ts`（新增图层 ID）
  - `src/baseComponent/OpenlayersMap/map.vue`（接入 manager、清理遗留逻辑）
- 保留（不删除）：`IncomingCallOverlay.vue` 文件本体及其样式/动画代码，`map.vue` 中以注释形式存在。

## 2. 当前状态分析

| 项目 | 现状 | 问题 |
| --- | --- | --- |
| 上图实现 | `map.vue` 的 `handleIncomingCall` + `IncomingCallOverlay` 全屏 modal | 业务写在组件里；不是地图 marker 形态；与截图不符 |
| 多个来电 | 不支持（只能存一个 `incomingCall.value`） | 多个同时来电会相互覆盖 |
| 弹窗形态 | 全屏中心告警 modal | 用户截图是"中心电话 icon + 外围精度圈 + 侧边小信息卡" |
| 唯一 id | 无（`IncomingCallPayload` 不含 id） | 无法做增删改查 |
| 数据更新/清除 | 无更新、无清除 | 推送新坐标、新设备掉线无法处理 |
| 图层控制 | 无独立图层 ID | 无法通过控制按钮开/关 |
| 消息订阅 | `map.vue` 内 `onIncomingCall(handleIncomingCall)` | 业务耦合到组件 |

## 3. 计划变更

### 3.1 新建 `src/composables/useIncomingCallFeatures.ts`

**数据模型**：

```ts
export type IncomingCallLocationType = 'cellId' | 'gps' | 'wifi' | 'unknown'
export type IncomingCallStatus = 'online' | 'offline' | 'lost'

export type IncomingCallData = {
  callId: string
  caller: string
  phone: string
  lng: number
  lat: number
  locationType: IncomingCallLocationType
  accuracyRadius: number
  status: IncomingCallStatus
  updatedAt: string
}

export type IncomingCallEnvelope = {
  callId: string
  caller?: string
  phone?: string
  lng: number
  lat: number
  locationType?: IncomingCallLocationType
  accuracyRadius?: number
  status?: IncomingCallStatus
  updatedAt?: string
}
```

**字段映射规则**（推送消息 → IncomingCallData）：

| 内部字段 | 优先级（从 envelope 解析） |
| --- | --- |
| callId | `envelope.callId`（必填；缺失则 warn 并丢弃） |
| caller | `envelope.caller ?? envelope.callerName ?? '未知来电'` |
| phone | `envelope.phone ?? envelope.msisdn ?? ''` |
| lng / lat | `envelope.lng` / `envelope.lat`（必填；缺失则丢弃） |
| locationType | `envelope.locationType ?? 'unknown'` |
| accuracyRadius | `envelope.accuracyRadius ?? 500`（米） |
| status | `envelope.status ?? 'online'` |
| updatedAt | `envelope.updatedAt ?? dayjs().format('YYYY-MM-DD HH:mm:ss')` |

**模块结构**：

1. `LOCATION_TYPE_LABELS` / `STATUS_LABELS` / `STATUS_COLORS` 字典常量
2. `createCirclePolygon(center: [number, number], radiusMeter: number, segments = 36)` —— 经纬度近似圆（米→度换算，1° ≈ 111320 m）
3. `buildPopupHtml(data: IncomingCallData): string` —— 返回弹窗 innerHTML 字符串
4. `populatePointFeatures(source, items)` / `populateCircleFeatures(source, items)` —— 同步两份 source
5. `makePointStyle(callId)` / `makeCircleStyle()` —— SVG 蓝色电话 icon（incoming-call-blue.png / inline svg）+ 淡蓝色半透明圆
6. `mountIncomingCallFeatures(params)` —— 工厂函数
7. `bootstrapIncomingCallSubscription(manager)` —— 内部 `onIncomingCall` 订阅，按 callId 增删改查

**Manager 接口**（参考 `useCarFeatures` 风格）：

```ts
export type IncomingCallFeaturesManager = {
  layer: VectorLayer<VectorSource>
  circleLayer: VectorLayer<VectorSource>
  overlay: Overlay
  addCall: (data: IncomingCallEnvelope) => void
  updateCall: (data: IncomingCallEnvelope) => void
  removeCall: (callId: string) => void
  clearAll: () => void
  setVisible: (visible: boolean) => void
  isVisible: () => boolean
  hide: () => void
  destroy: () => void
}
```

**mountIncomingCallFeatures(params) 行为**：

- `params`：`{ visible?: boolean }`（map 走 `storeToRefs(useMapStore()).map`）
- 创建 `pointSource` / `circleSource` 两份 source + 两份 VectorLayer（zIndex 58 / 57）
- 创建 `popupElement = document.createElement('div')` 并挂到 `document.body`，加 class `incoming_call_popup`
- 创建 `ol/Overlay`（`positioning: 'bottom-center'`、`offset: [0, -28]`、`stopEvent: true`）
- `map.addLayer(circleLayer)` / `map.addLayer(pointLayer)` / `map.addOverlay(overlay)`
- 注册 `singleclick` 监听：
  - `forEachFeatureAtPixel` 命中 point feature → 取 `data`，调用 `buildPopupHtml` → 写入 popupElement.innerHTML → overlay.setPosition(coordinate)
  - 未命中 → 清空 popupElement.innerHTML → overlay.setPosition(undefined)
- 创建内部数据池 `Map<string, IncomingCallData>`，保证 marker / 精度圈一一对应
- 内部调用 `bootstrapIncomingCallSubscription(this)`，订阅 `onIncomingCall(handler)`：
  - `handler(envelope)` 内解析 → 若 callId 已存在则 updateCall（更新坐标/精度/状态/updatedAt），否则 addCall
  - `unsubscribe` 由 manager.destroy 释放
- `destroy`：`unByKey(clickKey)` → `removeOverlay` → `removeLayer(pointLayer)` → `removeLayer(circleLayer)` → popupElement.remove() → 解除订阅

**弹窗 innerHTML 结构**（参考截图数据）：

```html
<div class="incoming_call_popup_card">
  <div class="incoming_call_popup_header">
    <span class="incoming_call_popup_kicker">目标终端定位</span>
    <span class="incoming_call_popup_status online">在线</span>
    <button class="incoming_call_popup_close" data-action="close">×</button>
  </div>
  <div class="incoming_call_popup_body">
    <div class="incoming_call_popup_row"><span class="k">设备号码 (MSISDN)</span><span class="v">+86 138 **** 5678</span></div>
    <div class="incoming_call_popup_row"><span class="k">经度 (Longitude)</span><span class="v">116.407421° E</span></div>
    <div class="incoming_call_popup_row"><span class="k">纬度 (Latitude)</span><span class="v">39.904211° N</span></div>
    <div class="incoming_call_popup_row"><span class="k">定位类型</span><span class="v">基站定位 (Cell-ID)</span></div>
    <div class="incoming_call_popup_row"><span class="k">定位精度</span><span class="v">粗定位 半径约 500m</span></div>
    <div class="incoming_call_popup_row"><span class="k">最后更新</span><span class="v">2026/6/12 18:23:04</span></div>
  </div>
</div>
```

**事件冒泡处理**：

- 弹窗 `close` 按钮（`data-action="close"`）用 addEventListener('click') 在 createElement 时挂一次；destroy 时统一 removeEventListener

**Style 注入**（避免污染 map.vue）：

- 在 `mountIncomingCallFeatures` 内部 `document.head.appendChild(createStyleElement())` 注入 scoped CSS
- 内容含 `.incoming_call_popup` / `.incoming_call_popup_card` / `.incoming_call_popup_header` / `.incoming_call_popup_kicker` / `.incoming_call_popup_status` / `.incoming_call_popup_close` / `.incoming_call_popup_row` 等类样式
- destroy 时同步 `styleElement.remove()`

### 3.2 修改 `src/baseComponent/OpenlayersMap/layers.ts`

在 `TEMP_FRONTEND_LAYER_IDS` 中新增：

```ts
INCOMING_CALL: "gis:incoming_call",
```

### 3.3 修改 `src/baseComponent/OpenlayersMap/map.vue`

**移除**：

- `import { onIncomingCall } from "@/controller/map"`（第 72 行）
- `import IncomingCallOverlay` / `import type { IncomingCallPayload }`（第 58-59 行）
- `incomingCallVisible` / `incomingCall` ref（第 349-350 行）
- `closeIncomingCall` / `handleIncomingCall` 函数（第 701-708 行）
- `mapMessageUnsubscribers.push(onIncomingCall(handleIncomingCall))`（第 957-958 行）

**新增**：

- `import { mountIncomingCallFeatures, type IncomingCallFeaturesManager } from '@/composables/useIncomingCallFeatures'`
- 顶层 `let incomingCallManager: IncomingCallFeaturesManager | null = null`
- `initMap()` 末尾（与 carManager 创建风格一致）：

```ts
if (incomingCallPopupRef.value) {
  incomingCallManager = mountIncomingCallFeatures({
    popupElement: incomingCallPopupRef.value,
    visible: layersStore.checkedIds.includes(TEMP_FRONTEND_LAYER_IDS.INCOMING_CALL),
  })
}
```

- 在 `setTempFrontendLayerVisible` 的 `managerMap` 注册 `INCOMING_CALL`
- 在 `cleanup()` 中调用 `incomingCallManager?.destroy(); incomingCallManager = null`

**保留**：

- `<!-- <IncomingCallOverlay ... /> -->` 注释（第 1134-1138 行），不做删除
- 注释上方 `incomingCallVisible` / `incomingCall` 已无引用，整体删除即可

**新增 popup ref 容器**（若使用 map 内置容器模式）：

由于 composables 内部 createElement 自管 popup，`map.vue` 内不再需要 `incomingCallPopupRef`。但为了与 carManager 风格对齐并保留兼容入口，提供一个空 div 容器也可。**决定**：composables 内部完全自管 popup 容器（`document.createElement` + append to `document.body`），`map.vue` 不新增 ref。

### 3.4 （不变）`src/baseComponent/OpenlayersMap/IncomingCallOverlay.vue`

文件保留，不删除。`map.vue` 模板中的注释块保留，业务不再调用。

## 4. 假设与决策

| 决策点 | 结论 | 理由 |
| --- | --- | --- |
| 弹窗 DOM 归属 | composables 内部 `createElement` 自管 | 用户要求"业务不能写在 map.vue 文件里"+"弹窗等展示信息都在这个文件上实现" |
| 弹窗挂载点 | `document.body` | 避免 ol/Overlay 与父组件 z-index 冲突 |
| Style 注入 | 内部 `<style>` 字符串 + head 注入；destroy 时清理 | 不污染 map.vue；不依赖全局 less |
| 唯一 id | `callId`（用户指定） | 推送消息以 callId 区分设备 |
| 推送消息结构 | 内部容错解析，多个字段名兼容 | envelope.data 字段命名未统一 |
| 精度圈算法 | 经纬度近似圆，36 段多边形，1° lat ≈ 111320 m，lng 系数 `cos(lat)` | 与 2.5D 3D 视图无依赖，纯 OpenLayers 实现 |
| 图层 zIndex | point=58, circle=57（点压圆） | 避免点击 marker 命中精度圈 |
| 数据更新策略 | 同 callId 推送 → updateCall → 重建两个 source 的对应 feature | 与 useCarFeatures 的 setData 风格一致 |
| 数据清除策略 | manager 提供 `removeCall(callId)` / `clearAll()`；本期不订阅清除消息（仅做能力暴露） | 用户描述以"实时推送"为主；保留 API 供后续扩展 |
| 订阅归属 | composables 内部订阅 `onIncomingCall` | 用户要求"业务不能写在 map.vue 文件里"；避免双重订阅 |
| `IncomingCallOverlay.vue` | 文件保留，map.vue 模板注释保留，`<script>` 的 type export 可保留可删除 | 用户明确"暂时禁用不删除" |

## 5. 验证步骤

1. **类型检查**：
   ```bash
   cd d:\work\telewave\ids\ids-gis-web
   npx vue-tsc --noEmit --ignoreDeprecations 6.0
   ```
   预期：无新增错误。

2. **构建**：
   ```bash
   npx vite build
   ```
   预期：构建成功。

3. **功能模拟**（开发态自检）：
   - 在控制台执行：
     ```js
     useMessageStore().publish('incoming.call', {
       callId: 'TEST-001',
       caller: '测试',
       phone: '+86 138 0000 0001',
       lng: 116.4074,
       lat: 39.9042,
       locationType: 'cellId',
       accuracyRadius: 500,
       status: 'online',
       updatedAt: '2026-06-12 18:23:04',
     }, { system: 'host', channel: 'postMessage' })
     ```
   - 预期：地图出现一个蓝色电话 icon + 淡蓝精度圈；点击 marker 弹出小信息卡；点击空白关闭。
   - 再推送一个 `callId: 'TEST-002'` 同样消息，预期：出现两个独立 marker；信息卡各自展示。
   - 推送 `callId: 'TEST-001'` 新坐标，预期：TEST-001 marker 位置更新，TEST-002 不受影响。

4. **图层控制**：
   - 在 layers 配置中勾选/取消 `gis:incoming_call`，预期：manager.setVisible 被调用，所有 marker 隐藏/恢复。
   - 隐藏时点击空白应不弹 popup。

5. **清理**：
   - 关闭页面后 `incomingCallManager.destroy()` 触发；popupElement.styleElement 应从 DOM 移除；`onIncomingCall` 订阅应被解绑；`pointLayer` / `circleLayer` / `overlay` 应从 map 移除。

6. **回归**：
   - `IncomingCallOverlay` 注释仍存在；不弹任何全屏 modal。
   - `useCarFeatures` / `useAlarmHotspot` 行为不受影响。
