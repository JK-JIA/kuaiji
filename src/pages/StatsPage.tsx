import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { StatsCustomSection } from '../components/StatsCustomSection'
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
  aggregateBuyerOutstanding,
  aggregateBuyerProductRows,
  aggregateProductSales,
  collectDistinctBuyersForStats,
  collectDistinctProductsForStats,
  findFieldIdByName,
  sumAmount,
  type BuyerOutstandingRow,
  type BuyerProductRow,
  type ProductSalesRow,
  type StatsDimensionFilter,
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

function fmtNum(n: number): string {
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n))
  return n.toFixed(1)
}

/** 占比表：按斤数或金额排序 */
type StatsJinAmtSortKey = 'jin' | 'amount'
type StatsJinAmtSort = { key: StatsJinAmtSortKey; dir: 'asc' | 'desc' }

function compareProductSalesRows(
  a: ProductSalesRow,
  b: ProductSalesRow,
  key: StatsJinAmtSortKey,
  dir: 'asc' | 'desc',
): number {
  const m = dir === 'desc' ? -1 : 1
  const d = key === 'jin' ? a.jin - b.jin : a.amount - b.amount
  if (d !== 0) return m * d
  return a.name.localeCompare(b.name, 'zh-CN')
}

function compareBuyerProductRows(
  a: BuyerProductRow,
  b: BuyerProductRow,
  key: StatsJinAmtSortKey,
  dir: 'asc' | 'desc',
): number {
  const m = dir === 'desc' ? -1 : 1
  const va = key === 'jin' ? a.jin : a.amount
  const vb = key === 'jin' ? b.jin : b.amount
  const d = va - vb
  if (d !== 0) return m * d
  const bc = a.buyer.localeCompare(b.buyer, 'zh-CN')
  if (bc !== 0) return bc
  return a.product.localeCompare(b.product, 'zh-CN')
}

/** 未核账排行表：按本周期应收合计或未核账排序（支持数值正负方向） */
type BuyerOutstandingSortKey = 'totalExpected' | 'outstanding'
type BuyerOutstandingSort = { key: BuyerOutstandingSortKey; dir: 'asc' | 'desc' }

function compareBuyerOutstandingRows(
  a: BuyerOutstandingRow,
  b: BuyerOutstandingRow,
  key: BuyerOutstandingSortKey,
  dir: 'asc' | 'desc',
): number {
  const m = dir === 'desc' ? -1 : 1
  const va = key === 'totalExpected' ? a.totalExpected : a.outstanding
  const vb = key === 'totalExpected' ? b.totalExpected : b.outstanding
  const d = va - vb
  if (d !== 0) return m * d
  return a.buyer.localeCompare(b.buyer, 'zh-CN')
}

export function StatsPage() {
  const { ready, fields, records } = useLedger()
  const [kind, setKind] = useState<ReportKind>('month')
  /** 0=当前周期，-1=上一周期，不可大于 0（不向未来空周期） */
  const [periodOffset, setPeriodOffset] = useState(0)
  const [customStatsOpen, setCustomStatsOpen] = useState(false)
  const [statsDetailModal, setStatsDetailModal] = useState<
    null | 'product' | 'buyerProduct' | 'buyerOutstanding'
  >(null)
  const [productShareSort, setProductShareSort] =
    useState<StatsJinAmtSort | null>(null)
  const [buyerProductShareSort, setBuyerProductShareSort] =
    useState<StatsJinAmtSort | null>(null)
  const [buyerOutstandingSort, setBuyerOutstandingSort] =
    useState<BuyerOutstandingSort | null>(null)
  const [statsFilterBuyer, setStatsFilterBuyer] = useState('')
  const [statsFilterProduct, setStatsFilterProduct] = useState('')

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

  useEffect(() => {
    setStatsFilterBuyer('')
    setStatsFilterProduct('')
  }, [curStart, curEnd])

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

  const buyerFieldName =
    fields.find((f) => f.key === 'plate')?.name?.trim() || '购买方'
  const productFieldName =
    fields.find((f) => f.key === 'product')?.name?.trim() || '商品'

  const statsDimFilter = useMemo<StatsDimensionFilter>(
    () => ({
      buyer: statsFilterBuyer.trim() || null,
      product: statsFilterProduct.trim() || null,
    }),
    [statsFilterBuyer, statsFilterProduct],
  )

  const statsBuyerOptions = useMemo(
    () => collectDistinctBuyersForStats(currentRecords, fields),
    [currentRecords, fields],
  )
  const statsProductOptions = useMemo(
    () => collectDistinctProductsForStats(currentRecords, fields),
    [currentRecords, fields],
  )

  const statsChartsFiltered =
    Boolean(statsDimFilter.buyer) || Boolean(statsDimFilter.product)

  const products = useMemo(
    () =>
      aggregateProductSales(
        currentRecords,
        fields,
        amountId,
        statsDimFilter,
      ),
    [currentRecords, fields, amountId, statsDimFilter],
  )
  const buyerProductRows = useMemo(
    () =>
      aggregateBuyerProductRows(
        currentRecords,
        fields,
        amountId,
        statsDimFilter,
      ),
    [currentRecords, fields, amountId, statsDimFilter],
  )
  const buyerProductTotals = useMemo(() => {
    const m = new Map<string, { jin: number; amount: number }>()
    for (const r of buyerProductRows) {
      const t = m.get(r.buyer) || { jin: 0, amount: 0 }
      t.jin += r.jin
      t.amount += r.amount
      m.set(r.buyer, t)
    }
    return m
  }, [buyerProductRows])
  const buyerOutstandingRows = useMemo(
    () => aggregateBuyerOutstanding(currentRecords, fields, statsDimFilter),
    [currentRecords, fields, statsDimFilter],
  )

  const totalJin = products.reduce((s, r) => s + r.jin, 0)
  const totalProductAmt = products.reduce((s, r) => s + r.amount, 0)
  const maxJinBar =
    products.length > 0 ? Math.max(...products.map((r) => r.jin), 1e-6) : 1
  const maxAmtBar =
    products.length > 0
      ? Math.max(...products.map((r) => r.amount), 1e-6)
      : 1

  const maxBpJin =
    buyerProductRows.length > 0
      ? Math.max(...buyerProductRows.map((r) => r.jin), 1e-6)
      : 1
  const maxBpAmt =
    buyerProductRows.length > 0
      ? Math.max(...buyerProductRows.map((r) => r.amount), 1e-6)
      : 1

  const sortedProductShareRows = useMemo(() => {
    if (!productShareSort) return products
    const list = [...products]
    list.sort((a, b) =>
      compareProductSalesRows(a, b, productShareSort.key, productShareSort.dir),
    )
    return list
  }, [products, productShareSort])

  const sortedBuyerProductShareRows = useMemo(() => {
    if (!buyerProductShareSort) return buyerProductRows
    const list = [...buyerProductRows]
    list.sort((a, b) =>
      compareBuyerProductRows(
        a,
        b,
        buyerProductShareSort.key,
        buyerProductShareSort.dir,
      ),
    )
    return list
  }, [buyerProductRows, buyerProductShareSort])

  const toggleProductShareSort = useCallback((key: StatsJinAmtSortKey) => {
    setProductShareSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'desc' }
      return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
    })
  }, [])

  const toggleBuyerProductShareSort = useCallback(
    (key: StatsJinAmtSortKey) => {
      if (key === 'amount' && !amountId) return
      setBuyerProductShareSort((prev) => {
        if (!prev || prev.key !== key) return { key, dir: 'desc' }
        return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      })
    },
    [amountId],
  )

  const sortedBuyerOutstandingRows = useMemo(() => {
    if (!buyerOutstandingSort) return buyerOutstandingRows
    const list = [...buyerOutstandingRows]
    list.sort((a, b) =>
      compareBuyerOutstandingRows(
        a,
        b,
        buyerOutstandingSort.key,
        buyerOutstandingSort.dir,
      ),
    )
    return list
  }, [buyerOutstandingRows, buyerOutstandingSort])

  const toggleBuyerOutstandingSort = useCallback(
    (key: BuyerOutstandingSortKey) => {
      setBuyerOutstandingSort((prev) => {
        if (!prev || prev.key !== key) return { key, dir: 'desc' }
        return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      })
    },
    [],
  )

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
          按周/月/年查看，可与上期对比。
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
              <p className="mt-1 text-[11px] text-[#999999]">需「金额」列</p>
            )}
          </div>
          <div>
            <p className="text-xs text-[#666666]">未收款合计（元）</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-amber-800">
              {amountId ? fmtMoney(totalOutstanding) : '—'}
            </p>
            {!amountId && (
              <p className="mt-1 text-[11px] text-[#999999]">需金额列</p>
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
          上期：{format(prevBounds.start, 'M月d日', { locale: zhCN })} —{' '}
          {format(prevBounds.end, 'M月d日', { locale: zhCN })}
        </p>
      </section>

      {currentRecords.length === 0 && (
        <div className="mx-4 mb-6 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white py-10 text-sm text-[#666666]">
          <span>本周期暂无账单</span>
        </div>
      )}

      {currentRecords.length > 0 && (
        <>
          <section className="mx-4 mb-6 rounded-2xl border border-stone-200/90 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-neutral-900">
                图表筛选
              </h2>
              {statsChartsFiltered && (
                <button
                  type="button"
                  onClick={() => {
                    setStatsFilterBuyer('')
                    setStatsFilterProduct('')
                  }}
                  className="shrink-0 rounded-lg border border-stone-200 bg-[#fafafa] px-3 py-1.5 text-xs font-medium text-[#666666] hover:bg-stone-100"
                >
                  清除筛选
                </button>
              )}
            </div>
            <p className="mb-3 mt-1 text-[11px] leading-relaxed text-[#666666]">
              下方三张表共用；两条件为「且」。筛{productFieldName}时，未核账仍按整单计。
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-[160px]">
                <span className="text-xs font-medium text-[#666666]">
                  {buyerFieldName}
                </span>
                <select
                  value={statsFilterBuyer}
                  onChange={(e) => setStatsFilterBuyer(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2.5 text-sm text-neutral-900"
                >
                  <option value="">全部</option>
                  {statsBuyerOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-[160px]">
                <span className="text-xs font-medium text-[#666666]">
                  {productFieldName}
                </span>
                <select
                  value={statsFilterProduct}
                  onChange={(e) => setStatsFilterProduct(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2.5 text-sm text-neutral-900"
                >
                  <option value="">全部</option>
                  {statsProductOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {statsChartsFiltered && (
              <p className="mt-3 text-[11px] text-[#1a7f4c]">筛选已生效</p>
            )}
          </section>

          <section className="mx-4 mb-6">
            <h2 className="text-sm font-semibold text-neutral-900">
              商品销售占比
            </h2>
            <p className="mb-3 mt-1 text-[11px] leading-relaxed text-[#666666]">
              数量折斤数；多商品按斤数分摊金额。小字为斤/元，条为占比。表头可排序。
            </p>
            <div className="overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-end gap-2 border-b border-stone-100 px-3 py-2">
                <span className="mr-auto text-[11px] text-[#999999]">可滑动</span>
                <button
                  type="button"
                  onClick={() => setStatsDetailModal('product')}
                  className="shrink-0 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-[#1a7f4c] hover:bg-emerald-100"
                >
                  大屏查看
                </button>
              </div>
              <div className="max-h-[min(52vh,22rem)] overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] px-2 sm:px-3">
                <ProductSalesShareTable
                  products={sortedProductShareRows}
                  totalJin={totalJin}
                  totalProductAmt={totalProductAmt}
                  amountId={amountId}
                  maxJinBar={maxJinBar}
                  maxAmtBar={maxAmtBar}
                  sort={productShareSort}
                  onSortKey={toggleProductShareSort}
                />
              </div>
            </div>
          </section>

          <section className="mx-4 mb-6">
            <h2 className="text-sm font-semibold text-neutral-900">
              {buyerFieldName}购买商品占比
            </h2>
            <p className="mb-3 mt-1 text-[11px] leading-relaxed text-[#666666]">
              购买方×商品；占比为该方内部占比。表头排序；默认按方分组。
            </p>
            {buyerProductRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-8 text-center text-sm text-[#666666]">
                需多行商品明细
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-end gap-2 border-b border-stone-100 px-3 py-2">
                  <span className="mr-auto text-[11px] text-[#999999]">可滑动</span>
                  <button
                    type="button"
                    onClick={() => setStatsDetailModal('buyerProduct')}
                    className="shrink-0 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-[#1a7f4c] hover:bg-emerald-100"
                  >
                    大屏查看
                  </button>
                </div>
                <div className="max-h-[min(52vh,22rem)] overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] px-2 sm:px-3">
                  <BuyerProductShareTable
                    buyerFieldName={buyerFieldName}
                    rows={sortedBuyerProductShareRows}
                    buyerProductTotals={buyerProductTotals}
                    amountId={amountId}
                    maxBpJin={maxBpJin}
                    maxBpAmt={maxBpAmt}
                    sort={buyerProductShareSort}
                    onSortKey={toggleBuyerProductShareSort}
                  />
                </div>
              </div>
            )}
          </section>

          <section className="mx-4 mb-10">
            <h2 className="text-sm font-semibold text-neutral-900">
              {buyerFieldName}未核账金额排行
            </h2>
            <p className="mb-3 mt-1 text-[11px] leading-relaxed text-[#666666]">
              有欠款的购买方；总额=周期应收合，未核账=欠款。表头排序；可滑动、大屏。
            </p>
            {!amountId ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-8 text-center text-sm text-[#666666]">
                需金额列
              </div>
            ) : buyerOutstandingRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-8 text-center text-sm text-[#666666]">
                本周期内暂无未核账金额
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-end gap-2 border-b border-stone-100 px-3 py-2">
                  <span className="mr-auto text-[11px] text-[#999999]">可滑动</span>
                  <button
                    type="button"
                    onClick={() => setStatsDetailModal('buyerOutstanding')}
                    className="shrink-0 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-[#1a7f4c] hover:bg-emerald-100"
                  >
                    大屏查看
                  </button>
                </div>
                <div className="max-h-[min(52vh,22rem)] overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] px-2 sm:px-3">
                  <BuyerOutstandingTable
                    buyerFieldName={buyerFieldName}
                    rows={sortedBuyerOutstandingRows}
                    sort={buyerOutstandingSort}
                    onSortKey={toggleBuyerOutstandingSort}
                  />
                </div>
              </div>
            )}
          </section>

          <div className="mx-4 mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setCustomStatsOpen((o) => !o)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition-colors ${
                customStatsOpen
                  ? 'border border-stone-200/90 bg-white text-[#666666] hover:bg-stone-50'
                  : 'bg-[#2ecc71] text-white hover:bg-[#27ae60]'
              }`}
            >
              {customStatsOpen ? '收起自定义统计' : '自定义统计'}
            </button>
          </div>

          {customStatsOpen && (
            <StatsCustomSection
              fields={fields}
              records={currentRecords}
              amountFieldId={amountId}
            />
          )}
        </>
      )}

      <StatsDetailModal
        open={statsDetailModal !== null}
        title={
          statsDetailModal === 'product'
            ? '商品销售占比'
            : statsDetailModal === 'buyerProduct'
              ? `${buyerFieldName}购买商品占比`
              : statsDetailModal === 'buyerOutstanding'
                ? `${buyerFieldName}未核账金额排行`
                : ''
        }
        onClose={() => setStatsDetailModal(null)}
      >
        {statsDetailModal === 'product' && (
          <ProductSalesShareTable
            products={sortedProductShareRows}
            totalJin={totalJin}
            totalProductAmt={totalProductAmt}
            amountId={amountId}
            maxJinBar={maxJinBar}
            maxAmtBar={maxAmtBar}
            sort={productShareSort}
            onSortKey={toggleProductShareSort}
            relaxed
          />
        )}
        {statsDetailModal === 'buyerProduct' && (
          <BuyerProductShareTable
            buyerFieldName={buyerFieldName}
            rows={sortedBuyerProductShareRows}
            buyerProductTotals={buyerProductTotals}
            amountId={amountId}
            maxBpJin={maxBpJin}
            maxBpAmt={maxBpAmt}
            sort={buyerProductShareSort}
            onSortKey={toggleBuyerProductShareSort}
            relaxed
          />
        )}
        {statsDetailModal === 'buyerOutstanding' && (
          <BuyerOutstandingTable
            buyerFieldName={buyerFieldName}
            rows={sortedBuyerOutstandingRows}
            sort={buyerOutstandingSort}
            onSortKey={toggleBuyerOutstandingSort}
            relaxed
          />
        )}
      </StatsDetailModal>
    </div>
  )
}

function SortableOutstandingTh({
  label,
  sortKey,
  sort,
  onSortKey,
  relaxed,
}: {
  label: string
  sortKey: BuyerOutstandingSortKey
  sort: BuyerOutstandingSort | null
  onSortKey: (key: BuyerOutstandingSortKey) => void
  relaxed?: boolean
}) {
  const active = sort?.key === sortKey
  const dir = active ? sort!.dir : null
  const thPad = relaxed ? 'py-3 text-sm' : 'py-2.5 text-xs'
  const btnText = relaxed ? 'text-sm' : 'text-xs'
  return (
    <th
      scope="col"
      className={`w-[30%] min-w-[5.25rem] text-right font-medium text-[#666666] sm:w-28 ${thPad}`}
      aria-sort={
        active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <button
        type="button"
        onClick={() => onSortKey(sortKey)}
        title={
          active
            ? dir === 'desc'
              ? '点击改为升序'
              : '点击改为降序'
            : '点击排序'
        }
        className={`inline-flex w-full max-w-full items-center justify-end gap-1 rounded-lg py-0.5 pl-1 font-medium text-[#666666] transition-colors hover:bg-stone-100 hover:text-neutral-900 ${btnText}`}
      >
        <span className="min-w-0 text-right">{label}</span>
        <span
          className={`shrink-0 select-none tabular-nums ${active ? 'text-[#1a7f4c]' : 'text-[#bbbbbb]'}`}
          aria-hidden
        >
          {active ? (dir === 'desc' ? '↓' : '↑') : '↕'}
        </span>
      </button>
    </th>
  )
}

function BuyerOutstandingTable({
  buyerFieldName,
  rows,
  sort,
  onSortKey,
  relaxed,
}: {
  buyerFieldName: string
  rows: BuyerOutstandingRow[]
  sort: BuyerOutstandingSort | null
  onSortKey: (key: BuyerOutstandingSortKey) => void
  relaxed?: boolean
}) {
  const thIdx = relaxed
    ? 'w-12 px-3 py-3 text-left text-sm font-medium text-[#666666]'
    : 'w-10 px-2 py-2.5 text-left text-xs font-medium text-[#666666]'
  const thBuyer = relaxed
    ? 'min-w-0 py-3 text-left text-sm font-medium text-[#666666]'
    : 'min-w-0 py-2.5 text-left text-xs font-medium text-[#666666]'
  const tdIdx = relaxed
    ? 'px-3 py-3 text-center text-sm text-[#999999]'
    : 'px-2 py-2.5 text-center text-xs text-[#999999]'
  const tdBuyer = relaxed
    ? 'max-w-[42vw] truncate px-3 py-3 text-base font-medium text-neutral-900 sm:max-w-none'
    : 'max-w-[40vw] truncate py-2.5 text-sm font-medium text-neutral-900 sm:max-w-none'
  const tdNum = relaxed ? 'py-3 text-base tabular-nums' : 'py-2.5 text-sm tabular-nums'

  return (
    <table className="w-full text-left text-sm">
      <thead className="sticky top-0 z-[1] bg-white shadow-[0_1px_0_0_rgb(245_245_244)]">
        <tr>
          <th className={thIdx}>#</th>
          <th className={thBuyer}>{buyerFieldName}</th>
          <SortableOutstandingTh
            label="总金额（元）"
            sortKey="totalExpected"
            sort={sort}
            onSortKey={onSortKey}
            relaxed={relaxed}
          />
          <SortableOutstandingTh
            label="未核账（元）"
            sortKey="outstanding"
            sort={sort}
            onSortKey={onSortKey}
            relaxed={relaxed}
          />
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={`${row.buyer}-${i}`}
            className="border-b border-stone-50 last:border-0"
          >
            <td className={tdIdx}>{i + 1}</td>
            <td className={tdBuyer}>{row.buyer}</td>
            <td className={`${tdNum} text-right text-neutral-800`}>
              {fmtMoney(row.totalExpected)}
            </td>
            <td className={`${tdNum} text-right text-amber-900`}>
              {fmtMoney(row.outstanding)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SortableShareMetricTh({
  label,
  sortKey,
  sort,
  onSortKey,
  disabled,
  relaxed,
  widthClass,
}: {
  label: string
  sortKey: StatsJinAmtSortKey
  sort: StatsJinAmtSort | null
  onSortKey: (key: StatsJinAmtSortKey) => void
  disabled?: boolean
  relaxed?: boolean
  widthClass: string
}) {
  const active = sort?.key === sortKey
  const dir = active ? sort!.dir : null
  const thPad = relaxed
    ? 'px-3 py-3 text-left text-sm font-medium'
    : 'px-3 py-2.5 text-left text-xs font-medium'
  return (
    <th
      scope="col"
      className={`${thPad} pl-2 text-[#666666] ${widthClass}`}
      aria-sort={
        active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSortKey(sortKey)}
        title={
          disabled
            ? '需要金额列'
            : active
              ? dir === 'desc'
                ? '点击改为升序'
                : '点击改为降序'
              : '点击排序'
        }
        className={`inline-flex max-w-full items-center gap-1 rounded-lg py-0.5 pr-1 text-left font-medium text-[#666666] transition-colors hover:bg-stone-100 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-40 ${relaxed ? 'text-sm' : 'text-xs'}`}
      >
        <span className="min-w-0">{label}</span>
        <span
          className={`shrink-0 select-none tabular-nums ${active ? 'text-[#1a7f4c]' : 'text-[#bbbbbb]'}`}
          aria-hidden
        >
          {active ? (dir === 'desc' ? '↓' : '↑') : '↕'}
        </span>
      </button>
    </th>
  )
}

function ProductSalesShareTable({
  products,
  totalJin,
  totalProductAmt,
  amountId,
  maxJinBar,
  maxAmtBar,
  sort,
  onSortKey,
  relaxed,
}: {
  products: ProductSalesRow[]
  totalJin: number
  totalProductAmt: number
  amountId: string | null | undefined
  maxJinBar: number
  maxAmtBar: number
  sort: StatsJinAmtSort | null
  onSortKey: (key: StatsJinAmtSortKey) => void
  relaxed?: boolean
}) {
  const th = relaxed
    ? 'px-3 py-3 text-left text-sm font-medium text-[#666666]'
    : 'px-3 py-2.5 text-left text-xs font-medium text-[#666666]'
  const tdName = relaxed
    ? 'max-w-[42vw] truncate px-3 py-3 text-base font-medium text-neutral-900 sm:max-w-none'
    : 'max-w-[36vw] truncate px-3 py-2.5 text-sm font-medium text-neutral-900 sm:max-w-none'
  const valLine = relaxed
    ? 'text-sm tabular-nums text-neutral-700'
    : 'text-[11px] tabular-nums text-neutral-700'
  const pctText = relaxed ? 'text-sm' : 'text-xs'

  return (
    <table className="w-full text-left text-sm">
      <thead className="sticky top-0 z-[1] bg-white shadow-[0_1px_0_0_rgb(245_245_244)]">
        <tr>
          <th className={th}>商品</th>
          <SortableShareMetricTh
            label="斤数占比"
            sortKey="jin"
            sort={sort}
            onSortKey={onSortKey}
            relaxed={relaxed}
            widthClass="w-[38%] min-w-[120px]"
          />
          <SortableShareMetricTh
            label="金额占比"
            sortKey="amount"
            sort={sort}
            onSortKey={onSortKey}
            disabled={!amountId}
            relaxed={relaxed}
            widthClass="w-[38%] min-w-[120px]"
          />
        </tr>
      </thead>
      <tbody>
        {products.map((row) => {
          const jinPct = totalJin > 0 ? (row.jin / totalJin) * 100 : 0
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
              <td className={tdName}>{row.name}</td>
              <td className="py-2 pl-2 align-top">
                <div className="space-y-1">
                  <div className={valLine}>{fmtNum(row.jin)} 斤</div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-[#2ecc71]"
                        style={{ width: `${jinBar}%` }}
                      />
                    </div>
                    <span
                      className={`w-12 shrink-0 text-right tabular-nums text-[#999999] ${pctText}`}
                    >
                      {jinPct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </td>
              <td className="py-2 pl-2 align-top">
                {amountId ? (
                  <div className="space-y-1">
                    <div className={valLine}>{fmtMoney(row.amount)} 元</div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full bg-[#1a7f4c]"
                          style={{ width: `${amtBar}%` }}
                        />
                      </div>
                      <span
                        className={`w-12 shrink-0 text-right tabular-nums text-[#999999] ${pctText}`}
                      >
                        {amtPct.toFixed(1)}%
                      </span>
                    </div>
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
  )
}

function BuyerProductShareTable({
  buyerFieldName,
  rows,
  buyerProductTotals,
  amountId,
  maxBpJin,
  maxBpAmt,
  sort,
  onSortKey,
  relaxed,
}: {
  buyerFieldName: string
  rows: BuyerProductRow[]
  buyerProductTotals: Map<string, { jin: number; amount: number }>
  amountId: string | null | undefined
  maxBpJin: number
  maxBpAmt: number
  sort: StatsJinAmtSort | null
  onSortKey: (key: StatsJinAmtSortKey) => void
  relaxed?: boolean
}) {
  const th = relaxed
    ? 'px-3 py-3 text-left text-sm font-medium text-[#666666]'
    : 'px-3 py-2.5 text-left text-xs font-medium text-[#666666]'
  const tdBuyer = relaxed
    ? 'max-w-[32vw] truncate px-3 py-3 text-base font-medium text-neutral-900 sm:max-w-[160px]'
    : 'max-w-[28vw] truncate px-3 py-2.5 text-sm font-medium text-neutral-900 sm:max-w-[140px]'
  const tdProd = relaxed
    ? 'max-w-[32vw] truncate px-3 py-3 text-base text-neutral-800 sm:max-w-none'
    : 'max-w-[28vw] truncate px-3 py-2.5 text-sm text-neutral-800 sm:max-w-none'
  const valLine = relaxed
    ? 'text-sm tabular-nums text-neutral-700'
    : 'text-[11px] tabular-nums text-neutral-700'
  const pctText = relaxed ? 'text-sm' : 'text-xs'

  return (
    <table className="w-full text-left text-sm">
      <thead className="sticky top-0 z-[1] bg-white shadow-[0_1px_0_0_rgb(245_245_244)]">
        <tr>
          <th className={th}>{buyerFieldName}</th>
          <th className={th}>商品</th>
          <SortableShareMetricTh
            label="斤数占比"
            sortKey="jin"
            sort={sort}
            onSortKey={onSortKey}
            relaxed={relaxed}
            widthClass="w-[30%] min-w-[108px]"
          />
          <SortableShareMetricTh
            label="金额占比"
            sortKey="amount"
            sort={sort}
            onSortKey={onSortKey}
            disabled={!amountId}
            relaxed={relaxed}
            widthClass="w-[30%] min-w-[108px]"
          />
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const bt = buyerProductTotals.get(row.buyer) ?? { jin: 0, amount: 0 }
          const jinPct = bt.jin > 0 ? (row.jin / bt.jin) * 100 : 0
          const amtPct =
            amountId && bt.amount > 0 ? (row.amount / bt.amount) * 100 : 0
          const jinBar = Math.round((row.jin / maxBpJin) * 100)
          const amtBar = Math.round((row.amount / maxBpAmt) * 100)
          return (
            <tr
              key={`${row.buyer}-${row.product}-${i}`}
              className="border-b border-stone-50 last:border-0"
            >
              <td className={tdBuyer}>{row.buyer}</td>
              <td className={tdProd}>{row.product}</td>
              <td className="py-2 pl-2 align-top">
                <div className="space-y-1">
                  <div className={valLine}>{fmtNum(row.jin)} 斤</div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-teal-500"
                        style={{ width: `${jinBar}%` }}
                      />
                    </div>
                    <span
                      className={`w-12 shrink-0 text-right tabular-nums text-[#999999] ${pctText}`}
                    >
                      {jinPct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </td>
              <td className="py-2 pl-2 align-top">
                {amountId ? (
                  <div className="space-y-1">
                    <div className={valLine}>{fmtMoney(row.amount)} 元</div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full bg-[#1a7f4c]"
                          style={{ width: `${amtBar}%` }}
                        />
                      </div>
                      <span
                        className={`w-12 shrink-0 text-right tabular-nums text-[#999999] ${pctText}`}
                      >
                        {amtPct.toFixed(1)}%
                      </span>
                    </div>
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
  )
}

function StatsDetailModal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stats-detail-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-2xl sm:max-h-[85vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-100 px-4 py-3">
          <h3
            id="stats-detail-modal-title"
            className="min-w-0 flex-1 text-base font-semibold text-neutral-900"
          >
            {title}
          </h3>
          <button
            type="button"
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-[#666666] hover:bg-stone-100"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-4 sm:pb-4 [-webkit-overflow-scrolling:touch]">
          {children}
        </div>
      </div>
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
