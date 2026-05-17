import {
  addYears,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  parse,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subYears,
} from 'date-fns'
import { useMemo, useState } from 'react'
import { WheelDatePickerSheet } from './WheelDatePickerSheet'

/** 滚轮展示用：给足年份区间（不紧贴账本最早/最晚日），账本若超出再向外扩 */
function widenPickerRange(
  ledgerMin: string,
  ledgerMax: string,
): { wheelMin: string; wheelMax: string } {
  const now = new Date()
  const cy = now.getFullYear()
  let wheelLo = new Date(cy - 35, 0, 1)
  let wheelHi = new Date(cy + 15, 11, 31)

  const toD = (s: string): Date | null => {
    if (!s || s.length < 10) return null
    const t = parse(s, 'yyyy-MM-dd', new Date())
    return Number.isNaN(t.getTime()) ? null : t
  }
  const lLo = toD(ledgerMin)
  const lHi = toD(ledgerMax)
  if (lLo && lLo < wheelLo) {
    wheelLo = startOfYear(subYears(lLo, 2))
  }
  if (lHi && lHi > wheelHi) {
    wheelHi = endOfYear(addYears(lHi, 2))
  }
  return {
    wheelMin: format(wheelLo, 'yyyy-MM-dd'),
    wheelMax: format(wheelHi, 'yyyy-MM-dd'),
  }
}

export type HomeSearchDateRangeBlockProps = {
  dateFrom: string
  dateTo: string
  minDate: string
  maxDate: string
  onChange: (from: string, to: string) => void
}

function fmtCn(ymd: string): string {
  if (!ymd || ymd.length < 10) return ''
  const [y, mo, d] = ymd.split('-').map(Number)
  return `${y}年${mo}月${d}日`
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

export function HomeSearchDateRangeBlock({
  dateFrom,
  dateTo,
  minDate,
  maxDate,
  onChange,
}: HomeSearchDateRangeBlockProps) {
  const [picker, setPicker] = useState<null | 'from' | 'to'>(null)

  const { wheelMin, wheelMax } = useMemo(
    () => widenPickerRange(minDate, maxDate),
    [minDate, maxDate],
  )

  const today = new Date()
  const weekStart = format(
    startOfWeek(today, { weekStartsOn: 1 }),
    'yyyy-MM-dd',
  )
  const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd')

  const quick = useMemo<'none' | 'week' | 'month' | 'custom'>(() => {
    if (!dateFrom && !dateTo) return 'none'
    if (dateFrom === weekStart && dateTo === weekEnd) return 'week'
    if (dateFrom === monthStart && dateTo === monthEnd) return 'month'
    return 'custom'
  }, [dateFrom, dateTo, weekStart, weekEnd, monthStart, monthEnd])

  const pill = (active: boolean) =>
    active
      ? 'kuaiji-chip border border-kj-border-strong bg-kj-surface text-kj-primary shadow-sm'
      : 'kuaiji-chip kuaiji-chip-idle'

  const pickerValue =
    picker === 'from'
      ? dateFrom || wheelMin
      : picker === 'to'
        ? dateTo || dateFrom || wheelMax
        : ''

  return (
    <div>
      <p className="mb-2 text-[11px] font-medium tracking-wide text-kj-secondary">
        账单日期
      </p>
      <div className="mb-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={pill(quick === 'none')}
          onClick={() => onChange('', '')}
        >
          不限制
        </button>
        <button
          type="button"
          className={pill(quick === 'week')}
          onClick={() => onChange(weekStart, weekEnd)}
        >
          本周
        </button>
        <button
          type="button"
          className={pill(quick === 'month')}
          onClick={() => onChange(monthStart, monthEnd)}
        >
          本月
        </button>
      </div>

      <div className="flex items-stretch rounded-xl bg-kj-raised p-0.5 ring-1 ring-kj-border">
        <button
          type="button"
          onClick={() => setPicker('from')}
          className="flex min-h-[34px] flex-1 items-center justify-center gap-1 rounded-lg bg-kj-surface px-2 py-1 text-left leading-snug transition-colors hover:bg-kj-hover active:bg-kj-surface"
        >
          <span
            className={`min-w-0 flex-1 truncate text-center text-[13px] leading-snug ${
              dateFrom ? 'font-medium text-kj-primary' : 'text-kj-muted'
            }`}
          >
            {dateFrom ? fmtCn(dateFrom) : '开始时间'}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-kj-muted" />
        </button>
        <div className="flex w-6 shrink-0 items-center justify-center text-xs text-kj-muted">
          —
        </div>
        <button
          type="button"
          onClick={() => setPicker('to')}
          className="flex min-h-[34px] flex-1 items-center justify-center gap-1 rounded-lg bg-kj-surface px-2 py-1 text-left leading-snug transition-colors hover:bg-kj-hover active:bg-kj-surface"
        >
          <span
            className={`min-w-0 flex-1 truncate text-center text-[13px] leading-snug ${
              dateTo ? 'font-medium text-kj-primary' : 'text-kj-muted'
            }`}
          >
            {dateTo ? fmtCn(dateTo) : '结束时间'}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-kj-muted" />
        </button>
      </div>
      <p className="mt-1.5 text-[10px] leading-relaxed text-kj-muted">
        可与关键词组合；仅选日期可不填关键词。开始晚于结束时会自动对调。
      </p>

      <WheelDatePickerSheet
        open={picker !== null}
        title="日期"
        value={pickerValue}
        minDate={wheelMin}
        maxDate={wheelMax}
        onClose={() => setPicker(null)}
        onConfirm={(ymd) => {
          if (picker === 'from') {
            let f = ymd
            let t = dateTo
            if (t && f > t) [f, t] = [t, f]
            onChange(f, t)
          } else if (picker === 'to') {
            let t = ymd
            let f = dateFrom
            if (f && t && f > t) [f, t] = [t, f]
            onChange(f, t)
          }
        }}
      />
    </div>
  )
}
