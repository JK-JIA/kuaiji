import { randomUUID } from 'crypto'
import type { IncomingMessage } from 'http'
import WebSocket, { type RawData } from 'ws'
import { formatAsrUserFacingError } from './asrUserFacingError.js'
import {
  buildAsrInitPayload,
  buildAudioOnlyRequest,
  buildFullClientRequest,
  nextAudioSequence,
  parseVolcServerBinaryMessage,
  resetAudioSequence,
} from './volcAsrProtocol.js'
import type { AsrUpstreamSession, ClientFacingSendJson } from './asrStream.js'

const VOLC_DEFAULT_URL =
  'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel'

const PCM_CHUNK_BYTES = 6400 // 200ms @ 16kHz mono s16le

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

export function volcAsrEnvReady(): boolean {
  try {
    volcHeaders()
    return true
  } catch {
    return false
  }
}

export function runVolcUpstreamSession(params: {
  send: ClientFacingSendJson
  hotwords: string[]
}): Promise<AsrUpstreamSession> {
  const { send, hotwords } = params

  return new Promise((resolve, reject) => {
    let headers: Record<string, string>
    try {
      headers = volcHeaders()
    } catch {
      reject(new Error('语音识别未配置'))
      return
    }

    const volcUrl = process.env.VOLC_ASR_WS_URL?.trim() || VOLC_DEFAULT_URL
    let volcWs: WebSocket
    try {
      volcWs = new WebSocket(volcUrl, { headers })
    } catch {
      reject(new Error('语音识别配置错误'))
      return
    }

    let pcmBuf = Buffer.alloc(0)
    let pendingStop = false
    let opened = false
    let closed = false
    let readySent = false
    let resolved = false
    let volcFailReported = false

    const reportVolcFailure = (message: string) => {
      if (volcFailReported) return
      volcFailReported = true
      send({ type: 'error', message: formatAsrUserFacingError(message) })
      try {
        volcWs.terminate()
      } catch {
        /* ignore */
      }
      if (!resolved) {
        resolved = true
        reject(new Error(message))
      }
    }

    const flushPcm = (forceLast: boolean) => {
      if (volcWs.readyState !== WebSocket.OPEN) return
      while (pcmBuf.length >= PCM_CHUNK_BYTES) {
        const chunk = pcmBuf.subarray(0, PCM_CHUNK_BYTES)
        pcmBuf = pcmBuf.subarray(PCM_CHUNK_BYTES)
        volcWs.send(
          buildAudioOnlyRequest(chunk, {
            isLast: false,
            sequence: nextAudioSequence(),
          }),
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
          ? `火山语音识别拒绝了连接（HTTP 400）。logid=${logid || '无'}` +
            ` ResourceId=${resourceId}。${authHint} 文档：https://www.volcengine.com/docs/6561/1354869`
          : `火山语音识别握手异常 HTTP ${code}。logid=${logid || '无'}。${authHint}`
      reportVolcFailure(msg)
    })

    volcWs.on('open', () => {
      opened = true
      resetAudioSequence()
      try {
        volcWs.send(buildFullClientRequest(buildAsrInitPayload(hotwords)))
        flushPcm(false)
        if (pendingStop) {
          flushPcm(true)
          pendingStop = false
        }
        if (!readySent) {
          readySent = true
          send({ type: 'ready' })
        }
        if (!resolved) {
          resolved = true
          resolve({
            pushPcm: (chunk: Buffer) => {
              if (closed) return
              pcmBuf = Buffer.concat([pcmBuf, chunk])
              flushPcm(false)
            },
            finish: () => {
              if (closed) return
              if (!opened) {
                pendingStop = true
                return
              }
              flushPcm(true)
            },
            close: () => {
              closed = true
              try {
                volcWs.close()
              } catch {
                /* ignore */
              }
            },
          })
        }
      } catch (e) {
        const m = e instanceof Error ? e.message : '初始化识别失败'
        reportVolcFailure(m)
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
        send({
          type: 'error',
          message: formatAsrUserFacingError(parsed.message),
          code: parsed.code,
        })
        return
      }
      if (parsed.text || parsed.definite !== undefined) {
        send({
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
          '火山 WebSocket 返回 400（鉴权或资源不匹配）。' +
            '请拉取最新 API 镜像后看 docker logs 中的 [volc-ws]；新版控制台改用 VOLC_ASR_API_KEY；' +
            '或核对 APP_ID、Access Token、VOLC_ASR_RESOURCE_ID。',
        )
        return
      }
      reportVolcFailure(raw || '上游语音识别连接失败')
    })

    volcWs.on('close', () => {
      if (!closed) send({ type: 'closed' })
      closed = true
    })
  })
}
