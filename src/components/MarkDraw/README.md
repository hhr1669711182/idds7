# MarkDraw 地图标绘工具系统

在 `ids-gis-web` 项目中的标绘系统，位于 `src/components/MarkDraw/`。

## 入口

- 主入口路由：`/markDraw`（来自 `src/views/markDraw/index.vue`）。
- 也可单独把 `MarkDrawSurface` 挂到任意宿主页面，传入 `ol.Map` 即可。

## 底图

与 map 页面**共用同一套底图**，不再自建 OSM mock 地图：

- `AMAP_LAYER()` / `GOOGLE_LAYER` / `VECTOR_LAYER()` 来自 `baseComponent/OpenlayersMap/layers`
- `CENTER` / `ZOOM` 来自 `baseComponent/OpenlayersMap/const.map`
- 比例尺单位沿用 `config/scaleLine`

`VECTOR_LAYER` 的 `className` 与 map 侧一致。

## 工具实现

全部 15 个工具都在 MarkDraw **内部实现**，统一挂在 `tools/` 下，由 `tools/index.ts`
的 `createTool` 按 `MarkDrawToolType` 分发：

| 文件 | 覆盖工具 |
|------|---------|
| `tools/DrawTools.ts` | 标点 / 标线 / 标面 / 圆 / 矩形（结果回灌 engine 落 WFS） |
| `tools/MeasureTools.ts` | 测距 / 测面 / 量角 / 方位角（只回调数值，不落库） |
| `tools/QueryTools.ts` | 框选放大（DragZoom） |
| `tools/MilitarySymbols.ts` | 军标箭头 / 双线箭头 / 曲线箭头 / 聚集箭头 / 战术符号 |

绘制完成的标绘与军标要素经 engine 的 `addFeature` 回灌，WFS 落库、要素列表、
图上编辑（Select + Modify → WFS-T Update）链路保持不变。

量算类结果通过 `measure:result` 事件上抛，
由 `MarkDrawResultBar` 统一展示，不落库。

## 图标

工具栏图标复用项目 sprite（`public/icons.svg`，由 `App.vue` 注入 `#svgBase`），
以 `<use xlink:href="#icon-*">` 渲染，与地图工具栏图标同源。

## 核心能力

- **三级关系**：`group → layer → feature`
  - group/layer 从 `@/config/layers` 的 `LAYER_SOURCE_CONFIGS` 派生
  - 内置 `mark:mark_features` 作为可写标绘专题层
- **直连 GeoServer CRUD**：查询走 `geoserverApi.getWFSFeatures`，写走 WFS-T
- **图上编辑**：Select + Modify 联动 `feature:modified`，FeatureListPanel 自动 WFS-T Update
- **GeoJSON 导入导出**：导出当前所有标绘 + 样式；导入时按 `_layerId` 还原归属
- **清除元素**：工具栏底部按钮，清空图上全部绘制 / 量算 / 查询图元（仅内存态，不动数据库）

## UI 主题

`styles/markdraw.less` 定义玻璃风格变量，跟随 `:root[data-theme="NIGHT"]` 切换。

## 手动验收

1. `pnpm dev` 打开 `/#/markDraw`：
   - 工具栏 15 项 + 底部「清除元素」均可点击，图标与地图工具栏一致
   - 底图为高德矢量图，左下角有比例尺，左下角上方有缩放控件
   - 画点 → 自动回待命态 → 右侧维护表单保存 → 控制台打印 `Insert Transaction`
   - 测距 / 量角 / 方位角 → 底部结果条显示数值，图上留下量算图元
   - 点「清除元素」→ 二次确认 → 图上元素全部清空，按钮回到禁用
   - 三级面板：选 `我的标绘` 拉取；选只读图层显示"只读"
   - 拖拽要素顶点 → 自动 WFS-T Update
2. 切换 dark / light 主题：面板、按钮、表格背景自动跟随。

## 坐标系约定

全链路只保留一套口径，转换只发生在「地图 ↔ 数据」两个边界：

| 环节 | 坐标系 | 说明 |
|------|--------|------|
| 地图渲染 / 拖拽 / 命中测试 | EPSG:3857 | OL 图层内部表示，渲染必需 |
| 几何展示（表单、要素列表、导出） | EPSG:4326 | 经纬度，与业务和数据库一致 |
| WFS-T 落库 | EPSG:4326 | `srsName="CRS:84"`，几何字段按图层真实名写入 |

- 读：`readGeoJsonAsMercator()` 是唯一一处 4326 → 3857 的入口（WFS 出 4326，OL 要 3857）。
- 写：`wfsXml.ts` 在序列化这一刻把要素几何转回 4326，`srsName` 用 `CRS:84`。
- **不能用 `EPSG:4326`**：OL 里该 CRS 的轴序是 `neu`（lat,lon），GML writer 会把 `[lon,lat]` 再倒一次，
  GeoServer 按 lat,lon 解析就报 `PointOutsideEnvelopeException`。`CRS:84` 在 OL 里是 `enu`，不倒序。
- 围栏贴边吸附与交叠校验同样在 4326 上运算，与展示、落库同口径。

## 保存（WFS-T）

- 图层可写性由 `view/layerConfig.ts` 的 `LAYER_WRITABLE_OVERRIDES` 控制，`gis:view_juris_zone`（队站辖区）已放开。
- 几何字段名取 `DescribeFeatureType` 的真实字段名（队站辖区是 `zone_geom`），不是 OL 默认的 `geometry`。
- 写事务前会按真实字段裁剪要素属性，MarkDraw 的临时字段（`name` / `mark` / `style` / `_` 开头）不落库。
- **保存按钮在没有变更时直接置灰**：进入表单时记录几何坐标 + 名称/类型/备注/样式的指纹快照，
  地图拖拽 Modify 或表单编辑都会让按钮亮起；保存成功后指纹刷新，按钮随即回到置灰。
## 弹窗与表格

- 确认框走 `createApp` 动态挂载 + `Teleport to body`，样式统一在全局 `styles/toast.less`；`z-index 100001`，不会被地图容器或抽屉裁剪。
- 要素列表列名完全跟随 WFS `getFeature` 返回的 `properties`：排除几何字段与空值列，`name/code/mark/type` 等常见字段优先，最多 5 列。

## 已知问题

- 要素列表依赖 GeoServer 在线；某个图层 404 时该图层列表会清空并弹出错误提示（不残留上一个图层的旧数据）。