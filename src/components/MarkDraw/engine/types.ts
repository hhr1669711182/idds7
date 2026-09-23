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
  | "MEASUREAREA"
  | "POPULATION"
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

export interface CircleQueryPayload {
  centerLngLat: [number, number];
  radiusMeters: number;
  layer: MarkDrawLayer | null;
  total: number;
  perLayer: Record<string, number>;
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

export type MarkDrawEventMap = {
  "feature:added": [MarkDrawFeature];
  "feature:updated": [MarkDrawFeature];
  "feature:removed": [MarkDrawFeature];
  "selection:change": [MarkDrawFeature | null];
  "feature:modified": [MarkDrawFeature];
  "tool:change": [MarkDrawToolType | null];
  "view:selected": [MarkDrawLayer];
  "view:loaded": [{ layer: MarkDrawLayer; count: number }];
  "view:error": [{ layer: MarkDrawLayer; error: Error }];
  "circle-query:result": [CircleQueryPayload];
  "destroy": [];
};

export type MarkDrawEventName = keyof MarkDrawEventMap;
