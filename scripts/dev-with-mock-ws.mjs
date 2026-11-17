import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// pnpm dev:local:test —— 同起 mock-ws（:18080，含一键测试台 /test-ui/）与前端 dev 服务（:8888）。
// 输出按进程加前缀区分；任一进程退出即联动终止另一个；Ctrl+C 双杀。
//
// 可选模式参数（位置 argv 或 --mode 标志）：
//   dev.local（默认）  → MOCK_DATA_CENTER=shenzhen（深圳）
//   development        → MOCK_DATA_CENTER=shenzhen（深圳）
//   test               → MOCK_DATA_CENTER=beijing（北京）
//   production         → MOCK_DATA_CENTER=guizhou（贵州/贵阳）
//
// 用法：
//   node scripts/dev-with-mock-ws.mjs            # dev.local + 深圳
//   node scripts/dev-with-mock-ws.mjs test       # test + 北京
//   node scripts/dev-with-mock-ws.mjs production # production + 贵阳
//   node scripts/dev-with-mock-ws.mjs --mode test

/**
 * 解析模式参数
 * @returns {string} vite mode
 */
function resolveMode() {
  // 位置参数（跳过 --mode 标志本身）
  const args = process.argv.slice(2)
  const idx = args.indexOf('--mode')
  if (idx !== -1 && args[idx + 1]) return args[idx + 1]
  // 取第一个非 --mode 的位置参数
  const positional = args.filter((a, i) => a !== '--mode' && !(args[i - 1] === '--mode'))
  if (positional.length) return positional[0]
  return 'dev.local'
}

/**
 * 按 mode 推导 MOCK_DATA_CENTER
 * @param {string} mode
 * @returns {string}
 */
function dataCenterForMode(mode) {
  switch (mode) {
    case 'test':
      return 'beijing'
    case 'production':
    case 'prod':
      return 'guizhou'
    case 'dev.local':
    case 'development':
    default:
      return 'shenzhen'
  }
}

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const mode = resolveMode()
const mockDataCenter = dataCenterForMode(mode)

const MOCK_WS_COMMAND = 'node'
const MOCK_WS_ARGS = [path.join(ROOT_DIR, 'server', 'mock-ws.js')]
// Windows 下 pnpm 是 pnpm.cmd，需要 shell:true 解析
const VITE_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const VITE_ARGS = ['exec', 'vite', '--mode', mode]

/** 起子进程并按行转发输出（带 [tag] 前缀） */
function spawnProc(tag, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: ROOT_DIR,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
  const relay = stream => {
    let buffer = ''
    stream.on('data', chunk => {
      buffer += String(chunk)
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        console.log(`[${tag}] ${line}`)
      }
    })
  }
  relay(child.stdout)
  relay(child.stderr)
  return child
}

console.log(`[dev] vite mode=${mode} · MOCK_DATA_CENTER=${mockDataCenter}`)

const mockWs = spawnProc('mock-ws', MOCK_WS_COMMAND, MOCK_WS_ARGS, { MOCK_DATA_CENTER: mockDataCenter })
const vite = spawnProc('vite', VITE_COMMAND, VITE_ARGS)

console.log(`[dev] mock-ws   → http://127.0.0.1:18080 （测试台 /test-ui/，API /api/test/*）`)
console.log(`[dev] vite dev  → http://localhost:8888 （mode=${mode}，前端登录即无缝接入本地测试链路）`)

let exiting = false
const cleanup = code => {
  if (exiting) return
  exiting = true
  for (const child of [mockWs, vite]) {
    try {
      child.kill('SIGTERM')
    } catch {
      // 进程可能已退出
    }
  }
  process.exit(code)
}

for (const [child, tag] of [
  [mockWs, 'mock-ws'],
  [vite, 'vite'],
]) {
  child.on('exit', (code, signal) => {
    console.log(`[dev] ${tag} 退出（${code ?? signal}），终止另一进程`)
    cleanup(code ?? (signal ? 1 : 0))
  })
}

process.on('SIGINT', () => cleanup(0))
process.on('SIGTERM', () => cleanup(0))
