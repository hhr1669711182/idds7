# Element Plus 夜间科技主题 · 技术方案

> 状态：**已落地**（2026-10-20）
> 事实来源：`pnpm build:prod` 实测产物 + `pnpm e2e` 契约用例
> 事实与代码冲突时以代码为准，并回写本文。

---

## 一、背景与目标

### 1.1 三个实测缺陷

| 缺陷 | 实测证据 | 影响 |
|------|----------|------|
| **首屏缺 Element Plus 根变量** | `--el-color-primary` 等 118 个根变量只存在于异步 chunk `base-cyJZB4WD.css`，首屏 `index-*.css` 里没有 | 首屏渲染时 El 组件拿不到 `--el-*`，主题不生效 |
| **样式引入靠人工** | `ElementPlusResolver` 只在模板出现 El 组件时注入；函数式 API（`ElMessage`/`ElMessageBox`）不经模板解析，样式要手工 import | 新增组件容易漏样式 |
| **主题色三套并存** | 全局 `--accent-cyan: #5a7898`（暗蓝）／ 组件内硬编码 `rgba(39,210,255,.55)`（亮蓝）／ Element Plus 默认 `#409eff` | 视觉不统一，改一处不生效 |

### 1.2 目标

1. 样式引入全自动：用到的 El 组件样式自动进产物，函数式 API 不漏；
2. Element Plus 有一套与项目一致的**夜间科技主题色**，由项目设计变量派生；
3. 后续新增公共组件**零成本**接入主题。

---

## 二、方案选型：为什么用 `:root[data-theme='NIGHT']` 而非官方 dark

### 2.1 官方 dark 主题的实测局限

Element Plus 2.13.6 自带 `theme-chalk/dark/css-vars.css`（81 个变量）。但：

| 局限 | 实测 |
|------|------|
| 选择器不匹配 | 官方是 `html.dark{...}`，项目是 `data-theme="NIGHT"`（`index.html` + `useCommonStore.setThemeColor`） |
| 覆盖不全 | 官方 dark 只给 81 个根变量，浅色版有 552 个；`--el-input-*`、`--el-table-*` 等组件级变量仍是浅色值 |
| 配色不符 | 官方是通用暗色（`#141414` 纯灰），非项目科技青蓝 |
| 双状态源 | 需同时维护 `html.dark` 与 `data-theme`，库模式下宿主页面未必带 `html.dark`，易失步 |

### 2.2 采用方案

**单层真源**：`:root[data-theme='NIGHT']` 下直接定义全部 `--el-*` 变量，取值**派生自项目设计变量**。

```
项目设计层                       Element Plus 适配层
--accent-cyan: #22d3ee     ──→   --el-color-primary: var(--accent-cyan)
--text-primary: #e6e8eb   ──→   --el-text-color-primary: var(--text-primary)
--panel-border: #364050   ──→   --el-border-color: var(--panel-border)
--accent-gold: #fbbf24    ──→   --el-color-warning: var(--accent-gold)
```

**依据**：实测 Element Plus 官方组件 CSS 只消费 `--el-*` 变量——
`el-tabs` 用 `var(--el-color-primary)`、`var(--el-text-color-primary)`、`var(--el-bg-color)`；
`el-message` 用 `var(--el-bg-color-overlay)`、`var(--el-color-primary-light-8/9)`。
因此只要变量在 `:root[data-theme='NIGHT']` 下被覆盖，**所有**组件（含挂 body 的浮层）自动生效。

**官方 dark 主题不引入**，避免多一层间接与双状态源。

---

## 三、落地实现

### 3.1 文件清单

| 文件 | 动作 | 说明 |
|------|------|------|
| `src/styles/element-theme.less` | 新增 | Element Plus 夜间科技主题：82 个 `--el-*` 变量 + 组件级补充（button/card/empty） |
| `src/styles/themed-panel.less` | 重写 | 改为「局部强化层」：只补变量无法表达的细节（透明底、激活态、滑块轨道），**删除浮层逃逸写法** |
| `src/styles/night.less` | 修改 | `--accent-cyan` 由 `#5a7898` 提为 `#22d3ee`；新增 `--accent-cyan-strong`；`--accent-gold` 由同色改为 `#fbbf24` |
| `src/styles/index.less` | 修改 | 引入 `element-theme.less` |
| `src/utils/elementStyleRegistry.ts` | 新增 | 样式清单唯一真源：81 个组件 → 官方 css 映射 + `ELEMENT_STYLE_BUNDLES` |
| `scripts/vite-plugin-element-styles.mjs` | 新增 | 扫描源码 → 注入 `virtual:element-styles` 虚拟模块 |
| `scripts/sync-element-style-registry.mjs` | 新增 | 把 TS 清单同步进 .mjs 插件（.mjs 无法 import .ts） |
| `scripts/verify-element-styles.mjs` | 新增 | 门禁校验：清单覆盖 / 文件存在性 / 产物含根变量 |
| `src/lib/index.ts` | 修改 | 入口引 `virtual:element-styles`，移除手写的 `el-message.css`/`el-message-box.css` |
| `src/vite-env.d.ts` | 修改 | 补 `virtual:element-styles` 类型声明 |
| `src/components/map/config.vue` | 修改 | 12 处硬编码色 → 全局 CSS 变量 |
| `nginx.conf` | 修改 | gzip + 静态资源缓存 + 缓存策略 |
| `package.json` | 修改 | 新增 `verify:styles` / `sync:element-styles`；`harness:check` 串入 `verify-element-styles.mjs` |
| `tests/e2e/theme.spec.ts` | 新增 | 主题契约 E2E（2 项） |

### 3.2 样式自动注册机制

```
源码扫描（.vue/.ts/.tsx/.js）
   ↓ 收集 El* 组件名（模板标签 + 代码引用）
ELEMENT_STYLE_REGISTRY 查表
   ↓ 未登记 → verify 脚本报错并给出建议登记项
virtual:element-styles 虚拟模块
   ↓ 注入对应 element-plus/theme-chalk/*.css
产物
```

**双重保障**：
- **自动**：用了就有样式，扫描源码自动注入，无需手工 import；
- **兜底**：清单未登记 → `pnpm verify:styles` 精确报出「组件名 + 应补的样式文件」，已接入 `harness:check` 门禁。

**实现注意**：
- 扫描时**必须排除 `elementStyleRegistry.ts` 自身**，否则清单里全部 80 个名字会自我放大，把没用到的组件样式也打进产物（实测踩过：首屏 CSS 一度从 144KB 涨到 282KB）。
- 登记的样式文件必须**真实存在**：Element Plus 2.13 移除了 `el-watermark.css`，已从清单删除并加文件存在性校验。

### 3.3 主题色值

| Element Plus 变量 | 日间 | 夜间（科技主题） | 派生自 |
|---|---|---|---|
| `--el-color-primary` | `#409eff`（默认） | `#22d3ee` | `--accent-cyan` |
| `--el-color-primary-dark-2` | `#66b1ff` | `#67e8f9` | `--accent-cyan-strong` |
| `--el-color-primary-light-3/5/7/8/9` | 蓝系 | 青系梯度 | 手工阶梯 |
| `--el-color-success` | `#67c23a` | `#4ade80` | — |
| `--el-color-warning` | `#e6a23c` | `#fbbf24` | `--accent-gold` |
| `--el-color-danger` | `#f56c6c` | `#f87171` | — |
| `--el-color-info` | `#909399` | `#94a3b8` | — |
| `--el-bg-color` | `#fff` | `#1a1f2e` | 对齐 `--panel-bg` |
| `--el-bg-color-overlay` | `#fff` | `#1e2432` | 浮层底 |
| `--el-text-color-primary` | `#303133` | `#e6e8eb` | `--text-primary` |
| `--el-text-color-regular` | `#606266` | `#c9cdd4` | `--text-secondary` |
| `--el-text-color-secondary` | `#909399` | `#6b7280` | `--text-muted` |
| `--el-border-color` | `#dcdfe6` | `#364050` | `--panel-border` |
| `--el-fill-color-blank` | `#fff` | `#1a1f2e` | — |
| `--el-mask-color` | `rgba(255,255,255,.9)` | `rgba(10,14,22,.8)` | — |
| `--el-box-shadow-light` | — | `0 0 12px rgba(0,0,0,.24)` | 对齐 `--panel-shadow` |

### 3.4 `config.vue` 统一

12 处硬编码改为变量：

```less
// 改前
@cyan: rgba(39, 210, 255, 0.55);
@gold: rgba(255, 155, 0, 0.9);
:deep(.el-button--primary) { --el-button-bg-color: rgba(39, 210, 255, 0.75); }

// 改后
@cyan: var(--accent-cyan);
@gold: var(--accent-gold);
:deep(.el-button--primary) { --el-button-bg-color: var(--accent-cyan); }
```

改后该文件硬编码色 **0 处**。

### 3.5 nginx 配置

生产用 nginx（`Dockerfile` → `nginx:alpine` → `nginx.conf`），**不是 IIS**。
原 `nginx.conf` 无任何压缩配置，产物也无预压缩文件。

新增：
- `gzip on` + `gzip_types` 显式含 `application/json`、`application/geo+json`、`application/wasm`、`image/svg+xml`；
- `/assets/` 长缓存 `1y immutable`（文件名带内容哈希）；
- `/index.html` `no-cache`（发版后能拿到新资源引用）；
- `/cesium/` 缓存 7 天（版本随发布变动）。

> 注：`public/web.config` 的 IIS 压缩配置**保留**（按人工确认），但生产走 nginx 时不生效。

> ⚠️ **重要事实**：`nginx.conf` 与 `Dockerfile` 均在 `.gitignore` 第 48 行（jenkins 段）被忽略，**不在版本控制内**。
> 本次改的是工作区副本，**不会随提交进入仓库**，需人工同步到部署侧的 nginx 配置（或从 `.gitignore` 移出后入库）。
> `Dockerfile` 第 25 行 `COPY nginx.conf /etc/nginx/conf.d/default.conf` 依赖该文件存在。

---

## 四、实测效果

| 指标 | 改动前 | 改动后 |
|------|--------|--------|
| 首屏 `--el-*` 根变量 | ❌ 不在首屏（拆到异步 chunk） | ✅ 全部在首屏 `base-*.css` |
| 首屏 CSS raw | 141.8 KB | 144.7 KB（+2.9KB，仅主题层与 base） |
| 首屏 CSS gzip | 25.5 KB | 26.3 KB |
| 实际注入的 El 组件样式 | 手工维护 2 个 | 自动 24 个（含函数式 API） |
| `config.vue` 硬编码色 | 12 处 | **0 处** |
| `--accent-cyan` | `#5a7898`（暗蓝） | `#22d3ee`（科技青蓝） |
| nginx 压缩 | 无 | gzip + 长缓存 |

---

## 五、验证

| 门禁 | 结果 |
|------|------|
| `pnpm build:prod` | ✅ 9.13s |
| `pnpm build:lib` | ✅ 6.60s |
| `pnpm test` | ✅ 53 文件 / 567 用例 |
| `pnpm test:coverage` | ✅ 77.6% / 80.69% / 72.82% / 77.09% |
| `pnpm e2e` | ✅ **7/7**（含新增 2 项主题契约） |
| `pnpm lint:baseline` | ✅ 155 / 155，无新增 |
| `pnpm harness:check` | ✅ 含 `verify-element-styles` |
| `pnpm format:check` | ✅ 本次新增/修改文件全部符合 prettier |

### 新增 E2E 契约（`tests/e2e/theme.spec.ts`）

1. 夜间 `--accent-cyan` = `#22d3ee`，`--el-color-primary` 计算值一致，根变量非空；
2. 切 DAY 后 `--accent-cyan` = `#3385ff`，`--el-bg-color` 恢复 `#fff`。

---

## 六、后续新增公共组件的流程

1. 直接在模板里用 `<el-xxx>` → **无需任何操作**，样式自动进产物；
2. 用函数式 API（如 `ElNotification`）→ 同上，代码里出现名字即被扫描到；
3. 若 `pnpm verify:styles` 报「未登记」→ 在 `src/utils/elementStyleRegistry.ts` 补一行，执行 `pnpm sync:element-styles`；
4. 主题色**不需要**额外处理——已由 `:root[data-theme='NIGHT']` 的 `--el-*` 变量层统一接管。

---

## 七、遗留

- `src/styles/element.less` 是空文件（历史占位），本次未动。
- `--accent-cyan` 改为 `#22d3ee` 后，地图侧高亮色（`themeAccent()` 读同一变量）同步变亮，需人工视觉确认地图要素观感。
- 官方 dark 主题未引入，Element Plus 组件级变量（如 `--el-input-*`）仍有浅色默认值，已在 `element-theme.less` 覆盖常用项，后续按需补充。
