import { createApp, App } from 'vue'
import Overlay from 'ol/Overlay'
import type Map from 'ol/Map'
import { transform } from 'ol/proj'
import { usePanelStore } from '@/store'
import { calculateDistance } from '@/utils/mapTool.ts'
import type { WfsFeature } from '@/apis/geoserverTypes'
import type { LayerConfig } from '@/config/layers'
import AlarmDetailPopup from '../AlarmDetailPopup.vue'

/**
 * 通用地图要素详情面板（公共业务底座）。
 * 仅负责「按坐标 + 取数结果渲染统一详情弹窗」，不做任何命中判定/取数/业务交互。
 * 点击取数管道见 FeatureClickQuery.ts；特化业务（如调派队站/消防栓）由业务方
 * 通过 FeatureClickQuery 注册的 business handler 优先接管，未接管时回落本面板。
 */
export interface FeatureDetailRouteInfo {
  etaText: string
  distanceText: string
}

export interface FeatureDetailPanelApi {
  /** 命中队站（主管矢量或 WMS 队站）时，按统一队站字段渲染 */
  openStation: (station: { id: string; name: string; address: string; coordinate: number[] }) => void
  /** 命中普通 WMS 要素时，按要素属性渲染 */
  openFeature: (coordinate: number[], feature: WfsFeature, items: LayerConfig[]) => void
  /** 关闭当前面板 */
  close: () => void
  /** 当前打开的队站 id（非队站为 null） */
  getOpenStationId: () => string | null
  /** 彻底释放：关闭面板 + unmount Vue app + 从地图移除 overlay（地图卸载时调用） */
  destroy: () => void
}

export const createFeatureDetailPanel = (
  map: Map,
  getRouteInfo?: (stationId: string) => FeatureDetailRouteInfo | null,
): FeatureDetailPanelApi => {
  const overlayElement = document.createElement('div')
  const overlay = new Overlay({
    element: overlayElement,
    autoPan: { animation: { duration: 250 } },
    positioning: 'bottom-center',
    offset: [0, -15],
  })
  map.addOverlay(overlay)

  let vueApp: App | null = null
  let openStationId: string | null = null

  const unmountApp = () => {
    if (vueApp) {
      vueApp.unmount()
      vueApp = null
    }
  }

  const close = () => {
    openStationId = null
    delete overlayElement.dataset.stationPopup
    unmountApp()
    overlay.setPosition(undefined)
  }

  /** 队站字段行：机构名称/地址 + 路线信息（有则补充预计时间/导航距离） */
  const buildStationRows = (station: { id: string; name: string; address: string }, routeInfo: FeatureDetailRouteInfo | null) => {
    if (!routeInfo) {
      return [
        { label: '机构名称', value: station.name || '暂无' },
        { label: '机构地址', value: station.address || '暂无地址' },
      ]
    }
    return [
      { label: '机构名称', value: station.name || '暂无' },
      { label: '机构地址', value: station.address || '暂无地址' },
      { label: '预计时间', value: routeInfo.etaText },
      { label: '导航距离', value: routeInfo.distanceText },
    ]
  }

  const openStation = (station: { id: string; name: string; address: string; coordinate: number[] }) => {
    unmountApp()
    delete overlayElement.dataset.stationPopup
    openStationId = station.id
    overlayElement.dataset.stationPopup = 'true'
    mount(
      station.name || '详细信息',
      buildStationRows(station, getRouteInfo?.(station.id) ?? null),
      station.coordinate,
    )
  }

  const openFeature = (coordinate: number[], feature: WfsFeature, items: LayerConfig[]) => {
    unmountApp()
    delete overlayElement.dataset.stationPopup
    const properties = (feature.properties || {}) as Record<string, unknown>
    const fId = String(feature.id ?? '')
    const item = items.find(({ id }) => id.includes(fId.split('.')[0] || '')) as LayerConfig | undefined

    const { circleOpen, circleCenter } = usePanelStore()
    const geomCoords = (feature.geometry as GeoJSON.Point | undefined)?.coordinates
    if (circleOpen && circleCenter && circleCenter.length > 1 && geomCoords) {
      const coord = transform(geomCoords, 'EPSG:3857', 'EPSG:4326')
      properties.R_distance = calculateDistance(coord as any, circleCenter as any) + '米'
    }

    const keys = {
      name: '名称',
      address: '地址',
      symc: '水源名称',
      sydz: '水源地址',
      sylx: '水源类型',
      org_name: '机构名称',
      org_address: '机构地址',
      org_simple: '机构简称',
      contacter_name: '联系人',
      contacter_phone: '联系电话',
      dispatch_phone: '调度电话',
      org_desc: '机构描述',
      dept_name: '单位名称',
      branch_type: '单位类型',
      dept_phone: '单位电话',
      responsible_name: '联系人',
      address_cn: '单位地址',
      R_distance: '距圆心',
    } as Record<string, string>

    let rows = Object.keys(properties)
      .filter((key) => key !== 'bbox' && keys[key])
      .map((key) => ({ label: keys[key], value: properties[key] }))

    const isStation = String(fId).includes('view_res_org_dept') || Boolean(properties.org_name)
    const stationId = String(properties.id ?? String(fId).split('.').pop() ?? '').trim()
    const routeInfo = isStation && stationId ? getRouteInfo?.(stationId) ?? null : null
    if (routeInfo) {
      rows = [
        { label: '机构名称', value: properties.org_name || '暂无' },
        { label: '机构地址', value: properties.org_address || '暂无地址' },
        { label: '预计时间', value: routeInfo.etaText },
        { label: '导航距离', value: routeInfo.distanceText },
      ]
    }

    openStationId = isStation ? stationId : null
    if (isStation) overlayElement.dataset.stationPopup = 'true'

    const title = String(
      properties.org_name ||
        item?.name ||
        properties.name ||
        properties.mc ||
        properties.NAME ||
        properties.MC ||
        '详细信息',
    )
    mount(title, rows, coordinate)
  }

  const mount = (title: string, rows: Array<{ label: string; value: any }>, coordinate: number[]) => {
    vueApp = createApp(AlarmDetailPopup, {
      visible: true,
      title,
      rows,
      onClose: close,
    })
    vueApp.mount(overlayElement)
    overlay.setPosition(coordinate)
  }

  return {
    openStation,
    openFeature,
    close,
    getOpenStationId: () => openStationId,
    /** 彻底释放：关闭面板 + 从地图移除 overlay（地图卸载时由 FeatureClickQuery.destroy 调用） */
    destroy: () => {
      close()
      map.removeOverlay(overlay)
    },
  }
}
