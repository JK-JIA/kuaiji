import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { FieldDef, LedgerRecord } from '../types'
import { captureReceiptJpegBlob } from '../utils/receiptCapture'
import {
  getReceiptCaptureScale,
  receiptImageExt,
  receiptImageMime,
} from '../utils/receiptExport'
import {
  expandProductLines,
  getAmountFieldId,
  getExpectedAmount,
  getPlateValue,
  getReceivedAmount,
  getUnitPriceFieldId,
  parseMoney,
} from '../utils/recordHelpers'

const PERMISSION_HINT_KEY = 'kuaiji_receipt_save_hint_seen'

type Props = {
  open: boolean
  onClose: () => void
  record: LedgerRecord
  fields: FieldDef[]
}

function fmtMoney(n: number): string {
  const x = Math.round(n * 100) / 100
  return Number.isInteger(x) ? String(x) : x.toFixed(2)
}

/** 用户在系统分享面板点「取消/关闭」时，Web / Capacitor 会抛错，不应当失败提示 */
function isShareDismissedByUser(e: unknown): boolean {
  if (
    e &&
    typeof e === 'object' &&
    'name' in e &&
    (e as { name: string }).name === 'AbortError'
  ) {
    return true
  }
  const msg = e instanceof Error ? e.message : String(e)
  const lower = msg.toLowerCase()
  return (
    lower.includes('abort') ||
    lower.includes('cancel') ||
    lower.includes('cancelled') ||
    lower.includes('canceled') ||
    lower.includes('dismiss') ||
    lower.includes('user canceled')
  )
}

export function ReceiptModal({ open, onClose, record, fields }: Props) {
  const captureRef = useRef<HTMLDivElement>(null)
  /** 打开预览后在空闲时预生成，保存时直出以接近 1s 内完成 */
  const receiptBlobCacheRef = useRef<{ key: string; blob: Blob } | null>(null)
  const [busy, setBusy] = useState(false)
  const [explainOpen, setExplainOpen] = useState(false)
  const [pendingSave, setPendingSave] = useState(false)

  const amountId = getAmountFieldId(fields)
  const unitPriceId = getUnitPriceFieldId(fields)
  const lines = expandProductLines(record, fields)
  const plate = getPlateValue(record, fields) || '—'
  const exp = getExpectedAmount(record, amountId)
  const rec = getReceivedAmount(record, exp)
  const created = new Date(record.createdAt)

  /** 打开预览时尽量先完成字体就绪，并在空闲时预生成 JPEG，减轻点击「保存」等待 */
  useEffect(() => {
    if (!open) {
      receiptBlobCacheRef.current = null
      return
    }

    let cancelled = false
    const cacheKey = `${record.id}:${record.createdAt}`

    const runPrewarm = () => {
      void (async () => {
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        )
        if (cancelled) return
        const el = captureRef.current
        if (!el) return
        try {
          await document.fonts?.ready?.catch(() => {})
          if (cancelled) return
          const scale = getReceiptCaptureScale()
          const blob = await captureReceiptJpegBlob(el, scale)
          if (cancelled || !blob) return
          receiptBlobCacheRef.current = { key: cacheKey, blob }
        } catch {
          if (!cancelled) receiptBlobCacheRef.current = null
        }
      })()
    }

    let usedIdle = false
    let idleOrTimerId = 0
    if (typeof window.requestIdleCallback === 'function') {
      usedIdle = true
      idleOrTimerId = window.requestIdleCallback(runPrewarm, {
        timeout: 2500,
      })
    } else {
      idleOrTimerId = window.setTimeout(runPrewarm, 400)
    }

    return () => {
      cancelled = true
      if (usedIdle) window.cancelIdleCallback(idleOrTimerId)
      else window.clearTimeout(idleOrTimerId)
    }
  }, [open, record.id, record.createdAt])

  const doSave = async () => {
    const el = captureRef.current
    if (!el) return
    setBusy(true)
    try {
      const cacheKey = `${record.id}:${record.createdAt}`
      const hit = receiptBlobCacheRef.current
      let blob: Blob | null =
        hit && hit.key === cacheKey ? hit.blob : null
      if (!blob) {
        const scale = getReceiptCaptureScale()
        blob = await captureReceiptJpegBlob(el, scale)
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
            text: '保存图片：请在分享面板中选择相册或文件管理',
            url: uriResult.uri,
            dialogTitle: '保存 / 分享小票',
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
        alert(e instanceof Error ? e.message : '保存失败')
      }
    } finally {
      setBusy(false)
    }
  }

  const startSave = () => {
    try {
      if (!localStorage.getItem(PERMISSION_HINT_KEY)) {
        setExplainOpen(true)
        setPendingSave(true)
        return
      }
    } catch {
      /* ignore */
    }
    void doSave()
  }

  const onConfirmExplain = () => {
    try {
      localStorage.setItem(PERMISSION_HINT_KEY, '1')
    } catch {
      /* ignore */
    }
    setExplainOpen(false)
    if (pendingSave) {
      setPendingSave(false)
      void doSave()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/50">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="关闭"
        onClick={onClose}
      />
      <div className="relative max-h-[90dvh] overflow-y-auto rounded-t-2xl bg-white px-4 pb-8 pt-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-neutral-900">小票预览</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-[#666666]"
          >
            关闭
          </button>
        </div>

        {/* 截图区域仅用 hex/rgb 内联色：html2canvas 无法解析 Tailwind v4 的 oklch() */}
        <div
          ref={captureRef}
          style={{
            width: 280,
            margin: '0 auto',
            boxSizing: 'border-box',
            border: '1px dashed #d6d3d1',
            backgroundColor: '#ffffff',
            padding: '20px 16px',
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 12,
            lineHeight: 1.625,
            color: '#171717',
            boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.06)',
          }}
        >
          <p
            style={{
              textAlign: 'center',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.2em',
              margin: 0,
            }}
          >
            kuaiji
          </p>
          <p
            style={{
              marginTop: 4,
              textAlign: 'center',
              fontSize: 12,
              color: '#666666',
            }}
          >
            记账小票
          </p>
          <div
            style={{
              margin: '12px 0',
              borderTop: '1px dashed #d6d3d1',
            }}
          />
          <p style={{ margin: 0 }}>日期 {record.date}</p>
          <p style={{ margin: 0 }}>
            时间 {format(created, 'HH:mm', { locale: zhCN })}
          </p>
          <p style={{ margin: 0 }}>车牌 {plate}</p>
          <div
            style={{
              margin: '8px 0',
              borderTop: '1px dashed #e7e5e4',
            }}
          />
          {lines.map((line, i) => {
            const amt = parseMoney(line.lineAmountStr)
            const up = parseMoney(line.unitPriceStr)
            return (
              <div key={`ln-${i}`} style={{ marginBottom: 6 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {line.product || '—'}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: '#666666' }}>
                  {unitPriceId && up > 0 ? `单价 ¥${fmtMoney(up)} · ` : ''}
                  斤数 {line.quantity || '—'}
                  {amt > 0 ? ` · 小计 ¥${fmtMoney(amt)}` : ''}
                </p>
              </div>
            )
          })}
          <div
            style={{
              margin: '8px 0',
              borderTop: '1px dashed #e7e5e4',
            }}
          />
          {amountId ? (
            <>
              <p style={{ margin: 0 }}>应收 ¥{fmtMoney(exp)}</p>
              <p style={{ margin: 0 }}>已收 ¥{fmtMoney(rec)}</p>
            </>
          ) : null}
          <p
            style={{
              marginTop: 8,
              marginBottom: 0,
              textAlign: 'center',
              fontSize: 12,
              color: '#999999',
            }}
          >
            由 kuaiji 生成 · 仅供参考
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => startSave()}
            className="flex-1 rounded-xl bg-[#2ecc71] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? '处理中…' : '保存图片'}
          </button>
        </div>
      </div>

      {explainOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
          <div className="max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-sm font-bold text-neutral-900">保存小票说明</p>
            <p className="mt-2 text-xs leading-relaxed text-[#666666]">
              将生成 JPEG 图片（体积小、保存更快）。在安卓上会通过系统「分享」面板保存到相册或文件；首次使用请允许存储/分享相关权限。若未出现相册选项，可选择「保存到文件」或使用截图。需要更清晰可在设置中开启「高清导出」。
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setExplainOpen(false)
                  setPendingSave(false)
                }}
                className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-[#666666]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onConfirmExplain}
                className="flex-1 rounded-xl bg-[#2ecc71] py-2.5 text-sm font-semibold text-white"
              >
                继续
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
