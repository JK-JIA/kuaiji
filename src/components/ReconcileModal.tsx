import { useEffect, useState } from 'react'
import type { FieldDef, LedgerRecord, ReconcilePayload } from '../types'
import {
  getAmountFieldId,
  getExpectedAmount,
  getOutstanding,
  getReceivedAmount,
  parseNonNegativeMoney,
  sanitizeUnsignedDecimalInput,
} from '../utils/recordHelpers'

type Props = {
  open: boolean
  record: LedgerRecord | null
  fields: FieldDef[]
  onClose: () => void
  onConfirm: (id: string, payment: ReconcilePayload) => void
}

export function ReconcileModal({
  open,
  record,
  fields,
  onClose,
  onConfirm,
}: Props) {
  const [thisPay, setThisPay] = useState('')
  const [noAmountSettled, setNoAmountSettled] = useState(false)
  const [busy, setBusy] = useState(false)

  const amountId = getAmountFieldId(fields)
  const exp = record && amountId ? getExpectedAmount(record, amountId) : 0
  /** 无金额字段时 exp=0，仍要读出累计实收 */
  const cur = record ? getReceivedAmount(record, exp) : 0
  const out = getOutstanding(exp, cur)

  useEffect(() => {
    if (!open || !record) return
    setThisPay(out > 0 ? String(out) : '')
    setNoAmountSettled(record.settled === true)
  }, [open, record?.id, out, record])

  if (!open || !record) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const raw = parseNonNegativeMoney(thisPay)
      if (exp > 0) {
        const maxDelta = out > 0 ? out : Math.max(0, exp - cur)
        const delta = Math.min(maxDelta, raw)
        const next = Math.min(exp, cur + delta)
        onConfirm(record.id, { kind: 'amount', cumulativeReceived: next })
      } else {
        const next = cur + raw
        onConfirm(record.id, {
          kind: 'amount',
          cumulativeReceived: next,
          markSettled: noAmountSettled,
        })
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const handleClearReceived = () => {
    if (!record || cur <= 0) return
    if (exp > 0) {
      onConfirm(record.id, { kind: 'amount', cumulativeReceived: 0 })
    } else {
      onConfirm(record.id, {
        kind: 'amount',
        cumulativeReceived: 0,
        markSettled: false,
      })
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-stone-900/30 sm:items-center">
      <div
        className="absolute inset-0"
        aria-hidden
        onClick={() => !busy && onClose()}
      />
      <form
        noValidate
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md rounded-t-3xl border border-stone-200 bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <h3 className="text-lg font-semibold text-stone-900">核账 / 收款</h3>
        <p className="mt-1 text-xs text-stone-500">
          {exp > 0
            ? '填写本次实收：不少于 0，不超过上方「未收」；累计收满应收后本单自动标为已结清（灰色）。'
            : '本单未填应收：填写本次实收（累加进已收）；货款结清可勾选「已结清」使本单变灰。'}
        </p>

        <div className="mt-4 space-y-3 text-left text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums">
            {exp > 0 ? (
              <>
                <span>
                  <span className="text-stone-400">应收 </span>
                  <span className="font-medium text-stone-900">¥{fmt(exp)}</span>
                </span>
                <span>
                  <span className="text-stone-400">已收 </span>
                  <span className="font-medium text-emerald-700">¥{fmt(cur)}</span>
                </span>
                <span>
                  <span className="text-stone-400">未收 </span>
                  <span
                    className={
                      out > 0
                        ? 'font-semibold text-amber-700'
                        : 'text-stone-500'
                    }
                  >
                    ¥{fmt(out)}
                  </span>
                </span>
              </>
            ) : (
              <>
                <span>
                  <span className="text-stone-400">应收 </span>
                  <span className="font-medium text-stone-600">未填</span>
                </span>
                <span>
                  <span className="text-stone-400">已收 </span>
                  <span className="font-medium text-emerald-700">¥{fmt(cur)}</span>
                </span>
              </>
            )}
          </div>

          <label className="block">
            <span className="text-stone-600">
              本次实收（元）
              {exp > 0 && out > 0 && (
                <span className="ml-1 font-normal text-stone-400">
                  （最多 ¥{fmt(out)}）
                </span>
              )}
              {exp <= 0 && (
                <span className="ml-1 font-normal text-stone-400">
                  （累加至已收）
                </span>
              )}
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              disabled={exp > 0 && out <= 0}
              value={thisPay}
              spellCheck={false}
              onChange={(e) => {
                const raw = sanitizeUnsignedDecimalInput(e.target.value)
                if (raw === '') {
                  setThisPay('')
                  return
                }
                const n = parseNonNegativeMoney(raw)
                if (exp > 0 && out > 0) {
                  setThisPay(String(Math.min(out, n)))
                } else if (exp > 0) {
                  setThisPay(String(Math.min(Math.max(0, exp - cur), n)))
                } else {
                  setThisPay(String(n))
                }
              }}
              placeholder={
                exp > 0 && out <= 0 ? '已全部收讫' : '0'
              }
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-stone-900 tabular-nums disabled:bg-stone-50 disabled:text-stone-400"
            />
          </label>

          {exp > 0 && out > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setThisPay(String(out))}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
              >
                全部收到
              </button>
            </div>
          )}

          {exp <= 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-800">
              <input
                type="checkbox"
                checked={noAmountSettled}
                onChange={(e) => setNoAmountSettled(e.target.checked)}
                className="rounded border-stone-300"
              />
              已结清
            </label>
          )}

          {cur > 0 && (
            <button
              type="button"
              onClick={handleClearReceived}
              className="text-xs text-rose-600 underline decoration-rose-200"
            >
              清零已收
            </button>
          )}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-stone-200 py-2.5 text-stone-700"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-xl bg-stone-900 py-2.5 font-medium text-white disabled:opacity-50"
          >
            确定
          </button>
        </div>
      </form>
    </div>
  )
}

function fmt(n: number): string {
  const x = Math.round(n * 100) / 100
  return Number.isInteger(x) ? String(x) : x.toFixed(2)
}
