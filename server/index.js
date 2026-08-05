import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRoutePlanRequestPayload, routePlanApi } from './api/routePlan.js'
import { routesApi } from './api/routes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_ENV_FILE = path.join(__dirname, '.env')

const getLocalIPv4 = () => {
  const interfaces = os.networkInterfaces()
  for (const list of Object.values(interfaces)) {
    const item = list?.find((i) => i.family === 'IPv4' && !i.internal)
    if (item?.address) return item.address
  }
  return '127.0.0.1'
}

const parseEnvValue = (value) => {
  const trimmedValue = value.trim()
  const quote = trimmedValue[0]
  if ((quote === '"' || quote === "'") && trimmedValue.endsWith(quote)) {
    return trimmedValue.slice(1, -1)
  }
  return trimmedValue
}

const loadServerEnv = (filePath) => {
  if (!fs.existsSync(filePath)) return

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  lines.forEach((line) => {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith('#')) return

    const separatorIndex = trimmedLine.indexOf('=')
    if (separatorIndex === -1) return

    const key = trimmedLine.slice(0, separatorIndex).trim()
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) return

    process.env[key] = parseEnvValue(trimmedLine.slice(separatorIndex + 1))
  })
}

loadServerEnv(SERVER_ENV_FILE)

const HOST = process.env.MOCK_WS_HOST || '0.0.0.0'
const PORT = Number(process.env.MOCK_WS_PORT || 8787)
const PUSH_INTERVAL_MS = Number(process.env.MOCK_WS_PUSH_INTERVAL_MS || 60000)
const FIRST_PUSH_DELAY_MS = Number(process.env.MOCK_WS_FIRST_PUSH_DELAY_MS || 2000)
const INCOMING_CALL_DELAY_MS = Number(process.env.MOCK_WS_INCOMING_CALL_DELAY_MS || 1200)
const INCOMING_CALL_TICK_MS = Number(process.env.MOCK_WS_INCOMING_CALL_TICK_MS || 8000)

const clients = new Set()
let isShuttingDown = false

const NANSHA_CENTER = { lng: 113.930783, lat: 22.543345 }
const NANSHA_SPREAD = 0.06

const NANSHA_DEVICES = [
  { callId: 'SZNS-001', caller: '南头街道居民', phone: '+86 138 0001 0001' },
  { callId: 'SZNS-002', caller: '蛇口港务调度', phone: '+86 138 0001 0002' },
  { callId: 'SZNS-003', caller: '桃源社区物业', phone: '+86 138 0001 0003' },
  { callId: 'SZNS-004', caller: '西丽片区巡逻', phone: '+86 138 0001 0004' },
  { callId: 'SZNS-005', caller: '科技园企业前台', phone: '+86 138 0001 0005' },
  { callId: 'SZNS-006', caller: '华侨城管理处', phone: '+86 138 0001 0006' },
  { callId: 'SZNS-007', caller: '沙河街道居民', phone: '+86 138 0001 0007' },
  { callId: 'SZNS-008', caller: '粤海街道网格员', phone: '+86 138 0001 0008' },
]

const LOCATION_TYPES = ['cellId', 'gps', 'wifi', 'cellId', 'cellId']
const STATUS_CYCLE = ['online', 'online', 'online', 'offline', 'lost']
const ACCURACY_RADIUS_METER = 500

const deviceState = new Map()
const ensureDeviceState = (device) => {
  if (!deviceState.has(device.callId)) {
    deviceState.set(device.callId, {
      ...device,
      lng: NANSHA_CENTER.lng + (Math.random() - 0.5) * NANSHA_SPREAD,
      lat: NANSHA_CENTER.lat + (Math.random() - 0.5) * NANSHA_SPREAD,
      locationType: LOCATION_TYPES[Math.floor(Math.random() * LOCATION_TYPES.length)],
      accuracyRadius: ACCURACY_RADIUS_METER,
      status: 'online',
      step: 0,
    })
  }
  return deviceState.get(device.callId)
}

const tickDeviceState = (state) => {
  state.lng += (Math.random() - 0.5) * 0.004
  state.lat += (Math.random() - 0.5) * 0.004
  state.lng = Math.max(NANSHA_CENTER.lng - NANSHA_SPREAD, Math.min(NANSHA_CENTER.lng + NANSHA_SPREAD, state.lng))
  state.lat = Math.max(NANSHA_CENTER.lat - NANSHA_SPREAD, Math.min(NANSHA_CENTER.lat + NANSHA_SPREAD, state.lat))
  state.locationType = LOCATION_TYPES[state.step % LOCATION_TYPES.length]
  state.accuracyRadius = ACCURACY_RADIUS_METER
  state.status = STATUS_CYCLE[state.step % STATUS_CYCLE.length]
  state.step += 1
  state.updatedAt = new Date().toISOString()
}

const createIncomingCallPayload = (state) => ({
  eventKey: 'incoming.call',
  data: {
    callId: state.callId,
    caller: state.caller,
    phone: state.phone,
    lng: Number(state.lng.toFixed(6)),
    lat: Number(state.lat.toFixed(6)),
    locationType: state.locationType,
    accuracyRadius: state.accuracyRadius,
    status: state.status,
    updatedAt: state.updatedAt,
  },
  timestamp: new Date().toISOString(),
})

const createLegacyIncomingCallPayload = () => ({
  eventKey: 'incoming.call',
  data: {
    caller: '指挥中心来电',
    phone: '119-440402-0001',
    location: '香洲区前山街道',
    level: '一级警情',
    time: new Date().toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  },
  timestamp: new Date().toISOString(),
})

const sendJson = (res, statusCode, data) => {
  const body = JSON.stringify(data, null, 2)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(body)
}

const sendNotFound = (res) => {
  sendJson(res, 404, {
    ok: false,
    message: 'Not found',
  })
}

const encodeWebSocketFrame = (message) => {
  const payload = Buffer.from(message)
  const payloadLength = payload.length

  if (payloadLength <= 125) {
    return Buffer.concat([Buffer.from([0x81, payloadLength]), payload])
  }

  if (payloadLength <= 65535) {
    const header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 126
    header.writeUInt16BE(payloadLength, 2)
    return Buffer.concat([header, payload])
  }

  const header = Buffer.alloc(10)
  header[0] = 0x81
  header[1] = 127
  header.writeBigUInt64BE(BigInt(payloadLength), 2)
  return Buffer.concat([header, payload])
}

const decodeWebSocketFrame = (buffer) => {
  const firstByte = buffer[0]
  const secondByte = buffer[1]
  const opcode = firstByte & 0x0f
  const isMasked = (secondByte & 0x80) === 0x80
  let payloadLength = secondByte & 0x7f
  let offset = 2

  if (payloadLength === 126) {
    payloadLength = buffer.readUInt16BE(offset)
    offset += 2
  } else if (payloadLength === 127) {
    payloadLength = Number(buffer.readBigUInt64BE(offset))
    offset += 8
  }

  let maskingKey
  if (isMasked) {
    maskingKey = buffer.subarray(offset, offset + 4)
    offset += 4
  }

  const payload = buffer.subarray(offset, offset + payloadLength)
  if (!isMasked || !maskingKey) {
    return { opcode, message: payload.toString('utf8') }
  }

  const unmasked = Buffer.alloc(payload.length)
  payload.forEach((byte, index) => {
    unmasked[index] = byte ^ maskingKey[index % 4]
  })

  return { opcode, message: unmasked.toString('utf8') }
}

const writeFrame = (socket, data) => {
  if (socket.destroyed) return false
  socket.write(encodeWebSocketFrame(JSON.stringify(data)))
  return true
}

// const broadcastRoutePlanRequest = () => {
//   const payload = createRoutePlanRequestPayload()
//   clients.forEach((socket) => {
//     if (!writeFrame(socket, payload)) {
//       clients.delete(socket)
//     }
//   })
//   return payload
// }

const broadcastIncomingCall = (useLegacy = false) => {
  const payload = useLegacy
    ? createLegacyIncomingCallPayload()
    : createIncomingCallPayload(tickDeviceState(ensureDeviceState(
        NANSHA_DEVICES[Math.floor(Math.random() * NANSHA_DEVICES.length)],
      )))
  clients.forEach((socket) => {
    if (!writeFrame(socket, payload)) {
      clients.delete(socket)
    }
  })
  return payload
}

const broadcastAllNanshaCalls = () => {
  const snapshots = []
  NANSHA_DEVICES.forEach((device) => {
    const state = ensureDeviceState(device)
    tickDeviceState(state)
    snapshots.push(createIncomingCallPayload(state))
  })
  clients.forEach((socket) => {
    snapshots.forEach((payload) => {
      if (!writeFrame(socket, payload)) {
        clients.delete(socket)
      }
    })
  })
  return snapshots
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, null)
    return
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  const routeKey = `${req.method} ${url.pathname}`

  // if (routeKey === 'POST /api/broadcast-route-plan') {
  //   const payload = broadcastRoutePlanRequest()
  //   sendJson(res, 200, {
  //     ok: true,
  //     clients: clients.size,
  //     payload,
  //   })
  //   return
  // }

  if (routeKey === 'POST /api/broadcast-incoming-call') {
    const payload = broadcastIncomingCall()
    sendJson(res, 200, {
      ok: true,
      clients: clients.size,
      payload,
    })
    return
  }

  if (routeKey === 'POST /api/broadcast-all-incoming-calls') {
    const payloads = broadcastAllNanshaCalls()
    sendJson(res, 200, {
      ok: true,
      clients: clients.size,
      count: payloads.length,
    })
    return
  }

  const handler = routePlanApi[routeKey] || routesApi[routeKey]
  if (handler) {
    sendJson(res, 200, handler())
    return
  }

  sendNotFound(res)
})

server.on('upgrade', (req, socket) => {
  const upgradeHeader = String(req.headers.upgrade || '').toLowerCase()
  const websocketKey = req.headers['sec-websocket-key']

  if (upgradeHeader !== 'websocket' || !websocketKey) {
    socket.destroy()
    return
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(`${websocketKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64')

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '',
    '',
  ].join('\r\n'))

  clients.add(socket)

  // const firstPushTimer = setTimeout(() => {
  //   if (clients.has(socket)) {
  //     writeFrame(socket, createRoutePlanRequestPayload())
  //   }
  // }, FIRST_PUSH_DELAY_MS)

  const initialCallsTimer = setTimeout(() => {
    if (!clients.has(socket)) return
    NANSHA_DEVICES.forEach((device) => {
      const state = ensureDeviceState(device)
      writeFrame(socket, createIncomingCallPayload(state))
    })
  }, FIRST_PUSH_DELAY_MS + INCOMING_CALL_DELAY_MS)

  const cleanupSocket = () => {
    // clearTimeout(firstPushTimer)
    clearTimeout(initialCallsTimer)
    clients.delete(socket)
  }

  socket.on('data', (buffer) => {
    const { opcode, message } = decodeWebSocketFrame(buffer)

    if (opcode === 0x8) {
      socket.end()
      return
    }

    if (message === 'ping') {
      writeFrame(socket, { eventKey: 'heartbeat', data: 'pong' })
    }
  })

  socket.on('close', cleanupSocket)
  socket.on('error', cleanupSocket)
})

// const pushIntervalTimer = setInterval(() => {
//   if (clients.size > 0) {
//     broadcastRoutePlanRequest()
//   }
// }, PUSH_INTERVAL_MS)

const nanshaCallTimer = setInterval(() => {
  if (clients.size > 0) {
    broadcastAllNanshaCalls()
  }
}, INCOMING_CALL_TICK_MS)

const closeClients = () => {
  clients.forEach((socket) => {
    if (!socket.destroyed) {
      socket.end()
    }
  })
}

const shutdown = (signal) => {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log(`Received ${signal}, shutting down mock server...`)
  // clearInterval(pushIntervalTimer)
  clearInterval(nanshaCallTimer)
  closeClients()

  const forceExitTimer = setTimeout(() => {
    clients.forEach((socket) => {
      if (!socket.destroyed) {
        socket.destroy()
      }
    })
    process.exit(0)
  }, 3000)

  forceExitTimer.unref()
  server.close(() => {
    clearTimeout(forceExitTimer)
    process.exit(0)
  })
}

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Run "npm run mock:server:restart" to clean the old mock server first.`)
    process.exit(1)
  }

  throw error
})

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))

server.listen(PORT, HOST, () => {
  console.log(`Mock WebSocket server listening on ws://${HOST}:${PORT}/`)
  console.log(`HTTP API: http://${HOST}:${PORT}/api/route-plan-request`)
  // console.log(`Broadcast API: POST http://${HOST}:${PORT}/api/broadcast-route-plan`)
  console.log(`Incoming call API: POST http://${HOST}:${PORT}/api/broadcast-incoming-call`)
  console.log(`All incoming calls API: POST http://${HOST}:${PORT}/api/broadcast-all-incoming-calls`)
  // console.log(`Push interval: ${PUSH_INTERVAL_MS}ms`)
  console.log(`First push delay: ${FIRST_PUSH_DELAY_MS}ms`)
  console.log(`Nansha tick interval: ${INCOMING_CALL_TICK_MS}ms (${NANSHA_DEVICES.length} devices)`)
})
