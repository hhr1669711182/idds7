import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLogger, exportLogs, logger, type LogEntry } from '@/utils/logger'

describe('utils/logger', () => {
  beforeEach(() => {
    logger.setLevel('debug')
    logger.clear()
    vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    logger.setLevel('debug')
  })

  it('按级别过滤：低于当前 level 的日志不输出', () => {
    logger.setLevel('warn')
    const log = createLogger('test')

    log.debug('debug msg')
    log.info('info msg')
    log.warn('warn msg')

    expect(console.debug).not.toHaveBeenCalled()
    expect(console.info).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledOnce()
  })

  it('敏感字段自动脱敏', () => {
    const log = createLogger('auth')
    log.error('login failed', {
      username: 'hhr',
      token: 'secret-token',
      password: '123456',
      nested: { accessToken: 'abc', ok: true },
    })

    const entries = logger.export()
    expect(entries).toHaveLength(1)
    const data = entries[0].data as Record<string, any>
    expect(data.token).toBe('***')
    expect(data.password).toBe('***')
    expect(data.username).toBe('hhr')
    expect(data.nested.accessToken).toBe('***')
    expect(data.nested.ok).toBe(true)
  })

  it('warn / error 入环形缓冲，debug / info 不入', () => {
    const log = createLogger('buffer')
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')

    const entries = logger.export()
    expect(entries.map((e: LogEntry) => e.level)).toEqual(['warn', 'error'])
  })

  it('环形缓冲上限 200，超出丢最旧', () => {
    const log = createLogger('ring')
    for (let i = 0; i < 205; i++) log.warn(`msg-${i}`)

    const entries = logger.export()
    expect(entries).toHaveLength(200)
    expect(entries[0].message).toBe('msg-5')
    expect(entries[199].message).toBe('msg-204')
  })

  it('循环引用不会栈溢出，标记为 Circular', () => {
    const log = createLogger('circular')
    const obj: Record<string, unknown> = { name: 'root' }
    obj.self = obj

    log.error('circular', obj)
    const entries = logger.export()
    expect((entries[0].data as any).self).toBe('[Circular]')
  })

  it('每条日志带 sessionId 与 buildVersion', () => {
    const log = createLogger('meta')
    log.warn('with meta')

    const entry = logger.export()[0]
    expect(entry.sessionId).toBeTruthy()
    expect(entry.buildVersion).toBeTruthy()
    expect(entry.ts).toBeGreaterThan(0)
  })

  it('exportLogs 输出可解析 JSON', () => {
    const log = createLogger('export')
    log.warn('to export')

    const parsed = JSON.parse(exportLogs())
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].message).toBe('to export')
  })
})
