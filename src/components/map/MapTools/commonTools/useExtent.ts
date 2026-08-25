import { ZOOM } from '@/baseComponent/OpenlayersMap/const.map'
import Map from 'ol/Map'
import { Extent } from 'ol/extent'
import * as olProj from 'ol/proj'
export interface UseExtentResult {
  /** 限制地图视图在此范围内 */
  constrainView: () => void
  /** 检查坐标是否在范围内 */
  isWithinExtent: (coordinate: [number, number]) => boolean
  /** 限制坐标到范围内 */
  clampCoordinate: (coordinate: [number, number]) => [number, number]
  /** 获取当前限定范围 */
  getExtent: () => Extent
  /** 更新限定范围 */
  setExtent: (extent: Extent) => void
  /** 启用/禁用 */
  setEnabled: (enabled: boolean) => void
  /** 销毁 */
  destroy: () => void
}

export const transformExtent = (extent: Extent, coordSys = 'EPSG:4326') => {
  return olProj.transformExtent(
    extent,
    'EPSG:4326',
    'EPSG:3857'
  )
}

export const useExtent = (map: Map, extent: Extent, options: { mode?: 'flex' | 'fixed', enabled?: boolean } = {}): UseExtentResult => {
  let isListening = false
  let { mode = 'flex', enabled = true } = options
  extent = transformExtent(extent)

  // 限制视图中心在范围内
  let isConstraining = false
  const constrainView = () => {
    if (!enabled || isConstraining) return
    isConstraining = true

    const view = map.getView()
    const center = view.getCenter()
    if (!center) {
      isConstraining = false
      return
    }

    const [minX, minY, maxX, maxY] = extent
    const resolution = view.getResolution()
    if (!resolution) {
      isConstraining = false
      return
    }

    // 计算可见范围
    const size = map.getSize()
    if (!size) {
      isConstraining = false
      return
    }

    const visibleExtent: Extent = [
      center[0] - (size[0] / 2) * resolution,
      center[1] - (size[1] / 2) * resolution,
      center[0] + (size[0] / 2) * resolution,
      center[1] + (size[1] / 2) * resolution,
    ]

    // 检查是否超出边界，如果是则调整中心
    let newCenter: [number, number] = [center[0], center[1]]
    if (visibleExtent[0] < minX) {
      newCenter[0] = minX + (size[0] / 2) * resolution
    } else if (visibleExtent[2] > maxX) {
      newCenter[0] = maxX - (size[0] / 2) * resolution
    }

    if (visibleExtent[1] < minY) {
      newCenter[1] = minY + (size[1] / 2) * resolution
    } else if (visibleExtent[3] > maxY) {
      newCenter[1] = maxY - (size[1] / 2) * resolution
    }

    if (newCenter[0] !== center[0] || newCenter[1] !== center[1]) {
      view.setCenter(newCenter)

      // 限制缩放层级:visible > limit 时拉回
      const maxAllowedResolution: number = Math.max(
        (maxX - minX) / size[0],
        (maxY - minY) / size[1]
      )

      if (resolution > maxAllowedResolution) {
        view.setZoom((view.getZoomForResolution(maxAllowedResolution) || ZOOM.INIT || 0) + 0.1)
      }
    }

    isConstraining = false
  }

  // 检查坐标是否在范围内
  const isWithinExtent = (coordinate: [number, number]): boolean => {
    const [x, y] = coordinate
    const [minX, minY, maxX, maxY] = extent
    return x >= minX && x <= maxX && y >= minY && y <= maxY
  }

  // 将坐标限制在范围内
  const clampCoordinate = (coordinate: [number, number]): [number, number] => {
    const [x, y] = coordinate
    const [minX, minY, maxX, maxY] = extent
    return [
      Math.max(minX, Math.min(maxX, x)),
      Math.max(minY, Math.min(maxY, y)),
    ]
  }

  // 获取当前范围
  const getExtent = (): Extent => extent

  // 更新范围
  const setExtent = (newExtent: Extent) => {
    extent = transformExtent(newExtent)
    if (enabled) constrainView()
  }

  // 启用/禁用
  const setEnabled = (newEnabled: boolean) => {
    enabled = newEnabled
    if (enabled) {
      constrainView()
      addListeners()
    } else {
      removeListeners()
    }
  }

  const addListeners = () => {
    if (isListening) return
    isListening = true
    mode === 'flex' && map.on('moveend', constrainView)
    mode === 'fixed' && map.getView().on('change:center', constrainView)
    mode === 'fixed' && map.getView().on('change:resolution', constrainView)
  }

  const removeListeners = () => {
    if (!isListening) return
    isListening = false
    mode === 'flex' && map.un('moveend', constrainView)
    mode === 'fixed' && map.getView().un('change:center', constrainView)
    mode === 'fixed' && map.getView().un('change:resolution', constrainView)
  }

  // 销毁
  const destroy = () => {
    removeListeners()
  }

  // 初始化
  if (enabled) addListeners()

  return {
    constrainView,
    isWithinExtent,
    clampCoordinate,
    getExtent,
    setExtent,
    setEnabled,
    destroy,
  }
}