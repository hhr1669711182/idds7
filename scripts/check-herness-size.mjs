#!/usr/bin/env node
/**
 * herness 文档体量门禁（只提示，不阻塞提交）。
 *
 * 解决的问题：
 * - `00-SOP.md` 是每次必读的规则，被工作日志撑爆会挤占 agent 上下文；
 * - 工作日志混在 SOP 里，多人并行提交时同区间撞车。
 *
 * 策略：
 * - `00-SOP.md` 超过 SOP_MAX_BYTES 提醒拆分（规则应下沉到 05-共享上下文）；
 * - 检测到工作日志被写回 `00-SOP.md` 时提醒改写到 `09-工作日志/`；
 * - 检测到已修复条目长期留在 `当前状态摘要.md` 时提醒删除。
 *
 * 用法：
 *   node scripts/check-herness-size.mjs             # 提示模式（pre-commit 默认）
 *   HARNESS_STRICT=1 node scripts/...               # 严格模式（CI 用，超限 exit 1）
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const herness = join(root, 'herness')
const strict = process.env.HARNESS_STRICT === '1'

/** 00-SOP.md 是每次必读，允许的上限（字节）。当前约 11.5KB，留 2 倍余量。 */
const SOP_MAX_BYTES = 24 * 1024
/** 单个日志文件超过此体积提示按主题拆分（正常一天只有几 KB）。 */
const LOG_FILE_MAX_BYTES = 32 * 1024

const warnings = []

const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`

// 1. 00-SOP.md 体量
const sopPath = join(herness, '00-SOP.md')
if (existsSync(sopPath)) {
  const size = statSync(sopPath).size
  if (size > SOP_MAX_BYTES) {
    warnings.push(
      `00-SOP.md 已达 ${kb(size)}（上限 ${kb(SOP_MAX_BYTES)}）。` +
        `它是每次必读的规则，请把稳定规则下沉到 05-共享上下文/，工作日志写到 09-工作日志/。`,
    )
  }
  // 工作日志被写回 SOP 的信号：大量表格行且形如日期开头
  const sopText = readFileSync(sopPath, 'utf8')
  const logRows = (sopText.match(/^\| 20\d\d-\d\d-\d\d \|/gm) ?? []).length
  if (logRows > 0) {
    warnings.push(
      `00-SOP.md 里还有 ${logRows} 行工作日志记录。` +
        `请移到 herness/09-工作日志/YYYY-MM/YYYY-MM-DD.md，SOP 只保留规则。`,
    )
  }
}

// 2. 单个日志文件体量（结构：09-工作日志/YYYY-MM/YYYY-MM-DD/agent-<用户名>.md）
const logRoot = join(herness, '09-工作日志')
if (existsSync(logRoot)) {
  for (const month of readdirSync(logRoot)) {
    const monthDir = join(logRoot, month)
    if (!statSync(monthDir).isDirectory()) continue
    for (const day of readdirSync(monthDir)) {
      const dayDir = join(monthDir, day)
      if (!statSync(dayDir).isDirectory()) continue
      for (const file of readdirSync(dayDir)) {
        if (!file.endsWith('.md')) continue
        const size = statSync(join(dayDir, file)).size
        if (size > LOG_FILE_MAX_BYTES) {
          warnings.push(
            `日志文件 09-工作日志/${month}/${day}/${file} 已达 ${kb(size)}` +
              `（上限 ${kb(LOG_FILE_MAX_BYTES)}）。内容过多请按主题拆分，或把仍有效的结论沉淀到 05-共享上下文/当前状态摘要.md。`,
          )
        }
      }
    }
  }
}

// 3. 当前状态摘要里不该留「已修复」条目
const summaryPath = join(herness, '05-共享上下文', '当前状态摘要.md')
if (existsSync(summaryPath)) {
  const text = readFileSync(summaryPath, 'utf8')
  const fixedRows = text
    .split(/\r?\n/)
    .filter((line) => /已修复|已废弃|已下线/.test(line) && line.trim().startsWith('|'))
  if (fixedRows.length > 0) {
    warnings.push(
      `当前状态摘要.md 里还有 ${fixedRows.length} 行标记为「已修复/已废弃」的条目。` +
        `本文件只写「当前仍成立」的事实，问题修复后请直接删除对应行（留着会让 AI 按过期结论决策）。`,
    )
  }
}

if (warnings.length === 0) {
  console.log('[herness-size] 文档体量正常')
  process.exit(0)
}

console.warn('[herness-size] 文档体量告警：')
for (const w of warnings) console.warn(`  ! ${w}`)
console.log(
  '[herness-size] 规则：流水账进 09-工作日志，规矩进 05-共享上下文规范，当前状态进当前状态摘要，落地完的方案进 02-技术设计/_archive',
)

process.exit(strict ? 1 : 0)
