import amapRawConfig from '@/assets/map/config/data.json'

type AmapConfigItem = { data?: { city?: string; adcode?: string; keywords?: string; boundaries?: unknown[] } }
const amapConfigData = amapRawConfig as AmapConfigItem[]

const readEnvString = (key: string) => {
  const value = import.meta.env[key] // 拓展读取接口
  return typeof value === 'string' ? value.trim() : ''
}

const stripTrailingSlashes = (value: string) => value.replace(/\/+$/g, '')
const stripSlashes = (value: string) => value.replace(/^\/+|\/+$/g, '')

const isDev = import.meta.env.DEV === true

export const appEnv = {
  isDev,
  appMode: readEnvString('VITE_APP_ENV'),
  // 资源基础路径，来自 vite 的 base（应用形态 './'、库形态 '/'）。
  // 运行期资源（3D 模型 / 字体 / 视频）统一经 @/const/assetPaths 取值，业务代码不直接读本字段。
  assetBase: import.meta.env.BASE_URL,
  apiBaseUrl: stripTrailingSlashes(readEnvString('VITE_API_BASE_URL')),
  useMock: readEnvString('VITE_USE_MOCK') === 'true',
  useWS: readEnvString('VITE_USE_WS') === 'true',
  usePostMessage: readEnvString('VITE_USE_POSTMESSAGE') === 'true',
  wsUrl: readEnvString('VITE_WS_URL'),
  messageServiceOrigin: readEnvString('VITE_MESSAGE_SERVICE_ORIGIN'),
  messageClient: readEnvString('VITE_MESSAGE_CLIENT'),
  // 同源多标签页互通开关与通道名，由 register/initMessage.ts 统一绑定到 useMessageStore
  useBroadcastChannel: readEnvString('VITE_USE_BROADCAST_CHANNEL') === 'true',
  broadcastChannelName: readEnvString('VITE_BROADCAST_CHANNEL_NAME'),
  // 地图初始中心点（WGS84 [经度, 纬度]），VITE_MAP_CENTER 固定格式 "[经度, 纬度]"，未配置时兜底深圳
  mapCenter: (JSON.parse(readEnvString('VITE_MAP_CENTER') || 'null') as [number, number] | null) ?? [
    113.9354071, 22.54831,
  ],
  // geoserverBaseUrl: stripTrailingSlashes(readEnvString('') + 'geoserver'),
  geoserverBaseUrl: stripTrailingSlashes(readEnvString('VITE_GEOSERVER_URL')),

  //wsUrl: readEnvString('VITE_WS_URL'),//当前WebSocket 地址现在由initMessage.ts直接处理，不再通过 appEnv.wsUrl 获取。

  geoserverWmsUrl: stripTrailingSlashes(readEnvString('VITE_GEOSERVER_WMS_URL')),
  panel25DUrl: readEnvString('VITE_PANEL_25D_URL'),
  panel3DUrl: readEnvString('VITE_PANEL_3D_URL'),
  amapApiBaseUrl: isDev ? '/a' : stripTrailingSlashes(readEnvString('VITE_AMAP_PROXY_API')),
  // 高德城市限制：keyword-search 用城市名，input-tips 用 adcode
  amapCity: amapConfigData[0]?.data?.city ?? '深圳市',
  amapAdcode: amapConfigData[0]?.data?.adcode ?? '440300',
}

export const joinUrl = (baseUrl: string, path: string) => {
  const normalizedPath = stripSlashes(path)
  if (!baseUrl) return `/${normalizedPath}`
  return `${stripTrailingSlashes(baseUrl)}/${normalizedPath}`
}

export const getGeoServerServiceUrl = (workspace: string, servicePath: 'ows' | 'wms') => {
  const normalizedWorkspace = stripSlashes(workspace)

  if (servicePath === 'wms' && appEnv.geoserverWmsUrl) {
    if (appEnv.geoserverWmsUrl.includes('{workspace}')) {
      return appEnv.geoserverWmsUrl.replace('{workspace}', normalizedWorkspace)
    }

    if (appEnv.geoserverWmsUrl.endsWith('/wms')) {
      return appEnv.geoserverWmsUrl
    }
  }

  return joinUrl(appEnv.geoserverBaseUrl, `${normalizedWorkspace}/${servicePath}`)
  // return joinUrl(appEnv.geoserverBaseUrl, `/${servicePath}`)
}
