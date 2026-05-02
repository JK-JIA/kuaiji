import { useRef, useState } from 'react'
import type { FieldDef, LedgerRecord } from '../types'
import { expandProductLines } from '../utils/recordHelpers'

type Props = {
  record: LedgerRecord
  fields: FieldDef[]
  onEdit?: (record: LedgerRecord) => void
  onDelete?: (id: string) => void
  onToggleSettled?: (id: string, settled: boolean) => void
}

const SWIPE_WIDTH = 52

export function RecordCard({
  record,
  fields,
  onEdit,
  onDelete,
  onToggleSettled,
}: Props) {
  const settled = record.settled === true
  const ordered = [...fields].sort((a, b) => a.order - b.order)
  const lines = expandProductLines(record, fields)
  const extraFields = ordered.filter(
    (f) => f.key !== 'product' && f.key !== 'quantity',
  )

  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef(0)
  const dragXRef = useRef(0)
  const dragging = useRef(false)

  const onPointerDown = (e: React.PointerEvent) => {
    if (settled || !onToggleSettled) return
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    dragging.current = true
    setIsDragging(true)
    dragStart.current = e.clientX - dragXRef.current
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || settled || !onToggleSettled) return
    let nx = e.clientX - dragStart.current
    if (nx > 0) nx = 0
    if (nx < -SWIPE_WIDTH) nx = -SWIPE_WIDTH
    dragXRef.current = nx
    setDragX(nx)
  }

  const endDrag = () => {
    if (!dragging.current) return
    dragging.current = false
    setIsDragging(false)
    if (dragXRef.current < -SWIPE_WIDTH / 2 && onToggleSettled) {
      onToggleSettled(record.id, true)
    }
    dragXRef.current = 0
    setDragX(0)
  }

  return (
    <div
      className={`relative overflow-hidden rounded-lg border text-left ${
        settled
          ? 'border-stone-200 bg-stone-100/95 opacity-[0.72]'
          : 'border-stone-200 bg-white'
      }`}
    >
      {!settled && onToggleSettled && (
        <div
          className="absolute inset-y-0 right-0 flex w-[52px] items-center justify-center bg-emerald-600"
          style={{ zIndex: 0 }}
        >
          <button
            type="button"
            className="text-[11px] font-medium text-white"
            onClick={(e) => {
              e.stopPropagation()
              onToggleSettled(record.id, true)
            }}
          >
            核销
          </button>
        </div>
      )}

      <div
        className={`relative z-[1] touch-pan-y transition-[colors] ${
          settled ? '' : 'bg-white'
        }`}
        style={{
          transform: `translateX(${dragX}px)`,
          transition: isDragging ? 'none' : 'transform 0.18s ease-out',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
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
              {settled && (
                <span className="rounded bg-stone-300/80 px-1.5 py-px text-[10px] text-stone-700">
                  已核销
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
                    {line.quantity || '—'}
                  </span>
                </div>
              ))}
            </div>
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

          <div className="flex shrink-0 flex-col items-end gap-1">
            {!settled && onToggleSettled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleSettled(record.id, true)
                }}
                className="hidden rounded-md px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 sm:block"
              >
                核销
              </button>
            )}
            {settled && onToggleSettled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleSettled(record.id, false)
                }}
                className="rounded-md px-1.5 py-0.5 text-[10px] text-stone-500 hover:bg-stone-200/80"
              >
                取消核销
              </button>
            )}
            <div className="flex gap-0.5">
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
          </div>
        </div>
      </div>
    </div>
  )
}
