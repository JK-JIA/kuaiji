import { useEffect, useMemo, useState } from 'react'
import type { FieldDef, LedgerRecord } from '../types'
import {
  allocateBulkReconcilePayment,
  type BulkReconcileAllocation,
} from '../utils/bulkReconcile'
import {
  parseNonNegativeMoney,
  sanitizeUnsignedDecimalInput,
} from '../utils/recordHelpers'

type Props = {
  open: boolean
  buyerLabel: string
  pendingRecords: LedgerRecord[]
  fields: FieldDef[]
  totalOutstanding: number
  pendingCount: number
  onClose: () => void
  onConfirm: (paymentAmount: number, allocations: BulkReconcileAllocation[]) => void | Promise<void>
}

export function BulkReconcileModal({
  open,
  buyerLabel,
  pendingRecords,
  fields,
  totalOutstanding,
  pendingCount,
  onClose,
  onConfirm,
}: Props) {
  const [paymentInput, setPaymentInput] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setPaymentInput(totalOutstanding > 0 ? String(totalOutstanding) : '')
    setBusy(false)
  }, [open, totalOutstanding, buyerLabel])

  const paymentAmount = useMemo(
    () => parseNonNegativeMoney(paymentInput),
    [paymentInput],
  )

  const allocations = useMemo(
    () =>
      open
        ? allocateBulkReconcilePayment(pendingRecords, fields, paymentAmount)
        : [],
    [open, pendingRecords, fields, paymentAmount],
  )

  const allocatedTotal = useMemo(
    () =>
      Math.round(
        allocations.reduce((sum, item) => sum + item.allocated, 0) * 100,
      ) / 100,
    [allocations],
  )

  const fullCount = allocations.filter((item) => item.fullySettled).length
  const partialItem = allocations.find((item) => !item.fullySettled) ?? null

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (paymentAmount <= 0 || allocations.length === 0) return
    setBusy(true)
    try {
      await onConfirm(paymentAmount, allocations)
      onClose()
    } finally {
      setBusy(false)
    }
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
        onSubmit={(e) => void handleSubmit(e)}
        className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-kj-border-strong bg-kj-surface p-5 shadow-xl sm:rounded-2xl"
      >
        <h3 className="text-lg font-semibold text-kj-primary">客户核账</h3>
        <p className="mt-1 text-xs text-stone-500">
          按记账日从最早账单起依次核账；余款不足时最后一单只核部分。
        </p>

        <div className="mt-4 space-y-3 text-left text-sm">
          <div className="rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-2.5">
            <p className="text-xs text-kj-muted">客户</p>
            <p className="mt-0.5 font-medium text-kj-primary">{buyerLabel}</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 tabular-nums">
              <span>
                <span className="text-kj-muted">未结清 </span>
                <span className="font-medium text-kj-primary">{pendingCount} 笔</span>
              </span>
              <span>
                <span className="text-kj-muted">总欠款 </span>
                <span className="font-semibold text-amber-700">¥{fmt(totalOutstanding)}</span>
              </span>
            </div>
          </div>

          <label className="block">
            <span className="text-stone-600">
              本次收款（元）
              {totalOutstanding > 0 && (
                <span className="ml-1 font-normal text-kj-muted">
                  （最多 ¥{fmt(totalOutstanding)}）
                </span>
              )}
            </span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              disabled={totalOutstanding <= 0}
              value={paymentInput}
              spellCheck={false}
              onChange={(e) => {
                const raw = sanitizeUnsignedDecimalInput(e.target.value)
                if (raw === '') {
                  setPaymentInput('')
                  return
                }
                const n = parseNonNegativeMoney(raw)
                if (totalOutstanding > 0) {
                  setPaymentInput(String(Math.min(totalOutstanding, n)))
                } else {
                  setPaymentInput(String(n))
                }
              }}
              placeholder="0"
              className="mt-1 w-full rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-2 tabular-nums text-kj-primary disabled:bg-stone-50 disabled:text-kj-muted"
            />
          </label>

          {totalOutstanding > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPaymentInput(String(totalOutstanding))}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
              >
                全部结清
              </button>
            </div>
          )}

          {paymentAmount > 0 && allocations.length > 0 && (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2.5 text-xs leading-relaxed text-amber-950">
              <p>
                本次将核账 <span className="font-semibold">{allocations.length}</span> 笔，合计
                ¥{fmt(allocatedTotal)}
                {fullCount > 0 && (
                  <>
                    ，其中 <span className="font-semibold">{fullCount}</span> 笔将结清
                  </>
                )}
                {partialItem && (
                  <>
                    ；{partialItem.date} 一单部分核账 ¥{fmt(partialItem.allocated)}
                  </>
                )}
                。
              </p>
              {paymentAmount > allocatedTotal + 0.005 && (
                <p className="mt-1 text-amber-800/90">
                  收款超出可核账欠款 ¥{fmt(paymentAmount - allocatedTotal)}，超出部分不会写入账单。
                </p>
              )}
            </div>
          )}

          {paymentAmount > 0 && allocations.length === 0 && (
            <p className="text-xs text-rose-600">当前没有可核账的未结清账单。</p>
          )}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl border border-kj-border-strong py-2.5 text-stone-700"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={busy || paymentAmount <= 0 || allocations.length === 0}
            className="flex-1 rounded-xl bg-stone-900 py-2.5 font-medium text-white disabled:opacity-50"
          >
            确定核账
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
