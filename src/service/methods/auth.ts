import { alovaInstance } from '../alova'

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
  alovaInstance.Post<LoginVO, LoginDTO>(
    '/command-centers/dispatchers/login',
    payload,
    { meta: { showError: true } }
  )

export const logoutMethod = () =>
  alovaInstance.Post<void, void>(
    '/command-centers/dispatchers/logout',
    undefined,
    { meta: { showError: false, silent: true } }
  )

export const getUserInfoMethod = () =>
  alovaInstance.Get<UserInfoVO>(
    '/command-centers/dispatchers/current',
    { meta: { cacheFor: 5 * 60 * 1000 } }
  )
