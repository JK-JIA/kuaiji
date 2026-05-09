import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useEffect, useMemo, useState } from 'react'
import { useLedger } from '../context/LedgerContext'
import type { LedgerRecord } from '../types'
import {
  getAnchorDateForOffset,
  getCurrentReportRange,
  getPreviousReportRange,
  type ReportKind,
  toDateStr,
} from '../utils/reportRange'
import { getAmountFieldId, sumOutstanding } from '../utils/recordHelpers'
import {
  aggregatePlateSales,
  aggregateProductSales,
  findFieldIdByName,
  sumAmount,
} from '../utils/stats'

function filterByRange(
  records: LedgerRecord[],
  startStr: string,
  endStr: string,
): LedgerRecord[] {
  return records.filter((r) => r.date >= startStr && r.date <= endStr)
}

function fmtMoney(n: number): string {
  const x = Math.round(n * 100) / 100
  return Number.isInteger(x) ? String(x) : x.toFixed(2)
}

function fmtSignedMoney(n: number): string {
  if (n === 0) return '0'
  const s = fmtMoney(Math.abs(n))
  return n > 0 ? `+${s}` : `-${s}`
}

function fmtSignedInt(n: number): string {
  if (n === 0) return '0'
  return n > 0 ? `+${n}` : `${n}`
}

function pct(part: number, total: number): string {
  if (total <= 0) return '0'
  return `${Math.round((part / total) * 1000) / 10}%`
}

export function StatsPage() {
  const { ready, fields, records } = useLedger()
  const [kind, setKind] = useState<ReportKind>('month')
  /** 0=当前周期，-1=上一周期，不可大于 0（不向未来空周期） */
  const [periodOffset, setPeriodOffset] = useState(0)

  const amountId =
    getAmountFieldId(fields) ?? findFieldIdByName(fields, '金额')

  const now = new Date()

  useEffect(() => {
    setPeriodOffset(0)
  }, [kind])

  const anchorDate = useMemo(
    () => getAnchorDateForOffset(kind, periodOffset, now),
    [kind, periodOffset],
  )

  const currentBounds = useMemo(
    () => getCurrentReportRange(kind, anchorDate),
    [kind, anchorDate],
  )
  const prevBounds = useMemo(
    () => getPreviousReportRange(kind, anchorDate),
    [kind, anchorDate],
  )

  const curStart = toDateStr(currentBounds.start)
  const curEnd = toDateStr(currentBounds.end)
  const prevStart = toDateStr(prevBounds.start)
  const prevEnd = toDateStr(prevBounds.end)

  const rangeTitle = useMemo(() => {
    const a = format(currentBounds.start, 'yyyy年M月d日', { locale: zhCN })
    const b = format(currentBounds.end, 'yyyy年M月d日', { locale: zhCN })
    let tag: string
    if (periodOffset === 0) {
      tag =
        kind === 'week'
          ? '本周，周一至周日'
          : kind === 'month'
            ? '本月'
            : '本年'
    } else if (periodOffset === -1) {
      tag = kind === 'week' ? '上周' : kind === 'month' ? '上月' : '去年'
    } else {
      const n = -periodOffset
      tag =
        kind === 'week'
          ? `${n} 周前`
          : kind === 'month'
            ? `${n} 个月前`
            : `${n} 年前`
    }
    return `${a} — ${b}（${tag}）`
  }, [kind, currentBounds, periodOffset])

  const compareLabel =
    kind === 'week' ? '较上周' : kind === 'month' ? '较上月' : '较去年'

  const currentRecords = useMemo(
    () => filterByRange(records, curStart, curEnd),
    [records, curStart, curEnd],
  )
  const prevRecords = useMemo(
    () => filterByRange(records, prevStart, prevEnd),
    [records, prevStart, prevEnd],
  )

  const totalAmount = sumAmount(currentRecords, amountId)
  const totalOutstanding = useMemo(
    () => sumOutstanding(currentRecords, fields),
    [currentRecords, fields],
  )
  const prevAmount = sumAmount(prevRecords, amountId)
  const dealCount = currentRecords.length
  const prevDealCount = prevRecords.length

  const diffAmount = totalAmount - prevAmount
  const diffCount = dealCount - prevDealCount

  const products = useMemo(
    () => aggregateProductSales(currentRecords, fields, amountId),
    [currentRecords, fields, amountId],
  )
  const plates = useMemo(
    () => aggregatePlateSales(currentRecords, fields, amountId),
    [currentRecords, fields, amountId],
  )

  const totalJin = products.reduce((s, r) => s + r.jin, 0)
  const totalProductAmt = products.reduce((s, r) => s + r.amount, 0)
  const totalPlateCount = plates.reduce((s, r) => s + r.count, 0)
  const totalPlateAmt = plates.reduce((s, r) => s + r.amount, 0)

  const maxJinBar =
    products.length > 0 ? Math.max(...products.map((r) => r.jin), 1e-6) : 1
  const maxAmtBar =
    products.length > 0
      ? Math.max(...products.map((r) => r.amount), 1e-6)
      : 1
  const maxPlateCountBar =
    plates.length > 0 ? Math.max(...plates.map((r) => r.count), 1) : 1
  const maxPlateAmtBar =
    plates.length > 0
      ? Math.max(...plates.map((r) => r.amount), 1e-6)
      : 1

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-[#f8f9fa] text-[#999999]">
        加载中…
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-[#f8f9fa] pb-28 pt-12">
      <header className="mb-4 px-4">
        <h1 className="text-[22px] font-bold tracking-tight text-neutral-900">
          统计分析
        </h1>
        <p className="mt-0.5 text-xs leading-relaxed text-[#666666]">
          周报 / 月报 / 年报，与上一周期对比。
        </p>
      </header>

      <div className="mx-4 mb-4 flex flex-wrap gap-2">
        {(
          [
            ['week', '周报'],
            ['month', '月报'],
            ['year', '年报'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition-colors ${
              kind === k
                ? 'bg-[#2ecc71] text-white hover:bg-[#27ae60]'
                : 'border border-stone-200/90 bg-white text-[#666666] hover:bg-stone-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mx-4 mb-4 flex items-center gap-2 rounded-2xl border border-stone-200/90 bg-white px-2 py-2 shadow-sm">
        <button
          type="button"
          aria-label="上一周期"
          onClick={() => setPeriodOffset((o) => o - 1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-[#fafafa] text-[#666666] transition-colors hover:bg-stone-100"
        >
          <StatsChevronLeft className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 px-1 text-center text-xs leading-relaxed text-[#666666]">
          {rangeTitle}
        </p>
        <button
          type="button"
          aria-label="下一周期"
          disabled={periodOffset >= 0}
          onClick={() => setPeriodOffset((o) => Math.min(0, o + 1))}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-[#fafafa] text-[#666666] transition-colors hover:bg-stone-100 disabled:pointer-events-none disabled:opacity-35"
        >
          <StatsChevronRight className="h-5 w-5" />
        </button>
      </div>

      <section className="mx-4 mb-6 rounded-2xl border border-stone-200/90 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-xs font-medium text-[#666666]">
          {periodOffset === 0
            ? `${kind === 'week' ? '本周' : kind === 'month' ? '本月' : '本年'}汇总`
            : '该周期汇总'}
        </p>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs text-[#666666]">应收总金额（元）</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-neutral-900">
              {amountId ? fmtMoney(totalAmount) : '—'}
            </p>
            {!amountId && (
              <p className="mt-1 text-[11px] text-[#999999]">
                添加字段「金额」后显示
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-[#666666]">未收款合计（元）</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-amber-800">
              {amountId ? fmtMoney(totalOutstanding) : '—'}
            </p>
            {!amountId && (
              <p className="mt-1 text-[11px] text-[#999999]">
                按应收减已收汇总
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-stone-100 pt-5 sm:grid-cols-2">
          <div>
            <p className="text-xs text-[#666666]">{compareLabel} · 金额（元）</p>
            <p
              className={`mt-1 text-xl font-bold tabular-nums ${
                !amountId
                  ? 'text-[#999999]'
                  : diffAmount > 0
                    ? 'text-[#2ecc71]'
                    : diffAmount < 0
                      ? 'text-rose-600'
                      : 'text-neutral-800'
              }`}
            >
              {amountId ? fmtSignedMoney(diffAmount) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#666666]">{compareLabel} · 成交单数</p>
            <p
              className={`mt-1 text-xl font-bold tabular-nums ${
                diffCount > 0
                  ? 'text-[#2ecc71]'
                  : diffCount < 0
                    ? 'text-rose-600'
                    : 'text-neutral-800'
              }`}
            >
              {fmtSignedInt(diffCount)}
            </p>
          </div>
        </div>
        <p className="mt-4 border-t border-stone-100 pt-4 text-center text-[11px] leading-relaxed text-[#999999]">
          对比区间（所选周期的上一期）：{' '}
          {format(prevBounds.start, 'yyyy年M月d日', { locale: zhCN })} —{' '}
          {format(prevBounds.end, 'yyyy年M月d日', { locale: zhCN })}
        </p>
      </section>

      {currentRecords.length === 0 && (
        <div className="mx-4 mb-6 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white py-10 text-sm text-[#666666]">
          <span>本周期内暂无成交记录</span>
        </div>
      )}

      {currentRecords.length > 0 && (
        <>
          <section className="mx-4 mb-6">
            <h2 className="text-sm font-semibold text-neutral-900">
              商品销售占比
            </h2>
            <p className="mb-3 mt-1 text-[11px] leading-relaxed text-[#666666]">
              斤数由数量列解析（斤、千克折合斤）；一单多商品时总金额按各行斤数占比分摊到商品；单笔仍为账单合计金额。
            </p>
            <div className="overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-[#f8f9fa] text-xs font-medium text-[#666666]">
                    <th className="px-3 py-2.5 font-medium">商品</th>
                    <th className="w-20 py-2.5 text-right font-medium tabular-nums">
                      斤数
                    </th>
                    <th className="w-[28%] min-w-[100px] py-2.5 pl-2 font-medium">
                      斤数占比
                    </th>
                    <th className="w-24 py-2.5 text-right font-medium tabular-nums">
                      金额
                    </th>
                    <th className="w-[28%] min-w-[100px] py-2.5 pl-2 font-medium">
                      金额占比
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((row) => {
                    const jinPct =
                      totalJin > 0 ? (row.jin / totalJin) * 100 : 0
                    const amtPct =
                      amountId && totalProductAmt > 0
                        ? (row.amount / totalProductAmt) * 100
                        : 0
                    const jinBar = Math.round((row.jin / maxJinBar) * 100)
                    const amtBar = Math.round((row.amount / maxAmtBar) * 100)
                    return (
                      <tr
                        key={row.name}
                        className="border-b border-stone-50 last:border-0"
                      >
                        <td className="max-w-[36vw] truncate px-3 py-2.5 font-medium text-neutral-900 sm:max-w-none">
                          {row.name}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-neutral-800">
                          {fmtNum(row.jin)}
                        </td>
                        <td className="py-2 pl-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
                              <div
                                className="h-full rounded-full bg-[#2ecc71]"
                                style={{ width: `${jinBar}%` }}
                              />
                            </div>
                            <span className="w-11 shrink-0 text-right text-xs tabular-nums text-[#999999]">
                              {jinPct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-neutral-800">
                          {amountId ? fmtMoney(row.amount) : '—'}
                        </td>
                        <td className="py-2 pl-2">
                          {amountId ? (
                            <div className="flex items-center gap-2">
                              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
                                <div
                                  className="h-full rounded-full bg-[#1a7f4c]"
                                  style={{ width: `${amtBar}%` }}
                                />
                              </div>
                              <span className="w-11 shrink-0 text-right text-xs tabular-nums text-[#999999]">
                                {amtPct.toFixed(1)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-[#999999]">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mx-4 mb-10">
            <h2 className="text-sm font-semibold text-neutral-900">
              车牌成交与金额占比
            </h2>
            <p className="mb-3 mt-1 text-[11px] leading-relaxed text-[#666666]">
              按金额从高到低排序；占比均为本周期内全部车牌合计为 100%。
            </p>
            <div className="overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-[#f8f9fa] text-xs font-medium text-[#666666]">
                    <th className="w-8 px-2 py-2.5 font-medium">#</th>
                    <th className="py-2.5 font-medium">车牌</th>
                    <th className="w-16 py-2.5 text-right font-medium tabular-nums">
                      单数
                    </th>
                    <th className="w-[22%] min-w-[88px] py-2.5 pl-2 font-medium">
                      单数占比
                    </th>
                    <th className="w-24 py-2.5 text-right font-medium tabular-nums">
                      金额
                    </th>
                    <th className="w-[22%] min-w-[88px] py-2.5 pl-2 font-medium">
                      金额占比
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plates.map((row, i) => {
                    const countPct = pct(row.count, totalPlateCount)
                    const amtPctNum =
                      amountId && totalPlateAmt > 0
                        ? (row.amount / totalPlateAmt) * 100
                        : 0
                    const cBar = Math.round((row.count / maxPlateCountBar) * 100)
                    const aBar = Math.round((row.amount / maxPlateAmtBar) * 100)
                    return (
                      <tr
                        key={row.plate}
                        className="border-b border-stone-50 last:border-0"
                      >
                        <td className="px-2 py-2.5 text-center text-xs text-[#999999]">
                          {i + 1}
                        </td>
                        <td className="max-w-[28vw] truncate py-2.5 font-medium text-neutral-900 sm:max-w-none">
                          {row.plate}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-neutral-800">
                          {row.count}
                        </td>
                        <td className="py-2 pl-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
                              <div
                                className="h-full rounded-full bg-amber-500"
                                style={{ width: `${cBar}%` }}
                              />
                            </div>
                            <span className="w-11 shrink-0 text-right text-xs tabular-nums text-[#999999]">
                              {countPct}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-neutral-800">
                          {amountId ? fmtMoney(row.amount) : '—'}
                        </td>
                        <td className="py-2 pl-2">
                          {amountId ? (
                            <div className="flex items-center gap-2">
                              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
                                <div
                                  className="h-full rounded-full bg-[#2ecc71]"
                                  style={{ width: `${aBar}%` }}
                                />
                              </div>
                              <span className="w-11 shrink-0 text-right text-xs tabular-nums text-[#999999]">
                                {amtPctNum.toFixed(1)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-[#999999]">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function StatsChevronLeft({ className }: { className?: string }) {
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

function StatsChevronRight({ className }: { className?: string }) {
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

function fmtNum(n: number): string {
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n))
  return n.toFixed(1)
}
