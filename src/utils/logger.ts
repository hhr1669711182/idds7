/**
 * 前端运行日志（轻量自研，不引第三方 APM）。
 *
 * 设计目标：
 * 1. 统一入口，取代业务代码里的裸 console.*；
 * 2. 级别可控，dev 默认 debug、production 默认 warn；
 * 3. 敏感字段自动脱敏；
 * 4. 环形缓冲，保留最近 N 条用于现场导出；
 * 5. 每条日志带 sessionId / userId / buildVersion，便于按会话回溯。
 */
import { appEnv } from '@/config/env'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  ts: number
  level: LogLevel
  namespace: string
  message: string
  data?: unknown
  sessionId: string
  buildVersion: string
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MAX_BUFFER = 200

const SENSITIVE_KEYS = /^(token|accessToken|refreshToken|authorization|password|secret|cookie|sessionKey)$/i

const resolveLevel = (): LogLevel => {
  const envLevel = appEnv.logLevel
  if (envLevel && envLevel in LEVEL_ORDER) return envLevel as LogLevel
  return import.meta.env.DEV ? 'debug' : 'warn'
}

const redact = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value as object)) return '[Circular]'
  seen.add(value as object)

  if (Array.isArray(value)) return value.map((item) => redact(item, seen))

  const output: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEYS.test(key) ? '***' : redact(val, seen)
  }
  return output
}

const createSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

class Logger {
  private level: LogLevel = resolveLevel()
  private buffer: LogEntry[] = []
  private readonly sessionId = createSessionId()
  private readonly buildVersion: string = import.meta.env.VITE_APP_VERSION ?? 'dev'

  setLevel(level: LogLevel): void {
    if (level in LEVEL_ORDER) this.level = level
  }

  getLevel(): LogLevel {
    return this.level
  }

  clear(): void {
    this.buffer = []
  }

  export(): LogEntry[] {
    return [...this.buffer]
  }

  debug(namespace: string, message: string, data?: unknown): void {
    this.write('debug', namespace, message, data)
  }

  info(namespace: string, message: string, data?: unknown): void {
    this.write('info', namespace, message, data)
  }

  warn(namespace: string, message: string, data?: unknown): void {
    this.write('warn', namespace, message, data)
  }

  error(namespace: string, message: string, data?: unknown): void {
    this.write('error', namespace, message, data)
  }

  private write(level: LogLevel, namespace: string, message: string, data?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return

    const entry: LogEntry = {
      ts: Date.now(),
      level,
      namespace,
      message,
      data: data === undefined ? undefined : redact(data),
      sessionId: this.sessionId,
      buildVersion: this.buildVersion,
    }

    // warn / error 入环形缓冲，debug / info 仅在开启时输出不长期保留
    if (level === 'warn' || level === 'error') {
      this.buffer.push(entry)
      if (this.buffer.length > MAX_BUFFER) this.buffer.shift()
    }

    const prefix = `[${entry.buildVersion}][${namespace}]`
    const payload = entry.data === undefined ? [] : [entry.data]
    switch (level) {
      case 'debug':
        console.debug(prefix, message, ...payload)
        break
      case 'info':
        console.info(prefix, message, ...payload)
        break
      case 'warn':
        console.warn(prefix, message, ...payload)
        break
      case 'error':
        console.error(prefix, message, ...payload)
        break
    }
  }
}

export const logger = new Logger()

/** 业务模块统一用这个工厂拿命名空间 logger，避免 namespace 拼错。 */
export const createLogger = (namespace: string) => ({
  debug: (message: string, data?: unknown) => logger.debug(namespace, message, data),
  info: (message: string, data?: unknown) => logger.info(namespace, message, data),
  warn: (message: string, data?: unknown) => logger.warn(namespace, message, data),
  error: (message: string, data?: unknown) => logger.error(namespace, message, data),
})

/** 供 QA / 支持人员一键导出问题现场。 */
export const exportLogs = () => JSON.stringify(logger.export(), null, 2)
