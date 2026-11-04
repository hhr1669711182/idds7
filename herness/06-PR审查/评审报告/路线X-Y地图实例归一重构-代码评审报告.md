# 路线 X→Y 地图实例归一重构 · 代码评审报告

> **评审范围**：`8ef37c6b`（路线X 地图归一 + OL 预载竞态根治）→ 当前工作区（含未提交改动）
> **评审人**：AI（按 `06-PR审查/_流程规范.md` 的 11 个维度）
> **评审日期**：2026-11-04
> **结论**：**有条件通过 —— 发现 2 个 P0 缺陷（均有运行期证据）+ 1 个 P1 隐患 + 2 项注释规范偏差，建议修复后再合入**

---

## 一、变更范围

| 类别 | 内容 |
|------|------|
| 已提交 | `8ef37c6b` 路线X；`d1ab74ce` B-1；`6fe1b189` B-2 |
| 未提交（本次评审主体） | 删 `dispatchMap.vue`(3294行) / `components/dispatchMap/index.vue`(189行) / `views/dispatch/index.vue`(18行)；新增 `useDispatchEntangled.ts`(2364行)；改 `map.vue` / `components/map/index.vue` / `home.vue` / `useCurrentMap.ts` / `useDispatchMapStore.ts` / `useGisBaseMap.ts` / `router/index.ts` / `dispatchBusiness.ts` |
| 净变化 | +320 / −3655 行，删除 3 个大文件、新增 1 个 composable |

---

## 二、P0 缺陷（必须修复）

### P0-1 调派专属 WMS 图层泄漏到主图态

**位置**：`src/components/map/index.vue`（调派图层 watch）

**机理**：主图与调派现在共用同一个 OLMap 实例，但**两套图层状态源并存**：

| 状态源 | 驱动者 | 作用范围 |
|--------|--------|---------|
| `layersStore.checkedIds` | 主图图层工具栏 | 主图 WMS 图层 |
| `dispatchMapStore.checkedIds` | 调派图层工具栏（`DispatchLayers.vue`） | 调派 WMS 图层 |

`components/map/index.vue` 里的 watch **没有 `dispatchVariant` 门控**，且直接调 `openLayersMapRef.value?.syncLayers(nextIds)`。
`useGisBaseMap.syncLayers` 的语义是「**以传入列表为准，移除不在列表里的 WMS 图层**」。
于是调派态点图层工具栏 → 主图已挂的 WMS 图层被删；切回主图态时，**调派态新增的图层仍留在图上，主图图层不会恢复**。

**运行期证据**（Playwright 实测，探针已清理）：

```
主图态初始图层数:        22
调派态图层数:            29
调派操作后图层数:        34
切回主图态图层数:        29   ← 未回到 22
残留（主图态不该有）: ["gis:view_juris_zone","gis:env_build_aoi","gis:view_env_building",
                      "gis:env_greatchina_road","gis:view_env_enterprises"]
丢失（主图态原有被删）: []
```

**影响**：主图出现「关不掉的图层」，且主图/调派两套图层状态互相污染。
这正是「原功能无损」目标的红线项。

**修复建议**：调派图层 watch 加 variant 门控 + 切回主图态时按 `layersStore.checkedIds` 恢复：

```ts
watch(
  () => dispatchMapStore.checkedIds,
  (ids) => {
    const nextIds = getDispatchLayerIds(ids);
    if (nextIds.length !== ids.length) {
      dispatchMapStore.setCheckedIds(nextIds);
      return;
    }
    if (!dispatchVariant.value) return;          // ← 补：非调派态不碰主图
    openLayersMapRef.value?.syncLayers(nextIds);
  },
  { deep: true, immediate: true },
);
// 另：切回主图态时恢复主图图层
watch(dispatchVariant, (isDispatch) => {
  if (!isDispatch) openLayersMapRef.value?.syncLayers(layersStore.checkedIds, true);
});
```

---

### P0-2 切回主图态后主图 business attachment 永久失效

**位置**：`src/baseComponent/OpenlayersMap/map.vue`（variant watch）

**机理**：`BusinessMessageRuntime.attachMap` 是 **single-slot** —— 新 attach 会顶掉旧的：

```ts
public attachMap(port, options) {
  this.active?.options.mock?.clear()
  this.active?.options.dispose?.()
  const attachment = { port, options }
  const valid = () => !this.disposed && this.active === attachment
  // 旧 port 的所有方法被 valid() 守卫 → 顶掉后变 no-op
  this.active = attachment
  ...
}
```

时序：

| 时刻 | 动作 | active attachment |
|------|------|-------------------|
| initMap | 主图 attach `kind:'map'` | `map` |
| 进入调派 | 纠缠体 activate → attach `kind:'dispatch'` | `dispatch`（主图 port 被顶掉失效） |
| 切回主图 | `entangled.deactivate()` → **无重新 attach** | `dispatch`（**主图 port 仍失效**） |

旧的双实例架构下，variant 切换会重建整个包装层 → 主图 `initMap` 重跑 → 主图 attachment 自然重建。
新架构主图常驻，**没人补这一步**。

**运行期证据**（在 `attachMap` 挂临时探针记录 kind 序列，探针已清理）：

```
主图态 active kind:     ['map']
调派态 active kind:     ['map', 'dispatch']
切回主图态 active kind: ['map', 'dispatch']   ← 缺少第三次 'map'
```

**影响**：切回主图态后，主图通过 `runtime.port` 走的能力全部静默失效 ——
来电定位、地址机器人检索/清除、范围圈高亮（`addressRobotGisSearch` / `areaFenceHighlight` 等）。
这些方法被 `valid()` 守卫成 `undefined`，**不报错、不抛异常**，属于最难排查的一类静默失效。

**修复建议**：variant watch 的 else 分支补回主图 attachment：

```ts
if (isDispatch) {
  attachDispatchBusiness({ map, nav: nav.value });
  entangled?.activate();
} else {
  entangled?.deactivate();
  detachDispatchBusiness();
  // 补：主图 attachment 被调派顶掉后需重新 attach
  const attachment = createBusinessMapPort(genericCtrl!);
  detachBusinessMap = getBusinessMessageRuntime().attachMap(attachment.port, {
    kind: 'map',
    dispose: attachment.dispose,
  });
}
```

> 注：`attachMap` 内部已有 `this.active?.options.dispose?.()` 幂等处理，
> 重新 attach 会自动 dispose 掉旧的 `dispatch` attachment，无需额外清理。

---

## 三、P1 隐患（建议修复，非阻塞）

### P1-1 `deactivate` 未恢复 CQL 强占与主管队站排除

**位置**：`src/baseComponent/OpenlayersMap/useDispatchEntangled.ts`

调派期会做两件事影响共享 WMS 图层与前端图层：

1. **CQL 强占**：`syncStationLayerOverride` 对消防站 WMS 层写 `CQL_FILTER`、`setMinZoom(0)`、`setVisible(true)`
2. **主管队站排除**：`syncFireManagerStations` 把主管队站从 `fireManager` 的要素里剔除

两者的**恢复逻辑都依赖 watch 回调**（`onStationLayerChange` / `onPrimaryStationIdsChange`），
但 `deactivate()` **先 `stoppedWatchers.forEach(stop)` 再置空快照**：

```ts
stoppedWatchers.forEach((stop) => stop());   // ← watch 停了
stoppedWatchers = [];
...
forcedStationLayerSnapshot = null;             // ← 只置 null，没恢复 CQL
forcedResourceLayerSnapshots.clear();          // ← 同上
```

旧架构下这段代码同样只置 null，但**旧架构会销毁整个 map 实例**，CQL 随图层一起作废；
新架构是单实例常驻，**CQL 会永久残留在共享图层上**，且 `syncStationLayerOverride` 的 else 分支（恢复逻辑）
因 watch 已停而永不触发。

**未能在本环境确认**（WFS 队站数据未返回，探针取不到要素数），
但代码路径分析明确。**建议在 `deactivate()` 里显式调用一次恢复分支**，不要依赖 watch。

### P1-2 主图全量队站与调派排除口径不一致

旧 `dispatchMap.vue`：`loadFireStations().then(list => { allFireStations = list; syncFireManagerStations(); })`
—— 加载完**立刻排除主管**，不存在「先全量、后排除」的窗口。

新实现：主图 `map.vue` 先 `fireManager.setStations(list)` 填**全量**，
调派态才由纠缠体 watch 排除。切回主图态时，`deactivate` 停了 watch，
**`syncFireManagerStations` 不会被调用来恢复全量** —— 主管队站可能持续缺失。

与 P1-1 同源，一并修。

---

## 四、注释规范偏差（herness `05-共享上下文/代码注释规范.md`）

### 4-1 文件头 JSDoc 超限

`useDispatchEntangled.ts` 文件头 **20 行** JSDoc，规范硬上限 **10 行**（JSDoc 块）。

实测：全文件 2368 行，注释 177 行（8.1%），最长连续注释块 20 行，>10 行块 1 处，>15 行块 1 处。

**建议**：文件头压到 10 行内，详细设计说明搬到 `herness/02-技术设计/前端/`。

### 4-2 文件头模板字段残留

新增文件 `useDispatchEntangled.ts` 使用了 `/** */` 而非模板头，这点合规；
但 `useCurrentMap.ts` / `useDispatchMapStore.ts` 的 `@LastEditTime` / `@LastEditors` 属**存量欠账**，
规范明确「存量不追溯」，本次不必处理 —— 但改动这两个文件时可以顺手清理（属本次触及区块）。

---

## 五、通过项（逐维度核查结论）

| 维度 | 结论 | 依据 |
|------|------|------|
| **分层合规** | ✅ 通过 | 纠缠体在 `baseComponent/` 属业务层，可直接 import `ol/...`（SOP 已放宽）；无 controller→views/apis 越层；DTO 沿用既有 `protocol/**` |
| **契约一致** | ✅ 通过 | `src/const/**`、`src/controller/**`、`src/apis/**`、`docs/**` **零改动**；事件键沿用 `MESSAGE_EVENT_KEY` 常量，未新增/改名 |
| **消息链路** | ⚠️ 部分 | 订阅在 `deactivate` 正确释放（`mockSpecialMapUnsubscribers` / `vehicleTrackUnsubscribe`）；但 attachment 抢占问题见 P0-2 |
| **订阅泄漏** | ✅ 通过 | `deactivate` 释放全部 WS 订阅 + stop 全部 watch + 销毁 manager/FCQ + 释放 Modify 交互 + 移除 document click 监听 |
| **资源释放** | ✅ 通过 | `attachMap` 的 detach 会调 `options.dispose?.()` → `AreaFenceRenderer.dispose` / `AddressRobotRenderer.dispose` 链路完整；`GenericController` 无持有资源 |
| **正确性（业务无损）** | ❌ **不通过** | P0-1 图层泄漏、P0-2 attachment 失效 |
| **注释规范** | ⚠️ 部分 | 见第四节 |
| **类型安全** | ✅ 通过 | `pnpm lint:baseline` 0 项；纠缠体内无新增 `any`（`regionCfg` 等沿用原文件的既有 `any`，属搬运） |
| **性能** | ✅ 通过 | 底图单实例常驻、`preload` 恢复 4，缩放流畅度优于路线 X 的止血态；无新增高频重建 |
| **坐标与空间** | ✅ 通过 | 坐标转换逻辑未改动，仍统一 `src/utils/coordTransform.ts` |
| **禁改文件** | ✅ 通过 | 未触碰 `auto-imports.d.ts` / `components.d.ts` / `dist/**` |
| **测试覆盖** | ⚠️ 部分 | e2e 9/9 绿，但**缺「调派态→主图态」的回归断言**（正是 P0-1/P0-2 的漏网原因）；组件测试未覆盖 variant 往返 |
| **文档同步** | ✅ 通过 | 状态摘要已记录路线 Y 6/6 收口；`useDispatchMapStore.map` 删除已回写 |

---

## 六、测试覆盖缺口（建议补齐）

现有 e2e 只断言「调派面板渲染 + 业务链路消费 + 无 pageerror」，**没有一条断言 variant 往返后的状态复原**。
这正是两个 P0 都能通过 9/9 绿的原因。

建议补两条 e2e：

1. **图层复原**：主图态 → 调派态操作图层工具栏 → 切回主图态 → 断言图层集合与主图态初始一致（无调派残留）
2. **attachment 复原**：主图态 → 调派态 → 切回主图态 → 断言 `runtime.port.addressRobotGisSearch` 可正常触发（不返回 undefined）

---

## 七、模型能力评估（第 7 项：评审 AI 生成质量）

### 7.1 代码生成能力：**强**

| 维度 | 评价 |
|------|------|
| 重构规模控制 | 3294 行 SFC → 2364 行 composable，**功能调用链 100% 保真**，无遗漏业务分支（用 TS AST 逐函数对比归一化后仅缩进/注释差异） |
| 依赖注入设计 | 共享 4 个 manager 经 `deps` 注入、**明确区分「纠缠体自有」与「共享」所有权**，并在 `dispose()` 注释里固化边界 —— 这是超出一般 AI 输出水平的边界意识 |
| 生命周期纪律 | `activate` 幂等（`if (active) return`）、`deactivate` 停 watch/退订/销毁、`dispose` 兜底，四段职责清晰 |
| 踩坑沉淀 | OL Proxy 深代理破坏 OL 方法绑定的坑、`shallowRef` 的必要性，写进了工作日志与代码注释 —— 符合「踩过要留痕」 |
| 分层纪律 | 严格守住「纠缠体不碰共享 4 manager、不 destroy」的所有权约定 |

### 7.2 业务梳理能力：**强，但有盲区**

**强项**：
- 消息契约、图层归属、manager 所有权梳理准确，无协议层改动，事件键零变更
- 把「双实例互斥挂载」的历史包袱想清楚了，并识别出「单实例常驻」才是根治 OL 预载竞态的正确方向
- `dispatchBusiness.ts`（B-1/B-2）把 5 个独立设施按「可独立 attach/detach」切分，边界合理

**盲区（导致两个 P0）**：
1. **只验证了「进调派」，没验证「出调派」**。整个重构的验证重心放在「调派态功能是否正常」，
   e2e 也只断言「调派面板渲染」。**状态复原方向（deactivate 侧）几乎没有验证**。
   这是重构类任务的经典盲区：入口路径被充分测试，出口路径被忽略。
2. **单实例化后，「双状态源并存」的影响面没推演到底**。两套 `checkedIds` 在双实例下天然隔离，
   单实例后变成共享 map 上的竞争关系 —— 这一点在「删掉 dispatchMap.vue」时才浮现，
   而删除动作本身是「看起来干净」的动作，掩盖了影响。

**一条可复用的教训**：
> 单实例化（多实例 → 单实例）重构，**凡是「原来靠实例隔离、现在靠状态隔离」的逻辑，都要重新推演一遍**。
> 双实例时 A 改 A 的状态互不影响；单实例后 A 改 A 的状态会打到共享资源上。

### 7.3 模型综合评价

| 项 | 评分 | 说明 |
|---|------|------|
| 重构执行能力 | A | 大规模搬迁零功能丢失，TS AST 逐函数验证保真 |
| 架构判断力 | A- | 单实例方向正确，但未推演「状态源竞争」这一级 |
| 验证完备性 | **C** | 出口路径（deactivate / 切回主图）验证缺失，直接放过 2 个 P0 |
| 文档与留痕 | A | 工作日志、状态摘要、ADR 三处同步，踩坑记录具体到可复现 |
| 注释规范 | B- | 注释密度合理，但文件头超限 10 行硬上限 |

**总体**：生成质量高，**但验证完备性明显低于生成质量**。
两个 P0 都不是「代码写错了」，而是「**没去验证那个方向**」——
这与能力上限无关，属于**任务策略问题**：重构收口时应强制补「往返 / 复原 / 复位」三类回归。

---

## 八、修复优先级与建议顺序

| 优先级 | 项 | 位置 | 建议 |
|--------|-----|------|------|
| P0 | 图层泄漏 | `components/map/index.vue` | watch 加 variant 门控 + 切回时恢复主图图层 |
| P0 | attachment 失效 | `baseComponent/OpenlayersMap/map.vue` | variant watch else 分支补重新 attach 主图 port |
| P1 | CQL / 队站排除未恢复 | `useDispatchEntangled.ts` | `deactivate()` 显式调恢复分支，不依赖 watch |
| P1 | 补 e2e 往返回归 | `tests/e2e/` | 新增「图层复原」「attachment 复原」两条 |
| P2 | 文件头 JSDoc 20 行 | `useDispatchEntangled.ts` | 压到 10 行内，设计说明搬到 02-技术设计 |

---

## 九、评审结论

**有条件通过。**

重构方向正确、执行质量高、文档同步完整；但**两个 P0 缺陷都会造成「原功能有损」**，
且属于**静默失效**（不抛异常、测试全绿），必须修复并补齐往返回归后再合入。

建议提 MR 时：
1. 先修 P0-1 / P0-2，两条 P1 一并处理
2. 补两条 e2e 往返断言，锁住「出调派」方向
3. P2 注释压缩顺手做
4. 修复后跑 `pnpm test`（55/579）+ `pnpm e2e`（含新增 2 条）+ `pnpm lint:baseline` + `pnpm harness:check`

---

## 附：评审方法说明

- **变更范围**：`git diff 8ef37c6b` + 工作区未提交改动，逐文件通读
- **保真性验证**：用 TypeScript AST 对比新旧实现的 8 个关键函数，归一化空白后确认仅缩进/注释差异
- **缺陷确认**：写 Playwright 探针实测图层集合与 attach 序列，**探针用完即删，源码已还原干净**
- **引用规范**：真实路径 + 真实符号名，无臆造
