/**
 * 消息拦截器框架 - 类似 Java AOP 注解拦截器
 * 提供可扩展的消息预处理管道，支持优先级和条件匹配
 */

// ==================== 核心类型定义 ====================

/** 消息拦截器匹配条件 */
export interface InterceptorMatchCondition {
  /** 匹配的事件键（支持正则表达式字符串或函数） */
  eventKey?: string | RegExp | ((eventKey: string) => boolean)
  /** 匹配的消息类型/协议 */
  messageType?: string
  /** 匹配的数据结构字段 */
  dataFields?: string[]
  /** 自定义匹配函数 */
  matcher?: (raw: unknown, eventKey?: string) => boolean
}

/** 拦截器执行上下文 */
export interface InterceptorContext {
  /** 原始消息 */
  raw: unknown
  /** 提取的事件键 */
  eventKey?: string
  /** 消息通道 */
  channel: string
  /** 来源系统 */
  system: string
  /** 附加元数据 */
  meta?: Record<string, unknown>
}

/** 拦截器处理结果 */
export interface InterceptorResult {
  /** 是否匹配并处理了此消息 */
  matched: boolean
  /** 处理后的消息数据 */
  data?: unknown
  /** 提取的eventKey */
  eventKey?: string
  /** 是否停止后续拦截器执行 */
  stopPropagation?: boolean
  /** 附加元数据 */
  meta?: Record<string, unknown>
}

/** 拦截器函数类型 */
export type MessageInterceptor = (
  context: InterceptorContext,
) => InterceptorResult | Promise<InterceptorResult>

/** 拦截器配置 */
export interface InterceptorConfig {
  /** 唯一标识 */
  id: string
  /** 拦截器名称（用于日志） */
  name: string
  /** 匹配条件 */
  match: InterceptorMatchCondition
  /** 拦截器函数 */
  handler: MessageInterceptor
  /** 优先级，数字越小越先执行（类似 @Order 注解） */
  priority?: number
  /** 是否启用 */
  enabled?: boolean
}

// ==================== 拦截器注册表 ====================

/** 拦截器注册表类 - 单例模式 */
class InterceptorRegistry {
  private interceptors: InterceptorConfig[] = []
  private initialized = false

  /**
   * 注册拦截器（类似 Java @Interceptor 注解）
   */
  register(config: InterceptorConfig): () => void {
    const priority = config.priority ?? 0
    const insertIndex = this.interceptors.findIndex((i) => (i.priority ?? 0) > priority)
    if (insertIndex === -1) {
      this.interceptors.push(config)
    } else {
      this.interceptors.splice(insertIndex, 0, config)
    }
    this.initialized = true

    // 返回取消注册函数
    return () => {
      const index = this.interceptors.findIndex((i) => i.id === config.id)
      if (index !== -1) {
        this.interceptors.splice(index, 1)
      }
    }
  }

  /**
   * 批量注册拦截器
   */
  registerAll(configs: InterceptorConfig[]): () => void {
    const unregisters = configs.map((config) => this.register(config))
    return () => unregisters.forEach((unregister) => unregister())
  }

  /**
   * 获取所有启用的拦截器（已按优先级排序）
   */
  getInterceptors(): InterceptorConfig[] {
    return this.interceptors.filter((i) => i.enabled !== false)
  }

  /**
   * 根据条件查找匹配的拦截器
   */
  findMatchedInterceptors(context: InterceptorContext): InterceptorConfig[] {
    return this.getInterceptors().filter((interceptor) => {
      const { match } = interceptor

      // 如果有自定义匹配函数，优先使用
      if (match.matcher) {
        return match.matcher(context.raw, context.eventKey)
      }

      // 检查 eventKey 匹配
      if (match.eventKey) {
        if (typeof match.eventKey === 'function') {
          if (!context.eventKey || !match.eventKey(context.eventKey)) {
            return false
          }
        } else if (typeof match.eventKey === 'string') {
          if (context.eventKey !== match.eventKey) {
            return false
          }
        } else if (match.eventKey instanceof RegExp) {
          if (!context.eventKey || !match.eventKey.test(context.eventKey)) {
            return false
          }
        }
      }

      // 检查 messageType 匹配
      if (match.messageType && context.raw && typeof context.raw === 'object') {
        const raw = context.raw as Record<string, unknown>
        if (raw.messageType !== match.messageType && raw.type !== match.messageType) {
          return false
        }
      }

      // 检查 dataFields 匹配
      if (match.dataFields && match.dataFields.length > 0) {
        if (!context.raw || typeof context.raw !== 'object') {
          return false
        }
        const raw = context.raw as Record<string, unknown>
        const hasAllFields = match.dataFields.every((field) => field in raw)
        if (!hasAllFields) {
          return false
        }
      }

      return true
    })
  }
}

// 单例实例
export const interceptorRegistry = new InterceptorRegistry()

// ==================== 便捷的拦截器创建函数 ====================

/**
 * 创建基于数据结构的拦截器（类似 Java @Aspect + @Pointcut）
 */
export function createDataInterceptor(
  config: Omit<InterceptorConfig, 'handler'> & { transform: MessageInterceptor },
): () => void {
  return interceptorRegistry.register({
    ...config,
    handler: config.transform,
  })
}

/**
 * 创建基于正则匹配 eventKey 的拦截器
 */
export function createEventKeyInterceptor(
  pattern: RegExp | string,
  handler: MessageInterceptor,
  options?: Partial<Pick<InterceptorConfig, 'id' | 'name' | 'priority' | 'enabled'>>,
): () => void {
  const id = options?.id ?? `interceptor-${Date.now()}`
  const name = options?.name ?? `EventKeyInterceptor(${String(pattern)})`
  const priority = options?.priority ?? 0
  const enabled = options?.enabled ?? true

  return interceptorRegistry.register({
    id,
    name,
    match: { eventKey: pattern },
    handler,
    priority,
    enabled,
  })
}

/**
 * 链式调用语法糖 - 创建拦截器链
 */
export interface InterceptorChainBuilder {
  add(condition: InterceptorMatchCondition, handler: MessageInterceptor): InterceptorChainBuilder
  addEventKey(pattern: RegExp | string, handler: MessageInterceptor): InterceptorChainBuilder
  addDataFields(fields: string[], handler: MessageInterceptor): InterceptorChainBuilder
  addCustom(matcher: (raw: unknown, eventKey?: string) => boolean, handler: MessageInterceptor): InterceptorChainBuilder
  priority(p: number): InterceptorChainBuilder
  build(): () => void
}

/**
 * 创建拦截器链构建器
 */
export function createInterceptorChain(options?: { prefix?: string; basePriority?: number }): InterceptorChainBuilder {
  const chainId = options?.prefix ?? `chain-${Date.now()}`
  let currentPriority = options?.basePriority ?? 0
  const configs: Omit<InterceptorConfig, 'id'>[] = []

  return {
    add(condition, handler) {
      configs.push({
        name: `${chainId}-${configs.length}`,
        match: condition,
        handler,
        priority: currentPriority++,
      })
      return this
    },

    addEventKey(pattern, handler) {
      configs.push({
        name: `${chainId}-eventKey-${String(pattern)}`,
        match: { eventKey: pattern },
        handler,
        priority: currentPriority++,
      })
      return this
    },

    addDataFields(fields, handler) {
      configs.push({
        name: `${chainId}-dataFields-${fields.join(',')}`,
        match: { dataFields: fields },
        handler,
        priority: currentPriority++,
      })
      return this
    },

    addCustom(matcher, handler) {
      configs.push({
        name: `${chainId}-custom-${configs.length}`,
        match: { matcher },
        handler,
        priority: currentPriority++,
      })
      return this
    },

    priority(p) {
      currentPriority = p
      return this
    },

    build() {
      const registryConfigs: InterceptorConfig[] = configs.map((config, index) => ({
        ...config,
        id: `${chainId}-${index}`,
      }))
      return interceptorRegistry.registerAll(registryConfigs)
    },
  }
}
