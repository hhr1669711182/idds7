import { createAlova } from 'alova'
import VueHook from 'alova/vue'
import adapterFetch from 'alova/fetch'
import { createAlovaMockAdapter } from '@alova/mock'
import router from '@/router'
import { ElMessage } from 'element-plus'
import { appEnv } from '@/config/env'
import { AppError, DEFAULT_MESSAGES, ERROR_CODES, toAppError, type AppErrorMeta } from './error'
import { useUserStore } from '@/store/useUserStore'

const baseURL = appEnv.apiBaseUrl

let requestAdapter: any
if (appEnv.useMock) {
  const mockFiles = import.meta.glob('./mock/**/*.ts', { eager: true })
  const mockGroups: any[] = Object.values(mockFiles).flatMap((module: any) => [
    ...(module.default ? [module.default] : []),
    ...Object.keys(module).filter(k => k !== 'default').map(k => module[k])
  ])
  requestAdapter = mockGroups.length
    ? createAlovaMockAdapter(mockGroups, {
        delay: 500,
        httpAdapter: adapterFetch(),
        enable: true
      })
    : adapterFetch()
} else {
  requestAdapter = adapterFetch()
}

type ApiEnvelope<T> = {
  success: boolean
  message: string
  code: number
  data: T
  timestamp: number
}

const getMethodMeta = (method: any): AppErrorMeta =>
  (method?.config?.meta as AppErrorMeta) ?? {}

const handleUnauthorized = () => {
  // dev 环境下，不处理未授权错误
  if (import.meta.env.DEV) return
  // router.push('/login')
  const currentProtocol = window.location.protocol
  const currentHost = window.location.host
  window.location.href = `${currentProtocol}//${currentHost}/seat-web/login`
}

const showError = (method: any, err: AppError) => {
  const meta = getMethodMeta(method)
  if (meta.silent || meta.showError === false) return
  const msg = err.message || DEFAULT_MESSAGES[err.code] || '请求失败'
  ElMessage.error(msg)
}

const throwInvalidResponse = (status?: number) =>
  new AppError(
    ERROR_CODES.INVALID_RESPONSE,
    status,
    DEFAULT_MESSAGES.INVALID_RESPONSE
  )

export const alovaInstance = createAlova({
  baseURL,
  statesHook: VueHook,
  requestAdapter,
  cacheLogger: false,
  async beforeRequest(method) {
    const token = useUserStore().accessToken
    if (token) {
      method.config.headers['Authorization'] = `Bearer ${token}`
      method.config.headers['clientid'] = 'ids-seat-web'
    }
  },
  responded: {
    onSuccess: async (response) => {
      if (!(response instanceof Response)) return response

      if (response.status === 401) {
        handleUnauthorized()
        throw new AppError(ERROR_CODES.UNAUTHORIZED, 401)
      }
      if (!response.ok) {
        throw new AppError(
          ERROR_CODES.HTTP_ERROR,
          response.status,
          `HTTP ${response.status}`
        )
      }

      const text = await response.text()
      if (!text.trim()) throw throwInvalidResponse(response.status)

      let body: any
      try {
        body = JSON.parse(text)
      } catch {
        throw throwInvalidResponse(response.status)
      }

      const env = body as ApiEnvelope<unknown>
      if (env && typeof env === 'object' && 'success' in env) {
        if (env.success) return env.data
        throw new AppError(
          ERROR_CODES.BIZ_ERROR,
          response.status,
          env.message,
          env.code
        )
      }
      return body
    },
    onError: async (err, method) => {
      let appErr = toAppError(err)
      const status = (err as any)?.status ?? (err as any)?.response?.status
      if (status === 401 && appErr.code !== ERROR_CODES.UNAUTHORIZED) {
        handleUnauthorized()
        appErr = new AppError(ERROR_CODES.UNAUTHORIZED, 401)
      }
      showError(method, appErr)
      throw appErr
    }
  }
})

export type { ApiEnvelope }
