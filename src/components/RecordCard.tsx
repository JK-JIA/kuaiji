import type { FieldDef, LedgerRecord } from '../types'
import {
  expandProductLines,
  formatQuantityWithJin,
  getAmountFieldId,
  getExpectedAmount,
  getOutstanding,
  getReceivedAmount,
  isRecordFullyPaid,
} from '../utils/recordHelpers'

type Props = {
  record: LedgerRecord
  fields: FieldDef[]
  onEdit?: (record: LedgerRecord) => void
  onDelete?: (id: string) => void
  /** 首页右侧核账，弹出收款录入 */
  onReconcile?: (record: LedgerRecord) => void
}

export function RecordCard({
  record,
  fields,
  onEdit,
  onDelete,
  onReconcile,
}: Props) {
  const amountId = getAmountFieldId(fields)
  const exp = getExpectedAmount(record, amountId)
  const rec = getReceivedAmount(record, exp)
  const out = getOutstanding(exp, rec)
  const fullyPaid = isRecordFullyPaid(record, fields)

  const ordered = [...fields].sort((a, b) => a.order - b.order)
  const lines = expandProductLines(record, fields)
  const amountResolvedId = amountId
  const extraFields = ordered.filter(
    (f) =>
      f.key !== 'product' &&
      f.key !== 'quantity' &&
      f.key !== 'amount' &&
      f.id !== amountResolvedId,
  )

  return (
    <div
      className={`rounded-lg border text-left ${
        fullyPaid
          ? 'border-stone-200 bg-stone-100/95 opacity-[0.72]'
          : 'border-stone-200 bg-white'
      }`}
    >
      <div className="flex items-start gap-2 px-2 py-1.5 sm:px-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] leading-tight text-stone-500">
            <span className="tabular-nums">
              {new Date(record.createdAt).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            {fullyPaid && (
              <span className="rounded bg-stone-300/80 px-1.5 py-px text-[10px] text-stone-700">
                已结清
              </span>
            )}
            {!fullyPaid && exp > 0 && out > 0 && (
              <span className="rounded bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-900">
                未收 ¥{fmt(out)}
              </span>
            )}
            {!fullyPaid && exp <= 0 && record.settled !== true && (
              <span className="rounded bg-stone-200/90 px-1.5 py-px text-[10px] text-stone-600">
                待核账
              </span>
            )}
          </div>
          <div className="mt-1 space-y-1">
            {lines.map((line, i) => (
              <div
                key={`${record.id}-ln-${i}`}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-0 text-[13px] leading-snug"
              >
                <span className="font-medium text-stone-900">
                  {line.product || '—'}
                </span>
                <span className="tabular-nums text-stone-700">
                  {formatQuantityWithJin(line.quantity)}
                </span>
              </div>
            ))}
          </div>

          {amountId && exp > 0 && (
            <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] tabular-nums text-stone-600">
              <span>
                <span className="text-stone-400">应收</span>¥{fmt(exp)}
              </span>
              <span>
                <span className="text-stone-400">已收</span>
                <span className="text-emerald-700">¥{fmt(rec)}</span>
              </span>
              {out > 0 && (
                <span className="font-medium text-amber-800">
                  <span className="font-normal text-stone-400">未收</span>¥
                  {fmt(out)}
                </span>
              )}
            </div>
          )}

          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-stone-600">
            {extraFields.map((f) => {
              const v = record.values[f.id]
              if (v === undefined || v === '') return null
              return (
                <span key={f.id}>
                  <span className="text-stone-400">{f.name}</span>
                  {v}
                </span>
              )
            })}
          </div>
        </div>

        <div className="flex w-[4.25rem] shrink-0 flex-col items-stretch gap-1.5">
          <div className="flex justify-end gap-0.5">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(record)
                }}
                className="rounded px-1.5 py-0.5 text-[11px] text-stone-600 hover:bg-stone-100"
              >
                编辑
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(record.id)
                }}
                className="rounded px-1.5 py-0.5 text-[11px] text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                删除
              </button>
            )}
          </div>
          {onReconcile && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onReconcile(record)
              }}
              className="rounded-md bg-emerald-600 px-2 py-1.5 text-center text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 active:bg-emerald-800"
            >
              {fullyPaid ? '改核账' : '核账'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function fmt(n: number): string {
  const x = Math.round(n * 100) / 100
  return Number.isInteger(x) ? String(x) : x.toFixed(2)
}
