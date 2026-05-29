import { useCallback, useEffect, useRef, useState } from 'react'
import {
  requestCameraPermission,
  requestPhotosPermission,
} from '../plugins/kuaijiPermissions'

type Props = {
  open: boolean
  onClose: () => void
  onImagePicked: (file: File) => void
}

export function BillCameraCaptureModal({
  open,
  onClose,
  onImagePicked,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    const video = videoRef.current
    if (video) video.srcObject = null
    setCameraReady(false)
    setCameraStarting(false)
  }, [])

  useEffect(() => {
    if (!open) {
      stopCamera()
      setCameraError(null)
      setCapturing(false)
    }
  }, [open, stopCamera])

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('当前环境不支持相机')
      return false
    }
    setCameraStarting(true)
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = stream
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
      setCameraError('无法打开相机，请检查权限后重试')
      setCameraReady(false)
      return false
    } finally {
      setCameraStarting(false)
    }
  }, [])

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
      const file = new File([blob], `bill-${Date.now()}.jpg`, {
        type: 'image/jpeg',
      })
      onImagePicked(file)
    } catch {
      setCameraError('拍照失败，请重试')
    } finally {
      setCapturing(false)
    }
  }, [cameraReady, capturing, onImagePicked])

  const handleShutterClick = useCallback(async () => {
    if (capturing || cameraStarting) return

    if (!cameraReady) {
      const granted = await requestCameraPermission()
      if (!granted) {
        setCameraError('需要相机权限才能拍照')
        return
      }
      const ok = await startCamera()
      if (!ok) return
      return
    }

    await handleCapture()
  }, [cameraReady, cameraStarting, capturing, handleCapture, startCamera])

  const handleGalleryClick = useCallback(async () => {
    const granted = await requestPhotosPermission()
    if (!granted) {
      setCameraError('需要相册权限才能选图')
      return
    }
    setCameraError(null)
    galleryInputRef.current?.click()
  }, [])

  if (!open) return null

  const hint = cameraReady
    ? '对准账单，再次点击拍照'
    : cameraStarting
      ? '正在打开相机…'
      : '点击拍照并授权相机'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full object-cover ${
          cameraReady ? 'opacity-100' : 'opacity-0'
        }`}
        playsInline
        muted
        autoPlay
        aria-hidden
      />

      {!cameraReady && !cameraStarting ? (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
          <ScanCameraGlyph className="h-20 w-20 text-white/15" />
        </div>
      ) : null}

      {cameraError ? (
        <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+3.5rem)] z-10 px-4">
          <p className="rounded-xl bg-black/70 px-3 py-2 text-center text-sm text-white/90">
            {cameraError}
          </p>
        </div>
      ) : null}

      <div className="relative z-10 flex items-center justify-between px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm"
          aria-label="关闭"
        >
          <CloseGlyph className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => void handleGalleryClick()}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm"
          aria-label="从相册选择"
        >
          <GalleryGlyph className="h-5 w-5" />
        </button>
      </div>

      <div className="relative z-10 mt-auto flex flex-col items-center gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p className="text-sm text-white/80">{hint}</p>
        <button
          type="button"
          onClick={() => void handleShutterClick()}
          disabled={cameraStarting || capturing}
          className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full border-4 border-white bg-white/20 backdrop-blur-sm disabled:opacity-40"
          aria-label={cameraReady ? '拍照' : '授权并打开相机'}
        >
          <span className="h-[3.25rem] w-[3.25rem] rounded-full bg-white" />
        </button>
      </div>

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onImagePicked(file)
        }}
      />
    </div>
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

function ScanCameraGlyph({ className }: { className?: string }) {
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
        d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
      />
    </svg>
  )
}
