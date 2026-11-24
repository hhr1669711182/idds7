/**
 * useGeoPicker —— 对外选点 / 选辖区（iframe 嵌入）核心逻辑
 *
 * 职责：
 * - 装配 OL 地图与底图（复用全局底图缓存池，不依赖 GeoServer）
 * - 常驻 Draw（始终可画）+ Modify（仅辖区模式，直接绑 source，官方 demo 写法）
 * - 轻量几何历史栈：撤销 / 重做 / 清除
 * - 经 useMessageStore 与宿主 postMessage 通信（定位指令入站、结果回传出站）
 *
 * 坐标统一 WGS84 [经度, 纬度]。
 */
import { onBeforeUnmount, ref } from 'vue'
import { useRoute } from 'vue-router'
import Map from 'ol/Map'
import View from 'ol/View'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Draw from 'ol/interaction/Draw'
import Modify from 'ol/interaction/Modify'
import Feature from 'ol/Feature'
import GeoJSON from 'ol/format/GeoJSON'
import { fromLonLat, toLonLat } from 'ol/proj'
import { unByKey } from 'ol/Observable'
import type { EventsKey } from 'ol/events'
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style'
import type Geometry from 'ol/geom/Geometry'
import Point from 'ol/geom/Point'
import { GOOGLE_LAYER } from '@/baseComponent/OpenlayersMap/layers'
import { useBaseMapLayer } from '@/baseComponent/OpenlayersMap/useBaseMapLayer'
import { CENTER, ZOOM } from '@/baseComponent/OpenlayersMap/const.map'
import { useMessageStore } from '@/store/useMessageStore'
import { MESSAGE_EVENT_KEY, MESSAGE_SYSTEM } from '@/const/const.message.type'
import {
  publishGeoPickerCleared,
  publishGeoPickerJurisdiction,
  publishGeoPickerPoint,
  publishGeoPickerReady,
} from '@/controller/publish/host'
import type {
  GeoPickerJurisdictionResult,
  GeoPickerLocateCommand,
  GeoPickerPointResult,
} from '@/controller/core/protocol/GeoPickerProtocol'

export type GeoPickerMode = 'point' | 'jurisdiction'

/** 单一要素固定 id，便于编辑与历史回灌时定位 */
const FEATURE_ID = 'geo-picker-current'

const POINT_STYLE = [
  new Style({
    image: new CircleStyle({
      radius: 9,
      fill: new Fill({ color: '#ffffff' }),
      stroke: new Stroke({ color: '#2b80ff59', width: 4 }),
    }),
  }),
  new Style({
    image: new CircleStyle({
      radius: 4,
      fill: new Fill({ color: '#2b7fff' }),
    }),
  }),
]

const POLYGON_STYLE = new Style({
  stroke: new Stroke({ color: '#2b7fff', width: 2.5 }),
  fill: new Fill({ color: 'rgba(43,127,255,0.2)' }),
})

// sketch cursor 点样式：两种模式共用
const SKETCH_CURSOR_STYLE = new Style({
  image: new CircleStyle({
    radius: 5,
    fill: new Fill({ color: 'rgba(43,127,255,0.5)' }),
    stroke: new Stroke({ color: '#2b7fff', width: 1.5 }),
  }),
  stroke: new Stroke({ color: 'rgba(43,127,255,0.5)', width: 2 }),
})

/**
 * 轻量几何历史栈：单一要素模型，初始即含「空」状态。
 * - push 新几何（画 / 编辑完成）
 * - undo / redo 在状态间移动游标
 * - current 始终反映当前应展示的几何（null 表示无要素）
 */
class GeometryHistory {
  private stack: Array<Geometry | null> = [null]
  private cursor = 0
  private listeners = new Set<() => void>()

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private notify(): void {
    this.listeners.forEach((fn) => fn())
  }
  push(geom: Geometry | null): void {
    if (this.cursor < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.cursor + 1)
    }
    this.stack.push(geom ? geom.clone() : null)
    this.cursor = this.stack.length - 1
    this.notify()
  }
  get canUndo(): boolean {
    return this.cursor > 0
  }
  get canRedo(): boolean {
    return this.cursor < this.stack.length - 1
  }
  undo(): Geometry | null {
    if (!this.canUndo) return this.current
    this.cursor -= 1
    this.notify()
    return this.current
  }
  redo(): Geometry | null {
    if (!this.canRedo) return this.current
    this.cursor += 1
    this.notify()
    return this.current
  }
  get current(): Geometry | null {
    const g = this.stack[this.cursor]
    return g ? g.clone() : null
  }
  clear(): void {
    this.stack = [null]
    this.cursor = 0
    this.notify()
  }
}

/**
 * @param mode 'point' 画点回传 | 'jurisdiction' 画辖区回传
 */
export function useGeoPicker(mode: GeoPickerMode) {
  const mapRef = ref<HTMLDivElement>()
  const canUndo = ref(false)
  const canRedo = ref(false)
  const zoom = ref<number | null>(null)

  // 必须在 setup 顶层调用：useBaseMapLayer 内部注册了 onUnmounted 清理
  const baseLayer = useBaseMapLayer()
  const messageStore = useMessageStore()
  const route = useRoute()

  let map: Map | null = null
  let vectorLayer: VectorLayer<VectorSource> | null = null
  let source: VectorSource | null = null
  let draw: Draw | null = null
  let modify: Modify | null = null
  const history = new GeometryHistory()
  const geoJson = new GeoJSON()
  const listeners: EventsKey[] = []
  let unbindParent: (() => void) | null = null
  let historyUnsub: (() => void) | null = null
  let locateUnsub: (() => void) | null = null
  let clearUnsub: (() => void) | null = null

  const currentStyle = mode === 'point' ? POINT_STYLE : POLYGON_STYLE

  /** 用指定几何替换当前要素（null 表示清空） */
  const applyGeometry = (geom: Geometry | null): void => {
    if (!source) return
    source.clear()
    if (!geom) return
    const feature = new Feature({ geometry: geom.clone() })
    feature.setId(FEATURE_ID)
    feature.setStyle(currentStyle)
    source.addFeature(feature)
  }

  /** 把当前几何转 WGS84 后回传宿主；无要素则发 cleared */
  const emitCurrent = (): void => {
    const geom = history.current
    if (!geom) {
      publishGeoPickerCleared()
      return
    }
    if (mode === 'point') {
      const coord = toLonLat((geom as Point).getCoordinates())
      const data: GeoPickerPointResult = { lng: coord[0], lat: coord[1] }
      publishGeoPickerPoint(data)
    } else {
      const obj = geoJson.writeGeometryObject(geom, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857',
      }) as { coordinates: number[][][] }
      const data: GeoPickerJurisdictionResult = { coordinates: obj.coordinates }
      publishGeoPickerJurisdiction(data)
    }
  }

  /** 编辑完成（Modify 拖动结束）：几何已就地变更，入历史，回传 */
  const onModified = (): void => {
    if (!source) return
    const f = source.getFeatureById(FEATURE_ID) as Feature | undefined
    const geom = f?.getGeometry()
    if (!geom) return
    history.push(geom)
    emitCurrent()
  }

  const locate = (cmd: GeoPickerLocateCommand): void => {
    if (!map) return
    const view = map.getView()
    view.animate({
      center: fromLonLat([cmd.lng, cmd.lat]),
      zoom: cmd.zoom ?? view.getZoom() ?? ZOOM.INIT,
      duration: 300,
    })
  }

  const clearAll = (): void => {
    applyGeometry(null)
    history.clear()
    emitCurrent()
  }

  const undo = (): void => {
    const geom = history.undo()
    applyGeometry(geom)
    emitCurrent()
  }

  const redo = (): void => {
    const geom = history.redo()
    applyGeometry(geom)
    emitCurrent()
  }

  /** 解析 URL query 的初始定位（?lng=&lat=&zoom=），非法返回 undefined。
   *  用 route.query 而非 location.search：hash 路由下「?」在「#」之后，location.search 恒为空串。 */
  const parseQuery = (): GeoPickerLocateCommand | undefined => {
    const toNum = (v: unknown): number | undefined => {
      const raw = Array.isArray(v) ? v[0] : v
      if (typeof raw !== 'string') return undefined
      const n = Number(raw)
      return Number.isFinite(n) ? n : undefined
    }
    const lng = toNum(route.query.lng)
    const lat = toNum(route.query.lat)
    if (lng === undefined || lat === undefined) return undefined
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return undefined
    const cmd: GeoPickerLocateCommand = { lng, lat }
    const zoom = toNum(route.query.zoom)
    if (zoom !== undefined) cmd.zoom = zoom
    return cmd
  }

  const init = (target: HTMLDivElement): void => {
    source = new VectorSource()
    vectorLayer = new VectorLayer({
      source,
      // 永久要素（有 FEATURE_ID）用 currentStyle；Draw sketch（无 FEATURE_ID）用 sketch 样式（给 Polygon 也补跟随端点）
      style: (feature) =>
        feature.getId() === FEATURE_ID ? currentStyle : SKETCH_CURSOR_STYLE,
    })

    map = new Map({
      target,
      layers: [baseLayer, GOOGLE_LAYER, vectorLayer],
      view: new View({
        center: fromLonLat(CENTER as [number, number]),
        zoom: ZOOM.INIT,
        minZoom: ZOOM.MIN,
        maxZoom: ZOOM.MAX,
      }),
    })

    // 当前缩放级别（供 ZoomLevelControl 展示）
    zoom.value = map.getView().getZoom() ?? null
    listeners.push(
      map.getView().on('change:resolution', () => {
        zoom.value = map!.getView().getZoom() ?? null
      }) as EventsKey,
    )

    // Modify：仅辖区模式，直接绑 source（官方 demo 写法，无需 Select 中转）
    if (mode === 'jurisdiction') {
      modify = new Modify({ source, pixelTolerance: 10 })
      map.addInteraction(modify)
      listeners.push(modify.on('modifyend', onModified) as EventsKey)
    }

    // Draw：常驻，始终可画（官方 demo 写法）
    // Draw 绑 source → sketch feature 也在 source 里（无 FEATURE_ID），永久要素有 FEATURE_ID
    draw = new Draw({
      source,
      type: mode === 'point' ? 'Point' : 'Polygon',
    })
    map.addInteraction(draw)

    // drawstart：新画第一点时立即清除上一个永久要素，但不入历史(null)不发 cleared
    listeners.push(
      draw.on('drawstart', () => {
        if (!source) return
        const old = source.getFeatureById(FEATURE_ID)
        if (old) {
          source.removeFeature(old)
          //history.push(null)
          //publishGeoPickerCleared()
        }
      }) as EventsKey,
    )

    listeners.push(
      draw.on('drawend', (evt) => {
        const feature = evt.feature
        source!.clear()
        feature.setId(FEATURE_ID)
        feature.setStyle(currentStyle)
        source!.addFeature(feature)
        const geom = feature.getGeometry()
        if (geom) {
          history.push(geom)
          emitCurrent()
        }
      }) as EventsKey,
    )

    // 历史栈 → 按钮禁用态
    historyUnsub = history.subscribe(() => {
      canUndo.value = history.canUndo
      canRedo.value = history.canRedo
    })
    canUndo.value = history.canUndo
    canRedo.value = history.canRedo

    // 宿主通信：外部 iframe 嵌入通常跨域，acceptOrigins 放通 '*'（publish 出站已用 targetOrigin='*'）
    unbindParent = messageStore.bindParent({ acceptOrigins: ['*'] })
    locateUnsub = messageStore.subscribe(
      MESSAGE_EVENT_KEY.GEO_PICKER_LOCATE,
      (env) => {
        const d = env.data as GeoPickerLocateCommand
        if (typeof d?.lng === 'number' && typeof d?.lat === 'number') {
          locate(d)
          // 选点页面：收到 locate 指令后，把坐标作为已画好的点上图
          if (mode === 'point') {
            const pt: Point = new Point(fromLonLat([d.lng, d.lat]))
            applyGeometry(pt)
            history.push(pt)
            emitCurrent()
          }
        }
      },
      MESSAGE_SYSTEM.HOST,
    )
    clearUnsub = messageStore.subscribe(
      MESSAGE_EVENT_KEY.GEO_PICKER_CLEAR,
      () => clearAll(),
      MESSAGE_SYSTEM.HOST,
    )
    messageStore.subscribe(
      MESSAGE_EVENT_KEY.GEO_PICKER_THEME,
      (env) => {
        const d = env.data as { theme?: string } | undefined
        if (!d?.theme) return
        document.documentElement.setAttribute('data-theme', d.theme === 'night' ? 'NIGHT' : 'DAY')
      },
      MESSAGE_SYSTEM.HOST,
    )

    // 初始定位（URL query）
    const initial = parseQuery()
    if (initial) locate(initial)

    // 就绪通知
    map.once('rendercomplete', () => publishGeoPickerReady({ ok: true }))
  }

  onBeforeUnmount(() => {
    historyUnsub?.()
    locateUnsub?.()
    clearUnsub?.()
    unbindParent?.()
    unByKey(listeners)
    listeners.length = 0
    if (map) {
      if (draw) map.removeInteraction(draw)
      if (modify) map.removeInteraction(modify)
      map.setTarget(undefined)
      map.dispose()
    }
    draw = null
    modify = null
    source = null
    vectorLayer = null
    map = null
  })

  return { mapRef, canUndo, canRedo, zoom, init, undo, redo, clearAll }
}
