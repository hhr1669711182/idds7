/**
 * 预留接口：登录 / 登出 / 当前用户信息。
 *
 * 当前尚未接入登录页，暂无调用方。后续对接认证模块时直接复用，
 * 不要在此文件外重新实现同类请求，也不要因为“零引用”清理本文件。
 */
import { alovaInstance } from '@/service/alova'

export type LoginDTO = {
  username: string
  password: string
}

export type LoginVO = {
  token: string
  userId: string
  userName: string
}

export type UserInfoVO = {
  id: string
  name: string
  avatar?: string
  roles: string[]
}

export const loginMethod = (payload: LoginDTO) =>
  alovaInstance.Post<LoginVO, LoginDTO>('/command-centers/dispatchers/login', payload, { meta: { showError: true } })

export const logoutMethod = () =>
  alovaInstance.Post<void, void>('/command-centers/dispatchers/logout', undefined, {
    meta: { showError: false, silent: true },
  })

export const getUserInfoMethod = () =>
  alovaInstance.Get<UserInfoVO>('/command-centers/dispatchers/current', { meta: { cacheFor: 5 * 60 * 1000 } })
