// 用途：GeoServer 可达性探活与降级提示。
// 见 herness/02-技术设计/前端/GIS-W46-路径分析与GeoServer加固-技术方案.md §5.3
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { geoserverApi } from '@/apis/geoserver'

/** 探活结果：未知（未探测）/ 在线 / 离线 */
export type GeoServerHealth = 'unknown' | 'online' | 'offline'

/** 探活超时（毫秒）。取 3s：够覆盖内网 GeoServer 首字节，又不至于让用户干等。 */
export const GEOSERVER_PING_TIMEOUT_MS = 3_000

/**
 * 模块级共享健康态。
 * 探活不阻塞地图渲染：GeoServer 只服务业务图层，底图与前端矢量功能不依赖它，
 * 因此失败时只提示一次并允许重试，不阻断底座初始化。
 * 单例化：多个页面/地图各自调用 useGeoServerHealth() 时共享同一份状态，避免重复探活。
 */
const health = ref<GeoServerHealth>('unknown')
const checking = ref(false)
/** 已提示过离线，避免每次图层请求失败都弹一次 */
let notifiedOffline = false

/**
 * 探测 GeoServer 可达性。
 * @param workspace 目标工作空间；缺省按兜底值
 * @returns 探测是否成功
 */
const check = async (workspace?: string): Promise<boolean> => {
  if (checking.value) return health.value === 'online'
  checking.value = true
  try {
    await geoserverApi.pingGeoServer(workspace, GEOSERVER_PING_TIMEOUT_MS)
    health.value = 'online'
    notifiedOffline = false
    return true
  } catch {
    health.value = 'offline'
    if (!notifiedOffline) {
      notifiedOffline = true
      ElMessage.warning({
        message: 'GIS 图层服务暂不可用，底图与标绘功能不受影响',
        duration: 5000,
      })
    }
    return false
  } finally {
    checking.value = false
  }
}

/** 重试探活（用户手动触发时用）。 */
const retry = async (workspace?: string): Promise<boolean> => {
  notifiedOffline = false
  return check(workspace)
}

/**
 * 获取 GeoServer 健康态。
 * 返回模块级共享的单例状态，保证多消费方一致。
 */
export const useGeoServerHealth = () => {
  return { health, checking, check, retry }
}
