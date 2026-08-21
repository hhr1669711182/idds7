// 基本类型
export const BASE_TYPES = {
  MOVE: "MOVE", // 移动
} as const;

export const DRAW_TYPES = {
  POINT: "Point",
  LINESTRING: "LineString",
  POLYGON: "Polygon",
  CIRCLE: "Circle",
  RECT: "Rect",
  MEASUREDISTANCE: "MEASUREDISTANCE",
  MEASUREANGLE: "MEASUREANGLE",
  MEASUREPOLYGON: "MEASUREPOLYGON",
  AZIMUTH: "azimuth",
  MEASUREAREA: "MEASUREAREA",
  MEASURELENGTH: "MEASURELENGTH",
}; // 绘制类型

export const TYPES = {
  ...BASE_TYPES,
  ...DRAW_TYPES,
  RESET: "RESET", // 重置
  TRAFFIC: "TRAFFIC", //实时路况
  PATHPLAN: "PATHPLAN", //路径规划
  TOPICTYPES: "TOPICTYPES", //专题图
  BASESOURCE: "BASESOURCE", //基础图层
};

//专题图类型
export const THEMATIC_MAP_TYPES = {
  NULL: "NULL",
  CLUSTERL: "CLUSTER", //聚合图层
  HEATMAP: "HEATMAP", //热力图
  MASK_MAP: "MASKMAP", //遮罩
  WEATHER_MAP: "WEATHER_MAP", //天气图
  TIME_MAP: "TIME_MAP", //时间图
  HIGHLIGHT_VECTOR_MAP: "HIGHLIGHT_VECTOR_MAP", //高亮矢量图
};

//卡片标题
export const CARD_TITLE = {
  Point: "标点",
  LineString: "标线",
  Polygon: "标面",
  Circle: "画圆",
  Rect: "画矩形",
} as const;

// 标线 线条样式
export const LINE_FORM_LINE_STYLES = [
  {
    value: "line_1",
    position: [-0, -3],
    height: 4,
    color: "#f00",
    width: 2,
  },
  {
    value: "line_2",
    position: [-0, -15],
    height: 4,
    color: "#f00",
    with: 2,
  },
  {
    value: "line_3",
    position: [-0, -24],
    height: 8,
    color: "#25C2F2",
    width: 8,
  },
  {
    value: "line_4",
    position: [-0, -36],
    height: 8,
    color: "#555",
    width: 4,
  },
  {
    value: "line_5",
    position: [-0, -48],
    height: 8,
    color: "#014FA1",
    width: 8,
  },
  {
    value: "line_6",
    position: [-0, -60],
    height: 8,
    color: "#5BBAD3",
    width: 8,
  },
  {
    value: "line_7",
    position: [-0, -72],
    height: 8,
    color: "#B08569",
    width: 8,
  },
  {
    value: "line_8",
    position: [-0, -84],
    height: 8,
    color: "#999",
    width: 8,
  },
];
export const INIT_LINE_STATE = {
  name: "未命名",
  mark: "",
  lineStyle: "line_1",
  color: "#ff0000",
  width: 2,
};

export const INIT_PLOYGON_STATE = {
  name: "未命名",
  mark: "",
  color: "#ff0000",
  width: 2,
  opacity: 30,
};

export const INIT_CIRCLE_STATE = {
  name: "未命名",
  mark: "",
  color: "#ff0000",
  width: 2,
  opacity: 30,
};

//比例尺单位
export const SCALEPLATE_LIST = [
  {
    t: "度",
    v: "degrees",
  },
  {
    t: "英制英尺",
    v: "imperial",
  },
  {
    t: "美制英尺",
    v: "us",
  },
  {
    t: "海里",
    v: "nautical",
  },
  {
    t: "公制",
    v: "metric",
  },
];
