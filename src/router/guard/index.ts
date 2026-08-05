/*
 * @Author: huanghuanrong
 * @Date: 2026-05-09 13:47:01
 * @LastEditTime: 2026-05-12 10:30:52
 * @LastEditors: huanghuanrong
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\router\guard\index.ts
 */
import type { Router } from 'vue-router'
import { setupAuthGuard } from './authGuard'
import { setupDynamicRouteGuard } from './dynamicRouteGuard'

export const setupRouterGuard = (router: Router) => {
  setupAuthGuard(router)
  setupDynamicRouteGuard(router)
}
