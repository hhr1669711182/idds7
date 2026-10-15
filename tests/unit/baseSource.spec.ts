import { describe, expect, it } from 'vitest'
import {
  BASE_SOURCE_GROUPS,
  BASE_SOURCE_OPTIONS,
  DEFAULT_BASE_SOURCE_ID,
  createBaseSourceSource,
  getBaseSourceById,
} from '@/baseComponent/OpenlayersMap/baseSource'

describe('OpenlayersMap/baseSource 底图注册表', () => {
  it('暴露 7 组 14 个底图（每组 image + road）', () => {
    expect(BASE_SOURCE_GROUPS).toHaveLength(7)
    expect(BASE_SOURCE_OPTIONS).toHaveLength(14)

    for (const group of BASE_SOURCE_GROUPS) {
      expect(group.options).toHaveLength(2)
      expect(group.options.map((option) => option.mode)).toEqual(['image', 'road'])
    }
  })

  it('默认底图为高德路网', () => {
    expect(DEFAULT_BASE_SOURCE_ID).toBe('amap-road')
    expect(getBaseSourceById(DEFAULT_BASE_SOURCE_ID)?.providerId).toBe('amap')
  })

  it('夜间模式仅对支持的底图生效', () => {
    const amapDay = createBaseSourceSource('amap-road')
    const amapNight = createBaseSourceSource('amap-road', { night: true })
    const googleDay = createBaseSourceSource('google-road')
    const googleNight = createBaseSourceSource('google-road', { night: true })

    expect(amapDay.getTileLoadFunction()).not.toBe(amapNight.getTileLoadFunction())
    expect(googleDay.getTileLoadFunction()).toBe(googleNight.getTileLoadFunction())
  })

  it('百度底图复用共享工厂并切换瓦片源', () => {
    const baiduRoad = createBaseSourceSource('baidu-road')
    const baiduImage = createBaseSourceSource('baidu-image')

    expect(baiduRoad.getProjection()?.getCode()).toBe('baidu')
    expect(baiduImage.getProjection()?.getCode()).toBe('baidu')

    const roadUrl = baiduRoad.getTileUrlFunction()!([10, 12, -4], 1, baiduRoad.getProjection()!)
    const imageUrl = baiduImage.getTileUrlFunction()!([10, 12, -4], 1, baiduImage.getProjection()!)

    expect(roadUrl).toMatch(/online[0-3]\.map\.bdimg\.com\/tile/)
    expect(imageUrl).toMatch(/shangetu[0-3]\.map\.bdimg\.com\/it/)
  })
})