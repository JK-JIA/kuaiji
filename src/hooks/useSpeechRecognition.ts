import { Capacitor } from '@capacitor/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  correctLedgerSpeech,
  speechAlternativeTranscript,
  transcriptForResult,
} from '../utils/speechCorrections'

/**
 * Android/iOS WebView 里 Web Speech API 往往不经由同一套权限回调，
 * 先用 getUserMedia 触发 Capacitor Bridge 的麦克风授权（见 BridgeWebChromeClient），再识别。
 */
async function ensureNativeMicForWebSpeech(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
  } catch {
    /* 拒绝或未实现时仍尝试 SpeechRecognition，由 onerror 提示 */
  }
}

type RecCtor = new () => SpeechRecognition

function getRecognitionCtor(): RecCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecCtor
    webkitSpeechRecognition?: RecCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionCtor() !== null
}

type Options = {
  /** 开始录音瞬间输入框已有内容（会保留并在其后追加本次识别） */
  getBaseText: () => string
  /** 完整输入框内容（含前缀 + 本次识别过程） */
  onText: (fullText: string) => void
}

/**
 * 浏览器语音识别（Chrome / Edge / Android WebView 等）。
 * 需 HTTPS 或 localhost；若浏览器禁止麦克风会走 onError。
 */
export function useSpeechRecognition({ getBaseText, onText }: Options) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognition | null>(null)
  const baseRef = useRef('')

  const abort = useCallback(() => {
    try {
      recRef.current?.abort()
    } catch {
      /* noop */
    }
    recRef.current = null
    setListening(false)
  }, [])

  const stop = useCallback(() => {
    try {
      recRef.current?.stop()
    } catch {
      /* noop */
    }
  }, [])

  const start = useCallback(async () => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setError('当前浏览器不支持语音识别')
      return
    }
    setError(null)
    abort()
    baseRef.current = getBaseText()

    await ensureNativeMicForWebSpeech()

    const r = new Ctor()
    recRef.current = r
    r.lang = 'zh-CN'
    r.continuous = true
    r.interimResults = true
    try {
      r.maxAlternatives = 5
    } catch {
      /* 部分环境只支持默认 1 */
    }

    const flush = (sessionTail: string) => {
      const base = baseRef.current
      const sep = base.trimEnd() && sessionTail.trimStart() ? ' ' : ''
      onText(base.trimEnd() ? base + sep + sessionTail : sessionTail)
    }

    r.onresult = (event: SpeechRecognitionEvent) => {
      let allFinal = ''
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i]?.isFinal) {
          allFinal += transcriptForResult(event.results[i]!)
        }
      }
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i]?.isFinal) {
          const raw = speechAlternativeTranscript(event.results[i]!, 0)
          interim += correctLedgerSpeech(raw)
        }
      }
      flush(allFinal + interim)
    }

    r.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'aborted') return
      const nativeMicHint =
        Capacitor.getPlatform() === 'android'
          ? '系统已授权仍失败时，多见于 APK 内网页语音受限；请点输入法键盘上的「话筒」把话转成文字填入上方框，或重装应用后在弹出麦克风时选择允许。'
          : '可改用系统键盘的语音输入把文字打进文本框。'
      const msg =
        event.error === 'not-allowed'
          ? Capacitor.isNativePlatform()
            ? `无法使用麦克风。${nativeMicHint}`
            : '麦克风权限被拒绝，请在浏览器设置中允许使用麦克风'
          : event.error === 'no-speech'
            ? '未检测到语音，请重试'
            : event.error === 'network'
              ? '语音识别网络异常'
              : `语音识别错误: ${event.error}`
      setError(msg)
    }

    r.onend = () => {
      recRef.current = null
      setListening(false)
    }

    try {
      r.start()
      setListening(true)
    } catch {
      setError('无法启动语音识别')
      setListening(false)
    }
  }, [abort, getBaseText, onText])

  useEffect(() => () => abort(), [abort])

  return {
    supported: isSpeechRecognitionSupported(),
    listening,
    error,
    start,
    stop,
    abort,
  }
}
