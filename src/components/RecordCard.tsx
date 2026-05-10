import { useCallback, useRef, useState } from 'react'
import type { FieldDef, LedgerRecord } from '../types'
import { ReceiptModal } from './ReceiptModal'
import {
  expandProductLines,
  formatQuantityWithJin,
  getAmountFieldId,
  getExpectedAmount,
  getOutstanding,
  getPlateValue,
  getReceivedAmount,
  getUnitPriceFieldId,
  isRecordFullyPaid,
  parseMoney,
} from '../utils/recordHelpers'

const DELETE_STRIP_W = 72
/** 无单价列：商品 / 数量 / 金额（左侧无图标列，商品列可更宽） */
const RECORD_LINE_GRID_3 =
  'grid grid-cols-[minmax(0,1fr)_5rem_minmax(7rem,max-content)] items-center gap-x-4'
/** 含单价：商品 / 单价 / 斤数 / 金额 */
const RECORD_LINE_GRID_4 =
  'grid grid-cols-[minmax(0,1fr)_3.25rem_3.5rem_minmax(6.5rem,max-content)] items-center gap-x-4'

type Props = {
  record: LedgerRecord
  fields: FieldDef[]
  onEdit?: (record: LedgerRecord) => void
  onDelete?: (id: string) => void
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
  const unitPriceFieldId = getUnitPriceFieldId(fields)
  const lineGrid =
    unitPriceFieldId && amountId ? RECORD_LINE_GRID_4 : RECORD_LINE_GRID_3
  const plateField = ordered.find((f) => f.key === 'plate')
  const unitPriceColLabel =
    ordered.find((f) => f.key === 'unitPrice')?.name ?? '单价'
  const quantityColLabel =
    ordered.find((f) => f.key === 'quantity')?.name ?? '数量'
  const plateDisplay = getPlateValue(record, fields)

  const extraFields = ordered.filter(
    (f) =>
      f.key !== 'product' &&
      f.key !== 'unitPrice' &&
      f.key !== 'quantity' &&
      f.key !== 'plate' &&
      f.key !== 'amount' &&
      f.id !== amountResolvedId,
  )

  const hasDeal =
    record.dealAmount !== undefined &&
    !Number.isNaN(record.dealAmount) &&
    record.dealAmount >= 0

  const displayTotal = hasDeal ? record.dealAmount! : exp

  const savedVsReceivable =
    exp > displayTotal + 0.005
      ? Math.round((exp - displayTotal) * 100) / 100
      : 0

  const showMoney = Boolean(amountId)

  const [slide, setSlide] = useState(0)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const panRef = useRef({ startX: 0, startY: 0, startSlide: 0 })
  const activePointer = useRef<number | null>(null)
  const dragging = useRef(false)
  const suppressClickRef = useRef(false)
  const surfaceRef = useRef<HTMLDivElement | null>(null)

  const clampSlide = useCallback((v: number) => {
    if (!onDelete) return 0
    return Math.max(-DELETE_STRIP_W, Math.min(0, v))
  }, [onDelete])

  const snapSlide = useCallback(
    (v: number) => {
      if (!onDelete) return 0
      return v < -DELETE_STRIP_W / 2 ? -DELETE_STRIP_W : 0
    },
    [onDelete],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    if (!onDelete || e.button !== 0) return
    suppressClickRef.current = false
    activePointer.current = e.pointerId
    dragging.current = false
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startSlide: slide,
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!onDelete || activePointer.current !== e.pointerId) return
    const dx = e.clientX - panRef.current.startX
    const dy = e.clientY - panRef.current.startY
    if (!dragging.current) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) + 8) {
        dragging.current = true
        setDragActive(true)
        try {
          surfaceRef.current?.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      } else {
        return
      }
    }
    const next = clampSlide(panRef.current.startSlide + dx)
    setSlide(next)
  }

  const endPointer = (e: React.PointerEvent) => {
    if (activePointer.current !== e.pointerId) return
    const wasDragging = dragging.current
    const el = surfaceRef.current
    if (el?.hasPointerCapture(e.pointerId)) {
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    activePointer.current = null
    setDragActive(false)
    if (wasDragging) {
      suppressClickRef.current = true
    }
    if (dragging.current) {
      setSlide((s) => snapSlide(s))
    }
    dragging.current = false
  }

  const confirmDelete = () => {
    onDelete?.(record.id)
    setDeleteConfirm(false)
    setSlide(0)
  }

  const openReconcile = (e: React.SyntheticEvent) => {
    e.stopPropagation()
    setSlide(0)
    onReconcile?.(record)
  }

  const handleCardActivate = () => {
    if (!onEdit) return
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    if (slide < -8) {
      setSlide(0)
      return
    }
    setSlide(0)
    onEdit(record)
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {onDelete && (
        <div
          className="absolute inset-y-0 right-0 z-0 flex"
          style={{ width: DELETE_STRIP_W }}
        >
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation()
              setDeleteConfirm(true)
            }}
            className="flex w-full items-center justify-center bg-rose-600 text-xs font-semibold text-white active:bg-rose-700"
          >
            删除
          </button>
        </div>
      )}

      <div
        ref={surfaceRef}
        className={`relative z-10 rounded-2xl border text-left ${
          dragActive ? '' : 'transition-[transform] duration-200 ease-out'
        } ${
          fullyPaid
            ? 'border-stone-200 bg-stone-100'
            : 'border-stone-200 bg-white'
        } ${
          onEdit
            ? 'cursor-pointer'
            : onDelete
              ? 'cursor-grab active:cursor-grabbing'
              : ''
        } shadow-sm`}
        style={{
          transform: onDelete ? `translateX(${slide}px)` : undefined,
          touchAction: onDelete ? 'pan-y' : undefined,
        }}
        tabIndex={onEdit ? 0 : undefined}
        aria-label={onEdit ? '编辑此账单' : undefined}
        onClick={onEdit ? handleCardActivate : undefined}
        onKeyDown={
          onEdit
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleCardActivate()
                }
              }
            : undefined
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <div className="px-4 py-3">
          {showMoney && (
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium tabular-nums text-neutral-900">
                    {new Date(record.createdAt).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <CardStatusBadges
                    fullyPaid={fullyPaid}
                    exp={exp}
                    out={out}
                    settled={record.settled === true}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setReceiptOpen(true)
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="ml-auto shrink-0 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-semibold text-[#666666] hover:bg-stone-50"
                  >
                    发票
                  </button>
                </div>
                {amountResolvedId &&
                  (exp > 0.005 || rec > 0.005 || fullyPaid) && (
                    <p className="mt-1.5 text-xs font-medium tabular-nums leading-snug text-[#666666]">
                      应收 ¥{fmt(exp)} · 已收 ¥{fmt(rec)} · 差额 ¥{fmt(out)}
                    </p>
                  )}
                <div className="mt-2 min-w-0 space-y-2">
                  <div className="min-w-0 w-full">
                    <div className="min-w-0">
                      <div className={lineGrid}>
                        <span className="min-w-0 border-b border-stone-100 pb-2 pr-1 text-xs font-medium text-[#666666]">
                          商品
                        </span>
                        {unitPriceFieldId ? (
                          <span className="border-b border-stone-100 pb-2 text-center text-xs font-medium tabular-nums text-[#666666]">
                            {unitPriceColLabel}
                          </span>
                        ) : null}
                        <span className="border-b border-stone-100 pb-2 text-right text-xs font-medium tabular-nums text-[#666666]">
                          {quantityColLabel}
                        </span>
                        <span className="border-b border-stone-100 pb-2 text-right text-xs font-medium tabular-nums text-[#666666]">
                          金额
                        </span>
                        {lines.flatMap((line, i) => {
                          const lineAmt = parseMoney(line.lineAmountStr)
                          const up = parseMoney(line.unitPriceStr)
                          const k = `${record.id}-ln-${i}`
                          return [
                            <span
                              key={`${k}-p`}
                              className="min-w-0 break-words py-2 text-sm font-medium leading-snug text-neutral-900"
                            >
                              {line.product || '—'}
                            </span>,
                            ...(unitPriceFieldId
                              ? [
                                  <span
                                    key={`${k}-u`}
                                    className="whitespace-nowrap py-2 text-center text-sm tabular-nums leading-snug text-[#444444]"
                                  >
                                    {up > 0 ? `¥${fmt(up)}` : '—'}
                                  </span>,
                                ]
                              : []),
                            <span
                              key={`${k}-q`}
                              className="whitespace-nowrap py-2 text-right text-sm tabular-nums leading-snug text-[#444444]"
                            >
                              {formatQuantityWithJin(line.quantity)}
                            </span>,
                            <span
                              key={`${k}-a`}
                              className="whitespace-nowrap py-2 text-right text-sm font-semibold tabular-nums leading-snug text-neutral-900"
                            >
                              {lineAmt > 0 ? `¥${fmt(lineAmt)}` : '—'}
                            </span>,
                          ]
                        })}
                      </div>
                    </div>
                    <div className="mt-2">
                      <ExtraFieldsPlateLine
                        extraFields={extraFields}
                        values={record.values}
                      />
                    </div>
                  </div>

                  {(plateField ||
                    displayTotal > 0 ||
                    savedVsReceivable > 0 ||
                    onReconcile) && (
                    <div className="border-t border-stone-100/80 pt-2">
                      <div
                        className={
                          unitPriceFieldId
                            ? 'grid grid-cols-4 items-center gap-x-4'
                            : lineGrid
                        }
                      >
                        <div
                          className={`min-w-0 text-xs leading-snug text-[#666666] ${
                            unitPriceFieldId ? 'col-span-2' : ''
                          }`}
                        >
                          {plateField ? (
                            <span className="break-all">
                              <span className="text-[#999999]">
                                {plateField.name}
                              </span>
                              {plateDisplay || '—'}
                            </span>
                          ) : (
                            <span className="text-[#999999]">—</span>
                          )}
                        </div>
                        <div className="text-right">
                          {displayTotal > 0 ? (
                            <span className="text-xs font-medium tabular-nums text-[#666666]">
                              总价
                            </span>
                          ) : null}
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                          {displayTotal > 0 ? (
                            <span className="text-sm font-semibold tabular-nums text-neutral-900">
                              ¥{fmt(displayTotal)}
                            </span>
                          ) : null}
                          {onReconcile ? (
                            <button
                              type="button"
                              onClick={openReconcile}
                              onPointerDown={(e) => e.stopPropagation()}
                              className="shrink-0 whitespace-nowrap rounded-lg bg-[#2ecc71] px-3 py-1.5 text-xs font-semibold leading-none text-white shadow-sm hover:bg-[#27ae60] active:bg-[#22a85a]"
                            >
                              {fullyPaid ? '改核账' : '核账'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {savedVsReceivable > 0 && (
                        <div className="mt-1.5 border-t border-stone-50 pt-1.5">
                          <span className="text-xs font-medium tabular-nums text-[#2ecc71]">
                            已优惠 ¥{fmt(savedVsReceivable)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
            </div>
          )}

          {!showMoney && (
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium tabular-nums text-neutral-900">
                    {new Date(record.createdAt).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <CardStatusBadges
                    fullyPaid={fullyPaid}
                    exp={exp}
                    out={out}
                    settled={record.settled === true}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setReceiptOpen(true)
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="ml-auto shrink-0 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs font-semibold text-[#666666] hover:bg-stone-50"
                  >
                    发票
                  </button>
                </div>
                {amountResolvedId &&
                  (exp > 0.005 || rec > 0.005 || fullyPaid) && (
                    <p className="mt-1.5 text-xs font-medium tabular-nums leading-snug text-[#666666]">
                      应收 ¥{fmt(exp)} · 已收 ¥{fmt(rec)} · 差额 ¥{fmt(out)}
                    </p>
                  )}
                <div className="mt-2 min-w-0 space-y-2">
                  <div className="space-y-2 text-sm leading-snug text-neutral-900">
                    {lines.map((line, i) => (
                      <div key={`${record.id}-ln-${i}`} className="min-w-0 break-words">
                        <span className="font-medium">{line.product || '—'}</span>
                        <span className="ml-2 tabular-nums text-[#666666]">
                          {formatQuantityWithJin(line.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <ExtraFieldsPlateLine
                      extraFields={extraFields}
                      values={record.values}
                    />
                  </div>
                  {plateField && (
                    <div className="border-t border-stone-100/80 pt-2">
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <div className="min-w-0 flex-1 text-xs leading-snug text-[#666666]">
                          <span className="break-all">
                            <span className="text-[#999999]">{plateField.name}</span>
                            {plateDisplay || '—'}
                          </span>
                        </div>
                        {onReconcile ? (
                          <button
                            type="button"
                            onClick={openReconcile}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="shrink-0 whitespace-nowrap rounded-lg bg-[#2ecc71] px-3 py-1.5 text-xs font-semibold leading-none text-white shadow-sm hover:bg-[#27ae60] active:bg-[#22a85a]"
                          >
                            {fullyPaid ? '改核账' : '核账'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  )}
                  {!plateField && onReconcile && (
                    <div className="flex justify-end border-t border-stone-100/80 pt-2">
                      <button
                        type="button"
                        onClick={openReconcile}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="shrink-0 whitespace-nowrap rounded-lg bg-[#2ecc71] px-3 py-1.5 text-xs font-semibold leading-none text-white shadow-sm hover:bg-[#27ae60] active:bg-[#22a85a]"
                      >
                        {fullyPaid ? '改核账' : '核账'}
                      </button>
                    </div>
                  )}
                </div>
            </div>
          )}
        </div>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal
            aria-labelledby="del-confirm-title"
          >
            <p
              id="del-confirm-title"
              className="text-base font-bold text-neutral-900"
            >
              删除账单？
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[#666666]">
              删除后无法恢复，确定要删除这条记录吗？
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirm(false)
                  setSlide(0)
                }}
                className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-[#666666]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => confirmDelete()}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      <ReceiptModal
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        record={record}
        fields={fields}
      />
    </div>
  )
}

function ExtraFieldsPlateLine({
  extraFields,
  values,
}: {
  extraFields: FieldDef[]
  values: Record<string, string>
}) {
  const pairs = extraFields.flatMap((f) => {
    const v = values[f.id]
    if (v === undefined || v === '') return []
    return [{ id: f.id, name: f.name, value: v }]
  })

  if (pairs.length === 0) return null

  return (
    <div className="border-t border-stone-100/90 pt-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs leading-snug">
        {pairs.flatMap(({ id, name, value }) => [
          <span key={`${id}-n`} className="shrink-0 text-[#999999]">
            {name}
          </span>,
          <span key={`${id}-v`} className="min-w-0 break-words text-[#444444]">
            {value}
          </span>,
        ])}
      </div>
    </div>
  )
}

function CardStatusBadges({
  fullyPaid,
  exp,
  out,
  settled,
}: {
  fullyPaid: boolean
  exp: number
  out: number
  settled: boolean
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {fullyPaid && (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium leading-none text-emerald-700">
          已结清
        </span>
      )}
      {!fullyPaid && exp > 0 && out > 0.005 && (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium leading-none text-amber-900">
          未结清
        </span>
      )}
      {!fullyPaid && exp <= 0 && !settled && (
        <span className="rounded-full bg-stone-200/90 px-2 py-0.5 text-xs font-medium leading-none text-stone-700">
          待核账
        </span>
      )}
    </span>
  )
}

function fmt(n: number): string {
  const x = Math.round(n * 100) / 100
  return Number.isInteger(x) ? String(x) : x.toFixed(2)
}
