/**
 * 消息拦截器集成 - 展示如何在 useMessageStore 中集成拦截器
 * 
 * 核心思路：
 * 1. 使用 ingressGate 作为拦截器入口点
 * 2. 将各种 normalize*Frames 函数注册为拦截器
 * 3. 支持动态注册/注销拦截器
 */

import {
  interceptorRegistry,
  createInterceptorChain,
  createEventKeyInterceptor,
  type InterceptorContext,
  type InterceptorResult,
  type MessageInterceptor,
  type InterceptorConfig,
} from './messageInterceptors'
import { MESSAGE_EVENT_KEY, MESSAGE_CHANNEL, MESSAGE_SYSTEM } from '@/const/const.message.type'

// ==================== 消息类型检测器 ====================

/** 消息结构检测器配置 */
interface MessageDetector {
  /** 检测函数 */
  detect: (raw: unknown) => boolean
  /** 标准化处理函数 */
  normalize: (raw: unknown) => { eventKey: string; data: unknown; meta?: Record<string, unknown> } | null
  /** 优先级（数字越大越先检测） */
  priority: number
  /** 唯一标识 */
  id: string
  /** 描述 */
  name: string
}

/** 内置消息检测器 */
const builtInDetectors: MessageDetector[] = [
  // 1. 位置消息检测器（高优先级，因为最常见）
  {
    id: 'position-detector',
    name: '位置消息检测器',
    priority: 1000,
    detect: (raw) => {
      const obj = raw as Record<string, unknown>
      return (
        obj &&
        typeof obj === 'object' &&
        (('longitude' in obj && 'latitude' in obj) ||
          ('lng' in obj && 'lat' in obj) ||
          ('x' in obj && 'y' in obj) ||
          obj.type === 'position' ||
          obj.type === 'gps' ||
          obj.type === 'location')
      )
    },
    normalize: (raw) => {
      const obj = raw as Record<string, unknown>

      // 标准化字段名
      const longitude = (obj.longitude ?? obj.lng ?? obj.x) as number | undefined
      const latitude = (obj.latitude ?? obj.lat ?? obj.y) as number | undefined

      if (longitude === undefined || latitude === undefined) {
        return null
      }

      return {
        eventKey: 'position.update',
        data: {
          id: obj.id ?? obj.deviceId ?? obj.carId,
          longitude,
          latitude,
          speed: obj.speed ?? obj.velocity,
          direction: obj.direction ?? obj.heading,
          timestamp: obj.timestamp ?? obj.time ?? obj.reportTime,
          altitude: obj.altitude ?? obj.height,
          type: 'position',
        },
        meta: { detector: 'position-detector' },
      }
    },
  },

  // 2. 告警消息检测器
  {
    id: 'alarm-detector',
    name: '告警消息检测器',
    priority: 900,
    detect: (raw) => {
      const obj = raw as Record<string, unknown>
      return (
        obj &&
        typeof obj === 'object' &&
        (obj.alarmType !== undefined ||
          obj.alertType !== undefined ||
          obj.warningType !== undefined ||
          obj.type === 'alarm' ||
          obj.type === 'alert' ||
          obj.type === 'warning')
      )
    },
    normalize: (raw) => {
      const obj = raw as Record<string, unknown>

      const alarmType = obj.alarmType ?? obj.alertType ?? obj.warningType
      if (alarmType === undefined) {
        return null
      }

      return {
        eventKey: `alarm.${String(alarmType)}`,
        data: {
          id: obj.id ?? obj.alarmId,
          type: alarmType,
          level: obj.level ?? obj.severity ?? obj.alarmLevel,
          source: obj.source ?? obj.deviceId ?? obj.carId,
          description: obj.description ?? obj.message ?? obj.alarmDesc,
          timestamp: obj.timestamp ?? obj.time,
          type: 'alarm',
        },
        meta: { detector: 'alarm-detector' },
      }
    },
  },

  // 3. 车辆定位检测器
  {
    id: 'car-location-detector',
    name: '车辆定位检测器',
    priority: 800,
    detect: (raw) => {
      const obj = raw as Record<string, unknown>
      return obj && typeof obj === 'object' && 'carId' in obj && 'gpsInfo' in obj
    },
    normalize: (raw) => {
      const obj = raw as Record<string, unknown>
      const gpsInfo = obj.gpsInfo as Record<string, unknown>

      if (!gpsInfo || typeof gpsInfo !== 'object') {
        return null
      }

      return {
        eventKey: 'car.location',
        data: {
          carId: obj.carId,
          longitude: gpsInfo.longitude,
          latitude: gpsInfo.latitude,
          speed: gpsInfo.speed,
          direction: gpsInfo.direction,
          status: gpsInfo.status,
          type: 'car-location',
        },
        meta: { detector: 'car-location-detector' },
      }
    },
  },

  // 4. 来电消息检测器
  {
    id: 'alarm-call-detector',
    name: '来电消息检测器',
    priority: 700,
    detect: (raw) => {
      const obj = raw as Record<string, unknown>
      return obj && typeof obj === 'object' && obj.callType !== undefined
    },
    normalize: (raw) => {
      const obj = raw as Record<string, unknown>

      return {
        eventKey: `alarm.call.${String(obj.callType ?? 'unknown')}`,
        data: {
          id: obj.id,
          callType: obj.callType,
          caller: obj.caller,
          callee: obj.callee,
          timestamp: obj.timestamp ?? obj.time,
          type: 'alarm-call',
        },
        meta: { detector: 'alarm-call-detector' },
      }
    },
  },

  // 5. 通用事件检测器（兜底）
  {
    id: 'generic-event-detector',
    name: '通用事件检测器',
    priority: 1,
    detect: (raw) => {
      const obj = raw as Record<string, unknown>
      return obj && typeof obj === 'object' && (obj.eventKey !== undefined || obj.type !== undefined)
    },
    normalize: (raw) => {
      const obj = raw as Record<string, unknown>
      const eventKey = (obj.eventKey ?? obj.type) as string

      return {
        eventKey: eventKey || 'unknown.event',
        data: obj.data ?? obj.payload ?? obj,
        meta: { detector: 'generic-event-detector', originalType: obj.type },
      }
    },
  },
]

// ==================== 拦截器注册中心 ====================

/** 拦截器管理类 */
class InterceptorManager {
  private unregisterFunctions: (() => void)[] = []
  private detectors: MessageDetector[] = []

  constructor() {
    // 排序检测器（按优先级降序）
    this.detectors = [...builtInDetectors].sort((a, b) => b.priority - a.priority)
  }

  /**
   * 注册自定义检测器
   */
  registerDetector(detector: MessageDetector): () => void {
    this.detectors.push(detector)
    // 重新排序
    this.detectors.sort((a, b) => b.priority - a.priority)

    // 返回注销函数
    return () => {
      const index = this.detectors.findIndex((d) => d.id === detector.id)
      if (index !== -1) {
        this.detectors.splice(index, 1)
      }
    }
  }

  /**
   * 检测消息类型并标准化
   */
  detectAndNormalize(raw: unknown): { eventKey: string; data: unknown; meta?: Record<string, unknown> } | null {
    for (const detector of this.detectors) {
      if (detector.detect(raw)) {
        const result = detector.normalize(raw)
        if (result) {
          return result
        }
      }
    }
    return null
  }

  /**
   * 初始化拦截器
   */
  initInterceptors(): () => void {
    // 注册自动检测拦截器
    const autoDetectInterceptor = createEventKeyInterceptor(
      /.*/, // 匹配所有事件
      async (context: InterceptorContext): Promise<InterceptorResult> => {
        // 尝试自动检测并标准化
        const result = this.detectAndNormalize(context.raw)

        if (result) {
          return {
            matched: true,
            data: result.data,
            eventKey: result.eventKey,
            meta: { ...context.meta, ...result.meta, autoNormalized: true },
          }
        }

        // 没有匹配的检测器，返回未匹配
        return { matched: false }
      },
      {
        id: 'auto-detect-interceptor',
        name: '自动检测拦截器',
        priority: -1000, // 最低优先级，确保最后执行
      },
    )

    this.unregisterFunctions.push(autoDetectInterceptor)

    // 返回全部注销函数
    return () => {
      this.unregisterFunctions.forEach((fn) => fn())
      this.unregisterFunctions = []
    }
  }

  /**
   * 获取所有检测器
   */
  getDetectors(): MessageDetector[] {
    return [...this.detectors]
  }

  /**
   * 获取所有拦截器
   */
  getInterceptors(): InterceptorConfig[] {
    return interceptorRegistry.getInterceptors()
  }
}

// 单例
export const interceptorManager = new InterceptorManager()

// ==================== 集成到消息处理流程 ====================

/**
 * 创建消息处理拦截器链
 * 这个函数应该在 useMessageStore 初始化时调用
 */
export function setupMessageInterceptors() {
  // 1. 初始化内置检测器
  const cleanup = interceptorManager.initInterceptors()

  // 2. 返回清理函数
  return cleanup
}

/**
 * 高级消息处理：使用拦截器处理原始消息
 */
export async function processMessageWithInterceptors(
  raw: unknown,
  channel: MESSAGE_CHANNEL,
  system: MESSAGE_SYSTEM,
  meta?: Record<string, unknown>,
): Promise<{
  eventKey: string | undefined
  data: unknown
  meta: Record<string, unknown>
  handled: boolean
}> {
  // 首先尝试自动检测
  const autoResult = interceptorManager.detectAndNormalize(raw)

  if (autoResult) {
    return {
      eventKey: autoResult.eventKey,
      data: autoResult.data,
      meta: { ...meta, ...autoResult.meta },
      handled: true,
    }
  }

  // 如果自动检测失败，尝试使用注册的拦截器
  const context: InterceptorContext = {
    raw,
    channel,
    system,
    meta,
  }

  const matchedInterceptors = interceptorRegistry.findMatchedInterceptors(context)

  if (matchedInterceptors.length === 0) {
    // 没有匹配的拦截器
    return {
      eventKey: undefined,
      data: raw,
      meta: meta ?? {},
      handled: false,
    }
  }

  // 按优先级执行拦截器
  let currentData = raw
  let currentEventKey: string | undefined
  let currentMeta = meta

  for (const interceptor of matchedInterceptors) {
    try {
      const result = await interceptor.handler({
        raw: currentData,
        eventKey: currentEventKey,
        channel,
        system,
        meta: currentMeta,
      })

      if (result.matched) {
        if (result.data !== undefined) currentData = result.data
        if (result.eventKey !== undefined) currentEventKey = result.eventKey
        if (result.meta !== undefined) currentMeta = { ...currentMeta, ...result.meta }

        if (result.stopPropagation) break
      }
    } catch (error) {
      console.error(`[interceptor] ${interceptor.name} 处理失败:`, error)
    }
  }

  return {
    eventKey: currentEventKey,
    data: currentData,
    meta: currentMeta ?? {},
    handled: true,
  }
}

// ==================== 使用示例 ====================

/**
 * 示例1：注册自定义消息检测器
 */
export function registerCustomDetector() {
  return interceptorManager.registerDetector({
    id: 'custom-detector',
    name: '自定义检测器',
    priority: 950, // 高优先级
    detect: (raw) => {
      const obj = raw as Record<string, unknown>
      return obj && typeof obj === 'object' && 'customField' in obj
    },
    normalize: (raw) => {
      const obj = raw as Record<string, unknown>
      return {
        eventKey: 'custom.event',
        data: {
          customField: obj.customField,
          value: obj.value,
        },
      }
    },
  })
}

/**
 * 示例2：注册自定义拦截器
 */
export function registerCustomInterceptor() {
  return createEventKeyInterceptor(
    /^custom\./,
    async (context: InterceptorContext): Promise<InterceptorResult> => {
      const raw = context.raw as Record<string, unknown>

      // 自定义处理逻辑
      return {
        matched: true,
        data: {
          ...raw,
          processed: true,
          processor: 'custom-interceptor',
        },
        eventKey: context.eventKey,
      }
    },
    {
      id: 'custom-processor',
      name: '自定义处理器',
      priority: 500,
    },
  )
}

/**
 * 示例3：批量注册拦截器
 */
export function registerBusinessInterceptors() {
  const unregister = createInterceptorChain({ prefix: 'business', basePriority: 400 })
    // 业务拦截器1
    .addEventKey(/^business\.order/, async (context) => ({
      matched: true,
      data: {
        ...(context.raw as Record<string, unknown>),
        businessType: 'order',
      },
    }))
    // 业务拦截器2
    .addEventKey(/^business\.payment/, async (context) => ({
      matched: true,
      data: {
        ...(context.raw as Record<string, unknown>),
        businessType: 'payment',
      },
    }))
    // 业务拦截器3
    .addCustom(
      (raw) => (raw as Record<string, unknown>).source === 'external',
      async (context) => ({
        matched: true,
        data: context.raw,
        meta: { ...context.meta, external: true },
      }),
    )
    .build()

  return unregister
}

/**
 * 示例4：条件性启用/禁用拦截器
 */
export function toggleInterceptor(interceptorId: string, enabled: boolean) {
  const interceptors = interceptorRegistry.getInterceptors()
  const interceptor = interceptors.find((i) => i.id === interceptorId)

  if (interceptor) {
    interceptor.enabled = enabled
    return true
  }

  return false
}

/**
 * 示例5：获取统计信息
 */
export function getInterceptorStats() {
  return {
    detectors: interceptorManager.getDetectors().map((d) => ({
      id: d.id,
      name: d.name,
      priority: d.priority,
    })),
    interceptors: interceptorManager.getInterceptors().map((i) => ({
      id: i.id,
      name: i.name,
      priority: i.priority,
      enabled: i.enabled,
    })),
    totalDetectors: interceptorManager.getDetectors().length,
    totalInterceptors: interceptorManager.getInterceptors().length,
  }
}

// ==================== 导出核心组件 ====================

export {
  interceptorRegistry,
  createInterceptorChain,
  createEventKeyInterceptor,
  type InterceptorContext,
  type InterceptorResult,
  type MessageInterceptor,
  type InterceptorConfig,
  type InterceptorMatchCondition,
}
