import { LAYER_SOURCE_CONFIGS, toLayerConfig, type LayerConfig, type LayerSourceConfig } from './layers.ts'

export type ConfigTab = 'feature' | 'layer'
export type MapMode = 'dispatch' | 'oneMap'

export const FEATURE_ZOOM_LIMITS = {
  minZoom: { min: 0, max: 12 },
  maxZoom: { min: 12, max: 21 },
} as const

export interface FeatureSettings {
  minZoom: number
  maxZoom: number
  alarmZoom: number
  /** 地图工具-导航组件（平移/复位） */
  showNav: boolean
  /** 地图工具-绘制组件（标点/标线/标面/画圆/画矩形） */
  showDraw: boolean
  /** 地图工具-其它组件（圈选/框选/测量/路况/人口/图源等） */
  showOther: boolean
  showEagleEye: boolean
  /** 指北针/旋转控件 */
  showCompass: boolean
  /** 比例尺控件 */
  showScaleLine: boolean
  /** 天气面板 */
  showWeather: boolean
  /** 实时路况图层 */
  showTraffic: boolean
  /** 路径规划 */
  showRoutePlan: boolean
  /** 实时人口标绘 */
  showPopulation: boolean
  /** 专题图 */
  showTopic: boolean
  /** 清除/设置操作面板 */
  showClear: boolean
  /** 经纬度提示面板 */
  showCoordinate: boolean
  /** 底部图层工具栏 */
  showLayerToolbar: boolean
  /** 圈选查询面板 */
  showCircleQuery: boolean
  /** 调色盘 */
  showPalette: boolean
  mapMode: MapMode
  bufferKm: number
  queryCustomPoi: boolean
  showCaseClosedStyle: boolean
  showUavTrack: boolean
}

/** 功能配置默认值（须与组件当前的「默认显」状态一致，避免保存一次后组件消失） */
export const DEFAULT_FEATURE_SETTINGS: FeatureSettings = {
  minZoom: FEATURE_ZOOM_LIMITS.minZoom.min,
  maxZoom: FEATURE_ZOOM_LIMITS.maxZoom.max,
  alarmZoom: 18,
  showNav: true,
  showDraw: true,
  showOther: true,
  showEagleEye: true,
  showCompass: true,
  showScaleLine: true,
  showWeather: true,
  showTraffic: true,
  showRoutePlan: true,
  showPopulation: true,
  showTopic: true,
  showClear: true,
  showCoordinate: true,
  showLayerToolbar: true,
  showCircleQuery: true,
  showPalette: true,
  mapMode: 'dispatch',
  bufferKm: 0.2,
  queryCustomPoi: true,
  showCaseClosedStyle: true,
  showUavTrack: true,
}

export interface MapLayerResource extends LayerConfig {
  order: number
  enabled: boolean
  visible: boolean
}

export interface MapLayerCategory {
  id: string
  name: string
  order: number
  visible: boolean
  resources: MapLayerResource[]
}

export interface MapLayerGroup {
  id: string
  name: string
  order: number
  visible: boolean
  categories: MapLayerCategory[]
}

export interface MapConfigPayload {
  version: string
  updatedAt: string
  feature: FeatureSettings
  layer: {
    groups: MapLayerGroup[]
  }
}

export const MAP_CONFIG_STORAGE_KEY = 'ids-gis-map-config'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const sourceByLayerId = new Map(LAYER_SOURCE_CONFIGS.map((config) => [config.id, config]))
const sortByOrder = <T extends { order: number }>(items: T[]) => [...items].sort((a, b) => a.order - b.order)

const mapById = <T extends { id: string }>(items: T[]) => new Map(items.map((item) => [item.id, item]))

const getSavedState = (layer?: MapConfigPayload['layer']) => {
  const groups = layer?.groups ?? []
  const categories = new Map<string, MapLayerCategory>()
  const resources = new Map<string, MapLayerResource>()

  groups.forEach((group) => {
    group.categories.forEach((category) => {
      categories.set(`${group.id}:${category.id}`, category)
      category.resources.forEach((resource) => resources.set(resource.id, resource))
    })
  })

  return { groups: mapById(groups), categories, resources }
}

const createResource = (source: LayerSourceConfig, saved?: MapLayerResource): MapLayerResource => {
  const enabled = saved?.enabled ?? source.enabled

  return {
    ...toLayerConfig(source),
    order: saved?.order ?? source.order,
    enabled,
    visible: enabled ? (saved?.visible ?? (source.visible || !!source.defaultVisible)) : false,
  }
}

export const buildLayerGroups = (layer?: MapConfigPayload['layer']): MapLayerGroup[] => {
  const saved = getSavedState(layer)
  const groups = new Map<string, MapLayerGroup>()

  LAYER_SOURCE_CONFIGS.forEach((source) => {
    const savedGroup = saved.groups.get(source.groupId)
    const savedCategory = saved.categories.get(`${source.groupId}:${source.categoryId}`)
    const group = groups.get(source.groupId) ?? {
      id: source.groupId,
      name: source.groupName,
      order: savedGroup?.order ?? source.groupOrder,
      visible: false,
      categories: [],
    }
    const category = group.categories.find((item) => item.id === source.categoryId) ?? {
      id: source.categoryId,
      name: source.categoryName,
      order: savedCategory?.order ?? source.categoryOrder,
      visible: false,
      resources: [],
    }

    category.resources.push(createResource(source, saved.resources.get(source.id)))
    if (!group.categories.some((item) => item.id === category.id)) {
      group.categories.push(category)
    }
    groups.set(group.id, group)
  })

  return sortByOrder(Array.from(groups.values())).map((group, groupIndex) => {
    const categories = sortByOrder(group.categories).map((category, categoryIndex) => {
      const resources = sortByOrder(category.resources).map((resource, resourceIndex) => ({
        ...resource,
        order: resourceIndex + 1,
        visible: resource.enabled ? resource.visible : false,
      }))

      return {
        ...category,
        order: categoryIndex + 1,
        visible: resources.some((resource) => resource.visible),
        resources,
      }
    })

    return {
      ...group,
      order: groupIndex + 1,
      visible: categories.some((category) => category.visible),
      categories,
    }
  })
}

export const createDefaultMapConfig = (): MapConfigPayload => ({
  version: '1',
  updatedAt: new Date().toISOString(),
  feature: { ...DEFAULT_FEATURE_SETTINGS },
  layer: {
    groups: buildLayerGroups(),
  },
})

export const normalizeMapConfig = (payload: MapConfigPayload): MapConfigPayload => {
  const next = clone(payload)
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(Number.isFinite(Number(value)) ? Number(value) : min, min), max)

  // 补齐旧数据缺失的功能字段（向后兼容：缺省取默认值）
  next.feature = { ...DEFAULT_FEATURE_SETTINGS, ...next.feature }
  next.feature.minZoom = clamp(next.feature.minZoom, FEATURE_ZOOM_LIMITS.minZoom.min, FEATURE_ZOOM_LIMITS.minZoom.max)
  next.feature.maxZoom = clamp(next.feature.maxZoom, FEATURE_ZOOM_LIMITS.maxZoom.min, FEATURE_ZOOM_LIMITS.maxZoom.max)
  next.feature.alarmZoom = clamp(next.feature.alarmZoom, next.feature.minZoom, next.feature.maxZoom)
  next.layer.groups = buildLayerGroups(next.layer)

  return next
}

const stripResourceState = ({ order, enabled, visible, ...config }: MapLayerResource): LayerConfig => {
  const source = sourceByLayerId.get(config.id)
  return source ? toLayerConfig(source) : config
}

export const getEnabledLayerConfigs = (payload: MapConfigPayload): LayerConfig[] =>
  normalizeMapConfig(payload).layer.groups.flatMap((group) =>
    group.categories.flatMap((category) =>
      category.resources.filter((resource) => resource.enabled).map(stripResourceState),
    ),
  )

export const getToolbarLayerConfigs = (payload: MapConfigPayload): LayerConfig[] =>
  normalizeMapConfig(payload).layer.groups.flatMap((group) =>
    group.categories.flatMap((category) =>
      category.resources.filter((resource) => resource.enabled).map(stripResourceState),
    ),
  )

export const getVisibleLayerIds = (payload: MapConfigPayload): string[] =>
  normalizeMapConfig(payload).layer.groups.flatMap((group) =>
    group.categories.flatMap((category) =>
      category.resources.filter((resource) => resource.enabled && resource.visible).map((resource) => resource.id),
    ),
  )

/**
 * 配置数据源抽象：集中管理「从哪里读 / 写配置」。
 * 当前默认走 localStorage（离线可用）；预留 HTTP 对接入口（对接 src/apis/common.ts 的
 * getConfigMethod / 保存接口），正式接口就绪后切换 activeMapConfigSource 即可，无需改 store。
 */
export interface MapConfigSource {
  fetchConfig: () => Promise<MapConfigPayload>
  saveConfig: (payload: MapConfigPayload) => Promise<MapConfigPayload>
}

type MapConfigStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const isMapConfigStorage = (value: unknown): value is MapConfigStorage =>
  !!value &&
  typeof (value as MapConfigStorage).getItem === 'function' &&
  typeof (value as MapConfigStorage).setItem === 'function' &&
  typeof (value as MapConfigStorage).removeItem === 'function'

const getMapConfigStorage = (): MapConfigStorage | null => {
  try {
    const storage = globalThis.localStorage
    return isMapConfigStorage(storage) ? storage : null
  } catch {
    return null
  }
}

const readStoredMapConfig = (): MapConfigPayload | null => {
  const storage = getMapConfigStorage()
  const raw = storage?.getItem(MAP_CONFIG_STORAGE_KEY)
  if (!raw) return null

  try {
    return normalizeMapConfig(JSON.parse(raw) as MapConfigPayload)
  } catch {
    storage?.removeItem(MAP_CONFIG_STORAGE_KEY)
    return null
  }
}

const writeStoredMapConfig = (payload: MapConfigPayload) => {
  try {
    getMapConfigStorage()?.setItem(MAP_CONFIG_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // localStorage 不可用或已满时保持内存态；不阻塞保存流程。
  }
}

/** 默认数据源：localStorage（离线可用，兜底 createDefaultMapConfig） */
const localMapConfigSource: MapConfigSource = {
  fetchConfig: async () => readStoredMapConfig() ?? createDefaultMapConfig(),
  saveConfig: async (payload) => {
    const next = normalizeMapConfig({ ...payload, updatedAt: new Date().toISOString() })
    writeStoredMapConfig(next)
    return clone(next)
  },
}

// 预留：HTTP 对接入口（接口就绪后取消注释并令 activeMapConfigSource 指向它）。
// import { getConfigMethod } from '@/apis/common.ts'
// const httpMapConfigSource: MapConfigSource = {
//   fetchConfig: async () => {
//     const remote = await getConfigMethod('mapConfig').send()
//     return normalizeMapConfig(remote as MapConfigPayload)
//   },
//   saveConfig: async (payload) => {
//     await // TODO: 保存接口就绪后接入
//     return normalizeMapConfig(payload)
//   },
// }

export const activeMapConfigSource: MapConfigSource = localMapConfigSource

export const fetchMapConfig = (): Promise<MapConfigPayload> => activeMapConfigSource.fetchConfig()

export const saveMapConfig = (payload: MapConfigPayload): Promise<MapConfigPayload> =>
  activeMapConfigSource.saveConfig(payload)
