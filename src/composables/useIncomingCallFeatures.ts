import type Map from 'ol/Map'
import Overlay from 'ol/Overlay'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import Polygon from 'ol/geom/Polygon'
import * as olProj from 'ol/proj'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { unByKey } from 'ol/Observable'
import type { EventsKey } from 'ol/events'
import Style from 'ol/style/Style'
import Icon from 'ol/style/Icon'
import Stroke from 'ol/style/Stroke'
import Fill from 'ol/style/Fill'
import dayjs from 'dayjs'
import { gsap } from 'gsap'
import { useMapStore } from '@/store/useMapStore'
import { onIncomingCall } from '@/controller/map'

export type IncomingCallLocationType = 'cellId' | 'gps' | 'wifi' | 'unknown'
export type IncomingCallStatus = 'online' | 'offline' | 'lost'

export type IncomingCallData = {
  callId: string
  caller: string
  phone: string
  lng: number
  lat: number
  locationType: IncomingCallLocationType
  accuracyRadius: number
  status: IncomingCallStatus
  updatedAt: string
}

export type IncomingCallEnvelope = {
  callId: string
  caller?: string
  phone?: string
  lng: number
  lat: number
  locationType?: IncomingCallLocationType
  accuracyRadius?: number
  status?: IncomingCallStatus
  updatedAt?: string
}

const LOCATION_TYPE_LABELS: Record<IncomingCallLocationType, string> = {
  cellId: '基站定位 (Cell-ID)',
  gps: 'GPS 定位',
  wifi: 'Wi-Fi 定位',
  unknown: '未知定位',
}

const STATUS_LABELS: Record<IncomingCallStatus, string> = {
  online: '在线',
  offline: '离线',
  lost: '失联',
}

const STATUS_COLORS: Record<IncomingCallStatus, string> = {
  online: '#1ed1ff',
  offline: '#7a8693',
  lost: '#ff5252',
}

const POINT_LAYER_ZINDEX = 58
const CIRCLE_LAYER_ZINDEX = 57
const POPUP_CLASS = 'incoming_call_popup'
const STYLE_ID = 'incoming-call-features-style'

const DEFAULT_ACCURACY_RADIUS_METER = 500
const CIRCLE_SEGMENTS = 36
const METERS_PER_DEGREE_LAT = 111320
const NANSHA_FALLBACK_LNG = 113.930783
const NANSHA_FALLBACK_LAT = 22.543345

const PULSE_MIN_SCALE = 0.94
const PULSE_MAX_SCALE = 1.06
const PULSE_PERIOD_MS = 1400

const POINT_ICON_SRC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">' +
      '<defs>' +
      '<radialGradient id="g" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0%" stop-color="#7be4ff" stop-opacity="0.85"/>' +
      '<stop offset="70%" stop-color="#1ea7e0" stop-opacity="0.55"/>' +
      '<stop offset="100%" stop-color="#0d6fa6" stop-opacity="0"/>' +
      '</radialGradient>' +
      '</defs>' +
      '<circle cx="24" cy="24" r="22" fill="url(#g)"/>' +
      '<circle cx="24" cy="24" r="11" fill="#1ea7e0" stroke="#ffffff" stroke-width="2"/>' +
      '<path d="M19.8 21.6c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.3 1.3.4 2.6.6 4 .6.7 0 1.2.5 1.2 1.2v3.5c0 .7-.5 1.2-1.2 1.2C23.5 32.2 15.2 24 15.2 13.6c0-.7.5-1.2 1.2-1.2h3.5c.7 0 1.2.5 1.2 1.2 0 1.4.2 2.7.6 4 .1.4 0 .9-.3 1.2l-1.6 2.8Z" fill="#ffffff"/>' +
      '</svg>',
  )

const POPUP_STYLE_CSS = [
  '.' + POPUP_CLASS + '{',
  '  position:absolute;',
  '  left:0;top:0;',
  '  pointer-events:auto;',
  '  font-family: "PingFang SC","Microsoft YaHei",sans-serif;',
  '  color:#e6f4ff;',
  '  z-index:1100;',
  '}',
  '.' + POPUP_CLASS + '_card{',
  '  min-width:260px;',
  '  max-width:320px;',
  '  background:linear-gradient(180deg,rgba(11,28,46,0.96),rgba(7,18,32,0.96));',
  '  border:1px solid rgba(110,200,255,0.45);',
  '  border-radius:6px;',
  '  box-shadow:0 12px 28px rgba(0,30,60,0.45);',
  '  overflow:hidden;',
  '}',
  '.' + POPUP_CLASS + '_header{',
  '  display:flex;',
  '  align-items:center;',
  '  gap:8px;',
  '  padding:8px 12px;',
  '  background:linear-gradient(90deg,rgba(30,167,224,0.30),rgba(30,167,224,0));',
  '  border-bottom:1px solid rgba(110,200,255,0.25);',
  '}',
  '.' + POPUP_CLASS + '_kicker{',
  '  font-size:12px;',
  '  letter-spacing:0.08em;',
  '  color:#7be4ff;',
  '  font-weight:600;',
  '  flex:1;',
  '}',
  '.' + POPUP_CLASS + '_status{',
  '  font-size:11px;',
  '  padding:2px 8px;',
  '  border-radius:10px;',
  '  font-weight:600;',
  '  letter-spacing:0.04em;',
  '}',
  '.' + POPUP_CLASS + '_status.online{background:rgba(30,209,255,0.18);color:#1ed1ff;border:1px solid rgba(30,209,255,0.5);}',
  '.' + POPUP_CLASS + '_status.offline{background:rgba(122,134,147,0.18);color:#9ba6b3;border:1px solid rgba(122,134,147,0.5);}',
  '.' + POPUP_CLASS + '_status.lost{background:rgba(255,82,82,0.18);color:#ff7a7a;border:1px solid rgba(255,82,82,0.5);}',
  '.' + POPUP_CLASS + '_close{',
  '  width:22px;height:22px;',
  '  border:0;border-radius:4px;',
  '  background:transparent;',
  '  color:rgba(230,244,255,0.75);',
  '  font-size:18px;line-height:18px;',
  '  cursor:pointer;',
  '}',
  '.' + POPUP_CLASS + '_close:hover{background:rgba(255,255,255,0.08);color:#fff;}',
  '.' + POPUP_CLASS + '_body{',
  '  padding:6px 12px 10px;',
  '  display:grid;',
  '  gap:4px;',
  '}',
  '.' + POPUP_CLASS + '_row{',
  '  display:flex;',
  '  justify-content:space-between;',
  '  align-items:baseline;',
  '  gap:10px;',
  '  font-size:12px;',
  '  line-height:1.6;',
  '  border-bottom:1px dashed rgba(110,200,255,0.12);',
  '  padding:2px 0;',
  '}',
  '.' + POPUP_CLASS + '_row:last-child{border-bottom:0;}',
  '.' + POPUP_CLASS + '_row .k{color:rgba(180,210,235,0.75);flex-shrink:0;}',
  '.' + POPUP_CLASS + '_row .v{color:#ffffff;text-align:right;word-break:break-all;}',
].join('')

const ensureStyleElement = (): HTMLStyleElement | null => {
  if (typeof document === 'undefined') return null
  const existing = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (existing) return existing
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = POPUP_STYLE_CSS
  document.head.appendChild(el)
  return el
}

const removeStyleElement = () => {
  if (typeof document === 'undefined') return
  const el = document.getElementById(STYLE_ID)
  if (el) el.remove()
}

const createCirclePolygon = (
  center: [number, number],
  radiusMeter: number,
  segments: number = CIRCLE_SEGMENTS,
): Polygon => {
  const [lng, lat] = center
  const safeRadius = Math.max(0, Number.isFinite(radiusMeter) ? radiusMeter : 0)
  const metersPerDegLng = Math.max(0.0001, METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180))
  const ring: number[][] = []
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2
    const dLng = (safeRadius * Math.cos(theta)) / metersPerDegLng
    const dLat = (safeRadius * Math.sin(theta)) / METERS_PER_DEGREE_LAT
    ring.push([lng + dLng, lat + dLat])
  }
  return new Polygon([ring])
}

const formatLng = (lng: number) => {
  if (!Number.isFinite(lng)) return '—'
  return `${Math.abs(lng).toFixed(6)}° ${lng >= 0 ? 'E' : 'W'}`
}

const formatLat = (lat: number) => {
  if (!Number.isFinite(lat)) return '—'
  return `${Math.abs(lat).toFixed(6)}° ${lat >= 0 ? 'N' : 'S'}`
}

const escapeHtml = (raw: unknown): string => {
  const s = raw == null ? '' : String(raw)
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const buildPopupHtml = (data: IncomingCallData): string => {
  const locationTypeLabel = LOCATION_TYPE_LABELS[data.locationType] ?? LOCATION_TYPE_LABELS.unknown
  const statusLabel = STATUS_LABELS[data.status] ?? STATUS_LABELS.online
  const statusClass = data.status
  const radius = Number.isFinite(data.accuracyRadius) ? data.accuracyRadius : DEFAULT_ACCURACY_RADIUS_METER
  return (
    '<div class="' + POPUP_CLASS + '_card">' +
    '<div class="' + POPUP_CLASS + '_header">' +
    '<span class="' + POPUP_CLASS + '_kicker">目标终端定位</span>' +
    '<span class="' + POPUP_CLASS + '_status ' + statusClass + '">' + escapeHtml(statusLabel) + '</span>' +
    '<button class="' + POPUP_CLASS + '_close" data-action="close" type="button" aria-label="关闭">×</button>' +
    '</div>' +
    '<div class="' + POPUP_CLASS + '_body">' +
    '<div class="' + POPUP_CLASS + '_row"><span class="k">设备号码 (MSISDN)</span><span class="v">' + escapeHtml(data.phone || '—') + '</span></div>' +
    '<div class="' + POPUP_CLASS + '_row"><span class="k">主叫号码</span><span class="v">' + escapeHtml(data.caller || '—') + '</span></div>' +
    '<div class="' + POPUP_CLASS + '_row"><span class="k">经度 (Longitude)</span><span class="v">' + escapeHtml(formatLng(data.lng)) + '</span></div>' +
    '<div class="' + POPUP_CLASS + '_row"><span class="k">纬度 (Latitude)</span><span class="v">' + escapeHtml(formatLat(data.lat)) + '</span></div>' +
    '<div class="' + POPUP_CLASS + '_row"><span class="k">定位类型</span><span class="v">' + escapeHtml(locationTypeLabel) + '</span></div>' +
    '<div class="' + POPUP_CLASS + '_row"><span class="k">定位精度</span><span class="v">粗定位 半径约 ' + escapeHtml(radius) + ' m</span></div>' +
    '<div class="' + POPUP_CLASS + '_row"><span class="k">最后更新</span><span class="v">' + escapeHtml(data.updatedAt) + '</span></div>' +
    '</div>' +
    '</div>'
  )
}

const makePointStyle = (status: IncomingCallStatus, scale: number = 1): Style => {
  const tint = STATUS_COLORS[status] ?? STATUS_COLORS.online
  return new Style({
    image: new Icon({
      src: POINT_ICON_SRC,
      scale: 0.95 * scale,
      color: tint,
      anchor: [0.5, 0.5],
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction',
    }),
  })
}

const makeCircleStyle = (): Style =>
  new Style({
    stroke: new Stroke({ color: 'rgba(30,167,224,0.85)', width: 1.5 }),
    fill: new Fill({ color: 'rgba(30,167,224,0.10)' }),
  })

const normalizeEnvelope = (raw: unknown): IncomingCallData | null => {
  if (!raw || typeof raw !== 'object') return null
  const env = raw as Record<string, any>
  const callId = env.callId ?? env.call_id ?? env.id
  if (typeof callId !== 'string' || !callId) {
    if (typeof console !== 'undefined') {
      console.warn('[useIncomingCallFeatures] 丢弃缺 callId 的消息', env)
    }
    return null
  }
  const lng = Number(env.lng ?? env.lon ?? env.longitude)
  const lat = Number(env.lat ?? env.latitude)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    if (typeof console !== 'undefined') {
      console.warn('[useIncomingCallFeatures] 丢弃缺坐标的消息', callId, env)
    }
    return null
  }
  const locationType: IncomingCallLocationType = ((): IncomingCallLocationType => {
    const v = String(env.locationType ?? env.location_type ?? '').toLowerCase()
    if (v === 'cellid' || v === 'cell-id' || v === 'cell_id') return 'cellId'
    if (v === 'gps') return 'gps'
    if (v === 'wifi' || v === 'wi-fi' || v === 'wi_fi') return 'wifi'
    return 'unknown'
  })()
  const status: IncomingCallStatus = ((): IncomingCallStatus => {
    const v = String(env.status ?? '').toLowerCase()
    if (v === 'offline') return 'offline'
    if (v === 'lost' || v === 'lostContact' || v === 'lost_contact') return 'lost'
    return 'online'
  })()
  const accuracyRadius = Number(env.accuracyRadius ?? env.accuracy_radius ?? env.accuracy)
  return {
    callId,
    caller: String(env.caller ?? env.callerName ?? env.caller_name ?? '未知来电'),
    phone: String(env.phone ?? env.msisdn ?? ''),
    lng,
    lat,
    locationType,
    accuracyRadius: Number.isFinite(accuracyRadius) && accuracyRadius > 0
      ? accuracyRadius
      : DEFAULT_ACCURACY_RADIUS_METER,
    status,
    updatedAt: env.updatedAt ?? env.updated_at ?? dayjs().format('YYYY-MM-DD HH:mm:ss'),
  }
}

export type MountIncomingCallFeaturesParams = {
  map?: Map
  visible?: boolean
  onError?: (error: unknown) => void
}

export type IncomingCallFeaturesManager = {
  layer: VectorLayer<VectorSource>
  circleLayer: VectorLayer<VectorSource>
  overlay: Overlay
  addCall: (data: IncomingCallEnvelope) => void
  updateCall: (data: IncomingCallEnvelope) => void
  removeCall: (callId: string) => void
  clearAll: () => void
  setVisible: (visible: boolean) => void
  isVisible: () => boolean
  hide: () => void
  getCalls: () => IncomingCallData[]
  destroy: () => void
}

export const mountIncomingCallFeatures = (
  params: MountIncomingCallFeaturesParams = {},
): IncomingCallFeaturesManager => {
  const map = params.map ?? useMapStore().map
  if (!map) {
    throw new Error('[useIncomingCallFeatures] 地图实例为空，请传入 map 或先初始化 useMapStore().map')
  }

  const pointSource = new VectorSource()
  const circleSource = new VectorSource()

  const circleLayer = new VectorLayer({
    source: circleSource,
    className: 'INCOMING_CALL_CIRCLE_LAYER',
    zIndex: CIRCLE_LAYER_ZINDEX,
    visible: params.visible ?? true,
  })

  const layer = new VectorLayer({
    source: pointSource,
    className: 'INCOMING_CALL_POINT_LAYER',
    zIndex: POINT_LAYER_ZINDEX,
    visible: params.visible ?? true,
  })

  map.addLayer(circleLayer)
  map.addLayer(layer)

  const styleElement = ensureStyleElement()
  const popupElement = document.createElement('div')
  popupElement.className = POPUP_CLASS

  const overlay = new Overlay({
    element: popupElement,
    positioning: 'bottom-center',
    offset: [0, -28],
    stopEvent: true,
  })
  map.addOverlay(overlay)

  const onCloseButtonClick = (event: Event) => {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (target.getAttribute('data-action') === 'close') {
      closePopup()
    }
  }
  popupElement.addEventListener('click', onCloseButtonClick)

  const dataMap = new Map<string, IncomingCallData>()

  const renderPointFeature = (data: IncomingCallData): Feature => {
    const feature = new Feature({
      geometry: new Point(olProj.fromLonLat([data.lng, data.lat])),
    })
    feature.set('data', data)
    feature.set('callId', data.callId)
    feature.setId(data.callId)
    feature.setStyle(makePointStyle(data.status))
    return feature
  }

  const renderCircleFeature = (data: IncomingCallData): Feature => {
    const geometry = createCirclePolygon([data.lng, data.lat], data.accuracyRadius)
    const feature = new Feature({ geometry })
    feature.set('data', data)
    feature.set('callId', data.callId)
    feature.setId('circle:' + data.callId)
    feature.setStyle(makeCircleStyle())
    return feature
  }

  const refreshFeatures = () => {
    pointSource.clear()
    circleSource.clear()
    dataMap.forEach((data) => {
      pointSource.addFeature(renderPointFeature(data))
      circleSource.addFeature(renderCircleFeature(data))
    })
  }

  const callPulseTweens = new Map<string, gsap.core.Tween>()

  const startPulseFor = (callId: string) => {
    if (callPulseTweens.has(callId)) return
    const pointFeature = pointSource.getFeatureById(callId) as Feature | null
    if (!pointFeature) return
    const state = { scale: PULSE_MIN_SCALE }
    const tween = gsap.to(state, {
      scale: PULSE_MAX_SCALE,
      duration: PULSE_PERIOD_MS / 1000,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
      onUpdate: () => {
        const current = dataMap.get(callId)
        if (!current) return
        const feature = pointSource.getFeatureById(callId) as Feature | null
        if (!feature) return
        feature.setStyle(makePointStyle(current.status, state.scale))
      },
    })
    callPulseTweens.set(callId, tween)
  }

  const stopPulseFor = (callId: string) => {
    const tween = callPulseTweens.get(callId)
    if (tween) {
      tween.kill()
      callPulseTweens.delete(callId)
    }
  }

  const closePopup = () => {
    popupElement.innerHTML = ''
    overlay.setPosition(undefined)
  }

  const showPopupForCall = (data: IncomingCallData, coordinate: number[]) => {
    popupElement.innerHTML = buildPopupHtml(data)
    overlay.setPosition(coordinate)
  }

  const clickKey: EventsKey = map.on('singleclick', (evt) => {
    if (!layer.getVisible()) {
      closePopup()
      return
    }
    let hit: { data: IncomingCallData; coordinate: number[] } | null = null
    map.forEachFeatureAtPixel(
      evt.pixel,
      (feature, targetLayer) => {
        if (targetLayer !== layer) return false
        const data = (feature as any).get('data') as IncomingCallData | undefined
        const geometry = feature.getGeometry() as Point | undefined
        if (!data || !geometry) return false
        hit = { data, coordinate: geometry.getCoordinates() }
        return true
      },
      { hitTolerance: 6 },
    )
    if (hit) {
      showPopupForCall(hit.data, hit.coordinate)
    } else {
      closePopup()
    }
  })

  const addCall = (envelope: IncomingCallEnvelope) => {
    const data = normalizeEnvelope(envelope)
    if (!data) return
    dataMap.set(data.callId, data)
    pointSource.addFeature(renderPointFeature(data))
    circleSource.addFeature(renderCircleFeature(data))
    startPulseFor(data.callId)
  }

  const updateCall = (envelope: IncomingCallEnvelope) => {
    const data = normalizeEnvelope(envelope)
    if (!data) return
    dataMap.set(data.callId, data)
    const existingPoint = pointSource.getFeatureById(data.callId) as Feature | null
    if (existingPoint) {
      existingPoint.set('data', data)
      ;(existingPoint.getGeometry() as Point).setCoordinates(
        olProj.fromLonLat([data.lng, data.lat]),
      )
      const currentTween = callPulseTweens.get(data.callId)
      const currentScale = currentTween ? (currentTween.targets()[0] as any)?.scale ?? 1 : 1
      existingPoint.setStyle(makePointStyle(data.status, currentScale))
    } else {
      pointSource.addFeature(renderPointFeature(data))
    }
    const existingCircle = circleSource.getFeatureById('circle:' + data.callId) as Feature | null
    if (existingCircle) {
      existingCircle.set('data', data)
      existingCircle.setGeometry(createCirclePolygon([data.lng, data.lat], data.accuracyRadius))
      existingCircle.setStyle(makeCircleStyle())
    } else {
      circleSource.addFeature(renderCircleFeature(data))
    }
    if (!callPulseTweens.has(data.callId)) {
      startPulseFor(data.callId)
    }
  }

  const removeCall = (callId: string) => {
    if (!callId) return
    if (!dataMap.has(callId)) return
    dataMap.delete(callId)
    const pointFeature = pointSource.getFeatureById(callId) as Feature | null
    if (pointFeature) pointSource.removeFeature(pointFeature)
    const circleFeature = circleSource.getFeatureById('circle:' + callId) as Feature | null
    if (circleFeature) circleSource.removeFeature(circleFeature)
    stopPulseFor(callId)
    if (overlay.getPosition()) {
      closePopup()
    }
  }

  const clearAll = () => {
    const callIds = Array.from(dataMap.keys())
    dataMap.clear()
    pointSource.clear()
    circleSource.clear()
    callIds.forEach((id) => stopPulseFor(id))
    closePopup()
  }

  const setVisible = (visible: boolean) => {
    layer.setVisible(visible)
    circleLayer.setVisible(visible)
    if (!visible) closePopup()
  }

  const unsubscribe = onIncomingCall((payload: any) => {
    try {
      if (!payload || typeof payload !== 'object') return
      if (Array.isArray((payload as any).items)) {
        ;(payload as any).items.forEach((item: IncomingCallEnvelope) => {
          const data = normalizeEnvelope(item)
          if (!data) return
          if (dataMap.has(data.callId)) updateCall(data)
          else addCall(data)
        })
        return
      }
      const data = normalizeEnvelope(payload)
      if (!data) return
      if (dataMap.has(data.callId)) updateCall(data)
      else addCall(data)
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.error('[useIncomingCallFeatures] handler error', err)
      }
      params.onError?.(err)
    }
  })

  const destroy = () => {
    unByKey(clickKey)
    unsubscribe()
    callPulseTweens.forEach((tween) => tween.kill())
    callPulseTweens.clear()
    dataMap.clear()
    pointSource.clear()
    circleSource.clear()
    map.removeOverlay(overlay)
    map.removeLayer(layer)
    map.removeLayer(circleLayer)
    popupElement.removeEventListener('click', onCloseButtonClick)
    if (popupElement.parentNode) {
      popupElement.parentNode.removeChild(popupElement)
    }
    if (!document.querySelector('.' + POPUP_CLASS)) {
      removeStyleElement()
    }
  }

  return {
    layer,
    circleLayer,
    overlay,
    addCall,
    updateCall,
    removeCall,
    clearAll,
    setVisible,
    isVisible: () => layer.getVisible(),
    hide: closePopup,
    getCalls: () => Array.from(dataMap.values()),
    destroy,
  }
}
