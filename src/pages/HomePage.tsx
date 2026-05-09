import { format, parseISO, subDays } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useCallback, useMemo, useRef, useState } from 'react'
import { AddRecordModal } from '../components/AddRecordModal'
import { CalendarPickerModal } from '../components/CalendarPickerModal'
import { ReconcileModal } from '../components/ReconcileModal'
import { RecordCard } from '../components/RecordCard'
import {
  getAmountFieldId,
  getPlateValue,
  plateGroupHeading,
} from '../utils/recordHelpers'
import { findFieldIdByName, sumAmount } from '../utils/stats'
import type { FieldDef, LedgerRecord } from '../types'
import { useLedger } from '../context/LedgerContext'

export function HomePage() {
  const { ready, fields, records, saveRecord, removeRecord, setRecordPayment } =
    useLedger()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<LedgerRecord | null>(null)
  const [reconcileId, setReconcileId] = useState<string | null>(null)
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

  /**
   * 仅展示有账单的日期；中间无账单的日子不占位。
   * 日历「跳转」钉选的日期即使没有账单也会显示（方便看到「当日暂无账单」并滚动到位）。
   */
  const visibleTimelineDates = useMemo(() => {
    const s = new Set<string>(grouped.dates)
    for (const p of pinnedDates) s.add(p)
    return [...s].sort((a, b) => b.localeCompare(a))
  }, [grouped.dates, pinnedDates])

  const todayRecords = grouped.map.get(todayStr) || []
  const amountId = getAmountFieldId(fields) ?? findFieldIdByName(fields, '金额')
  const todaySum = sumAmount(todayRecords, amountId)

  const recordDateSet = useMemo(
    () => new Set(grouped.dates),
    [grouped.dates],
  )

  const reconcileRecord = useMemo(
    () =>
      reconcileId ? records.find((r) => r.id === reconcileId) ?? null : null,
    [reconcileId, records],
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
    <div className="min-h-dvh bg-[#f8f9fa] pb-24 pt-12">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2 px-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-neutral-900">
            批发记账
          </h1>
          <p className="mt-0.5 text-xs leading-relaxed text-[#666666]">
            本地保存 · 支持金额与核账 · 可封装 APK
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

      <section className="mx-4 mb-3 rounded-2xl border border-stone-200/90 bg-white p-4 text-left shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#2ecc71]">
            <WalletGlyph className="h-[18px] w-[18px]" />
          </div>
          <p className="text-sm font-medium text-neutral-900">今日概况</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-6">
          <div>
            <p className="text-2xl font-bold tabular-nums text-neutral-900">
              {todayRecords.length}
            </p>
            <p className="mt-0.5 text-xs text-[#666666]">今日笔数</p>
          </div>
          {amountId && (
            <div>
              <p className="text-2xl font-bold tabular-nums text-neutral-900">
                {todaySum}
              </p>
              <p className="mt-0.5 text-xs text-[#666666]">今日金额合计</p>
            </div>
          )}
        </div>
        {!amountId && (
          <p className="mt-3 text-xs text-stone-400">
            默认已含「金额」字段；若被删除可在设置里加回。
          </p>
        )}
      </section>

      <div className="mx-4 mb-3 flex items-start gap-2.5 rounded-2xl border border-emerald-100/70 bg-[#f3fcf7] px-3.5 py-3">
        <HintBulbGlyph className="mt-0.5 h-[15px] w-[15px] shrink-0 text-[#2ecc71]" />
        <p className="text-left text-xs leading-relaxed">
          <span className="font-semibold text-[#1a7f4c]">提示：</span>
          <span className="font-normal text-[#2d6a4f]">
            点击账单进入编辑，向左滑可删除；登录账号开启云存储功能
          </span>
        </p>
      </div>

      <div className="px-4">
        {visibleTimelineDates.length === 0 && (
          <p className="rounded-2xl border border-dashed border-stone-200 bg-white py-12 text-center text-stone-400">
            暂无记录，点击下方记一笔。
          </p>
        )}

        {visibleTimelineDates.map((dateKey) => {
          const list = grouped.map.get(dateKey) || []
          return (
            <section
              key={dateKey}
              ref={(el) => {
                sectionRefs.current[dateKey] = el
              }}
              className="mb-5 scroll-mt-20"
            >
              <h2 className="sticky top-0 z-10 mb-2 border-b border-stone-100/90 bg-[#f8f9fa]/95 py-2 text-sm font-bold text-neutral-900 backdrop-blur">
                {headerDayLabel(dateKey)}{' '}
                <span className="font-normal text-[#999999]">{dateKey}</span>
              </h2>
              {list.length === 0 ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white py-8 text-sm text-[#666666]">
                  <ClipboardGlyph className="h-5 w-5 shrink-0 text-[#999999]" />
                  <span>当日暂无账单</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {groupRecordsByPlate(list, fields).map(([plate, recs]) => (
                    <div key={`${dateKey}-${plate}`}>
                      <p className="mb-2 text-[11px] font-semibold tracking-wide text-stone-500">
                        {plateGroupHeading(plate, fields)}
                      </p>
                      <ul className="space-y-2.5">
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
                              onReconcile={(rec) => setReconcileId(rec.id)}
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
        className="fixed bottom-20 left-1/2 z-30 flex -translate-x-1/2 items-center justify-center rounded-full bg-stone-900 px-8 py-3 text-base font-medium text-white shadow-md"
        aria-label="记一笔"
      >
        记一笔
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

      <ReconcileModal
        open={reconcileId !== null && reconcileRecord !== null}
        record={reconcileRecord}
        fields={fields}
        onClose={() => setReconcileId(null)}
        onConfirm={(id, payload) => void setRecordPayment(id, payload)}
      />

      <CalendarPickerModal
        open={jumpOpen}
        onClose={() => setJumpOpen(false)}
        value={jumpDate}
        onChangeValue={setJumpDate}
        recordDates={recordDateSet}
        confirmLabel="跳转"
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

function WalletGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.6}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V7.5A2.25 2.25 0 015.25 5.25h11.379a1.5 1.5 0 011.06.439l2.872 2.872a1.5 1.5 0 01.439 1.06V12M16.5 15.75h.008v.008H16.5v-.008z"
      />
    </svg>
  )
}

function ClipboardGlyph({ className }: { className?: string }) {
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
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    </svg>
  )
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

function HintBulbGlyph({ className }: { className?: string }) {
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
        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
      />
    </svg>
  )
}

