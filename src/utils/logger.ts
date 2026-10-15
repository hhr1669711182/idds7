/**
 * ⚠️ 状态：未接入（暂不使用）。
 *
 * 经团队评估，当前项目没有「导出诊断信息 → 上传 → 分析」的排查流程，
 * 环形缓冲 + 脱敏等能力无人消费，因此暂不接入任何业务代码。
 * 本文件保留作为后续可选能力；启用前请先补齐 QA 排查流程。
 *
 * 注：resolveLevel 直接读 import.meta.env 而非 appEnv，是为保持本文件自包含、
 * 不污染 appEnv（appEnv 未新增 logLevel 字段）。正式接入时需改回 appEnv 读取。
 */

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
  const envLevel = typeof import.meta.env.VITE_LOG_LEVEL === 'string' ? import.meta.env.VITE_LOG_LEVEL.trim() : ''
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
