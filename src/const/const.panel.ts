export const PANEL_TYPES = {
  NULL: "NULL",
  ROUTE_PLAN: "ROUTE_PLAN",
};

export const PANEL_MAP_TYPE = {
  NULL: "NULL",
  VECTOR_LAYER: "VECTOR_LAYER",
  ANIMATION_LAYER: "ANIMATION_LAYER",
};

export const PANEL_MAP_LIST = [
  { type: "VECTOR_LAYER", txt: "高亮矢量图" },
  { type: "ANIMATION_LAYER", txt: "地图动画" },
  { type: "SPATIAL_ANALYSIS ", txt: "空间分析" },
];

export const SPATIAL_ANALYSIS_TYPES = [
  {
    txt: "并集",
    type: "Union",
  },
  {
    txt: "交集",
    type: "intersection",
  },
  {
    txt: "差集",
    type: "difference",
  },
];
