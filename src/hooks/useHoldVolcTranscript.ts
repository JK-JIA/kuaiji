import { useCallback, useEffect, useRef, useState } from 'react'
import { messageIfPremiumFeatureBlocked } from '../utils/premiumGate'
import { formatAsrUserFacingError } from '../utils/asrUserFacingError'
import { readAsrProvider } from '../utils/asrProvider'
import { startVolcAsrSession } from '../utils/volcAsrClient'

/** 按住超过此时长后开始录音，避免误触 */
export const HOLD_VOLC_LONG_PRESS_MS = 320

export type UseHoldVolcTranscriptArgs = {
  apiBase: string | undefined
  token: string | null
  membershipActive: boolean
  /** 近期账本词等，经服务端与静态热词合并后传给火山 ASR */
  asrHotwords?: string[]
  /**
   * 用户松手并停止推流后调用（含服务端收尾延迟），参数为当前识别文本。
   * 未触发长按直接松手时不会调用。
   */
  onSessionFinalized?: (text: string) => void
  /**
   * 按下后未进入长按录音即松手时调用（用于轻点打开手动记账等）。
   * 已进入录音并在松手时结束会话的，不会调用。
   */
  onShortTap?: () => void
  /**
   * 已进入长按录音后松手时调用（在停止推流之前）。
   * 用于忽略浏览器随后触发的 click，避免误开手动记账弹窗。
   */
  onHoldReleased?: () => void
}

export function useHoldVolcTranscript({
  apiBase,
  token,
  membershipActive,
  asrHotwords,
  onSessionFinalized,
  onShortTap,
  onHoldReleased,
}: UseHoldVolcTranscriptArgs) {
  const [recording, setRecording] = useState(false)
  const [holdPressActive, setHoldPressActive] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [hint, setHint] = useState<string | null>(null)

  const sessionRef = useRef<Awaited<
    ReturnType<typeof startVolcAsrSession>
  > | null>(null)
  const transcriptRef = useRef('')
  const pressDownRef = useRef(false)
  const holdArmedRef = useRef(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointerIdRef = useRef<number | null>(null)
  const pointerTypeRef = useRef<string>('touch')
  const holdEpochRef = useRef(0)
  const globalPointerEndHandlerRef = useRef<((e: PointerEvent) => void) | null>(
    null,
  )
  const micBtnRef = useRef<HTMLButtonElement>(null)
  const onSessionFinalizedRef = useRef(onSessionFinalized)
  onSessionFinalizedRef.current = onSessionFinalized
  const onShortTapRef = useRef(onShortTap)
  onShortTapRef.current = onShortTap
  const onHoldReleasedRef = useRef(onHoldReleased)
  onHoldReleasedRef.current = onHoldReleased
  const asrHotwordsRef = useRef<string[]>([])
  useEffect(() => {
    asrHotwordsRef.current = asrHotwords ?? []
  }, [asrHotwords])

  const premiumBlocked = messageIfPremiumFeatureBlocked({
    apiBase,
    token,
    membershipActive,
  })
  const canUseVoice = premiumBlocked === null

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
    setHoldPressActive(false)
    detachGlobalPointerEnd()
    clearLongPressTimer()
    const wasPressing = pressDownRef.current
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
    if (wasArmed) {
      onHoldReleasedRef.current?.()
      stopRecording()
    } else if (wasPressing) {
      onShortTapRef.current?.()
    }
  }, [clearLongPressTimer, detachGlobalPointerEnd, stopRecording])

  const endHoldGestureRef = useRef(endHoldGesture)
  endHoldGestureRef.current = endHoldGesture

  const setTranscriptTracked = useCallback((text: string) => {
    transcriptRef.current = text
    setTranscript(text)
  }, [])

  const startRecording = useCallback(
    async (epochAtStart: number) => {
      if (
        messageIfPremiumFeatureBlocked({
          apiBase,
          token,
          membershipActive,
        })
      ) {
        return
      }
      if (!apiBase?.trim() || !token) return
      setHint(null)
      setRecording(true)
      try {
        let endedNotified = false
        const asrProvider = readAsrProvider()
        const session = await startVolcAsrSession(
          apiBase,
          token,
          {
            onText: (text) => {
              transcriptRef.current = text
              setTranscript(text)
            },
            onError: (msg) => {
              stopRecording()
              setHint(msg)
            },
            onEnded: () => {
              if (endedNotified) return
              endedNotified = true
              onSessionFinalizedRef.current?.(transcriptRef.current)
            },
          },
          {
            provider: asrProvider,
            ...(asrHotwordsRef.current.length
              ? { hotwords: [...asrHotwordsRef.current] }
              : {}),
          },
        )
        if (epochAtStart !== holdEpochRef.current) {
          session.stop()
          setRecording(false)
          return
        }
        setTranscriptTracked('')
        sessionRef.current = session
      } catch (e) {
        if (epochAtStart !== holdEpochRef.current) {
          setRecording(false)
          return
        }
        setRecording(false)
        setHint(
          formatAsrUserFacingError(
            e instanceof Error ? e.message : '无法开始录音',
          ),
        )
      }
    },
    [
      apiBase,
      token,
      membershipActive,
      stopRecording,
      setTranscriptTracked,
    ],
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

    if (premiumBlocked) {
      setHint(premiumBlocked)
      return
    }

    pointerIdRef.current = e.pointerId
    pointerTypeRef.current = e.pointerType
    pressDownRef.current = true
    setHoldPressActive(true)
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
      if (pointerTypeRef.current === 'mouse' && btn && pid != null) {
        try {
          btn.setPointerCapture(pid)
        } catch {
          /* ignore */
        }
      }
      const epochAtStart = holdEpochRef.current
      void startRecording(epochAtStart)
    }, HOLD_VOLC_LONG_PRESS_MS)
  }

  const handleMicPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) {
      return
    }
    endHoldGesture()
  }

  return {
    micBtnRef,
    transcript,
    setTranscript: setTranscriptTracked,
    recording,
    holdPressActive,
    hint,
    setHint,
    canUseVoice,
    premiumBlocked,
    handleMicPointerDown,
    handleMicPointerUp,
  }
}
