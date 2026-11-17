/**
 * 车辆渲染平滑工具：路线样条加密 + GPS 坐标 EMA 低通滤波。
 *
 * 模拟跟踪：Catmull-Rom 插值把高德稀疏关键点（~200-500m 间距）加密为
 * 每 ~stepMeters 一个中间点，车辆沿平滑曲线行驶，弯道不再走弦线。
 *
 * 实时 GPS：对 WGS84 经纬度做指数移动平均（EMA），消除 3-10m 随机噪声
 * 导致的左右抖动；静止门控避免低速/停车时滤波产生额外滞后。
 *
 * 纯函数工具，无 Worker、无 store/WS 依赖，可直接在 rAF 回调中同步调用。
 */

/** Catmull-Rom 样条子分段：将 [x,y][] 关键点加密为每 stepMeters 插入一个中间点。 */
export const catmullRomSubdivide = (coords: number[][], stepMeters = 20): number[][] => {
  const n = coords.length
  if (n < 3) return coords

  const result: number[][] = [coords[0]]
  // 补首尾各一个虚拟控制点
  const pts: number[][] = [
    [2 * coords[0][0] - coords[1][0], 2 * coords[0][1] - coords[1][1]],
    ...coords,
    [2 * coords[n - 1][0] - coords[n - 2][0], 2 * coords[n - 1][1] - coords[n - 2][1]],
  ]

  for (let i = 0; i < n - 1; i += 1) {
    const p0 = pts[i]
    const p1 = pts[i + 1]
    const p2 = pts[i + 2]
    const p3 = pts[i + 3]
    // 估算段长（墨卡托投影下平面距离近似）
    const segLen = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    const steps = Math.max(1, Math.round(segLen / stepMeters))
    for (let t = 0; t < steps; t += 1) {
      const s = t / steps
      const s2 = s * s
      const s3 = s2 * s
      // Catmull-Rom 基函数
      const x =
        0.5 *
        (2 * p1[0] +
          (-p0[0] + p2[0]) * s +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * s2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * s3)
      const y =
        0.5 *
        (2 * p1[1] +
          (-p0[1] + p2[1]) * s +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * s2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * s3)
      result.push([x, y])
    }
  }
  result.push(coords[n - 1])
  return result
}

/** EMA 滤波器：对 WGS84 [lng, lat] 做指数移动平均。 */
export class EmaFilter {
  private smoothed: [number, number] | null = null

  constructor(private readonly alpha = 0.3) {}

  /** 更新一次，返回平滑后的 [lng, lat]。首帧直接返回原始值。 */
  update(raw: [number, number]): [number, number] {
    if (!this.smoothed) {
      this.smoothed = [raw[0], raw[1]]
      return [...this.smoothed]
    }
    this.smoothed = [
      this.alpha * raw[0] + (1 - this.alpha) * this.smoothed[0],
      this.alpha * raw[1] + (1 - this.alpha) * this.smoothed[1],
    ]
    return [...this.smoothed]
  }

  /** 重置滤波器状态（换车/路线重置时调用）。 */
  reset(): void {
    this.smoothed = null
  }
}

/**
 * 静止门控：两帧位移 < thresholdMeters 时返回 true，调用方应跳过 EMA 直接落位。
 * thresholdMeters 默认 2m，覆盖 GPS 静态漂移。
 */
export const isStaticMovement = (prev: [number, number] | null, curr: [number, number], thresholdMeters = 2): boolean => {
  if (!prev) return true
  // WGS84 近似：1° lng ≈ 111_320m，1° lat ≈ 110_574m（中纬度）
  const dLng = (curr[0] - prev[0]) * 111_320
  const dLat = (curr[1] - prev[1]) * 110_574
  return Math.hypot(dLng, dLat) < thresholdMeters
}
