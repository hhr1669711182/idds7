/**
 * 图层要素上图的默认样式
 *
 * 规则（按优先级）：
 * 1. 要素自带 Style（GeoJSON style / 图层样式）→ 原样保留
 * 2. 围栏类图层（面 + 围栏语义）→ 围栏虚线样式
 * 3. 点类几何 → 图层配置有 icon 时生成图标化点位，否则用默认圆点样式
 * 4. 线类几何 → 线样式
 * 5. 面类几何 → 面样式
 *
 * 说明：图层配置里的 icon 是 mdi 名字符串（如 'mdi:home'），不是可直接渲染的
 * 图片 URL，OL 的 Icon 只接受 URL，因此这里用 RegularShape + 语义配色
 * 生成图标化点位，保证「有图标定义」与「无图标定义」视觉可区分。
 */
import {
  Circle as CircleStyle,
  Fill,
  RegularShape,
  Stroke,
  Style,
} from "ol/style";
import type Feature from "ol/Feature";
import type { MarkDrawLayer } from "../engine/types";

/**
 * 围栏类图层：按 id / 名称识别。
 * 队站辖区（view_juris_zone）与街道区划（env_area_fence）都是边界/辖区面，
 * 业务上按围栏对待：走围栏虚线样式，并受「不可交叠、靠近贴边」约束。
 */
const FENCE_LAYER_IDS = /(^|:)(env_area_fence|area_fence|fence|view_juris_zone)(:|$)/i;
const FENCE_NAME_HINTS = /围栏|围界|防线|栅栏|辖区|区划/;

/** 主题色板（与 markdraw.less 的 cyan 主色一致） */
const ACCENT = "#00d4ff";
const FENCE_COLOR = "#f5a623";

/** 各类业务图层的图标语义配色 */
const ICON_THEME: Array<[RegExp, { fill: string; stroke: string }]> = [
  [/fire|hydrant|fireplace/, { fill: "#ff5b5b", stroke: "#8c1c1c" }],
  [/office|building|home|company/, { fill: "#7ad7ff", stroke: "#0f5f8a" }],
  [/area|network|surface|juris|subtitle/, { fill: "#b197fc", stroke: "#5b3fa8" }],
  [/location|poi|gate|entrance|place/, { fill: "#ffd43b", stroke: "#8a6d00" }],
  [/road|car|vehicle|traffic/, { fill: "#63e6be", stroke: "#0f7a5a" }],
];

const isFenceLayer = (layer: MarkDrawLayer | null): boolean => {
  if (!layer) return false;
  return FENCE_LAYER_IDS.test(layer.id) || FENCE_NAME_HINTS.test(layer.name);
};

/** 按图层 icon 名匹配语义配色；匹配不到返回 null（走默认圆点） */
const resolveIconTheme = (icon: string | undefined) => {
  if (!icon) return null;
  const lower = icon.toLowerCase();
  return ICON_THEME.find(([re]) => re.test(lower))?.[1] ?? null;
};

/** 围栏：橙色虚线 + 淡填充 */
const fenceStyle = (): Style =>
  new Style({
    stroke: new Stroke({ color: FENCE_COLOR, width: 2, lineDash: [10, 6] }),
    fill: new Fill({ color: "rgba(245, 166, 35, 0.12)" }),
  });

/** 点位默认样式：无图标定义时的兜底圆点 */
const pointStyle = (): Style =>
  new Style({
    image: new CircleStyle({
      radius: 6,
      fill: new Fill({ color: ACCENT }),
      stroke: new Stroke({ color: "#fff", width: 2 }),
    }),
  });

/** 有图标定义：菱形图标点，视觉上与默认圆点明显区分 */
const iconPointStyle = (fill: string): Style =>
  new Style({
    image: new RegularShape({
      points: 4,
      radius: 8,
      angle: Math.PI / 4,
      fill: new Fill({ color: fill }),
      stroke: new Stroke({ color: "#fff", width: 2 }),
    }),
  });

/** 线默认样式 */
const lineStyle = (): Style =>
  new Style({ stroke: new Stroke({ color: ACCENT, width: 2 }) });

/** 面默认样式 */
const polygonStyle = (): Style =>
  new Style({
    stroke: new Stroke({ color: ACCENT, width: 2 }),
    fill: new Fill({ color: "rgba(0, 212, 255, 0.18)" }),
  });

/** 为加载上来的要素补默认样式：已有样式不覆盖。 */
export const applyDefaultStyle = (feature: Feature, layer: MarkDrawLayer | null): void => {
  if (feature.getStyle()) return;

  const geom = feature.getGeometry();
  const kind = geom?.getType() ?? "unknown";

  // 1. 围栏图层：统一用围栏样式
  if (isFenceLayer(layer)) {
    feature.setStyle(fenceStyle());
    return;
  }

  // 2. 点类几何：有 icon 用图标化点位，否则用默认圆点
  if (kind === "Point" || kind === "MultiPoint") {
    const theme = resolveIconTheme(layer?.icon);
    feature.setStyle(theme ? iconPointStyle(theme.fill) : pointStyle());
    return;
  }

  // 3. 线 / 面按几何类型回落
  if (kind === "LineString" || kind === "MultiLineString" || kind === "LinearRing") {
    feature.setStyle(lineStyle());
    return;
  }

  feature.setStyle(polygonStyle());
};

export { isFenceLayer };
