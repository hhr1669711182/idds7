/*&*
 * 车辆状态文案
 * @description: 服务端 VehicleStatus 英文枚举到中文文案的映射（共 7 种）
 * @enum {string}
 */
export const VEHICLE_STATUS_TEXT: Record<string, string> = {
  DAILY_STANDBY: '待命',
  DISPATCHED: '已出动',
  ARRIVED: '到场',
  OPERATION_COMPLETED: '作战完成',
  RETURNED: '归队',
  RETURNING: '途中返回',
  UNAVAILABLE: '不可用',
};
