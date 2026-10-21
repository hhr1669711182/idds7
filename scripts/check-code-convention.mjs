#!/usr/bin/env node
/**
 * 代码约定机检（注释规范部分）。
 *
 * 状态：**已入库但按团队决策不执行** —— 既未挂进 `harness:check`，也未接 pre-commit / CI。
 * 手动试跑仅用于观察存量现状，不作为门禁：
 *   node scripts/check-code-convention.mjs
 *   node scripts/check-code-convention.mjs --staged    # 只看暂存区（新代码治理推荐用法）
 *   node scripts/check-code-convention.mjs --all       # 扫全仓，仅用于人工盘点
 *
 * 检出规则见 herness/05-共享上下文/代码注释规范.md 第九节。阈值调整后需同步该文档。
 *
 * 设计原则：
 * - 纯只读：不改任何源码，不格式化，不写文件；
 * - 不报存量：默认只扫 git 变更文件（新增/改动），未触碰的存量注释不产生噪音。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = resolve(root, 'src')
const SOURCE_EXTS = new Set(['.ts', '.tsx', '.vue'])
const PUBLIC_DIRS = new Set([
  'utils',
  'controller',
  'store',
  'composables',
  'apis',
  'config',
  'const',
  'interceptor',
  'service',
])

/* ---------------- 阈值（调整需同步文档） ---------------- */
const MAX_JS_DOC_LINES = 10
const MAX_CONSECUTIVE_LINES = 15
const TODO_BARE_RE = /(?<![\w/])TODO(?![\w(])/
const TEMPLATE_HEADER_RE = /@(Author|LastEditTime|LastEditors|FilePath)/
const COMMENTED_CODE_RE =
  /^\s*(?:\/\/|\*)\s*(?:import\s|export\s|const\s|let\s|var\s|function\s|class\s|interface\s|type\s|return\s|if\s*\(|for\s*\(|while\s*\(|this\.|await\s|new\s+[A-Z])/

/* ---------------- 收集扫描文件 ---------------- */
const args = process.argv.slice(2)
const scanAll = args.includes('--all')
const onlyStaged = args.includes('--staged')

const gitChanged = (extraFlags) => {
  try {
    const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMR', ...extraFlags, 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    })
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

const walkSrc = (dir, acc) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) walkSrc(full, acc)
    else if (SOURCE_EXTS.has(extname(entry.name))) acc.push(full)
  }
  return acc
}

const collectFiles = () => {
  let files = []
  if (scanAll) {
    files = walkSrc(srcRoot, [])
  } else if (onlyStaged) {
    files = gitChanged(['--cached']).map((f) => resolve(root, f))
  } else if (existsSync(resolve(root, '.git'))) {
    files = [...new Set([...gitChanged([]), ...gitChanged(['--cached'])])].map((f) => resolve(root, f))
  }
  return files.filter((f) => f.startsWith(srcRoot + sep) && SOURCE_EXTS.has(extname(f)))
}

const isPublic = (abs) => PUBLIC_DIRS.has(relative(srcRoot, abs).split(sep)[0])

/* ---------------- 规则实现 ---------------- */
const checkFile = (abs) => {
  const rel = relative(root, abs)
  const lines = readFileSync(abs, 'utf8').split('\n')
  const issues = []

  let runStart = -1
  let runLen = 0
  let jsDocStart = -1
  let jsDocLen = 0

  const flushRun = () => {
    if (runLen > MAX_CONSECUTIVE_LINES) {
      issues.push({
        line: runStart + 1,
        rule: 'consecutive-block',
        msg: '连续注释块 ' + runLen + ' 行，超上限 ' + MAX_CONSECUTIVE_LINES + '，应搬到 herness/02-技术设计/',
      })
    }
    runLen = 0
    runStart = -1
  }

  lines.forEach((raw, index) => {
    const line = raw.replace(/\r$/, '')
    const trimmed = line.trim()
    const isLineComment = trimmed.startsWith('//')
    const isBlockStar = trimmed.startsWith('*')
    const isBlockOpen = trimmed.startsWith('/**') || /^\/\*[^/*]/.test(trimmed)
    const isBlockClose = trimmed.startsWith('*/')
    const isComment = isLineComment || isBlockStar || isBlockOpen || isBlockClose

    if (trimmed.startsWith('/**')) {
      jsDocStart = index
      jsDocLen = 1
    } else if (jsDocStart >= 0 && (isBlockStar || isBlockClose)) {
      jsDocLen += 1
    }

    if (isComment) {
      if (runLen === 0) runStart = index
      runLen += 1
    } else if (trimmed !== '') {
      flushRun()
    }

    if (index < 25 && TEMPLATE_HEADER_RE.test(line)) {
      issues.push({
        line: index + 1,
        rule: 'template-header',
        msg: '新增/改动文件不应带 @Author/@LastEditTime/@FilePath 模板头（存量保持现状）',
      })
    }

    if ((isLineComment || isBlockStar) && COMMENTED_CODE_RE.test(line)) {
      issues.push({ line: index + 1, rule: 'commented-code', msg: '疑似注释掉的代码，新代码禁止（git 有历史）' })
    }

    if (TODO_BARE_RE.test(line)) {
      issues.push({
        line: index + 1,
        rule: 'todo-bare',
        msg: 'TODO 缺三要素，格式：TODO(责任人, YYYY-MM-DD, 问题号): 原因 —— 待做什么 —— 何时删',
      })
    }

    if (isBlockClose && jsDocStart >= 0) {
      if (jsDocLen > MAX_JS_DOC_LINES) {
        issues.push({
          line: jsDocStart + 1,
          rule: 'jsdoc-long',
          msg: 'JSDoc ' + jsDocLen + ' 行，超上限 ' + MAX_JS_DOC_LINES,
        })
      }
      jsDocStart = -1
      jsDocLen = 0
    }

    if (isPublic(abs) && /^\s*export\s+(?:async\s+)?(?:function|const|class|interface|type|let)\s/.test(line)) {
      const prev = (lines[index - 1] ?? '').trim()
      const hasDoc = prev.endsWith('*/') || prev.startsWith('/**') || prev.startsWith('*')
      if (!hasDoc) {
        issues.push({ line: index + 1, rule: 'missing-jsdoc', msg: '公共文件导出符号缺 JSDoc（新增/改动必须写）' })
      }
    }
  })

  flushRun()
  return { rel, issues }
}

/* ---------------- 输出 ---------------- */
const files = collectFiles()
if (files.length === 0) {
  console.log('没有待检查的变更文件（新增/改动 src 文件为空）。')
  console.log('提示：--all 可扫全仓，仅用于人工盘点；--staged 只看暂存区。')
} else {
  let total = 0
  const byRule = new Map()
  console.log('检查 ' + files.length + ' 个变更文件……\n')
  for (const file of files) {
    let result
    try {
      result = checkFile(file)
    } catch {
      continue
    }
    if (result.issues.length === 0) continue
    console.log(result.rel)
    for (const issue of result.issues) {
      console.log('  ' + String(issue.line).padStart(5) + '  [' + issue.rule + '] ' + issue.msg)
      byRule.set(issue.rule, (byRule.get(issue.rule) ?? 0) + 1)
      total += 1
    }
    console.log('')
  }
  console.log('-'.repeat(60))
  if (total === 0) {
    console.log('注释规范：变更文件未发现问题。')
  } else {
    console.log('注释规范：共 ' + total + ' 处提醒（按规则）')
    for (const [rule, count] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
      console.log('  ' + rule.padEnd(20) + ' ' + count)
    }
    console.log('')
    console.log('细则：herness/05-共享上下文/代码注释规范.md')
    console.log('注意：本脚本当前不接入门禁，仅作提示；存量文件的问题不在本次治理范围。')
  }
}
