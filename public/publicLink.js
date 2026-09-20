const isCross = false
const isDev = false
const BASE_LOCATION = isCross ? 'http://192.168.172.115:5173' : (isDev ? window.location.origin : '')

// 预留补充外部配置埋点
export const publicLink = {
  panel25D: BASE_LOCATION + "/ThreejsViewerRegion",
  panel3D: BASE_LOCATION + "/ThreejsViewerBuilding",
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
  dis pa tchMock: true,
}