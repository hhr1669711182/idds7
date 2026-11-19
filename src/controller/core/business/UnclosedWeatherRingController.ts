// 用途：未结案警情 2km 天气圈控制器。
// 对每个未结案警情画 2km 蓝色虚线圈，并在圈旁展示天气 overlay。
// 5km 距离内的多个警情聚合为一个簇，共享一个圈和一个 overlay。
// adcode 通过 gis:env_area_weather WFS 反查获取，按 addrlevel 逻辑决定查询入参。
// 不依赖 BusinessMapPort，直接挂载 OLMap（与 IncidentVideoOverlayController 同模式）。

import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Overlay from 'ol/Overlay'
import { fromLonLat } from 'ol/proj'
import { Circle } from 'ol/geom'
import Feature from 'ol/Feature'
import { Style, Stroke, Fill } from 'ol/style'
import { unlistenByKey } from 'ol/events'
import type { EventsKey } from 'ol/events'
import type OlMap from 'ol/Map'
import type { WeatherRingAlarm } from '../protocol/WeatherRingProtocol'
import { fetchAreaWeatherByPoint, type AreaWeatherMatch } from '@/apis/envArea'
import { loadWeather, type WeatherLive } from '@/apis/weather'
import { cssVar, withAlpha } from '@/utils/themeColor'
import { appEnv } from '@/config/env'

const CIRCLE_RADIUS_M = 2000
const CLUSTER_THRESHOLD_KM = 5
const MAX_CONCURRENT = 6
const CIRCLE_Z_INDEX = 54
const MIN_ZOOM = 12

/** 天气描述 → emoji 图标映射 */
const weatherWeatherIcon = (desc: string): string => {
  if (!desc) return '🌤️'
  if (desc.includes('晴')) return '☀️'
  if (desc.includes('多云')) return '🌤️'
  if (desc.includes('阴')) return '☁️'
  if (desc.includes('雨')) return '🌧️'
  if (desc.includes('雪')) return '🌨️'
  if (desc.includes('雷')) return '⛈️'
  if (desc.includes('雾') || desc.includes('霾')) return '🌫️'
  return '🌤️'
}

/**
 * 根据 WFS 反查结果决定天气查询 adcode：
 * - addrlevel_id < 4（省/市/区县）：直接用 area_id
 * - addrlevel_id = 4（街道）：取 parent_code 上溯到区县级
 * - addrlevel_id > 4 或查无结果：使用环境默认 adcode（appEnv.mapAdcode）
 */
const resolveWeatherAdcode = (match: AreaWeatherMatch | null): string => {
  if (!match) return appEnv.mapAdcode
  if (match.addrlevelId > 4) return appEnv.mapAdcode
  if (match.addrlevelId === 4) return match.parentCode || appEnv.mapAdcode
  return match.areaId || appEnv.mapAdcode
}

// Haversine 距离（km），用于 5km 聚合判断
const haversineKm = (lng1: number, lat1: number, lng2: number, lat2: number): number => {
  const R = 6371
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// 贪心聚类：以簇首点为中心，距离 ≤ 5km 的警情归入同簇
interface RingCluster {
  repLng: number
  repLat: number
  alarms: WeatherRingAlarm[]
}

const clusterAlarms = (alarms: WeatherRingAlarm[]): RingCluster[] => {
  const clusters: RingCluster[] = []
  for (const alarm of alarms) {
    const existing = clusters.find(
      (c) => haversineKm(c.repLng, c.repLat, alarm.lng, alarm.lat) <= CLUSTER_THRESHOLD_KM,
    )
    if (existing) {
      existing.alarms.push(alarm)
    } else {
      clusters.push({ repLng: alarm.lng, repLat: alarm.lat, alarms: [alarm] })
    }
  }
  return clusters
}

// 并发限流池：最多 concurrency 个任务同时运行
const mapConcurrent = async <T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> => {
  let index = 0
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const i = index++
        await fn(items[i])
      }
    },
  )
  await Promise.all(workers)
}

export class UnclosedWeatherRingController {
  private readonly map: OlMap
  private readonly ringLayer: VectorLayer<VectorSource>
  private readonly ringSource: VectorSource
  /** 每个簇一组视觉元素（feature + labelOverlay + weatherOverlay） */
  private clusterGroups: Array<{
    feature: Feature
    labelOverlay: Overlay
    weatherOverlay: Overlay | null
  }> = []
  private readonly adcodeCache = new Map<string, string>()
  private readonly weatherCache = new Map<string, WeatherLive | null>()
  private disposed = false
  private showSeq = 0
  private zoomUnlistener: EventsKey | null = null

  constructor(map: OlMap) {
    this.map = map
    this.ringSource = new VectorSource()
    this.ringLayer = new VectorLayer({
      source: this.ringSource,
      zIndex: CIRCLE_Z_INDEX,
      visible: false,
    })
    map.addLayer(this.ringLayer)

    // 缩放 < MIN_ZOOM 时隐藏所有圈和 overlay，>= MIN_ZOOM 恢复
    const view = map.getView()
    this.zoomUnlistener = view.on('change:resolution', () => {
      this.onZoomChange()
    })
    // 初始化时也检查一次
    this.onZoomChange()
  }

  private onZoomChange(): void {
    if (this.disposed) return
    this.syncZoomVisibility()
  }

  private syncZoomVisibility(): void {
    const zoom = this.map.getView().getZoom() ?? 0
    const visible = zoom >= MIN_ZOOM
    this.ringLayer.setVisible(visible)
    for (const group of this.clusterGroups) {
      for (const ov of [group.labelOverlay, group.weatherOverlay]) {
        if (ov) {
          const el = ov.getElement()
          if (el) el.style.display = visible ? '' : 'none'
        }
      }
    }
  }

  /**
   * 展示天气圈：5km 聚类 → 查 adcode → 画 2km 圈 → 加载天气 → 挂 overlay。
   * 内部限流 6 并发；showSeq 防旧任务覆盖新结果。
   * @param alarms 当前未结案警情坐标列表（最小字段集）
   */
  public async show(alarms: WeatherRingAlarm[]): Promise<void> {
    const seq = ++this.showSeq
    this.clearVisuals()

    if (!alarms.length) return

    const clusters = clusterAlarms(alarms)

    await mapConcurrent(clusters, MAX_CONCURRENT, async (cluster) => {
      if (this.disposed || seq !== this.showSeq) return

      // 画圈
      const { feature, labelOverlay } = this.addRing(cluster.repLng, cluster.repLat)

      // 查 adcode（gis:env_area_weather WFS，按坐标缓存）
      const cacheKey = `${cluster.repLng.toFixed(4)},${cluster.repLat.toFixed(4)}`
      let adcode = this.adcodeCache.get(cacheKey)
      let areaName = ''
      if (adcode === undefined) {
        const match = await fetchAreaWeatherByPoint(cluster.repLng, cluster.repLat).catch(() => null)
        adcode = resolveWeatherAdcode(match)
        areaName = match?.areaName ?? ''
        this.adcodeCache.set(cacheKey, adcode)
        if (!match) {
          console.warn('[UnclosedWeatherRing] WFS 反查未命中，使用默认 adcode', appEnv.mapAdcode)
        }
      }
      if (this.disposed || seq !== this.showSeq) return
      if (!adcode) return

      // 查天气（按 adcode 缓存，接口自带 10 分钟 TTL）
      let weather = this.weatherCache.get(adcode)
      if (weather === undefined) {
        weather = await loadWeather(adcode).catch(() => null)
        this.weatherCache.set(adcode, weather)
      }
      if (this.disposed || seq !== this.showSeq) return

      // 组装当前簇的视觉组
      let weatherOverlay: Overlay | null = null
      if (weather) {
        weatherOverlay = this.addWeatherOverlay(cluster.repLng, cluster.repLat, weather, areaName, feature, labelOverlay)
      }
      this.clusterGroups.push({ feature, labelOverlay, weatherOverlay })
    })

    // 全部创建完毕后按当前 zoom 同步可见性
    if (seq === this.showSeq) this.syncZoomVisibility()
  }

  /** 隐藏所有天气圈和 overlay（不销毁控制器，可再次 show） */
  public hide(): void {
    this.showSeq++
    this.clearVisuals()
  }

  /** 销毁控制器：移除图层和所有 overlay，释放资源 */
  public destroy(): void {
    this.hide()
    if (this.zoomUnlistener) {
      unlistenByKey(this.zoomUnlistener)
      this.zoomUnlistener = null
    }
    this.disposed = true
    this.map.removeLayer(this.ringLayer)
    this.ringLayer.dispose()
  }

  /** 移除单个簇的所有视觉元素 */
  private closeCluster(group: { feature: Feature; labelOverlay: Overlay; weatherOverlay: Overlay | null }): void {
    this.ringSource.removeFeature(group.feature)
    this.map.removeOverlay(group.labelOverlay)
    if (group.weatherOverlay) this.map.removeOverlay(group.weatherOverlay)
    this.clusterGroups = this.clusterGroups.filter((g) => g !== group)
    if (!this.clusterGroups.length) this.ringLayer.setVisible(false)
  }

  private clearVisuals(): void {
    for (const group of this.clusterGroups) {
      this.ringSource.removeFeature(group.feature)
      this.map.removeOverlay(group.labelOverlay)
      if (group.weatherOverlay) this.map.removeOverlay(group.weatherOverlay)
    }
    this.clusterGroups = []
    this.ringLayer.setVisible(false)
  }

  /** 在指定坐标画一个 2km 蓝色虚线圈 + 顶部 "2km" 标注 */
  private addRing(lng: number, lat: number): { feature: Feature; labelOverlay: Overlay } {
    const center = fromLonLat([lng, lat])
    const feature = new Feature(new Circle(center, CIRCLE_RADIUS_M))

    const accent = cssVar('--accent-cyan', '#25C2F2')
    feature.setStyle(
      new Style({
        stroke: new Stroke({ color: accent, width: 2, lineDash: [6, 4] }),
        fill: new Fill({ color: withAlpha(accent, 0.04) }),
      }),
    )
    this.ringSource.addFeature(feature)

    // 2km 标注：在圈顶部（lat + 2000/111000 度 ≈ 2km）
    const label = document.createElement('div')
    label.textContent = '2km'
    label.style.cssText = [
      'font-size:11px',
      `color:${accent}`,
      'text-shadow:0 1px 3px rgba(0,0,0,0.6)',
      'pointer-events:none',
      'user-select:none',
      'font-weight:600',
      'line-height:1',
      'position:relative',
      'z-index:1',
    ].join(';')

    const labelOverlay = new Overlay({
      element: label,
      positioning: 'bottom-center',
      offset: [0, 4],
      stopEvent: false,
    })
    const topLat = lat + CIRCLE_RADIUS_M / 111000
    labelOverlay.setPosition(fromLonLat([lng, topLat]))
    this.map.addOverlay(labelOverlay)

    return { feature, labelOverlay }
  }

  /** 在指定坐标旁挂天气卡片 overlay（左图标+描述，右数据列表） */
  private addWeatherOverlay(
    lng: number,
    lat: number,
    weather: WeatherLive,
    areaName: string,
    feature: Feature,
    labelOverlay: Overlay,
  ): Overlay {
    const el = document.createElement('div')
    const accent = cssVar('--accent-cyan', '#25C2F2')
    let overlayRef: Overlay | null = null

    // 外层卡片
    el.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'min-width:220px',
      'background:var(--overlay-bg, rgba(5,11,20,0.92))',
      'border:1px solid var(--border-color, rgba(148,163,184,0.25))',
      'border-radius:10px',
      'box-shadow:0 8px 24px rgba(0,0,0,0.45)',
      'color:var(--text-primary, #e2e8f0)',
      'font-size:12px',
      'line-height:1.5',
      'pointer-events:none',
      'user-select:none',
      'z-index:2',
      'overflow:hidden',
      'position:relative',
    ].join(';')

    // 标题栏
    const header = document.createElement('div')
    header.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'padding:8px 12px',
      'border-bottom:1px solid var(--border-color, rgba(148,163,184,0.15))',
      'font-weight:600',
      'font-size:13px',
      `color:${accent}`,
    ].join(';')
    const titleSpan = document.createElement('span')
    titleSpan.textContent = areaName ? `${areaName}·天气` : '天气'
    header.appendChild(titleSpan)
    const closeIcon = document.createElement('span')
    closeIcon.textContent = '\u00D7'
    closeIcon.style.cssText = 'font-size:14px;opacity:0.5;cursor:pointer;pointer-events:auto;'
    closeIcon.addEventListener('click', (e) => {
      e.stopPropagation()
      if (overlayRef) {
        this.closeCluster({ feature, labelOverlay, weatherOverlay: overlayRef })
      }
    })
    header.appendChild(closeIcon)
    el.appendChild(header)

    // 主体：左侧天气图标+描述，右侧数据行
    const body = document.createElement('div')
    body.style.cssText = 'display:flex;padding:10px 12px;gap:12px;'
    el.appendChild(body)

    // 左侧：天气图标 + 描述
    const left = document.createElement('div')
    left.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:center',
      'min-width:52px',
      'gap:4px',
    ].join(';')

    // 天气图标（emoji 映射）
    const iconEl = document.createElement('div')
    iconEl.textContent = weatherWeatherIcon(weather.weather)
    iconEl.style.cssText = 'font-size:32px;line-height:1;'
    left.appendChild(iconEl)

    // 天气描述
    const descEl = document.createElement('div')
    descEl.textContent = weather.weather || '—'
    descEl.style.cssText = `font-size:13px;font-weight:600;color:${accent};`
    left.appendChild(descEl)
    body.appendChild(left)

    // 右侧：数据行（5 项）
    const right = document.createElement('div')
    right.style.cssText = 'flex:1;display:flex;flex-direction:column;justify-content:center;gap:4px;'
    const rows: Array<[string, string]> = [
      ['风力', weather.windpower ? `${weather.windpower}级` : '—'],
      ['风向', weather.winddirection || '—'],
      ['气温', weather.temperature ? `${weather.temperature}\u00B0C` : '—'],
      ['湿度', weather.humidity ? `${weather.humidity}%` : '—'],
      ['降水量', weather.precipitation ? `${weather.precipitation} mm` : '0 mm'],
    ]
    for (const [key, val] of rows) {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;justify-content:space-between;gap:12px;'
      const k = document.createElement('span')
      k.textContent = key
      k.style.cssText = 'opacity:0.65;'
      const v = document.createElement('span')
      v.textContent = val
      v.style.cssText = 'font-weight:500;min-width:48px;text-align:right;'
      row.appendChild(k)
      row.appendChild(v)
      right.appendChild(row)
    }
    body.appendChild(right)

    const overlay = new Overlay({
      element: el,
      positioning: 'center-right',
      offset: [16, -8],
      stopEvent: false,
    })
    overlay.setPosition(fromLonLat([lng, lat]))
    this.map.addOverlay(overlay)
    overlayRef = overlay

    return overlay
  }
}
