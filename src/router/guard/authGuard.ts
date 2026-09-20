/*
 * @Author: huanghuanrong
 * @Date: 2026-05-09 13:46:55
 * @LastEditTime: 2026-09-17 11:06:53
 * @LastEditors: hhr
 * @Description: 路由守卫，检查用户是否已登录
 * @FilePath: \ids-gis-web\src\router\guard\authGuard.ts
 */
import type { Router } from 'vue-router'
import { NO_REDIRECT_WHITE_LIST } from '@/const/const.common'
import { useUserStore } from '@/store/useUserStore'

const LOGIN_PATH = '/login'

const isAuthenticated = () => useUserStore().isLoggedIn

const isWhiteRoute = (path: string) => NO_REDIRECT_WHITE_LIST.includes(path)

export const setupAuthGuard = (router: Router) => {
  router.beforeEach((to) => {
    if (isWhiteRoute(to.path)) return true

    const requiresAuth = to.matched.some((record) => record.meta.requiresAuth === true)

    if (!requiresAuth) return true
    if (isAuthenticated()) return true

    return {
      path: LOGIN_PATH,
      query: {
        redirect: to.fullPath,
      },
    }
  })
}