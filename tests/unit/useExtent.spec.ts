import { describe, expect, it, vi } from 'vitest'
import type Map from 'ol/Map'
import type { Extent } from 'ol/extent'

// ol/proj 的投影换算在此桩为恒等，便于用「已投影坐标」直接构造 extent / center，
// 避免引入真实 3857 投影数值。useExtent 内部 transformExtent 走这里。
vi.mock('ol/proj', () => ({
  transformExtent: (extent: Extent) => extent,
}))

import { useExtent } from '@/components/map/MapTools/commonTools/useExtent'

/**
 * 构造一个可编程的 map/view mock：
 * - setCenter / setResolution 会真实改写内部状态，模拟 OL 视图重入（moveend 后再触发 constrainView）；
 * - setZoom / getZoomForResolution 只记录、不改状态 —— 用于断言「钳制不再依赖 setZoom」。
 */
const makeMap = (overrides: { center?: number[]; resolution?: number; size?: number[] } = {}) => {
  const centerArr = [...(overrides.center ?? [4000, 3000])]
  let resolution = overrides.resolution ?? 50
  const view = {
    getCenter: () => [...centerArr],
    getResolution: () => resolution,
    setCenter: vi.fn((c: number[]) => {
      centerArr[0] = c[0]
      centerArr[1] = c[1]
    }),
    setResolution: vi.fn((r: number) => {
      resolution = r
    }),
    setZoom: vi.fn(),
    getZoomForResolution: vi.fn(() => 15),
    on: vi.fn(),
    un: vi.fn(),
  }
  const map = {
    getView: () => view,
    getSize: () => overrides.size ?? [800, 600],
    on: vi.fn(),
    un: vi.fn(),
  } as unknown as Map
  return { map, view }
}

// extent 数值上即 maxAllowed = max(8000/800, 6000/600) = 10
const CHINA_EXTENT: Extent = [0, 0, 8000, 6000]

describe('useExtent 分辨率钳制（限制视图回归）', () => {
  it('超阈值缩小的 zoom-out：一次 setResolution 拉回，重入不再循环，且全程不走 setZoom', () => {
    // Given 分辨率 50（远超阈值 10）
    const { map, view } = makeMap({ resolution: 50 })
    const extent = useExtent(map, CHINA_EXTENT, { mode: 'flex' })

    // When 连续 3 次重入（模拟 moveend 反复触发）
    extent.constrainView()
    extent.constrainView()
    extent.constrainView()

    // Then 分辨率被精确钳到阈值 10，且只发生一次（下次重入 10 > 10 为 false，循环终止）
    expect(view.setResolution).toHaveBeenCalledTimes(1)
    expect(view.setResolution).toHaveBeenCalledWith(10)
    // And 旧实现的 setZoom(小数zoom) 钳制路径彻底废弃（刻度边界死循环的根源）
    expect(view.setZoom).not.toHaveBeenCalled()
  })

  it('刚超阈值的「4.x」临界分辨率：钳一次即稳定，不反复重设', () => {
    // Given 分辨率 10.5（略超阈值 10，对应面板 zoom 4.x 的临界档）
    const { map, view } = makeMap({ resolution: 10.5 })
    const extent = useExtent(map, CHINA_EXTENT, { mode: 'flex' })

    // When 两次重入
    extent.constrainView()
    extent.constrainView()

    // Then 仅第一次触发钳制，第二次分辨率已等于阈值、条件不成立
    expect(view.setResolution).toHaveBeenCalledTimes(1)
    expect(view.setZoom).not.toHaveBeenCalled()
  })

  it('正常缩放范围（未超阈值且中心在界内）：无任何调整动作', () => {
    // Given 分辨率 5 < 阈值 10，中心居中
    const { map, view } = makeMap({ resolution: 5 })
    const extent = useExtent(map, CHINA_EXTENT, { mode: 'flex' })

    // When
    extent.constrainView()

    // Then
    expect(view.setCenter).not.toHaveBeenCalled()
    expect(view.setResolution).not.toHaveBeenCalled()
  })

  it('纯缩放（中心未越界但分辨率超阈值）：分辨率钳制独立于中心钳制，仍会拉回', () => {
    // Given 中心贴角（x 越界量小但 y 在界内），分辨率 50 远超阈值
    const { map, view } = makeMap({ center: [40, 3000], resolution: 50 })
    const extent = useExtent(map, CHINA_EXTENT, { mode: 'flex' })

    // When 单次触发（中心钳制与分辨率钳制是两个独立分支）
    extent.constrainView()

    // Then 即便中心处理路径先发生，分辨率也必须被钳到 10
    expect(view.setResolution).toHaveBeenCalledWith(10)
    expect(view.setZoom).not.toHaveBeenCalled()
  })

  it('模式监听：flex 挂 map moveend，fixed 挂 view change:center/change:resolution，destroy 摘除', () => {
    // Given flex 模式
    const flex = makeMap()
    const flexExtent = useExtent(flex.map, CHINA_EXTENT, { mode: 'flex' })
    expect(flex.map.on).toHaveBeenCalledWith('moveend', expect.any(Function))
    expect(flex.view.on).not.toHaveBeenCalled()

    // Given fixed 模式
    const fixed = makeMap()
    const fixedExtent = useExtent(fixed.map, CHINA_EXTENT, { mode: 'fixed' })
    expect(fixed.view.on).toHaveBeenCalledWith('change:center', expect.any(Function))
    expect(fixed.view.on).toHaveBeenCalledWith('change:resolution', expect.any(Function))

    // When destroy 后不再重复摘除
    flexExtent.destroy()
    fixedExtent.destroy()
    expect(flex.map.un).toHaveBeenCalledTimes(1)
    expect(fixed.view.un).toHaveBeenCalledTimes(2)
  })
})
