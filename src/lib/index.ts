/*
 * @Author: hhr
 * @Date: 2026-04-16 14:00:56
 * @LastEditTime: 2026-04-22 18:15:42
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\lib\index.ts
 */
import { createApp } from "vue";
import type { App as VueApp } from "vue";
import { createPinia, setActivePinia } from "pinia";
import type { Emitter } from "mitt";
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

// import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "virtual:svg-icons-register";
import "virtual:uno.css";
import "../style.css";
import "../styles/index.less";
import { drag } from "../directives/index.ts";
import App from "../App.vue";
import router from "../router";
export interface MountOptions {
  /**
   * 挂载的 DOM 节点或选择器
   */
  container: string | HTMLElement;
  /**
   * 用于与宿主项目通信的 mitt 实例
   */
  emitter?: Emitter<any>;
  /**
   * 传递给根组件的 props
   */
  props?: Record<string, any>;
}

export interface AppInstance {
  app: VueApp;
  unmount: () => void;
}

/**
 * 作为库导出时，供宿主项目调用的挂载函数
 * 包含了完整的路由、状态管理和全局配置
 */
export function mountApp(options: MountOptions): AppInstance {
  const { container, emitter, props = {} } = options;

  const app = createApp(App, props);

  // 1. 初始化并挂载 Pinia
  const pinia = createPinia();
  pinia.use(piniaPluginPersistedstate);
  setActivePinia(pinia);
  app.use(pinia);

  // 2. 挂载路由
  app.use(router);

  // 3. 注册全局指令
  app.directive("drag", drag);

  // 4. 通信桥梁：如果有 emitter，注入到全局供内部组件 inject('hostEmitter') 使用
  if (emitter) {
    app.provide("hostEmitter", emitter);
  }

  // 5. 挂载到 DOM
  const node = typeof container === "string" ? document.querySelector(container) : container;
  if (!node) {
    throw new Error(`[OpenlayersMap] Cannot find container: ${container}`);
  }
  
  app.mount(node);

  return {
    app,
    unmount: () => {
      app.unmount();
    },
  };
}

export * from '@/plugins/mapPlugins';
export * from '@/plugins/crypto';
