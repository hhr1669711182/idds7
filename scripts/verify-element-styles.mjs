/*
 * Element Plus 样式完整性校验。
 *
 * 检查两件事：
 *   1. 源码中用到的每个 El 组件，是否在样式清单里登记（否则构建后样式缺失）；
 *   2. 构建产物中是否真的包含了 base.css 的 --el-* 根变量（根变量被拆到异步 chunk 会导致首屏主题失效）。
 *
 * 校验不过即退出码 1，供 pnpm verify:styles 与 husky pre-commit 使用。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const registryPath = path.join(root, 'src/utils/elementStyleRegistry.ts')
const source = fs.readFileSync(registryPath, 'utf8')

const registryMatch = source.match(/ELEMENT_STYLE_REGISTRY: Record<string, string> = \{([\s\S]*?)\n\}/)
if (!registryMatch) {
  console.error('[element-styles] 无法解析 ELEMENT_STYLE_REGISTRY')
  process.exit(1)
}
const registry = new Map([...registryMatch[1].matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]))

/** 扫描源码收集用到的 El 组件名 */
const used = new Set()
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'dist-lib'].includes(entry.name)) continue
      walk(full)
      continue
    }
    if (!/\.(vue|ts|tsx|js)$/.test(entry.name)) continue
    // 排除样式清单自身：它列出了全部组件名，扫描会自我放大
    if (entry.name === 'elementStyleRegistry.ts') continue
    const content = fs.readFileSync(full, 'utf8')
    for (const m of content.matchAll(/<\s*([Ee]l[A-Z][A-Za-z0-9]*)/g)) used.add('El' + m[1].slice(2))
    for (const m of content.matchAll(/\b(El[A-Z][A-Za-z0-9]*)\b/g)) used.add(m[1])
  }
}
walk(path.join(root, 'src'))

/** 1. 清单覆盖检查 */
const missing = [...used].filter((name) => !registry.has(name)).sort()
if (missing.length) {
  console.error('[element-styles] 以下 El 组件未在 src/utils/elementStyleRegistry.ts 登记，样式不会进产物：')
  for (const name of missing) {
    console.error(
      `  - ${name}  →  建议登记：'${name}': 'element-plus/theme-chalk/el-${name.slice(2).toLowerCase()}.css'`,
    )
  }
  process.exit(1)
}

/** 2. 登记的样式文件必须真实存在（Element Plus 升级可能移除组件） */
const themeChalkDir = path.join(root, 'node_modules/element-plus/theme-chalk')
if (fs.existsSync(themeChalkDir)) {
  const actual = new Set(fs.readdirSync(themeChalkDir).filter((f) => f.endsWith('.css')))
  const broken = [...registry.entries()].filter(([, style]) => {
    const file = style.replace('element-plus/theme-chalk/', '')
    return !actual.has(file)
  })
  if (broken.length) {
    console.error('[element-styles] 以下登记的样式文件在 element-plus 中不存在：')
    for (const [name, style] of broken) console.error(`  - ${name}  →  ${style}`)
    process.exit(1)
  }
}

/** 3. 产物根变量检查 */
const distDir = path.join(root, 'dist/assets')
if (fs.existsSync(distDir)) {
  const cssFiles = fs.readdirSync(distDir).filter((f) => f.endsWith('.css'))
  const hasRootVars = cssFiles.some((f) => {
    const content = fs.readFileSync(path.join(distDir, f), 'utf8')
    return /--el-color-primary\s*:/.test(content) && /--el-text-color-primary\s*:/.test(content)
  })
  if (!hasRootVars) {
    console.error(
      '[element-styles] 构建产物中未找到 --el-color-primary / --el-text-color-primary 根变量，Element Plus 主题将失效',
    )
    process.exit(1)
  }
}

console.log(`[element-styles] 校验通过：${used.size} 个 El 组件全部登记，产物含 --el-* 根变量`)
