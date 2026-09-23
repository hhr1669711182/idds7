/**
 * 军标符号：箭头 / 双线 / 曲线 / 聚集箭头 / 战术符号
 * drawend 时由 LineString/Point 实时构建几何与样式。
 */
import { Style, Stroke, Fill, Icon, RegularShape, Text } from "ol/style";
import Feature from "ol/Feature";
import { LineString, Point } from "ol/geom";
import type { Coordinate } from "ol/coordinate";
import { getSVGForSrcById } from "@/utils/svgTools";
import type { MarkDrawToolType } from "../engine/types";
import { BaseTool } from "./BaseTool";

/** 沿线箭头：线 + 末端箭头三角 */
const makeArrow = (coords: Coordinate[]): Feature => {
  const f = new Feature({ geometry: new LineString(coords) });
  f.setStyle([
    new Style({ stroke: new Stroke({ color: "#e6a23c", width: 3 }) }),
    makeArrowHead(coords),
  ]);
  return f;
};

const makeArrowHead = (coords: Coordinate[]): Style => {
  if (coords.length < 2) return new Style({});
  const start = coords[coords.length - 2];
  const end = coords[coords.length - 1];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const angle = Math.atan2(dy, dx);
  const triangle = new RegularShape({
    points: 3,
    radius: 18,
    rotation: angle - Math.PI / 2,
    fill: new Fill({ color: "#e6a23c" }),
    stroke: new Stroke({ color: "#e6a23c", width: 1 }),
  });
  return new Style({ image: triangle, geometry: new Point(end) });
};

/** 双线：等距偏移产生两条 LineString */
const makeDoubleLine = (coords: Coordinate[], offset = 6): Feature => {
  if (coords.length < 2) {
    return new Feature({ geometry: new LineString(coords) });
  }
  const left: Coordinate[] = [];
  const right: Coordinate[] = [];
  for (let i = 0; i < coords.length; i++) {
    const cur = coords[i];
    let nx = 0;
    let ny = 0;
    if (i === 0) {
      nx = coords[1][0] - cur[0];
      ny = coords[1][1] - cur[1];
    } else if (i === coords.length - 1) {
      nx = cur[0] - coords[i - 1][0];
      ny = cur[1] - coords[i - 1][1];
    } else {
      nx = coords[i + 1][0] - coords[i - 1][0];
      ny = coords[i + 1][1] - coords[i - 1][1];
    }
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    left.push([cur[0] - ny * offset, cur[1] + nx * offset]);
    right.push([cur[0] + ny * offset, cur[1] - nx * offset]);
  }
  const f = new Feature({
    geometry: new LineString([...left, ...right.slice().reverse()]),
  });
  f.setStyle(
    new Style({
      stroke: new Stroke({ color: "#409eff", width: 3, lineDash: [10, 4] }),
    })
  );
  return f;
};

/** Catmull-Rom → 平滑点列（用于 LineString 模拟贝塞尔曲线） */
const catmullRomSmooth = (points: Coordinate[]): Coordinate[] => {
  if (points.length < 2) return points;
  const result: Coordinate[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    if (i === 0) result.push(p1);
    result.push([c1x, c1y], [c2x, c2y], p2);
  }
  return result;
};

const makeCurve = (coords: Coordinate[]): Feature => {
  const f = new Feature({ geometry: new LineString(catmullRomSmooth(coords)) });
  f.setStyle(new Style({ stroke: new Stroke({ color: "#67c23a", width: 3 }) }));
  return f;
};

/** 聚集箭头：以单点为中心，向四周画四个箭头线（用 LineString + 多段样式） */
const makeClusterArrow = (center: Coordinate): Feature => {
  const size = 80;
  const arrows: Coordinate[][] = [
    [center, [center[0] + size, center[1]]],
    [center, [center[0] - size, center[1]]],
    [center, [center[0], center[1] + size]],
    [center, [center[0], center[1] - size]],
  ];
  const f = new Feature({
    geometry: new LineString(arrows.flat()),
  });
  f.setStyle(
    new Style({
      stroke: new Stroke({ color: "#f56c6c", width: 3 }),
      image: new RegularShape({
        points: 3,
        radius: 16,
        rotation: 0,
        fill: new Fill({ color: "#f56c6c" }),
      }),
    })
  );
  return f;
};

/** 战术符号：单点 + 字母 T 标记 */
const makeTactic = (coord: Coordinate): Feature => {
  const f = new Feature({ geometry: new Point(coord) });
  f.setStyle(
    new Style({
      image: new Icon({
        src: getSVGForSrcById({ symbolId: "icon-symbol-one", color: "#f56c6c" }),
        anchor: [0.5, 0.5],
        scale: 1.4,
      }),
      text: new Text({
        text: "T",
        font: "bold 14px Arial",
        offsetY: -22,
        fill: new Fill({ color: "#f56c6c" }),
        stroke: new Stroke({ color: "#fff", width: 3 }),
      }),
    })
  );
  return f;
};

export class MilitaryTool extends BaseTool {
  private rawCoords: Coordinate[] = [];

  init() {
    this.rawCoords = [];
    this.map.on("singleclick", this.onClick as never);
    this.map.on("dblclick", this.onDblClick as never);
    this.listeners.push(
      this.map.on("pointermove", (evt) => {
        const hint =
          this.type === "MILITARY_TACTIC"
            ? "点击地图放置战术符号"
            : this.type === "MILITARY_CLUSTER_ARROW"
            ? "点击地图放置聚集箭头"
            : "点击添加点 → 双击结束";
        this.setHelp(evt.coordinate, hint);
      })
    );
  }

  private onClick = (evt: { coordinate: Coordinate }) => {
    this.rawCoords.push(evt.coordinate);
    if (this.type === "MILITARY_TACTIC" || this.type === "MILITARY_CLUSTER_ARROW") {
      this.commit([evt.coordinate]);
      this.rawCoords = [];
    }
  };

  private onDblClick = () => {
    if (this.rawCoords.length >= 2) {
      this.commit(this.rawCoords.slice());
      this.rawCoords = [];
    }
  };

  private commit(coords: Coordinate[]) {
    let feature: Feature;
    switch (this.type) {
      case "MILITARY_ARROW":
        feature = makeArrow(coords);
        break;
      case "MILITARY_DOUBLE_LINE":
        feature = makeDoubleLine(coords);
        break;
      case "MILITARY_CURVE":
        feature = makeCurve(coords);
        break;
      case "MILITARY_CLUSTER_ARROW":
        feature = makeClusterArrow(coords[0]);
        break;
      case "MILITARY_TACTIC":
        feature = makeTactic(coords[0]);
        break;
      default:
        return;
    }
    feature.setId(this.uuid);
    this.cb(feature);
  }

  destroy() {
    this.map.un("singleclick", this.onClick as never);
    this.map.un("dblclick", this.onDblClick as never);
    this.rawCoords = [];
    super.destroy();
  }
}

export const isMilitaryTool = (tool: MarkDrawToolType): boolean =>
  tool.startsWith("MILITARY_");
