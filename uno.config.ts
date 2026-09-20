/*
 * @Author: huanghuanrong
 * @Date: 2026-04-10 15:40:07
 * @LastEditTime: 2026-09-18 18:26:51
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\uno.config.ts
 */
import { defineConfig, presetAttributify, presetIcons, presetUno } from "unocss";
import processorLightningCSS from '@unocss/processor-lightningcss'
export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: false,
    }),
  ],
   processors: [
    processorLightningCSS({}),
  ],
});
