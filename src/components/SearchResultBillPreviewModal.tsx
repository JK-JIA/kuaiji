import { useCallback, useEffect, useState } from 'react'
import { useModalBackClose } from '../hooks/useModalBackClose'
import ReactDOM from 'react-dom'
import { shareBillImageBlobWithMobileFallback } from '../utils/exportData'
import { isShareDismissedByUser } from '../utils/shareDismissed'

type Props = {
  open: boolean
  onClose: () => void
  blob: Blob | null
  filename: string
}

export function SearchResultBillPreviewModal({
  open,
  onClose,
  blob,
  filename,
}: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [sharing, setSharing] = useState(false)

  const handleBackPress = useCallback(() => {
    if (fullscreen) {
      setFullscreen(false)
      return true
    }
    return false
  }, [fullscreen])

  useModalBackClose(open, onClose, { onBackPress: handleBackPress })

  useEffect(() => {
    if (!open || !blob) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setFullscreen(false)
      return
    }
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [open, blob])

  const handleShare = useCallback(async () => {
    if (!blob) return
    setSharing(true)
    try {
      await shareBillImageBlobWithMobileFallback(filename, blob)
      onClose()
    } catch (e) {
      if (!isShareDismissedByUser(e)) {
        alert(e instanceof Error ? e.message : '分享失败')
      }
    } finally {
      setSharing(false)
    }
  }, [blob, filename, onClose])

  if (!open || !blob || !previewUrl) return null

  return ReactDOM.createPortal(
    <>
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/50 px-3 py-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          className="absolute inset-0"
          aria-label="关闭"
          onClick={onClose}
        />
        <div className="relative z-10 mx-auto flex w-full max-w-md max-h-[min(92dvh,720px)] flex-col overflow-hidden rounded-2xl bg-kj-surface shadow-xl">
          <div className="flex shrink-0 items-center justify-between border-b border-kj-border/80 px-4 py-2.5">
            <h2 className="text-base font-bold text-kj-primary">账单图片预览</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-medium text-kj-secondary"
            >
              关闭
            </button>
          </div>

          <p className="shrink-0 px-4 pt-2 text-xs text-kj-secondary">
            请核对内容，点击图片可全屏查看
          </p>

          <div className="max-h-[min(58dvh,28rem)] overflow-y-auto overscroll-contain px-3 py-2">
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="mx-auto block w-full max-w-[min(100%,390px)] cursor-zoom-in overflow-hidden rounded-xl border border-kj-border/80 bg-white shadow-sm"
              aria-label="全屏查看账单图片"
            >
              <img
                src={previewUrl}
                alt="账单明细预览"
                className="block w-full"
                draggable={false}
              />
            </button>
          </div>

          <div className="flex shrink-0 gap-2 border-t border-kj-border/80 px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={sharing}
              className="flex-1 rounded-xl border border-kj-border-strong bg-kj-raised px-4 py-3 text-sm font-semibold text-kj-primary disabled:opacity-60"
            >
              返回
            </button>
            <button
              type="button"
              onClick={() => void handleShare()}
              disabled={sharing}
              className="flex-1 rounded-xl bg-[#2ecc71] px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            >
              {sharing ? '分享中…' : '确认分享'}
            </button>
          </div>
        </div>
      </div>

      {fullscreen ? (
        <div className="fixed inset-0 z-[110] flex flex-col bg-black">
          <div className="flex shrink-0 items-center justify-between px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="flex h-11 w-11 items-center justify-center text-white"
              aria-label="返回预览"
            >
              <BackGlyph className="h-6 w-6" />
            </button>
            <span className="text-sm font-medium text-white/90">全屏查看</span>
            <span className="h-11 w-11" aria-hidden />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <img
              src={previewUrl}
              alt="账单明细全屏"
              className="mx-auto block w-full max-w-lg"
              draggable={false}
            />
          </div>
        </div>
      ) : null}
    </>,
    document.body,
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
