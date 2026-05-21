import WebSocket, { type RawData } from 'ws'
import { formatAsrUserFacingError } from './asrUserFacingError.js'
import type { AsrUpstreamSession, ClientFacingSendJson } from './asrStream.js'
import {
  buildXfyunAuthedUrl,
  buildXfyunContinueFrame,
  buildXfyunFirstFrame,
  createXfyunAccumulator,
  parseXfyunMessage,
  readXfyunCredentialsFromEnv,
} from './xfyunAsrProtocol.js'

/** 讯飞建议：16k PCM 每 40ms 发送 1280 字节 */
const PCM_CHUNK_BYTES = 1280
const SEND_INTERVAL_MS = 40

function buildXfyunDhw(hotwords: string[]): string | undefined {
  const terms = hotwords
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 80)
  if (terms.length === 0) return undefined
  const body = terms.join('|')
  const prefix = 'dhw=utf-8;'
  const max = 1024
  if (prefix.length + body.length <= max) return `${prefix}${body}`
  let cut = body
  while (cut.length > 0 && prefix.length + cut.length > max) {
    const last = cut.lastIndexOf('|')
    cut = last > 0 ? cut.slice(0, last) : cut.slice(0, max - prefix.length)
  }
  return cut.length ? `${prefix}${cut}` : undefined
}

export function xfyunAsrEnvReady(): boolean {
  return readXfyunCredentialsFromEnv() !== null
}

export function runXfyunUpstreamSession(params: {
  send: ClientFacingSendJson
  hotwords: string[]
}): Promise<AsrUpstreamSession> {
  const { send, hotwords } = params
  const dhw = buildXfyunDhw(hotwords)
  const credentials = readXfyunCredentialsFromEnv()
  if (!credentials) {
    return Promise.reject(new Error('讯飞语音识别未配置（XFYUN_ASR_*）'))
  }

  return new Promise((resolve, reject) => {
    let ws: WebSocket
    try {
      const url = buildXfyunAuthedUrl(credentials)
      ws = new WebSocket(url)
    } catch (e) {
      reject(
        new Error(
          e instanceof Error ? e.message : '讯飞语音识别连接初始化失败',
        ),
      )
      return
    }

    let pcmBuf = Buffer.alloc(0)
    let opened = false
    let closed = false
    let readySent = false
    let resolved = false
    let firstAudioSent = false
    let pendingStop = false
    let seq = 0
    let flushTimer: NodeJS.Timeout | null = null
    let xfyunFailReported = false
    const acc = createXfyunAccumulator()

    const reportFailure = (message: string) => {
      if (xfyunFailReported) return
      xfyunFailReported = true
      send({ type: 'error', message: formatAsrUserFacingError(message) })
      try {
        ws.terminate()
      } catch {
        /* ignore */
      }
      if (!resolved) {
        resolved = true
        reject(new Error(message))
      }
    }

    const stopTimer = () => {
      if (flushTimer) {
        clearInterval(flushTimer)
        flushTimer = null
      }
    }

    const sendOneChunk = (status: 0 | 1 | 2, chunk: Buffer) => {
      if (ws.readyState !== WebSocket.OPEN) return
      if (!firstAudioSent) {
        ws.send(
          buildXfyunFirstFrame({
            appId: credentials.appId,
            audioPcm: chunk,
            status,
            sampleRate: 16000,
            accent: 'mulacc',
            extraIatParams: dhw ? { dhw } : undefined,
          }),
        )
        firstAudioSent = true
        return
      }
      seq += 1
      ws.send(
        buildXfyunContinueFrame({
          appId: credentials.appId,
          audioPcm: chunk,
          seq,
          status,
        }),
      )
    }

    const flushOnce = (forceLast: boolean): boolean => {
      if (ws.readyState !== WebSocket.OPEN) return false
      if (pcmBuf.length >= PCM_CHUNK_BYTES) {
        const chunk = pcmBuf.subarray(0, PCM_CHUNK_BYTES)
        pcmBuf = pcmBuf.subarray(PCM_CHUNK_BYTES)
        sendOneChunk(firstAudioSent ? 1 : 0, chunk)
        return true
      }
      if (forceLast) {
        const rest = pcmBuf
        pcmBuf = Buffer.alloc(0)
        sendOneChunk(2, rest.length ? rest : Buffer.alloc(0))
        return true
      }
      return false
    }

    const tickTimer = () => {
      if (closed) {
        stopTimer()
        return
      }
      flushOnce(false)
    }

    ws.on('open', () => {
      opened = true
      flushTimer = setInterval(tickTimer, SEND_INTERVAL_MS)
      // 立刻发出首帧（携带 0 字节音频也可，便于上游初始化）
      if (!firstAudioSent) {
        flushOnce(false)
        if (!firstAudioSent) {
          // 缓冲不足一帧，发一个空首帧让上游就绪
          sendOneChunk(0, Buffer.alloc(0))
        }
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
          },
          finish: () => {
            if (closed) return
            if (!opened) {
              pendingStop = true
              return
            }
            // 把剩余分帧发完，最后一包带 status=2
            while (flushOnce(false)) {
              /* keep flushing */
            }
            flushOnce(true)
          },
          close: () => {
            closed = true
            stopTimer()
            try {
              ws.close()
            } catch {
              /* ignore */
            }
          },
        })
      }
      if (pendingStop) {
        while (flushOnce(false)) {
          /* keep flushing */
        }
        flushOnce(true)
        pendingStop = false
      }
    })

    ws.on('message', (data: RawData) => {
      const text =
        typeof data === 'string'
          ? data
          : Buffer.isBuffer(data)
            ? data.toString('utf8')
            : Array.isArray(data)
              ? Buffer.concat(data).toString('utf8')
              : Buffer.from(data as ArrayBuffer).toString('utf8')
      const ev = parseXfyunMessage(text, acc)
      if (ev.kind === 'noop') return
      if (ev.kind === 'error') {
        const m = `讯飞错误 ${ev.code}: ${ev.message}`
        console.warn('[ledger-api][xfyun-ws]', m)
        send({
          type: 'error',
          message: formatAsrUserFacingError(m),
          code: ev.code,
        })
        return
      }
      send({
        type: 'result',
        text: ev.text,
        definite: ev.kind === 'completed',
      })
      if (ev.kind === 'completed') {
        send({ type: 'closed' })
        try {
          ws.close()
        } catch {
          /* ignore */
        }
      }
    })

    ws.on('error', (err: unknown) => {
      const raw = err instanceof Error ? err.message : String(err)
      console.warn('[ledger-api][xfyun-ws] error event:', raw)
      reportFailure(raw || '讯飞语音识别连接失败')
    })

    ws.on('unexpected-response', (_req, res) => {
      const code = res.statusCode ?? 0
      console.warn(
        '[ledger-api][xfyun-ws] unexpected-response',
        JSON.stringify({ httpStatus: code }),
      )
      res.resume()
      reportFailure(
        `讯飞 WebSocket 握手失败 HTTP ${code}（请检查 APPID/APIKey/APISecret 与时钟）`,
      )
    })

    ws.on('close', () => {
      stopTimer()
      if (!closed) send({ type: 'closed' })
      closed = true
    })
  })
}
