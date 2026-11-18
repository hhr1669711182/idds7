#!/usr/bin/env node
/**
 * check-env-sync.mjs
 *
 * 解析 src/config/env.ts 中所有非注释的 readEnvString('VITE_*') 键，
 * 对比 .env.local.example 确保全部覆盖（含注释形式 `# VITE_XXX=`）。
 *
 * 用法：
 *   node scripts/check-env-sync.mjs           # 检查模式（缺失则 exit 1）
 *   node scripts/check-env-sync.mjs --fix     # 修复模式（自动追加缺失项到模板末尾）
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const envTsPath = resolve(root, 'src/config/env.ts')
const templatePath = resolve(root, '.env.local.example')

const isFix = process.argv.includes('--fix')

// 环境标识 / build-time 变量：值由运行环境或构建命令决定，不需要在模板里声明
const SKIP_KEYS = new Set([
  'VITE_APP_ENV',    // 由 .env.development / .env.test / .env.production 分别定义
  'VITE_BUILD_LIB',  // build 时通过 process.env.BUILD_LIB 注入，不在 env 文件里
])

/**
 * 从 TS 源码提取所有非注释行的 readEnvString('VITE_XXX') 键。
 * 跳过以 // 或 * 开头的纯注释行，避免提取已注释掉的旧代码。
 */
function extractRequiredKeys(tsContent) {
  const keys = []
  for (const line of tsContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
    const matches = [...trimmed.matchAll(/readEnvString\('VITE_([A-Z0-9_]+)'\)/g)]
    for (const m of matches) {
      const key = 'VITE_' + m[1]
      if (!SKIP_KEYS.has(key) && !keys.includes(key)) keys.push(key)
    }
  }
  return keys
}

/**
 * 从 .env 文件提取所有出现的 VITE_* 键（含注释形式）。
 * 匹配：VITE_XXX=  |  # VITE_XXX=  |  #VITE_XXX=
 */
function extractDeclaredKeys(envContent) {
  const keys = []
  for (const line of envContent.split('\n')) {
    const m = line.match(/^(?:#\s*)?VITE_([A-Z0-9_]+)\s*=/)
    if (m) {
      const key = 'VITE_' + m[1]
      if (!keys.includes(key)) keys.push(key)
    }
  }
  return keys
}

// ── 读取与对比 ────────────────────────────────────────────────────────────────
const envTsContent = readFileSync(envTsPath, 'utf-8')
const requiredKeys = extractRequiredKeys(envTsContent)

let templateContent = ''
if (existsSync(templatePath)) {
  templateContent = readFileSync(templatePath, 'utf-8')
}
const declaredKeys = extractDeclaredKeys(templateContent)

const missing = requiredKeys.filter((k) => !declaredKeys.includes(k))

if (missing.length === 0) {
  console.log('✅ .env.local.example 已覆盖 src/config/env.ts 全部 VITE_* 键')
  process.exit(0)
}

// ── 处理缺失 ───────────────────────────────────────────────────────────────────
if (isFix) {
  const additions = missing.map((k) => `# ${k}=  # TODO: 补充用途说明`).join('\n')
  const separator = '\n# === 以下由 check-env-sync --fix 自动补充（请按需填入默认值）===\n'
  const newContent = templateContent.trimEnd() + '\n' + separator + additions + '\n'
  writeFileSync(templatePath, newContent, 'utf-8')
  console.log(`🔧 已追加 ${missing.length} 个缺失键到 .env.local.example：`)
  for (const k of missing) console.log(`   + ${k}`)
  console.log('请手动填入合理默认值后删除 TODO 注释。')
  process.exit(0)
} else {
  console.error(`❌ .env.local.example 缺少 ${missing.length} 个 src/config/env.ts 读取的 VITE_* 键：`)
  for (const k of missing) console.error(`   缺失: ${k}`)
  console.error('')
  console.error('运行 `node scripts/check-env-sync.mjs --fix` 自动补齐，或手动添加到 .env.local.example。')
  process.exit(1)
}
