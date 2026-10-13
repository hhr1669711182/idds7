// vitest.config.ts —— 单元 + 集成层（jsdom），不含浏览器项目
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: false,
    environment: 'jsdom',
    include: ['src/**/__tests__/**/*.spec.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-lib/**',
      'src/**/*.browser.spec.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/utils/logger.ts',
        'src/interceptor/unwrap.ts',
        'src/interceptor/matcher.ts',
        'src/service/coordinateText.ts',
        'src/service/error.ts',
        'src/baseComponent/tools/transform.ts',
      ],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 70,
        statements: 75,
      },
    },
  },
})