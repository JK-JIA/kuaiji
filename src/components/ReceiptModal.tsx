import { useCallback, useEffect, useRef, useState } from 'react'
import { useModalBackClose } from '../hooks/useModalBackClose'
import ReactDOM from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { FieldDef, LedgerRecord, ProductCatalogEntry } from '../types'
import { receiptImageExt, receiptImageMime } from '../utils/receiptExport'
import { renderSingleReceiptBillBlob } from '../utils/searchResultBillPng'
import { isShareDismissedByUser } from '../utils/shareDismissed'

type Props = {
  open: boolean
  onClose: () => void
  record: LedgerRecord
  fields: FieldDef[]
  productCatalog?: ProductCatalogEntry[]
}

export function ReceiptModal({
  open,
  onClose,
  record,
  fields,
  productCatalog = [],
}: Props) {
  const blobCacheRef = useRef<{ key: string; blob: Blob } | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const cacheKey = `${record.id}:${record.createdAt}`

  const handleBackPress = useCallback(() => {
    if (fullscreen) {
      setFullscreen(false)
      return true
    }
    return false
  }, [fullscreen])

  useModalBackClose(open, onClose, { onBackPress: handleBackPress })

  useEffect(() => {
    if (!open) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      blobCacheRef.current = null
      setFullscreen(false)
      setGenerating(false)
      return
    }

    let cancelled = false
    setGenerating(true)

    const runPrewarm = () => {
      void (async () => {
        try {
          const blob = await renderSingleReceiptBillBlob({
            record,
            fields,
            productCatalog,
          })
          if (cancelled) return
          blobCacheRef.current = { key: cacheKey, blob }
          const url = URL.createObjectURL(blob)
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return url
          })
        } catch {
          if (!cancelled) {
            blobCacheRef.current = null
            setPreviewUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev)
              return null
            })
          }
        } finally {
          if (!cancelled) setGenerating(false)
        }
      })()
    }

    let usedIdle = false
    let idleOrTimerId = 0
    if (typeof window.requestIdleCallback === 'function') {
      usedIdle = true
      idleOrTimerId = window.requestIdleCallback(runPrewarm, {
        timeout: 1200,
      })
    } else {
      idleOrTimerId = window.setTimeout(runPrewarm, 0)
    }

    return () => {
      cancelled = true
      if (usedIdle) window.cancelIdleCallback(idleOrTimerId)
      else window.clearTimeout(idleOrTimerId)
    }
  }, [open, record, fields, productCatalog, cacheKey])

  const doSave = async () => {
    setBusy(true)
    try {
      const hit = blobCacheRef.current
      let blob: Blob | null =
        hit && hit.key === cacheKey ? hit.blob : null
      if (!blob) {
        blob = await renderSingleReceiptBillBlob({
          record,
          fields,
          productCatalog,
        })
      }
      if (!blob) throw new Error('生成图片失败')

      const name = `kuaiji-receipt-${record.id.slice(0, 8)}-${Date.now()}${receiptImageExt}`
      const file = new File([blob], name, { type: receiptImageMime })

      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({ files: [file], title: '记账小票' })
        } catch (shareErr) {
          if (!isShareDismissedByUser(shareErr)) throw shareErr
        }
        return
      }

      if (Capacitor.isNativePlatform()) {
        const reader = new FileReader()
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const s = reader.result as string
            const i = s.indexOf(',')
            resolve(i >= 0 ? s.slice(i + 1) : s)
          }
          reader.onerror = () => reject(new Error('读取图片失败'))
          reader.readAsDataURL(blob)
        })
        await Filesystem.writeFile({
          path: name,
          data: base64,
          directory: Directory.Cache,
        })
        const uriResult = await Filesystem.getUri({
          directory: Directory.Cache,
          path: name,
        })
        try {
          await Share.share({
            title: '记账小票',
            text: '分享图片：请在分享面板中选择相册或文件管理',
            url: uriResult.uri,
            dialogTitle: '分享小票',
          })
        } catch (shareErr) {
          if (!isShareDismissedByUser(shareErr)) throw shareErr
        }
        return
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      if (!isShareDismissedByUser(e)) {
        alert(e instanceof Error ? e.message : '分享失败')
      }
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

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
            <h2 className="text-base font-bold text-kj-primary">小票预览</h2>
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
            {generating && !previewUrl ? (
              <div className="flex h-40 items-center justify-center text-sm text-kj-muted">
                正在生成预览…
              </div>
            ) : previewUrl ? (
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                className="mx-auto block w-full max-w-[min(100%,390px)] cursor-zoom-in overflow-hidden rounded-xl border border-kj-border/80 bg-[#f7f4ef] shadow-sm"
                aria-label="全屏查看小票"
              >
                <img
                  src={previewUrl}
                  alt="记账小票预览"
                  className="block w-full"
                  draggable={false}
                />
              </button>
            ) : (
              <div className="flex h-40 items-center justify-center text-sm text-kj-muted">
                预览生成失败，请重试
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-kj-border/80 px-4 py-3">
            <button
              type="button"
              disabled={busy || generating || !previewUrl}
              onClick={() => void doSave()}
              className="w-full rounded-xl bg-[#2ecc71] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? '处理中…' : '分享图片'}
            </button>
          </div>
        </div>
      </div>

      {fullscreen && previewUrl ? (
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
              alt="记账小票全屏"
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
