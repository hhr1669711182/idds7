// 用途：管理地图绘制/量算工具的生命周期（从 useCardStore 拆出，消除 store → components 越层）
import Map from 'ol/Map'
import { Type } from 'ol/geom/Geometry'
import { v4 as uuidv4 } from 'uuid'
import { DRAW_TYPES } from '../const/const.map.ts'
import {
  DrawTool,
  PointTool,
  MeasureDistanceTool,
  MeasureAreaTool,
  MeasureAngleTool,
  AzimuthTool,
  SelectExtentTool,
  CircleQueryTool,
  PopulationTool,
  BaseTool,
} from '../components/map/MapTools/index.ts'
import { useCardStore } from '../store/useCardStore'

// 模块级单例：同一时间只有一个活动工具实例（/map 路由下全局唯一）
let currentTool: BaseTool | null = null

export function useDrawTool() {
  const cardStore = useCardStore()

  /** 获取当前工具实例（供 card.vue 清理 feature、trp.vue 传递 circleQueryTool） */
  const getCurrentTool = () => currentTool

  const setMapDrawTool = ({ drawType, map }: { drawType: Type; map: Map }) => {
    if (currentTool instanceof BaseTool) {
      currentTool.destroy()
      cardStore.showUuid = ''
    }
    cardStore.drawToolType = drawType as string

    const uuid = uuidv4().replace(/-/g, '')
    const cb = (data: { type: Type; uuid: string }) => {
      cardStore.addData({ ...data, type: drawType })
    }

    const p = { map, uuid, type: drawType, cb }
    switch (drawType) {
      case DRAW_TYPES.POINT:
        currentTool = new PointTool(p)
        break
      case DRAW_TYPES.LINESTRING:
      case DRAW_TYPES.POLYGON:
      case DRAW_TYPES.CIRCLE:
      case DRAW_TYPES.RECT:
        currentTool = new DrawTool(p)
        break
      case DRAW_TYPES.MEASUREANGLE:
        currentTool = new MeasureAngleTool(p)
        break
      case DRAW_TYPES.MEASUREDISTANCE:
        currentTool = new MeasureDistanceTool(p)
        break
      case DRAW_TYPES.MEASUREPOLYGON:
        currentTool = new MeasureAreaTool(p)
        break
      case DRAW_TYPES.AZIMUTH:
        currentTool = new AzimuthTool(p)
        break
      case DRAW_TYPES.MEASURELENGTH:
        currentTool = new SelectExtentTool(p)
        break
      case DRAW_TYPES.MEASUREAREA:
        currentTool = new CircleQueryTool(p)
        break
      case DRAW_TYPES.POPULATION:
        currentTool = new PopulationTool(p)
        break
      default:
        currentTool = new BaseTool(p)
    }
    currentTool?.init()
  }

  const clearDrawTool = () => {
    if (currentTool instanceof BaseTool) {
      currentTool.destroy()
    }
    currentTool = null
    cardStore.drawToolType = ''
    cardStore.active = ''
    cardStore.showUuid = ''
  }

  return { setMapDrawTool, clearDrawTool, getCurrentTool }
}
