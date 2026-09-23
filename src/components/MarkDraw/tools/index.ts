/**
 * 工具集入口：根据 MarkDrawToolType 返回对应工具实例。
 * engine 只需调用 createTool(type, ctx) 即可启动/销毁工具。
 */
import type { Map as OLMap } from "ol";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type Feature from "ol/Feature";

import { BaseTool } from "./BaseTool";
import { DrawTool } from "./DrawTool";
import { PointTool } from "./PointTool";
import { MeasureDistanceTool } from "./MeasureDistanceTool";
import { MeasureAngleTool } from "./MeasureAngleTool";
import { MeasureAreaTool } from "./MeasureAreaTool";
import { AzimuthTool } from "./AzimuthTool";
import { SelectExtentTool } from "./SelectExtentTool";
import { CircleQueryTool } from "./CircleQueryTool";
import { PopulationTool } from "./PopulationTool";
import { MilitaryTool, isMilitaryTool } from "./MilitarySymbols";
import type { MarkDrawToolType } from "../engine/types";

export interface ToolContext {
  map: OLMap;
  vectorLayer: VectorLayer<VectorSource>;
  onFeature: (feature: Feature) => void;
  setActiveToolInstance: (instance: unknown, destroy: () => void) => void;
}

export const createTool = (type: MarkDrawToolType, ctx: ToolContext) => {
  const opts = {
    map: ctx.map,
    vectorLayer: ctx.vectorLayer,
    type,
    cb: ctx.onFeature,
  };
  let instance: BaseTool;
  switch (type) {
    case "Point":
      instance = new PointTool(opts);
      break;
    case "LineString":
    case "Polygon":
    case "Circle":
    case "Rect":
      instance = new DrawTool(opts);
      break;
    case "MEASUREDISTANCE":
      instance = new MeasureDistanceTool(opts);
      break;
    case "MEASUREANGLE":
      instance = new MeasureAngleTool(opts);
      break;
    case "MEASUREPOLYGON":
      instance = new MeasureAreaTool(opts);
      break;
    case "AZIMUTH":
      instance = new AzimuthTool(opts);
      break;
    case "MEASURELENGTH":
      instance = new SelectExtentTool(opts);
      break;
    case "MEASUREAREA":
      instance = new CircleQueryTool(opts);
      break;
    case "POPULATION":
      instance = new PopulationTool(opts);
      break;
    default:
      if (isMilitaryTool(type)) {
        instance = new MilitaryTool(opts);
        break;
      }
      throw new Error(`[MarkDraw] unknown tool: ${type}`);
  }
  instance.init();
  ctx.setActiveToolInstance(instance, () => instance.destroy());
  return instance;
};

export { isMilitaryTool };
export * from "./MilitarySymbols";
