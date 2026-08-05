/*
 * @Author: hhr
 * @Date: 2026-04-16 14:00:56
 * @LastEditTime: 2026-04-24 18:46:28
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\const\const.common.ts
 */
export const THEME_COLOR = {
  DAY: "DAY",
  NIGHT: "NIGHT",
};

/**
 * 请求成功状态码
 */
export const SUCCESS_CODE = '1000'

/**
 * 请求contentType
 */
export const CONTENT_TYPE: AxiosContentType = 'application/json'

/**
 * 请求超时时间
 */
export const REQUEST_TIMEOUT = 60000

/**
 * 不重定向白名单
 */
export const NO_REDIRECT_WHITE_LIST = ['/login']

/**
 * 不重置路由白名单
 */
export const NO_RESET_WHITE_LIST = ['Redirect', 'RedirectWrap', 'Login', 'NoFind', 'Root']

/**
 * 表格默认过滤列设置字段
 */
export const DEFAULT_FILTER_COLUMN = ['expand', 'selection']

/**
 * 是否根据headers->content-type自动转换数据格式
 */
export const TRANSFORM_REQUEST_DATA = true

/**
 * 全局图标前缀
 */
export const ICON_PREFIX = 'vi-'
