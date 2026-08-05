import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_ENTRY = path.join(ROOT_DIR, 'server', 'index.js')
const SERVER_ENV_FILE = path.join(ROOT_DIR, 'server', '.env')
const DEFAULT_PORT = 8787
const STOP_ONLY = process.argv.includes('--stop')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const parseEnvValue = (value) => {
  const trimmedValue = value.trim()
  const quote = trimmedValue[0]
  if ((quote === '"' || quote === "'") && trimmedValue.endsWith(quote)) {
    return trimmedValue.slice(1, -1)
  }
  return trimmedValue
}

const readServerEnv = () => {
  if (!fs.existsSync(SERVER_ENV_FILE)) return {}

  return fs.readFileSync(SERVER_ENV_FILE, 'utf8')
    .split(/\r?\n/)
    .reduce((env, line) => {
      const trimmedLine = line.trim()
      if (!trimmedLine || trimmedLine.startsWith('#')) return env

      const separatorIndex = trimmedLine.indexOf('=')
      if (separatorIndex === -1) return env

      const key = trimmedLine.slice(0, separatorIndex).trim()
      if (key) {
        env[key] = parseEnvValue(trimmedLine.slice(separatorIndex + 1))
      }

      return env
    }, {})
}

const getServerPort = () => {
  const serverEnv = readServerEnv()
  const port = Number(process.env.MOCK_WS_PORT || serverEnv.MOCK_WS_PORT || DEFAULT_PORT)
  return Number.isFinite(port) ? port : DEFAULT_PORT
}

const runCommand = (command, args) => {
  try {
    return execFileSync(command, args, { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

const runPowerShell = (command) => runCommand('powershell.exe', [
  '-NoProfile',
  '-ExecutionPolicy',
  'Bypass',
  '-Command',
  command,
])

const getListeningPidsOnWindows = (port) => {
  const output = runPowerShell(
    `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`,
  )

  return output.split(/\r?\n/).map(Number).filter(Boolean)
}

const getListeningPidsOnPosix = (port) => {
  const output = runCommand('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])
  return output.split(/\r?\n/).map(Number).filter(Boolean)
}

const getListeningPids = (port) => {
  const pids = process.platform === 'win32'
    ? getListeningPidsOnWindows(port)
    : getListeningPidsOnPosix(port)

  return [...new Set(pids)].filter((pid) => pid !== process.pid)
}

const getCommandLineOnWindows = (pid) => runPowerShell(
  `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`,
)

const getCommandLineOnPosix = (pid) => runCommand('ps', ['-p', String(pid), '-o', 'command='])

const getCommandLine = (pid) => process.platform === 'win32'
  ? getCommandLineOnWindows(pid)
  : getCommandLineOnPosix(pid)

const isMockServerProcess = (commandLine) => {
  const normalizedCommand = commandLine.replaceAll('\\', '/')
  return normalizedCommand.includes('server/index.js')
}

const stopProcess = (pid) => {
  try {
    process.kill(pid, 'SIGTERM')
    return true
  } catch {
    return false
  }
}

const forceStopProcess = (pid) => {
  if (process.platform === 'win32') {
    runCommand('taskkill.exe', ['/PID', String(pid), '/T', '/F'])
    return
  }

  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // The process may have exited between checks.
  }
}

const waitForPortRelease = async (port, pids) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const remainingPids = getListeningPids(port).filter((pid) => pids.includes(pid))
    if (remainingPids.length === 0) return true
    await sleep(150)
  }

  return false
}

const stopOldMockServer = async (port) => {
  const pids = getListeningPids(port)
  if (pids.length === 0) return true

  const mockPids = []
  const otherPids = []

  pids.forEach((pid) => {
    const commandLine = getCommandLine(pid)
    if (isMockServerProcess(commandLine)) {
      mockPids.push(pid)
    } else {
      otherPids.push({ pid, commandLine })
    }
  })

  if (otherPids.length > 0) {
    console.error(`[mock:server] Port ${port} is occupied by a non-mock-server process.`)
    otherPids.forEach(({ pid, commandLine }) => {
      console.error(`[mock:server] PID ${pid}: ${commandLine || '(command line unavailable)'}`)
    })
    return false
  }

  if (mockPids.length === 0) return true

  mockPids.forEach((pid) => {
    console.log(`[mock:server] Stopping old mock server PID ${pid}...`)
    stopProcess(pid)
  })

  const released = await waitForPortRelease(port, mockPids)
  if (released) return true

  mockPids.forEach((pid) => {
    console.log(`[mock:server] Force stopping old mock server PID ${pid}...`)
    forceStopProcess(pid)
  })

  return waitForPortRelease(port, mockPids)
}

const startMockServer = () => {
  console.log('[mock:server] Starting mock server...')
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: 'inherit',
  })

  const stopChild = (signal) => {
    if (!child.killed) {
      child.kill(signal)
    }
  }

  process.once('SIGINT', () => stopChild('SIGINT'))
  process.once('SIGTERM', () => stopChild('SIGTERM'))

  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0))
  })
}

const main = async () => {
  const port = getServerPort()
  const stopped = await stopOldMockServer(port)

  if (!stopped) {
    process.exit(1)
  }

  if (STOP_ONLY) {
    console.log(`[mock:server] Port ${port} is ready.`)
    return
  }

  startMockServer()
}

main()
