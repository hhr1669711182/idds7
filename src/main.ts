/*
 * @Author: huanghuanrong
 * @Date: 2026-03-31 15:30:08
 * @LastEditTime: 2026-04-16 10:44:12
 * @LastEditors: huanghuanrong
 * @Description: 文件描述
 * @FilePath: \OpenlayersMap\src\main.ts
 */
// import { createApp } from "vue";
// import type { App as VueApp } from "vue";
// import { createPinia, setActivePinia } from "pinia";
// import ElementPlus from "element-plus";
// import * as ElementPlusIconsVue from "@element-plus/icons-vue";
// import { renderWithQiankun, qiankunWindow, QiankunProps } from "vite-plugin-qiankun/dist/helper";
import { mountApp, AppInstance } from "./lib/index";

let appInstance: AppInstance | null = null;

const mount = (props: any = {} as any) => {
  const container: HTMLElement | null = props.container
    ? props.container.querySelector("#app")
    : document.getElementById("app");
  
  if (container) {
    appInstance = mountApp({ container });
  }
};

const unmount = () => {
  appInstance?.unmount();
  appInstance = null;
};

mount({} as any);

// renderWithQiankun({
//   mount,
//   bootstrap() {},
//   unmount,
//   update() {},
// });

// if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
//   mount({} as any);
// }
