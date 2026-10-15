# ids-gis-web 架构思想

> 一页看懂这个仓库的架构思路、真实数据链路与边界约定。
> 面向新加入的开发者与 AI Agent。代码真相源是 `src/**`；本文只讲**为什么这样设计、现在实际怎么跑**。
>
> **阅读顺序建议**：`AGENTS.md`（强制入口）→ 本文（架构全景）→ `herness/05-共享上下文/项目结构速查.md`（文件级索引）。

---

## 一句话概括

> **一个 Vue 3 GIS 前端，同时以「应用」和「库」两种形态交付。**
> 消息进入后由 `useMessageStore` 统一归口 → `interceptor/` 归一与分发 → `store` / `controller` 触发业务 → `baseComponent` / `plugins` 落到地图。

---

## 一、两种交付形态

| 形态 | 入口 | 命令 | 产物 |
|---|---|---|---|
| **应用** | `src/main.ts` | `pnpm dev` / `pnpm build` | `dist/` |
| **库** | `src/lib/index.ts` | `pnpm build:lib` | `dist-lib/` |

两者共用 `src/**` 全部业务代码。库模式把 `vue/pinia/vue-router` 标记为 external，由宿主系统提供。

---

## 二、目录分层（按职责，不按技术）

```
┌──────────────────────────────────────────────────┐
│  views/  components/           界面层              │  渲染 UI，把用户操作转成业务意图
├──────────────────────────────────────────────────┤
│  controller/  store/  composables/  控制与状态层   │  执行业务规则，编排地图动作
├──────────────────────────────────────────────────┤
│  interceptor/  const.message.type  协议归一层     │  消息归一 → 匹配 → eventKey 映射
├──────────────────────────────────────────────────┤
│  baseComponent/  plugins/mapPlugins/  地图能力层   │  所有直接操作 OL/Three 的代码
├──────────────────────────────────────────────────┤
│  service/  apis/               数据接入层          │  HTTP / 高德 / GeoServer
└──────────────────────────────────────────────────┘
     utils/  config/  const/  types/  hooks/  → 横切能力
```

### 2.1 界面层 `views/` `components/`

- 页面：`views/`（home / dispatch / markDraw / modelAssess / region / building…）
- 组件：`components/`（map / MarkDraw / AddressRobot / BIM…）
- **职责**：渲染、表单交互、事件绑定。
- **不做**：直接拼协议报文、直接操作 OL 图层。

### 2.2 控制与状态层 `controller/` `store/` `composables/`

- `store/`：Pinia。**可序列化的 UI 状态**进 Pinia；OL/Three 的 Map 实例、Layer 对象不进。
- `controller/core/`：业务规则按三段划分：

| 子层 | import ol/three | 职责 |
|---|---|---|
| `core/generic/` | ✅ 允许 | 通用图形控制：几何、视角、运动学。**必须零业务** |
| `core/business/` | ❌ 禁止 | 调度、告警、值班。只组装通用 DTO |
| `core/protocol/` | ❌ 禁止 | 跨层 DTO interface，无实现 |
| `core/io/` | — | IO 抽象 |

- `controller/publish/index.ts`：消息**发送**统一门面（薄封装 `useMessageStore().publish`）。原 `controller/map` / `controller/three` 已废弃删除。
- `composables/`：可复用的大块功能组合（弹窗、图层、动画）。

**为什么这么设计**：地图引擎（OL/Three/Cesium）换型或升级时，只改 `generic` 与 `map/three` 入口层；业务规则不动。

### 2.3 协议归一层 `interceptor/`（**消息入口**）

`interceptor/` 负责「原始报文 → 归一化事件」，`publish/` / `subscribe/` 负责「业务侧进出消息」。两者都只依赖 `useMessageStore`，不持有业务状态。

```
收：WS / postMessage / BroadcastChannel
      ↓ useMessageStore（唯一收/发出口，内含拦截器链调用）
      ↓ interceptor/registry.run()  按 priority 顺序执行拦截器
      ↓ matcher.ts   四级匹配：topics → notifyType → eventName → data
      ↓ transforms/*  归一为 NormalizedMessage { eventKey, data, meta }
      ↓ useMessageStore.dispatch()
      ↓ @/subscribe   → 业务组件 / composable / controller 执行业务

发：业务代码 → @/publish → useMessageStore().publish() → WS / postMessage
```

| 模块 | 职责 |
|------|------|
| `interceptor/unwrap.ts` | 消息体归一：JSON 解析、字段大小写、topics 结构化 |
| `interceptor/matcher.ts` | 订阅匹配四级兜底（topics / notify / eventName / data） |
| `interceptor/registry.ts` | 拦截器注册、优先级排序、链式执行、`stop` 短路 |
| `interceptor/install.ts` | 默认拦截器装配（seat / alarm / alarmCall / carLocation） |
| `interceptor/transforms/` | 每类协议的归一器：把原始报文映射成 `eventKey + data` |
| `@/subscribe` | 业务侧接收出口：`onRouteRequest` / `onIncomingCall` / `onLoadModel` 等薄封装 |
| `@/publish` | 业务侧发送出口：`publishRoutePlan*` / `publishAddrPoiPick` 等薄封装 |

**为什么这么设计**：报文格式、通道（WS / postMessage / BroadcastChannel）、事件键会随网关版本变化，但业务只认 `eventKey + data`。协议变更只改 `transforms/**`；业务侧进出消息只改 `subscribe/` `publish/` 的一层薄封装。
        ↓
  transforms/*  归一为 { eventKey, data, meta }
        ↓
  useMessageStore.dispatch() → subscribe(eventKey, cb)
        ↓
业务组件 / composable / store 执行业务
```

| 文件 | 职责 |
|---|---|
| `unwrap.ts` | 消息体归一：JSON 解析、字段大小写、topics 结构化 |
| `matcher.ts` | 订阅匹配四级兜底（topics / notify / eventName / data） |
| `registry.ts` | 拦截器注册、优先级排序、链式执行、`stop` 短路 |
| `install.ts` | 默认拦截器装配（seat / alarm / alarmCall / carLocation） |
| `transforms/` | 每类协议的归一器：把原始报文映射成 `eventKey + data` |
| `transforms/dispatchers/` | SEAT 通道的二次分发（一张报文拆多个 eventKey） |

**为什么这么设计**：报文格式、通道（WS / postMessage / BroadcastChannel）、事件键会随网关版本变化，但业务只认 `eventKey + data`。协议变更只改 `transforms/**`，业务代码零改动。

### 2.4 地图能力层 `baseComponent/` `plugins/`

- `baseComponent/`：OL 封装（地图实例、图层管理、要素查询、绘制工具、底图、启动时序）
- `plugins/mapPlugins/`：以 composable 形式提供的地图能力（底图、绘制、路径规划、覆盖物、要素样式）

**职责**：所有「碰 OL/Three 的代码」都收在这两层，加 `controller/core/generic`。

### 2.5 数据接入层 `service/` `apis/`

- `service/`：HTTP 统一入口（alova 封装）。注意 `src/interceptor/` 是**消息**拦截器，与 HTTP 层不同，不要混淆目录。
- `apis/`：第三方 API 封装（高德）。
- `config/env.ts`：环境变量统一入口。业务代码禁直接读 `import.meta.env`。

---
## 三、`Control/` 的定位：历史遗留，正在退出

**实测结论**：`src/Control/` 属于早期消息处理模式（直接 `subscribe` + handler 集合）。原 `controller/map` / `controller/three` 同属这套设计，均已废弃并删除。

| 原设计 | 状态 | 迁移去向 |
|--------|------|----------|
| `controller/map/index.ts` | ✅ 已删除 | 订阅入口随 `src/subscribe/` 一并下线；发送 → `src/controller/publish/index.ts` |
| `controller/three/index.ts` | ✅ 已删除 | `onLoadModel` 订阅随 `src/subscribe/` 下线；`buildFormSend` → `src/controller/publish/index.ts` |
| `Control/initMessage.ts` | ✅ 退出 App 启动链 | `App.vue` 改用 `src/register/initMessage.ts` |
| `Control/initMessage916.ts` + `useMessageStore916.ts` | ⚠️ 历史死代码，仅自身引用 | 后续清理 |
| `Control/mapMessageHandlers.ts` 等 | ⚠️ 只被旧链路引用 | 后续清理 |

**新代码规则**：

1. **不写 `Control/`，不写 `controller/map` / `controller/three`**（后两者已删除）；
2. 接收消息 → 从 `@/subscribe` import；
3. 发送消息 → 从 `@/publish` import；
4. 协议归一规则 → 加到 `interceptor/transforms/**`；
5. 事件键真相源：`src/const/const.message.type.ts`。

> 迁移过程中修复了一处运行时白屏：`App.vue` 原先 import 的是 `Control/initMessage.ts`（旧版），它调用 store 已删除的 `setIngressGate`，导致 `beforeMount` 抛错白屏。已切到 `@/register/initMessage`。

---

## 四、跨层沟通规则

### 4.1 坐标系统一

- 业务对外**统一 WGS84**，顺序 `[lng, lat]`（经度在前）。
- 坐标转换**只有一处实现**：`src/utils/coordTransform.ts`（WGS84 / GCJ-02 / BD-09 全套）。`baseComponent/amap/amapCoordinate.ts` 只做高德场景封装。**禁止在业务层散写偏移算法**；公共工具清单见 `herness/05-共享上下文/公共工具速查.md`。
- 百度用独立投影（`tools/baidu.ts`），瓦片 `y = -(OL y) - 1`。
- **禁止**在业务层、store、DTO 上同时出现 `lng` 与 `wgs84Lng` 这类冗余坐标字段。
- 测试契约（往返误差阈值）见 `tests/harness/README.md`.

### 4.2 类型安全

- 跨层传参必须用 `controller/core/protocol/**` 的 interface。
- 禁 `any`；禁「裸 `pnpm lint` 可遮蔽新增报错」。
- 类型门禁判定标准是「**零新增报错**」，基线 193 项为历史遗留。

### 4.3 协议真相源

| 内容 | 真相源 | 需同步的文档 |
|---|---|---|
| 事件键 / 订阅主题 | `src/const/const.message.type.ts` | `docs/source/07-协议事件清单.md` |
| DTO | `src/controller/core/protocol/**` | `docs/source/协议层DTO Schema.tsd` |
| 消息归一规则 | `src/interceptor/**` | `src/interceptor/README.md` |

---

## 五、测试架构

```
tests/
├── unit/         单元 + 集成（纯函数、配置、协议归一）— vitest
├── components/   组件（jsdom + @vue/test-utils）
├── e2e/          冒烟（Playwright）— 独立命令，不进 dev
├── harness/      测试契约真相源（四要素 + GIS 专用契约）
├── fixtures/     可复用测试数据
└── __artifacts__/ 报告与产物（gitignore）
```

**判定标准**：`pnpm test` 全绿 + `pnpm lint:baseline` 无新增 = 「我改对了」。

---

## 六、自动生成与禁改清单

| 路径 | 状态 |
|---|---|
| `src/types/auto-imports.d.ts` | 🔴 自动生成，禁改 |
| `src/types/components.d.ts` | 🔴 自动生成，禁改 |
| `dist/` `dist-lib/` `node_modules/` | 🔴 产物，禁改 |

---

## 七、命令速查

```bash
pnpm dev            # 应用开发（8888）
pnpm build          # 应用构建
pnpm build:lib      # 库构建
pnpm test           # 单元 + 组件（16 文件 / 86 用例）
pnpm test:coverage  # 覆盖率（产物在 tests/__artifacts__/coverage）
pnpm e2e            # E2E 冒烟（独立拉起 dev server）
pnpm lint:baseline  # 类型门禁 diff（基线 193 项）
pnpm lint           # 类型检查（基线 193 项，不阻塞提交）
```

---

## 八、当前已知债务（不阻塞，但要知道）

| 债务 | 位置 | 说明 |
|---|---|---|
| 分层越界 | `controller/core/business/` 6 文件 20 处 ol/three import | 铁律未机器化；新增代码必须遵守，新增 PR 一眼看 |
| 版本分裂 | `useMessageStore916.ts` + `Control/initMessage916.ts` | 历史死代码，仅自身引用；暂删「回滚能力」 |
| 副本文件 | `CircleQueryTool copy 2/3.ts` | 工作文件副本未清理；新增代码不得再产生副本 |
| Giant component | `dispatchMap.vue` 52KB、`useAmapTools.ts` 46KB | 待渐进拆分（只在有新需求改动这些文件时顺手拆） |
| Type debt | 193 项 vue-tsc 报错 | 基线不处理，但判定标准是「零新增」 |

---

## 九、验证入口

```
AGENTS.md                    ← 所有 AI 的强制入口（先读它）
herness/00-SOP.md            ← 工作 SOP、分层铁律、质量门禁
herness/05-共享上下文/项目结构速查.md  ← 文件归类速查
src/interceptor/README.md    ← 消息归一规则详解
tests/harness/README.md      ← 测试契约（改测试前先读）
```

---

**核心思想**：架构围绕 **「界面 → 状态与控制 → 协议归一 → 地图能力 → 数据接入」** 展开。新增代码先问自己：**「我该放进哪一层」**，而不是 **「这个功能放哪方便」**。
