import Map from 'ol/Map'
import Feature from 'ol/Feature'
import VectorLayer from 'ol/layer/Vector'
import TileLayer from 'ol/layer/Tile'
import TileWMS from 'ol/source/TileWMS'
import { unByKey } from 'ol/Observable'
import { EventsKey } from 'ol/events'
import type { MapBrowserEvent } from 'ol'
import { storeToRefs } from 'pinia'
import { usePanelStore } from '@/store'
import { useLayersStore } from '@/store/useLayersStore'
import { ALL_RESOURCE_TYPES } from '@/components/map/MapTools'
import { geoserverApi } from '@/apis/geoserver'
import { buildMultiLayerCql } from '@/utils/cql'
import { STATION_LAYER_NAME } from '@/controller/core/business/IncidentStationQuery'
import type { WfsFeature } from '@/apis/geoserverTypes'
import type { LayerConfig } from '@/config/layers'
import {
  createFeatureDetailPanel,
  type FeatureDetailPanelApi,
  type FeatureDetailRouteInfo,
} from './overlay/featureDetailPanel'

/** 从 OL 几何中取点坐标；非点几何或缺方法时返回 null（结构守卫，不用 instanceof） */
const readPointCoordinates = (geometry: unknown): number[] | null => {
  if (!geometry || typeof geometry !== 'object') return null
  const getter = (geometry as { getCoordinates?: () => number[] | null }).getCoordinates
  if (typeof getter !== 'function') return null
  return getter.call(geometry) ?? null
}

/** 主管队站独立 zhu.png 图标图层 className（dispatchMap 警情定位链路） */
export const INCIDENT_PRIMARY_STATION_LAYER_CLASS = 'INCIDENT_PRIMARY_STATION_LAYER'
/**
 * 警情周边资源范围圈（可拖拽 500 米圆）图层 className。
 * 该图层为半透明装饰面，点击命中时不应拦截 WMS 要素弹窗，
 * 故 FeatureClickQuery 的矢量命中过滤需显式排除它。
 */
export const RESOURCE_CIRCLE_LAYER_CLASS = 'nearby_resource_circle_layer'
/** 主管队站独立图标图层 className（DispatchT1 立案调派链路） */
export const DISPATCH_T1_PRIMARY_STATION_LAYER_CLASS = 'dispatch_t1_primary_station'
/** 主管队站独立图标图层集合：点击命中时直接复用队站 WMS 弹窗，内容与支撑队站一致 */
export const PRIMARY_STATION_LAYER_CLASSES = new Set<string>([
  INCIDENT_PRIMARY_STATION_LAYER_CLASS,
  DISPATCH_T1_PRIMARY_STATION_LAYER_CLASS,
])

/**
 * 地图元素点击「归一化结果」——所有元素点击取数的统一数据出口。
 * - station：命中主管矢量图标或 WMS 队站（含名称/地址，可直接渲染队站面板）
 * - feature：命中普通 WMS 要素（消防栓/重点单位/机构等，携带原始属性供消费方决定）
 * 消费方（业务 handler 或默认通用面板）基于该结构做后续业务，不在取数管道内做交互。
 */
export type FeatureClickResult =
  | {
      kind: 'station'
      stationId: string
      name?: string
      address?: string
      coordinate: number[]
      source: 'primaryVector' | 'wmsStation'
    }
  | {
      kind: 'feature'
      coordinate: number[]
      /** 命中要素（多图层 GetFeatureInfo 首位，通用面板默认渲染用） */
      feature: WfsFeature
      /** 命中要素全量列表（特化业务可据此挑选本业务要素，避免依赖首位假设） */
      features: WfsFeature[]
      /** 当前已勾选图层配置（通用面板据此匹配要素所属图层名称） */
      items: LayerConfig[]
    }

/**
 * 特化业务 handler：业务方（如调派）注册，对归一化结果做「私有业务处理」。
 * 返回 true / 解析为 true 表示该业务已接管本次点击（抑制通用默认面板）；
 * 返回 false / 未接管 表示回落通用默认面板（公共业务）。
 * 允许同步布尔或 Promise（如特化业务需二次取数时），route() 按注册顺序 await 判定。
 * 高内聚低耦合：取数管道零业务语义，业务动作全部外置于此 seam。
 */
export type FeatureClickHandler = (result: FeatureClickResult) => boolean | Promise<boolean>

export class FeatureClickQuery {
  private readonly map: Map
  private clickListener: EventsKey | null = null
  /** 默认通用详情面板（公共业务），首次需要时惰性创建，随地图生命周期常驻 */
  private defaultPanel: FeatureDetailPanelApi | null = null
  /** 路线信息提供器（调派注入），默认队站面板渲染预计时间/导航距离时读取 */
  private routeInfoProvider: ((stationId: string) => FeatureDetailRouteInfo | null) | null = null
  /**
   * 特化业务 handler 优先级链（业务方注册，调派/消防栓等按序接管）。
   * 通用默认面板始终作为兜底常驻；链中首个返回 true 的 handler 接管本次点击，
   * 全部未接管（或未注册）时回落通用面板。实现「特化优先、通用兜底」的共存语义。
   */
  private businessHandlers: FeatureClickHandler[] = []

  constructor(map: Map) {
    this.map = map
  }

  /** 挂载唯一 singleclick 监听（幂等）。作为所有元素点击取数的唯一公共入口。 */
  public activate() {
    if (this.clickListener) return
    this.clickListener = this.map.on('singleclick', this.handleMapClick.bind(this))
  }

  /** 仅移除 singleclick 监听（共享实例由地图持有者负责整体生命周期）。 */
  public deactivate() {
    if (!this.clickListener) return
    unByKey(this.clickListener)
    this.clickListener = null
  }

  /** 彻底释放（地图卸载）：停监听、注销 handler、销毁默认面板（含从地图移除 overlay）。 */
  public destroy() {
    this.deactivate()
    this.businessHandlers = []
    this.routeInfoProvider = null
    this.defaultPanel?.destroy()
    this.defaultPanel = null
  }

  /** 注入路线信息提供器（调派态），供默认队站面板渲染预计时间/导航距离；传 null 还原。 */
  public setRouteInfoProvider(provider: ((stationId: string) => FeatureDetailRouteInfo | null) | null) {
    this.routeInfoProvider = provider
  }

  /**
   * 注册一个特化业务 handler 并返回其注销函数。
   * handler 按注册顺序作为优先级链参与接管（先注册先判定）；返回的注销函数
   * 用于业务方销毁时移除自身 handler，恢复通用兜底（不影响其它业务方 handler）。
   */
  public addBusinessHandler(handler: FeatureClickHandler): () => void {
    this.businessHandlers.push(handler)
    return () => {
      const index = this.businessHandlers.indexOf(handler)
      if (index >= 0) this.businessHandlers.splice(index, 1)
    }
  }

  /** 程序化打开队站详情（非点击链路，如路径规划选中队站），直接走默认通用面板。 */
  public showStation(station: { id: string; name: string; address: string; coordinate: number[] }) {
    this.createDefaultPanel().openStation({
      id: station.id,
      name: station.name,
      address: station.address,
      coordinate: station.coordinate,
    })
  }

  public close() {
    this.createDefaultPanel().close()
  }

  public getOpenStationId() {
    return this.defaultPanel?.getOpenStationId() ?? null
  }

  private createDefaultPanel(): FeatureDetailPanelApi {
    if (!this.defaultPanel) {
      this.defaultPanel = createFeatureDetailPanel(this.map, (stationId) =>
        this.routeInfoProvider ? this.routeInfoProvider(stationId) : null,
      )
    }
    return this.defaultPanel
  }

  /**
   * 统一点击取数管道（唯一 singleclick）：
   * 命中级联（主管矢量图标 → 队站矢量层 → 队站 WMS → 多图层 WMS）
   * 归一化为 FeatureClickResult 后交给 route() 决策（特化优先、回落通用）。
   */
  private async handleMapClick(evt: MapBrowserEvent) {
    const result = await this.resolveClick(evt)
    if (!result) {
      // resolveClick 返回 null 有两类来源，需区分关闭语义：
      // - 命中 FIRE_STATIONS_LAYER 矢量（resolveClick 内 hasFeatureAtPixel + layerFilter 早退）：
      //   旧设计保留的 closePopup 语义，关闭已打开面板。
      // - 点空白 / 无 WMS 要素命中（queryGenericFeature 返回 null）：不关闭，
      //   保持面板现状（无新数据则保留旧内容，仅手动关闭按钮可关）。
      const vectorStationHit = this.map.hasFeatureAtPixel(evt.pixel, {
        hitTolerance: 6,
        layerFilter: (layer) =>
          layer instanceof VectorLayer && layer.getClassName() === 'FIRE_STATIONS_LAYER',
      })
      if (vectorStationHit) {
        this.close()
      }
      return
    }
    await this.route(result)
  }

  /**
   * 命中级联取数：产出归一化结果。
   * 返回 null 有两类来源（handleMapClick 区分处理）：
   * - 命中 FIRE_STATIONS_LAYER 矢量早退 → 调用方关闭面板（旧 closePopup 语义）；
   * - 点空白 / 无 WMS 要素命中（queryGenericFeature 返回 null）→ 调用方保持面板现状，
   *   仅手动关闭按钮可关（无新数据不自动关）。
   */
  private async resolveClick(evt: MapBrowserEvent): Promise<FeatureClickResult | null> {
    // 主管队站独立 zhu.png 图标为矢量图层，WMS GetFeatureInfo 按像素查不到；
    // 命中主管要素时直接归一化为队站结果，交由 handler/默认面板渲染。
    const primaryStationFeature = this.map.forEachFeatureAtPixel(
      evt.pixel,
      (feature, layer) =>
        layer instanceof VectorLayer && PRIMARY_STATION_LAYER_CLASSES.has(layer.getClassName()) ? feature : undefined,
      { hitTolerance: 6 },
    ) as Feature | undefined
    if (primaryStationFeature) {
      const data = (primaryStationFeature.get('data') ?? {}) as {
        stationId?: string
        name?: string
        address?: string
      }
      const stationId = String(data.stationId ?? primaryStationFeature.get('stationId') ?? '').trim()
      const geometry = primaryStationFeature.getGeometry()
      // 主管队站图标为 Point 几何；Geometry 基类无 getCoordinates，
      // 用结构守卫收窄（不依赖 instanceof，避免跨模块实例判定失效）
      const coordinates = readPointCoordinates(geometry)
      if (stationId && coordinates) {
        return {
          kind: 'station',
          stationId,
          name: data.name ?? '',
          address: data.address ?? '暂无地址',
          coordinate: coordinates,
          source: 'primaryVector',
        }
      }
    }

    // 消防站 WMS 位于路线之上时，路线矢量仍可被像素命中；先查实际可见的队站。
    const stationVectorHit = this.map.hasFeatureAtPixel(evt.pixel, {
      hitTolerance: 6,
      layerFilter: (layer) => layer instanceof VectorLayer && layer.getClassName() === 'FIRE_STATIONS_LAYER',
    })
    if (stationVectorHit) {
      return null
    }

    // 队站 WMS 命中已合并入下方 queryGenericFeature 的多层查询，
    // 按图层前缀归一化为 station 结果（避免二次请求）。

    // 点击命中矢量标注图层（警情/队站/车辆等前端要素层）时的历史逻辑（return 已注释停用）
    // 已合并提炼：实际行为是命中矢量要素后仍继续发起通用 WMS 取数，下方叠加命中。
    // 周边资源范围圈（半透明装饰面）不在此拦截，避免圈内 WMS 要素（消防栓/重点单位）弹不出窗。
    // 面板侧每次打开前会先 close，等价于历史命中矢量时的 closePopup() 语义。

    return this.queryGenericFeature(evt.coordinate)
  }

  /**
   * 读取某 WMS 图层的实时 CQL_FILTER（调派态等会动态改 source params），
   * 无对应可见图层时回落全量 1=1。用于把各层过滤条件回填进合并查询，
   * 让服务端按调派态精确过滤队站，前端无需再维护 dispatchIds 白名单。
   */
  private readLayerCqlFilter(layerName: string): string {
    const layer = this.map
      .getLayers()
      .getArray()
      .find(
        (l) =>
          l instanceof TileLayer &&
          l.getVisible() &&
          l.getSource() instanceof TileWMS &&
          l.getSource()?.getParams().LAYERS === layerName,
      ) as TileLayer<TileWMS> | undefined
    const source = layer?.getSource()
    return source ? String(source.getParams().CQL_FILTER ?? '1=1') : '1=1'
  }

  /**
   * 命中要素归一化：队站 WMS 已并入多图层查询，按命中要素的图层前缀/属性还原为
   * station 结果（与旧 resolveWmsStation 的 kind 口径一致，下游 route() 零改动）；
   * 其余要素归一化为 feature。features 全量仍随结果下发，供特化 handler 自行挑选。
   */
  private normalizeHit(
    preferred: WfsFeature,
    coordinate: number[],
    features: WfsFeature[],
    items: LayerConfig[],
  ): FeatureClickResult {
    const properties = (preferred.properties ?? {}) as Record<string, unknown>
    // 与 featureDetailPanel 的 isStation 口径一致：按 typeName（去 workspace 前缀）匹配，
    // 兼容 feature.id 可能缺 `gis:` 前缀的情况
    const isStation =
      String(preferred.id ?? '').includes(STATION_LAYER_NAME.split(':')[1] ?? STATION_LAYER_NAME) ||
      Boolean(properties.org_name)
    if (isStation) {
      return {
        kind: 'station',
        stationId: String(properties.id ?? '').trim(),
        name: String(properties.org_name ?? ''),
        address: String(properties.org_address ?? '暂无地址'),
        coordinate,
        source: 'wmsStation',
      }
    }
    return {
      kind: 'feature',
      coordinate,
      feature: preferred,
      features,
      items,
    }
  }

  /** 多图层 WMS 通用要素命中：单次 GetFeatureInfo 后按队站前缀归一化 station/feature。 */
  private async queryGenericFeature(coordinate: number[]): Promise<FeatureClickResult | null> {
    const view = this.map.getView()
    const resolution: number = view.getResolution() ?? 0
    const projection = view.getProjection()

    const layersStore = useLayersStore()
    const { checkedIds, items } = storeToRefs(layersStore)
    const layerIds = checkedIds.value.filter((id) => {
      const item = items.value.find((config) => config.id === id)
      return item && !item.useWebMock && !item.noEsSearch
    })

    const panelStore = usePanelStore()

    const queryLayers = [
      // 'gis:mapresource', //ES
      ...layerIds,
      ...(panelStore.circleOpen ? ALL_RESOURCE_TYPES.map(({ layerName }) => layerName) : []),
    ]

    if (!queryLayers.length) return null

    const dummySource = new TileWMS({
      url: geoserverApi.getWMSServiceUrl('gis'),
      params: { LAYERS: queryLayers.join(','), VERSION: '1.1.0' },
    })

    const url = dummySource.getFeatureInfoUrl(coordinate, resolution, projection, {
      INFO_FORMAT: 'application/json',
      FEATURE_COUNT: 20,
    })

    if (!url) return null
    try {
      const urlObj = new URL(url, window.location.origin)
      const data = await geoserverApi.getWMSFeatureInfo({
        layers: queryLayers.join(','),
        query_layers: queryLayers.join(','),
        bbox: urlObj.searchParams.get('BBOX') || urlObj.searchParams.get('bbox') || '',
        width: Number(urlObj.searchParams.get('WIDTH') || urlObj.searchParams.get('width')),
        height: Number(urlObj.searchParams.get('HEIGHT') || urlObj.searchParams.get('height')),
        x: Number(
          urlObj.searchParams.get('X') ||
            urlObj.searchParams.get('x') ||
            urlObj.searchParams.get('I') ||
            urlObj.searchParams.get('i'),
        ),
        y: Number(
          urlObj.searchParams.get('Y') ||
            urlObj.searchParams.get('y') ||
            urlObj.searchParams.get('J') ||
            urlObj.searchParams.get('j'),
        ),
        cql_filter: buildMultiLayerCql(queryLayers.map((layerName) => this.readLayerCqlFilter(layerName))),
        viewparams: queryLayers.map(() => '1=1').join(','),
        feature_count: Number(urlObj.searchParams.get('FEATURE_COUNT') || 20),
        transparent: true,
        format: 'image/png',
        srs: projection.getCode(),
      })

      const features = data?.features ?? []
      if (features.length > 0) {
        // 队站 WMS 已并入本查询：优先挑队站层前缀的要素，挑不到回退首位（保持旧首位语义）
        const layerNamePrefix = String(STATION_LAYER_NAME).split(':')[1] ?? STATION_LAYER_NAME
        const preferred =
          features.find((f) => String(f.id ?? '').includes(layerNamePrefix)) ?? features[0]
        return this.normalizeHit(preferred, coordinate, features, items.value)
      }
      return null
    } catch (error) {
      console.error('Failed to fetch feature info via alova:', error)
      return null
    }
  }

  /**
   * 决策出口：特化业务 handler 优先级链按序 await 判定，均未接管则回落默认通用面板。
   *
   * handler 抢占范围（约定）：
   * - 链按注册顺序执行（先注册先判定），首个返回/解析为 true 的 handler 独占本次点击，
   *   其后 handler 与通用面板均不再处理；返回 false（或未接管）则继续往后判定。
   * - 每个 handler 只接管「自己业务语义内」的归一化结果：
   *   调派队站 handler 仅抢占命中本次立案主管/支撑队站集的 station 结果；
   *   消防栓 handler 仅抢占勾选了消防栓图层且命中消防栓要素的 feature 结果；
   *   命中自身语义之外的结果必须返回 false 放行，不得「吞掉」本应交给通用面板的点击。
   * - 全部 handler 未接管时，station/feature 结果回落默认通用面板（公共业务兜底）。
   * 这样保证「特化优先、通用兜底」的共存语义：特化业务在其范围内生效，范围外仍由公共面板展示。
   */
  private async route(result: FeatureClickResult) {
    for (const handler of this.businessHandlers) {
      if (await handler(result)) return
    }
    const panel = this.createDefaultPanel()
    if (result.kind === 'station') {
      panel.openStation({
        id: result.stationId,
        name: result.name ?? '',
        address: result.address ?? '暂无地址',
        coordinate: result.coordinate,
      })
    } else {
      panel.openFeature(result.coordinate, result.feature, result.items)
    }
  }
}

/**
 * 共享实例注册表：同一 OLMap 仅持有一个 FeatureClickQuery（所有元素点击取数
 * 的唯一公共入口）。map.vue 负责创建与整体生命周期；调派纠缠体 / DispatchT1
 * 等消费者经此取到同一实例，避免多个 singleclick 监听导致重复弹窗。
 */
const sharedFeatureClickQueries = new WeakMap<Map, FeatureClickQuery>()

/** 获取/创建某 OLMap 的共享 FeatureClickQuery 单例（惰性，保证全图唯一）。 */
export const getOrCreateSharedFeatureClickQuery = (map: Map): FeatureClickQuery => {
  let instance = sharedFeatureClickQueries.get(map)
  if (!instance) {
    instance = new FeatureClickQuery(map)
    sharedFeatureClickQueries.set(map, instance)
  }
  return instance
}

/** 仅读取已注册的共享实例（不存在返回 undefined，不自动创建）。 */
export const getSharedFeatureClickQuery = (map: Map): FeatureClickQuery | undefined =>
  sharedFeatureClickQueries.get(map)

/** 地图卸载时释放共享实例注册项（与 destroy 配套，保证无残留）。 */
export const releaseSharedFeatureClickQuery = (map: Map) => {
  sharedFeatureClickQueries.delete(map)
}
