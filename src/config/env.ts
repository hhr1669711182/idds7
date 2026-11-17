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
  // 同源多标签页互通开关，默认启用；由 register/initMessage.ts 统一绑定到 useMessageStore
  useBroadcastChannel: readEnvString('VITE_USE_BROADCAST_CHANNEL') !== 'false',
  // BC 物理通道名（V1.1 §1.1），未配置时兜底 ids-map-screen-relay
  relayChannelName: readEnvString('VITE_RELAY_CHANNEL_NAME') || 'ids-map-screen-relay',
  // 地图初始中心点（WGS84 [经度, 纬度]），VITE_MAP_CENTER 固定格式 "[经度, 纬度]"，未配置时兜底深圳
  mapCenter: (JSON.parse(readEnvString('VITE_MAP_CENTER') || 'null') as [number, number] | null) ?? [
    113.9354071, 22.54831,
  ],
  // geoserverBaseUrl: stripTrailingSlashes(readEnvString('') + 'geoserver'),
  geoserverBaseUrl: stripTrailingSlashes(readEnvString('VITE_GEOSERVER_URL')),

  // wsUrl 已在上方 appEnv.wsUrl 提供（VITE_WS_URL 门控：本地 mock 测试服务直连 / 留空则按 VITE_MESSAGE_SERVICE_ORIGIN 动态拼接）。

  geoserverWmsUrl: stripTrailingSlashes(readEnvString('VITE_GEOSERVER_WMS_URL')),
  panel25DUrl: readEnvString('VITE_PANEL_25D_URL'),
  panel3DUrl: readEnvString('VITE_PANEL_3D_URL'),
  mapApiBaseUrl: isDev ? '/api' : stripTrailingSlashes(readEnvString('VITE_API_BASE_URL')),
  // mapApiBaseUrl: isDev ? '/a' : stripTrailingSlashes(readEnvString('VITE_MAP_PROXY_API')),
  // 地图平台城市限制：keyword-search 用城市名，input-tips 用 adcode
  mapCity: readEnvString('VITE_MAP_CITY') || '深圳市',
  mapAdcode: readEnvString('VITE_MAP_ADMCODE') || '440300',
  // 地图搜索关键词（原 data.json keywords 字段，已无业务引用，保留供后续扩展）
  mapKeywords: readEnvString('VITE_MAP_KEYWORDS') || '',

  // 路径规划路段衔接门控：默认关闭，仅兜底使用后端已有计算
  routeContinuityEnabled: readEnvString('VITE_ROUTE_CONTINUITY_ENABLED') === 'true',
  // 天气数据源：'new'（主实例 /api/weather 拼音字段，含湿度/预警/温度范围等扩展）| 'amap'（旧高德代理）
  weatherSource: readEnvString('VITE_WEATHER_SOURCE') || 'new',
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
