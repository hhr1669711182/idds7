# 工作日志 2026-11-05（agent-huanghuanrong）

## B2：删除 src/Control 主干 + 916 死链，归一基准下沉测试 fixture

### 背景
- 用户指令："可以把Control干掉了" → 评估后选 B2 方案（整删 Control，5 个基准模块下沉 fixture，parity 测试改挂 fixture 路径）。
- 团队迁移文档（Control走线迁移方案核验报告 §12.6）原定 Control 清理为 P3，须 36 项人工验收全过后单独确认；本次用户明确授权**提前解锁 P3 门禁**，36 项台账已导出为桌面文档《Control迁移人工验收清单36项.md》留档，后续补齐验收记录时直接对照。

### 删除前调查结论（只读）
- `src/Control`（17 文件）在 src/ 内**零活引用**：新链已迁到 `src/register`、`src/composables`、`src/interceptor/transforms`、`src/controller`；同名模块（seatSharedState/pageCondition/dispatchVehicleAdapter）均存留于新位置，旧 Control 版本无引用。
- 唯一活引用是 916 死对：`src/store/useMessageStore916.ts` ← `src/Control/initMessage916.ts`，后者全仓无引用，store barrel 也不导出 916。
- `Control/Swiper.ts`/`Swiper.css` 无路径引用（活动卷帘为 `components/Swiper/Swiper.ts`）。
- **新增发现**：`tests/unit/messageNormalization916Replay.spec.ts`（628 行）动态 import `@/store/useMessageStore916` 做 916/新链 A/B 回放——前两轮只扫静态 import 未抓到，靠 `Failed to resolve import` 才暴露。

### 变更清单
| 对象 | 动作 |
|---|---|
| `src/Control/**`（17 文件） | 整目录删除 |
| `src/store/useMessageStore916.ts` | 删除（916 死对，快照保留） |
| `tests/fixtures/control-baseline/` | 新建：alarmMessage / alarmCallMessage / carLocationMessage / positionMessage / incidentLocationMessage / seatSharedState / useMessageStore916（git show @6fe1b18）+ README（快照口径说明） |
| `tests/fixtures/control-baseline/incidentLocationMessage.ts` | `@/Control/seatSharedState` → `./seatSharedState` |
| `tests/fixtures/control-baseline/useMessageStore916.ts` | 5 处 `@/Control/*` → 同目录相对导入 |
| `tests/unit/messageNormalizationParity.spec.ts` | 5 处 `@/Control/*` → `../fixtures/control-baseline/*` |
| `tests/unit/alarmProfileMigration.spec.ts` | 1 处 → fixture |
| `tests/unit/messageNormalization916Replay.spec.ts` | 动态 import 916 store → fixture |
| `src/interceptor/README.md` §7 | "保留对照/不授权删除" → 删除记录 + fixture 快照口径 |
| `herness/05-共享上下文/当前状态摘要.md` | L54/L72/L76/S7 行 4 处过期 Control/916 表述同步 |
| 桌面《Control迁移人工验收清单36项.md》 | 新建：36 项验收台账 + 门禁结论（含 P3 提前解锁记录） |

### 验证
- `pnpm lint`：0 报错
- `pnpm build`：成功（22.32s，仅 pre-existing 告警）
- `pnpm build:lib`：成功（10.34s）
- `pnpm vitest run` 全量：55 文件 / **579 tests 全部通过**（含改挂 fixture 的 3 个回归测试：parity 13 + migration 4 + 916Replay 111）
- 复扫：src/** 与 tests/** 无 `@/Control` / `useMessageStore916` 残留（fixture README 与 interceptor README 的文档性提及除外）

### 遗留 / 注意
- 36 项人工验收**未跑**（0/36），当前结论仅限"迁移走线自动化回归通过 + 删除无编译/测试破坏"，不代表全场景无副作用；桌面台账需人工联调后逐项勾选。
- `tests/fixtures/control-baseline/` 是快照基准（@6fe1b18），36 项全过后评估把 parity 测试改成固定期望值并删除该目录（README 已写明）。
- `useMessageStore916` 的 `defineStore('messageStore')` 与现链同 id —— 该 store 已不在任何运行时链上，仅测试内隔离 Pinia 实例中使用，无生产影响。

---

## S：地址机器人-GIS 合并 · Sprint 三层计划（规划文档，非代码）

### 背景
- 用户指令：把《地址机器人-GIS合并工作计划》「按领域拆分 sprint 及 task」，多轮迭代到「领域→Sprint→Task 三层 + 特性描述 + P0>P1>P2 优先级排期 + 一周内全量闭环（工时 4h→2h）」。
- 全程**只读 + 写仓库外文档**：本会话**未改任何 `src/**`**，`git status` 干净、HEAD 未变。

### 变更清单
| 对象 | 动作 |
|---|---|
| `C:\Users\16697\Downloads\地址机器人-GIS-合并Sprint计划.md` | 新建/多轮覆写，定稿 108 行：三层（4 业务域 + 搁置 W 域）下挂 G/P/Q/R/T 五 Sprint；4 项新需求并入（Q01 亿源天气搬迁对齐 / Q02 队站辖区分类检索 / Q03 天气回退顶点 / P06 路段衔接点 Web Worker）；优先级 P0(服务底座 G+P) > P1(数据链路 R) > P2(区划天气 Q 收尾) |
| `herness/08-会话交接/records/2026-11/address-robot-sprint-plan/20261105-172900-huanghuanrong-kq7f2.md` | 新建 handoff V1 记忆快照（任务阶段=待方案确认），供其他模型 `/handoff resume` 查询 |
| 本日志 | 追加 S 条目 |

### 关键代码核验（只读，支撑 Q/P 落点）
- `src/controller/core/business/AreaWeatherController.ts`：`resolveWeather`/`loadWeather` 现调高德 `weatherApi`；`buildAncestorChain` 回退链 `guard < AREA_LEVEL.STREET`（根哨兵 `{'0','1'}`）；`fetchJurisdictionStations/Zones` + `selectStation` 为队站辖区数据源。
- `src/apis/amap.ts` L146 `AmapWeatherLive` / L158 `AmapWeatherData` / L284 `weather(params:{city})` → `/api/amap/weather`。
- **未核验**：`routeBase` / `createRouteTmcFeatures` / `useGisBaseMap`（P 域前置），实现 P 前需补读。

### 验证
- `git status --short` 空、`git rev-parse HEAD`=ab9a798（本会话零仓库改动）。
- 未跑 lint/test（无代码改动，不适用）。

### 遗留 / 待确认
- Sprint 计划**尚未落** `herness/04-迭代管理/2026-W46/产物计划.md`，亦未同步 `_index.md` 迭代总览与 `05-共享上下文/当前状态摘要.md`「当前迭代」区——**需用户确认后**再写入（设计先行门禁）。
- W（机器人契约域）搁置 → R/T 全部依赖 W02/W03/W05，解冻前不启动；G01/G05/Q 部分需运维提供 GeoServer 图层清单。

## V8：dispatchMap 图层体系归并进 useLayersStore + 展示模式状态

### 目标
- 消除 dispatchMap 双图层体系重复：`useDispatchMapStore` / `DispatchLayers.vue` 合并入 `useLayersStore` / `layers.vue`；
- 车辆 GPS 按钮并入 `layers.vue` 集中管理（`useVehicleTrackStore` 驱动，显隐/面板逻辑不变）；
- 图层展示模式以 `useUserStore` 的 MapPhase 六阶段 + flood 特灾轴为粒度（`GisMapVariant` 仅是聚合判断，不承载图层粒度），配置预留按模式的默认集/隐藏集。

### 变更（改 7 + 删 2）
1. **src/config/layers.ts**：`LayerViewMode = MapPhase | 'flood'`；`LayerConfig.locked?`（`gis:view_res_org_dept` 置 true）；`LAYER_MODE_DEFAULT_CHECKED_IDS` + `LAYER_MODE_HIDDEN_LAYER_IDS` 两张全键 `Record<LayerViewMode,…>` 表（7 键，dispatch/dispatchTrack/flood 隐藏 TODAY_DISASTER）。
2. **src/config/mapConfig.ts**：`createResource` 对 locked 图层强制 `enabled=true`（防持久化数据绕过）。
3. **src/components/map/config.vue**：资源 enabled 勾选框 `:disabled="!!resource.locked"`；`setResourceEnabled` 对 locked 直接 return。
4. **src/store/useLayersStore.ts**：`activeMode` + `setMode`（切模式按隐藏表过滤 checkedIds，全不匹配落该模式默认集）；persist pick 不含 activeMode。
5. **src/components/map/index.vue**：删 `useDispatchMapStore`/`DispatchLayers`；`layerMode = computed(resolveLayerViewMode)` + watch immediate 驱动 `setMode`；dispatch watch 源切到 `layersStore.checkedIds`。
6. **src/components/map/layers.vue**：工具栏加车辆 GPS 磁贴；按 `activeMode` 隐藏表过滤；locked 图层 toggle 跳过。
7. **src/baseComponent/OpenlayersMap/gisMapConfig.ts**：`resolveLayerViewMode()`（flood 轴优先 → 阶段轴回落，纯函数）；`isDispatchVariant` 原样不动。
8. **删除**：`src/store/useDispatchMapStore.ts`、`src/components/dispatchMap/DispatchLayers.vue`。

### 验证
- `pnpm lint` 0 报错；`pnpm build` 14.53s / `pnpm build:lib` 13.01s 通过（仅 pre-existing sRGBEncoding / lightningcss warning）。
- `pnpm vitest run`：55 文件 579 tests 全通过（含 messageNormalization916Replay 111 项回归）。

### 决策记录
- 展示模式粒度 = MapPhase(6) + flood，而非 GisMapVariant(2)：后者是 `stage∈{dispatch,dispatchTrack}||flood` 的聚合布尔，粒度太粗，无法表达"不同模式默认 checkedIds 不同"（inquiry 未来要独立默认集时无落点）。
- 默认集按模式独立配置：`LAYER_MODE_DEFAULT_CHECKED_IDS[mode]`，切模式保留「当前勾选 ∩ 该模式白名单」，全不匹配才落默认集（避免误清用户选择）。
- flood 特灾轴独立不并入 dispatch 枚举（有自身业务语义），`resolveLayerViewMode` 返回 'flood' 走专属默认/隐藏

## 拉取远端 dev-reset 合并（多车轨迹冲突移植）

- 远端 `f27fb2e9..51c3f1c3` 新增 1 提交「修复警情阶段切换误清定位数据」：把车辆轨迹从单车旧模式升级为多车多路线（`loadVehicleTrack` 重写 / `syncVehicleTrackLayer` 双轨 / `loadVehicleTrackFallbackSingle` 降级兜底），并自动合入 9 个依赖文件（carTrack / VehicleTrackRenderer / useVehicleTrackStore / VehicleTrackPanel / useIncidentLocationStore / themeColor 等）。
- 唯一冲突 = 删除/修改：本地路线 Y 已删 `dispatchMap.vue`，远端改了它 210 行。
- 解决：保持删除 `dispatchMap.vue`（`git rm`），把多车轨迹逻辑移植到路线 Y 落点 `useDispatchEntangled.ts`（import 扩展 + nextTick、`syncVehicleTrackLayer` 双轨、`loadVehicleTrack` 多车重写 + 追加降级函数）。
- 先提交 V8（`9ce236bc`），再 `git merge origin/dev-reset`（`56730119`）。
- 验证：`pnpm lint` 0 / `pnpm build` 成功 / `pnpm vitest run` 55 文件 579 tests 全通过。
- 备注：本环境 `npx --no commitlint`（commit-msg hook）在 hermit PATH 下不稳定，提交用 `--no-verify`；提交信息已先经 commitlint CLI 直接校验通过（RC=0）。
- 本地领先 origin/dev-reset 6 提交，未推送。表，既有 flood 业务面（isDispatchVariant / pageCondition / useMockCallLocationBridge）零改动。
