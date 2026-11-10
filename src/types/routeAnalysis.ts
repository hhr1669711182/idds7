// 用途：路径规划分析契约（跨 4 类路径入口的统一数据形态）。
// 见 herness/02-技术设计/前端/GIS-W46-路径分析与GeoServer加固-技术方案.md §5.4

/**
 * 路况等级。
 * unknown 单独成列，不并入畅通 —— 缺失路段并入畅通会高估畅通占比。
 */
export type RouteTmcLevel = 'unknown' | 'smooth' | 'slow' | 'jam' | 'serious_jam'

/** 单段路况（坐标为 WGS84 [lng, lat]）。 */
export interface RouteTmcSegmentAnalysis {
  /** 路况等级 */
  level: RouteTmcLevel
  /** 该段坐标序列 */
  polyline: [number, number][]
  /** 该段长度（米） */
  distanceMeters: number
}

/** 路况指标汇总。 */
export interface RouteTmcMetrics {
  /** 畅通段长度占比（0~1） */
  smoothRatio: number
  /** 缓行段长度占比（0~1） */
  slowRatio: number
  /** 拥堵段长度占比（0~1，含严重拥堵） */
  jamRatio: number
  /** 未知段长度占比（0~1） */
  unknownRatio: number
  /** 路况覆盖度：有路况数据的路段占全路比例（0~1） */
  coverage: number
  /** 拥堵段总长度（米） */
  jamDistanceMeters: number
  /** 拥堵段通行时长估算（秒）；按全路均速折算 */
  jamDurationSeconds: number
  /** 全路总长度（米） */
  totalDistanceMeters: number
}

/**
 * 路径分析结果。
 * 4 类路径入口（查询 / 调派 / 跟踪 / 历史轨迹）统一产出此结构，
 * 分析功能只读此结构，不各自解析原始 polyline。
 */
export interface RouteAnalysisDTO {
  /** 路线总长度（米） */
  distanceMeters: number
  /** 路线总时长（秒） */
  durationSeconds: number
  /** 路况指标 */
  tmc: RouteTmcMetrics
  /** 候选方案序（0 为首选）；非候选路线传 null */
  candidateRank: number | null
  /** 分段明细 */
  segments: RouteTmcSegmentAnalysis[]
  /** 路线坐标序列（WGS84） */
  path: [number, number][]
}

/** 候选方案对比条目。 */
export interface RouteCandidateComparison {
  /** 方案标识（调用方给定，如 'fastest' / 'alternative-1'） */
  id: string
  /** 方案名（展示用） */
  label: string
  /** 距离（米） */
  distanceMeters: number
  /** 时长（秒） */
  durationSeconds: number
  /** 拥堵占比（0~1） */
  jamRatio: number
  /** 是否为最优标尺方案 */
  recommended: boolean
}

/** 转向指引的一步。 */
export interface RouteStepInstruction {
  /** 高德原文（如「沿沙河东路向南行驶456米左转调头」） */
  partDesc: string
  /** 道路名；高德未返回时为空 */
  roadName: string
  /** 该步长度（米） */
  distanceMeters: number
  /** 转向类型，供箭头图标选择 */
  turn: 'straight' | 'left' | 'right' | 'slight_left' | 'slight_right' | 'uturn' | 'arrive'
  /** 该路段几何（WGS84）；点击指引时定位到此处 */
  coords: [number, number][]
}

/** 档位键：时间最短 / 距离最短 / 躲避拥堵 / 综合最优。 */
export type RouteOptionTier = 'fastest' | 'shortest' | 'avoidJam' | 'balanced'

/** 单个候选方案的视图模型。 */
export interface RoutePlanOption {
  /** 方案标识 */
  id: string
  /** 方案序号（0 起） */
  index: number
  /** 路线坐标（WGS84） */
  coords: [number, number][]
  /** 路况分段 */
  tmcs: { status: string | number; polyline: [number, number][] }[]
  /** 总距离（米） */
  distanceMeters: number
  /** 总时长（秒） */
  durationSeconds: number
  /** 红绿灯数量 */
  trafficLights: number
  /** 转向指引列表 */
  steps: RouteStepInstruction[]
  /** 畅通率（0~1，分母为有路况数据的路段长度） */
  smoothRatio: number
  /** 缓行占比（0~1） */
  slowRatio: number
  /** 拥堵占比（0~1） */
  jamRatio: number
  /** 路况覆盖度（0~1） */
  coverage: number
  /** 命中的全部档位；实测常见同一方案命中多档 */
  tiers: RouteOptionTier[]
  /** 主档位（按优先级取首个） */
  primaryTier: RouteOptionTier
  /** 主档位文案 */
  primaryLabel: string
}
