// vitest.config.ts —— 单元 + 组件测试（jsdom）
// 所有测试代码与产物集中管理在 tests/ 目录，不侵入 src/**。
//
// 与 vite.config.ts 的差异（有意为之）：
// 1. 不挂 Cesium / SVG 图标 / UnoCSS —— 组件单测只关心渲染与事件契约；
// 2. 显式注册 Element Plus —— vite 侧由 unplugin-vue-components 自动注册，
//    vitest 不跑那些插件，组件里的 <el-*> 必须真实解析，否则断言落空；
// 3. exclude tests/e2e/** —— E2E 交给 Playwright，不进 vitest。
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  plugins: [
    vue(),
    // 仅为让 <el-*> 可解析；不写 dts，避免覆盖 src/types/*.d.ts
    AutoImport({
      imports: ['vue', 'vue-router', 'pinia'],
      resolvers: [ElementPlusResolver({ importStyle: false })],
      vueTemplate: true,
      dts: false,
    }),
    Components({
      resolvers: [ElementPlusResolver({ importStyle: false })],
      dts: false,
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: false,
    environment: 'jsdom',
    include: ['tests/unit/**/*.spec.ts', 'tests/components/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-lib/**', 'tests/e2e/**', 'tests/legacy/**'],
    setupFiles: ['tests/harness/setup.ts'],
    // 组件测试挂载较重（OL 图层 + Element Plus），默认 5s 在 Windows 并发下偶发不足
    testTimeout: 15_000,
    hookTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'tests/__artifacts__/coverage',
      include: [
        'src/utils/logger.ts',
        'src/baseComponent/tools/transform.ts',
        'src/baseComponent/tools/Common.ts',
        'src/baseComponent/tools/baidu.ts',
        'src/baseComponent/amap/amapCoordinate.ts',
        'src/baseComponent/OpenlayersMap/baseSource.ts',
        'src/baseComponent/OpenlayersMap/startup.ts',
        'src/config/layers.ts',
        'src/config/mapConfig.ts',
        'src/interceptor/unwrap.ts',
        'src/interceptor/matcher.ts',
        'src/service/coordinateText.ts',
        'src/service/error.ts',
        'src/components/BIM/module/commonSetting.js',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },
  },
})