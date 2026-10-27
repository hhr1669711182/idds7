/*
 * @Author: huanghuanrong
 * @Date: 2026-03-31 15:30:08
 * @LastEditTime: 2026-10-20 14:07:45
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\vite.config.ts
 */
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import UnoCSS from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import cesium from 'vite-plugin-cesium'
import { elementStyleRegistry } from './scripts/vite-plugin-element-styles.mjs'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isDev = command === 'serve'
  const isLib = process.env.BUILD_LIB === 'true' || env.VITE_BUILD_LIB === 'true'
  const __dirname = fileURLToPath(new URL('./', import.meta.url))

  const proxyServer = {}

  return {
    devtools: {
      enabled: true,
      apply: 'serve',
      clientAuth: false,
      embeddedVisibility: 'passive',
      dockPreferences: {
        defaultPosition: 'bottom',
        defaultMode: 'float',
        maxVisibleItems: 6,
      },
    },
    plugins: [
      vue(),
      vueJsx(),
      UnoCSS(),
      cesium({ rebuildCesium: true }),
      AutoImport({
        imports: ['vue', 'vue-router', 'pinia'],
        dts: 'src/types/auto-imports.d.ts',
        resolvers: [ElementPlusResolver()],
        vueTemplate: true,
      }),
      Components({
        dts: 'src/types/components.d.ts',
        resolvers: [ElementPlusResolver()],
      }),
      elementStyleRegistry(),
      createSvgIconsPlugin({
        iconDirs: [fileURLToPath(new URL('./src/assets/icons-svg', import.meta.url))],
        symbolId: 'icon-[dir]-[name]',
      }),
    ],
    base: isLib ? '/' : './',
    css: {
      preprocessorOptions: {
        less: {
          additionalData: '@import "./src/styles/variables.module.less";',
          javascriptEnabled: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // "js-clipper": fileURLToPath(new URL("./src/shims/js-clipper.ts", import.meta.url)),
      },
    },
    build: {
      sourcemap: mode !== 'production',
      // 大包阈值：CesiumDuty（约 4MB）已由路由懒加载隔离出首屏，属已知大包。
      // 其余 chunk 超过 1MB 即视为分包劣化信号。
      chunkSizeWarningLimit: 1024,
      outDir: isLib ? 'dist-lib' : 'dist',
      lib: isLib
        ? {
            entry: resolve(__dirname, 'src/lib/index.ts'),
            name: 'OpenlayersMapLib',
            fileName: (format) => `openlayers-map.${format}.js`,
            formats: ['es'],
          }
        : undefined,
      rolldownOptions: {
        external: isLib ? ['vue', 'pinia', 'vue-router'] : [],
        output: {
          codeSplitting: !isLib,
          globals: {},
        },
      },
    },
    optimizeDeps: isDev
      ? {
          exclude: ['@hhr001/openlayers-map-lib'],
          include: ['js-clipper'],
          needsInterop: ['js-clipper'],
        }
      : undefined,
    server: {
      port: 8888,
      host: '0.0.0.0',
      proxy: {
        '/bff-client': {
          target: 'http://ids-dev.ks.telewave.tech/',
          changeOrigin: true,
          secure: false,
        },
        '/geoserver': {
          target: env.VITE_GEOSERVER_URL,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/geoserver/, ''),
        },
        '/api': {
          target: 'http://ids-dev.ks.telewave.tech/',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        '/a': {
          target: env.VITE_AMAP_PROXY_API,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/a/, ''),
        },
        // 车辆历史轨迹查询直连外部车辆定位服务（不走 bff-client），生产环境需由部署层做同等反代。
        '/car-track-api': {
          target: 'http://192.168.169.40:31319',//'http://192.168.172.50:8644',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/car-track-api/, ''),
        },
        ...(env.VITE_DISPATCH_MOCK === 'true'
          ? {
              '/api/dispatch': {
                target: 'http://192.168.172.103:3003/',
                changeOrigin: true,
                rewrite: (path: string) => path.replace(/^\/api/, ''),
              },
            }
          : {}), // 仅在VITE_DISPATCH_MOCK为true时启用本地 Mock 代理；正式环境应使用登录态动态拼接消息网关地址。
      },
    },
  }
})
