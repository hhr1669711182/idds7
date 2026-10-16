/**
 * ESLint flat config（ESLint 9+ 唯一格式，替代已废弃的 .eslintrc.json）
 *
 * 状态：备用规范 · 当前未安装 eslint，不会执行任何检查。
 * 启用需装：eslint / typescript-eslint / eslint-plugin-vue
 * 详见 herness/05-共享上下文/设计规范速查.md「四·之一」第 5 条。
 *
 * 规则取向：只收「低噪音、可自动修、改动面可控」的规则。
 * 存量 271 处 any、约 190 项 TS 诊断一律不纳入 eslint（交给 tsc 基线管），
 * 避免与 pnpm lint:baseline 重复报错、掩盖真实新增问题。
 */
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

export default tseslint.config(
  {
    // 全局 ignore：构建产物、依赖、自动生成文件
    ignores: [
      'dist/**',
      'dist-lib/**',
      'dist-ssr/**',
      'node_modules/**',
      'patches/**',
      'src/types/auto-imports.d.ts',
      'src/types/components.d.ts',
      'tests/__artifacts__/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },

  // ---- 通用 JS 规则（所有文件）----
  js.configs.recommended,
  {
    rules: {
      // 调试代码不得入库
      'no-debugger': 'error',
      // 宽松相等：允许 `== null`（判空惯用法），其余必须严格相等
      eqeqeq: ['error', 'smart'],
      // 声明优先
      preferConst: 'error',
      'no-var': 'error',
      // console 仅允许 warn/error；禁 console.log（存量不追溯，新代码拦截）
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // ---- TS / Vue 源码 ----
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,vue}'],
    rules: {
      // 未用变量交给 tsconfig 的 noUnusedLocals/Parameters，eslint 不重复报
      '@typescript-eslint/no-unused-vars': 'off',
      // 存量 any 约 271 处，开 error 会淹没真实问题；保持关闭，仅靠规范约束
      '@typescript-eslint/no-explicit-any': 'off',
      // 重复 import 是高频低级问题，warn 级可自动修
      'no-duplicate-imports': 'warn',
    },
  },

  // ---- Vue 单文件组件专用 ----
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      // 组件名与文件名一致等强约束会产生大量存量告警，此处只保留影响面小的
      'vue/multi-word-component-names': 'off',
    },
  },

  // ---- 测试与脚本：允许在测试里放宽 ----
  {
    files: ['tests/**/*.{ts,js}', 'scripts/**/*.mjs'],
    rules: {
      'no-console': 'off',
    },
  },
)
