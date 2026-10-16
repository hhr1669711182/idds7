/*
 * @Author: hhr
 * @Date: 2026-04-16 14:00:56
 * @LastEditTime: 2026-04-22 18:15:42
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\lib\index.ts
 */
import { createApp } from 'vue'
import type { App as VueApp } from 'vue'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import type { Emitter } from 'mitt'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

// import ElementPlus from "element-plus";
import 'element-plus/dist/index.css'
import 'virtual:svg-icons-register'
import 'virtual:uno.css'
import '../style.css'
import '../styles/index.less'
import { drag } from '../directives/index.ts'
import App from '../App.vue'
import router from '../router'
import { initUserStore } from '@/store/useUserStore'
import { getBusinessMessageRuntime, disposeBusinessMessageRuntime } from '@/controller/core/io/BusinessMessageRuntime'
import { initMessage } from '@/register/initMessage'
import { initPageConditionListener, requestSpecialMapNavigation } from '@/register/pageCondition'
import { createMockCallLocationBridge } from '@/composables/useMockCallLocationBridge'
import { createMapRelayReader } from '@/composables/useMapRelayReader'
import { createIncidentLocationProfileSync } from '@/composables/useIncidentLocationProfileSync'
import { createGisPointChannel } from '@/composables/useGisPointSelection'
import { bindBusinessMapLifecycle } from '@/register/businessMapLifecycle'
import { createLogger } from '@/utils/logger'
const logger = createLogger('app-lifecycle')
export interface MountOptions {
  /**
   * 挂载的 DOM 节点或选择器
   */
  container: string | HTMLElement
  /**
   * 用于与宿主项目通信的 mitt 实例
   */
  emitter?: Emitter<any>
  /**
   * 传递给根组件的 props
   */
  props?: Record<string, any>
}

export interface AppInstance {
  app: VueApp
  unmount: () => void
}

/**
 * 作为库导出时，供宿主项目调用的挂载函数
 * 包含了完整的路由、状态管理和全局配置
 */
export function mountApp(options: MountOptions): AppInstance {
  const { container, emitter, props = {} } = options
  const node = typeof container === 'string' ? document.querySelector(container) : container
  if (!node) throw new Error(`[OpenlayersMap] Cannot find container: ${container}`)

  const app = createApp(App, props)

  // 1. 初始化并挂载 Pinia
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  setActivePinia(pinia)
  app.use(pinia)

  const cleanups: Array<() => void> = [() => disposePinia(pinia)]
  let unmounted = false
  const release = () => {
    for (const cleanup of cleanups.splice(0).reverse()) {
      try {
        cleanup()
      } catch (error) {
        logger.error('释放应用资源失败', error)
      }
    }
  }
  try {
    cleanups.push(initUserStore())
    const runtime = getBusinessMessageRuntime(pinia)
    cleanups.push(() => disposeBusinessMessageRuntime(pinia))
    runtime.start()
    app.use(router)
    cleanups.push(initPageConditionListener())
    cleanups.push(bindBusinessMapLifecycle(router, runtime))
    const mock = createMockCallLocationBridge({
      requestNavigation: () => {
        void requestSpecialMapNavigation()
      },
    })
    cleanups.push(mock.dispose)
    cleanups.push(createGisPointChannel())
    cleanups.push(createMapRelayReader())
    cleanups.push(createIncidentLocationProfileSync())
    cleanups.push(initMessage())

    app.directive('drag', drag)
    if (emitter) app.provide('hostEmitter', emitter)
    app.mount(node)
  } catch (error) {
    try {
      app.unmount()
    } catch (unmountError) {
      logger.error('启动失败后的卸载失败', unmountError)
    } finally {
      release()
    }
    throw error
  }

  return {
    app,
    unmount: () => {
      if (unmounted) return
      unmounted = true
      try {
        app.unmount()
      } finally {
        release()
      }
    },
  }
}

export * from '@/plugins/mapPlugins'
export * from '@/plugins/crypto'
