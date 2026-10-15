import { describe, expect, it } from 'vitest'
import { LAYER_SOURCE_CONFIGS } from '@/config/layers'
import {
  createDefaultMapConfig,
  fetchMapConfig,
  getToolbarLayerConfigs,
  getVisibleLayerIds,
  normalizeMapConfig,
  saveMapConfig,
} from '@/config/mapConfig'

/** 提取配置里全部资源 id（已按 order 归一化） */
const allResourceIds = (payload: ReturnType<typeof createDefaultMapConfig>) =>
  payload.layer.groups.flatMap((group) =>
    group.categories.flatMap((category) => category.resources).map((resource) => resource.id),
  )

describe('config/mapConfig 图层配置', () => {
  it('由扁平图层源构建分组树', () => {
    const config = createDefaultMapConfig()
    const group = config.layer.groups[0]

    expect(group.id).toBe('dispatch')
    expect(group.categories.map((category) => category.id)).toEqual(['water', 'alarm', 'combat', 'safety'])
    // 分组/分类/资源三级按 order 归一化后，资源 id 集合应与扁平源一致
    expect([...allResourceIds(config)].sort()).toEqual([...LAYER_SOURCE_CONFIGS.map((r) => r.id)].sort())
  })

  it('工具栏只暴露 enabled 资源', () => {
    const config = createDefaultMapConfig()
    const resources = config.layer.groups.flatMap((group) =>
      group.categories.flatMap((category) => category.resources),
    )

    const disabledId = 'gis:v_srvc_water_hydrant'
    const disabledResource = resources.find((resource) => resource.id === disabledId)
    if (disabledResource) disabledResource.enabled = false

    const expected = resources
      .filter((resource) => resource.enabled && resource.id !== disabledId)
      .map((resource) => resource.id)
      .sort()

    expect(getToolbarLayerConfigs(config).map((layer) => layer.id).sort()).toEqual(expected)
  })

  it('可见资源映射为勾选的图层 id', () => {
    const config = createDefaultMapConfig()
    config.layer.groups.forEach((g) => g.categories.forEach((c) => c.resources.forEach((r) => (r.visible = false))))

    const resource = config.layer.groups[0].categories[0].resources[0]
    resource.enabled = true
    resource.visible = true

    expect(getVisibleLayerIds(config)).toEqual([resource.id])
  })

  it('normalize 会把 disabled 资源的 visible 归零', () => {
    const config = createDefaultMapConfig()
    const resource = config.layer.groups[0].categories[0].resources[0]

    resource.enabled = false
    resource.visible = true

    const normalized = normalizeMapConfig(config)
    const normalizedResource = normalized.layer.groups[0].categories[0].resources[0]

    expect(normalizedResource.enabled).toBe(false)
    expect(normalizedResource.visible).toBe(false)
    expect(getToolbarLayerConfigs(normalized).some((layer) => layer.id === resource.id)).toBe(false)
  })

  it('已保存配置可跨模块重新加载读回（持久化契约）', async () => {
    const config = createDefaultMapConfig()
    config.feature.maxZoom = 17
    config.layer.groups.forEach((g) => g.categories.forEach((c) => c.resources.forEach((r) => (r.visible = false))))

    const target = config.layer.groups.flatMap((g) => g.categories.flatMap((c) => c.resources)).find((resource) => resource.enabled)!
    target.visible = true

    await saveMapConfig(config)
    const loadedInSameSession = await fetchMapConfig()
    const visible = getVisibleLayerIds(loadedInSameSession)

    expect(loadedInSameSession.feature.maxZoom).toBe(17)
    expect(visible).toContain(target.id)
  })

  it('持久化写入 localStorage（跨会话契约）', async () => {
    const key = 'ids-gis-map-config'
    const config = createDefaultMapConfig()
    config.feature.maxZoom = 16

    await saveMapConfig(config)

    // 环境提供 jsdom localStorage；写入必须落到约定的 key 上
    expect(window.localStorage.getItem(key)).toBeTruthy()
    const raw = JSON.parse(window.localStorage.getItem(key)!) as { feature: { maxZoom: number } }
    expect(raw.feature.maxZoom).toBe(16)
  })
})