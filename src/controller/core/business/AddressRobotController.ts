import type { BusinessMapPort } from '../protocol/BusinessMapPort'
import type { AddressRobotGisSearchData } from '../protocol/BusinessProtocol'

/**
 * 地址机器人业务控制器：只依赖 BusinessMapPort，不直接持有地图引擎。
 * 搜索结果的 Feature 构建、样式与渲染全部由底座 AddressRobotRenderer 负责。
 */
export class AddressRobotController {
  constructor(private port: BusinessMapPort) {}

  /** 上报一次地址搜索结果；businessId 用于多槽位下图层隔离，不传则用默认槽位 */
  public addressRobotGisSearch(data: AddressRobotGisSearchData, options?: { businessId?: string }) {
    return this.port.addressRobotGisSearch(data, options)
  }

  /** 清空地址搜索结果图层 */
  public addressRobotClear(options: { businessId?: string } = {}) {
    return this.port.addressRobotClear(options)
  }
}
