# 坐标系与转换规范

## 1. 责任分工

| 层级 | 坐标系责任 |
| --- | --- |
| 服务层（后端 / 外部） | 强约束 WGS84（EPSG:4326） |
| 协议层 `protocol/` | 强约束 WGS84（`[longitude, latitude]`） |
| 计算层 `composables/` | 可消费任意坐标系，输出必须转回 WGS84 |
| 业务控制层 `controller/core/business/` | 强约束 WGS84 |
| 通用控制层 `controller/core/generic/` | 强约束 WGS84 输入；OL/ThreeJS 内部转换由底座插件负责 |
| IO 控制层 `controller/core/io/` | 视图事件统一 WGS84 上报 |
| 渲染层 `components/`、`baseComponent/` | 由底座插件（`src/plugins/mapPlugins/core/transform.ts`）负责 WGS84 → 视图坐标 |

## 2. 坐标系类型约定

| 标识 | 含义 | 用途 |
| --- | --- | --- |
| `WGS84` / `EPSG:4326` | 经纬度（度） | 协议层、控制层、计算结果 |
| `Web Mercator` / `EPSG:3857` | 投影坐标（米） | 切片底图、OL 内部 |
| `GCJ-02` | 火星坐标 | 高德底图、调用高德 API |
| `BD-09` | 百度坐标 | 百度底图、调用百度 API |
| `coord_sys` 字段 | 业务协议标记坐标系 | `protocol/IOProtocol.ts` 中可选 |

业务协议中的 `coord_sys` 默认 `WGS84`；显式声明其它坐标系时必须同时返回转换参数。

## 3. 坐标顺序与精度

- 业务统一使用 `[longitude, latitude]`（经度在前），与 GeoJSON 一致。
- 经纬度精度保留 6 位小数（约 0.1m），禁止使用浮点全精度传播。
- 内部计算允许 `Float64Array` 提高性能；交付控制层时再 toFixed 6 位。

## 4. 转换函数清单

文件：`src/util/coordTransform.ts`

| 方法 | 入参 | 出参 | 用途 |
| --- | --- | --- | --- |
| `wgs84ToGcj02` | `[lng, lat]` | `[lng, lat]` | WGS84 → 火星坐标 |
| `gcj02ToWgs84` | `[lng, lat]` | `[lng, lat]` | 火星坐标 → WGS84（反向近似） |
| `wgs84ToBd09` | `[lng, lat]` | `[lng, lat]` | WGS84 → 百度坐标 |
| `bd09ToWgs84` | `[lng, lat]` | `[lng, lat]` | 百度坐标 → WGS84 |
| `gcj02ToBd09` | `[lng, lat]` | `[lng, lat]` | 火星坐标 → 百度坐标 |
| `bd09ToGcj02` | `[lng, lat]` | `[lng, lat]` | 百度坐标 → 火星坐标 |
| `wgs84ToMercator` | `[lng, lat]` | `[x, y]` | WGS84 → Web Mercator（米） |
| `mercatorToWgs84` | `[x, y]` | `[lng, lat]` | Web Mercator → WGS84 |
| `transformBbox` | `BBox`, `from`, `to` | `BBox` | 任意坐标系之间转换包围盒 |
| `pickTransform` | `[lng, lat]`, `coord_sys` | `[lng, lat]` | 根据 `coord_sys` 自动选转换函数 |
| `formatLngLat` | `[lng, lat]` | `[lng6, lat6]` | toFixed 6 位并校验范围 |

新增加换函数必须在 `coordTransform.ts` 中实现，并补充 Vitest 单元测试（含边界值、高分位对照）。

## 5. Auto-Fit Padding 公式

```typescript
function fitWithPadding(extent: Extent, paddingRatio = 0.12) {
  const [minX, minY, maxX, maxY] = extent;
  const dx = maxX - minX;
  const dy = maxY - minY;
  const padX = dx * paddingRatio;
  const padY = dy * paddingRatio;
  return [
    minX - padX,
    minY - padY,
    maxX + padX,
    maxY + padY
  ];
}
```

- 默认 `paddingRatio = 0.12`（即 12% 留边，落在 10%~15% 区间内）。
- 业务显式传入 `padding` 参数时优先使用；缺省值不得低于 0.10。
- 弹屏、来电、围栏切换等场景统一调用 `view.fit(padded, { duration: 800 })`。

## 6. 坐标系转换严禁事项

- 禁止在协议层或控制层使用火星/百度坐标（必须先转 WGS84 再继续）。
- 禁止直接修改 `coordTransform.ts` 之外的转换实现。
- 禁止在渲染层手工计算投影（统一由底座插件 `src/plugins/mapPlugins/core/transform.ts` 提供）。
- 禁止在业务事件中混用 `coord_sys`（同一事件的所有坐标必须使用同一坐标系并显式标注）。
- 禁止 Auto-Fit 贴边（Padding 必须保留 10%~15%）。

## 7. 跨底图切换策略

当场景从 OpenLayers 切换到 ThreeJS，或从 OpenLayers 切换到 amap 时，坐标系责任如下：

1. 切换前必须保留所有图元 WGS84 坐标。
2. 切换后由目标底座插件统一转换 WGS84 → 目标内部坐标系。
3. 切换过程中不得直接修改 Pinia store 的图元坐标字段（只更新 `coord_sys` 标记）。
4. 切换后第一次 Auto-Fit 必须重新调用 `view.fit` 并保留 Padding。
