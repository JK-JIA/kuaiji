import { format, isBefore, parseISO, startOfDay, subDays } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useCallback, useMemo, useRef, useState } from 'react'
import { AddRecordModal } from '../components/AddRecordModal'
import { CalendarPickerModal } from '../components/CalendarPickerModal'
import { RecordCard } from '../components/RecordCard'
import { findFieldIdByName, sumAmount } from '../utils/stats'
import { getPlateValue } from '../utils/recordHelpers'
import type { FieldDef, LedgerRecord } from '../types'
import { useLedger } from '../context/LedgerContext'

export function HomePage() {
  const { ready, fields, records, saveRecord, removeRecord, toggleSettled } =
    useLedger()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<LedgerRecord | null>(null)
  const [jumpOpen, setJumpOpen] = useState(false)
  const [jumpDate, setJumpDate] = useState(() =>
    format(new Date(), 'yyyy-MM-dd'),
  )
  /** 日历跳转过的日期（可能没有账单也要占位以便滚动） */
  const [pinnedDates, setPinnedDates] = useState<string[]>([])

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const grouped = useMemo(() => {
    const map = new Map<string, typeof records>()
    for (const r of records) {
      const arr = map.get(r.date) || []
      arr.push(r)
      map.set(r.date, arr)
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => b.createdAt - a.createdAt)
    }
    const dates = [...map.keys()].sort((a, b) => b.localeCompare(a))
    return { map, dates }
  }, [records])

  /** 从今天起连续展示的日期列表（含无账单的空日可跳过） */
  const timelineDates = useMemo(() => {
    const out: string[] = []
    let d = startOfDay(new Date())
    const oldest = grouped.dates.length
      ? grouped.dates[grouped.dates.length - 1]
      : todayStr
    const floor = parseISO(oldest + 'T12:00:00')
    while (!isBefore(d, floor)) {
      const key = format(d, 'yyyy-MM-dd')
      out.push(key)
      d = subDays(d, 1)
    }
    /** 合并历史上更早的日期 */
    for (const dt of grouped.dates) {
      if (!out.includes(dt)) out.push(dt)
    }
    for (const dt of pinnedDates) {
      if (!out.includes(dt)) out.push(dt)
    }
    out.sort((a, b) => b.localeCompare(a))
    return out
  }, [grouped.dates, todayStr, pinnedDates])

  const todayRecords = grouped.map.get(todayStr) || []
  const amountId = findFieldIdByName(fields, '金额')
  const todaySum = sumAmount(todayRecords, amountId)

  const recordDateSet = useMemo(
    () => new Set(grouped.dates),
    [grouped.dates],
  )

  const scrollToDate = useCallback((dateKey: string) => {
    const el = sectionRefs.current[dateKey]
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const headerDayLabel = (dateKey: string) => {
    const d = parseISO(dateKey + 'T12:00:00')
    if (dateKey === todayStr) return '今天'
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
    if (dateKey === yesterday) return '昨天'
    return format(d, 'M月d日 EEEE', { locale: zhCN })
  }

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-stone-400">
        加载本地数据中…
      </div>
    )
  }

  return (
    <div className="pb-28 pt-16">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 px-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            记账
          </h1>
          <p className="text-sm text-stone-500">
            数据保存在本机浏览器 · 可封装为 APK
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setJumpOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50"
          >
            <CalendarGlyph className="h-4 w-4 text-stone-500" aria-hidden />
            选择日期
          </button>
        </div>
      </header>

      <section className="mx-4 mb-6 rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm">
        <p className="text-sm text-stone-500">今日概述</p>
        <div className="mt-2 flex flex-wrap gap-8">
          <div>
            <p className="text-3xl font-semibold tabular-nums text-stone-900">
              {todayRecords.length}
            </p>
            <p className="text-xs text-stone-500">今日笔数</p>
          </div>
          {amountId && (
            <div>
              <p className="text-3xl font-semibold tabular-nums text-stone-900">
                {todaySum}
              </p>
              <p className="text-xs text-stone-500">今日金额合计</p>
            </div>
          )}
        </div>
        {!amountId && (
          <p className="mt-3 text-xs text-stone-400">
            在「设置」里添加名为「金额」后可汇总金额。
          </p>
        )}
      </section>

      <div className="px-4">
        {timelineDates.length === 0 && (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-white py-12 text-center text-stone-400">
            暂无记录，点击下方记一笔。
          </p>
        )}

        {timelineDates.map((dateKey) => {
          const list = grouped.map.get(dateKey) || []
          return (
            <section
              key={dateKey}
              ref={(el) => {
                sectionRefs.current[dateKey] = el
              }}
              className="mb-8 scroll-mt-24"
            >
              <h2 className="sticky top-0 z-10 mb-3 border-b border-stone-100 bg-stone-50/95 py-2 text-sm font-medium text-stone-800 backdrop-blur">
                {headerDayLabel(dateKey)}{' '}
                <span className="font-normal text-stone-400">{dateKey}</span>
              </h2>
              {list.length === 0 ? (
                <p className="rounded-2xl border border-stone-100 bg-stone-50 py-6 text-center text-sm text-stone-400">
                  当日暂无账单
                </p>
              ) : (
                <div className="space-y-5">
                  {groupRecordsByPlate(list, fields).map(([plate, recs]) => (
                    <div key={`${dateKey}-${plate}`}>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                        {plate}
                      </p>
                      <ul className="space-y-2">
                        {recs.map((r) => (
                          <li key={r.id}>
                            <RecordCard
                              record={r}
                              fields={fields}
                              onEdit={(rec) => {
                                setEditingRecord(rec)
                                setModalOpen(true)
                              }}
                              onDelete={(id) => {
                                void removeRecord(id)
                              }}
                              onToggleSettled={(id, settled) => {
                                void toggleSettled(id, settled)
                              }}
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => {
          setEditingRecord(null)
          setModalOpen(true)
        }}
        className="fixed bottom-20 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-stone-900 px-7 py-3 text-base font-medium text-white shadow-md"
        aria-label="记一笔，支持语音录入"
      >
        <span>记一笔</span>
        <MicIcon className="h-5 w-5 shrink-0 opacity-95" aria-hidden />
      </button>

      <AddRecordModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditingRecord(null)
        }}
        fields={fields}
        onSave={saveRecord}
        recordToEdit={editingRecord}
        recordDates={recordDateSet}
      />

      <CalendarPickerModal
        open={jumpOpen}
        onClose={() => setJumpOpen(false)}
        value={jumpDate}
        onChangeValue={setJumpDate}
        recordDates={recordDateSet}
        onConfirm={() => {
          setPinnedDates((prev) =>
            prev.includes(jumpDate) ? prev : [...prev, jumpDate],
          )
          window.setTimeout(() => scrollToDate(jumpDate), 120)
        }}
      />
    </div>
  )
}

function groupRecordsByPlate(
  list: LedgerRecord[],
  fields: FieldDef[],
): [string, LedgerRecord[]][] {
  const m = new Map<string, LedgerRecord[]>()
  const order: string[] = []
  for (const r of list) {
    const p = getPlateValue(r, fields) || '（未填车牌）'
    if (!m.has(p)) {
      m.set(p, [])
      order.push(p)
    }
    m.get(p)!.push(r)
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => b.createdAt - a.createdAt)
  }
  order.sort((a, b) => {
    if (a === '（未填车牌）') return 1
    if (b === '（未填车牌）') return -1
    return a.localeCompare(b, 'zh-CN')
  })
  return order.map((p) => [p, m.get(p)!])
}

function CalendarGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5a2.25 2.25 0 002.25-2.25m-18 0v-7.5A2.25 2.25 0 017.5 9h9a2.25 2.25 0 012.25 2.25v7.5"
      />
    </svg>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 0 1 6 0v8.25a3 3 0 0 1-3 3z"
      />
    </svg>
  )
}
