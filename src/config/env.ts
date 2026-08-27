/*
 * @Author: hhr
 * @Date: 2026-05-06 17:11:52
 * @LastEditTime: 2026-08-27 16:15:05
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\config\env.ts
 */
const readEnvString = (key: string) => {
  const value = import.meta.env[key]  // 拓展读取接口
  return typeof value === 'string' ? value.trim() : ''
}

const stripTrailingSlashes = (value: string) => value.replace(/\/+$/g, '')
const stripSlashes = (value: string) => value.replace(/^\/+|\/+$/g, '')

const isDev = import.meta.env.DEV === true;

export const appEnv = {
  isDev,
  appMode: readEnvString('VITE_APP_ENV'),
  apiBaseUrl: stripTrailingSlashes(readEnvString('VITE_API_BASE_URL')),
  useMock: readEnvString('VITE_USE_MOCK') === 'true',
  // geoserverBaseUrl: stripTrailingSlashes(readEnvString('') + 'geoserver'),
  geoserverBaseUrl: stripTrailingSlashes(readEnvString('VITE_GEOSERVER_URL')),
  geoserverWmsUrl: stripTrailingSlashes(readEnvString('VITE_GEOSERVER_WMS_URL')),
  wsUrl: readEnvString('VITE_WS_URL'),
  panel25DUrl: readEnvString('VITE_PANEL_25D_URL'),
  panel3DUrl: readEnvString('VITE_PANEL_3D_URL'),
  amapApiBaseUrl: isDev ? '/a' : stripTrailingSlashes(readEnvString('VITE_AMAP_PROXY_API')),
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
