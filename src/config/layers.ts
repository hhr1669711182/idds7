import type { MapPhase } from '@/controller/core/protocol/SharedStateProtocol'

/**
 * 图层工具栏展示模式。名字源只两处：
 *  - MapPhase 6 阶段（协议层单一事实源，useUserStore().MapMode 投影）
 *  - 'flood' 特灾模式（shared.mode 业务轴，'normal' 为非特灾基线）
 * GisMapVariant（main/dispatch）是"阶段∈{dispatch,dispatchTrack}‖flood"的聚合布尔，
 * 图层粒度需到阶段级，故此处直接用 MapPhase + flood，不与 variant 混轴。
 */
export type LayerViewMode = MapPhase | 'flood'

export interface LayerConfig {
  id: string
  name: string
  workspace: string
  typeName: string
  wmsUrl?: string
  visible?: boolean
  defaultVisible?: boolean
  icon?: string
  remark?: string
  /** true = 该图层是某模式默认集必备组件，配置面板禁止关闭（enabled 恒 true） */
  locked?: boolean
  useWebMock?: boolean
  srs?: string // 'EPSG:4326' | 'EPSG:3857'
  noEsSearch?: boolean
  minZoom?: number
  /** true = 工具栏隐藏该图层时走 add/remove（释放 WMS source）而非 setVisible（缓存常驻）；用于"不常打开"的图层控内存 */
  disposeOnHide?: boolean
}

export interface LayerSourceConfig extends LayerConfig {
  groupId: string
  groupName: string
  groupOrder: number
  categoryId: string
  categoryName: string
  categoryOrder: number
  order: number
  enabled: boolean
  visible: boolean
}

const dispatchGroup = {
  groupId: 'dispatch',
  groupName: '接处警',
  groupOrder: 1,
}

const categories = {
  water: { categoryId: 'water', categoryName: '水源资源', categoryOrder: 1 },
  alarm: { categoryId: 'alarm', categoryName: '警情资源', categoryOrder: 2 },
  combat: { categoryId: 'combat', categoryName: '作战资源', categoryOrder: 3 },
  safety: { categoryId: 'safety', categoryName: '安全资源', categoryOrder: 4 },
}

export const LAYER_SOURCE_CONFIGS: LayerSourceConfig[] = [
  {
    ...dispatchGroup,
    ...categories.water,
    id: 'gis:env_fire_water',
    name: '消防栓',
    workspace: 'gis',
    typeName: 'gis:env_fire_water',
    order: 1,
    enabled: false,
    visible: false,
    defaultVisible: false,
    icon: 'mdi:fire-hydrant',
    minZoom: 14.5,
  },
  // {
  //   ...dispatchGroup,
  //   ...categories.water,
  //   id: 'gis:xxxx',
  //   name: '自然水源',
  //   workspace: 'gis',
  //   typeName: 'gis:xxxx',
  //   order: 2,
  //   enabled: true,
  //   visible: false,
  //   defaultVisible: false,
  //   icon: 'mdi:water',
  //   minZoom: 14.5,
  // },
  {
    ...dispatchGroup,
    ...categories.alarm,
    id: 'gis:disaster_info',
    name: '未结案警情',
    workspace: 'gis',
    typeName: 'gis:disaster_info',
    order: 1,
    enabled: true,
    visible: false,
    defaultVisible: false,
    icon: 'mdi:alert-circle-outline',
    noEsSearch: true,
    minZoom: 13.5,
  },
  {
    ...dispatchGroup,
    ...categories.combat,
    id: 'gis:view_res_org_dept',
    name: '消防站',
    workspace: 'gis',
    typeName: 'gis:view_res_org_dept',
    order: 1,
    enabled: true,
    visible: true,
    defaultVisible: true,
    icon: 'mdi:fireplace',
    useWebMock: false,
    minZoom: 13.5,
    locked: true,
  },
  {
    ...dispatchGroup,
    ...categories.safety,
    id: 'gis:view_env_enterprises',
    name: '重点单位',
    workspace: 'gis',
    typeName: 'gis:view_env_enterprises',
    order: 1,
    enabled: true,
    visible: false,
    defaultVisible: false,
    icon: 'mdi:office-building',
    minZoom: 13.5,
    disposeOnHide: true,
  },
  {
    ...dispatchGroup,
    ...categories.combat,
    id: 'gis:env_area_fence',
    name: '街道区划',
    workspace: 'gis',
    typeName: 'gis:env_area_fence',
    order: 19,
    enabled: false,
    visible: false,
    defaultVisible: false,
    noEsSearch: true,
    icon: 'mdi:local-area-network',
    minZoom: 13.5,
  },
  {
    ...dispatchGroup,
    ...categories.combat,
    id: 'gis:view_juris_zone',
    name: '队站辖区',
    workspace: 'gis',
    typeName: 'gis:view_juris_zone',
    order: 18,
    enabled: true,
    visible: false,
    defaultVisible: false,
    noEsSearch: true,
    icon: 'mdi:subtitles-outline',
    minZoom: 13.5,
    disposeOnHide: true,
  },
  // {
  //   ...dispatchGroup,
  //   ...categories.safety,
  //   id: 'gis:xxxxx12',
  //   name: '洪涝点',
  //   workspace: 'gis',
  //   typeName: 'gis:xxxxx12',
  //   order: 18,
  //   enabled: true,
  //   visible: false,
  //   defaultVisible: false,
  //   icon: 'mdi:home-flood',
  //   minZoom: 14.5,
  // },
  {
    ...dispatchGroup,
    ...categories.combat,
    id: 'gis:env_build_aoi',
    name: '兴趣面',
    workspace: 'gis',
    typeName: 'gis:env_build_aoi',
    order: 18,
    enabled: true,
    visible: false,
    defaultVisible: false,
    noEsSearch: true,
    icon: 'mdi:surface-area',
    minZoom: 14.5,
    disposeOnHide: true,
  },
  {
    ...dispatchGroup,
    ...categories.combat,
    id: 'gis:env_place_poi',
    name: '兴趣点',
    workspace: 'gis',
    typeName: 'gis:env_place_poi',
    order: 18,
    enabled: false,
    visible: false,
    defaultVisible: false,
    icon: 'mdi:location-radius-outline',
    minZoom: 14.5,
  },
  {
    ...dispatchGroup,
    ...categories.combat,
    id: 'gis:view_env_building',
    name: '建筑',
    workspace: 'gis',
    typeName: 'gis:view_env_building',
    order: 18,
    enabled: true,
    visible: false,
    defaultVisible: false,
    noEsSearch: true,
    icon: 'mdi:home',
    minZoom: 14.5,
    disposeOnHide: true,
  },
  // {
  //   ...dispatchGroup,
  //   ...categories.combat,
  //   id: 'gis:env_entrance_exit',
  //   name: '出入口',
  //   workspace: 'gis',
  //   typeName: 'gis:env_entrance_exit',
  //   order: 18,
  //   enabled: true,
  //   visible: false,
  //   defaultVisible: false,
  //   icon: 'mdi:gate',
  //   minZoom: 14.5,
  // },
  {
    ...dispatchGroup,
    ...categories.combat,
    id: 'gis:env_greatchina_road',
    name: '局部道路',
    workspace: 'gis',
    typeName: 'gis:env_greatchina_road',
    order: 18,
    enabled: true,
    visible: false,
    defaultVisible: false,
    noEsSearch: true,
    icon: 'mdi:road-variant',
    minZoom: 14.5,
    disposeOnHide: true,
  },
  {
    ...dispatchGroup,
    ...categories.safety,
    id: 'gis:ssrk',
    name: '实时人口',
    workspace: 'gis',
    typeName: 'gis:ssrk',
    order: 18,
    enabled: false,
    visible: false,
    defaultVisible: false,
    noEsSearch: true,
    useWebMock: false,
    icon: 'mdi:car-outline',
    minZoom: 14.5,
  },
  {
    ...dispatchGroup,
    ...categories.combat,
    id: 'gis:env_car',
    name: '消防车辆',
    workspace: 'gis',
    typeName: 'gis:fire_vehicle',
    order: 18,
    enabled: false,
    visible: false,
    defaultVisible: false,
    noEsSearch: true,
    useWebMock: true,
    icon: 'mdi:car-outline',
    minZoom: 14.5,
  },
  // {
  //   ...dispatchGroup,
  //   ...categories.alarm,
  //   id: 'gis:incoming_call',
  //   name: '来电定位',
  //   workspace: 'gis',
  //   typeName: 'gis:incoming_call',
  //   order: 19,
  //   enabled: true,
  //   visible: true,
  //   defaultVisible: true,
  //   noEsSearch: true,
  //   useWebMock: true,
  //   icon: 'mdi:phone-incoming',
  //   minZoom: 14.5,
  // },
]

export const toLayerConfig = ({
  groupId,
  groupName,
  groupOrder,
  categoryId,
  categoryName,
  categoryOrder,
  order,
  enabled,
  visible,
  ...config
}: LayerSourceConfig): LayerConfig => config

export const LAYER_CONFIGS: LayerConfig[] = LAYER_SOURCE_CONFIGS.map(toLayerConfig)

export const DEFAULT_TOOLBAR_LAYER_CONFIGS: LayerConfig[] = LAYER_SOURCE_CONFIGS.filter((config) => config.enabled).map(
  toLayerConfig,
)

export const getLayerConfig = (id: string): LayerConfig | undefined => LAYER_CONFIGS.find((config) => config.id === id)

export const DEFAULT_CHECKED_IDS = LAYER_SOURCE_CONFIGS.filter((config) => config.enabled)
  .filter((config) => config.visible || config.defaultVisible)
  .map((config) => config.id)

export const LAYER_CONFIG_IDS = LAYER_CONFIGS.map((config) => config.id)

/**
 * 各展示模式（LayerViewMode）的默认勾选集。
 * 全键 Record，TS 编译期强制 7 个模式（MapPhase 6 + flood）都有配置，漏配即报错。
 * - loggedOut：无图层
 * - onDuty/popup/inquiry：主图默认集
 * - dispatch/dispatchTrack/flood：保留原 useDispatchMapStore「仅消防站」语义
 *   （dispatchTrack、flood 今天与 dispatch 同值，未来独立改对应行即可）
 */
export const LAYER_MODE_DEFAULT_CHECKED_IDS: Record<LayerViewMode, string[]> = {
  loggedOut: [],
  onDuty: [...DEFAULT_CHECKED_IDS],
  popup: [...DEFAULT_CHECKED_IDS],
  inquiry: [...DEFAULT_CHECKED_IDS],
  dispatch: ['gis:view_res_org_dept'],
  dispatchTrack: ['gis:view_res_org_dept'],
  flood: ['gis:view_res_org_dept'],
}

/**
 * 各展示模式工具栏隐藏图层（白名单过滤源；缺省 = 全显示）。
 * 全键 Record，与默认集表同粒度。字面量 id 避免与 baseComponent/OpenlayersMap/layers.ts
 * 的 TEMP_FRONTEND_LAYER_IDS 形成循环 import（该文件反向依赖本文件的 getLayerConfig）。
 * 'gis:disaster_info' = TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER（今日灾害点，调派态隐藏）。
 */
export const LAYER_MODE_HIDDEN_LAYER_IDS: Record<LayerViewMode, string[]> = {
  loggedOut: [],
  onDuty: [],
  popup: [],
  inquiry: [],
  dispatch: ['gis:disaster_info'],
  dispatchTrack: ['gis:disaster_info'],
  flood: ['gis:disaster_info'],
}
