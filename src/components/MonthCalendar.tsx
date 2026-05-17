import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useEffect, useMemo, useState } from 'react'

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

export type MonthCalendarProps = {
  /** yyyy-MM-dd */
  value: string
  onChange: (next: string) => void
  recordDates?: Set<string>
  /** 弹窗内嵌时略紧凑 */
  compact?: boolean
  /** 底部显示「今天」快捷 */
  showQuickToday?: boolean
  className?: string
}

export function MonthCalendar({
  value,
  onChange,
  recordDates,
  compact = false,
  showQuickToday = false,
  className = '',
}: MonthCalendarProps) {
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')

  const [viewMonth, setViewMonth] = useState(() =>
    startOfMonth(parseISO(value + 'T12:00:00')),
  )

  useEffect(() => {
    setViewMonth(startOfMonth(parseISO(value + 'T12:00:00')))
  }, [value])

  const { cells, monthLabel } = useMemo(() => {
    const start = startOfMonth(viewMonth)
    const end = endOfMonth(viewMonth)
    const days = eachDayOfInterval({ start, end })
    const pad = start.getDay()
    const leading = Array.from({ length: pad }, () => null as Date | null)
    const all: (Date | null)[] = [...leading, ...days]
    while (all.length % 7 !== 0) all.push(null)
    return {
      cells: all,
      monthLabel: format(viewMonth, 'yyyy年 M月', { locale: zhCN }),
    }
  }, [viewMonth])

  const selectedDate =
    value.length >= 10 ? parseISO(value + 'T12:00:00') : today

  const navBtn = compact
    ? 'flex h-8 w-8 items-center justify-center rounded-full text-kj-secondary transition-colors hover:bg-kj-hover hover:text-kj-primary'
    : 'flex h-10 w-10 items-center justify-center rounded-full text-kj-secondary transition-colors hover:bg-kj-hover hover:text-kj-primary'

  const titleCls = compact
    ? 'text-[15px] font-semibold tracking-tight text-kj-primary'
    : 'text-lg font-semibold tracking-tight text-kj-primary'

  const weekCls = compact
    ? 'py-1.5 text-xs font-medium text-kj-muted'
    : 'py-2 text-xs font-medium uppercase tracking-wider text-kj-muted'

  const emptyCls = compact
    ? 'aspect-square min-h-[34px]'
    : 'aspect-square min-h-[40px]'

  const dayBtn = compact
    ? 'relative flex min-h-9 min-w-9 flex-col items-center justify-center rounded-full p-1 text-[13px] font-medium transition-colors'
    : 'relative flex min-h-10 min-w-10 flex-col items-center justify-center rounded-full p-1 text-sm font-medium transition-colors'

  const iconCls = compact ? 'h-4 w-4' : 'h-5 w-5'

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 px-0.5">
        <button
          type="button"
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          className={navBtn}
          aria-label="上一月"
        >
          <ChevronLeftIcon className={iconCls} />
        </button>
        <p className={`min-w-0 flex-1 text-center ${titleCls}`}>{monthLabel}</p>
        <button
          type="button"
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          className={navBtn}
          aria-label="下一月"
        >
          <ChevronRightIcon className={iconCls} />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-y-0.5 text-center">
        {WEEK_LABELS.map((w) => (
          <div key={w} className={weekCls}>
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) {
            return <div key={`empty-${i}`} className={emptyCls} />
          }
          const keyStr = format(d, 'yyyy-MM-dd')
          const isToday = keyStr === todayStr
          const isSelected = isSameDay(d, selectedDate)
          const hasRecord = recordDates?.has(keyStr)

          return (
            <div key={keyStr} className="flex items-center justify-center p-px">
              <button
                type="button"
                onClick={() => onChange(keyStr)}
                className={[
                  dayBtn,
                  isSelected
                    ? 'bg-stone-900 text-white shadow-sm'
                    : isToday
                      ? 'bg-stone-100 text-kj-primary ring-1 ring-stone-300'
                      : 'text-stone-800 hover:bg-stone-100',
                ].join(' ')}
              >
                <span className="tabular-nums">{format(d, 'd')}</span>
                {hasRecord && !isSelected && (
                  <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-stone-400" />
                )}
                {hasRecord && isSelected && (
                  <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-kj-surface/90" />
                )}
              </button>
            </div>
          )
        })}
      </div>

      {showQuickToday && (
        <div className="mt-2 flex justify-center pt-1">
          <button
            type="button"
            onClick={() => onChange(todayStr)}
            className="text-[13px] font-medium text-stone-500 hover:text-stone-800"
          >
            回到今天
          </button>
        </div>
      )}
    </div>
  )
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}
