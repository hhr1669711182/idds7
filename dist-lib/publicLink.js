const isCross = false
const isDev = false

// 预留外部静态文件配置埋点  ---配置入口【config/env.ts】优先级（后台管理接口配置 > 全局配置publicLink > 系统环境配置env > 代码配置）
export const publicLink = {
  apiBase: '/',
  amapProxy: isDev ? '/a' : 'http://192.168.169.28:33082',
  routeApi: 'http://192.168.173.94:8787/api/routes',
  geoserver: '/geoserver',
  geoserverDirect: 'http://192.168.173.198:8080/geoserver/',
  wsUrl: isDev ? 'ws://ids-dev.ks.telewave.tech/message-client/ws' : 'wss://ids-dev.ks.telewave.tech/message-client/ws',
  wsLocal: 'ws://localhost:18080/message-client/ws/ids-seat-web/alarm-debug-user/alarm-debug-session',
  messageOrigin: isDev ? 'https://ids-dev.ks.telewave.tech' : 'https://ids-dev.ks.telewave.tech',
  messageOriginLocal: 'http://localhost:18080',
  messageClient: 'ids-seat-web',
  messageSeatKey: '8001',
  persistSecretKey: '',
  enableDynamicRoutes: false,
  useWs: true,
  usePostMessage: false,
  useMock: true,
  useOnlineIcon: true,
  dispatchMock: true,
}