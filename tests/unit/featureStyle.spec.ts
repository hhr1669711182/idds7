import { describe, expect, it } from 'vitest'
import { getStyle, clearStyleCache, getStyleCacheSize, MAP_ICON_SRC } from '@/baseComponent/OpenlayersMap/style'

/**
 * 地图样式注册表契约。
 *
 * 重点回归：vehicle 样式必须每帧独立实例。
 * 历史缺陷是 getStyle('vehicle') 走缓存返回共享单例，调用方再
 * setZIndex / setRotation / setText，导致同 styleId 下多车互相覆盖。
 */
describe('baseComponent/OpenlayersMap/style 样式注册表', () => {
  it('静态样式按参数缓存，重复取值返回同一实例', () => {
    clearStyleCache()
    const first = getStyle('icon', { iconSrc: MAP_ICON_SRC.point, scale: 1.2 })
    const second = getStyle('icon', { iconSrc: MAP_ICON_SRC.point, scale: 1.2 })
    expect(first).toBe(second)
    expect(getStyleCacheSize()).toBe(1)
  })

  it('静态样式参数不同则缓存键不同', () => {
    clearStyleCache()
    const a = getStyle('icon', { iconSrc: MAP_ICON_SRC.point, scale: 1.2 })
    const b = getStyle('icon', { iconSrc: MAP_ICON_SRC.point, scale: 0.8 })
    expect(a).not.toBe(b)
    expect(getStyleCacheSize()).toBe(2)
  })

  it('vehicle 样式每次返回独立实例（回归：串样式缺陷）', () => {
    const first = getStyle('vehicle', {
      src: MAP_ICON_SRC.car,
      rotation: 0,
      scale: 0.65,
      styleId: 'ws:same',
    })
    const second = getStyle('vehicle', {
      src: MAP_ICON_SRC.car,
      rotation: Math.PI / 2,
      scale: 0.65,
      styleId: 'ws:same',
    })
    expect(first).not.toBe(second)
  })

  it('vehicle 改写互不影响：朝向/层级/倒计时各自独立', () => {
    const first = getStyle('vehicle', {
      src: MAP_ICON_SRC.car,
      rotation: 0,
      scale: 0.65,
      styleId: 'ws:a',
      zIndex: 100,
    }) as import('ol/style').Style
    const second = getStyle('vehicle', {
      src: MAP_ICON_SRC.car,
      rotation: Math.PI,
      scale: 0.65,
      styleId: 'ws:b',
      zIndex: 200,
      countdownText: '3min',
    }) as import('ol/style').Style

    first.setZIndex(999)

    expect(first.getZIndex()).toBe(999)
    expect(second.getZIndex()).toBe(200)
    expect((second.getImage() as import('ol/style').Icon).getRotation()).toBeCloseTo(Math.PI)
    expect((first.getImage() as import('ol/style').Icon).getRotation()).toBeCloseTo(0)
    expect(second.getText()?.getText()).toBe('3min')
    expect(first.getText()?.getText()).toBe('')
  })

  it('vehicle 不进静态缓存（避免按 rotation 分桶导致缓存膨胀）', () => {
    clearStyleCache()
    getStyle('vehicle', { src: MAP_ICON_SRC.car, rotation: 0, styleId: 'ws:x' })
    getStyle('vehicle', { src: MAP_ICON_SRC.car, rotation: 1, styleId: 'ws:x' })
    getStyle('vehicle', { src: MAP_ICON_SRC.car, rotation: 2, styleId: 'ws:x' })
    expect(getStyleCacheSize()).toBe(0)
  })

  it('zIndex 参数由工厂内部生效，无需外部 setZIndex', () => {
    const style = getStyle('vehicle', {
      src: MAP_ICON_SRC.car,
      rotation: 0,
      zIndex: 100,
    }) as import('ol/style').Style
    expect(style.getZIndex()).toBe(100)
  })

  it('labelOffsetY 传参生效，未传时用布局默认值', () => {
    const withOffset = getStyle('vehicle', {
      src: MAP_ICON_SRC.car,
      rotation: 0,
      labelOffsetY: -80,
    }) as import('ol/style').Style
    const withoutOffset = getStyle('vehicle', {
      src: MAP_ICON_SRC.car,
      rotation: 0,
    }) as import('ol/style').Style
    expect(withOffset.getText()?.getOffsetY()).toBe(-80)
    expect(withoutOffset.getText()?.getOffsetY()).toBe(-46)
  })

  it('clearStyleCache 只清静态缓存，不影响后续取值', () => {
    getStyle('icon', { iconSrc: MAP_ICON_SRC.point, scale: 1.2 })
    expect(getStyleCacheSize()).toBeGreaterThan(0)
    clearStyleCache()
    expect(getStyleCacheSize()).toBe(0)
    const rebuilt = getStyle('icon', { iconSrc: MAP_ICON_SRC.point, scale: 1.2 })
    expect(rebuilt).toBeTruthy()
  })

  it('fireStation 带出车率时返回图标+进度卡两段样式', () => {
    const style = getStyle('fireStation', {
      iconSrc: MAP_ICON_SRC.primaryStation,
      scale: 0.8,
      deviceGoouts: 3,
      deviceTotal: 10,
    })
    expect(Array.isArray(style)).toBe(true)
    expect((style as import('ol/style').Style[]).length).toBe(2)
  })

  it('fireStation 无出车率参数时返回单图标样式', () => {
    const style = getStyle('fireStation', {
      iconSrc: MAP_ICON_SRC.primaryStation,
      scale: 0.8,
    })
    expect(Array.isArray(style)).toBe(false)
  })

  it('tmcLine 按路况等级返回白底+内线两段样式', () => {
    const style = getStyle('tmcLine', { status: 'jam', width: 6 })
    expect(Array.isArray(style)).toBe(true)
    expect((style as import('ol/style').Style[]).length).toBe(2)
  })
})