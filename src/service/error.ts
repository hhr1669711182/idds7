export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  HTTP_ERROR: 'HTTP_ERROR',
  BIZ_ERROR: 'BIZ_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  UNKNOWN: 'UNKNOWN',
} as const

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]

export type AppErrorMeta = {
  silent?: boolean
  showError?: boolean
  cacheFor?: number
  [key: string]: unknown
}

export const DEFAULT_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: '登录已失效，请重新登录',
  FORBIDDEN: '没有访问权限',
  HTTP_ERROR: '网络异常，请稍后重试',
  INVALID_RESPONSE: '服务器返回数据异常',
  UNKNOWN: '请求失败',
}

export class AppError extends Error {
  code: string
  status?: number
  bizCode?: number

  constructor(code: string, status?: number, message?: string, bizCode?: number) {
    super(message || DEFAULT_MESSAGES[code] || code)
    this.name = 'AppError'
    this.code = code
    this.status = status
    this.bizCode = bizCode
  }
}

export const toAppError = (err: unknown): AppError => {
  if (err instanceof AppError) return err
  if (err instanceof Error) {
    const status = (err as any).status ?? (err as any).response?.status
    return new AppError(ERROR_CODES.UNKNOWN, status, err.message)
  }
  return new AppError(ERROR_CODES.UNKNOWN)
}
