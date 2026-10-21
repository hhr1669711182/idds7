#!/usr/bin/env node
/**
 * 资源清单生成与校验（B1 批次）。
 *
 * 目标（见 herness/02-技术设计/前端/资源文件管理-技术方案.md §5.4）：
 * 1. 扫描 public/** 与 src/** 下的资源文件，按扩展名白名单识别；
 * 2. 生成 docs/asset-manifest.json：路径 / 体积 / sha256 / 分类 / 引用方；
 * 3. 校验三条：
 *    - R2 合规：代码里 loader.load('/…')、fetch('/…')、fetch("./…") 等运行期字面量
 *      必须能在 manifest 中找到对应文件，否则提示改用 @/const/assetPaths；
 *    - 重复检测：同一 sha256 出现在两个不同路径时报错（除非显式 duplicateOf）；
 *    - 无引用检测：refs 为空且未标 keepReason / publicLiteral 的文件给出警告（不阻断）。
 *
 * 用法：
 *   node scripts/manifest-assets.mjs            # 生成清单并校验（提示模式）
 *   node scripts/manifest-assets.mjs --check    # 只校验，不写文件
 *   ASSET_MANIFEST_STRICT=1 node scripts/...     # 严格模式（R2/重复 报错即 exit 1）
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'docs', 'asset-manifest.json')
const checkOnly = process.argv.includes('--check')
const strict = process.env.ASSET_MANIFEST_STRICT === '1'

/** 资源扩展名白名单。.vue/.ts/.less 等代码文件不计入。 */
const ASSET_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.glb',
  '.gltf',
  '.obj',
  '.bin',
  '.fbx',
  '.tif',
  '.tiff',
  '.mp4',
  '.webm',
  '.json',
])

/**
 * three.js 字体有两种后缀：*.typeface.json 与 *.json（YEFONTDianYingPangBaiTi_Regular.json），
 * 都按字体资源处理，避免大文件漏扫。
 */
const isAssetFile = (name) => {
  if (name.endsWith('.typeface.json')) return true
  // src 下的 .json 多为业务静态数据（lands/amapData/hongshang/ssrk），也属于受管资源
  if (name.endsWith('.json')) return true
  const dot = name.lastIndexOf('.')
  return dot > 0 && ASSET_EXTENSIONS.has(name.slice(dot))
}

/** 明确标记「必须保留且无人引用」的文件（部署期资源、外部依赖、历史包袱）。 */
const KEEP_REASONS = {
  'public/main-screen.html': '调试页，由 mock 服务/运维直接访问',
  'public/vehicle-api-test.html': '车辆接口手工验证页，运维直接访问',
  'public/web.config': 'IIS 部署期 MIME 配置',
  'public/publicLink.js': '库模式宿主可改的运行期配置入口',
  'public/icons.svg': 'sprite，App.vue fetch 后注入 #svgBase',
  'public/tw.svg': 'index.html favicon',
  'public/video/MVI_39031.mp4': '现场视频本地兜底副本（代码当前走远程源）',
}

/**
 * 动态模板拼接引用的资源集合。
 *
 * `style/icons.ts::getCommonAlarmIconSrc` 用 `${colorType}-${type}.svg` 运行时拼文件名，
 * 静态扫描搜不到具体名字。这 6 个图元是实际在用资源，2026-10-19 曾被误判为零引用而删除，
 * 现显式登记，避免再次误报/误删。
 */
const DYNAMIC_ICON_GROUP_REASON =
  '动态模板引用：style/icons.ts::getCommonAlarmIconSrc 按 `${colorType}-${type}.svg` 运行时拼装'
for (const colorType of ['red', 'blue', 'grey']) {
  for (const type of ['fire', 'rescue', 'society']) {
    KEEP_REASONS[`src/assets/map/icon/${colorType}-${type}.svg`] = DYNAMIC_ICON_GROUP_REASON
  }
}

/** 按目录推断资源分类。 */
const inferKind = (relPath) => {
  if (relPath.startsWith('public/fonts') || relPath.includes('/fonts/')) return 'font'
  if (relPath.startsWith('public/model3d')) return 'model'
  if (relPath.endsWith('.tif') || relPath.endsWith('.tiff')) return 'geo'
  if (relPath.startsWith('public/video') || relPath.endsWith('.mp4')) return 'video'
  if (relPath.startsWith('public/')) return 'public-literal'
  if (relPath.includes('/map/') || relPath.includes('/map.')) return 'map'
  if (relPath.includes('/amap/')) return 'amap'
  if (relPath.includes('/ui/')) return 'ui'
  return 'other'
}

/** 递归收集文件（跳过依赖与产物目录）。 */
const walk = (dir) => {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      out.push(...walk(join(dir, entry.name)))
    } else if (entry.isFile()) {
      out.push(join(dir, entry.name))
    }
  }
  return out
}

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'dist-lib',
  '__artifacts__',
  '.git',
  'playwright-report',
  'test-results',
])

/** 计算文件 sha256（截断 16 位足够识别重复）。 */
const hashFile = (abs) => createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, 16)

// ── 1. 扫描 ──────────────────────────────────────────────────────────────
const candidates = [
  ...walk(join(root, 'public')),
  ...walk(join(root, 'src')),
]

/** 代码源文件，用于建立引用关系。 */
const codeFiles = [...walk(join(root, 'src')), ...walk(join(root, 'tests')), ...walk(join(root, 'server'))]

// 读取全部代码内容一次，用于引用匹配（资源文件只算 hash，不读内容）。
const codeContents = codeFiles
  .filter((f) => /\.(ts|tsx|js|jsx|vue|less|css|html|mjs|cjs)$/.test(f))
  .map((f) => [f, readFileSync(f, 'utf8')])

const refsOf = (baseName) => {
  const hits = []
  for (const [file, content] of codeContents) {
    if (content.includes(baseName)) hits.push(relative(root, file).split('\\').join('/'))
  }
  return hits
}

const assets = []
for (const abs of candidates) {
  const name = abs.split(/[\\/]/).pop()
  if (!isAssetFile(name)) continue
  const relPath = relative(root, abs).split('\\').join('/')
  const bytes = statSync(abs).size
  assets.push({
    path: relPath,
    bytes,
    sha256: hashFile(abs),
    kind: inferKind(relPath),
    refs: refsOf(name),
    publicLiteral: relPath.startsWith('public/'),
    keepReason: KEEP_REASONS[relPath] ?? null,
  })
}
assets.sort((a, b) => a.path.localeCompare(b.path))

// ── 2. 校验 ──────────────────────────────────────────────────────────────
const errors = []
const warnings = []

// 2a. 重复文件检测
const byHash = new Map()
for (const asset of assets) {
  const list = byHash.get(asset.sha256) ?? []
  list.push(asset.path)
  byHash.set(asset.sha256, list)
}
for (const [hash, paths] of byHash) {
  if (paths.length > 1) {
    errors.push(`重复资源：sha256=${hash} 出现在 ${paths.length} 处 → ${paths.join('  |  ')}`)
  }
}

// 2b. R2 合规：运行期资源字面量必须已登记
const manifestPaths = new Set(assets.map((a) => a.path))
const publicLiterals = new Set(Object.keys(KEEP_REASONS).map((p) => p.replace(/^public\//, '')))

// 匹配 loader.load('/…') / loadGLTF('/…') / TextureLoader.load('/…') / fetch('/…')
const runtimeLiteralPattern =
  /\b(?:loader\.load|loadGLTF|loadTexture|fetch)\s*\(\s*['"]([^'"]+)['"]/g

// 已迁移到 assetPaths 的新前缀（assets/ 前缀视为已合规）
const MIGRATED_PREFIXES = ['assets/']

for (const [file, content] of codeContents) {
  const relFile = relative(root, file).split('\\').join('/')
  // 排除常量层自身与测试（它们本就是声明/验证路径的）
  if (relFile.includes('assetPaths') || relFile.includes('assetUrl') || relFile.startsWith('tests/')) continue
  for (const match of content.matchAll(runtimeLiteralPattern)) {
    const literal = match[1]
    if (/^(https?:|data:|blob:)/.test(literal)) continue
    if (!literal.startsWith('/') && !literal.startsWith('./')) continue
    // 站内网关与接口前缀不是静态资源
    if (/^\/(api|a|bff-client|geoserver)/.test(literal)) continue
    const stripped = literal.replace(/^\.?\//, '')
    if (publicLiterals.has(stripped)) continue
    if (MIGRATED_PREFIXES.some((p) => stripped.startsWith(p))) continue
    if (manifestPaths.has(`public/${stripped}`)) {
      errors.push(
        `R2 违规：${relFile} 中运行期资源字面量 '${literal}' 指向 public/ 免编译资源。` +
          `应改用 @/const/assetPaths 的 assetUrls（迁移批次 B2/B3）。`,
      )
    } else {
      warnings.push(
        `R2 提示：${relFile} 中字面量 '${literal}' 未在 manifest 找到对应文件，请确认是否为运行期资源。`,
      )
    }
  }
}

// 2c. 无引用警告（不阻断，删除属人工决策）
//
// ⚠️ 2026-10-19 修正：这里曾造成一次误删事故。
// 本检测用「文件名是否出现在代码文本中」判断引用，但 `new URL(\`.../${colorType}-${type}.svg\`)`
// 这类**动态模板拼接**的文件名永远搜不到，于是 6 个实际在用的图元被判成「零引用」并被删除。
// 教训：零引用只是「未被静态引用」的信号，**不构成可删证据**，尤其是：
//   - 文件名由模板变量拼接（图标集、colorType-type 这类枚举）；
//   - 由地图引擎/瓦片服务按 URL 加载，不进 import 图（.tif / .gltf 贴图等）。
// 因此对这两类文件必须显式登记为 keepReason，扫描器才跳过提示。
for (const asset of assets) {
  if (asset.refs.length > 0) continue
  if (asset.keepReason) continue
  if (asset.publicLiteral) continue
  warnings.push(
    `零引用：${asset.path}（${(asset.bytes / 1024).toFixed(1)}KB）` +
      `—— 仅为「未被静态引用」，可能由模板拼接或引擎按 URL 加载，删除前必须人工确认`,
  )
}

// ── 3. 输出 ──────────────────────────────────────────────────────────────
const totalBytes = assets.reduce((sum, a) => sum + a.bytes, 0)
const byKind = assets.reduce((acc, a) => {
  acc[a.kind] = acc[a.kind] ?? { count: 0, bytes: 0 }
  acc[a.kind].count += 1
  acc[a.kind].bytes += a.bytes
  return acc
}, {})

const manifest = {
  $comment:
    '本文件由 scripts/manifest-assets.mjs 生成，请勿手工编辑。资源管理约定见 herness/02-技术设计/前端/资源文件管理-技术方案.md。',
  generator: 'scripts/manifest-assets.mjs',
  summary: {
    fileCount: assets.length,
    totalBytes,
    totalMB: Number((totalBytes / 1024 / 1024).toFixed(2)),
    byKind,
  },
  assets,
}

console.log('[asset-manifest] 资源清单')
console.log(`  文件数：${assets.length}    总体积：${(totalBytes / 1024 / 1024).toFixed(2)}MB`)
for (const [kind, stat] of Object.entries(byKind)) {
  console.log(
    `  - ${kind.padEnd(14)} ${String(stat.count).padStart(3)} 个  ${(stat.bytes / 1024).toFixed(1).padStart(11)}KB`,
  )
}

if (warnings.length) {
  console.log(`\n[asset-manifest] 警告 ${warnings.length} 条（不阻断，删除属人工决策）：`)
  for (const w of warnings) console.log(`  ! ${w}`)
}

if (errors.length) {
  console.error(`\n[asset-manifest] 错误 ${errors.length} 条：`)
  for (const e of errors) console.error(`  x ${e}`)
  if (strict) {
    console.error('\n[asset-manifest] 严格模式：存在错误，exit 1')
    process.exit(1)
  }
}

if (!checkOnly) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`\n[asset-manifest] 已写入 ${relative(root, manifestPath)}`)
} else {
  console.log('\n[asset-manifest] --check 模式，未写入文件')
}
