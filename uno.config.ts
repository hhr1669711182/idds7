/*
 * @Author: huanghuanrong
 * @Date: 2026-04-10 15:40:07
 * @LastEditTime: 2026-04-10 18:36:17
 * @LastEditors: huanghuanrong
 * @Description: 文件描述
 * @FilePath: \OpenlayersMap\uno.config.ts
 */
import { defineConfig, presetAttributify, presetIcons, presetUno } from "unocss";

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: false,
    }),
  ],
});
