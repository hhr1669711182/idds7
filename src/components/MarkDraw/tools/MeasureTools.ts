/**
 * 量算工具（MarkDraw 内部实现）
 * 测距 / 测面 / 量角 / 方位角 —— 结果只回调数值，不写入标绘矢量图层
 */
import { Draw } from "ol/interaction";
import { unByKey } from "ol/Observable";
import { Style, Stroke, Fill, Circle as CircleStyle, Icon, Text } from "ol/style";
import Overlay from "ol/Overlay";
import Feature from "ol/Feature";
import { LineString, Point, Polygon } from "ol/geom";
import type { Geometry } from "ol/geom";
import type { Coordinate } from "ol/coordinate";
import { getDistance, getArea as getSphericalArea } from "ol/sphere";
import { transform } from "ol/proj";
import { formatDistance, formatLength, formatArea, calculateAngle, createAngleSVG } from "@/utils";
import { BaseTool } from "./BaseTool";

const LINE_STYLE = new Style({ stroke: new Stroke({ color: "#ff3b5c", width: 3 }) });
const GUIDE_STYLE = new Style({
  stroke: new Stroke({ color: "#7ad7ff", width: 1.5, lineDash: [6, 5] }),
});
const VERTEX_STYLE = new Style({
  image: new CircleStyle({
    radius: 4,
    fill: new Fill({ color: "#ff3b5c" }),
    stroke: new Stroke({ color: "#fff", width: 1.5 }),
  }),
});

/** 在矢量图层上加一个顶点样式要素 */
const addVertex = (
  source: { addFeature: (f: Feature) => void },
  coordinate: Coordinate,
  label?: string
) => {
  const feature = new Feature({ geometry: new Point(coordinate) });
  if (label) {
    feature.setStyle([
      VERTEX_STYLE,
      new Style({
        text: new Text({
          text: label,
          font: "bold 12px Arial",
          fill: new Fill({ color: "#7ad7ff" }),
          stroke: new Stroke({ color: "#0a1525", width: 3 }),
          offsetY: -12,
        }),
      }),
    ]);
  } else {
    feature.setStyle(VERTEX_STYLE);
  }
  source.addFeature(feature);
};

/** 线长度（米） */
const getLengthMeters = (coords: Coordinate[]): number => {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += getDistance(
      transform(coords[i], "EPSG:3857", "EPSG:4326") as [number, number],
      transform(coords[i + 1], "EPSG:3857", "EPSG:4326") as [number, number]
    );
  }
  return total;
};

/** 正北起算方位角（0~360） */
const calcAzimuth = (from: [number, number], to: [number, number]): number => {
  const dLon = ((to[0] - from[0]) * Math.PI) / 180;
  const lat1 = (from[1] * Math.PI) / 180;
  const lat2 = (to[1] * Math.PI) / 180;
  const y = Math.sin(dLon);
  const x = Math.cos(lat1) * Math.tan(lat2) - Math.sin(lat1) * Math.cos(dLon);
  return ((((Math.atan2(y, x) * 180) / Math.PI) % 360) + 360) % 360;
};

/** 测距：折线累计长度 */
export class MeasureDistanceTool extends BaseTool {
  private draw: Draw | null = null;
  private tip: Overlay | null = null;
  private tipEl: HTMLElement | null = null;
  private geomKey: unknown = null;

  protected helpMessage(): string {
    return "单击添加节点，双击结束测距";
  }

  init() {
    this.drawing = true;
    this.draw = new Draw({
      source: this.vectorLayer.getSource()!,
      type: "LineString",
      style: LINE_STYLE,
    });
    this.map.addInteraction(this.draw);

    this.listeners.push(
      this.draw.on("drawstart", (evt) => {
        const feature = evt.feature as Feature<LineString>;
        this.tipEl = document.createElement("div");
        this.tipEl.className = "md-measure-tip";
        this.tip = new Overlay({
          element: this.tipEl,
          offset: [0, -14],
          positioning: "bottom-center",
          stopEvent: false,
        });
        this.map.addOverlay(this.tip);
        this.geomKey = feature.getGeometry()?.on("change", (e: { target: Geometry }) => {
          const geom = e.target as LineString;
          if (this.tipEl) this.tipEl.textContent = `总长 ${formatLength(geom)}`;
          this.tip?.setPosition(geom.getLastCoordinate());
        });
      }),
      this.draw.on("drawend", (evt) => {
        const geom = (evt.feature as Feature<LineString>).getGeometry();
        this.map.removeInteraction(this.draw!);
        this.cleanupTip();
        if (geom) {
          const coords = geom.getCoordinates();
          coords.forEach((c) => addVertex(this.vectorLayer.getSource()!, c));
          const line = new Feature({ geometry: geom.clone() });
          line.setStyle(LINE_STYLE);
          this.vectorLayer.getSource()!.addFeature(line);
          const meters = getLengthMeters(coords);
          this.measureEnd({
            text: formatDistance(meters),
            value: meters,
            kind: "distance",
          });
        }
      })
    );
  }

  private cleanupTip() {
    if (this.geomKey) unByKey(this.geomKey as never);
    this.geomKey = null;
    if (this.tip) this.map.removeOverlay(this.tip);
    this.tip = null;
    this.tipEl = null;
  }

  destroy() {
    this.cleanupTip();
    if (this.draw) this.map.removeInteraction(this.draw);
    this.draw = null;
    super.destroy();
  }
}

/** 测面：多边形面积 */
export class MeasureAreaTool extends BaseTool {
  private draw: Draw | null = null;
  private tip: Overlay | null = null;
  private tipEl: HTMLElement | null = null;
  private geomKey: unknown = null;

  protected helpMessage(): string {
    return "单击添加节点，双击结束测面";
  }

  init() {
    this.drawing = true;
    this.draw = new Draw({
      source: this.vectorLayer.getSource()!,
      type: "Polygon",
      style: LINE_STYLE,
    });
    this.map.addInteraction(this.draw);

    this.listeners.push(
      this.draw.on("drawstart", (evt) => {
        const feature = evt.feature as Feature<Polygon>;
        this.tipEl = document.createElement("div");
        this.tipEl.className = "md-measure-tip";
        this.tip = new Overlay({
          element: this.tipEl,
          offset: [0, -14],
          positioning: "bottom-center",
          stopEvent: false,
        });
        this.map.addOverlay(this.tip);
        this.geomKey = feature.getGeometry()?.on("change", (e: { target: Geometry }) => {
          const geom = e.target as Polygon;
          if (this.tipEl) this.tipEl.textContent = `总面积 ${formatArea(getSphericalArea(geom))}`;
          const interior = geom.getInteriorPoint();
          this.tip?.setPosition(interior.getCoordinates());
        });
      }),
      this.draw.on("drawend", (evt) => {
        const geom = (evt.feature as Feature<Polygon>).getGeometry();
        this.map.removeInteraction(this.draw!);
        this.cleanupTip();
        if (geom) {
          const ring = geom.getCoordinates()[0] ?? [];
          ring.forEach((c) => addVertex(this.vectorLayer.getSource()!, c));
          const area = getSphericalArea(geom);
          this.measureEnd({
            text: formatArea(area),
            value: area,
            kind: "area",
          });
        }
      })
    );
  }

  private cleanupTip() {
    if (this.geomKey) unByKey(this.geomKey as never);
    this.geomKey = null;
    if (this.tip) this.map.removeOverlay(this.tip);
    this.tip = null;
    this.tipEl = null;
  }

  destroy() {
    this.cleanupTip();
    if (this.draw) this.map.removeInteraction(this.draw);
    this.draw = null;
    super.destroy();
  }
}

/** 量角：三顶点夹角 */
export class MeasureAngleTool extends BaseTool {
  private draw: Draw | null = null;
  private points: Coordinate[] = [];

  protected helpMessage(): string {
    const n = this.points.length;
    if (n === 0) return "选择起点 A";
    if (n === 1) return "选择顶点 B";
    return "选择终点 C";
  }

  init() {
    this.drawing = true;
    this.points = [];
    this.draw = new Draw({
      source: this.vectorLayer.getSource()!,
      type: "LineString",
      style: LINE_STYLE,
    });
    this.map.addInteraction(this.draw);

    this.listeners.push(
      this.draw.on("drawstart", (evt) => {
        const feature = evt.feature as Feature<LineString>;
        this.points = [];
        this.listeners.push(
          feature.getGeometry()!.on("change", () => {
            this.points = feature.getGeometry()!.getCoordinates().slice(0, -1);
            if (this.points.length >= 3) this.draw?.finishDrawing();
          })
        );
        void evt;
      }),
      this.draw.on("drawend", () => {
        const pts = this.points.slice(0, 3);
        this.map.removeInteraction(this.draw!);
        this.points = [];
        if (pts.length < 3) return;

        const { Angle } = calculateAngle({ points: pts });
        const line = new Feature({ geometry: new LineString(pts) });
        line.setStyle(LINE_STYLE);
        this.vectorLayer.getSource()!.addFeature(line);
        pts.forEach((c, i) => addVertex(this.vectorLayer.getSource()!, c, String.fromCharCode(65 + i)));
        const arc = new Feature({ geometry: new Point(pts[1]) });
        arc.setStyle(
          new Style({
            image: new Icon({
              src: createAngleSVG({ Angle, rotate: 90 }),
              anchor: [0.5, 0.5],
              scale: 0.7,
            }),
          })
        );
        this.vectorLayer.getSource()!.addFeature(arc);
        this.measureEnd({ text: `${Angle.toFixed(1)}°`, value: Angle, kind: "angle" });
      })
    );
  }

  destroy() {
    if (this.draw) this.map.removeInteraction(this.draw);
    this.draw = null;
    this.points = [];
    super.destroy();
  }
}

/** 方位角：相对正北方向的方位 */
export class MeasureAzimuthTool extends BaseTool {
  private draw: Draw | null = null;
  private points: Coordinate[] = [];

  protected helpMessage(): string {
    if (this.points.length === 0) return "选择起点 A";
    if (this.points.length === 1) return "选择终点 B";
    return "";
  }

  init() {
    this.drawing = true;
    this.points = [];
    this.draw = new Draw({
      source: this.vectorLayer.getSource()!,
      type: "LineString",
      style: LINE_STYLE,
    });
    this.map.addInteraction(this.draw);

    this.listeners.push(
      this.draw.on("drawstart", (evt) => {
        const feature = evt.feature as Feature<LineString>;
        this.points = [];
        this.listeners.push(
          feature.getGeometry()!.on("change", () => {
            this.points = feature.getGeometry()!.getCoordinates().slice(0, -1);
            if (this.points.length >= 2) this.draw?.finishDrawing();
          })
        );
        void evt;
      }),
      this.draw.on("drawend", () => {
        const pts = this.points.slice(0, 2);
        this.map.removeInteraction(this.draw!);
        this.points = [];
        if (pts.length < 2) return;

        const start = transform(pts[0], "EPSG:3857", "EPSG:4326") as [number, number];
        const end = transform(pts[1], "EPSG:3857", "EPSG:4326") as [number, number];
        const azimuth = calcAzimuth(start, end);

        const line = new Feature({ geometry: new LineString(pts) });
        line.setStyle(LINE_STYLE);
        this.vectorLayer.getSource()!.addFeature(line);
        pts.forEach((c, i) => addVertex(this.vectorLayer.getSource()!, c, i === 0 ? "A" : "B"));

        // 正北参考线（屏幕向上）
        const north: Coordinate = [pts[0][0], pts[0][1] + 5000];
        const guide = new Feature({ geometry: new LineString([pts[0], north]) });
        guide.setStyle(GUIDE_STYLE);
        this.vectorLayer.getSource()!.addFeature(guide);
        const northLabel = new Feature({ geometry: new Point(north) });
        northLabel.setStyle(
          new Style({
            text: new Text({
              text: "N",
              font: "bold 13px Arial",
              fill: new Fill({ color: "#7ad7ff" }),
              stroke: new Stroke({ color: "#0a1525", width: 3 }),
              offsetY: -14,
            }),
          })
        );
        this.vectorLayer.getSource()!.addFeature(northLabel);

        this.measureEnd({ text: `${azimuth.toFixed(1)}°`, value: azimuth, kind: "azimuth" });
      })
    );
  }

  destroy() {
    if (this.draw) this.map.removeInteraction(this.draw);
    this.draw = null;
    this.points = [];
    super.destroy();
  }
}
