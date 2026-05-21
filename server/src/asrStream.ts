import type { IncomingMessage, Server } from 'http'
import WebSocket, { type RawData, WebSocketServer } from 'ws'
import { runVolcUpstreamSession, volcAsrEnvReady } from './volcAsrUpstream.js'
import {
  runXfyunUpstreamSession,
  xfyunAsrEnvReady,
} from './xfyunAsrUpstream.js'

type VerifyToken = (token: string) => string | null

export type AsrProvider = 'volc' | 'xfyun'

const AUTH_TIMEOUT_MS = 15000
const MAX_CLIENT_HOTWORD_STRINGS = 120

export type ClientFacingSendJson = (obj: {
  type: 'ready' | 'result' | 'error' | 'closed'
  text?: string
  message?: string
  code?: number | string
  definite?: boolean
}) => void

/**
 * 上游 provider 与客户端 PCM/控制帧之间的抽象。
 * 不同 ASR（豆包火山 / 讯飞方言）只实现这个接口；客户端帧格式与 hook 完全统一。
 */
export interface AsrUpstreamSession {
  /** 客户端 16kHz s16le PCM 二进制帧 */
  pushPcm: (chunk: Buffer) => void
  /** 客户端松手 → 上游收尾 */
  finish: () => void
  /** 客户端断开/异常 → 释放上游 */
  close: () => void
}

export type AsrUpstreamFactory = (params: {
  send: ClientFacingSendJson
  hotwords: string[]
}) => Promise<AsrUpstreamSession>

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

function logUpgrade(req: IncomingMessage, pathname: string): void {
  const host = req.headers.host ?? '127.0.0.1'
  const up = (req.headers.upgrade ?? '').toLowerCase()
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

export function attachAsrWebSocket(
  server: Server,
  options: { verifyToken: VerifyToken },
): void {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false })

  type Route = {
    pathname: string
    isReady: () => boolean
    factory: (
      send: ClientFacingSendJson,
      hotwords: string[],
    ) => Promise<AsrUpstreamSession>
  }

  const routes: Route[] = [
    {
      pathname: '/api/asr/stream',
      isReady: volcAsrEnvReady,
      factory: (send, hotwords) => runVolcUpstreamSession({ send, hotwords }),
    },
    {
      pathname: '/api/asr/xfyun/stream',
      isReady: xfyunAsrEnvReady,
      factory: (send, hotwords) => runXfyunUpstreamSession({ send, hotwords }),
    },
  ]

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

    const route = routes.find((r) => r.pathname === pathname)
    if (!route) {
      socket.destroy()
      return
    }

    logUpgrade(req, pathname)

    const up = (req.headers.upgrade ?? '').toLowerCase()
    if (up && up !== 'websocket') {
      console.warn(
        '[ledger-api][asr-upgrade] reject: Upgrade header unexpected:',
        up,
      )
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    if (!route.isReady()) {
      socket.write(
        'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n',
      )
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (clientWs: WebSocket) => {
      void runClientFacingSession(clientWs, options.verifyToken, route.factory)
    })
  })
}

async function runClientFacingSession(
  clientWs: WebSocket,
  verifyToken: VerifyToken,
  factory: (
    send: ClientFacingSendJson,
    hotwords: string[],
  ) => Promise<AsrUpstreamSession>,
): Promise<void> {
  let upstream: AsrUpstreamSession | null = null
  let earlyClientPcm: Buffer[] = []
  let pendingStop = false
  let closed = false
  let authenticated = false

  const send: ClientFacingSendJson = (obj) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(obj))
    }
  }

  const authTimer = setTimeout(() => {
    if (!authenticated && !closed) {
      send({ type: 'error', message: '连接超时，请重新点录音' })
      try {
        clientWs.close()
      } catch {
        /* ignore */
      }
    }
  }, AUTH_TIMEOUT_MS)

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
            send({ type: 'error', message: '未登录或登录已过期' })
            clientWs.close()
            return
          }
          clearTimeout(authTimer)
          authenticated = true
          const hotwords = parseClientHotwords(msg)
          factory(send, hotwords).then(
            (session) => {
              upstream = session
              if (earlyClientPcm.length) {
                for (const buf of earlyClientPcm) session.pushPcm(buf)
                earlyClientPcm = []
              }
              if (pendingStop) {
                session.finish()
                pendingStop = false
              }
            },
            (e: unknown) => {
              const msgErr = e instanceof Error ? e.message : '上游连接失败'
              send({ type: 'error', message: msgErr })
              try {
                clientWs.close()
              } catch {
                /* ignore */
              }
            },
          )
          return
        }
      } catch {
        /* fallthrough */
      }
      send({ type: 'error', message: '请先登录应用' })
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
          if (upstream) upstream.finish()
          else pendingStop = true
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
    if (!upstream) {
      earlyClientPcm.push(chunk)
      return
    }
    upstream.pushPcm(chunk)
  })

  clientWs.on('close', () => {
    closed = true
    clearTimeout(authTimer)
    upstream?.close()
  })

  clientWs.on('error', () => {
    closed = true
    clearTimeout(authTimer)
    upstream?.close()
  })
}

/** HTTP 诊断接口用：当前各 ASR provider 是否就绪 */
export { volcAsrEnvReady, xfyunAsrEnvReady }
