import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('ol/control/Control', () => ({
  default: class {
    element: HTMLElement
    private currentMap: unknown = null
    constructor(options: { element: HTMLElement }) {
      this.element = options.element
    }
    setMap(map: unknown) {
      this.currentMap = map
    }
    getMap() {
      return this.currentMap
    }
    dispose() {}
  },
}))
vi.mock('@/utils/mapTool', () => ({
  getLayerByClassName: (map: { layers: Record<string, unknown> }, name: string) => map.layers[name],
}))

import SwipeControl from '@/baseComponent/OpenlayersMap/SwipeControl'
import { LAYER_NAMES } from '@/baseComponent/OpenlayersMap/layers'

describe('Swiper 活动实现等价迁位（回归 Control 工具迁移）', () => {
  afterEach(() => vi.restoreAllMocks())

  it('Given 两底图 When attach/拖拽/reset/detach Then 裁剪范围、控件与交互行为保持一致', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const left = { get: vi.fn(), getExtent: () => null, setExtent: vi.fn() }
    const right = { get: vi.fn(), getExtent: () => null, setExtent: vi.fn() }
    const interaction = { setActive: vi.fn() }
    const target = document.createElement('div')
    target.getBoundingClientRect = () => ({ left: 10, width: 100, top: 0, height: 100 }) as DOMRect
    const view = { on: vi.fn(() => null), getProjection: () => ({ getExtent: () => [0, 0, 100, 100] }) }
    const map = {
      layers: { [LAYER_NAMES.AMAP_LAYER]: left, [LAYER_NAMES.GOOGLE_LAYER]: right },
      getLayers: () => ({ getArray: () => [left, right] }),
      getSize: () => [100, 100],
      getCoordinateFromPixel: (pixel: number[]) => pixel,
      getTargetElement: () => target,
      getView: () => view,
      getInteractions: () => [interaction],
      on: vi.fn(),
      un: vi.fn(),
    }
    const control = new SwipeControl()
    Reflect.apply(control.setMap, control, [map])
    const element = Reflect.get(control, 'element') as HTMLElement
    expect(element.querySelectorAll('.handle-dot')).toHaveLength(3)
    expect(left.setExtent).toHaveBeenLastCalledWith([50, 0, 100, 100])
    expect(right.setExtent).toHaveBeenLastCalledWith([0, 0, 50, 100])
    element.dispatchEvent(new MouseEvent('mousedown', { cancelable: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 85, cancelable: true }))
    expect(element.style.left).toBe('75%')
    expect(left.setExtent).toHaveBeenLastCalledWith([75, 0, 100, 100])
    expect(interaction.setActive).toHaveBeenLastCalledWith(false)
    document.dispatchEvent(new MouseEvent('mouseup'))
    expect(interaction.setActive).toHaveBeenLastCalledWith(true)
    control.reset()
    expect(element.style.left).toBe('50%')
    control.destroy()
    expect(left.setExtent).toHaveBeenLastCalledWith(null)
    expect(map.un).toHaveBeenCalled()
  })
})
