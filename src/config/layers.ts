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
  useWebMock?: boolean
  srs?: string  // 'EPSG:4326' | 'EPSG:3857'
  noEsSearch?: boolean
  minZoom?: number
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
    minZoom: 15.5,
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
  //   minZoom: 15.5,
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
    minZoom: 15.5,
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
    minZoom: 15.5,
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
    minZoom: 15.5,
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
    minZoom: 15.5,
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
    minZoom: 15.5,
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
  //   minZoom: 15.5,
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
    minZoom: 15.5,
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
    minZoom: 15.5,
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
    minZoom: 15.5,
  },
  {
    ...dispatchGroup,
    ...categories.combat,
    id: 'gis:env_entrance_exit',
    name: '出入口',
    workspace: 'gis',
    typeName: 'gis:env_entrance_exit',
    order: 18,
    enabled: true,
    visible: false,
    defaultVisible: false,
    icon: 'mdi:gate',
    minZoom: 15.5,
  },
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
    minZoom: 15.5,
  },
  //  {
  //   ...dispatchGroup,
  //   ...categories.safety,
  //   id: 'gis:ssrk',
  //   name: '实时人口',
  //   workspace: 'gis',
  //   typeName: 'gis:ssrk',
  //   order: 18,
  //   enabled: true,
  //   visible: false,
  //   defaultVisible: false,
  //   noEsSearch: true,
  //   useWebMock: false,
  //   icon: 'mdi:car-outline',
  //   minZoom: 15.5,
  // },
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
    minZoom: 15.5,
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
  //   minZoom: 15.5,
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

export const DEFAULT_TOOLBAR_LAYER_CONFIGS: LayerConfig[] = LAYER_SOURCE_CONFIGS
  .filter((config) => config.enabled)
  .map(toLayerConfig)

export const getLayerConfig = (id: string): LayerConfig | undefined =>
  LAYER_CONFIGS.find((config) => config.id === id)

export const DEFAULT_CHECKED_IDS = LAYER_SOURCE_CONFIGS
  .filter((config) => config.enabled)
  .filter((config) => config.visible || config.defaultVisible)
  .map((config) => config.id)

export const LAYER_CONFIG_IDS = LAYER_CONFIGS.map((config) => config.id)
