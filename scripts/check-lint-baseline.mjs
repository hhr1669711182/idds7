#!/usr/bin/env node
/**
 * 类型门禁基线检查（只提示，不阻塞提交）。
 *
 * 现状：仓库有 193 个既有 vue-tsc 报错（TS6133 为主），暂不清理。
 * 策略：
 *   - 与 lint-baseline.json 比对，识别「新增」与「已修复」；
 *   - 默认仅打印报告并 exit 0（advisory 模式，不阻塞提交）；
 *   - 设置 LINT_BASELINE_STRICT=1 时才对新增报错 exit 1（预留 CI 门禁）。
 *
 * 用法：
 *   node scripts/check-lint-baseline.mjs             # 提示模式（pre-commit 默认）
 *   LINT_BASELINE_STRICT=1 node scripts/...          # 严格模式（CI 用）
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const baselinePath = resolve(root, 'lint-baseline.json')
const strict = process.env.LINT_BASELINE_STRICT === '1'
const update = process.argv.includes('--update')
const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

const current = new Set()

const run = () => {
  const result = spawnSync(command, ['exec', 'vue-tsc', '--noEmit', '--pretty', 'false'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  })

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  for (const line of output.split(/\r?\n/)) {
    // 形如 src/foo.ts(12,5): error TS6133: 'x' is declared but its value is never read.
    const m = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/)
    if (!m) continue
    const [, file, lineNo, colNo, code, message] = m
    current.add(`${file.trim()}(${lineNo},${colNo}) ${code}: ${message.trim()}`)
  }
  return { count: current.size, output }
}

const baseline = new Set(
  existsSync(baselinePath)
    ? JSON.parse(readFileSync(baselinePath, 'utf8')).errors ?? []
    : [],
)

const { count, output } = run()

if (count === 0 && output.trim()) {
  console.error('[lint-baseline] vue-tsc 执行异常，未能解析错误列表：')
  console.error(output.slice(0, 2000))
  process.exit(0)
}

const added = [...current].filter((item) => !baseline.has(item))
const fixed = [...baseline].filter((item) => !current.has(item))

console.log(`[lint-baseline] 当前 ${count} 项 / 基线 ${baseline.size} 项`)
if (fixed.length) console.log(`[lint-baseline] 已修复 ${fixed.length} 项`)
if (added.length) {
  console.warn(`[lint-baseline] 新增 ${added.length} 项：`)
  for (const item of added) console.warn(`  + ${item}`)
} else {
  console.log('[lint-baseline] 无新增报错')
}

if (update) {
  writeFileSync(baselinePath, JSON.stringify({
    note: 'vue-tsc 既有基线，暂不清理；pre-commit 仅提示不阻塞。修完一批后运行 pnpm lint:baseline:update 收敛',
    count: current.size,
    generatedAt: new Date().toISOString().slice(0, 10),
    errors: [...current].sort(),
  }, null, 2) + '\n')
  console.log(`[lint-baseline] 基线已更新为 ${current.size} 项`)
  process.exit(0)
}

if (!existsSync(baselinePath)) {
  writeFileSync(baselinePath, JSON.stringify({ errors: [...current].sort() }, null, 2) + '\n')
  console.log(`[lint-baseline] 已生成基线：${baselinePath}`)
  process.exit(0)
}

if (added.length) {
  console.log('[lint-baseline] 建议：修完新增项后运行 pnpm lint:baseline:update 收敛基线')
}

process.exit(added.length > 0 && strict ? 1 : 0)
