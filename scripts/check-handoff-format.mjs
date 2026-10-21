#!/usr/bin/env node
/**
 * check-handoff-format.mjs
 * 校验 herness/08-会话交接/records/ 下的 .md 交接记录的结构完整性。
 *
 * 检查项：
 *   1. 元数据表必填字段（格式版本、任务标识、生成时间、作者、仓库标识、分支、HEAD、supersedes、任务阶段）
 *   2. 任务阶段值在枚举内
 *   3. 必填章节标题存在（## 1 ~ ## 9）
 *   4. 相对 Markdown 链接目标文件可达（排除 http/https）
 *   5. 敏感信息粗检（token/password/secret/private_key 模式，不阻断只警告）
 *
 * 默认提示模式：打印结果但不改变退出码（退出码始终 0）。
 * 加 --strict：有 error 级别问题时退出码 1。
 *
 * 串入 pnpm harness:check，与 check-herness-size.mjs 和 manifest-assets.mjs 并列。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(__filename), '..')
const RECORDS_DIR = join(ROOT, 'herness', '08-会话交接', 'records')
const STRICT = process.argv.includes('--strict')

// ── 常量 ──────────────────────────────────────────────────────────────
const REQUIRED_METADATA_FIELDS = [
  '格式版本', '任务标识', '生成时间', '作者',
  '仓库标识', '分支', 'HEAD', 'supersedes', '任务阶段',
]
const PHASE_ENUM = ['调查中', '待方案确认', '实现中', '待验证', '阻塞', '已完成']
const REQUIRED_SECTIONS = [
  '目标与边界', '方案与授权', '已确认事实与关键决策',
  '进度与阻塞', '工作区与改动归属', '验证记录',
  '踩坑、风险与待确认', '下一步与停止点', '按需阅读与接续指令',
]
const SECRET_PATTERNS = [
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9_-]{16,}['"]/gi,
  /(?:token|access_token|auth_token)\s*[:=]\s*['"][A-Za-z0-9._-]{20,}['"]/gi,
  /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g,
  /(?:password|passwd|pwd)\s*[:=]\s*['"][^\s'"]{8,}['"]/gi,
  /secret\s*[:=]\s*['"][A-Za-z0-9_-]{16,}['"]/gi,
]

// ── 工具 ──────────────────────────────────────────────────────────────
function collectRecordFiles(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) collectRecordFiles(full, out)
    else if (e.isFile() && e.name.endsWith('.md')) out.push(full)
  }
  return out
}

function extractMetadataLines(content) {
  // 元数据表在 "# ..." 标题之后的第一张 | ... | 表格
  const lines = content.split('\n')
  const metaLines = []
  let inMeta = false
  for (const line of lines) {
    if (line.startsWith('| 元数据 |') || line.match(/^\|\s*元数据\s*\|/)) { inMeta = true; continue }
    if (inMeta) {
      if (line.startsWith('|---')) continue
      if (line.startsWith('|')) {
        metaLines.push(line)
      } else if (metaLines.length > 0) {
        break
      }
    }
  }
  // 解析 key-value
  const fields = {}
  for (const line of metaLines) {
    const parts = line.split('|').map(p => p.trim()).filter(Boolean)
    if (parts.length >= 2) fields[parts[0]] = parts[1]
  }
  return fields
}

function extractSectionHeaders(content) {
  // 匹配 ## N. 标题
  const re = /^##\s+\d+\s*[.、]?\s*(.+)$/gm
  const titles = []
  let m
  while ((m = re.exec(content)) !== null) titles.push(m[1].trim())
  return titles
}

function extractRelativeLinks(content) {
  // 匹配 [text](path) 排除 http/https/mailto
  const re = /\]\(([^)\s]+)\)/g
  const links = []
  let m
  while ((m = re.exec(content)) !== null) {
    const target = m[1]
    if (!/^(?:https?:|mailto:|#)/.test(target)) links.push(target)
  }
  return links
}

// ── 主流程 ────────────────────────────────────────────────────────────
const files = collectRecordFiles(RECORDS_DIR)
const results = [] // { file, errors: [], warnings: [] }

for (const file of files) {
  const rel = relative(ROOT, file)
  const errors = []
  const warnings = []
  let content
  try {
    content = readFileSync(file, 'utf-8')
  } catch (e) {
    errors.push(`无法读取文件: ${e.message}`)
    results.push({ file: rel, errors, warnings })
    continue
  }

  // 1. 元数据
  const meta = extractMetadataLines(content)
  for (const field of REQUIRED_METADATA_FIELDS) {
    if (!(field in meta) || meta[field].length === 0 || meta[field] === '—' || meta[field] === '<>') {
      errors.push(`元数据缺失或为空: ${field}`)
    }
  }
  // 格式版本
  if (meta['格式版本'] && meta['格式版本'] !== '1') {
    warnings.push(`格式版本 = "${meta['格式版本']}"（当前规范仅支持 1）`)
  }
  // 任务阶段枚举
  if (meta['任务阶段'] && !PHASE_ENUM.includes(meta['任务阶段'])) {
    errors.push(`任务阶段 "${meta['任务阶段']}" 不在枚举 [${PHASE_ENUM.join(', ')}]`)
  }
  // supersedes 若非「无」则检查路径存在
  if (meta['supersedes'] && meta['supersedes'] !== '无' && !meta['supersedes'].startsWith('<')) {
    const supPath = resolve(dirname(file), meta['supersedes'])
    try {
      statSync(supPath)
    } catch {
      warnings.push(`supersedes 指向的路径不存在: ${meta['supersedes']}`)
    }
  }

  // 2. 章节
  const sections = extractSectionHeaders(content)
  for (const required of REQUIRED_SECTIONS) {
    const found = sections.some(s => s.includes(required))
    if (!found) errors.push(`缺少必填章节: "${required}"`)
  }

  // 3. 相对链接
  const links = extractRelativeLinks(content)
  for (const target of links) {
    const resolved = resolve(dirname(file), target)
    try {
      statSync(resolved)
    } catch {
      errors.push(`相对链接目标不存在: ${target}`)
    }
  }

  // 4. 敏感信息粗检
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(content)) {
      warnings.push(`疑似明文凭证（模式: ${pattern.source.slice(0, 40)}…）`)
    }
  }

  results.push({ file: rel, errors, warnings })
}

// ── 输出 ─────────────────────────────────────────────────────────────
const totalErrors = results.reduce((s, r) => s + r.errors.length, 0)
const totalWarnings = results.reduce((s, r) => s + r.warnings.length, 0)

console.log('[handoff-format] 交接记录格式检查')
console.log(`  扫描目录: herness/08-会话交接/records/`)
console.log(`  记录数: ${files.length}`)
console.log(`  错误: ${totalErrors} 条  警告: ${totalWarnings} 条`)

for (const r of results) {
  if (r.errors.length === 0 && r.warnings.length === 0) {
    console.log(`  ✅ ${r.file}`)
  } else {
    console.log(`  ${r.file}`)
    for (const e of r.errors) console.log(`    x ${e}`)
    for (const w of r.warnings) console.log(`    ! ${w}`)
  }
}

if (totalErrors === 0 && totalWarnings === 0) {
  console.log('  全部通过')
}

// 退出码
if (STRICT && totalErrors > 0) {
  console.log(`[handoff-format] --strict 模式，${totalErrors} 条错误，退出码 1`)
  process.exit(1)
}
console.log('[handoff-format] 提示模式（如需阻断请加 --strict）')
