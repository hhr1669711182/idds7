/*
 * @Author: hhr
 * @Date: 2026-04-16 14:00:56
 * @LastEditTime: 2026-04-24 18:47:24
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\types\global.d.ts
 */
declare global {
  interface Window {
    Live2D: any;
    loadlive2d: any;
  }

  var module: any;
  var exports: any;
  function require(path: string): any;
}


declare type AxiosContentType =
  | 'application/json'
  | 'application/x-www-form-urlencoded'
  | 'multipart/form-data'
  | 'text/plain'

declare type AxiosMethod = 'get' | 'post' | 'delete' | 'put'

declare type AxiosResponseType = 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream'

declare interface AxiosConfig {
  params?: any
  data?: any
  url?: string
  method?: AxiosMethod
  headers?: RawAxiosRequestHeaders
  responseType?: AxiosResponseType
}

declare interface IResponse<T = any> {
  code: number
  data: T extends any ? T : T & any
}

declare module "../../../public/publicLink.js" {
  export const publicLink: {
    d25: string;
    d3: string;
  };
}