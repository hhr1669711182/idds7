#!/usr/bin/env node
/**
 * backdrop-filter 写法检查（只读，不阻塞）。
 *
 * 背景（本项目真实踩坑）：
 * Vite 8 的 CSS 压缩走 Lightning CSS。当同一条规则里同时写
 *   backdrop-filter: blur(...);
 *   -webkit-backdrop-filter: blur(...);
 * 且 plain 版本排在后面时，Lightning CSS 会判定两者等价而只保留
 * `-webkit-backdrop-filter`。而 Chrome 实测对 `-webkit-backdrop-filter`
 * 的 getComputedStyle().backdropFilter 返回 "none" —— 毛玻璃彻底失效，
 * 且编译期、lint、运行时都不报错，只能靠产物核验发现。
 *
 * 结论：只写 plain 的 `backdrop-filter`，不要写 `-webkit-` 前缀。
 * Safari 18+ 已支持无前缀写法；更老的 Safari 不在本项目支持范围内。
 *
 * 用法：
 *   node scripts/check-backdrop-filter.mjs
 *   LINT_BACKDROP_STRICT=1 node scripts/...   # 严格模式（CI 用）
 *
 * 规范见 herness/05-共享上下文/代码样式规范.md
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = resolve(root, 'src')
const strict = process.env.LINT_BACKDROP_STRICT === '1'

const SCAN_EXTS = new Set(['.vue', '.less', '.css'])

const walk = (dir, acc = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (SCAN_EXTS.has(extname(entry.name))) acc.push(full)
  }
  return acc
}

/** 去掉注释，避免文档示例被误判 */
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const files = existsSync(srcRoot) ? walk(srcRoot) : []
const offenders = []
let plainCount = 0

for (const file of files) {
  const text = stripComments(readFileSync(file, 'utf8'))
  if (!/backdrop-filter\s*:/.test(text)) continue

  plainCount += (text.match(/(?<![-\w])backdrop-filter\s*:/g) || []).length
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (/(^|[^-\w])-webkit-backdrop-filter\s*:/.test(line)) {
      offenders.push({
        file: relative(root, file),
        line: index + 1,
        text: line.trim(),
      })
    }
  })
}

if (offenders.length === 0) {
  console.log(`[backdrop] ✅ ${plainCount} 处 backdrop-filter 均为标准写法（无 -webkit- 前缀）`)
  process.exit(0)
}

console.log(`[backdrop] ❌ ${offenders.length} 处使用了 -webkit-backdrop-filter 前缀：`)
for (const item of offenders) {
  console.log(`  ${item.file}:${item.line}  ${item.text}`)
}
console.log('')
console.log('原因：Lightning CSS 会把 plain + -webkit- 组合去重成只剩 -webkit-，')
console.log('      而 Chrome 对 -webkit-backdrop-filter 计算值返回 none，毛玻璃直接失效。')
console.log('修复：删掉 -webkit- 行，只保留 backdrop-filter。')
process.exit(strict ? 1 : 0)
