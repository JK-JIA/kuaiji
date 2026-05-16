import { format, min as minDate, parseISO, subMonths } from 'date-fns'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarPickerModal } from '../../components/CalendarPickerModal'
import { useLedger } from '../../context/LedgerContext'
import { exportCsv } from '../../utils/exportData'

function clampYmd(s: string, min: string, max: string): string {
  if (s < min) return min
  if (s > max) return max
  return s
}

export function BillExportPage() {
  const { ready, records, fields } = useLedger()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [picker, setPicker] = useState<{ which: 'from' | 'to'; draft: string } | null>(
    null,
  )
  const [exporting, setExporting] = useState(false)
  const inited = useRef(false)

  const bounds = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    if (records.length === 0) {
      return { min: todayStr, max: todayStr }
    }
    let minD = records[0].date
    let maxD = records[0].date
    for (const r of records) {
      if (r.date < minD) minD = r.date
      if (r.date > maxD) maxD = r.date
    }
    return { min: minD, max: maxD }
  }, [records])

  useEffect(() => {
    if (!ready || inited.current) return
    inited.current = true
    const today = new Date()
    const todayStr = format(today, 'yyyy-MM-dd')
    const hi = parseISO(`${bounds.max}T12:00:00`)
    const todayLo = parseISO(`${todayStr}T12:00:00`)
    const defaultEnd = format(minDate([hi, todayLo]), 'yyyy-MM-dd')
    const tentativeStart = format(subMonths(parseISO(`${defaultEnd}T12:00:00`), 2), 'yyyy-MM-dd')
    const defaultStart =
      tentativeStart < bounds.min ? bounds.min : tentativeStart
    const start =
      defaultStart > defaultEnd ? bounds.min : defaultStart
    setFrom(clampYmd(start, bounds.min, bounds.max))
    setTo(clampYmd(defaultEnd, bounds.min, bounds.max))
  }, [ready, bounds.min, bounds.max])

  const openPicker = (which: 'from' | 'to') => {
    const cur = which === 'from' ? from : to
    setPicker({ which, draft: clampYmd(cur || bounds.min, bounds.min, bounds.max) })
  }

  const onConfirmPicker = () => {
    if (!picker) return
    const v = clampYmd(picker.draft, bounds.min, bounds.max)
    if (picker.which === 'from') setFrom(v)
    else setTo(v)
    setPicker(null)
  }

  const onExport = async () => {
    if (!from || !to) return
    const lo = from <= to ? from : to
    const hi = from <= to ? to : from
    setExporting(true)
    try {
      await exportCsv(records, fields, { dateFrom: lo, dateTo: hi })
    } finally {
      setExporting(false)
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f5f5f7] text-stone-400">
        加载中…
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#f5f5f7] pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-10 flex items-center border-b border-stone-200/80 bg-white/95 px-3 py-3 backdrop-blur-md">
        <Link
          to="/settings/import-export"
          className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-stone-700 hover:bg-stone-100"
          aria-label="返回"
        >
          ‹
        </Link>
        <h1 className="flex-1 text-center text-[17px] font-semibold text-stone-900 pr-10">
          账单导出
        </h1>
      </header>

      <div className="p-4">
        <div className="overflow-hidden rounded-2xl border border-stone-100 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => openPicker('from')}
            className="flex w-full items-center justify-between border-b border-stone-100 px-4 py-4 text-left transition-colors hover:bg-stone-50/80"
          >
            <span className="text-[15px] text-stone-800">开始日期</span>
            <span className="flex items-center gap-1 text-[15px] text-stone-600">
              {from || '—'}
              <span className="text-stone-300">›</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => openPicker('to')}
            className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-stone-50/80"
          >
            <span className="text-[15px] text-stone-800">结束日期</span>
            <span className="flex items-center gap-1 text-[15px] text-stone-600">
              {to || '—'}
              <span className="text-stone-300">›</span>
            </span>
          </button>
        </div>

        <p className="mt-3 px-1 text-[11px] leading-relaxed text-stone-500">
          仅导出所选「记账日」范围内的账单；点「导出」将直接打开系统分享，可将文件发到微信、保存到「文件」等。不含商品维护目录。
        </p>

        <button
          type="button"
          disabled={exporting || !from || !to}
          onClick={() => void onExport()}
          className="mt-6 w-full rounded-2xl bg-stone-900 py-3.5 text-[16px] font-semibold text-white shadow-md transition-opacity disabled:opacity-40"
        >
          {exporting ? '导出中…' : '导出'}
        </button>
      </div>

      <CalendarPickerModal
        open={picker !== null}
        onClose={() => setPicker(null)}
        value={picker?.draft ?? from}
        onChangeValue={(next) =>
          setPicker((p) => (p ? { ...p, draft: clampYmd(next, bounds.min, bounds.max) } : p))
        }
        onConfirm={onConfirmPicker}
        confirmLabel="确定"
        overlayZClass="z-[80]"
      />
    </div>
  )
}
