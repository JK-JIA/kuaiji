import { useCallback, useEffect, useRef, useState } from 'react'
import { ensurePhotosPermission } from '../plugins/kuaijiPermissions'

export type BillRecognizeResult =
  | { success: true }
  | { success: false; error: string }

type Props = {
  open: boolean
  onClose: () => void
  onRecognize: (file: File, signal: AbortSignal) => Promise<BillRecognizeResult>
}

type Phase = 'camera' | 'review' | 'recognizing'
type FocusPoint = { x: number; y: number; key: number }

export function BillCameraCaptureModal({
  open,
  onClose,
  onRecognize,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recognizeAbortRef = useRef<AbortController | null>(null)
  const capturedUrlRef = useRef<string | null>(null)

  const [phase, setPhase] = useState<Phase>('camera')
  const [capturedFile, setCapturedFile] = useState<File | null>(null)
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [recognizeError, setRecognizeError] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [torchSupported, setTorchSupported] = useState(false)
  const [focusPoint, setFocusPoint] = useState<FocusPoint | null>(null)

  const clearCapturedPreview = useCallback(() => {
    if (capturedUrlRef.current) {
      URL.revokeObjectURL(capturedUrlRef.current)
      capturedUrlRef.current = null
    }
    setCapturedUrl(null)
    setCapturedFile(null)
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) video.srcObject = null
    setCameraReady(false)
    setCameraStarting(false)
    setTorchOn(false)
    setTorchSupported(false)
  }, [])

  const cancelRecognize = useCallback(() => {
    recognizeAbortRef.current?.abort()
    recognizeAbortRef.current = null
    setPhase('review')
    setRecognizeError(null)
  }, [])

  const resetAll = useCallback(() => {
    recognizeAbortRef.current?.abort()
    recognizeAbortRef.current = null
    stopCamera()
    clearCapturedPreview()
    setPhase('camera')
    setCameraError(null)
    setRecognizeError(null)
    setCapturing(false)
    setFocusPoint(null)
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current)
      focusTimerRef.current = null
    }
  }, [clearCapturedPreview, stopCamera])

  useEffect(() => {
    if (!open) resetAll()
  }, [open, resetAll])

  const applyTorch = useCallback(async (on: boolean) => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return false
    try {
      const advanced = [{ torch: on }] as unknown as MediaTrackConstraintSet[]
      await track.applyConstraints({ advanced })
      setTorchOn(on)
      return true
    } catch {
      return false
    }
  }, [])

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('当前环境不支持相机')
      return false
    }
    setCameraStarting(true)
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = stream

      const track = stream.getVideoTracks()[0]
      const caps = track.getCapabilities?.() as MediaTrackCapabilities & {
        torch?: boolean
      }
      setTorchSupported(Boolean(caps?.torch))

      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        return false
      }
      video.srcObject = stream
      await video.play()
      setCameraReady(true)
      return true
    } catch {
      setCameraError('无法打开相机')
      setCameraReady(false)
      return false
    } finally {
      setCameraStarting(false)
    }
  }, [])

  useEffect(() => {
    if (!open || phase !== 'camera') return
    void startCamera()
  }, [open, phase, startCamera])

  const enterReview = useCallback(
    (file: File) => {
      stopCamera()
      clearCapturedPreview()
      const url = URL.createObjectURL(file)
      capturedUrlRef.current = url
      setCapturedUrl(url)
      setCapturedFile(file)
      setRecognizeError(null)
      setCameraError(null)
      setPhase('review')
    },
    [clearCapturedPreview, stopCamera],
  )

  const handlePreviewTap = useCallback(
    async (e: React.PointerEvent<HTMLDivElement>) => {
      if (phase !== 'camera' || !cameraReady || !previewRef.current) return
      const rect = previewRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const normX = Math.min(1, Math.max(0, x / rect.width))
      const normY = Math.min(1, Math.max(0, y / rect.height))

      setFocusPoint({ x, y, key: Date.now() })
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current)
      focusTimerRef.current = setTimeout(() => setFocusPoint(null), 1200)

      const track = streamRef.current?.getVideoTracks()[0]
      if (!track) return
      try {
        const advanced = [
          {
            focusMode: 'single-shot',
            pointsOfInterest: [{ x: normX, y: normY }],
          },
        ] as unknown as MediaTrackConstraintSet[]
        await track.applyConstraints({ advanced })
      } catch {
        /* 部分 WebView 不支持手动对焦，仅显示对焦框 */
      }
    },
    [cameraReady, phase],
  )

  const handleCapture = useCallback(async () => {
    const video = videoRef.current
    if (!video || !cameraReady || capturing) return

    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return

    setCapturing(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('拍照失败')
      ctx.drawImage(video, 0, 0, w, h)

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('拍照失败'))),
          'image/jpeg',
          0.92,
        )
      })
      enterReview(
        new File([blob], `bill-${Date.now()}.jpg`, { type: 'image/jpeg' }),
      )
    } catch {
      setCameraError('拍照失败，请重试')
    } finally {
      setCapturing(false)
    }
  }, [cameraReady, capturing, enterReview])

  const handleRetake = useCallback(() => {
    clearCapturedPreview()
    setRecognizeError(null)
    setPhase('camera')
  }, [clearCapturedPreview])

  const handleConfirmRecognize = useCallback(async () => {
    if (!capturedFile) return
    setRecognizeError(null)
    setPhase('recognizing')
    const ac = new AbortController()
    recognizeAbortRef.current = ac
    try {
      const result = await onRecognize(capturedFile, ac.signal)
      if (ac.signal.aborted) return
      if (result.success) {
        onClose()
        return
      }
      setRecognizeError(result.error)
      setPhase('review')
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setPhase('review')
        return
      }
      setRecognizeError(e instanceof Error ? e.message : '识别失败')
      setPhase('review')
    } finally {
      if (recognizeAbortRef.current === ac) {
        recognizeAbortRef.current = null
      }
    }
  }, [capturedFile, onClose, onRecognize])

  const handleTorchToggle = useCallback(() => {
    void applyTorch(!torchOn)
  }, [applyTorch, torchOn])

  const handleGalleryClick = useCallback(async () => {
    const ok = await ensurePhotosPermission()
    if (!ok) {
      setCameraError('需要相册权限才能选图')
      return
    }
    setCameraError(null)
    galleryInputRef.current?.click()
  }, [])

  const handleTopClose = useCallback(() => {
    if (phase === 'recognizing') {
      cancelRecognize()
      return
    }
    onClose()
  }, [cancelRecognize, onClose, phase])

  if (!open) return null

  const showLiveCamera = phase === 'camera'
  const showReview = phase === 'review' && capturedUrl
  const showRecognizing = phase === 'recognizing'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {showLiveCamera ? (
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
          autoPlay
          aria-hidden
        />
      ) : null}

      {showReview ? (
        <img
          src={capturedUrl}
          alt="照片预览"
          className="absolute inset-0 h-full w-full object-contain bg-black"
        />
      ) : null}

      {showLiveCamera ? (
        <div
          ref={previewRef}
          className="absolute inset-0 z-[1]"
          onPointerDown={(e) => void handlePreviewTap(e)}
          aria-hidden
        />
      ) : null}

      {showLiveCamera && focusPoint ? (
        <div
          key={focusPoint.key}
          className="pointer-events-none absolute z-[2] h-[4.5rem] w-[4.5rem] -translate-x-1/2 -translate-y-1/2"
          style={{ left: focusPoint.x, top: focusPoint.y }}
          aria-hidden
        >
          <span className="absolute inset-0 animate-ping rounded-sm border border-white/80 opacity-60" />
          <span className="absolute inset-0 rounded-sm border-2 border-white shadow-[0_0_8px_rgba(0,0,0,0.35)]" />
        </div>
      ) : null}

      {showLiveCamera && cameraStarting && !cameraReady ? (
        <div className="absolute inset-0 z-[3] flex items-center justify-center bg-black/60">
          <p className="text-sm text-white/80">正在打开相机…</p>
        </div>
      ) : null}

      {showRecognizing ? (
        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center bg-black/55">
          <SpinnerGlyph className="h-11 w-11 animate-spin text-white" />
          <p className="mt-4 text-base font-medium text-white">正在智能识别</p>
          <p className="mt-2 text-xs text-white/65">点击左上角返回可取消</p>
        </div>
      ) : null}

      {(cameraError || recognizeError) && !showRecognizing ? (
        <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+3.25rem)] z-[4] px-4">
          <p className="rounded-lg bg-black/70 px-3 py-2 text-center text-sm text-white/90">
            {recognizeError ?? cameraError}
          </p>
        </div>
      ) : null}

      <div className="relative z-10 flex items-center justify-between px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={handleTopClose}
          className="flex h-11 w-11 items-center justify-center text-white"
          aria-label={showRecognizing ? '取消识别' : '关闭'}
        >
          {showRecognizing ? (
            <BackGlyph className="h-6 w-6" />
          ) : (
            <CloseGlyph className="h-6 w-6" />
          )}
        </button>
        <span className="text-[17px] font-medium text-white">拍账单</span>
        {showLiveCamera ? (
          <div className="flex items-center gap-1">
            {torchSupported ? (
              <button
                type="button"
                onClick={handleTorchToggle}
                className={`flex h-11 w-11 items-center justify-center rounded-full ${
                  torchOn ? 'bg-white/20 text-amber-300' : 'text-white'
                }`}
                aria-label={torchOn ? '关闭闪光灯' : '打开闪光灯'}
              >
                <FlashGlyph className="h-6 w-6" on={torchOn} />
              </button>
            ) : (
              <span className="h-11 w-11" aria-hidden />
            )}
            <button
              type="button"
              onClick={() => void handleGalleryClick()}
              className="flex h-11 w-11 items-center justify-center text-white"
              aria-label="从相册选择"
            >
              <GalleryGlyph className="h-6 w-6" />
            </button>
          </div>
        ) : (
          <span className="h-11 w-11" aria-hidden />
        )}
      </div>

      {showLiveCamera ? (
        <div className="relative z-10 mt-auto flex flex-col items-center gap-2 px-4 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
          <p className="text-xs text-white/70">画面不清晰时，轻触要对焦的位置</p>
          <button
            type="button"
            onClick={() => void handleCapture()}
            disabled={!cameraReady || capturing || cameraStarting}
            className="flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-full border-[3px] border-white disabled:opacity-40"
            aria-label="拍照"
          >
            <span className="h-[3.85rem] w-[3.85rem] rounded-full bg-white" />
          </button>
        </div>
      ) : null}

      {showReview ? (
        <div className="relative z-10 mt-auto flex items-center justify-center gap-8 px-6 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={handleRetake}
            className="min-w-[5.5rem] rounded-full border border-white/80 px-5 py-2.5 text-[15px] font-medium text-white"
          >
            重拍
          </button>
          <button
            type="button"
            onClick={() => void handleConfirmRecognize()}
            className="min-w-[5.5rem] rounded-full bg-[#07c160] px-5 py-2.5 text-[15px] font-semibold text-white"
          >
            确定
          </button>
        </div>
      ) : null}

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) enterReview(file)
        }}
      />
    </div>
  )
}

function SpinnerGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
      />
    </svg>
  )
}

function BackGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function CloseGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function GalleryGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  )
}

function FlashGlyph({ className, on }: { className?: string; on?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.75}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      {on ? (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
          fill="currentColor"
        />
      ) : (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
        />
      )}
    </svg>
  )
}
