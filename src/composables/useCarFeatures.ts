import type Map from 'ol/Map'
import Overlay from 'ol/Overlay'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import * as olProj from 'ol/proj'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { unByKey } from 'ol/Observable'
import type { EventsKey } from "ol/events";
import { CAR_ICON, getStyle } from '@/baseComponent/amap/featureStyle'

export type CarStatus = 'online' | 'offline' | 'maintenance'

export type CarItem = {
  id: string
  plateNo: string
  carType: 'fireEngine' | 'rescue' | 'ladder' | 'command'
  status: CarStatus
  team: string
  driver?: string
  phone?: string
  speed: number
  heading: number
  lng: number
  lat: number
  updatedAt: string
}

export type OnlineCarListResult = {
  records: CarItem[]
  total: number
}

const MOCK_CAR_LIST: CarItem[] = [
  {
    id: 'CAR-001',
    plateNo: '粤B·X1101',
    carType: 'fireEngine',
    status: 'online',
    team: '深圳市消防救援支队南山区大队',
    driver: '张志强',
    phone: '13800138001',
    speed: 32,
    heading: 90,
    lng: 113.930783,
    lat: 22.543345,
    updatedAt: '2026-06-11 19:30:00',
  },
  {
    id: 'CAR-002',
    plateNo: '粤B·X1102',
    carType: 'rescue',
    status: 'online',
    team: '南头消防救援站',
    driver: '李建国',
    phone: '13800138002',
    speed: 0,
    heading: 0,
    lng: 113.921456,
    lat: 22.537654,
    updatedAt: '2026-06-11 19:30:05',
  },
  {
    id: 'CAR-003',
    plateNo: '粤B·X1103',
    carType: 'ladder',
    status: 'online',
    team: '南山消防救援站',
    driver: '王伟',
    phone: '13800138003',
    speed: 18,
    heading: 180,
    lng: 113.951234,
    lat: 22.528765,
    updatedAt: '2026-06-11 19:29:58',
  },
  {
    id: 'CAR-004',
    plateNo: '粤B·X1104',
    carType: 'fireEngine',
    status: 'maintenance',
    team: '蛇口消防救援站',
    speed: 0,
    heading: 0,
    lng: 113.976543,
    lat: 22.532109,
    updatedAt: '2026-06-11 18:12:30',
  },
  {
    id: 'CAR-005',
    plateNo: '粤B·X1105',
    carType: 'command',
    status: 'online',
    team: '科技园消防救援站',
    driver: '陈晓东',
    phone: '13800138005',
    speed: 45,
    heading: 270,
    lng: 114.001234,
    lat: 22.545678,
    updatedAt: '2026-06-11 19:30:12',
  },
  {
    id: 'CAR-006',
    plateNo: '粤B·X1106',
    carType: 'rescue',
    status: 'offline',
    team: '西丽消防救援站',
    speed: 0,
    heading: 0,
    lng: 113.939876,
    lat: 22.576543,
    updatedAt: '2026-06-11 16:40:00',
  },
  {
    id: 'CAR-007',
    plateNo: '粤B·X1107',
    carType: 'fireEngine',
    status: 'online',
    team: '华侨城消防救援站',
    driver: '赵磊',
    phone: '13800138007',
    speed: 25,
    heading: 45,
    lng: 114.012345,
    lat: 22.523456,
    updatedAt: '2026-06-11 19:30:08',
  },
  {
    id: 'CAR-008',
    plateNo: '粤B·X1108',
    carType: 'ladder',
    status: 'online',
    team: '桃源消防救援站',
    driver: '刘洋',
    phone: '13800138008',
    speed: 60,
    heading: 135,
    lng: 113.956789,
    lat: 22.590123,
    updatedAt: '2026-06-11 19:30:18',
  },
]

const FAKE_CAR_PATH = 'car-client/api/online-cars'

const FAKE_REQUEST_LATENCY_MS = 200

const buildFakeEnvelope = (data: unknown) => ({
  success: true,
  code: 200,
  message: 'ok',
  data,
  timestamp: Date.now(),
})

const buildFakeResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(buildFakeEnvelope(data)), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const fakeRequest = (
  path: string,
  body: unknown,
): Promise<Response> => {
  if (path !== FAKE_CAR_PATH) {
    return Promise.resolve(
      buildFakeResponse({ message: `未注册的假接口路径: ${path}` }, 404),
    )
  }
  void body
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(
        buildFakeResponse({
          records: MOCK_CAR_LIST,
          total: MOCK_CAR_LIST.length,
        }),
      )
    }, FAKE_REQUEST_LATENCY_MS)
  })
}

const CAR_LAYER_ZINDEX = 200
const CAR_ICON_SCALE = 1.2

const populateCarSource = (source: VectorSource, cars: CarItem[]) => {
  source.clear()
  cars.forEach((car) => {
    if (!Number.isFinite(car.lng) || !Number.isFinite(car.lat)) return
    const feature = new Feature({
      geometry: new Point(olProj.fromLonLat([car.lng, car.lat])),
    })
    feature.set('data', car)
    feature.setStyle(
      getStyle('vehicle', {
        src: CAR_ICON,
        rotation: (car.heading * Math.PI) / 180,
        scale: CAR_ICON_SCALE,
      }) as any,
    )
    source.addFeature(feature)
  })
}

const isValidExtent = (extent: number[]) =>
  extent.length === 4 && extent.every((value) => Number.isFinite(value))

const unwrapEnvelope = async (path: string, body: unknown) => {
  const response = await fakeRequest(path, body)
  if (!response.ok) {
    throw new Error(`[useCarFeatures] HTTP ${response.status}`)
  }
  const json = await response.json()
  if (!json?.success) {
    throw new Error(json?.message ?? '[useCarFeatures] 业务失败')
  }
  return json.data as OnlineCarListResult
}

export type MountCarFeaturesParams = {
  map: Map
  popupElement: HTMLElement
  visible?: boolean
  onSelect: (data: CarItem) => void
  onClose: () => void
}

export type CarFeaturesManager = {
  layer: VectorLayer<VectorSource>
  overlay: Overlay
  hide: () => void
  setVisible: (visible: boolean) => void
  isVisible: () => boolean
  setData: (cars: CarItem[]) => void
  fetch: () => Promise<void>
  fitToExtent: () => void
  destroy: () => void
}

export const mountCarFeatures = (
  params: MountCarFeaturesParams,
): CarFeaturesManager => {
  const source = new VectorSource()
  const layer = new VectorLayer({
    source,
    className: 'CAR_LAYER',
    zIndex: CAR_LAYER_ZINDEX,
    visible: params.visible ?? false,
    updateWhileAnimating: true,
    updateWhileInteracting: true,
  })
  params.map.addLayer(layer)

  const overlay = new Overlay({
    element: params.popupElement,
    positioning: 'bottom-center',
    offset: [0, -28],
    stopEvent: true,
  })
  params.map.addOverlay(overlay)

  const closePopup = () => {
    params.onClose()
    overlay.setPosition(undefined)
  }

  const clickKey: EventsKey = params.map.on('singleclick', (evt) => {
    if (!layer.getVisible()) return
    let hit = false
    params.map.forEachFeatureAtPixel(
      evt.pixel,
      (feature, targetLayer) => {
        if (targetLayer !== layer) return false
        const data = (feature as any).get('data') as CarItem | undefined
        const geometry = feature.getGeometry() as Point | undefined
        if (!data || !geometry) return false
        params.onSelect(data)
        overlay.setPosition(geometry.getCoordinates())
        hit = true
        return true
      },
      { hitTolerance: 6 },
    )
    if (!hit) closePopup()
  })

  const setVisible = (visible: boolean) => {
    layer.setVisible(visible)
    if (!visible) closePopup()
  }

  const setData = (next: CarItem[]) => {
    populateCarSource(source, next)
  }

  const fetch = async (): Promise<void> => {
    const data = await unwrapEnvelope(FAKE_CAR_PATH, undefined)
    setData(data.records ?? [])
  }

  const fitToExtent = () => {
    const extent = source.getExtent()
    if (!isValidExtent(extent)) return
    params.map.getView().fit(extent, {
      padding: [80, 80, 80, 80],
      duration: 600,
      maxZoom: 15,
    })
  }

  const destroy = () => {
    unByKey(clickKey)
    params.map.removeOverlay(overlay)
    params.map.removeLayer(layer)
  }

  return {
    layer,
    overlay,
    hide: closePopup,
    setVisible,
    isVisible: () => layer.getVisible(),
    setData,
    fetch,
    fitToExtent,
    destroy,
  }
}

export const MOCK_ONLINE_CARS = MOCK_CAR_LIST
export const CAR_FAKE_PATH = FAKE_CAR_PATH
