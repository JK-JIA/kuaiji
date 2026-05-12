import { getAsrWebSocketUrl } from '../api/ledgerClient'
import { APP_VERSION } from '../version'
import { asrDiagLog } from './asrDiagLog'

function floatTo16BitPCM(float32: Float32Array): Int16Array {
  const out = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function downsampleTo16k(
  buffer: Float32Array,
  inputSampleRate: number,
): Float32Array {
  const outRate = 16000
  if (inputSampleRate === outRate) return buffer
  const ratio = inputSampleRate / outRate
  const outLen = Math.round(buffer.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    out[i] = buffer[Math.min(Math.floor(i * ratio), buffer.length - 1)]
  }
  return out
}

export type VolcAsrSession = {
  stop: () => void
}

function micAccessErrorMessage(err: unknown): string {
  const dom = err as { name?: string; message?: string }
  const name = dom?.name ?? ''
  const msg = err instanceof Error ? err.message : String(err)
  if (
    name === 'NotAllowedError' ||
    /Permission denied|NotAllowedError/i.test(msg)
  ) {
    return '无法使用麦克风：请在系统弹窗中选「允许」，或到 设置 → 应用 → 本应用 → 权限 中开启麦克风。'
  }
  if (name === 'NotFoundError') {
    return '未检测到麦克风设备。'
  }
  return err instanceof Error ? err.message : '无法访问麦克风'
}

async function runPreflight(apiBase: string, wsUrl: string, tokenLen: number) {
  const base = apiBase.replace(/\/$/, '')
  asrDiagLog(`—— 开始诊断 APP_VERSION=${APP_VERSION} ——`)
  try {
    asrDiagLog(
      `location.href=${typeof globalThis.location !== 'undefined' ? globalThis.location.href : '(none)'}`,
    )
  } catch {
    asrDiagLog('location.href=(unavailable)')
  }
  asrDiagLog(`apiBase=${base}`)
  asrDiagLog(`WebSocket target url=${wsUrl}`)
  asrDiagLog(`JWT length=${tokenLen} (内容不记录)`)

  try {
    const r = await fetch(`${base}/health`, { cache: 'no-store' })
    const body = await r.text()
    asrDiagLog(`GET /health → HTTP ${r.status} body=${body.slice(0, 240)}`)
  } catch (e) {
    asrDiagLog(`GET /health → fetch error: ${e instanceof Error ? e.message : String(e)}`)
  }

  try {
    const r = await fetch(`${base}/api/asr/health`, { cache: 'no-store' })
    const body = await r.text()
    asrDiagLog(
      `GET /api/asr/health → HTTP ${r.status} body=${body.slice(0, 600)}`,
    )
  } catch (e) {
    asrDiagLog(
      `GET /api/asr/health → fetch error: ${e instanceof Error ? e.message : String(e)}`,
    )
  }

  asrDiagLog(
    '说明：若此处 HTTP 正常但下面出现「Unexpected server response: 400」，多为前置网关/反代未放行 WebSocket，或 URL 未指向本 API 进程。',
  )
}

/**
 * 通过自建后端 WebSocket 代理连接火山流式 ASR。
 * 鉴权在连接后首条 JSON 完成，避免 JWT 放在 URL 触发网关 400。
 */
export function startVolcAsrSession(
  apiBase: string,
  token: string,
  handlers: {
    onText: (text: string) => void
    onError: (message: string) => void
    onEnded?: () => void
  },
  options?: { hotwords?: string[] },
): Promise<VolcAsrSession> {
  const url = getAsrWebSocketUrl(apiBase)

  return new Promise((resolve, reject) => {
    void (async () => {
      await runPreflight(apiBase, url, token.length)

      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'

      let stream: MediaStream | null = null
      let audioContext: AudioContext | null = null
      let processor: ScriptProcessorNode | null = null
      let source: MediaStreamAudioSourceNode | null = null
      let mute: GainNode | null = null
      let cleaned = false

      const cleanup = () => {
        if (cleaned) return
        cleaned = true
        try {
          processor?.disconnect()
          source?.disconnect()
          mute?.disconnect()
        } catch {
          /* ignore */
        }
        processor = null
        source = null
        mute = null
        stream?.getTracks().forEach((t) => t.stop())
        stream = null
        void audioContext?.close()
        audioContext = null
      }

      let sessionResolved = false
      let micStarted = false
      let readyHandled = false

      const failEarly = (message: string) => {
        if (sessionResolved) return
        sessionResolved = true
        asrDiagLog(`failEarly: ${message}`)
        cleanup()
        try {
          ws.close()
        } catch {
          /* ignore */
        }
        reject(new Error(message))
      }

      const startMicPipeline = async () => {
        if (sessionResolved) return
        asrDiagLog('收到 ready，请求麦克风…')
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              channelCount: 1,
            },
          })
          audioContext = new AudioContext()
          await audioContext.resume()
          const inRate = audioContext.sampleRate
          asrDiagLog(`AudioContext.sampleRate=${inRate}`)
          source = audioContext.createMediaStreamSource(stream)
          processor = audioContext.createScriptProcessor(4096, 1, 1)
          mute = audioContext.createGain()
          mute.gain.value = 0

          processor.onaudioprocess = (e) => {
            if (ws.readyState !== WebSocket.OPEN) return
            const input = e.inputBuffer.getChannelData(0)
            const down = downsampleTo16k(input, inRate)
            const pcm = floatTo16BitPCM(down)
            ws.send(
              pcm.buffer.slice(
                pcm.byteOffset,
                pcm.byteOffset + pcm.byteLength,
              ) as ArrayBuffer,
            )
          }

          source.connect(processor)
          processor.connect(mute)
          mute.connect(audioContext.destination)

          micStarted = true
          sessionResolved = true
          asrDiagLog('麦克风已启动，正在推流')
          resolve({
            stop: () => {
              asrDiagLog('用户点击停止录音')
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'stop' }))
                window.setTimeout(() => {
                  cleanup()
                  ws.close()
                  handlers.onEnded?.()
                }, 400)
              } else {
                cleanup()
                handlers.onEnded?.()
              }
            },
          })
        } catch (e) {
          failEarly(micAccessErrorMessage(e))
        }
      }

      ws.onopen = () => {
        asrDiagLog(
          `WebSocket onopen readyState=${ws.readyState} protocol=${ws.protocol || '(empty)'}`,
        )
        try {
          const hw = options?.hotwords?.filter(
            (s): s is string => typeof s === 'string' && s.trim().length > 0,
          )
          ws.send(
            JSON.stringify(
              hw?.length
                ? { type: 'auth', token, hotwords: hw }
                : { type: 'auth', token },
            ),
          )
          asrDiagLog('已发送 auth 帧（token 未写入日志）')
        } catch (e) {
          failEarly(
            `无法发送登录信息: ${e instanceof Error ? e.message : String(e)}`,
          )
        }
      }

      ws.onclose = (ev) => {
        asrDiagLog(
          `WebSocket onclose code=${ev.code} reason=${ev.reason || '(empty)'} wasClean=${ev.wasClean}`,
        )
      }

      ws.onerror = () => {
        asrDiagLog(
          'WebSocket onerror（浏览器常不提供 HTTP 状态码；若握手失败多与网关/WebSocket 配置有关）',
        )
        if (!sessionResolved) {
          failEarly(
            '语音识别连接失败（请复制下方诊断日志排查：网关是否支持 WS、URL 是否直连 API）',
          )
        } else if (micStarted) {
          handlers.onError('语音识别连接中断')
          cleanup()
        }
      }

      ws.onmessage = (ev: MessageEvent) => {
        if (typeof ev.data !== 'string') return
        try {
          const msg = JSON.parse(ev.data) as {
            type?: string
            text?: string
            message?: string
          }
          if (msg.type === 'error') {
            const m = msg.message || '语音识别失败'
            asrDiagLog(`服务端 error 帧: ${m.slice(0, 400)}`)
            if (!micStarted) failEarly(m)
            else handlers.onError(m)
            return
          }
          if (msg.type === 'ready') {
            asrDiagLog('收到服务端 ready')
            if (readyHandled) return
            readyHandled = true
            void startMicPipeline()
            return
          }
          if (msg.type === 'result' && typeof msg.text === 'string') {
            asrDiagLog(`result 文本长度=${msg.text.length}`)
            if (msg.text.length === 0) return
            handlers.onText(msg.text)
            return
          }
          if (msg.type === 'closed') {
            asrDiagLog('收到 closed')
            handlers.onEnded?.()
          }
        } catch {
          /* ignore */
        }
      }

      asrDiagLog(`WebSocket 已创建，protocols 默认，即将握手…`)
    })()
  })
}
