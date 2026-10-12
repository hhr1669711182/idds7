/**
 * 选中高亮：独立高亮图层 + 闪烁动画
 *
 * 设计要点：
 * - 独立 VectorLayer 挂在业务图层之上，不改动要素自身样式
 * - 高亮 = 发光外扩描边 + 亮色内描边 + 半透明填充 + 中心菱形标记
 * - 闪烁用 requestAnimationFrame 驱动描边宽度与透明度，结束后保留静态高亮
 * - 高亮图层不参与 hitDetection，不影响业务要素的点击与 Modify
 */
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { Circle as CircleStyle, Fill, RegularShape, Stroke, Style } from "ol/style";
import Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import { LineString, MultiLineString, MultiPolygon, Point, Polygon } from "ol/geom";
import type { Map as OLMap } from "ol";

/** 高亮主题色：比业务要素更亮，保证叠在任意底色上都醒目 */
const HL_COLOR = "#22e6ff";
const HL_CORE = "#ffffff";

/** 闪烁参数 */
const WIDTH_MIN = 2.5;
const WIDTH_MAX = 12;
const FLASH_COUNT = 3;
const FLASH_CYCLE_MS = 420;
const REST_WAVE = 0.3;

/** 点位与中心标记尺寸 */
const POINT_RADIUS = 7;
const ANCHOR_RADIUS = 8;

/** 取面内点 / 线中点 / 点自身坐标，作为中心标记位置 */
const resolveAnchor = (geom: Geometry | null): number[] | null => {
  if (!geom) return null;
  if (geom instanceof Point) return (geom.getCoordinates() as number[]) ?? null;
  if (geom instanceof Polygon) {
    return (geom.getInteriorPoint().getCoordinates() as number[]) ?? null;
  }
  if (geom instanceof MultiPolygon) {
    const first = geom.getPolygons()[0];
    return first ? (first.getInteriorPoint().getCoordinates() as number[]) : null;
  }
  if (geom instanceof LineString) {
    return (geom.getCoordinateAt(0.5) as number[]) ?? null;
  }
  if (geom instanceof MultiLineString) {
    const first = geom.getLineStrings()[0];
    return first ? (first.getCoordinateAt(0.5) as number[]) : null;
  }
  return null;
};

/**
 * 按波形强度构建高亮样式
 * @param geom 几何（为空时不渲染图形部分）
 * @param wave 0~1，0 最弱、1 最强
 */
const buildStyles = (geom: Geometry | null, wave: number): Style[] => {
  const styles: Style[] = [];
  if (!geom) return styles;

  const type = geom.getType();
  const width = WIDTH_MIN + (WIDTH_MAX - WIDTH_MIN) * wave;
  const alpha = 0.2 + 0.55 * wave;

  // 外扩发光层：粗描边、低透明度，营造光晕
  styles.push(
    new Style({
      stroke: new Stroke({
        color: `rgba(34, 230, 255, ${alpha * 0.35})`,
        width,
      }),
      fill: new Fill({ color: `rgba(34, 230, 255, ${alpha * 0.12})` }),
      zIndex: 1,
    })
  );

  // 内亮层：白色细描边，让边界在深色底图上也清晰
  styles.push(
    new Style({
      stroke: new Stroke({ color: HL_CORE, width: Math.max(1, width * 0.18) }),
      fill: new Fill({ color: `rgba(34, 230, 255, ${alpha * 0.16})` }),
      zIndex: 2,
    })
  );

  const anchor = resolveAnchor(geom);
  if (type === "Point" || type === "MultiPoint") {
    // 点位自身：外圈光晕圆 + 实心核心
    styles.push(
      new Style({
        image: new CircleStyle({
          radius: POINT_RADIUS + width * 0.5,
          fill: new Fill({ color: `rgba(34, 230, 255, ${alpha * 0.22})` }),
          stroke: new Stroke({ color: `rgba(34, 230, 255, ${alpha * 0.7})`, width: 1.5 }),
        }),
        zIndex: 3,
      })
    );
    styles.push(
      new Style({
        image: new CircleStyle({
          radius: POINT_RADIUS,
          fill: new Fill({ color: HL_COLOR }),
          stroke: new Stroke({ color: HL_CORE, width: 2 }),
        }),
        zIndex: 4,
      })
    );
  } else if (anchor) {
    // 面 / 线：中心菱形标记
    styles.push(
      new Style({
        geometry: new Point(anchor),
        image: new RegularShape({
          points: 4,
          radius: ANCHOR_RADIUS,
          angle: Math.PI / 4,
          fill: new Fill({ color: HL_COLOR }),
          stroke: new Stroke({ color: HL_CORE, width: 2 }),
        }),
        zIndex: 3,
      })
    );
  }

  return styles;
};

export class MarkDrawHighlight {
  private readonly layer: VectorLayer<VectorSource>;
  private readonly source: VectorSource;
  private rafId = 0;
  private highlighted: Feature | null = null;
  private disposed = false;

  constructor(map: OLMap) {
    this.source = new VectorSource();
    this.layer = new VectorLayer({
      source: this.source,
      className: "MARKDRAW_HIGHLIGHT",
    });
    // 覆盖层不参与命中检测，避免遮挡业务要素的点击与 Modify
    (this.layer as unknown as { hitDetection_: unknown }).hitDetection_ = () => null;
    this.layer.setZIndex(90);
    map.addLayer(this.layer);
  }

  /** 高亮指定要素；传 null 取消高亮 */
  highlight(feature: Feature | null): void {
    this.stopAnimation();
    this.source.clear();
    this.highlighted = feature;
    if (!feature) return;
    this.source.addFeature(this.cloneOf(feature));
    this.runFlash();
  }

  /** 动画结束后回到静态高亮，避免选中态消失 */
  private finishFlash(): void {
    const clone = this.source.getFeatures()[0];
    if (!clone || !this.highlighted) return;
    clone.setStyle(buildStyles(this.highlighted.getGeometry() ?? null, REST_WAVE));
    this.rafId = 0;
  }

  private runFlash(): void {
    if (!this.highlighted || this.disposed) return;
    const start = performance.now();
    const tick = (now: number) => {
      if (!this.highlighted || this.disposed) return;
      const elapsed = now - start;
      const phase = (elapsed % FLASH_CYCLE_MS) / FLASH_CYCLE_MS;
      // 三角波 0→1→0，比正弦更柔和，避免突兀的峰值
      const wave = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      const clone = this.source.getFeatures()[0];
      if (clone) clone.setStyle(buildStyles(this.highlighted.getGeometry() ?? null, wave));
      if (elapsed < FLASH_CYCLE_MS * FLASH_COUNT) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        this.finishFlash();
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopAnimation(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  /** 生成高亮副本（几何克隆，不影响原要素） */
  private cloneOf(feature: Feature): Feature {
    const geom = feature.getGeometry();
    const clone = new Feature({ geometry: geom ? geom.clone() : undefined });
    clone.setStyle(buildStyles(geom ?? null, REST_WAVE));
    return clone;
  }

  destroy(): void {
    this.disposed = true;
    this.stopAnimation();
    this.source.clear();
    this.highlighted = null;
    this.layer.setMap(null);
  }

  /** 当前高亮要素数：0 表示未选中，1 表示有一个高亮 */
  get count(): number {
    return this.source.getFeatures().length;
  }
}
