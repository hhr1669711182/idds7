// 用途：未结案警情 2km 天气圈跨层数据契约。
// 业务控制器（business/）与地图组件（baseComponent/）之间传递警情坐标的最小字段集。

/** 天气圈所需的最小警情数据（从 JRAlarmData 结构化兼容提取） */
export interface WeatherRingAlarm {
  /** 警情 ID */
  incidentId: string
  /** 经度（EPSG:4326） */
  lng: number
  /** 纬度（EPSG:4326） */
  lat: number
}
