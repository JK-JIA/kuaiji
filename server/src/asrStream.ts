import { randomUUID } from 'crypto'
import type { Server } from 'http'
import WebSocket, { type RawData, WebSocketServer } from 'ws'
import {
  buildAudioOnlyRequest,
  buildFullClientRequest,
  defaultAsrInitPayload,
  nextAudioSequence,
  parseVolcServerBinaryMessage,
  resetAudioSequence,
} from './volcAsrProtocol.js'

const VOLC_DEFAULT_URL =
  'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel'

const PCM_CHUNK_BYTES = 6400 // 200ms @ 16kHz mono s16le
const AUTH_TIMEOUT_MS = 15000

type VerifyToken = (token: string) => string | null

function volcHeaders(): Record<string, string> {
  const resourceId =
    process.env.VOLC_ASR_RESOURCE_ID?.trim() || 'volc.seedasr.sauc.duration'
  const requestId = randomUUID()
  const connectId = randomUUID()
  const seq = process.env.VOLC_ASR_SEQUENCE?.trim() || '-1'

  const apiKeyOnly = process.env.VOLC_ASR_API_KEY?.trim()
  if (apiKeyOnly) {
    return {
      'X-Api-Key': apiKeyOnly,
      'X-Api-Resource-Id': resourceId,
      'X-Api-Request-Id': requestId,
      'X-Api-Sequence': seq,
      'X-Api-Connect-Id': connectId,
    }
  }

  const appKey = process.env.VOLC_ASR_APP_KEY?.trim()
  const accessKey = process.env.VOLC_ASR_ACCESS_KEY?.trim()
  if (!appKey || !accessKey) {
    throw new Error('missing_asr_credentials')
  }
  return {
    'X-Api-App-Key': appKey,
    'X-Api-Access-Key': accessKey,
    'X-Api-Resource-Id': resourceId,
    'X-Api-Request-Id': requestId,
    'X-Api-Sequence': seq,
    'X-Api-Connect-Id': connectId,
  }
}

function isAsrConfigured(): boolean {
  try {
    volcHeaders()
    return true
  } catch {
    return false
  }
}

/** HTTP 诊断接口用：火山 ASR 环境变量是否就绪（不含密钥） */
export function volcAsrEnvReady(): boolean {
  return isAsrConfigured()
}

export function attachAsrWebSocket(
  server: Server,
  options: { verifyToken: VerifyToken },
): void {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false })

  server.on('upgrade', (req, socket, head) => {
    const host = req.headers.host ?? '127.0.0.1'
    const rawUrl = req.url ?? ''
    let pathname: string
    try {
      const url = new URL(rawUrl, `http://${host}`)
      pathname = url.pathname
    } catch {
      console.warn('[ledger-api][asr-upgrade] bad url', rawUrl.slice(0, 200))
      socket.destroy()
      return
    }

    const up = (req.headers.upgrade ?? '').toLowerCase()
    if (pathname === '/api/asr/stream') {
      console.info(
        '[ledger-api][asr-upgrade]',
        JSON.stringify({
          pathname,
          upgrade: up,
          host,
          'x-forwarded-for': req.headers['x-forwarded-for'] ?? null,
          'x-forwarded-proto': req.headers['x-forwarded-proto'] ?? null,
          'sec-websocket-key': req.headers['sec-websocket-key']
            ? '(present)'
            : '(missing)',
          'user-agent': (req.headers['user-agent'] ?? '').slice(0, 120),
        }),
      )
    }

    if (pathname !== '/api/asr/stream') {
      socket.destroy()
      return
    }

    if (up && up !== 'websocket') {
      console.warn(
        '[ledger-api][asr-upgrade] reject: Upgrade header unexpected:',
        up,
      )
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    if (!isAsrConfigured()) {
      socket.write(
        'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n',
      )
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (clientWs: WebSocket) => {
      void runAsrSession(clientWs, options.verifyToken)
    })
  })
}

function runAsrSession(
  clientWs: WebSocket,
  verifyToken: VerifyToken,
): void {
  const volcUrl = process.env.VOLC_ASR_WS_URL?.trim() || VOLC_DEFAULT_URL
  let volcWs: WebSocket | null = null
  let pcmBuf = Buffer.alloc(0)
  let earlyClientPcm = Buffer.alloc(0)
  let pendingStop = false
  let closed = false
  let authenticated = false
  let readySent = false

  const safeSendClient = (obj: unknown) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(obj))
    }
  }

  const authTimer = setTimeout(() => {
    if (!authenticated && !closed) {
      safeSendClient({ type: 'error', message: '连接超时，请重新点录音' })
      clientWs.close()
    }
  }, AUTH_TIMEOUT_MS)

  const flushPcm = (forceLast: boolean) => {
    if (!volcWs || volcWs.readyState !== WebSocket.OPEN) return
    while (pcmBuf.length >= PCM_CHUNK_BYTES) {
      const chunk = pcmBuf.subarray(0, PCM_CHUNK_BYTES)
      pcmBuf = pcmBuf.subarray(PCM_CHUNK_BYTES)
      const seq = nextAudioSequence()
      volcWs.send(
        buildAudioOnlyRequest(chunk, { isLast: false, sequence: seq }),
      )
    }
    if (forceLast) {
      const rest = pcmBuf.length ? pcmBuf : Buffer.alloc(0)
      pcmBuf = Buffer.alloc(0)
      volcWs.send(
        buildAudioOnlyRequest(rest, {
          isLast: true,
          sequence: nextAudioSequence(),
        }),
      )
    }
  }

  const startVolcUpstream = () => {
    let headers: Record<string, string>
    try {
      headers = volcHeaders()
    } catch {
      safeSendClient({ type: 'error', message: '语音识别未配置' })
      clientWs.close()
      return
    }

    try {
      volcWs = new WebSocket(volcUrl, { headers })
    } catch {
      safeSendClient({ type: 'error', message: '语音识别配置错误' })
      clientWs.close()
      return
    }

    volcWs.on('open', () => {
      resetAudioSequence()
      if (earlyClientPcm.length) {
        pcmBuf = Buffer.concat([pcmBuf, earlyClientPcm])
        earlyClientPcm = Buffer.alloc(0)
      }
      try {
        volcWs!.send(buildFullClientRequest(defaultAsrInitPayload()))
        flushPcm(false)
        if (pendingStop) {
          flushPcm(true)
          pendingStop = false
        }
        if (!readySent && clientWs.readyState === WebSocket.OPEN) {
          readySent = true
          safeSendClient({ type: 'ready' })
        }
      } catch (e) {
        safeSendClient({
          type: 'error',
          message: e instanceof Error ? e.message : '初始化识别失败',
        })
        clientWs.close()
      }
    })

    volcWs.on('message', (data: RawData) => {
      const buf = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data as ArrayBuffer)
      const parsed = parseVolcServerBinaryMessage(buf)
      if (!parsed) return
      if (parsed.kind === 'error') {
        safeSendClient({
          type: 'error',
          message: parsed.message,
          code: parsed.code,
        })
        return
      }
      if (parsed.text || parsed.definite !== undefined) {
        safeSendClient({
          type: 'result',
          text: parsed.text,
          definite: parsed.definite,
        })
      }
    })

    volcWs.on('error', (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : '上游语音识别连接失败'
      safeSendClient({ type: 'error', message: msg })
    })

    volcWs.on('close', () => {
      if (!closed) safeSendClient({ type: 'closed' })
      closed = true
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close()
    })
  }

  clientWs.on('message', (data: RawData, isBinary: boolean) => {
    if (closed) return

    if (!authenticated) {
      if (isBinary) return
      const text =
        typeof data === 'string'
          ? data
          : Buffer.isBuffer(data)
            ? data.toString('utf8')
            : ''
      try {
        const msg = JSON.parse(text) as { type?: string; token?: string }
        if (msg.type === 'auth' && typeof msg.token === 'string') {
          if (!verifyToken(msg.token.trim())) {
            safeSendClient({ type: 'error', message: '未登录或登录已过期' })
            clientWs.close()
            return
          }
          clearTimeout(authTimer)
          authenticated = true
          startVolcUpstream()
          return
        }
      } catch {
        /* fallthrough */
      }
      safeSendClient({ type: 'error', message: '请先登录应用' })
      clientWs.close()
      return
    }

    if (!isBinary) {
      const text =
        typeof data === 'string'
          ? data
          : Buffer.isBuffer(data)
            ? data.toString('utf8')
            : ''
      try {
        const msg = JSON.parse(text) as { type?: string }
        if (msg.type === 'stop') {
          pendingStop = true
          if (volcWs?.readyState === WebSocket.OPEN) {
            flushPcm(true)
            pendingStop = false
          }
        }
      } catch {
        /* ignore */
      }
      return
    }

    const chunk = Buffer.isBuffer(data)
      ? data
      : Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.from(data as ArrayBuffer)
    if (!volcWs || volcWs.readyState !== WebSocket.OPEN) {
      earlyClientPcm = Buffer.concat([earlyClientPcm, chunk])
      return
    }
    pcmBuf = Buffer.concat([pcmBuf, chunk])
    flushPcm(false)
  })

  clientWs.on('close', () => {
    closed = true
    clearTimeout(authTimer)
    volcWs?.close()
  })

  clientWs.on('error', () => {
    closed = true
    clearTimeout(authTimer)
    volcWs?.close()
  })
}
