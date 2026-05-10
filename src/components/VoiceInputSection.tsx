import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import type { DoubaoParseResult } from '../utils/doubaoParser'
import { isDoubaoConfigured, parseWithDoubao } from '../utils/doubaoParser'
import { startVolcAsrSession } from '../utils/volcAsrClient'
import type { FieldDef } from '../types'

/** 按住超过此时长后开始录音，避免误触 */
const LONG_PRESS_MS = 320

type Props = {
  fields: FieldDef[]
  onApplyParsed: (
    data: Record<string, string>,
    productLines?: {
      product: string
      quantity: string
      lineAmount?: string
    }[],
  ) => void
  onFillFirstLine: (product: string, quantity: string) => void
}

export function VoiceInputSection({
  fields,
  onApplyParsed,
  onFillFirstLine,
}: Props) {
  const { apiBase, token } = useAuth()
  const canUseVoice = Boolean(apiBase && token)

  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const sessionRef = useRef<Awaited<
    ReturnType<typeof startVolcAsrSession>
  > | null>(null)

  const pressDownRef = useRef(false)
  const holdArmedRef = useRef(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const pointerTypeRef = useRef<string>('touch')
  /** 递增以作废尚未 resolve 的 startRecording（松手或打断长按） */
  const holdEpochRef = useRef(0)
  const globalPointerEndHandlerRef = useRef<((e: PointerEvent) => void) | null>(
    null,
  )
  const micBtnRef = useRef<HTMLButtonElement>(null)

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const detachGlobalPointerEnd = useCallback(() => {
    const fn = globalPointerEndHandlerRef.current
    if (!fn) return
    window.removeEventListener('pointerup', fn, true)
    window.removeEventListener('pointercancel', fn, true)
    globalPointerEndHandlerRef.current = null
  }, [])

  const stopRecording = useCallback(() => {
    sessionRef.current?.stop()
    sessionRef.current = null
    setRecording(false)
  }, [])

  const endHoldGesture = useCallback(() => {
    detachGlobalPointerEnd()
    clearLongPressTimer()
    const wasArmed = holdArmedRef.current
    holdArmedRef.current = false
    pressDownRef.current = false
    if (wasArmed) {
      holdEpochRef.current += 1
    }
    const el = micBtnRef.current
    const pid = pointerIdRef.current
    if (el && pid != null) {
      try {
        if (el.hasPointerCapture(pid)) el.releasePointerCapture(pid)
      } catch {
        /* ignore */
      }
    }
    pointerIdRef.current = null
    if (wasArmed) stopRecording()
  }, [clearLongPressTimer, detachGlobalPointerEnd, stopRecording])

  const endHoldGestureRef = useRef(endHoldGesture)
  endHoldGestureRef.current = endHoldGesture

  const startRecording = useCallback(
    async (epochAtStart: number) => {
      if (!apiBase || !token) return
      setHint(null)
      setRecording(true)
      try {
        const session = await startVolcAsrSession(apiBase, token, {
          onText: (text) => setTranscript(text),
          onError: (msg) => {
            stopRecording()
            setHint(msg)
          },
        })
        if (epochAtStart !== holdEpochRef.current) {
          session.stop()
          setRecording(false)
          return
        }
        setTranscript('')
        sessionRef.current = session
      } catch (e) {
        if (epochAtStart !== holdEpochRef.current) {
          setRecording(false)
          return
        }
        setRecording(false)
        setHint(e instanceof Error ? e.message : '无法开始录音')
      }
    },
    [apiBase, token, stopRecording],
  )

  useEffect(() => {
    return () => {
      detachGlobalPointerEnd()
      clearLongPressTimer()
      sessionRef.current?.stop()
    }
  }, [clearLongPressTimer, detachGlobalPointerEnd])

  const handleMicPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (recording) return

    if (!canUseVoice) {
      setHint(
        !apiBase
          ? '未配置 VITE_API_URL，无法使用语音'
          : '请先登录后再使用语音',
      )
      return
    }

    pointerIdRef.current = e.pointerId
    pointerTypeRef.current = e.pointerType
    pressDownRef.current = true
    detachGlobalPointerEnd()
    const onWinEnd = (ev: PointerEvent) => {
      if (
        pointerIdRef.current !== null &&
        ev.pointerId !== pointerIdRef.current
      ) {
        return
      }
      endHoldGestureRef.current()
    }
    globalPointerEndHandlerRef.current = onWinEnd
    window.addEventListener('pointerup', onWinEnd, true)
    window.addEventListener('pointercancel', onWinEnd, true)
    clearLongPressTimer()
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      if (!pressDownRef.current) return
      holdArmedRef.current = true
      const btn = micBtnRef.current
      const pid = pointerIdRef.current
      if (
        pointerTypeRef.current === 'mouse' &&
        btn &&
        pid != null
      ) {
        try {
          btn.setPointerCapture(pid)
        } catch {
          /* ignore */
        }
      }
      const epochAtStart = holdEpochRef.current
      void startRecording(epochAtStart)
    }, LONG_PRESS_MS)
  }

  const handleMicPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) {
      return
    }
    endHoldGesture()
  }

  const handleParse = useCallback(async () => {
    const text = transcript.trim()
    if (!text) {
      setHint('请先完成语音识别')
      return
    }
    if (!isDoubaoConfigured()) {
      onFillFirstLine(text, '')
      setHint(null)
      return
    }
    setBusy(true)
    setHint(null)
    try {
      const r: DoubaoParseResult = await parseWithDoubao(text, fields)
      if (!r.success || !r.data) {
        setHint(r.error ?? '解析失败')
        return
      }
      onApplyParsed(r.data, r.productLines)
    } finally {
      setBusy(false)
    }
  }, [transcript, fields, onApplyParsed, onFillFirstLine])

  const micIdle = !recording
  const micEnabled = canUseVoice

  return (
    <div className="rounded-2xl border border-stone-200/90 bg-white p-4 text-left shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-medium text-[#666666]">语音</span>
          {!micIdle && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700">
              录音中
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={busy || !transcript.trim()}
          onClick={() => void handleParse()}
          className="shrink-0 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-[#1a7f4c] disabled:opacity-45"
        >
          {isDoubaoConfigured()
            ? busy
              ? '填入中…'
              : '智能填入'
            : '填入首行'}
        </button>
      </div>

      <div className="mt-3 flex gap-3">
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={3}
          className="min-h-[4.25rem] max-h-32 min-w-0 flex-1 resize-y rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2.5 text-sm leading-relaxed text-neutral-900 placeholder:text-[#999999]"
          placeholder="识别文字"
          aria-label="识别文字"
        />
        <div className="flex shrink-0 flex-col justify-end self-stretch pb-0.5">
          <button
            ref={micBtnRef}
            type="button"
            style={{ touchAction: 'none' }}
            onPointerDown={handleMicPointerDown}
            onPointerUp={handleMicPointerUp}
            onPointerCancel={handleMicPointerUp}
            className={
              micIdle
                ? micEnabled
                  ? 'flex h-14 w-14 select-none items-center justify-center rounded-full bg-[#1a7f4c] text-white shadow-md active:scale-95 active:bg-[#166b3c]'
                  : 'flex h-14 w-14 select-none items-center justify-center rounded-full bg-stone-200 text-stone-500'
                : 'flex h-14 w-14 select-none items-center justify-center rounded-full bg-rose-600 text-white shadow-md ring-[3px] ring-rose-200/70'
            }
            title={micIdle ? '长按开始，松手结束' : undefined}
            aria-label={micIdle ? '长按麦克风说话，松手结束' : '录音中，松手结束'}
          >
            <MicIcon className="h-7 w-7" />
          </button>
        </div>
      </div>

      {hint && (
        <p className="mt-2 text-[11px] leading-snug text-amber-800" role="status">
          {hint}
        </p>
      )}
    </div>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}
