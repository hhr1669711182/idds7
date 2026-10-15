/*
 * @Author: huanghuanrong
 * @Date: 2026-05-09 13:46:55
 * @LastEditTime: 2026-05-09 13:52:18
 * @LastEditors: huanghuanrong
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\router\guard\authGuard.ts
 */
import type { Router } from 'vue-router'
import { NO_REDIRECT_WHITE_LIST } from '@/const/const.common'

const TOKEN_KEY = 'token'
const LOGIN_PATH = '/login'

const hasToken = () => !!localStorage.getItem(TOKEN_KEY)

const isWhiteRoute = (path: string) => NO_REDIRECT_WHITE_LIST.includes(path)

export const setupAuthGuard = (router: Router) => {
  router.beforeEach((to) => {
    if (isWhiteRoute(to.path)) return true

    const requiresAuth = to.matched.some((record) => record.meta.requiresAuth === true)
    
    if (!requiresAuth) return true
    if (hasToken()) return true

    return {
      path: LOGIN_PATH,
      query: {
        redirect: to.fullPath,
      },
    }
  })
}
