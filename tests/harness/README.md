# 测试 Harness 规范（tests/harness）

> 本目录是**测试侧**的唯一 Harness 约定：全局 setup、数据夹具（fixtures）、以及本文档。
> 不涉及产品需求 / 技术方案设计，那些归 `herness/01-产品设计`、`herness/02-技术设计`。
> 配套流程规范见 `herness/03-测试/_流程规范.md`。

---

## 一、目录与职责

```
tests/
├── harness/          ← Harness 本体：全局 setup + 本契约文档
├── fixtures/         ← 可复用测试数据（坐标系、图层、告警样例）
├── unit/             ← 单元 / 集成测试（纯函数、store、配置、引擎适配）
├── components/       ← 组件测试（jsdom + @vue/test-utils，方案 A）
├── e2e/              ← 端到端冒烟（Playwright，独立命令）
└── __artifacts__/    ← 一切产物：覆盖率报告、e2e trace / 截图 / html 报告
```

**硬约束**：

1. 测试代码与产物**全部**在 `tests/**`，`src/**` 里不放测试文件（`vue-tsc` 的 `include` 只覆盖 `src/**/*.ts`，测试天然不污染类型门禁基线）。
2. 产物一律落在 `tests/__artifacts__/**`，并由 `.gitignore` 忽略（可重新生成，不入库）。
3. 新增依赖测试时，优先 `tests/fixtures/` 造数据，不在用例里散落魔法数。

---

## 二、测试用例四要素（强制）

每个用例的描述里必须能读出这四要素，缺一不可：

| 要素 | 含义 | 写法示例 |
|---|---|---|
| **Given** | 前置条件：store 状态、桩、初始数据 | `Given 初始状态：输入框常驻，检索结果面板隐藏` |
| **When** | 触发动作：用户操作 / 函数调用 | `When 聚焦输入框` |
| **Then** | 预期结果：可观测断言 | `Then 视图下拉展开，且结果面板未被打开` |
| **回归关联** | 该用例守护的历史缺陷或事故 | `回归 herness 工作日志 2026-10-13（检索面板上屏）` |

**判定**：一条用例如果只有 Then（只有断言、说不清前置与触发），视为未完成；评审时直接打回。

---

## 三、GIS 专用契约（ids-gis-web 特有，必须遵守）

### 3.1 坐标系契约

- 业务**对外统一 WGS84**，坐标元组顺序一律 `[经度 lng, 纬度 lat]`。
- 高德相关边界只允许出现在**入站 / 出站转换函数**上：
  - 入站：`amapGcj02ToWgs84` / `parseAmapLocation`（GCJ02 → WGS84）
  - 出站：`toAmapGjc02` / `toAmapLngLatString`（WGS84 → GCJ02）
- **禁止**在业务层、store、DTO 里直接存取 GCJ02；DTO 上**禁止**同时出现 `lng` 与 `wgs84Lng` 这类冗余坐标字段（二次转换 = 638m 级偏移事故的根因）。
- 断言坐标系正确性时，用**往返误差**而不是绝对值：
  - 正常路径往返误差应 < 1e-5 度（≈ 1m，国测局简化算法固有精度）
  - 一旦出现 > 1e-3 度（≈ 100m）级偏移，视为缺陷，立即失败
- `baidu` 投影（BD09 墨卡托）只允许经 `src/baseComponent/tools/baidu.ts` 的工厂获取；断言其瓦片 `y` 时注意**百度 y = -(OL y) - 1**，不要用 OL 行号断言。

### 3.2 消息协议契约

- 测试中出现的任何消息事件键，必须存在于 `src/const/const.message.type.ts` 的 `MESSAGE_EVENT_KEY`。
- 消息收发一律经 `useMessageStore().publish/subscribe`；**禁止**在测试里 `new WebSocket()` 或裸 `window.addEventListener('message')`。
- 改事件键 / DTO 的同时，必须同步 `docs/source/07-协议事件清单.md` 与 `docs/source/协议层DTO Schema.tsd`，并在用例的「回归关联」里注明。

### 3.3 分层契约

| 目录 | 允许 | 禁止 |
|---|---|---|
| `src/controller/core/generic/**` | 零业务 | 出现任何业务名词、地图类型 |
| `src/controller/core/business/**` | 只组装通用 DTO | `import 'ol/...'`、`import 'three'` |
| 跨层传参 | `src/controller/core/protocol/**` 的 interface | `any` |

测试同样受约束：**跨层 DTO 断言走 protocol interface**，用例里不得出现 `as any` 绕过类型。

### 3.4 测试环境隔离

- **不连真实网关**：所有 HTTP / 高德 / GeoServer 调用必须在用例里 `vi.mock`；`runSearch`、`amapApi`、`searchQuery` 一律打桩。
- **不建真实 OL Map**：`useCurrentMap()` 在组件测试里返回空对象，`isOlMap` 判定为假后相关分支直接 return；只断言 UI 层可观测行为。
- **不断言像素与瓦片**：jsdom 无布局引擎，E2E 在 CI 无外网 / 无高德 key。视觉与瓦片渲染交给人工目视，自动化只守「结构存在 / 状态正确」。
- 网络请求失败（瓦片 401、地理编码超时）不计入失败；只拦截**未捕获的 JS 运行时异常**。

---

## 四、四类测试的边界与配比

| 层级 | 目录 | runner | 覆盖什么 | 不覆盖什么 |
|---|---|---|---|---|
| 单元 | `tests/unit/` | vitest | 纯函数、坐标转换、配置归一化、store、引擎适配 | DOM |
| 组件 | `tests/components/` | vitest + @vue/test-utils | 渲染、props / emits、store 联动、显隐折叠 | 真实网络、真实地图 |
| 系统集成 | `tests/unit/`（配置 / 引擎 / 协议类） | vitest | 跨模块契约：配置持久化、投影注册、启动时序 | 端到端用户旅程 |
| E2E 冒烟 | `tests/e2e/` | Playwright | 应用能起、路由能进、关键 DOM 在位 | 深度业务逻辑 |

**配比原则**：能用单测覆盖的**不要**上组件测试；能用组件测试覆盖的**不要**上 E2E。E2E 只保留「应用起得来」这条底线，用例数控制在个位数。

---

## 五、覆盖率策略（分层阈值，不是全局一刀切）

- provider：`@vitest/coverage-v8`
- 报告：`text` / `html` / `lcov` / `json-summary`，统一落在 `tests/__artifacts__/coverage`
- `include` 采用**白名单**（`vitest.config.ts` 的 `coverage.include`），只统计有测试或有明确测试计划的核心模块，避免大面积 0% 拉低信号：

  | 模块 | 理由 |
  |---|---|
  | `src/utils/coordTransform.ts` | 坐标转换核心（WGS84/GCJ-02/BD-09），出错即 638m 级事故；改它必跑 `tests/unit/transform.spec.ts` |
  | `src/baseComponent/tools/baidu.ts` | 百度投影 / 瓦片工厂 |
  | `src/baseComponent/amap/amapCoordinate.ts` | 高德边界转换 |
  | `src/baseComponent/OpenlayersMap/baseSource.ts` | 底图注册表 |
  | `src/baseComponent/OpenlayersMap/startup.ts` | 底图就绪时序 |
  | `src/config/layers.ts` / `src/config/mapConfig.ts` | 图层配置归一化与持久化 |
  | `src/service/coordinateText.ts` | 坐标文本解析 |
  | `src/interceptor/unwrap.ts` / `matcher.ts` | 响应解包与匹配 |
  | `src/components/BIM/module/commonSetting.js` | BIM 调度数据 |
  | `src/utils/logger.ts` | 休眠模块，保持 100% 以防启用后无人知晓 |

- 全局阈值：lines 70 / functions 70 / branches 65 / statements 70。
- **阈值失败不阻塞提交**（与 lint 基线策略一致），只作为改进信号；要卡门禁时用 `pnpm test:coverage` 在 CI 单独跑。

---

## 六、新增模块接入测试的步骤

1. 判断归属层级（单元 / 组件 / 集成），落到 `tests/unit` 或 `tests/components`。
2. 需要跨模块数据 → 放 `tests/fixtures/`，命名 `xxx.ts`，导出具名常量。
3. 用例描述写全四要素（Given / When / Then / 回归关联）。
4. 若是坐标相关 → 对照 3.1 补往返误差断言。
5. 若新增模块需要计入覆盖率 → 加进 `vitest.config.ts` 的 `coverage.include`。
6. 跑 `pnpm test`；组件层还要确认 `pnpm test tests/components` 无告警噪音。
7. 跑 `pnpm lint`，确认**没有新增报错**（基线 193 项不动）。

---

## 七、命令速查

```bash
pnpm test                    # 全量单元 + 组件
pnpm test tests/unit         # 只跑单元 / 集成
pnpm test tests/components   # 只跑组件
pnpm test:watch              # 监听模式
pnpm test:ui                 # Vitest UI
pnpm test:coverage           # 覆盖率（产物在 tests/__artifacts__/coverage）

pnpm e2e                     # Playwright 冒烟（独立拉起 dev server，不影响 pnpm dev）
pnpm e2e:ui                  # Playwright UI 模式
pnpm e2e:report              # 打开上次的 HTML 报告

pnpm lint                    # 类型门禁（基线 193 项，不阻塞）
pnpm lint:baseline           # 与基线 diff，输出新增项
pnpm lint:baseline:update    # 收敛基线（仅在确认要接受现状时用）
```