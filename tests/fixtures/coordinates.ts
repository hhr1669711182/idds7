/**
 * 测试夹具：坐标与图层样例。
 *
 * 约定：
 * - 业务对外统一 WGS84 [lng, lat]；GCJ02 样例仅用于「入站转换」断言；
 * - 需要告警 / 站点样例时优先在此造，勿在用例里散落魔法数。
 */

/** 深圳南山区，代表项目主战区 */
export const SZ_NANSHAN_WGS84 = [113.93, 22.53] as const
export const SZ_NANSHAN_GCJ02 = [113.935673, 22.535098] as const

/** 北京天安门（遗留 transform 用例的历史样例） */
export const BJ_WGS84 = [116.397128, 39.916527] as const
export const BJ_GCJ02 = [116.40337249402477, 39.91793074924595] as const

/** 纽约（境外，不参与 GCJ02 偏移） */
export const NY_WGS84 = [-73.9857, 40.7484] as const

/** 往返误差容差（度）：1e-5 ≈ 1m，属国测局简化算法固有精度 */
export const ROUND_TRIP_TOLERANCE = 1e-5

/** 缺陷阈值：超过 1e-3（≈100m）即视为坐标系用错 */
export const COORDINATE_DEFECT_THRESHOLD = 1e-3
