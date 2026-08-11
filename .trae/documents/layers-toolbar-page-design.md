# layers.vue 图层工具条（组件）页面/组件设计说明

## 1) Layout
- 主布局：横向 Flexbox（`display:flex`），左到右排列。
- 间距：按钮之间使用统一 `gap`；组件外层提供可配置 padding（或由容器控制）。
- 对齐：垂直居中对齐；全选控件与 8 个图层按钮同一行。
- 响应式（桌面优先）：
  - ≥ 1024px：显示图标 + 文案（或仅图标，按现状实现）。
  - 768–1023px：可缩短文案/tooltip。
  - < 768px：优先保留图标与状态（激活/勾选），文案隐藏，tooltip 显示名称。

## 2) Meta Information
- Title：图层工具条
- Description：提供 8 个图层的激活与勾选控制，并支持全选。
- Open Graph：若组件不单独成页，可由宿主页面统一配置；组件仅需保证可访问性标签（aria-label）。

## 3) Global Styles（组件内设计令牌建议）
- 背景：透明或与地图叠加的半透明底（由业务统一）。
- 字体：继承全局。
- 强调色（Active）：使用主题主色描边/底色（例如 `--primary`）。
- 勾选徽标（Checked）：右上角小圆点/角标，显示 ✓ 或实心点；颜色使用成功色（例如 `--success`）。
- Hover：按钮背景轻微加深；
- Focus：键盘聚焦显示清晰 focus ring。
- Disabled：降低不透明度并禁用交互。

## 4) Page Structure（组件结构）
- ToolbarContainer（整体容器）
  - SelectAllButton（全选/全不选）
  - LayerButtonList（8 个图层按钮容器）
    - LayerButton * 8
      - Icon（可选）
      - Label（可选）
      - CheckedBadge（勾选徽标）

## 5) Sections & Components（细节规范）

### 5.1 ToolbarContainer
- 位置：通常叠加在地图上方（左上/右上由业务决定）。
- 形态：可选圆角卡片底（提升可读性），支持阴影（轻）。
- 交互：不拦截地图的拖拽/缩放事件区域（仅按钮命中区域可点击）。

### 5.2 SelectAllButton（全选）
- 文案：默认“全选”；当已全选时切换为“全不选”（或保留同一文案但切换图标状态）。
- 状态：
  - 未全选：普通态
  - 已全选：可高亮（轻度）以提示当前为全选状态
- 点击行为：
  - 若 `checkedIds.length === 8`（或 items 全部 checked）：执行全不选
  - 否则：执行全选
- 输出事件：`select-all`（payload 包含 `checkedIds` 与 `isAllSelected`）

### 5.3 LayerButton（8 个图层按钮）
- 可点击区域：整个按钮。
- 显示规则：
  - Active（激活态）：按钮描边/底色高亮；图标/文字颜色提升对比度。
  - Checked（勾选态）：右上角显示 CheckedBadge（不与 Active 冲突）。
  - Disabled：不可激活、不可勾选；徽标不响应。
- 点击/交互（建议拆分两类事件入口，避免歧义）：
  1) 点击按钮主体：触发激活切换（active-change）。
  2) 点击徽标区域（或在按钮上提供二次点击/长按入口）：触发勾选切换（checked-change）。
  - 若现状无法拆分区域：允许“单击激活 + 同时切换勾选”的方案，但必须在实现前固定规则，避免误操作。

### 5.4 CheckedBadge（勾选徽标）
- 位置：按钮右上角绝对定位。
- 尺寸：不遮挡主图标；最小可点击面积建议 ≥ 24px（移动端尤其重要）。
- 可访问性：提供 `aria-pressed` 或 `aria-checked`（由语义选择）。

### 5.5 键盘与可访问性
- Tab 顺序：全选 → 第 1 到第 8 个按钮。
- Enter/Space：触发按钮主动作（激活）。若需要勾选切换，提供额外快捷键（例如 `Shift+Enter`）或单独可聚焦的徽标按钮。
- Tooltip：hover/focus 显示图层名称，移动端长按显示。

## 6) 事件与数据契约（实现须对齐）
- 输入数据：8 个图层项数组（含 `id/name/icon/disabled/checked` 等）。
- 输出事件：
  - `active-change(payload)`：`{ activeId, activeItem, previousActiveId? }`
  - `checked-change(payload)`：`{ checkedIds, changedId, checked }`
  - `select-all(payload)`：`{ checkedIds, isAllSelected }`
- 受控建议：由宿主维护 `activeId/checkedIds`，组件只负责派发事件与渲染，避免双向状态不一致。