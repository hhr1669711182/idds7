import { alovaInstance } from './alova'

export const http = {
  get: <T = any>(url: string, config?: any) =>
    alovaInstance.Get<T>(url, config),
  post: <T = any>(url: string, data?: any, config?: any) =>
    alovaInstance.Post<T>(url, data, config),
  put: <T = any>(url: string, data?: any, config?: any) =>
    alovaInstance.Put<T>(url, data, config),
  delete: <T = any>(url: string, data?: any, config?: any) =>
    alovaInstance.Delete<T>(url, data, config),
}

export * from './alova'
export * from './alovaGeo'
export * from './geoserver'
export * from './methods'
