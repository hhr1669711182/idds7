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
  /** 坐标数组：Point/LineString 为 number[][]，Polygon/MultiPolygon 层级更深 */
  geometry3857: CoordArray;
  geometryLngLat: CoordArray;
  properties: Record<string, unknown>;
  layerId: string;
  groupId: string;
  isDirty?: boolean;
}

/** 任意嵌套的坐标数组（Point / LineString / Polygon / MultiPolygon） */
export type CoordArray = number[] | number[][] | number[][][];


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

/** 历史栈（撤销 / 重做）可用性快照 */
export interface MarkDrawHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
  size: number;
}

/** 右键菜单请求：引擎命中要素后交给视图层渲染 */
export interface MarkDrawContextMenuPayload {
  featureId: string | number;
  /** 视口坐标（px），菜单按此定位 */
  x: number;
  y: number;
  layerId: string;
  /** 该要素是否属于可写图层（决定菜单里是否给出落库动作） */
  writable: boolean;
  history: MarkDrawHistoryState;
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
  /** 撤销 / 重做后要素状态发生变化（视图据此刷新表单与高亮） */
  "history:change": [MarkDrawHistoryState];
  /** 图上要素右键：请视图弹出操作菜单 */
  "contextmenu:open": [MarkDrawContextMenuPayload];
  "destroy": [];
};

export type MarkDrawEventName = keyof MarkDrawEventMap;
