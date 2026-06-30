import { useCallback, useEffect, useRef, useState } from 'react'
import { ensureCameraPermission } from '../plugins/kuaijiPermissions'
import { parseInviteCodeFromText, normalizeInviteCode } from '../utils/referralInvite'

type Props = {
  open: boolean
  onClose: () => void
  onCode: (code: string) => void
  title?: string
}

export function InviteCodeScanModal({
  open,
  onClose,
  onCode,
  title = '扫码填写邀请码',
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const [manual, setManual] = useState('')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    const v = videoRef.current
    if (v) v.srcObject = null
    setScanning(false)
  }, [])

  const submitCode = useCallback(
    (raw: string) => {
      const code = parseInviteCodeFromText(raw) ?? normalizeInviteCode(raw)
      if (code.length < 4) {
        setCameraError('请输入至少 4 位邀请码')
        return
      }
      stopCamera()
      onCode(code)
      onClose()
    },
    [onClose, onCode, stopCamera],
  )

  useEffect(() => {
    if (!open) {
      stopCamera()
      setManual('')
      setCameraError(null)
      return
    }

    let cancelled = false
    const run = async () => {
      if (!('BarcodeDetector' in window)) {
        setCameraError('当前环境不支持扫码，请手动输入邀请码')
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('无法打开相机，请手动输入邀请码')
        return
      }
      const cameraOk = await ensureCameraPermission()
      if (!cameraOk) {
        setCameraError('需要相机权限才能扫码，请手动输入邀请码')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setScanning(true)
        setCameraError(null)

        const detector = new BarcodeDetector({ formats: ['qr_code'] })
        const tick = async () => {
          if (cancelled || !videoRef.current || video.readyState < 2) {
            rafRef.current = requestAnimationFrame(() => void tick())
            return
          }
          try {
            const codes = await detector.detect(video)
            const raw = codes[0]?.rawValue
            if (raw) {
              const parsed = parseInviteCodeFromText(raw)
              if (parsed) {
                submitCode(parsed)
                return
              }
            }
          } catch {
            /* continue scanning */
          }
          rafRef.current = requestAnimationFrame(() => void tick())
        }
        rafRef.current = requestAnimationFrame(() => void tick())
      } catch {
        if (!cancelled) {
          setCameraError('无法打开相机，请手动输入邀请码')
        }
      }
    }
    void run()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [open, stopCamera, submitCode])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black">
      <div className="flex items-center justify-between px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center text-white"
          aria-label="关闭"
        >
          ✕
        </button>
        <span className="text-sm font-medium text-white">{title}</span>
        <span className="h-11 w-11" aria-hidden />
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className={`absolute inset-0 h-full w-full object-cover ${scanning ? 'opacity-100' : 'opacity-0'}`}
          playsInline
          muted
          autoPlay
          aria-hidden
        />
        {!scanning ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/80">
            {cameraError ?? '正在启动相机…'}
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/70" />
        )}
      </div>

      <div className="shrink-0 space-y-2 bg-black/80 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="text-center text-xs text-white/70">
          对准好友分享的邀请二维码，或手动输入邀请码
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={manual}
            onChange={(e) => setManual(e.target.value.toUpperCase())}
            placeholder="邀请码"
            className="min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/40"
            autoCapitalize="characters"
          />
          <button
            type="button"
            onClick={() => submitCode(manual)}
            className="shrink-0 rounded-xl bg-[#2ecc71] px-4 py-2.5 text-sm font-semibold text-white"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
