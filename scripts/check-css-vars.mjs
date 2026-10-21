#!/usr/bin/env node
/**
 * CSS 变量完整性检查（只读，不阻塞）。
 *
 * 背景：`var(--radius-md)` 这样的引用，如果对应变量从未作为 CSS 变量定义过
 * （只写成 Less 变量 `@radius-md`），浏览器会回退成无效值 —— 表现为
 * border-radius 消失、颜色变透明。这类问题在编译期不报错，只能靠检查发现。
 *
 * 用法：
 *   node scripts/check-css-vars.mjs
 *   LINT_CSS_VARS_STRICT=1 node scripts/...   # 严格模式（CI 用，有缺失则 exit 1）
 *
 * 规范见 herness/05-共享上下文/代码样式规范.md
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = resolve(root, 'src')
const strict = process.env.LINT_CSS_VARS_STRICT === '1'

const SCAN_EXTS = new Set(['.vue', '.less', '.ts', '.css', '.html'])
/** 外部库提供的变量前缀，不参与检查 */
const EXTERNAL_PREFIX = /^--(el-|md-|v-|w-|iw-)/

const walk = (dir, acc = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (SCAN_EXTS.has(extname(entry.name))) acc.push(full)
  }
  return acc
}

const files = existsSync(srcRoot) ? walk(srcRoot) : []

/** 收集项目内定义过的 CSS 变量 */
const defined = new Set()
/** 收集 var() 引用 */
const used = new Map()

/** 去掉注释，避免文档里的 var(--token) 之类示例被误判 */
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

for (const file of files) {
  const text = stripComments(readFileSync(file, 'utf8'))
  for (const m of text.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1])
  for (const m of text.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
    const name = m[1]
    if (!used.has(name)) used.set(name, new Set())
    used.get(name).add(relative(root, file))
  }
}

const missing = []
for (const [name, where] of used) {
  if (defined.has(name)) continue
  if (EXTERNAL_PREFIX.test(name)) continue
  missing.push({ name, files: [...where] })
}

/**
 * Less 变量与 CSS 变量双写一致性检查。
 *
 * 背景：项目约定「同一常量在 tokens.less 写 Less 变量、在 palettes.less 写
 * 同名 CSS 变量」，两边值必须一致。两边一旦漂移，编译产物与设计意图会
 * 悄悄分叉（例如 @weather-panel-width 与 --weather-panel-width 不同值，
 * 面板实际宽度会与布局常量推导出的按钮簇位置对不上），且不报任何错。
 */
const tokensPath = resolve(root, 'src/styles/tokens.less')
const palettesPath = resolve(root, 'src/styles/palettes.less')
const drifted = []
if (existsSync(tokensPath) && existsSync(palettesPath)) {
  const tokensText = readFileSync(tokensPath, 'utf8')
  const palettesText = readFileSync(palettesPath, 'utf8')
  /** @name: value —— 只取 Less 变量声明，忽略注释与嵌套块内的同名声明 */
  const lessVars = new Map(
    [...tokensText.matchAll(/^\s*@([a-zA-Z0-9-]+)\s*:\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()])
  )
  /** --name: value —— 只取 :root 块内的声明，避免主题块内的覆盖值被误取 */
  const cssVars = new Map(
    [...palettesText.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/gm)].map((m) => [m[1].slice(2), m[2].trim()])
  )
  for (const [name, lessValue] of lessVars) {
    if (!cssVars.has(name)) continue
    const cssValue = cssVars.get(name)
    if (lessValue === cssValue) continue
    drifted.push({ name, lessValue, cssValue })
  }
}

if (missing.length === 0 && drifted.length === 0) {
  console.log(`[css-vars] ✅ 全部 ${used.size} 个 CSS 变量引用均有定义`)
  process.exit(0)
}

if (drifted.length) {
  console.log(`[css-vars] ❌ ${drifted.length} 个常量的 Less 变量与 CSS 变量值不一致：`)
  for (const item of drifted) {
    console.log(`  @${item.name} = ${item.lessValue}  ≠  --${item.name} = ${item.cssValue}`)
  }
  console.log('  修复方式：以设计意图为准，两处改成同一个值')
  console.log('')
}

if (missing.length) {
  console.log(`[css-vars] ❌ ${missing.length} 个变量被引用但未定义（浏览器会回退成无效值）：`)
  for (const item of missing) {
    console.log(`  ${item.name}  ←  ${item.files.slice(0, 3).join(', ')}`)
  }
  console.log('')
}
  console.log('修复方式：')
  console.log('  · 与主题无关的（圆角/间距）→ 在 src/styles/palettes.less 的 :root 块定义为 CSS 变量')
  console.log("  · 随主题变化的 → 在 :root[data-theme='NIGHT'] / [data-theme='DAY'] 块内定义")
  console.log('  注意：Less 变量 @foo 与 CSS 变量 --foo 是两套东西，Less 变量不能被 var() 消费')
}
process.exit(strict || drifted.length ? 1 : 0)
