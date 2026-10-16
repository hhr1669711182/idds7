/**
 * 选中/编辑交互：封装 ol/interaction/Select + Modify + 右键命中
 * - 单选
 * - Del 键删除
 * - 拖拽顶点 modify 后触发 modified 事件（modifystart 用于历史快照）
 * - 右键命中要素后派发 contextmenu，供视图弹出操作菜单
 */
import Select from 'ol/interaction/Select'
import Modify from 'ol/interaction/Modify'
import type { Map as OLMap } from 'ol'
import type { EventsKey } from 'ol/events'
import Feature_ from 'ol/Feature'
import type Feature from 'ol/Feature'
import { LAYER_NAMES } from '@/baseComponent/OpenlayersMap/layers'
import { unByKey } from 'ol/Observable'

export interface SelectCallbacks {
  onSelect: (featureId: string | number | null) => void
  /** Modify 结束：几何已变更 */
  onModified: (featureId: string | number) => void
  /** Modify 开始：几何即将变更，用于历史快照与围栏约束基线 */
  onModifyStart?: (featureId: string | number) => void
  /** 右键命中要素（未命中返回 null，由调用方决定是否放行默认菜单） */
  onContextMenu?: (featureId: string | number, x: number, y: number) => void
}

export class MarkDrawSelectInteraction {
  readonly map: OLMap
  private select: Select
  private modify: Modify
  private keys: EventsKey[] = []
  private deleting = false

  constructor(map: OLMap, callbacks: SelectCallbacks) {
    this.map = map
    this.select = new Select()
    // pixelTolerance 给到 10px：OL 的 Modify 默认容差很窄，围栏顶点密集，
    // 顶点抓不住会让「地图编辑后表单不同步」看起来像没生效。
    this.modify = new Modify({
      features: this.select.getFeatures(),
      pixelTolerance: 10,
    })
    map.addInteraction(this.select)
    map.addInteraction(this.modify)

    this.keys.push(
      this.select.on('select', () => {
        const f = this.select.getFeatures().item(0)
        callbacks.onSelect(f ? (f.getId() ?? null) : null)
      }),
    )
    this.keys.push(
      this.modify.on('modifyend', (evt) => {
        const features = (evt as { features?: { getArray(): Array<Feature> } }).features
        const arr = features?.getArray() ?? []
        arr.forEach((f) => {
          const id = f.getId?.()
          if (id !== undefined) callbacks.onModified(id)
        })
      }),
    )

    if (callbacks.onModifyStart) {
      const start = callbacks.onModifyStart
      this.keys.push(
        this.modify.on('modifystart', (evt) => {
          const features = (evt as { features?: { getArray(): Array<Feature> } }).features
          const arr = features?.getArray() ?? []
          arr.forEach((f) => {
            const id = f.getId?.()
            if (id !== undefined) start(id)
          })
        }),
      )
    }

    // 右键：命中要素时阻止浏览器默认菜单，派发给视图层
    const viewport = map.getViewport()
    const onContextMenu = (evt: MouseEvent) => {
      if (!callbacks.onContextMenu) return
      evt.preventDefault()
      const id = this.hitFeature(evt)
      if (id === null) return
      callbacks.onContextMenu(id, evt.clientX, evt.clientY)
    }
    viewport.addEventListener('contextmenu', onContextMenu)
    this.detachContextMenu = () => viewport.removeEventListener('contextmenu', onContextMenu)

    this.deleting = false
    viewport.addEventListener('keydown', this.handleKey)
  }

  private detachContextMenu: () => void = () => {}

  /** 视口坐标 → 命中要素 id（按像素容差逐要素粗判，再精确判定） */
  private hitFeature(evt: MouseEvent): string | number | null {
    let rect: DOMRect
    try {
      rect = this.map.getViewport().getBoundingClientRect()
    } catch {
      return null
    }
    const px = evt.clientX - rect.left
    const py = evt.clientY - rect.top
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return null

    // 直接锁定 MarkDraw 的矢量图层，排除高亮覆盖层与底图矢量层
    const vectorLayer = this.map
      .getLayers()
      .getArray()
      .find((l) => (l as unknown as { getClassName?: () => string }).getClassName?.() === LAYER_NAMES.VECTOR_LAYER)
    if (!vectorLayer) return null

    // 复用 OL 自身的命中逻辑，保证面要素内部也能命中
    const hit = this.map.forEachFeatureAtPixel<Feature | undefined>(
      [px, py],
      (feature) => (feature instanceof Feature_ ? feature : undefined),
      { hitTolerance: 6, layerFilter: (l) => l === vectorLayer },
    )
    if (hit) {
      const id = hit.getId?.()
      if (id !== undefined) return id
    }
    return null
  }

  private handleKey = (e: KeyboardEvent) => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return
    const f = this.select.getFeatures().item(0)
    if (!f) return
    e.preventDefault()
    if (this.deleting) return
    this.deleting = true
    const id = f.getId?.()
    if (id !== undefined) this.onDelete?.(id)
    queueMicrotask(() => {
      this.deleting = false
    })
  }

  /** 外部注入删除回调 */
  onDelete: ((featureId: string | number) => void) | null = null

  destroy(): void {
    unByKey(this.keys)
    this.detachContextMenu()
    this.map.removeInteraction(this.modify)
    this.map.removeInteraction(this.select)
    this.map.getViewport().removeEventListener('keydown', this.handleKey)
  }
}
