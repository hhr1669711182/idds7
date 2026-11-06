# ids-gis-web 架构思想

> 一页看懂这个仓库的架构思路、真实数据链路与边界约定。
> 面向新加入的开发者与 AI Agent。代码真相源是 `src/**`；本文只讲**为什么这样设计、现在实际怎么跑**。
>
> **阅读顺序建议**：`AGENTS.md`（强制入口）→ 本文（架构全景）→ `herness/05-共享上下文/项目结构速查.md`（文件级索引）。
>
> **本文对应的代码状态**：`dev-reset` 分支，HEAD `1c1b7130`（2026-11-06 实测）。
> 事实与代码冲突时以代码为准，并回写本文。

---

## 一句话概括

> **一个 Vue 3 GIS 前端，同时以「应用」和「库」两种形态交付。**
> 消息进入后由 `useMessageStore` 统一归口 → `interceptor/` 归一与分发 → `store` / `controller` 触发业务 → `baseComponent` / `plugins` 落到地图。

---

## 一、当前规模（实测数字）

```
src/**            430 文件 / 74,002 行
├─ components/    128 文件 / 20,688 行    界面层最大头
├─ baseComponent/  61 文件 / 16,300 行    地图能力层
├─ views/          31 文件 /  5,468 行
├─ controller/     43 文件 /  5,214 行    generic 5 / business 15 / protocol 8 / io 5 / publish 5
├─ store/          23 文件 /  3,162 行    Tier1 8 个进 barrel，其余按文件导入
├─ composables/    19 文件 /  3,115 行
├─ apis/           16 文件 /  1,756 行
├─ utils/          19 文件 /  1,642 行
├─ interceptor/    18 文件 /  1,067 行
├─ plugins/        14 文件 /    999 行
├─ config/          5 文件 /    704 行
├─ const/          11 文件 /    643 行
└─ service/         5 文件 /    247 行

tests/             60 个 spec 文件（unit 52 / components 3 / e2e 5）
```

**巨型模块（>800 行，前 5）**：

| 行数 | 文件 | 说明 |
|------|------|------|
| 2158 | `baseComponent/amap/useAmapTools.ts` | 高德能力集合；路线几何核心已下沉到 `baseComponent/tools/routeBase.ts` |
| 2045 | `baseComponent/OpenlayersMap/useDispatchEntangled.ts` | 调派业务纠缠体（路线 Y 由原 `dispatchMap.vue` 迁入） |
| 932 | `baseComponent/OpenlayersMap/DispatchT1.ts` | 调派流程控制器栈 |
| 833 | `baseComponent/OpenlayersMap/DispatchT1.vue` | 调派面板 |
| 825 | `views/modelAssess/components/MasterAlarmPanel.vue` | 模型研判警情面板 |

> 拆巨型模块的原则：**只在要改动它时才顺手拆**，不做预防性重构。

---

## 二、两种交付形态

| 形态 | 入口 | 命令 | 产物 |
|---|---|---|---|
| **应用** | `src/main.ts` | `pnpm dev` / `pnpm build` | `dist/` |
| **库** | `src/lib/index.ts` | `pnpm build:lib` | `dist-lib/` |

两者共用 `src/**` 全部业务代码。库模式把 `vue/pinia/vue-router` 标记为 external，由宿主系统提供。

**装配顺序**（`src/lib/index.ts::mountApp`）：

```
createPinia + persistedstate
  → initUserStore()          共享态接收（跨标签页 seat-shared-state）
  → useCommonStore().restorePalette()
  → getBusinessMessageRuntime().start()   ★ 唯一业务接收注册
  → app.use(router)
  → initPageConditionListener()          页面条件编排
  → bindBusinessMapLifecycle(router, runtime)  调派离页生命周期
  → createMockCallLocationBridge()        F10 入站
  → createGisPointChannel()               F12 冻结选点/ACK
  → createMapRelayReader()                F11
  → createIncidentLocationProfileSync()   F13
  → initMessage()                         WS 鉴权 + topic 订阅
  → app.mount(node)
```

卸载时按**逆序**释放，`cleanups` 数组统一管理，无手工反序代码。

---

## 三、目录分层（按职责，不按技术）

```
┌──────────────────────────────────────────────────────────────┐
│  views/  components/           界面层              26,156 行  │
├──────────────────────────────────────────────────────────────┤
│  interceptor/  const.message.type  协议归一层       1,710 行  │
│   ↓ 原始报文 → NormalizedMessage{eventKey,data,meta}          │
├──────────────────────────────────────────────────────────────┤
│  store/  composables/          状态层                6,277 行  │
├──────────────────────────────────────────────────────────────┤
│  controller/                    控制层                5,214 行  │
│   core/generic(5) 零业务图形 · core/business(15) 业务规则     │
│   core/protocol(8) DTO · core/io(5) 运行时 · publish(5) 出口  │
├──────────────────────────────────────────────────────────────┤
│  baseComponent/  plugins/       地图能力层         17,299 行  │
├──────────────────────────────────────────────────────────────┤
│  apis/  service/                数据接入层           2,003 行  │
└──────────────────────────────────────────────────────────────┘
     utils/  config/  const/  types/  hooks/  register/  → 横切能力
```

### 3.1 界面层 `views/` `components/`

- 页面：`views/`（home / modelAssess / markDraw / region / building…）
- 组件：`components/`（map / MarkDraw / AddressRobot / BIM…）
- **职责**：渲染、表单交互、事件绑定。
- **不做**：直接拼协议报文、直接操作 OL 图层。

### 3.2 协议归一层 `interceptor/`（**消息入口**）

`interceptor/` 负责「原始报文 → 归一化事件」；`controller/publish/` 负责「业务侧向外发送」。
两者都只依赖 `useMessageStore`，不持有业务状态。

| 模块 | 职责 |
|------|------|
| `unwrap.ts` | 消息体归一：JSON 解析、字段大小写、topics 结构化 |
| `matcher.ts` | 订阅匹配四级兜底（topics / notifyType / eventName / data） |
| `registry.ts` | 拦截器注册、优先级排序、链式执行、`stop` 短路 |
| `install.ts` | 默认拦截器装配（seat 50 → addressbot 100 → position 110 → GPS 120 → answer 130 → incident 140 → address 150 → T1 900） |
| `transforms/` | 每类协议的归一器：把原始报文映射成 `eventKey + data` |
| `transforms/dispatchers/` | SEAT 通道二次分发（一张报文拆多个 eventKey） |

**为什么这么设计**：报文格式、通道（WS / postMessage / BroadcastChannel）、事件键会随网关版本变化，
但业务只认 `eventKey + data`。协议变更只改 `transforms/**`；业务侧零改动。

### 3.3 控制与状态层 `controller/` `store/` `composables/`

- `store/`：Pinia。**可序列化的 UI 状态**进 Pinia；OL/Three 的 Map 实例、Layer 对象不进。
- `controller/core/`：业务规则按四段划分：

| 子层 | import ol/three | 职责 |
|-------|----------------|------|
| `core/generic/` | ✅ 允许 | 通用图形控制：几何、视角、运动学。**必须零业务** |
| `core/business/` | ✅ 允许（见下方口径说明） | 调度、告警、值班、天气。只组装通用 DTO |
| `core/protocol/` | ❌ 禁止 | 跨层 DTO interface，无实现 |
| `core/io/` | — | IO 抽象：`BusinessMessageRuntime` / `InputController` / `messageStagePolicy` |

> **`core/business` 能否 import ol 的口径**（三处文档已统一）：
> 允许。2026-10-30 起 `core/business/**` 可直接 `import 'ol/...'` 实现上图业务；
> 跨层数据仍须走 `core/protocol/**` 的 interface，**禁止 `any`**。
> 现状仅 `IncidentVideoOverlayController.ts` 3 处引用（`ol/Overlay` / `ol/Map` / `ol/proj`）。
> `publish/` 层仍**不碰引擎**。

- `controller/publish/index.ts`：消息**发送**统一门面（薄封装 `useMessageStore().publish`）。
  按 `MESSAGE_SYSTEM` 分类为 `map.ts`（system=map, ws）/ `host.ts`（system=host, postMessage）/ `three.ts`（system=three, ws）。
  **当前状态：预留出口，零业务调用方**（发送功能尚未启用），不注册到任何控制器。
- `composables/`：可复用的大块功能组合（弹窗、图层、动画、F10～F13 通道桥）。

**为什么这么设计**：地图引擎（OL/Three/Cesium）换型或升级时，只改 `generic` 与底座层；业务规则不动。

### 3.4 地图能力层 `baseComponent/` `plugins/`

- `baseComponent/`：OL 封装（地图实例、图层管理、要素查询、绘制工具、底图、启动时序）
- `plugins/mapPlugins/`：以 composable 形式提供的地图能力（底图、绘制、路径规划、覆盖物、要素样式）
- `baseComponent/OpenlayersMap/style/`：★ 地图样式统一出口（types / icons / palette / factory / registry），
  `getStyle` 是取样式的唯一入口

**职责**：所有「碰 OL/Three 的代码」都收在这两层，加 `controller/core/generic` 与 `core/business`。

### 3.5 数据接入层 `service/` `apis/`

- `service/`：HTTP 统一入口（alova 封装）。注意 `src/interceptor/` 是**消息**拦截器，与 HTTP 层不同，不要混淆目录。
- `apis/`：按业务域管理的接口层。
- `config/env.ts`：环境变量统一入口。业务代码禁直接读 `import.meta.env`。

---

## 四、消息链路（项目的主脊梁）

这是全仓唯一真正「设计过」的链路，其余多为工程堆叠。

```
WS / postMessage / BroadcastChannel
  ↓ useMessageStore.receive()          ← 唯一收发出口（store/useMessageStore.ts）
  ↓ interceptor/registry.run()         ← 按 priority 排序，stop 可短路
  ↓ matcher.ts 四级兜底匹配（topics→notifyType→eventName→data）
  ↓ transforms/* → NormalizedMessage{eventKey, data, meta}
  ↓ useMessageStore.dispatch() → subscribe(eventKey, cb)
  ↓ controller/core/io/InputController ← 业务订阅集中地（约 40 个事件键）
  ↓ BusinessController → core/business/*
  ↓ BusinessMapPort（无引擎 DTO）→ baseComponent → OL/Three
```

发送方向对称：

```
业务代码 → controller/publish/{map,host,three}.ts → useMessageStore().publish() → WS / postMessage
```

**订阅的唯一注册地**是 `controller/core/io/InputController.ts`（`initSubscriptions()`），
它把事件键映射到 `BusinessController` 的具体方法。`messageStagePolicy.ts` 维护
**事件键 → 载荷类型** 的全量映射（`MessagePayloads`），新增事件键必须同步这张表。

### 四·之一、`NormalizedMessage` 为什么可行

`NormalizedMessage{eventKey, data, meta}` 是**拦截器链的产物**，不是业务侧的数据结构：

- **谁生产**：只有 `interceptor/transforms/**` 生产，registry 负责按 priority 排序与短路。
- **谁消费**：`useMessageStore.dispatch()` 立刻拆成 `{eventKey, data, meta}` 三元组分发给订阅者，
  订阅者拿到的是**已解构的入参**，不是 `NormalizedMessage` 对象。
- **为什么不是第二套协议**：`eventKey` 与 `data` 的类型由 `messageStagePolicy.MessagePayloads` 全量约束，
  `meta` 只承载 `origin/mock/snapshotKind` 等传输元信息，**不含业务语义**。
- **好处**：协议变更（网关改报文格式）只改 `transforms/**`，业务侧一行不动。

**结论**：这套设计是可行的，且已被 `tests/unit/messageNormalization*.spec.ts` + 916 回放夹具覆盖。
唯一要守住的纪律：**新增事件键必须同时补 `MessagePayloads` 与 `docs/source/07-协议事件清单.md`**。

---

## 五、单实例地图架构（★ 最容易踩坑的地方）

这是本项目最有价值的架构决策。

### 5.1 终态形态

- **一个常驻 OLMap**：`views/home.vue` 恒渲染 `<Map/>`，`/dispatch` 退化为 thin redirect（`redirect: '/map'`）
- **variant 派生而非状态**：`isDispatchVariant()` 从 `useUserStore` 现成字段派生，**零新增 state 字段**
- **调派业务寄生**：原 `dispatchMap.vue`(3294行) + `components/dispatchMap/index.vue` + `views/dispatch/index.vue` 已全删，
  业务整块搬进 `useDispatchEntangled.ts`(2045行)
- **归一底座**：`useGisBaseMap.ts` 统一 WMS 图层生命周期，差异由 options 显式编码
  （`disposeSourceOnRemove` / `respectConfigVisible` / `syncTempInvisible` / `guardRemoveLayer`）
- **图层单一事实源**：`useLayersStore` 唯一持有勾选状态（原 `useDispatchMapStore` 已于 2026-11-05 归并删除），
  工具栏 `components/map/layers.vue` 双变体共用，车辆 GPS 按钮由 `useVehicleTrackStore` 驱动并入同一工具栏

### 5.2 展示模式分层（`LayerViewMode`）

粒度比 variant 更细：**MapPhase 6 阶段 + flood 特灾轴 = 7 模式**。

| 关注点 | 落点 |
|--------|------|
| 模式定义 | `config/layers.ts`：`LAYER_MODE_DEFAULT_CHECKED_IDS` / `LAYER_MODE_HIDDEN_LAYER_IDS`（全键 `Record`，TS 编译期强制 7 键，漏配即报错） |
| 模式派生 | `baseComponent/OpenlayersMap/gisMapConfig.ts::resolveLayerViewMode()`（读 `useUserStore`，无新状态） |
| 状态投影 | `useLayersStore.activeMode` + `setMode()`（按隐藏表过滤勾选，交集为空则回落该模式默认集） |
| 驱动 | `components/map/index.vue` 的 `watch(layerMode, mode => layersStore.setMode(mode), { immediate: true })` |

**约定**：新增展示模式只需加配置表一行 + `LayerViewMode` 成员，store/组件零改动。
默认集必备图层（如消防站 `gis:view_res_org_dept`）配 `locked: true`，`mapConfig.createResource` 强制 `enabled=true`。

### 5.3 ★ 变体切换契约（改动地图前必读）

单实例常驻架构下，**共享资源的释放责任归属谁**必须在设计时写清。

| 资源类型 | 归属 | 规则 |
|---------|------|------|
| 共享设施（manager / nav / port） | 常驻方 | 调派侧只**消费**，不 destroy |
| 变体专属资源（点位图层、图层、交互、监听） | 变体方 | 创建方负责在 `deactivate()` 显式还原 |

四条强制项：

1. **`deactivate()` 里的还原逻辑不能依赖 watch 触发**——watch 已 stop，必须显式调用恢复函数。
   已覆盖：CQL 强占（`restoreWmsLayerSnapshot`）、队站全量口径（`restoreAllFireStations`）、
   范围圈矢量层与 Modify 交互。
2. **每新增一类调派专属资源，必须同步在 `deactivate()` 补还原**，否则切回主图态永久残留。
3. **还原顺序**：先释放强占（解除图层/交互占用）→ 再复原集合（按主图态重建图层）。
4. **单槽位注册表被抢占后，切回时必须重新注册**。

`map.vue` 的 `watch(() => isDispatchVariant())` 是**唯一的变体切换出口**：

| 方向 | 必须做的事 |
|------|-----------|
| 进调派 | `attachDispatchBusiness()` + `entangled.activate()` + attach `kind: 'dispatch'` |
| 切回主图 | `entangled.deactivate()` + `detachDispatchBusiness()` + **重新 attach `kind: 'map'`** + `syncLayers(layersStore.checkedIds, true)` |

> **多槽位（2026-11-06 起）**：`BusinessMessageRuntime.attachMap` 已改为按 `kind` 分别持有 attachment
> （`kind:'map'` 主图 / `kind:'dispatch'` 调派），两者**同时存活、互不顶替**。
> 因此切回主图态**不再需要重新 attach**——主图端口全程存活，业务动作按
> 「调派优先、无调派槽位则回落主图」自动选槽。
> 已知副作用已处理：两个槽位的 `AddressRobotRenderer` 可能抢同一 `businessId` 图层，
> renderer 内部按 owner 判定，owner 不符时改用带实例序号的独立图层名。
> 覆盖：`tests/unit/businessMessageRuntime.spec.ts`（4 条多槽位用例，含反向验证）+ `tests/e2e/variantRoundTrip.spec.ts`。

### 5.4 图层勾选的单一口径

`components/map/index.vue` 里的图层 watch 带 `dispatchVariant` 门控：
**主图态不允许调派逻辑改写图层集合**。反之，调派态的勾选会写同一份 `useLayersStore.checkedIds`，
切回主图态时由 5.3 的 `syncLayers(layersStore.checkedIds, true)` 复原。

---

## 六、跨层沟通规则

### 6.1 坐标系统一

- 业务对外**统一 WGS84**，顺序 `[lng, lat]`（经度在前）。
- 坐标转换**只有一处实现**：`src/utils/coordTransform.ts`（WGS84 / GCJ-02 / BD-09 全套）。
  `baseComponent/amap/amapCoordinate.ts` 只做高德场景封装。**禁止在业务层散写偏移算法**。
- 百度用独立投影（`tools/baidu.ts`），瓦片 `y = -(OL y) - 1`。
- **禁止**在业务层、store、DTO 上同时出现 `lng` 与 `wgs84Lng` 这类冗余坐标字段。

### 6.2 类型安全

- 跨层传参必须用 `controller/core/protocol/**` 的 interface。
- 禁 `any`；禁「裸 `pnpm lint` 可遮蔽新增报错」。
- **类型门禁判定标准是「零报错」**：`pnpm lint` 当前 **0 项**（原 193 项基线已于 2026-10-22 全部真修，
  `lint-baseline.json` 收敛为 0 项）。出现新报错必须当场修，不许再攒基线。

### 6.3 协议真相源

| 内容 | 真相源 | 需同步的文档 |
|------|--------|---------------|
| 事件键 / 订阅主题 | `src/const/const.message.type.ts` | `docs/source/07-协议事件清单.md` |
| DTO | `src/controller/core/protocol/**` | `docs/source/协议层DTO Schema.tsd` |
| 事件键→载荷类型映射 | `src/controller/core/io/messageStagePolicy.ts` | 同上 |
| 消息归一规则 | `src/interceptor/**` | `src/interceptor/README.md` |

---

## 七、状态层：Store 分层

`src/store/index.ts` 是 Tier 1 全局 barrel，**只导出 8 个跨路由核心 store**：

```
useCommonStore  useMapStore  useMapConfigStore  usePanelStore
usePendingCallLocationStore  usePendingDispatchAlarmStore
useMessageStore  useUserStore
```

其余 15 个路由专属 store（Tier 2）**不进 barrel**，调用方直接 `import { useXxxStore } from '@/store/useXxxStore'`，
避免首屏把全部 store 拉进同一 chunk。

**硬约束（S7）**：底层文件（`const/`、`types/`、`interceptor/`、`controller/`、`utils/`）
**禁止从 `@/store` 总入口导入 store**，必须按文件路径直接导入——否则会形成
`const.message.type` ← `@/store` barrel ← `useMessageStore` → `interceptor` 的循环依赖，触发 TDZ 错误。

---

## 八、测试架构

```
tests/
├── unit/         单元 + 集成（纯函数、配置、协议归一）— vitest   52 文件
├── components/   组件（jsdom + @vue/test-utils）                   3 文件
├── e2e/          Playwright（冒烟 + 变体往返回归）                5 文件
├── harness/      测试契约真相源（四要素 + GIS 专用契约）README.md + setup.ts
├── fixtures/     可复用测试数据 + control-baseline 916 回放夹具
└── __artifacts__/ 报告与产物（gitignore）
```

**判定标准**：`pnpm test` 全绿 + `pnpm lint` 0 报错 = 「我改对了」。

> 当前规模：`pnpm test` **55 文件 579 项**全通过；`pnpm e2e` **11/11** 全绿。

---

## 九、自动生成与禁改清单

| 路径 | 状态 |
|------|------|
| `src/types/auto-imports.d.ts` | 🔴 自动生成，禁改 |
| `src/types/components.d.ts` | 🔴 自动生成，禁改 |
| `dist/` `dist-lib/` `node_modules/` | 🔴 产物，禁改 |

---

## 十、命令速查

```bash
pnpm dev            # 应用开发（8888）
pnpm build          # 应用构建
pnpm build:lib      # 库构建
pnpm lint           # 类型检查（vue-tsc，0 报错为标准）
pnpm lint:baseline  # 类型门禁 diff
pnpm test           # 单元 + 组件（Vitest）
pnpm test:coverage  # 覆盖率（产物在 tests/__artifacts__/coverage）
pnpm e2e            # E2E（Playwright，独立拉起 dev server）
pnpm harness:check  # herness 文档体量 + 样式 + 资源门禁
```

---

## 十一、当前已知技术债

| 编号 | 位置 | 说明 |
|------|------|------|
| **K-3** | `BusinessMessageRuntime.attachMap` | ✅ **已解决**（2026-11-06 改多槽位）：按 `kind` 分别持有 attachment，主图 `kind:'map'` 与调派 `kind:'dispatch'` 同时存活、互不顶替；业务动作按「调派优先、无调派槽位则回落主图」自动选槽 |
| **K-1** | `useDispatchMapStore` | ✅ **已解决**（2026-11-05 归并进 `useLayersStore`，文件删除） |
| **K-2** | `DispatchT1.isLayerVisible` | ✅ **已解决**（2026-11-06 删除）：原为死参数，全仓无消费点，类型声明与注入一并移除 |
| 分层 | `core/business/IncidentVideoOverlayController.ts` | 3 处 `import 'ol/...'`——**符合现行口径**（2026-10-30 已放宽），非越层 |
| 首屏 | `vite.config.ts` | 无 `manualChunks`/`advancedChunks` 分包策略；首屏 JS 实测 316KB gzip（25 chunk） |
| 巨型模块 | `useAmapTools.ts` 2158 行 / `useDispatchEntangled.ts` 2045 行 | 拆动风险高，只在要改动它时顺手拆 |
| 构建告警 | `src/components/BIM/module/initThreeBuilding.js` | `THREE.sRGBEncoding` 在 three@0.169 已移除 → 恒为 `undefined`，3D 色彩空间设置静默失效 |
| 部署 | `nginx.conf` / `Dockerfile` | **不在版本控制内**（`.gitignore` 第 48 行 jenkins 段），压缩与缓存配置需人工同步部署侧 |

---

## 十二、历史遗留已清理（勿再复活）

| 原设计 | 状态 | 去向 |
|--------|------|------|
| `controller/map/index.ts`、`controller/three/index.ts` | ✅ 已删除 | 发送出口 → `controller/publish/**` |
| `src/subscribe/` | ✅ 已删除 | 订阅统一收口到 `controller/core/io/InputController` |
| `src/Control/` | ✅ 已删除 | 对照实现下沉 fixture（`tests/fixtures/control-baseline/`） |
| `src/store/useMessageStore916.ts` | ✅ 已删除 | 回放夹具 → `tests/fixtures/control-baseline/` |
| `baseComponent/OpenlayersMap/dispatchMap.vue` | ✅ 已删除 | 业务 → `useDispatchEntangled.ts` |
| `components/dispatchMap/DispatchLayers.vue` | ✅ 已删除 | 图层工具栏 → `components/map/layers.vue` |
| `store/useDispatchMapStore.ts` | ✅ 已删除 | 归并 → `useLayersStore` |
| `views/dispatch/`、`views/dispatch1/` | ✅ 已删除 | 路由退化为 thin redirect |
| `store/useDispatch1MapStore.ts` | ✅ 已删除 | `/dispatch1` 转正 `/dispatch` 后合并 |

> **新代码规则**：
> 1. 接收消息 → 在 `controller/core/io/InputController.ts` 注册订阅；
> 2. 发送消息 → `controller/publish/{map,host,three}.ts`；
> 3. 协议归一规则 → `interceptor/transforms/**`；
> 4. 事件键真相源 → `src/const/const.message.type.ts`。

---

## 十三、验证入口

```
AGENTS.md                    ← 所有 AI 的强制入口（先读它）
herness/00-SOP.md            ← 工作 SOP、分层铁律、质量门禁
herness/05-共享上下文/项目结构速查.md  ← 文件归类速查
herness/05-共享上下文/模块设计速查.md  ← 模块深浅与 seam 判断
herness/05-共享上下文/当前状态摘要.md  ← 当期真实状态
src/interceptor/README.md    ← 消息归一规则详解
tests/harness/README.md      ← 测试契约（改测试前先读）
```

---

**核心思想**：架构围绕 **「界面 → 状态与控制 → 协议归一 → 地图能力 → 数据接入」** 展开。
新增代码先问自己：**「我该放进哪一层」**，而不是 **「这个功能放哪方便」**。
改动地图相关代码前，先读第五节的**变体切换契约**。
