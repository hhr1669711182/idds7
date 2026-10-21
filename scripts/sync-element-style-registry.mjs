/*
 * 同步 Element Plus 样式清单到 Vite 插件。
 *
 * 真源是 src/utils/elementStyleRegistry.ts（供业务侧查表），但 Vite 插件是
 * .mjs，无法直接 import .ts，故由本脚本生成插件内���的内联清单。
 * 真源变更后必须执行：pnpm sync:element-styles
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'src/utils/elementStyleRegistry.ts')
const targetPath = path.join(root, 'scripts/vite-plugin-element-styles.mjs')

const source = fs.readFileSync(sourcePath, 'utf8')

const registryMatch = source.match(/ELEMENT_STYLE_REGISTRY: Record<string, string> = \{([\s\S]*?)\n\}/)
if (!registryMatch) {
  console.error('[element-styles] 无法解析 ELEMENT_STYLE_REGISTRY，源文件格式已变')
  process.exit(1)
}
const entries = [...registryMatch[1].matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]])

const bundleMatch = source.match(/ELEMENT_STYLE_BUNDLES: string\[\] = \[([\s\S]*?)\]/)
if (!bundleMatch) {
  console.error('[element-styles] 无法解析 ELEMENT_STYLE_BUNDLES，源文件格式已变')
  process.exit(1)
}
const bundles = [...bundleMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])

const marker = /const ELEMENT_STYLE_REGISTRY = \{[\s\S]*?\n\}/
if (!marker.test(fs.readFileSync(targetPath, 'utf8'))) {
  console.error('[element-styles] 目标文件结构已变，请手动同步')
  process.exit(1)
}

const target = fs.readFileSync(targetPath, 'utf8')
const generated = `const ELEMENT_STYLE_REGISTRY = {
${entries.map(([k, v]) => `  ${k}: '${v}',`).join('\n')}
}`
const generatedBundles = `const ELEMENT_STYLE_BUNDLES = [
${bundles.map((b) => `  '${b}',`).join('\n')}
]`

const next = target.replace(marker, generated).replace(/const ELEMENT_STYLE_BUNDLES = \[[\s\S]*?\n\]/, generatedBundles)

fs.writeFileSync(targetPath, next, 'utf8')
console.log(`[element-styles] 已同步 ${entries.length} 个组件样式 + ${bundles.length} 个整包样式`)
