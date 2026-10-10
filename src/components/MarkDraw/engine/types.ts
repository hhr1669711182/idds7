/**
 * MarkDraw 公共类型定义
 */
import type { StyleLike } from "ol/style/Style";

export type MarkDrawToolType =
  | "Point"
  | "LineString"
  | "Polygon"
  | "Circle"
  | "Rect"
  | "MEASUREDISTANCE"
  | "MEASUREANGLE"
  | "MEASUREPOLYGON"
  | "AZIMUTH"
  | "MEASURELENGTH"
  | "MILITARY_ARROW"
  | "MILITARY_DOUBLE_LINE"
  | "MILITARY_CURVE"
  | "MILITARY_CLUSTER_ARROW"
  | "MILITARY_TACTIC";

export interface MarkDrawGroup {
  groupId: string;
  groupName: string;
  groupOrder: number;
}

export interface MarkDrawLayer extends MarkDrawGroup {
  id: string;
  name: string;
  workspace: string;
  typeName: string;
  icon?: string;
  writable?: boolean;
  displayFields?: string[];
}

export interface MarkDrawFeature {
  feature: unknown;
  id: string | number;
  geometry3857: number[][] | number[][][];
  geometryLngLat: number[][] | number[][][];
  properties: Record<string, unknown>;
  layerId: string;
  groupId: string;
  isDirty?: boolean;
}


export interface StyleJson {
  stroke?: { color: string; width: number; lineDash?: number[] };
  fill?: { color: string };
  image?: {
    kind: "circle" | "icon";
    radius?: number;
    fill?: string;
    stroke?: string;
    src?: string;
    anchor?: [number, number];
    scale?: number;
    rotation?: number;
  };
  text?: {
    text: string;
    font?: string;
    fill?: string;
    stroke?: string;
    offsetY?: number;
  };
}

export interface MarkDrawEngineOptions {
  selectEnabled?: boolean;
  defaultStyle?: Partial<Record<MarkDrawToolType, StyleLike>>;
  maxFeatures?: number;
  onToolChange?: (tool: MarkDrawToolType | null) => void;
}

/** 工具归属：绘制类落库，量算类只回结果，查询类只出统计 */
export type MarkDrawToolKind = "draw" | "measure" | "query";

/** 量算结果（不落库，仅面板展示） */
export interface MeasurePayload {
  /** 格式化后的主结果文案，如 "1.2 km" */
  text: string;
  /** 数值型结果（米 / 平方米 / 度） */
  value: number;
  /** 量算类型 */
  kind: "distance" | "area" | "angle" | "azimuth";
}

export type MarkDrawEventMap = {
  "feature:added": [MarkDrawFeature];
  "feature:updated": [MarkDrawFeature];
  "feature:removed": [MarkDrawFeature];
  "selection:change": [MarkDrawFeature | null];
  "feature:modified": [MarkDrawFeature];
  "tool:change": [MarkDrawToolType | null];
  "measure:result": [MeasurePayload];
  "view:selected": [MarkDrawLayer];
  "view:loaded": [{ layer: MarkDrawLayer; count: number }];
  "view:error": [{ layer: MarkDrawLayer; error: Error }];
  "destroy": [];
};

export type MarkDrawEventName = keyof MarkDrawEventMap;
