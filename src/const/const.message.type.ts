export const MESSAGE_PROTOCOL_VERSION = '1.0.0' as const

export const MESSAGE_CHANNEL = {
  WS: 'ws',
  POST_MESSAGE: 'postMessage',
} as const

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
} as const

export type MessageSystem = (typeof MESSAGE_SYSTEM)[keyof typeof MESSAGE_SYSTEM]

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
  HELLO: 'hello',
  HEARTBEAT: 'heartbeat',
  ERROR: 'error',

  // 非业务基础层
  MAP_READY: 'map.ready',
  MAP_VIEW_CHANGED: 'map.view.changed',
  MAP_CLICK: 'map.click',
  MAP_POINTER_MOVE: 'map.pointer.move',
  MAP_FEATURE_PICK: 'map.feature.pick',
  MAP_LAYER_VISIBLE_CHANGE: 'map.layer.visible.change',
  MAP_VIEW_STAGECONFIG: 'map.view.stageconfig',

  // 1. 通用控制层 (Generic Base Controls)
  MAP_BASE_LOCATE: 'map.base.locate',
  MAP_BASE_LAYER_TOGGLE: 'map.base.layer_toggle',
  MAP_BASE_CLICK: 'map.base.click',
  MAP_BASE_3D_OVERLAY: 'map.base.3d_overlay',
  MAP_BASE_FIT_BOUNDS: 'map.base.fit_bounds',
  MAP_BASE_POI_LOCATION: 'map.base.poiLoaction',
  MAP_BASE_MARKER_ADD: 'map.base.marker_add',
  MAP_BASE_POLYGON_DRAW: 'map.base.polygon_draw',
  MAP_BASE_FEATURE_REMOVE: 'map.base.feature_remove',
  MAP_BASE_ES_QUERY: 'map.base.es_query',
  MAP_BASE_BUFFER_CALC: 'map.base.buffer_calc',
  MAP_BASE_ROUTE_CALC: 'map.base.route_calc',
  MAP_BASE_SMOOTH_MOVE: 'map.base.smooth_move',
  MAP_BASE_TRACK_APPEND: 'map.base.track_append',
  MAP_BASE_TRACK_PLAY: 'map.base.track_play',

  // 2. 业务应用控制层 (Business Application Controls)
  CONFIG_LAYERS: 'config.layers',
  CONFIG_BASE: 'config.base',
  CONFIG_CLEAR_STRATEGY: 'config.clear_strategy',

  // 2.1 业务应用--警情画像同步控制层
  ALARM_PROFILE_SYNC: 'alarm.profile.sync',

  // 视图交互
  LAYER_SET_VISIBLE: 'layer.set.visible',
  MAP_VIEW_LOAD: 'map.view.load',
  LAYER_REFRESH: 'layer.refresh',

  MAP_LOCATE_CALL: 'map.locate.call',
  MAP_LOCATE_CALL_REMOVE: 'map.locate.call.remove',
  AOI_ES_QUERY: 'aoi.es_query',
  AOI_ES_GISZONE: 'aoi.es_gisZone',

  DISPATCH_VIEWPORT_FIT: 'dispatch.viewport.fit',
  DISPATCH_RESOURCE_QUERY_HIGHLIGHT: 'dispatch.resource.query.highlight',
  DISPATCH_ROUTE_PLAN: 'dispatch.route.plan',
  DISPATCH_STATION_ETA_FILTER: 'dispatch.station.eta.filter',
  DISPATCH_ROUTE_TOGGLE: 'dispatch.route.toggle',

  TRACKING_VEHICLE_GPS_UPDATE: 'tracking.vehicle.gps.update',
  TRACKING_VEHICLE_ROUTE_REALTIME: 'tracking.vehicle.route.realtime',

  // 遗留及其他保留控制
  ROUTE_PLAN_RESULT: 'route.plan.result',
  ADDR_POI_PICK: 'addr.poi.pick',
  MAP_LOCATE: 'map.locate',
  MAP_POI_PICK: 'map.poi.pick',

  INCOMING_CALL: 'xxx',
  ADDR_SYNC_RESULT: 'xxx',
  ROUTE_PLAN_REQUEST: 'xxx',
  ROUTE_PLAN_MULTIPLE: 'xxx',
  ROUTE_PLAN_CANCEL: 'xxx',

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
