# 2026-11-12 agent-huanghuanrong

## 地址机器人要素字典接口化适配

### 背景
抽屉组件 `AddressRobotDrawer/types.ts` 内 `displayLabels` 为静态硬编码字典，后续增项需改前端。目标是「默认本地兜底 + 可切换动态数据源」，增项只改后端字典即可。

### 改动
1. `src/components/AddressRobotDrawer/types.ts` — 新增 `AddressDict` / `AddressDictSource` / `AddressDictGroup` 契约；`displayLabels` 保留为本地基线；移除 `label()`（迁至 dictSource）。
2. `src/components/AddressRobotDrawer/dictSource.ts`（新增）— 字典数据源抽象：`localAddressDictSource`（默认，返回基线）+ 预留 `httpAddressDictSource`（注释态，复用 `src/apis/common.ts` 的 `getDictMethod`）+ `activeAddressDictSource` 切换点 + 响应式 `useAddressDict()` / `hydrateAddressDict()`。远端失败/空自动回落本地，绝不白屏。
3. `src/components/AddressRobotDrawer/index.vue` — `label` 改为 `resolve`（来自 dictSource），`onMounted` 调 `hydrateAddressDict()`；模板/computed 签名不变。
4. `tests/unit/addressRobotDictSource.spec.ts`（新增）— 守「命中/未命中回落/本地源兜底」契约，3 用例全绿。

### 影响与验证
- 纯组件/视图层，**不涉及消息协议/控制器/store**，无 `docs/source` 契约变更。
- `pnpm lint`（vue-tsc）0 报错；新增用例 3/3 通过。全量 `pnpm test` 中 14 项失败经 stash 复跑证实为既有 BC/relay/F11/F12/areaWeather 区域问题，与本次改动无关。
- 待办：后端 `/common/dict/{type}` 字典 type 命名规范确认后，取消 `httpAddressDictSource` 注释并把 `activeAddressDictSource` 指向它即可。

## 路径规划路段衔接 Worker 门控

### 背景
后端路径规划接口已做兜底返回，前端 Worker 补点计算仅作额外优化。默认应关闭，避免不必要的 Worker 开销。

### 改动
1. **`.env.development` / `.env.test` / `.env.production`** — 新增 `VITE_ROUTE_CONTINUITY_ENABLED=false`
2. **`.env.local.example`** — 新增注释说明字段用途
3. **`src/config/env.ts`** — 新增 `routeContinuityEnabled: boolean` 字段读取 env
4. **`src/hooks/useRouteContinuityWorker.ts`** — 入口加门控：flag 为 false 时直接走主线程同步兜底（不创建 Worker）

### 影响
- **零业务改动**：`routePlanPanel.vue` 调用方无需修改
- **零契约变更**：`ensureContinuity` / `destroy` 接口不变
- **回退兼容**：旧版无 env 变量时默认 false，行为与本次一致

### 门禁
- `pnpm lint` — 0 报错
- `pnpm lint:baseline` — 0 项新增

### 未来如需开启
在 `.env.*` 中设置 `VITE_ROUTE_CONTINUITY_ENABLED=true`，重启 dev server 即可。

---

## 门控关闭行为调整：透传替代主线程兜底

### 背景
用户反馈：`ensureSegmentContinuity` 是后端已实现的计算逻辑，前端无需再做主线程兜底。门控关闭时应直接透传原始数据，不做任何补点计算。

### 改动
- `src/hooks/useRouteContinuityWorker.ts` — 门控关闭分支从 `Promise.resolve(ensureSegmentContinuity(segments))` 改为 `Promise.resolve(segments)`，直接透传原始输入
- 注释同步更新，说明「不做补充计算，由后端兜底」

### 影响
- 零业务层改动：`routePlanPanel.vue` 调用方无需修改
- `ensureSegmentContinuity` 仅在 Worker 路径下执行（不再被直接调用）
- 性能收益：避免了关闭门控时仍执行一次性补点计算

---

## VITE_AMAP_* → VITE_MAP_* 重命名 + env 同步机制

### 背景
原前缀 `VITE_AMAP_*` 绑定高德平台，项目已兼容多地图平台，需去掉高德专属标识。同时 herness 缺少 env 文件同步约束，每次新增变量容易遗漏。

### 改动
1. **`src/config/env.ts`** — `amapApiBaseUrl`/`amapCity`/`amapAdcode`/`amapKeywords` → `mapApiBaseUrl`/`mapCity`/`mapAdcode`/`mapKeywords`；对应 env 键名同步改为 `VITE_MAP_*`
2. **`vite.config.ts`** — `/a` 代理 target 从 `env.VITE_AMAP_PROXY_API` → `env.VITE_MAP_PROXY_API`
3. **`.env.development` / `.env.test` / `.env.production`** — `VITE_AMAP_*` → `VITE_MAP_*`
4. **`.env.local.example`** — 重命名 + 补充缺失项（`VITE_MAP_ADMCODE`/`VITE_MAP_CITY`）+ 标注模板独有变量
5. **`herness/05-共享上下文/env变量清单.md`** — 新建，维护 VITE_* × 四文件对照矩阵
6. **`herness/05-共享上下文/设计规范速查.md`** — §四追加「环境变量同步铁律」E1-E4 四条规则
7. **`herness/05-共享上下文/_index.md`** — 新增 env变量清单.md 索引条目

### 影响
- 零业务代码引用：`appEnv.map*` 字段在 src/ 下无外部引用，改名安全
- 构建层 vite.config.ts 同步更新
- 存量注释变量（如被注释的 `VITE_AMAP_KEYWORDS`）一并重命名

### 门禁
- 待验证：`pnpm lint` 0 报错

---
**关联文档**：无（现有 GIS-W46 方案 §5.4 P06 已覆盖该功能设计）
