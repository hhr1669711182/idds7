import { describe, expect, it } from 'vitest'
import { AppError, DEFAULT_MESSAGES, ERROR_CODES, toAppError } from '@/service/error'

/** 错误归一契约：任何异常都收敛为 AppError，且带上可读的默认文案。 */
describe('service/error 错误归一', () => {
  it('AppError 缺 message 时回落到 DEFAULT_MESSAGES', () => {
    expect(new AppError(ERROR_CODES.UNAUTHORIZED).message).toBe(DEFAULT_MESSAGES.UNAUTHORIZED)
    expect(new AppError(ERROR_CODES.HTTP_ERROR).message).toBe(DEFAULT_MESSAGES.HTTP_ERROR)
  })

  it('AppError 未登记的 code 用 code 本身作文案', () => {
    const error = new AppError('SOME_NEW_CODE')
    expect(error.message).toBe('SOME_NEW_CODE')
  })

  it('AppError 保留 status 与 bizCode', () => {
    const error = new AppError(ERROR_CODES.FORBIDDEN, 403, '没有权限', 1001)
    expect(error.code).toBe('FORBIDDEN')
    expect(error.status).toBe(403)
    expect(error.bizCode).toBe(1001)
    expect(error.message).toBe('没有权限')
    expect(error.name).toBe('AppError')
  })

  it('toAppError 对已是 AppError 的原样返回（幂等）', () => {
    const original = new AppError(ERROR_CODES.BIZ_ERROR, 500)
    expect(toAppError(original)).toBe(original)
  })

  it('toAppError 归一原生 Error，提取 status 与 response.status', () => {
    const plain = toAppError(new Error('boom'))
    expect(plain.code).toBe('UNKNOWN')
    expect(plain.message).toBe('boom')

    const withStatus = Object.assign(new Error('http 500'), { status: 500 })
    expect(toAppError(withStatus).status).toBe(500)

    const withResponse = Object.assign(new Error('http 404'), { response: { status: 404 } })
    expect(toAppError(withResponse).status).toBe(404)
  })

  it('toAppError 对非 Error 值兜底为 UNKNOWN（回归：throw 字符串导致白屏）', () => {
    expect(toAppError('string error').code).toBe('UNKNOWN')
    expect(toAppError(null).code).toBe('UNKNOWN')
    expect(toAppError(undefined).message).toBe(DEFAULT_MESSAGES.UNKNOWN)
    expect(toAppError(123).code).toBe('UNKNOWN')
  })
})
