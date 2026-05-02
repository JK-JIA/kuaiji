import { format } from 'date-fns'
import { useMemo } from 'react'
import { MonthCalendar } from './MonthCalendar'

type Props = {
  open: boolean
  onClose: () => void
  /** yyyy-MM-dd */
  value: string
  onChangeValue: (next: string) => void
  onConfirm: () => void
  recordDates?: Set<string>
}

export function CalendarPickerModal({
  open,
  onClose,
  value,
  onChangeValue,
  onConfirm,
  recordDates,
}: Props) {
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const subtitle = useMemo(() => {
    if (!value || value.length < 10) return ''
    const [y, m, d] = value.split('-').map(Number)
    return `${y}年${m}月${d}日`
  }, [value])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/35 p-0 backdrop-blur-[3px] sm:items-center sm:p-4">
      <div className="absolute inset-0" aria-hidden onClick={onClose} />
      <div className="relative z-10 w-full max-w-[360px] overflow-hidden rounded-t-[1.75rem] border border-stone-200 bg-white shadow-2xl sm:rounded-3xl">
        <div className="border-b border-stone-100 px-5 pb-2 pt-5">
          <p className="text-center text-xs font-medium text-stone-400">选择日期</p>
          {subtitle && (
            <p className="mt-1 text-center text-[15px] text-stone-600">{subtitle}</p>
          )}
        </div>

        <div className="px-4 pb-3 pt-3">
          <MonthCalendar
            value={value || todayStr}
            onChange={onChangeValue}
            recordDates={recordDates}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 px-4 py-3">
          <button
            type="button"
            onClick={() => onChangeValue(todayStr)}
            className="rounded-full bg-stone-100 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-200"
          >
            今天
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm()
                onClose()
              }}
              className="rounded-full bg-stone-900 px-6 py-2 text-sm font-medium text-white hover:bg-stone-800"
            >
              跳转
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
