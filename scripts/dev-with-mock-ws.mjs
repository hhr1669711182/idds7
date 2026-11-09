import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// pnpm dev:local:test —— 同起 mock-ws（:18080，含一键测试台 /test-ui/）与前端 dev 服务（:8888，mode=dev.local）。
// 输出按进程加前缀区分；任一进程退出即联动终止另一个；Ctrl+C 双杀。

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const MOCK_WS_COMMAND = 'node'
const MOCK_WS_ARGS = [path.join(ROOT_DIR, 'server', 'mock-ws.js')]
// Windows 下 pnpm 是 pnpm.cmd，需要 shell:true 解析
const VITE_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const VITE_ARGS = ['exec', 'vite', '--mode', 'dev.local']

/** 起子进程并按行转发输出（带 [tag] 前缀） */
function spawnProc(tag, command, args) {
  const child = spawn(command, args, {
    cwd: ROOT_DIR,
    env: process.env,
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

const mockWs = spawnProc('mock-ws', MOCK_WS_COMMAND, MOCK_WS_ARGS)
const vite = spawnProc('vite', VITE_COMMAND, VITE_ARGS)

console.log('[dev:local:test] mock-ws   起服务 → http://127.0.0.1:18080 （测试台 /test-ui/，API /api/test/*）')
console.log('[dev:local:test] vite dev  起服务 → http://localhost:8888 （mode=dev.local，前端登录即无缝接入本地测试链路）')

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
    console.log(`[dev:local:test] ${tag} 退出（${code ?? signal}），终止另一进程`)
    cleanup(code ?? (signal ? 1 : 0))
  })
}

process.on('SIGINT', () => cleanup(0))
process.on('SIGTERM', () => cleanup(0))
