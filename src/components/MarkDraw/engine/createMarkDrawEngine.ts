/**
 * MarkDraw 核心引擎（零 Vue 依赖）。
 */
import type { Map as OLMap } from 'ol'
import type Feature from 'ol/Feature'
import { Style, Stroke, Fill, Circle as CircleStyle } from 'ol/style'
import type { StyleLike } from 'ol/style/Style'

import { MarkDrawVectorLayer } from './MarkDrawVectorLayer'
import { MarkDrawSelectInteraction } from './MarkDrawSelectInteraction'
import { MarkDrawHighlight } from './MarkDrawHighlight'
import { MarkDrawEmitter } from './emitter'
import { FeatureHistory } from './FeatureHistory'
import { geometryToLngLat, lngLatToMercator } from '../utils/proj'
import { applyDefaultStyle, isFenceLayer } from '../utils/layerStyle'
import { exportFeatureCollection, importFeatureCollection } from '../utils/geojson'
import { getLayer } from '../view/layerConfig'
import { createTool } from '../tools'
import { coordsOfGeometry, snapFenceToNeighbours, validateFence, type FenceViolation } from '../utils/fenceConstraint'
import { MdMessage } from '../ui/MdMessage'
import { Polygon, MultiPolygon } from 'ol/geom'
import type {
  MarkDrawEngineOptions,
  MarkDrawEventMap,
  MarkDrawEventName,
  MarkDrawFeature,
  MarkDrawLayer,
  MarkDrawToolType,
  CoordArray,
  MarkDrawHistoryState,
  MeasurePayload,
} from './types'

const DEFAULT_STYLE = (tool: MarkDrawToolType): StyleLike => {
  switch (tool) {
    case 'Point':
      return new Style({
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({ color: '#ff0000' }),
          stroke: new Stroke({ color: '#fff', width: 2 }),
        }),
      })
    case 'MILITARY_ARROW':
    case 'MILITARY_DOUBLE_LINE':
    case 'MILITARY_CURVE':
    case 'MILITARY_CLUSTER_ARROW':
    case 'MILITARY_TACTIC':
      return new Style({ stroke: new Stroke({ color: '#e6a23c', width: 3 }) })
    default:
      return new Style({
        stroke: new Stroke({ color: '#ff0000', width: 2 }),
        fill: new Fill({ color: 'rgba(255,0,0,0.2)' }),
      })
  }
}

export type MarkDrawEventListener<K extends MarkDrawEventName> = (payload: MarkDrawEventMap[K][number]) => void

export interface CreateMarkDrawEngineResult {
  addFeature: (feature: Feature, layer?: MarkDrawLayer) => MarkDrawFeature
  removeFeature: (id: string | number) => void
  /** 批量删除：用于「清除元素」等一次性清场 */
  removeFeatures: (ids: Array<string | number>) => number
  /** 清空当前全部绘制要素（含未落库草稿），返回清除数量 */
  clearFeatures: () => number
  updateFeature: (feature: Feature) => MarkDrawFeature | null
  getAll: () => Feature[]
  getById: (id: string | number) => Feature | undefined
  importGeoJSON: (text: string) => Feature[]
  exportGeoJSON: () => string
  setActiveTool: (tool: MarkDrawToolType | null) => void
  getActiveTool: () => MarkDrawToolType | null
  selectById: (id: string | number | null) => void
  flyTo: (feature: Feature) => void
  on: <K extends MarkDrawEventName>(event: K, listener: MarkDrawEventListener<K>) => () => void
  off: <K extends MarkDrawEventName>(event: K, listener: MarkDrawEventListener<K>) => void
  destroy: () => void
  getActiveToolInstance: () => unknown | null
  setActiveToolInstance: (instance: unknown, destroy: () => void) => void
  setActiveLayer: (layer: MarkDrawLayer | null) => void
  getActiveLayer: () => MarkDrawLayer | null
  /** 选中高亮器：外部可读取当前高亮要素数做校验 */
  highlight: MarkDrawHighlight
  vectorLayer: import('ol/layer/Vector').default
  /** 撤销 / 重做：返回被影响的要素 id（无历史时返回 null） */
  undo: () => string | number | null
  redo: () => string | number | null
  /** 历史栈快照：驱动工具栏 / 右键菜单的可用性 */
  getHistoryState: () => MarkDrawHistoryState
  /** 围栏约束校验：保存前可再校验一次，违规返回冲突描述 */
  validateFenceOf: (feature: Feature) => FenceViolation[]
  /** 把围栏顶点吸附到同层相邻围栏边上（贴边，共用同一组经纬度） */
  snapFenceOf: (feature: Feature) => boolean
}

export const createMarkDrawEngine = (map: OLMap, options: MarkDrawEngineOptions = {}): CreateMarkDrawEngineResult => {
  const emitter = new MarkDrawEmitter()
  const vectorLayer = new MarkDrawVectorLayer(map)
  const highlight = new MarkDrawHighlight(map)
  const history = new FeatureHistory()
  const toolState: {
    name: MarkDrawToolType | null
    instance: unknown | null
    destroy?: () => void
  } = { name: null, instance: null }

  const layerCache: Map<string, MarkDrawLayer> = new Map()
  let activeLayer: MarkDrawLayer | null = null

  const toPublicFeature = (f: Feature): MarkDrawFeature => {
    const geom = f.getGeometry()
    let g3857: number[][] | number[][][] = []
    if (geom) {
      g3857 = (geom as unknown as { getCoordinates(): unknown }).getCoordinates() as number[][] | number[][][]
    }
    const props = { ...f.getProperties() }
    delete (props as Record<string, unknown>)['_layerId']
    delete (props as Record<string, unknown>)['_isDirty']
    const layerId = (f.get('_layerId') as string) ?? ''
    return {
      feature: f,
      id: (f.getId() as string | number) ?? '',
      geometry3857: g3857,
      geometryLngLat: geometryToLngLat(g3857),
      properties: props,
      layerId,
      groupId: layerId.split(':')[0] === 'mark' ? 'markdraw' : layerId.split(':')[0],
      isDirty: !!f.get('_isDirty'),
    }
  }

  const addFeature = (feature: Feature, layer?: MarkDrawLayer) => {
    if (layer) {
      feature.set('_layerId', layer.id)
      layerCache.set(layer.id, layer)
    }
    if (layer) {
      // 业务图层要素：按几何类型 + 图层语义上默认样式（围栏 / 图标 / 兜底）
      applyDefaultStyle(feature, layer)
    }
    if (!feature.getStyle()) {
      const t = toolState.name
      feature.setStyle(options.defaultStyle?.[t as MarkDrawToolType] ?? DEFAULT_STYLE(t ?? 'Point'))
    }
    vectorLayer.source.addFeature(feature)
    const pub = toPublicFeature(feature)
    emitter.emit('feature:added', pub)
    return pub
  }

  const removeFeature = (id: string | number) => {
    const f = vectorLayer.source.getFeatureById(id)
    if (!f) return
    vectorLayer.source.removeFeature(f)
    history.prune(aliveIds())
    highlight.highlight(null)
    emitter.emit('feature:removed', toPublicFeature(f))
    emitHistory()
  }

  /** 批量删除：跳过 null id，避免列表/要素不同步时误删 */
  const removeFeatures = (ids: Array<string | number>) => {
    let count = 0
    ids.forEach((id) => {
      if (id === null || id === undefined || id === '') return
      const f = vectorLayer.source.getFeatureById(id)
      if (!f) return
      vectorLayer.source.removeFeature(f)
      highlight.highlight(null)
      emitter.emit('feature:removed', toPublicFeature(f))
      count += 1
    })
    if (count) history.prune(aliveIds())
    return count
  }

  /** 清空全部绘制要素：仅清除内存态，数据库记录保持不变 */
  const clearFeatures = () => {
    // 量算 / 查询工具的图元没有业务 id，不能只按 id 删，直接清空 source
    const removed = vectorLayer.source.getFeatures().length
    vectorLayer.source.clear()
    history.clear()
    highlight.highlight(null)
    emitter.emit('selection:change', null)
    emitHistory()
    return removed
  }

  const updateFeature = (feature: Feature): MarkDrawFeature | null => {
    if (!vectorLayer.source.hasFeature(feature)) {
      vectorLayer.source.addFeature(feature)
    } else {
      vectorLayer.source.changed()
    }
    feature.set('_isDirty', true)
    const pub = toPublicFeature(feature)
    emitter.emit('feature:updated', pub)
    emitter.emit('feature:modified', pub)
    return pub
  }

  const getAll = () => vectorLayer.source.getFeatures()

  /** 当前仍存在于数据源里的要素 id 集合（历史裁剪用） */
  const aliveIds = (): Set<string | number> => {
    const out = new Set<string | number>()
    vectorLayer.source.getFeatures().forEach((f) => {
      const id = f.getId()
      if (id !== undefined) out.add(id)
    })
    return out
  }
  const getById = (id: string | number): Feature | undefined => vectorLayer.source.getFeatureById(id) ?? undefined

  const setActiveTool = (tool: MarkDrawToolType | null) => {
    if (toolState.name === tool) return
    // 先释放上一个工具
    if (toolState.destroy) {
      try {
        toolState.destroy()
      } catch (e) {
        console.warn('[MarkDraw] previous tool destroy failed', e)
      }
    }
    toolState.name = tool
    toolState.instance = null
    toolState.destroy = undefined
    if (tool) {
      try {
        createTool(tool, {
          map,
          vectorLayer: vectorLayer.layer as never,
          onFeature: (f) => {
            addFeature(f, activeLayer ?? undefined)
          },
          onMeasure: (payload: MeasurePayload) => {
            emitter.emit('measure:result', payload)
          },
          setActiveToolInstance: (inst, destroy) => {
            toolState.instance = inst
            toolState.destroy = destroy
          },
        })
      } catch (e) {
        console.error('[MarkDraw] createTool failed', e)
      }
    }
    options.onToolChange?.(tool)
    emitter.emit('tool:change', tool)
  }

  const setActiveToolInstance = (instance: unknown, destroy: () => void) => {
    toolState.instance = instance
    toolState.destroy = destroy
  }

  const getActiveTool = () => toolState.name
  const getActiveToolInstance = () => toolState.instance

  const selectById = (id: string | number | null) => {
    if (id === null) {
      highlight.highlight(null)
      emitter.emit('selection:change', null)
      return
    }
    const f = vectorLayer.source.getFeatureById(id)
    highlight.highlight(f ?? null)
    emitter.emit('selection:change', f ? toPublicFeature(f) : null)
  }

  const flyTo = (feature: Feature) => {
    const geom = feature.getGeometry()
    if (!geom) return
    const view = map.getView()
    const extent = (geom as unknown as { getExtent?: () => number[] }).getExtent?.()
    if (extent) {
      view.fit(extent as never, {
        padding: [80, 80, 80, 80],
        duration: 500,
        maxZoom: 18,
      })
    } else {
      const coord = (geom as unknown as { getFirstCoordinate?: () => number[] }).getFirstCoordinate?.()
      if (coord) view.animate({ center: coord, zoom: 17, duration: 500 })
    }
  }

  const setActiveLayer = (layer: MarkDrawLayer | null) => {
    activeLayer = layer
    if (layer) layerCache.set(layer.id, layer)
    const inst = toolState.instance as unknown as {
      setActiveLayer?: (l: MarkDrawLayer | null) => void
    } | null
    inst?.setActiveLayer?.(layer)
  }
  const getActiveLayer = () => activeLayer

  const on = emitter.on.bind(emitter) as CreateMarkDrawEngineResult['on']
  const off = emitter.off.bind(emitter) as CreateMarkDrawEngineResult['off']

  const importGeoJSON = (text: string): Feature[] => {
    let json
    try {
      json = JSON.parse(text)
    } catch {
      return []
    }
    const features = importFeatureCollection(json, (id) => {
      const cached = layerCache.get(id)
      if (cached) return cached
      return getLayer(id)
    })
    features.forEach((f) => addFeature(f, layerCache.get((f.get('_layerId') as string) ?? '')))
    return features
  }

  const exportGeoJSON = (): string => {
    const fc = exportFeatureCollection(vectorLayer.source.getFeatures(), layerCache)
    return JSON.stringify(fc, null, 2)
  }

  /* ------------------------------------------------------------------ *
   * 撤销 / 重做
   * ------------------------------------------------------------------ */

  const historyState = (): MarkDrawHistoryState => ({
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undoLabel: history.undoLabel,
    redoLabel: history.redoLabel,
    size: history.size,
  })

  const emitHistory = () => emitter.emit('history:change', historyState())

  // 撤销 / 重做后：要素已在 apply 中换几何，这里补一次重绘 + 选中同步
  const afterTravel = (id: string | number | null, verb: '撤销' | '重做') => {
    if (id === null) return
    const f = vectorLayer.source.getFeatureById(id)
    if (!f) return
    f.set('_isDirty', true)
    vectorLayer.source.changed()
    highlight.highlight(f)
    emitter.emit('selection:change', toPublicFeature(f))
    emitter.emit('feature:modified', toPublicFeature(f))
    MdMessage.info(`${verb}成功`)
  }

  const undo = () => {
    const id = history.undo((x) => vectorLayer.source.getFeatureById(x) ?? undefined)
    afterTravel(id, '撤销')
    emitHistory()
    return id
  }

  const redo = () => {
    const id = history.redo((x) => vectorLayer.source.getFeatureById(x) ?? undefined)
    afterTravel(id, '重做')
    emitHistory()
    return id
  }

  /* ------------------------------------------------------------------ *
   * 围栏约束
   * ------------------------------------------------------------------ */

  /** 取同层其它围栏的 4326 坐标（排除自身），供交叠校验与贴边吸附使用 */
  const neighbourFences = (feature: Feature) => {
    const layerId = feature.get('_layerId') as string | undefined
    const id = feature.getId()
    const out: Array<{ id: string | number; coords: CoordArray }> = []
    if (!layerId) return out
    vectorLayer.source.getFeatures().forEach((f) => {
      if (f.getId() === id) return
      if ((f.get('_layerId') as string) !== layerId) return
      const geom = f.getGeometry()
      if (!geom) return
      if (!(geom instanceof Polygon) && !(geom instanceof MultiPolygon)) return
      // 统一转 4326：校验与展示、落库同一口径
      const coords = coordsOfGeometry(geom)
      if (coords) out.push({ id: (f.getId() as string | number) ?? '?', coords: geometryToLngLat(coords) })
    })
    return out
  }

  const validateFenceOf = (feature: Feature): FenceViolation[] => {
    const layerId = feature.get('_layerId') as string | undefined
    const layer = layerId ? (getLayer(layerId) ?? null) : null
    if (!isFenceLayer(layer)) return []
    const coords = coordsOfGeometry(feature.getGeometry())
    if (!coords) return []
    // 与其它围栏同口径（4326）比对
    return validateFence(geometryToLngLat(coords), neighbourFences(feature)).violations
  }

  /**
   * 贴边吸附：把当前围栏顶点吸到同层相邻围栏边上，使两者共用同一条边（同一组经纬度）。
   * 返回是否发生了吸附。
   */
  const snapFenceOf = (feature: Feature): boolean => {
    const layerId = feature.get('_layerId') as string | undefined
    const layer = layerId ? (getLayer(layerId) ?? null) : null
    if (!isFenceLayer(layer)) return false
    const geom = feature.getGeometry()
    const coords = coordsOfGeometry(geom)
    if (!coords) return false
    const neighbours = neighbourFences(feature)
    if (!neighbours.length) return false

    // 在 4326 口径做吸附（与展示、落库一致），再转回 3857 交给地图
    const target4326 = geometryToLngLat(coords)
    const snapped4326 = snapFenceToNeighbours(
      target4326,
      neighbours.map((n) => n.coords),
    )
    if (snapped4326 === target4326) return false

    const snapped3857 = lngLatToMercator(snapped4326)
    if (geom instanceof Polygon) feature.setGeometry(new Polygon(snapped3857 as unknown as number[][][]))
    else if (geom instanceof MultiPolygon)
      feature.setGeometry(new MultiPolygon(snapped3857 as unknown as number[][][][]))
    else return false
    return true
  }
  /** modifystart：几何改动前先记历史快照（围栏还会记住吸附基线） */
  const onModifyStart = (id: string | number) => {
    const f = vectorLayer.source.getFeatureById(id)
    if (!f) return
    history.push(f, '拖拽编辑几何')
  }

  /**
   * modifyend：围栏图层先贴边吸附，再校验是否与同层其它围栏交叠；
   * 违规时回滚到快照并拦截，不让非法几何留在图上。
   */
  const onModified = (id: string | number) => {
    const f = vectorLayer.source.getFeatureById(id)
    if (!f) return
    const snapped = snapFenceOf(f)
    const violations = validateFenceOf(f)
    if (violations.length) {
      history.restoreCurrent(f)
      vectorLayer.source.changed()
      const detail = violations.map((v) => v.message).join('；')
      MdMessage.error(`围栏冲突已回滚：${detail}`)
      return
    }
    history.commit(f)
    f.set('_isDirty', true)
    emitter.emit('feature:modified', toPublicFeature(f))
    if (snapped) MdMessage.info('已贴边吸附到相邻围栏')
    emitHistory()
  }

  let sel: MarkDrawSelectInteraction | null = null
  if (options.selectEnabled !== false) {
    sel = new MarkDrawSelectInteraction(map, {
      onSelect: (id) => {
        if (id === null) {
          highlight.highlight(null)
          emitter.emit('selection:change', null)
          return
        }
        const f = vectorLayer.source.getFeatureById(id)
        highlight.highlight(f ?? null)
        emitter.emit('selection:change', f ? toPublicFeature(f) : null)
      },
      onModifyStart,
      onModified,
      onContextMenu: (id, x, y) => {
        const f = vectorLayer.source.getFeatureById(id)
        if (!f) return
        const layerId = (f.get('_layerId') as string) ?? ''
        const layer = layerId ? (getLayer(layerId) ?? null) : null
        emitter.emit('contextmenu:open', {
          featureId: id,
          x,
          y,
          layerId,
          writable: layer?.writable === true,
          history: historyState(),
        })
      },
    })
    sel.onDelete = (id) => removeFeature(id)
  }

  const engine: CreateMarkDrawEngineResult = {
    addFeature,
    removeFeature,
    removeFeatures,
    clearFeatures,
    updateFeature,
    getAll,
    getById,
    importGeoJSON,
    exportGeoJSON,
    setActiveTool,
    getActiveTool,
    selectById,
    flyTo,
    on,
    off,
    getActiveToolInstance,
    setActiveToolInstance,
    setActiveLayer,
    getActiveLayer,
    highlight,
    vectorLayer: vectorLayer.layer as never,
    undo,
    redo,
    getHistoryState: historyState,
    validateFenceOf,
    snapFenceOf,
    destroy: () => {
      setActiveTool(null)
      sel?.destroy()
      history.clear()
      highlight.destroy()
      emitter.clear()
      vectorLayer.destroy()
      emitter.emit('destroy')
    },
  }
  return engine
}
