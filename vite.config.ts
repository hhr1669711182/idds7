/*
 * @Author: huanghuanrong
 * @Date: 2026-03-31 15:30:08
 * @LastEditTime: 2026-09-18 11:26:46
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\vite.config.ts
 */
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import UnoCSS from "unocss/vite";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import { createSvgIconsPlugin } from "vite-plugin-svg-icons";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import cesium from 'vite-plugin-cesium'


export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isDev = command === "serve";
  const isLib = process.env.BUILD_LIB === "true" || env.VITE_BUILD_LIB === "true";
  const __dirname = fileURLToPath(new URL("./", import.meta.url));

  const proxyServer = {}

  return {
    devtools: mode === "dev.local" ? {
      enabled: true
    } : false,
    plugins: [
      vue(),
      vueJsx(),
      UnoCSS(),
      cesium({ rebuildCesium: true }),
      AutoImport({
        imports: ["vue", "vue-router", "pinia"],
        dts: "src/types/auto-imports.d.ts",
        resolvers: [ElementPlusResolver()],
        vueTemplate: true,
      }),
      Components({
        dts: "src/types/components.d.ts",
        resolvers: [ElementPlusResolver()],
      }),
      createSvgIconsPlugin({
        iconDirs: [fileURLToPath(new URL("./src/assets/svg", import.meta.url))],
        symbolId: "icon-[dir]-[name]",
      }),
      // qiankun("vue-openlayers-app", { useDevMode: true }),
    ],
    base: isLib ? "/" : "./",
    css: {
      preprocessorOptions: {
        less: {
          additionalData: '@import "./src/styles/variables.module.less";',
          javascriptEnabled: true
        }
      }
    },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
        // "js-clipper": fileURLToPath(new URL("./src/shims/js-clipper.ts", import.meta.url)),
      },
    },
    build: {
      sourcemap: mode !== "production",
      outDir: isLib ? "dist-lib" : "dist",
      lib: isLib
        ? {
          entry: resolve(__dirname, "src/lib/index.ts"),
          name: "OpenlayersMapLib",
          fileName: (format) => `openlayers-map.${format}.js`,
          formats: ["es"],
        }
        : undefined,
      rolldownOptions: {
        external: isLib ? ["vue", "pinia", "vue-router"] : [],
        output: {
          // sourcemap: mode !== "production",
          codeSplitting: !isLib,
          globals: {},
        },
      },
    },
    optimizeDeps: isDev
      ? {
        exclude: ["@hhr001/openlayers-map-lib"],
        include: ["js-clipper"],
        needsInterop: ["js-clipper"],
        // Reuse Vite dependency cache across restarts.
      }
      : undefined,
    server: {
      port: 8888,
      host: "0.0.0.0",
      proxy: {
        "/bff-client": {
          target: 'http://ids-dev.ks.telewave.tech/',
          changeOrigin: true,
          secure: false,
          // 网关需要 /bff-client/api/v1/gis/...，不能移除前缀。
        },
        ...(isDev && env.VITE_DISPATCH_MOCK === 'true' ? {
          '/api/dispatch': {
            target: 'http://127.0.0.1:18080',
            changeOrigin: true,
            rewrite: (path: string) => path.replace(/^\/api/, ''),
          },
        } : {}),// 仅在开发模式下启用本地 Mock 代理；正式环境应使用登录态动态拼接消息网关地址。
        "/geoserver": {
          target: env.VITE_GEOSERVER_URL,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/geoserver/, ""),
        },
        "/api": {
          target: 'http://ids-dev.ks.telewave.tech/',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/a": {
          target: env.VITE_AMAP_PROXY_API,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/a/, ''),
        },
      },
    },
  }
});
