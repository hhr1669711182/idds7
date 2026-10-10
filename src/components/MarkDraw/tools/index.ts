/**
 * MarkDraw 内部工具工厂
 *
 * 全部工具均在 MarkDraw 内部实现（`BaseTool` + 各工具子类）：
 * - 绘制类：结果回灌 engine，落 WFS 标绘图层
 * - 量算类：只回调数值，不落库
 * - 查询类：只产出统计结果（圈选查询 / 实时人口）
 * - 军标类：符号化绘制，结果同样落库
 */
import type { Map as OLMap } from "ol";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type Feature from "ol/Feature";

import type { BaseTool } from "./BaseTool";
import { PointTool, DrawTool } from "./DrawTools";
import {
  MeasureDistanceTool,
  MeasureAreaTool,
  MeasureAngleTool,
  MeasureAzimuthTool,
} from "./MeasureTools";
import { SelectExtentTool } from "./QueryTools";
import { MilitaryTool } from "./MilitarySymbols";
import type { MarkDrawToolType, MeasurePayload } from "../engine/types";

type VectorLayerLike = VectorLayer<VectorSource>;

export interface ToolContext {
  map: OLMap;
  vectorLayer: VectorLayerLike;
  /** 绘制完成的要素，交给 engine 落库 */
  onFeature: (feature: Feature) => void;
  /** 量算结果，只回调数值 */
  onMeasure?: (payload: MeasurePayload) => void;
  /** 注册工具实例到 engine，供统一销毁 */
  setActiveToolInstance: (instance: unknown, destroy: () => void) => void;
}

const MEASURE_TOOLS: Partial<Record<MarkDrawToolType, new (o: never) => BaseTool>> = {
  MEASUREDISTANCE: MeasureDistanceTool,
  MEASUREANGLE: MeasureAngleTool,
  MEASUREPOLYGON: MeasureAreaTool,
  AZIMUTH: MeasureAzimuthTool,
} as never;

/** 创建 MarkDraw 工具实例；未注册的 tool 视为实现缺失。 */
export const createTool = (type: MarkDrawToolType, ctx: ToolContext): BaseTool => {
  const base = {
    map: ctx.map,
    vectorLayer: ctx.vectorLayer,
    type,
    cb: ctx.onFeature,
  } as ConstructorParameters<typeof BaseTool>[0];

  let instance: BaseTool;
  switch (type) {
    case "Point":
      instance = new PointTool(base);
      break;
    case "LineString":
    case "Polygon":
    case "Circle":
    case "Rect":
      instance = new DrawTool(base);
      break;
    case "MEASURELENGTH":
      instance = new SelectExtentTool(base);
      break;
    case "MILITARY_ARROW":
    case "MILITARY_DOUBLE_LINE":
    case "MILITARY_CURVE":
    case "MILITARY_CLUSTER_ARROW":
    case "MILITARY_TACTIC":
      instance = new MilitaryTool(base);
      break;
    default: {
      const MeasureCtor = MEASURE_TOOLS[type];
      if (!MeasureCtor) throw new Error(`[MarkDraw] 工具 ${type} 未实现`);
      instance = new MeasureCtor({ ...base, onMeasure: ctx.onMeasure } as never);
    }
  }

  instance.init();
  ctx.setActiveToolInstance(instance, () => instance.destroy());
  return instance;
};

export { isMilitaryTool } from "./MilitarySymbols";
export * from "./MilitarySymbols";
export { BaseTool } from "./BaseTool";
export type { MeasurePayload } from "../engine/types";
