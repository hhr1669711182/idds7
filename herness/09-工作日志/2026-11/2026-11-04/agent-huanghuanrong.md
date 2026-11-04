# agent-huanghuanrong 工作日志 2026-11-04

## 路线 X→Y 地图实例归一重构 · 深度代码评审（2 个 P0 缺陷 + 2 个 P1 隐患）

### 背景
用户要求评审 `8ef37c6b`（路线X 地图归一）到当前工作区的全部改动，核对是否「准确无误、完好完善」，
覆盖 7 项目标：功能无损 / 代码简洁无缺陷 / 注释合规 / 外部无缝隙 / 设计最优 / 历史对比 / 模型能力评估。

### 评审结论：**有条件通过**（发现 2 个 P0 缺陷，均有运行期证据）

#### P0-1 调派专属 WMS 图层泄漏到主图态
主图与调派共用同一 OLMap 后，`layersStore.checkedIds`（主图）与 `dispatchMapStore.checkedIds`（调派）
两套状态源并存。`components/map/index.vue` 的调派图层 watch **缺 `dispatchVariant` 门控**，
且 `useGisBaseMap.syncLayers` 语义是「以传入列表为准、移除其余 WMS 图层」
→ 调派态操作图层会删主图图层，切回主图态时调派图层残留、主图图层不恢复。

实测证据（Playwright 探针）：
```
主图态 22 层 → 调派态 29 → 操作后 34 → 切回主图态仍 29（未回 22）
残留: gis:view_juris_zone / gis:env_build_aoi / gis:view_env_building
       / gis:env_greatchina_road / gis:view_env_enterprises
丢失: 无
```

#### P0-2 切回主图态后主图 business attachment 永久失效
`BusinessMessageRuntime.attachMap` 是 single-slot，新 attach 顶掉旧的（`valid()` 守卫变 no-op）。
时序：initMap attach `kind:'map'` → 进调派 attach `kind:'dispatch'`（顶掉主图）→ 切回主图
**只做 `entangled.deactivate()`，没有重新 attach 主图**。
旧双实例架构下 variant 切换会重建包装层、主图 initMap 重跑，自然重建；新架构主图常驻，这一步没人补。

实测证据（attachMap 临时探针记录 kind 序列）：
```
主图态 ['map'] → 调派态 ['map','dispatch'] → 切回主图态 ['map','dispatch']  ← 缺第三次 'map'
```
影响：主图经 `runtime.port` 的能力（来电定位 / 地址机器人 / 范围圈高亮）**静默失效**——不抛异常、测试全绿。

#### P1-1 deactivate 未恢复 CQL 强占与主管队站排除
`syncStationLayerOverride` / `syncFireManagerStations` 的恢复逻辑都挂在 watch 上，
但 `deactivate()` 先 stop watch 再把快照置 null → 恢复分支永不触发。
旧架构销毁整个 map 实例所以无害，新架构单实例常驻 → CQL 永久残留。
（受环境所限未跑出数值证据，但代码路径明确。）

#### P1-2 主图全量队站 vs 调派排除口径不一致
旧 dispatchMap 加载队站后立即排除主管；新实现主图先填全量、切回主图态时 watch 已停不再恢复。

#### 注释规范偏差
`useDispatchEntangled.ts` 文件头 JSDoc 20 行 > 硬上限 10 行；注释占比 8.1%，密度合理。

### 通过项（11 维度）
分层合规 ✅ / 契约一致 ✅（协议层零改动，事件键零变更）/ 订阅释放 ✅ / 资源释放 ✅ /
类型安全 ✅（lint 0 项）/ 性能 ✅（preload 恢复 4）/ 坐标与空间 ✅ / 禁改文件 ✅ / 文档同步 ✅
消息链路 ⚠️（见 P0-2）/ 测试覆盖 ⚠️（缺往返回归）/ 注释 ⚠️ / 正确性 ❌

### 根因归纳（写入报告，供后续重构参考）
> **单实例化（多实例 → 单实例）重构，凡是「原来靠实例隔离、现在靠状态隔离」的逻辑都要重新推演。**
> 双实例时 A 改 A 的状态互不影响；单实例后 A 改 A 的状态会打到共享资源上。

### 模型能力评估（第 7 项）
- **代码生成 A**：3294 行 SFC → 2364 行 composable，功能调用链 100% 保真（TS AST 逐函数验证，仅缩进/注释差异）；
  依赖注入边界清晰（区分纠缠体自有 vs 共享 4 manager）；生命周期四段职责分明；踩坑沉淀具体可复现。
- **业务梳理 A-**：消息契约 / 图层归属 / manager 所有权梳理准确；但**未推演「双状态源在共享实例上的竞争」**。
- **验证完备性 C**：两个 P0 都不是「代码写错」，而是「**没去验证那个方向**」——
  重心全放在「进调派」，出口路径（deactivate / 切回主图）几乎无验证，e2e 也只断言「调派面板渲染」。
- **总体**：生成质量高，验证完备性明显低于生成质量。属任务策略问题而非能力上限。

### 产出
- `herness/06-PR审查/评审报告/路线X-Y地图实例归一重构-代码评审报告.md`（新建）
- `herness/06-PR审查/_index.md`（新建，评审报告索引）

### 验证与清理
| 项 | 结果 |
|---|---|
| `pnpm test` | ✅ 55 文件 / 579 项全通过 |
| `pnpm lint:baseline` | ✅ 0 项 |
| 探针清理 | ✅ 4 个 Playwright 探针 + 2 处源码临时钩子全部还原，`git diff -- src/controller/**` 为空 |
| 报告引用校验 | ✅ 9 条路径引用全部存在 |

## 修复 48 项存量测试失败 + 迁移路线 Y 遗留的崩溃套件（55 文件 / 579 项全绿）

### 背景
前一晚落地「模块设计方法论入 herness」时发现 `pnpm test` 有 48 项失败。
用 HEAD 拉临时 worktree 做对照确认：**这 48 项在 HEAD 上同样失败**，属存量问题，非当次引入。
本次一并修完，使测试基线真正回到全绿。

### 三类根因与修法

#### 1. store 分层重构后 mock 路径失效（36 项 · tests/unit/messageNormalization.spec.ts）

- **根因**：2026-10-28「store 分层首屏优化」（`dc8c23a3`）把 `useUserStore` 移出 `@/store` barrel，
  `src/const/const.message.type.ts` 改为**按文件直接导入**（`@/store/useUserStore`，用于断循环依赖）。
  但测试的 `vi.mock('@/store', ...)` 打在 barrel 上 → mock **不生效** → `useUserStore()` 走真实实现 →
  报 `getActivePinia() was called but there was no active Pinia`。
- **修法**：mock 路径改为 `@/store/useUserStore`，与被测模块的实际导入路径对齐。
- **为什么是这个修法**：mock 必须打在**被测代码实际 import 的那个模块**上，
  barrel 只是转发路径。打错层级时 vitest 静默不拦截，报错点还离根因很远。

#### 2. store 分层重构后 API 迁至 composable，断言对象错位（12 项 · 2 个组件测试）

- **根因**：同一次重构把 `useSearchPanelStore` 的 API 调用迁到 `composables/useSearchActions.ts`（消除 store → apis 越层），
  `viewOptions`（纯派生：config → apis）随之离开 store。
  测试仍 `await import('@/store')` 取 store → `useSearchPanelStore is not a function`；
  改对路径后又报 `store.viewOptions` undefined。
- **修法**：
  - `circleQueryPanel.spec.ts` / `routePlanPanel.spec.ts`：`await import('@/store')` → `await import('@/store/useSearchPanelStore')`。
  - `viewOptions` 断言改为从 `useSearchActions()` composable 取（`viewOptions.value`），不再断言 store 上不存在的字段。
- **新增认知**：**store 重构后，测试的取数路径要跟着真实实现走，不能凭记忆写 barrel 路径**。

#### 3. 路线 Y 删文件导致套件整体加载失败（1 套件 0 用例 · tests/unit/dispatchMapMockVehicles.spec.ts）

- **根因**：该用例用「静态解析源码 → 提取函数体 → 沙箱执行」的手法测 `dispatchMap.vue` 内的车辆执行边界。
  路线 Y B-3c 把这段逻辑迁到 composable `useDispatchEntangled.ts` 并删除了 `dispatchMap.vue`
  → `readFileSync` 抛 ENOENT → **整个套件 0 用例、连带 1 个 Failed Suite**。
- **修法**（保持原测试手法与断言意图不变，只换提取目标）：
  - 解析目标改为 `src/baseComponent/OpenlayersMap/useDispatchEntangled.ts`（普通 TS，无需 `vue/compiler-sfc` 的 `parse`）。
  - 定位 `useDispatchEntangled` 箭头函数体，**只取函数体第一层**的 8 个目标声明
    （composable 内是局部闭包变量，不在模块顶层）。
  - `mock` port 改为从 `businessRuntime.attachMap(..., { mock: {...} })` 的调用实参里提取，搜 `activate` 内该调用。
  - 沙箱环境补齐新实现依赖的自由变量：`featureClickQuery` / `incidentVideoController` /
    `lastRoutePlanResults` / `routePreviewVisible` / `routePreviewLoading` / `regionCfg` / `fetchInputTips` / `mockDispatchPrimaryGate`。
- **前置校验**：迁移前先用 TS AST 对比新旧实现的 8 个目标函数，归一化空白后差异**只有缩进与注释**，
  逻辑等价 → 确认可机械迁移，不改断言。

### 验证
| 门禁 | 结果 |
|---|---|
| `pnpm test` | ✅ **55 文件 / 579 项全通过**（迁移前 4 失败 / 48 失败项） |
| `pnpm lint:baseline` | ✅ 0 项 / 0 项 |
| `pnpm harness:check` | ✅ 通过（herness 体量正常、css-vars 139/139、backdrop 26 处、El 组件 28 个） |
| `npx prettier --check`（4 个改动测试文件） | ✅ 通过 |
| `pnpm e2e` | ✅ **9/9 全绿**（55.3s） |

### 涉及文件（4，全部在 tests/）
| 文件 | 改动 |
|---|---|
| `tests/unit/messageNormalization.spec.ts` | mock 路径 `@/store` → `@/store/useUserStore` |
| `tests/components/circleQueryPanel.spec.ts` | store import 路径修正 + `viewOptions` 改从 composable 取 |
| `tests/components/routePlanPanel.spec.ts` | store import 路径修正 |
| `tests/unit/dispatchMapMockVehicles.spec.ts` | 提取目标迁到 `useDispatchEntangled.ts`，适配 composable 结构 |

### 踩坑
- **PowerShell 传中文给 `apply_patch` 报 UTF-8 错误** → 用 node 脚本读写文件。
- **临时探针文件要用完即删**：验证根因时写过 `tests/unit/__probe.spec.ts`，验证完立即删除，
  避免残留进提交。
- **`git worktree` 对照验证时** `node_modules` 要用 junction 软链到主仓，
  且用完必须先删 junction 再 `git worktree remove`，否则删不掉目录。
- **TS AST 定位 composable 内层声明**：`useDispatchEntangled` 是箭头函数，
  目标声明在**函数体第一层**（`fnBody.body.statements`），按全文件深度搜会漏掉或错配。

### 未做（需人工决定）
- **工作区仍有未提交的路线 Y 改动**（`src/**` 11 个文件 + `useDispatchEntangled.ts` 新增 + 2 个 e2e spec）。
  本次只修测试侧，未提交、未推送，等人工确认收口范围。
## P1+P2 地图 pointermove 监听统一（量测工具）

### 背景
用户质疑地图事件监听分散、成本过高。全量审计 75 处监听点后确认：pointermove 本身不贵（OL 集中式事件目标），真正问题是量测工具 9 个类的解绑风格不统一 + 2 个类兜底解绑被注释导致泄漏。

### 更正
前一轮扫描脚本 bug（搜大写 OL.Un 漏了小写 map.un），误报"6 处泄漏"。重核后实际仅 MeasureAngleTool/AzimuthTool 的 destroy() 兜底解绑被注释，7 个类本身对称。

### 改动
- BaseTool.ts：加 import unByKey + 字段 pointermoveKey + bindPointermove/unbindPointermove（幂等）+ destroy() 兜底 unbindPointermove()
- 9 个子类 pointermove 绑定/解绑统一换助手，删除冗余 pointerListener 字段/注释
- MeasureAreaTool 保留 unByKey/EventsKey（this.listener geometry change 仍用）；PopulationTool 删 unused unByKey/EventsKey import

### 验证
pnpm lint 0 报错；pnpm build 成功（16.29s，仅 pre-existing sRGBEncoding/lightningcss 告警）；verify 脚本确认子类无裸 pointermove on/un 残留、import 无未使用。

### 影响面
src/components/map/MapTools/drawMapTools/*.ts（10 文件），零行为变化（OL un 幂等），未提交。
