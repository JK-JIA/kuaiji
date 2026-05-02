import { useCallback, useEffect, useRef, useState } from 'react'

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

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setError('当前浏览器不支持语音识别')
      return
    }
    setError(null)
    abort()
    baseRef.current = getBaseText()

    const r = new Ctor()
    recRef.current = r
    r.lang = 'zh-CN'
    r.continuous = true
    r.interimResults = true

    const flush = (sessionTail: string) => {
      const base = baseRef.current
      const sep = base.trimEnd() && sessionTail.trimStart() ? ' ' : ''
      onText(base.trimEnd() ? base + sep + sessionTail : sessionTail)
    }

    r.onresult = (event: SpeechRecognitionEvent) => {
      let allFinal = ''
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i]?.isFinal) {
          allFinal += event.results[i][0]?.transcript ?? ''
        }
      }
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i]?.isFinal) {
          interim += event.results[i][0]?.transcript ?? ''
        }
      }
      flush(allFinal + interim)
    }

    r.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'aborted') return
      const msg =
        event.error === 'not-allowed'
          ? '麦克风权限被拒绝，请在浏览器设置中允许使用麦克风'
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
