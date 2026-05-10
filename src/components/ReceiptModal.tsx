import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import html2canvas from 'html2canvas'
import { useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { FieldDef, LedgerRecord } from '../types'
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

export function ReceiptModal({ open, onClose, record, fields }: Props) {
  const captureRef = useRef<HTMLDivElement>(null)
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

  const doSave = async () => {
    const el = captureRef.current
    if (!el) return
    setBusy(true)
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      )
      if (!blob) throw new Error('生成图片失败')

      const name = `kuaiji-receipt-${record.id.slice(0, 8)}-${Date.now()}.png`
      const file = new File([blob], name, { type: 'image/png' })

      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({ files: [file], title: '记账小票' })
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
        await Share.share({
          title: '记账小票',
          text: '保存图片：请在分享面板中选择相册或文件管理',
          url: uriResult.uri,
          dialogTitle: '保存 / 分享小票',
        })
        return
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失败')
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

        <div
          ref={captureRef}
          className="mx-auto w-[280px] border border-dashed border-stone-300 bg-white px-4 py-5 font-mono text-xs leading-relaxed text-neutral-900 shadow-inner"
        >
          <p className="text-center text-sm font-bold tracking-[0.2em]">kuaiji</p>
          <p className="mt-1 text-center text-xs text-[#666666]">记账小票</p>
          <div className="my-3 border-t border-dashed border-stone-300" />
          <p>日期 {record.date}</p>
          <p>
            时间{' '}
            {format(created, 'HH:mm', { locale: zhCN })}
          </p>
          <p>车牌 {plate}</p>
          <div className="my-2 border-t border-dashed border-stone-200" />
          {lines.map((line, i) => {
            const amt = parseMoney(line.lineAmountStr)
            const up = parseMoney(line.unitPriceStr)
            return (
              <div key={`ln-${i}`} className="mb-1.5">
                <p className="font-semibold">{line.product || '—'}</p>
                <p className="text-xs text-[#666666]">
                  {unitPriceId && up > 0 ? `单价 ¥${fmtMoney(up)} · ` : ''}
                  斤数 {line.quantity || '—'}
                  {amt > 0 ? ` · 小计 ¥${fmtMoney(amt)}` : ''}
                </p>
              </div>
            )
          })}
          <div className="my-2 border-t border-dashed border-stone-200" />
          {amountId ? (
            <>
              <p>应收 ¥{fmtMoney(exp)}</p>
              <p>已收 ¥{fmtMoney(rec)}</p>
            </>
          ) : null}
          <p className="mt-2 text-center text-xs text-[#999999]">
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
            {busy ? '处理中…' : '保存 PNG'}
          </button>
        </div>
      </div>

      {explainOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
          <div className="max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-sm font-bold text-neutral-900">保存小票说明</p>
            <p className="mt-2 text-xs leading-relaxed text-[#666666]">
              将生成 PNG 图片。在安卓上会通过系统「分享」面板保存到相册或文件；首次使用请允许存储/分享相关权限。若未出现相册选项，可选择「保存到文件」或使用截图。
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
