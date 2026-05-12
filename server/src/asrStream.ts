import { randomUUID } from 'crypto'
import type { IncomingMessage, Server } from 'http'
import WebSocket, { type RawData, WebSocketServer } from 'ws'
import {
  buildAsrInitPayload,
  buildAudioOnlyRequest,
  buildFullClientRequest,
  nextAudioSequence,
  parseVolcServerBinaryMessage,
  resetAudioSequence,
} from './volcAsrProtocol.js'

const VOLC_DEFAULT_URL =
  'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel'

const PCM_CHUNK_BYTES = 6400 // 200ms @ 16kHz mono s16le
const AUTH_TIMEOUT_MS = 15000

type VerifyToken = (token: string) => string | null

function headerOne(res: IncomingMessage, name: string): string {
  const v = res.headers[name.toLowerCase()]
  if (!v) return ''
  return Array.isArray(v) ? v[0] : v
}

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

const MAX_CLIENT_HOTWORD_STRINGS = 120

function parseClientHotwords(msg: unknown): string[] {
  if (!msg || typeof msg !== 'object') return []
  const hw = (msg as { hotwords?: unknown }).hotwords
  if (!Array.isArray(hw)) return []
  const out: string[] = []
  for (const x of hw) {
    if (typeof x !== 'string') continue
    const t = x.trim()
    if (t) out.push(t)
    if (out.length >= MAX_CLIENT_HOTWORD_STRINGS) break
  }
  return out
}

function runAsrSession(clientWs: WebSocket, verifyToken: VerifyToken): void {
  const volcUrl = process.env.VOLC_ASR_WS_URL?.trim() || VOLC_DEFAULT_URL
  let volcWs: WebSocket | null = null
  let pcmBuf = Buffer.alloc(0)
  let earlyClientPcm = Buffer.alloc(0)
  let pendingStop = false
  let closed = false
  let authenticated = false
  let readySent = false
  let clientHotwords: string[] = []

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

    let volcFailReported = false
    const reportVolcFailure = (message: string) => {
      if (volcFailReported) return
      volcFailReported = true
      safeSendClient({ type: 'error', message })
      try {
        volcWs?.terminate()
      } catch {
        /* ignore */
      }
    }

    try {
      volcWs = new WebSocket(volcUrl, { headers })
    } catch {
      safeSendClient({ type: 'error', message: '语音识别配置错误' })
      clientWs.close()
      return
    }

    volcWs.on('unexpected-response', (_req, res: IncomingMessage) => {
      const code = res.statusCode ?? 0
      const logid = headerOne(res, 'x-tt-logid')
      console.warn(
        '[ledger-api][volc-ws] unexpected-response',
        JSON.stringify({ httpStatus: code, logid: logid || null }),
      )
      res.resume()
      const resourceId =
        process.env.VOLC_ASR_RESOURCE_ID?.trim() ||
        'volc.seedasr.sauc.duration'
      const usingApiKey = Boolean(process.env.VOLC_ASR_API_KEY?.trim())
      const authHint = usingApiKey
        ? '已使用 VOLC_ASR_API_KEY，请核对密钥权限、是否对应「流式语音识别」及 ResourceId 与控制台一致。'
        : '当前为 X-Api-App-Key + X-Api-Access-Key。若控制台已切到新版，请在豆包语音「API Key 管理」创建密钥，仅设置 VOLC_ASR_API_KEY（并留空 APP/ACCESS）。Access Token 过期也会 400。'
      const msg =
        code === 400
          ? `火山语音识别拒绝了连接（HTTP 400，与公网 HTTP/无 Nginx 无关）。logid=${logid || '无'}` +
            ` ResourceId=${resourceId}。${authHint} 文档：https://www.volcengine.com/docs/6561/1354869`
          : `火山语音识别握手异常 HTTP ${code}。logid=${logid || '无'}。${authHint}`
      reportVolcFailure(msg)
    })

    volcWs.on('open', () => {
      resetAudioSequence()
      if (earlyClientPcm.length) {
        pcmBuf = Buffer.concat([pcmBuf, earlyClientPcm])
        earlyClientPcm = Buffer.alloc(0)
      }
      try {
        volcWs!.send(
          buildFullClientRequest(buildAsrInitPayload(clientHotwords)),
        )
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
      if (volcFailReported) return
      const raw = err instanceof Error ? err.message : String(err)
      console.warn('[ledger-api][volc-ws] error event:', raw)
      if (raw.includes('Unexpected server response: 400')) {
        reportVolcFailure(
          '火山 WebSocket 返回 400（鉴权或资源不匹配，与 Nginx/HTTP 无关）。' +
            '请拉取最新 API 镜像后看 docker logs 中的 [volc-ws]；新版控制台改用 VOLC_ASR_API_KEY；' +
            '或核对 APP_ID、Access Token、VOLC_ASR_RESOURCE_ID。文档：https://www.volcengine.com/docs/6561/1354869',
        )
        return
      }
      reportVolcFailure(raw || '上游语音识别连接失败')
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
          clientHotwords = parseClientHotwords(msg)
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
