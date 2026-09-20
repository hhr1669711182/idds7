import { useUserStore } from "@/store/useUserStore"

export const MESSAGE_PROTOCOL_VERSION = '1.0.0' as const

export const MESSAGE_CHANNEL = {
  WS: 'ws',
  POST_MESSAGE: 'postMessage',
  LOCAL_STORAGE: 'localStorage',
} as const

/**
 * 模拟来电定位在地图侧使用的固定 callId。
 * 写侧模拟来电的 callId 带 `sim-` 前缀（契约 §7）；blob 本身不携带 callId，
 * 每次模拟来电覆盖刷新同一坐标，故读侧使用稳定 id 便于覆盖绘标与按 id 清除，
 * 且不会波及真实来电的待处理队列。
 */
export const MOCK_CALL_LOCATION_ID = 'sim-call-location'

export type MessageChannel = (typeof MESSAGE_CHANNEL)[keyof typeof MESSAGE_CHANNEL]

/*&*
 * 消息系统
 * @description: 消息系统
 * @enum {string}
 * @property {string} HOST - 主系统
 * @property {string} MAP - 地图系统
 * @property {string} DISPATCH - 分发系统
 * @property {string} PANEL_25D - 25D面板系统
 * @property {string} PANEL_3D - 3D面板系统
 */
export const MESSAGE_SYSTEM = {
  HOST: 'host',
  MAP: 'map',
  THREE: 'three',
  DISPATCH: 'dispatch',
  PANEL_25D: 'panel_25d',
  PANEL_3D: 'panel_3d',
  IDS_SEAT_WEB: 'ids-seat-web',
} as const

export type MessageSystem = (typeof MESSAGE_SYSTEM)[keyof typeof MESSAGE_SYSTEM]

/*&*
 * 消息订阅主题
 * @description: 消息订阅主题
 * @enum {string}
 * @property {string} SEAT - 座位消息
 * @property {string} ALARM_CALL - 来电定位
 * @property {string} ALARM_INCIDENT - 接警问询消息
 * @property {string} GPS_MSG - 车辆GPS消息
 * @property {string} DISASTER_PROFILE - 警情画像
 */
export const MESSAGE_SUBSCRIBE_TOPIC =  {
  SEAT: () => ({ "action":"subscribe","type":"SEAT","key": useUserStore().seatNumber}),
  ALARM_CALL:{"action":"subscribe","type":"CUSTOM","customType":"ALARM_CALL","key":"ANSWER_STATUS_CHANGED"},
  ALARM_INCIDENT:{"action":"subscribe","type":"CUSTOM","customType":"ALARM_INCIDENT","key":"STATE_CHANGED"},
  GPS_MSG:{"action":"subscribe","type":"CUSTOM","customType":"GPS_MSG","key":"car-location-broadcast-all"},
  DISASTER_PROFILE:{"action":"subscribe","type":"CUSTOM","customType":"DISASTER_PROFILE","key":"UPDATED"},
}


/*&*
 * 消息事件键
 * @description: 消息事件键
 * @enum {string}
 * @property {string} HELLO - 欢迎消息
 * @property {string} HEARTBEAT - 心跳消息
 * @property {string} ERROR - 错误消息
 * @property {string} MAP_READY - 地图就绪消息
 * @property {string} MAP_VIEW_CHANGED - 地图视图改变消息
 * @property {string} MAP_CLICK - 地图点击消息
 * @property {string} MAP_POINTER_MOVE - 地图指针移动消息
 * @property {string} LAYER_SET_VISIBLE - 图层可见性设置消息
 * @property {string} LAYER_SET_OPACITY - 图层透明度设置消息
 * @property {string} LAYER_SET_ZINDEX - 图层Z索引设置消息
 */
export const MESSAGE_EVENT_KEY = {
  HELLO: 'hello', // 握手问候，连接建立后首发
  HEARTBEAT: 'heartbeat', // 心跳保活，ping/pong 透传
  ERROR: 'error', // 错误通知

  // 非业务基础层（地图引擎自身的状态与交互事件）
  MAP_READY: 'map.ready', // 地图初始化完成
  MAP_VIEW_CHANGED: 'map.view.changed', // 地图视图（中心/缩放/旋转）变化
  MAP_CLICK: 'map.click', // 地图单击
  MAP_POINTER_MOVE: 'map.pointer.move', // 鼠标指针移动
  MAP_FEATURE_PICK: 'map.feature.pick', // 要素拾取
  MAP_LAYER_VISIBLE_CHANGE: 'map.layer.visible.change', // 图层可见性变化
  MAP_VIEW_STAGECONFIG: 'map.view.stageconfig', // 视图舞台配置下发

  // 1. 通用控制层 (Generic Base Controls)
  MAP_BASE_LOCATE: 'map.base.locate', // 定位到指定坐标
  MAP_BASE_LAYER_TOGGLE: 'map.base.layer_toggle', // 图层开关切换
  MAP_BASE_CLICK: 'map.base.click', // 模拟点击地图
  MAP_BASE_3D_OVERLAY: 'map.base.3d_overlay', // 3D 覆盖物
  MAP_BASE_FIT_BOUNDS: 'map.base.fit_bounds', // 适配视图范围
  MAP_BASE_POI_LOCATION: 'map.base.poiLoation', // POI 定位（拼写遗留：poiLoaction）
  MAP_BASE_MARKER_ADD: 'map.base.marker_add', // 添加标注点
  MAP_BASE_POLYGON_DRAW: 'map.base.polygon_draw', // 绘制多边形
  MAP_BASE_FEATURE_REMOVE: 'map.base.feature_remove', // 移除要素
  MAP_BASE_ES_QUERY: 'map.base.es_query', // ES 空间查询
  MAP_BASE_BUFFER_CALC: 'map.base.buffer_calc', // 缓冲区计算
  MAP_BASE_ROUTE_CALC: 'map.base.route_calc', // 路径计算
  MAP_BASE_SMOOTH_MOVE: 'map.base.smooth_move', // 平滑移动
  MAP_BASE_TRACK_APPEND: 'map.base.track_append', // 追加轨迹点
  MAP_BASE_TRACK_PLAY: 'map.base.track_play', // 轨迹回放控制

  // 2. 业务应用控制层 (Business Application Controls)
  CONFIG_LAYERS: 'config.layers', // 图层配置批量下发
  CONFIG_BASE: 'config.base', // 基础底图配置
  CONFIG_CLEAR_STRATEGY: 'config.clear_strategy', // 清除策略配置

  // 2.1 业务应用--警情画像同步控制层
  ALARM_PROFILE_SYNC: 'alarm.profile.sync', // 警情画像同步
  ALARM_INCIDENT_STATE_CHANGED: 'alarm.incident.state_changed', // 警情画像状态变更
  ALARM_CALL_ANSWER_STATUS_CHANGED: 'alarm.call.answer_status_changed', //  来电接听状态变更
  INCOMING_CALL: 'incoming.call', // 来电通知
  DISASTER_PROFILE_ADDRESS_UPDATED: 'disaster_profile.address_updated', // 画像地址/经纬度变更

  // 视图交互
  LAYER_SET_VISIBLE: 'layer.set.visible', // 设置图层可见性
  MAP_VIEW_LOAD: 'map.view.load', // 视图加载
  LAYER_REFRESH: 'layer.refresh', // 图层刷新

  MAP_LOCATE_CALL: 'map.locate.call', // 来电定位（落地到地图）
  MAP_LOCATE_CALL_REMOVE: 'map.locate.call.remove', // 移除来电定位
  AOI_ES_QUERY: 'aoi.es_query', // AOI 区域 ES 查询
  AOI_ES_GISZONE: 'aoi.es_gisZone', // AOI 区域 GIS 分区查询

  DISPATCH_VIEWPORT_FIT: 'dispatch.viewport.fit', // 调度视口适配
  DISPATCH_RESOURCE_QUERY_HIGHLIGHT: 'dispatch.resource.query.highlight', // 调度资源查询高亮
  DISPATCH_ROUTE_PLAN: 'dispatch.route.plan', // 调度路径规划
  DISPATCH_STATION_ETA_FILTER: 'dispatch.station.eta.filter', // 站点 ETA 过滤
  DISPATCH_ROUTE_TOGGLE: 'dispatch.route.toggle', // 路径开关切换

  TRACKING_VEHICLE_GPS_UPDATE: 'tracking.vehicle.gps.update', // 车辆 GPS 实时更新
  TRACKING_VEHICLE_ROUTE_REALTIME: 'tracking.vehicle.route.realtime', // 车辆实时路径推送

  // 遗留及其他保留控制
  ROUTE_PLAN_RESULT: 'route.plan.result', // 路径规划结果回调
  ADDR_POI_PICK: 'addr.poi.pick', // 地址 POI 拾取
  MAP_LOCATE: 'map.locate', // 地图定位
  MAP_POI_PICK: 'map.poi.pick', // 地图 POI 拾取

  // Address Robot 控制层
  ADDRESS_ROBOT_GIS_SEARCH: 'address_robot.gis_search', // GIS地址机器人jian
  // ADDRESS_ROBOT_GIS_CANDIDATES: 'address_robot.gis_candidates',
  // ADDRESS_ROBOT_CLEAR: 'address_robot.clear',

} as const

export type MessageEventKey = (typeof MESSAGE_EVENT_KEY)[keyof typeof MESSAGE_EVENT_KEY]

/*&*
 * 遗留消息类型映射
 * @description: 遗留消息类型映射
 * @enum {string}
 * @property {string} dispatchUpdate - 分发更新消息
 * @property {string} alarmUpdate - 报警更新消息
 */
// export const LEGACY_MESSAGE_TYPE_MAP = {
//   dispatchUpdate: MESSAGE_EVENT_KEY.DISPATCH_UPDATE,
//   alarmUpdate: MESSAGE_EVENT_KEY.ALARM_UPDATE,
// } as const

// export type LegacyMessageType = keyof typeof LEGACY_MESSAGE_TYPE_MAP
