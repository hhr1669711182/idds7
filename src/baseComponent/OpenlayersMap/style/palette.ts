import type { AmapTmcStatus } from '@/baseComponent/amap/useAmapTools'
import type { JRAlarmStatus } from '@/baseComponent/amap/mapData'
import { cssVar, withAlpha } from '@/utils/themeColor'

/**
 * 地图样式配色集中在此。
 *
 * OL 的 Stroke / Fill / Text 不认 CSS 变量，必须在绘制时取值；
 * 需要随主题切换的色值统一走 `@/utils/themeColor` 的 cssVar / withAlpha，
 * 保证与面板层（CSS 变量）切换主题时同步生效。
 */

/** 路线主线色：Element Plus 蓝，协议层与调派控制器共用 */
export const ROUTE_LINE_STROKE = '#409eff'

/** 路线外描边：白底衬托，保证深色底图与卫星图上的可读性 */
export const ROUTE_OUTLINE_COLOR = 'rgba(255, 255, 255, 0.96)'

/** 未选中路线：半透明蓝，与 ROUTE_LINE_STROKE 同色系 */
export const ROUTE_UNSELECTED_COLOR = 'rgba(64, 158, 255, 0.5)'

/** 高亮路线外圈：荧光青；实际绘制取主题强调色 */
export const SELECTED_ROUTE_OUTLINE_COLOR = '#00f0ff'

/** 高亮路线外圈的半透明底色 */
export const SELECTED_ROUTE_OUTER_COLOR = 'rgba(0, 240, 255, 0.28)'

/** 缓冲/围栏多边形填充：橙色半透明 */
export const BUFFER_POLYGON_FILL = 'rgba(255, 165, 0, 0.3)'

/** 遮罩填充：黑色半透明 */
export const MASK_FILL = 'rgba(0,0,0,0.12)'

/** 遮罩描边：全透明，仅为显式声明 */
export const MASK_STROKE = 'rgba(0,0,0,0)'

/** 边界线色：蓝 */
export const BOUNDARY_STROKE = '#2563EB'

/** 边界线宽 */
export const BOUNDARY_STROKE_WIDTH = 3

/** 起点圆点色：绿 */
export const ENDPOINT_START_COLOR = '#22C55E'

/** 终点圆点色：红 */
export const ENDPOINT_END_COLOR = '#EF4444'

/** 端点圆点内芯色 */
export const ENDPOINT_INNER_COLOR = '#ffffff'

/** 路况等级配色，key 与 AmapTmcStatus 对齐 */
export const TMC_STATUS_COLOR: Record<AmapTmcStatus, string> = {
  unknown: '#9CA3AF',
  smooth: '#22C55E',
  slow: '#F59E0B',
  jam: '#EF4444',
  serious_jam: '#7F1D1D',
}

/** 取路况配色，未知等级回落灰色 */
export const getTmcStatusColor = (status: AmapTmcStatus): string => TMC_STATUS_COLOR[status] ?? TMC_STATUS_COLOR.unknown

/** 即时警情图标按状态取档位：归队置灰，其余用激活态 */
export const getJRAlarmIconVariant = (status: JRAlarmStatus): 'jrAlarmActive' | 'jrAlarmGray' =>
  status === '归队' ? 'jrAlarmGray' : 'jrAlarmActive'

/** 车辆标签文字色 */
export const VEHICLE_LABEL_TEXT_COLOR = '#FFFFFF'

/** 车辆标签背景：深色半透明胶囊 */
export const VEHICLE_LABEL_BG_COLOR = 'rgba(17, 24, 39, 0.86)'

/** 车辆标签字体 */
export const VEHICLE_LABEL_FONT = '700 12px sans-serif'

/** 车辆历史轨迹全轨迹线颜色，与实时路线蓝区分 */
export const VEHICLE_HISTORY_TRACK_COLOR = '#1D9BF0'

/** 消防站使用率进度条底色 */
export const FIRE_STATION_USAGE_TRACK_COLOR = 'rgba(148,163,184,0.36)'

/** 消防站使用率卡片的文字色 */
export const FIRE_STATION_USAGE_TEXT_COLOR = '#fff'

/** 消防站使用率卡片的底色与描边 */
export const FIRE_STATION_USAGE_CARD_BG = 'rgba(15,23,42,0.88)'
export const FIRE_STATION_USAGE_CARD_STROKE = 'rgba(255,255,255,0.7)'

/** 使用率阈值配色：>=70% 红、>=35% 橙、否则绿 */
export const getFireStationUsageColor = (percent: number): string => {
  if (percent >= 70) return TMC_STATUS_COLOR.jam
  if (percent >= 35) return TMC_STATUS_COLOR.slow
  return TMC_STATUS_COLOR.smooth
}

/** 高亮路线内线：随主题强调色，保证与面板强调色一致 */
export const getSelectedRouteInnerColor = (alpha = 0.7): string =>
  withAlpha(cssVar('--accent-cyan', SELECTED_ROUTE_OUTLINE_COLOR), alpha)
