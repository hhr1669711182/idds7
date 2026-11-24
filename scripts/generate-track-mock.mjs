#!/usr/bin/env node
/**
 * 调用高德代理接口，为指定 region 生成真实道路轨迹 mock 数据。
 *
 * 用法：
 *   pnpm generate:track-mock                       # 生成全部三个 region
 *   pnpm generate:track-mock --region shenzhen     # 只生成深圳
 *
 * 输出：
 *   server/mock-data/track-<region>.json
 *
 * 数据结构（每条路线）：
 * {
 *   "region": "shenzhen",
 *   "generatedAt": "2026-11-24T08:00:00.000Z",
 *   "source": "amap-proxy",
 *   "proxyBase": "http://...",
 *   "routes": [
 *     {
 *       "vehicleIndex": 0,
 *       "vehicleId": "TEST-CAR-001",
 *       "plateNumber": "粤B·12345",
 *       "stationId": "...",
 *       "stationName": "...",
 *       "startTime": "2026-11-24 08:30:00",
 *       "endTime": "2026-11-24 09:00:00",
 *       "totalDistance": "5230",
 *       "totalTime": "780",
 *       "points": [
 *         { "lng": 113.95, "lat": 22.54, "gpsTime": "2026-11-24 08:30:05", "speedMps": 5.2 },
 *         ...
 *       ]
 *     }
 *   ]
 * }
 *
 * 说明：
 * - 高德 driving 接口返回 TMC 路段信息（tmcs[]），据此模拟各点速度。
 * - 若代理不可达或接口返回空，该车辆自动跳过（不写入 routes），运行时 mock-data.js
 *   回退到合成轨迹（确定性伪随机 + PAST 时间戳 + 模拟速度段）。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)

/* ---------- 配置 ---------- */

const REGION_KEYS = ['shenzhen', 'beijing', 'guizhou']

/**
 * 各 region 的近似 station 坐标（用于 Amap driving 起点）。
 * mock-data REGIONS 中的 stations 没有坐标字段（由前端 resolveStationCoordinates 解析），
 * 此处用 city center ± 偏移量近似，保证 Amap 返回合理城市道路路径。
 */
const STATION_ORIGINS = {
  shenzhen: [[113.94, 22.555], [113.92, 22.545]],
  beijing:  [[116.42, 39.91],  [116.39, 39.89]],
  guizhou:  [[106.64, 26.65],  [106.61, 26.63]],
}

/**
 * TMC 拥堵状态 → 参考速度（m/s）
 * 高德代理返回 status 为中文文本：畅通 / 缓行 / 拥堵 / 严重拥堵
 */
const TMC_SPEED = {
  '未知': 10,
  '畅通': 18,
  '缓行': 8,
  '拥堵': 4,
  '严重拥堵': 2,
}

/* ---------- 工具函数 ---------- */

/** 从 .env 文件读取指定环境变量（不依赖 dotenv） */
function readEnvVar(name, envFiles = ['.env.development', '.env.test', '.env.production']) {
  for (const envFile of envFiles) {
    const filePath = path.join(rootDir, envFile)
    if (!fs.existsSync(filePath)) continue
    const content = fs.readFileSync(filePath, 'utf8')
    const match = content.match(new RegExp(`^${name}=(.+)$`, 'm'))
    if (match) return match[1].trim()
  }
  return null
}

/** 调用 Amap 代理 driving 接口，返回 RouteResult（解包 COLA 信封后） */
async function fetchDrivingRoute(proxyBase, origin, destination) {
  const params = new URLSearchParams({
    origin,
    destination,
    extensions: 'all',
  })
  const url = `${proxyBase}/api/amap/route/driving?${params}`
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  // COLA 信封解包（与 src/apis/amap.ts 一致）
  const data = json.data
  if (!data) throw new Error('空响应（data 字段缺失）')
  return Array.isArray(data) ? data[0] : data
}

/**
 * 从 Amap driving 响应（GeoJSON FeatureCollection）生成轨迹点序列。
 * 拼接所有 feature 的 LineString 坐标，按 feature 内 tmcs 分配速度。
 * @param {object} fc GeoJSON FeatureCollection（含 features, totalTime, totalDistance）
 * @param {number} startMs 起点 Unix 毫秒时间戳
 * @returns {{ points: Array<{lng,lat,gpsTime,speedMps}>, startTime, endTime, totalDistance, totalTime } | null}
 */
function generatePointsFromRoute(fc, startMs) {
  const features = fc?.features || []
  if (!features.length) return null

  // 拼接所有 feature 的坐标
  const allCoords = []
  const allTmcs = []
  for (const feature of features) {
    const coords = feature.geometry?.coordinates || []
    if (coords.length < 2) continue
    allCoords.push(...coords)
    const tmcs = feature.properties?.tmcs || []
    allTmcs.push(...tmcs)
  }
  if (allCoords.length < 2) return null

  const pointCount = allCoords.length
  const totalTimeMs = (Number(fc.totalTime) || 1800) * 1000
  const timePerPoint = totalTimeMs / Math.max(pointCount - 1, 1)
  const points = []

  for (let i = 0; i < pointCount; i++) {
    const lng = Number(allCoords[i][0].toFixed(7))
    const lat = Number(allCoords[i][1].toFixed(7))
    const gpsTime = new Date(startMs + i * timePerPoint).toISOString().slice(0, 19).replace('T', ' ')

    // 按 TMC 路段比例找到对应状态，分配速度
    let speedMps = TMC_SPEED['未知'] ?? 10
    if (allTmcs.length) {
      // 按距离比例定位 TMC 段
      const cumDist = tmcCumulativeDistance(allTmcs)
      const totalDist = cumDist[cumDist.length - 1] || 1
      const pointRatio = i / (pointCount - 1)
      const targetDist = pointRatio * totalDist
      let tmcIdx = 0
      for (let t = 0; t < cumDist.length; t++) {
        if (targetDist <= cumDist[t]) { tmcIdx = t; break }
        tmcIdx = t
      }
      const status = allTmcs[tmcIdx]?.status
      speedMps = TMC_SPEED[status] ?? 10
      // 加入轻微抖动（模拟 GPS 采样噪声）
      speedMps = Math.max(1, Math.round((speedMps + Math.sin(i * 0.7) * 2) * 10) / 10)
    }
    points.push({ lng, lat, gpsTime, speedMps })
  }

  return {
    points,
    startTime: points[0].gpsTime,
    endTime: points[points.length - 1].gpsTime,
    totalDistance: fc.totalDistance,
    totalTime: fc.totalTime,
  }
}

/** 计算 TMC 段的累计距离数组 */
function tmcCumulativeDistance(tmcs) {
  const result = []
  let cum = 0
  for (const t of tmcs) {
    cum += Number(t.distance) || 0
    result.push(cum)
  }
  return result
}

/* ---------- 主流程 ---------- */

async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2)
  const regionArg = args.find((a, i) => args[i - 1] === '--region')
  const targetRegions = regionArg ? [regionArg] : REGION_KEYS

  // 读取代理地址（优先环境变量，其次 .env 文件）
  const proxyBase = process.env.VITE_MAP_PROXY_API || readEnvVar('VITE_MAP_PROXY_API')
  if (!proxyBase) {
    console.error('❌ 未找到 VITE_MAP_PROXY_API，请确认 .env.development 中已配置或设置环境变量')
    process.exit(1)
  }

  // 读取 mock-data REGIONS
  const mockDataPath = path.join(rootDir, 'server', 'mock-data.js')
  const { REGIONS } = require(mockDataPath)

  const outputDir = path.join(rootDir, 'server', 'mock-data')
  fs.mkdirSync(outputDir, { recursive: true })

  for (const regionKey of targetRegions) {
    const region = REGIONS[regionKey]
    if (!region) {
      console.error(`❌ 未知 region: ${regionKey}`)
      continue
    }

    console.log(`\n=== 生成 ${regionKey}（${region.name}）轨迹 ===`)
    const origins = STATION_ORIGINS[regionKey] || []
    const dest = region.sampleAddressLngLat.join(',')

    // 起点时间：~25 分钟前（接警后 5min 出动）
    const startMs = Date.now() - 25 * 60 * 1000

    const routes = []
    for (let i = 0; i < region.vehicles.length; i++) {
      const vehicle = region.vehicles[i]
      const station = region.stations.find((s) => s.id === vehicle.stationId) || region.stations[0]
      const origin = origins[i] ? origins[i].join(',') : null
      if (!origin) {
        console.warn(`  ⚠️ 车辆 ${i + 1}（${vehicle.plateNo}）无对应 station origin，跳过`)
        continue
      }

      console.log(`  车辆 ${i + 1}: ${vehicle.plateNo}（${station.name}）→ 警情地点`)

      try {
        const route = await fetchDrivingRoute(proxyBase, origin, dest)
        const result = generatePointsFromRoute(route, startMs + i * 2 * 60 * 1000)
        if (!result?.points?.length) {
          console.warn('  ⚠️ 无有效轨迹点，跳过')
          continue
        }
        routes.push({
          vehicleIndex: i,
          vehicleId: vehicle.vehicleId,
          plateNumber: vehicle.plateNo,
          stationId: vehicle.stationId,
          stationName: vehicle.stationName,
          startTime: result.startTime,
          endTime: result.endTime,
          totalDistance: result.totalDistance,
          totalTime: result.totalTime,
          points: result.points,
        })
        console.log(
          `  ✅ ${result.points.length} 点，距离 ${result.totalDistance} m，耗时 ${result.totalTime}s`,
        )
      } catch (err) {
        console.warn(`  ⚠️ Amap 调用失败: ${err.message}（该车辆回退合成轨迹）`)
      }
    }

    // 保存 JSON
    const outputFile = path.join(outputDir, `track-${regionKey}.json`)
    fs.writeFileSync(
      outputFile,
      JSON.stringify({ region: regionKey, generatedAt: new Date().toISOString(), source: 'amap-proxy', proxyBase, routes }, null, 2),
    )
    const relPath = path.relative(rootDir, outputFile)
    console.log(`  💾 已保存: ${relPath}（${routes.length} 条路线）`)
  }
}

main().catch((err) => {
  console.error('❌ 生成失败:', err)
  process.exit(1)
})
