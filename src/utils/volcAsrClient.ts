import { getAsrWebSocketUrl } from '../api/ledgerClient'

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
): Promise<VolcAsrSession> {
  const url = getAsrWebSocketUrl(apiBase)
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

  return new Promise((resolve, reject) => {
    let sessionResolved = false
    let micStarted = false
    let readyHandled = false

    const failEarly = (message: string) => {
      if (sessionResolved) return
      sessionResolved = true
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
        resolve({
          stop: () => {
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

    ws.onerror = () => {
      if (!sessionResolved) {
        failEarly(
          '语音识别连接失败（请确认已登录且服务器已开启语音识别）',
        )
      } else if (micStarted) {
        handlers.onError('语音识别连接中断')
        cleanup()
      }
    }

    ws.onopen = () => {
      try {
        ws.send(JSON.stringify({ type: 'auth', token }))
      } catch {
        failEarly('无法发送登录信息')
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
          if (!micStarted) failEarly(m)
          else handlers.onError(m)
          return
        }
        if (msg.type === 'ready') {
          if (readyHandled) return
          readyHandled = true
          void startMicPipeline()
          return
        }
        if (msg.type === 'result' && typeof msg.text === 'string') {
          handlers.onText(msg.text)
          return
        }
        if (msg.type === 'closed') {
          handlers.onEnded?.()
        }
      } catch {
        /* ignore */
      }
    }
  })
}
