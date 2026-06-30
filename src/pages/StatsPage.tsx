import { differenceInCalendarDays, format, parse, subDays } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { StatsBuyerSummaryChart } from '../components/StatsBuyerSummaryChart'
import { StatsCustomSection } from '../components/StatsCustomSection'
import {
  StatsSharePieChart,
  StatsShareViewModeSwitch,
  type StatsShareViewMode,
} from '../components/StatsSharePieChart'
import { useLedger } from '../context/LedgerContext'
import type { LedgerRecord, ProductCatalogEntry } from '../types'
import {
  getAnchorDateForOffset,
  getCurrentReportRange,
  getPreviousReportRange,
  type ReportKind,
  toDateStr,
} from '../utils/reportRange'
import { getAmountFieldId, sumOutstanding } from '../utils/recordHelpers'
import { getProductChartColor } from '../utils/productColors'
import {
  aggregateBuyerOutstanding,
  aggregateBuyerProductRows,
  aggregateProductSales,
  chartDataWithOther,
  collectDistinctBuyersForStats,
  collectDistinctProductsForStats,
  CUSTOM_STATS_CHART_OTHER,
  findFieldIdByName,
  sumAmount,
  type ProductSalesRow,
  type StatsDimensionFilter,
} from '../utils/stats'
import {
  buildStatsDrillDownHint,
  type StatsDrillDownPayload,
} from '../utils/statsDrillDown'
import {
  BASE_STAT_UNIT,
  collectDistinctStatUnits,
  jinToUnitQuantity,
} from '../utils/productUnits'

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

/** 占比表:按斤数或金额排序 */
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

type BuyerSummaryRow = {
  buyer: string
  jin: number
  amount: number
  outstanding: number
}

type BuyerSummarySortKey = 'jin' | 'amount' | 'outstanding'
type BuyerSummarySort = { key: BuyerSummarySortKey; dir: 'asc' | 'desc' }

function compareBuyerSummaryRows(
  a: BuyerSummaryRow,
  b: BuyerSummaryRow,
  key: BuyerSummarySortKey,
  dir: 'asc' | 'desc',
): number {
  const m = dir === 'desc' ? -1 : 1
  const va = key === 'jin' ? a.jin : key === 'amount' ? a.amount : a.outstanding
  const vb = key === 'jin' ? b.jin : key === 'amount' ? b.amount : b.outstanding
  const d = va - vb
  if (d !== 0) return m * d
  return a.buyer.localeCompare(b.buyer, 'zh-CN')
}

type StatsRangeMode = 'preset' | 'custom'

export function StatsPage() {
  const navigate = useNavigate()
  const { ready, fields, records, productCatalog } = useLedger()
  const [statsQtyUnit, setStatsQtyUnit] = useState(BASE_STAT_UNIT)
  const [kind, setKind] = useState<ReportKind>('month')
  /** 0=当前周期,-1=上一周期,不可大于 0(不向未来空周期) */
  const [periodOffset, setPeriodOffset] = useState(0)
  const [rangeMode, setRangeMode] = useState<StatsRangeMode>('preset')
  const [customStartStr, setCustomStartStr] = useState('')
  const [customEndStr, setCustomEndStr] = useState('')
  const [customStatsOpen, setCustomStatsOpen] = useState(false)
  const [statsDetailModal, setStatsDetailModal] = useState<
    null | 'product' | 'buyerProduct'
  >(null)
  const [productShareSort, setProductShareSort] =
    useState<StatsJinAmtSort | null>(null)
  const [buyerSummarySort, setBuyerSummarySort] =
    useState<BuyerSummarySort>({ key: 'outstanding', dir: 'desc' })
  const [statsFilterBuyer, setStatsFilterBuyer] = useState('')
  const [statsFilterProduct, setStatsFilterProduct] = useState('')
  const [productPieMetric, setProductPieMetric] = useState<'jin' | 'amount'>(
    'amount',
  )
  const [productShareView, setProductShareView] =
    useState<StatsShareViewMode>('chart')
  const [buyerStatsView, setBuyerStatsView] =
    useState<StatsShareViewMode>('list')
  const [statsFilterOpen, setStatsFilterOpen] = useState(false)
  const statsFilterRef = useRef<HTMLDivElement>(null)

  const amountId =
    getAmountFieldId(fields) ?? findFieldIdByName(fields, '金额')

  const now = new Date()

  useEffect(() => {
    setPeriodOffset(0)
  }, [kind])

  useEffect(() => {
    if (!statsFilterOpen) return
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = statsFilterRef.current
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setStatsFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [statsFilterOpen])

  const anchorDate = useMemo(
    () => getAnchorDateForOffset(kind, periodOffset, now),
    [kind, periodOffset],
  )

  const currentBounds = useMemo(
    () => getCurrentReportRange(kind, anchorDate),
    [kind, anchorDate],
  )

  const curStart = toDateStr(currentBounds.start)
  const curEnd = toDateStr(currentBounds.end)

  const customRangeSorted = useMemo(() => {
    if (!customStartStr || !customEndStr) return null
    if (customStartStr <= customEndStr)
      return { startStr: customStartStr, endStr: customEndStr }
    return { startStr: customEndStr, endStr: customStartStr }
  }, [customStartStr, customEndStr])

  /** 自定义但未选全日期时不用预设区间,避免界面与数据不一致 */
  const emptyRangeAnchor = useMemo(
    () => parse('2099-01-01', 'yyyy-MM-dd', new Date()),
    [],
  )

  const activeStartStr =
    rangeMode === 'custom'
      ? customRangeSorted
        ? customRangeSorted.startStr
        : toDateStr(emptyRangeAnchor)
      : curStart
  const activeEndStr =
    rangeMode === 'custom'
      ? customRangeSorted
        ? customRangeSorted.endStr
        : toDateStr(emptyRangeAnchor)
      : curEnd

  const prevBounds = useMemo(() => {
    if (rangeMode === 'custom') {
      if (!customRangeSorted)
        return { start: emptyRangeAnchor, end: emptyRangeAnchor }
      const s = parse(customRangeSorted.startStr, 'yyyy-MM-dd', new Date())
      const e = parse(customRangeSorted.endStr, 'yyyy-MM-dd', new Date())
      const days = differenceInCalendarDays(e, s) + 1
      if (days < 1) return { start: emptyRangeAnchor, end: emptyRangeAnchor }
      const prevEnd = subDays(s, 1)
      const prevStart = subDays(prevEnd, days - 1)
      return { start: prevStart, end: prevEnd }
    }
    return getPreviousReportRange(kind, anchorDate)
  }, [
    rangeMode,
    customRangeSorted,
    kind,
    anchorDate,
    emptyRangeAnchor,
  ])

  const prevStart = toDateStr(prevBounds.start)
  const prevEnd = toDateStr(prevBounds.end)

  const rangeTitle = useMemo(() => {
    if (rangeMode === 'custom') {
      if (!customRangeSorted) return '请选择开始与结束日期'
      const a = format(
        parse(customRangeSorted.startStr, 'yyyy-MM-dd', new Date()),
        'yyyy年M月d日',
        { locale: zhCN },
      )
      const b = format(
        parse(customRangeSorted.endStr, 'yyyy-MM-dd', new Date()),
        'yyyy年M月d日',
        { locale: zhCN },
      )
      return `${a} — ${b}(自定义)`
    }
    const a = format(currentBounds.start, 'yyyy年M月d日', { locale: zhCN })
    const b = format(currentBounds.end, 'yyyy年M月d日', { locale: zhCN })
    let tag: string
    if (periodOffset === 0) {
      tag =
        kind === 'week'
          ? '本周,周一至周日'
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
    return `${a} — ${b}(${tag})`
  }, [rangeMode, customRangeSorted, kind, currentBounds, periodOffset])

  const compareLabel =
    rangeMode === 'custom'
      ? '较上一等长时段'
      : kind === 'week'
        ? '较上周'
        : kind === 'month'
          ? '较上月'
          : '较去年'

  const currentRecords = useMemo(
    () => filterByRange(records, activeStartStr, activeEndStr),
    [records, activeStartStr, activeEndStr],
  )
  const prevRecords = useMemo(
    () => filterByRange(records, prevStart, prevEnd),
    [records, prevStart, prevEnd],
  )

  useEffect(() => {
    setStatsFilterBuyer('')
    setStatsFilterProduct('')
  }, [activeStartStr, activeEndStr])

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

  const drillToBills = useCallback(
    (clicked: { product?: string; buyer?: string }) => {
      if (rangeMode === 'custom' && !customRangeSorted) return
      const product = clicked.product
        ? clicked.product
        : statsFilterProduct.trim() || undefined
      const plate = clicked.buyer
        ? clicked.buyer
        : statsFilterBuyer.trim() || undefined
      const payload: StatsDrillDownPayload = {
        dateFrom: activeStartStr,
        dateTo: activeEndStr,
        ...(plate ? { plate } : {}),
        ...(product ? { product } : {}),
      }
      navigate('/', {
        state: {
          statsDrillDown: {
            ...payload,
            hint: buildStatsDrillDownHint(payload),
          },
        },
      })
    },
    [
      navigate,
      rangeMode,
      customRangeSorted,
      statsFilterProduct,
      statsFilterBuyer,
      activeStartStr,
      activeEndStr,
    ],
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

  const statUnitOptions = useMemo(
    () => collectDistinctStatUnits(productCatalog),
    [productCatalog],
  )

  useEffect(() => {
    if (!statUnitOptions.includes(statsQtyUnit)) {
      setStatsQtyUnit(BASE_STAT_UNIT)
    }
  }, [statUnitOptions, statsQtyUnit])

  const displayQtyForProduct = useCallback(
    (jin: number, productName: string) => {
      if (statsQtyUnit === BASE_STAT_UNIT) return jin
      return jinToUnitQuantity(jin, statsQtyUnit, productName, productCatalog)
    },
    [statsQtyUnit, productCatalog],
  )

  const products = useMemo(
    () =>
      aggregateProductSales(
        currentRecords,
        fields,
        amountId,
        statsDimFilter,
        productCatalog,
      ),
    [currentRecords, fields, amountId, statsDimFilter, productCatalog],
  )
  const buyerProductRows = useMemo(
    () =>
      aggregateBuyerProductRows(
        currentRecords,
        fields,
        amountId,
        statsDimFilter,
        productCatalog,
      ),
    [currentRecords, fields, amountId, statsDimFilter, productCatalog],
  )
  const buyerOutstandingRows = useMemo(
    () => aggregateBuyerOutstanding(currentRecords, fields, statsDimFilter),
    [currentRecords, fields, statsDimFilter],
  )

  const buyerOutstandingMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of buyerOutstandingRows) {
      m.set(r.buyer, r.outstanding)
    }
    return m
  }, [buyerOutstandingRows])

  /** 按购买方汇总:总数量(按所选单位)、总金额、未核账 */
  const buyerSummaryRows = useMemo(() => {
    const m = new Map<string, { jin: number; amount: number }>()
    for (const r of buyerProductRows) {
      const t = m.get(r.buyer) || { jin: 0, amount: 0 }
      t.jin += displayQtyForProduct(r.jin, r.product)
      t.amount += r.amount
      m.set(r.buyer, t)
    }
    for (const r of buyerOutstandingRows) {
      if (!m.has(r.buyer)) m.set(r.buyer, { jin: 0, amount: 0 })
    }
    return [...m.entries()]
      .map(([buyer, v]) => ({
        buyer,
        jin: v.jin,
        amount: v.amount,
        outstanding: buyerOutstandingMap.get(buyer) ?? 0,
      }))
      .sort((a, b) => a.buyer.localeCompare(b.buyer, 'zh-CN'))
  }, [
    buyerProductRows,
    buyerOutstandingRows,
    buyerOutstandingMap,
    displayQtyForProduct,
  ])

  const totalDisplayQty = products.reduce(
    (s, r) => s + displayQtyForProduct(r.jin, r.name),
    0,
  )
  const totalProductAmt = products.reduce((s, r) => s + r.amount, 0)
  const productDisplayQty = (row: ProductSalesRow) =>
    displayQtyForProduct(row.jin, row.name)
  const maxJinBar =
    products.length > 0
      ? Math.max(...products.map((r) => productDisplayQty(r)), 1e-6)
      : 1
  const qtyUnitLabel = statsQtyUnit
  const maxAmtBar =
    products.length > 0
      ? Math.max(...products.map((r) => r.amount), 1e-6)
      : 1

  const sortedProductShareRows = useMemo(() => {
    if (!productShareSort) return products
    const list = [...products]
    list.sort((a, b) =>
      compareProductSalesRows(a, b, productShareSort.key, productShareSort.dir),
    )
    return list
  }, [products, productShareSort])

  const productPieMetricEffective: 'jin' | 'amount' =
    productPieMetric === 'amount' && amountId ? 'amount' : 'jin'

  const productPieData = useMemo(() => {
    const rows = products.map((p) => ({
      key: p.name,
      value:
        productPieMetricEffective === 'amount'
          ? p.amount
          : productDisplayQty(p),
    }))
    return chartDataWithOther(rows)
  }, [products, productPieMetricEffective, statsQtyUnit, productCatalog])

  const totalBuyerJin = buyerSummaryRows.reduce((s, r) => s + r.jin, 0)
  const totalBuyerAmt = buyerSummaryRows.reduce((s, r) => s + r.amount, 0)
  const totalBuyerOutstanding = buyerSummaryRows.reduce(
    (s, r) => s + r.outstanding,
    0,
  )
  const maxBuyerJin =
    buyerSummaryRows.length > 0
      ? Math.max(...buyerSummaryRows.map((r) => r.jin), 1e-6)
      : 1
  const maxBuyerAmt =
    buyerSummaryRows.length > 0
      ? Math.max(...buyerSummaryRows.map((r) => r.amount), 1e-6)
      : 1
  const maxBuyerOutstanding =
    buyerSummaryRows.length > 0
      ? Math.max(...buyerSummaryRows.map((r) => r.outstanding), 1e-6)
      : 1

  const sortedBuyerSummaryRows = useMemo(() => {
    if (!buyerSummarySort) return buyerSummaryRows
    const list = [...buyerSummaryRows]
    list.sort((a, b) =>
      compareBuyerSummaryRows(
        a,
        b,
        buyerSummarySort.key,
        buyerSummarySort.dir,
      ),
    )
    return list
  }, [buyerSummaryRows, buyerSummarySort])

  const hasBuyerStatsSection = buyerSummaryRows.length > 0

  const toggleProductShareSort = useCallback((key: StatsJinAmtSortKey) => {
    setProductShareSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'desc' }
      return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
    })
  }, [])

  const toggleBuyerSummarySort = useCallback(
    (key: BuyerSummarySortKey) => {
      if ((key === 'amount' || key === 'outstanding') && !amountId) return
      setBuyerSummarySort((prev) => {
        if (!prev || prev.key !== key) return { key, dir: 'desc' }
        return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      })
    },
    [amountId],
  )

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-kj-bg text-kj-muted">
        加载中…
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-kj-bg pb-28 pt-12">
      <header className="mb-4 px-4">
        <h1 className="text-[22px] font-bold tracking-tight text-kj-primary">
          统计分析
        </h1>
        <p className="mt-0.5 text-xs leading-relaxed text-kj-secondary">
          按周/月/年或自定义起止日期查看,可与上期对比。
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
            onClick={() => {
              setRangeMode('preset')
              setKind(k)
            }}
            className={`rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition-colors ${
              rangeMode === 'preset' && kind === k
                ? 'bg-[#2ecc71] text-white hover:bg-[#27ae60]'
                : 'border border-kj-border bg-kj-surface text-kj-secondary hover:bg-kj-hover'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setRangeMode('custom')
            setCustomStartStr(curStart)
            setCustomEndStr(curEnd)
          }}
          className={`rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition-colors ${
            rangeMode === 'custom'
              ? 'bg-[#2ecc71] text-white hover:bg-[#27ae60]'
              : 'border border-kj-border bg-kj-surface text-kj-secondary hover:bg-kj-hover'
          }`}
        >
          自定义
        </button>
      </div>

      {rangeMode === 'custom' && (
        <div className="mx-4 mb-4 flex flex-col gap-3 rounded-2xl border border-kj-border bg-kj-surface p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex min-w-[140px] flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium text-kj-secondary">开始日期</span>
            <input
              type="date"
              value={customStartStr}
              onChange={(e) => setCustomStartStr(e.target.value)}
              className="w-full rounded-xl border border-kj-border bg-kj-raised px-3 py-2.5 text-sm text-kj-primary"
            />
          </label>
          <label className="flex min-w-[140px] flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium text-kj-secondary">结束日期</span>
            <input
              type="date"
              value={customEndStr}
              onChange={(e) => setCustomEndStr(e.target.value)}
              className="w-full rounded-xl border border-kj-border bg-kj-raised px-3 py-2.5 text-sm text-kj-primary"
            />
          </label>
          <p className="text-[11px] leading-relaxed text-kj-muted sm:pb-2">
            含起止两天;环比为紧邻上一段等长日历区间。
          </p>
        </div>
      )}

      <div className="mx-4 mb-4 flex items-center gap-2 rounded-2xl border border-kj-border bg-kj-surface px-2 py-2 shadow-sm">
        {rangeMode === 'preset' ? (
          <>
            <button
              type="button"
              aria-label="上一周期"
              onClick={() => setPeriodOffset((o) => o - 1)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-kj-border bg-kj-raised text-kj-secondary transition-colors hover:bg-kj-hover"
            >
              <StatsChevronLeft className="h-5 w-5" />
            </button>
            <p className="min-w-0 flex-1 px-1 text-center text-xs leading-relaxed text-kj-secondary">
              {rangeTitle}
            </p>
            <button
              type="button"
              aria-label="下一周期"
              disabled={periodOffset >= 0}
              onClick={() => setPeriodOffset((o) => Math.min(0, o + 1))}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-kj-border bg-kj-raised text-kj-secondary transition-colors hover:bg-kj-hover disabled:pointer-events-none disabled:opacity-35"
            >
              <StatsChevronRight className="h-5 w-5" />
            </button>
          </>
        ) : (
          <p className="min-w-0 flex-1 px-1 py-2 text-center text-xs leading-relaxed text-kj-secondary">
            {rangeTitle}
          </p>
        )}
      </div>

      <section className="mx-4 mb-6 rounded-2xl border border-kj-border bg-kj-surface p-4 shadow-sm sm:p-5">
        <p className="text-xs font-medium text-kj-secondary">
          {rangeMode === 'custom'
            ? '该时段汇总'
            : periodOffset === 0
              ? `${kind === 'week' ? '本周' : kind === 'month' ? '本月' : '本年'}汇总`
              : '该周期汇总'}
        </p>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs text-kj-secondary">应收总金额(元)</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-kj-primary">
              {amountId ? fmtMoney(totalAmount) : '—'}
            </p>
            {!amountId && (
              <p className="mt-1 text-[11px] text-kj-muted">需「金额」列</p>
            )}
          </div>
          <div>
            <p className="text-xs text-kj-secondary">未收款合计(元)</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-kj-warning-text">
              {amountId ? fmtMoney(totalOutstanding) : '—'}
            </p>
            {!amountId && (
              <p className="mt-1 text-[11px] text-kj-muted">需金额列</p>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 border-t border-kj-border pt-5 sm:grid-cols-2">
          <div>
            <p className="text-xs text-kj-secondary">{compareLabel} · 金额(元)</p>
            <p
              className={`mt-1 text-xl font-bold tabular-nums ${
                !amountId
                  ? 'text-kj-muted'
                  : diffAmount > 0
                    ? 'text-[#2ecc71]'
                    : diffAmount < 0
                      ? 'text-rose-600'
                      : 'text-kj-primary'
              }`}
            >
              {amountId ? fmtSignedMoney(diffAmount) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-kj-secondary">{compareLabel} · 成交单数</p>
            <p
              className={`mt-1 text-xl font-bold tabular-nums ${
                diffCount > 0
                  ? 'text-[#2ecc71]'
                  : diffCount < 0
                    ? 'text-rose-600'
                    : 'text-kj-primary'
              }`}
            >
              {fmtSignedInt(diffCount)}
            </p>
          </div>
        </div>
        <p className="mt-4 border-t border-kj-border pt-4 text-center text-[11px] leading-relaxed text-kj-muted">
          上期:{format(prevBounds.start, 'M月d日', { locale: zhCN })} —{' '}
          {format(prevBounds.end, 'M月d日', { locale: zhCN })}
        </p>
      </section>

      {currentRecords.length === 0 && (
        <div className="mx-4 mb-6 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-kj-border bg-kj-surface py-10 text-sm text-kj-secondary">
          <span>
            {rangeMode === 'custom' ? '该时段暂无账单' : '本周期暂无账单'}
          </span>
        </div>
      )}

      {currentRecords.length > 0 && (
        <>
          <section className="mx-4 mb-6">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-kj-primary">
                {buyerFieldName}汇总与未核账
              </h2>
              <StatsChartsFilter
                filterRef={statsFilterRef}
                open={statsFilterOpen}
                onOpenChange={setStatsFilterOpen}
                filtered={statsChartsFiltered}
                buyerFieldName={buyerFieldName}
                productFieldName={productFieldName}
                buyer={statsFilterBuyer}
                product={statsFilterProduct}
                onBuyerChange={setStatsFilterBuyer}
                onProductChange={setStatsFilterProduct}
                buyerOptions={statsBuyerOptions}
                productOptions={statsProductOptions}
                onClear={() => {
                  setStatsFilterBuyer('')
                  setStatsFilterProduct('')
                }}
              />
            </div>
            <p className="mb-3 mt-1 text-[11px] leading-relaxed text-kj-secondary">
              横轴为购买方,柱状图展示总数量(按所选统计单位)、总金额与未核账。
            </p>
            {statUnitOptions.length > 1 ? (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-kj-secondary">统计数量单位</span>
                <select
                  value={statsQtyUnit}
                  onChange={(e) => setStatsQtyUnit(e.target.value)}
                  className="rounded-lg border border-kj-border-strong bg-kj-raised px-2 py-1.5 text-kj-primary"
                >
                  {statUnitOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {!hasBuyerStatsSection ? (
              <div className="rounded-2xl border border-dashed border-kj-border bg-kj-surface py-8 text-center text-sm text-kj-secondary">
                {!amountId
                  ? '需多行商品明细;未核账需金额列'
                  : buyerProductRows.length === 0
                    ? '需多行商品明细'
                    : rangeMode === 'custom'
                      ? '该时段暂无数据'
                      : '本周期暂无数据'}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-kj-border bg-kj-surface shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-kj-border px-3 py-2.5">
                  <StatsShareViewModeSwitch
                    mode={buyerStatsView}
                    onChange={setBuyerStatsView}
                    chartLabel="柱状图"
                    listLabel="列表"
                  />
                  {buyerStatsView === 'list' ? (
                    <button
                      type="button"
                      onClick={() => setStatsDetailModal('buyerProduct')}
                      className="ml-auto shrink-0 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-[#1a7f4c] hover:bg-emerald-100"
                    >
                      大屏查看
                    </button>
                  ) : null}
                </div>
                {buyerStatsView === 'chart' ? (
                  <div className="p-3 pt-2">
                    <StatsBuyerSummaryChart
                      rows={sortedBuyerSummaryRows}
                      amountId={Boolean(amountId)}
                      emptyMessage="暂无购买方数据"
                      onBuyerClick={(buyer) => drillToBills({ buyer })}
                    />
                  </div>
                ) : (
                  <div className="max-h-[min(52vh,22rem)] overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] px-2 pb-2 pt-1 sm:px-3">
                    <BuyerSummaryTable
                      buyerFieldName={buyerFieldName}
                      rows={sortedBuyerSummaryRows}
                      amountId={amountId}
                      totalJin={totalBuyerJin}
                      qtyUnitLabel={qtyUnitLabel}
                      totalAmt={totalBuyerAmt}
                      totalOutstanding={totalBuyerOutstanding}
                      maxJin={maxBuyerJin}
                      maxAmt={maxBuyerAmt}
                      maxOutstanding={maxBuyerOutstanding}
                      sort={buyerSummarySort}
                      onSortKey={toggleBuyerSummarySort}
                      onBuyerClick={(buyer) => drillToBills({ buyer })}
                    />
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="mx-4 mb-10">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-kj-primary">
                商品销售占比
              </h2>
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-kj-secondary">
              切换饼图或列表查看;数量按商品目录换算,统计单位与上方购买方汇总一致。
            </p>
            <div className="overflow-hidden rounded-2xl border border-kj-border bg-kj-surface shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-kj-border px-3 py-2.5">
                <StatsShareViewModeSwitch
                  mode={productShareView}
                  onChange={setProductShareView}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {amountId && productShareView === 'chart' ? (
                    <div className="flex gap-1 rounded-lg border border-kj-border bg-kj-raised p-0.5">
                      <button
                        type="button"
                        onClick={() => setProductPieMetric('jin')}
                        className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                          productPieMetricEffective === 'jin'
                            ? 'bg-[#2ecc71] text-white'
                            : 'text-kj-secondary hover:text-kj-primary'
                        }`}
                      >
                        按{qtyUnitLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => setProductPieMetric('amount')}
                        className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                          productPieMetricEffective === 'amount'
                            ? 'bg-[#2ecc71] text-white'
                            : 'text-kj-secondary hover:text-kj-primary'
                        }`}
                      >
                        按金额
                      </button>
                    </div>
                  ) : null}
                  {productShareView === 'list' ? (
                    <button
                      type="button"
                      onClick={() => setStatsDetailModal('product')}
                      className="shrink-0 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-[#1a7f4c] hover:bg-emerald-100"
                    >
                      大屏查看
                    </button>
                  ) : null}
                </div>
              </div>
              {productShareView === 'chart' ? (
                <div className="p-3 pt-2">
                  <StatsSharePieChart
                    data={productPieData}
                    productCatalog={productCatalog}
                    formatValue={(n) =>
                      productPieMetricEffective === 'amount'
                        ? `¥${fmtMoney(n)}`
                        : `${fmtNum(n)} ${qtyUnitLabel}`
                    }
                    emptyMessage={
                      products.length === 0
                        ? '暂无商品数据'
                        : '暂无有效数值'
                    }
                    onItemClick={(name) => drillToBills({ product: name })}
                    nonClickableNames={[CUSTOM_STATS_CHART_OTHER]}
                  />
                </div>
              ) : (
                <div className="max-h-[min(52vh,22rem)] overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] px-2 pb-2 pt-1 sm:px-3">
                  <ProductSalesShareTable
                    products={sortedProductShareRows}
                    productCatalog={productCatalog}
                    totalJin={totalDisplayQty}
                    qtyUnitLabel={qtyUnitLabel}
                    rowDisplayQty={productDisplayQty}
                    totalProductAmt={totalProductAmt}
                    amountId={amountId}
                    maxJinBar={maxJinBar}
                    maxAmtBar={maxAmtBar}
                    sort={productShareSort}
                    onSortKey={toggleProductShareSort}
                    onProductClick={(name) => drillToBills({ product: name })}
                  />
                </div>
              )}
            </div>
          </section>



          <div className="mx-4 mb-3 flex justify-end">
            <button
              type="button"
              onClick={() => setCustomStatsOpen((o) => !o)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition-colors ${
                customStatsOpen
                  ? 'border border-kj-border bg-kj-surface text-kj-secondary hover:bg-kj-hover'
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
              productCatalog={productCatalog}
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
              ? `${buyerFieldName}汇总与未核账`
              : ''
        }
        onClose={() => setStatsDetailModal(null)}
      >
        {statsDetailModal === 'product' && (
          <ProductSalesShareTable
            products={sortedProductShareRows}
            productCatalog={productCatalog}
            totalJin={totalDisplayQty}
            qtyUnitLabel={qtyUnitLabel}
            rowDisplayQty={productDisplayQty}
            totalProductAmt={totalProductAmt}
            amountId={amountId}
            maxJinBar={maxJinBar}
            maxAmtBar={maxAmtBar}
            sort={productShareSort}
            onSortKey={toggleProductShareSort}
            onProductClick={(name) => drillToBills({ product: name })}
            relaxed
          />
        )}
        {statsDetailModal === 'buyerProduct' && (
          <BuyerSummaryTable
            buyerFieldName={buyerFieldName}
            rows={sortedBuyerSummaryRows}
            amountId={amountId}
            totalJin={totalBuyerJin}
            qtyUnitLabel={qtyUnitLabel}
            totalAmt={totalBuyerAmt}
            totalOutstanding={totalBuyerOutstanding}
            maxJin={maxBuyerJin}
            maxAmt={maxBuyerAmt}
            maxOutstanding={maxBuyerOutstanding}
            sort={buyerSummarySort}
            onSortKey={toggleBuyerSummarySort}
            onBuyerClick={(buyer) => drillToBills({ buyer })}
            relaxed
          />
        )}
      </StatsDetailModal>
    </div>
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
      className={`${thPad} pl-2 text-kj-secondary ${widthClass}`}
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
        className={`inline-flex max-w-full items-center gap-1 rounded-lg py-0.5 pr-1 text-left font-medium text-kj-secondary transition-colors hover:bg-kj-hover hover:text-kj-primary disabled:pointer-events-none disabled:opacity-40 ${relaxed ? 'text-sm' : 'text-xs'}`}
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

const PCT_INSIDE_BAR_MIN_WIDTH = 25

const PCT_LABEL_BY_BAR: Record<string, string> = {
  'bg-amber-500': 'text-amber-600',
  'bg-[#1a7f4c]': 'text-[#1a7f4c]',
  'bg-teal-500': 'text-teal-600',
  'bg-[#2ecc71]': 'text-[#1a7f4c]',
}

function StatsShareMetricCell({
  valueLine,
  pct,
  barPct,
  barClassName,
  valLineClass,
  pctTextClass,
  relaxed,
}: {
  valueLine: string
  pct: number
  barPct: number
  barClassName: string
  valLineClass: string
  pctTextClass: string
  relaxed?: boolean
}) {
  const pctLabel = `${pct.toFixed(1)}%`
  const w = Math.min(100, Math.max(0, barPct))
  const pctInside = pct > PCT_INSIDE_BAR_MIN_WIDTH
  const barH = relaxed ? 'h-5' : 'h-4'
  const pctClass =
    PCT_LABEL_BY_BAR[barClassName] ?? 'text-kj-secondary'

  return (
    <div className={relaxed ? 'space-y-1' : 'space-y-0.5'}>
      <div className={valLineClass}>{valueLine}</div>
      <div className="flex w-full min-w-0 items-center gap-1">
        <div
          className={`relative ${barH} shrink-0 rounded-full ${barClassName}`}
          style={{ width: `${w}%`, minWidth: w > 0 ? '4px' : undefined }}
        >
          {pctInside ? (
            <span className="absolute inset-y-0 right-0 flex items-center justify-end whitespace-nowrap px-1 text-[10px] font-medium leading-none tabular-nums text-white">
              {pctLabel}
            </span>
          ) : null}
        </div>
        {!pctInside ? (
          <span
            className={`shrink-0 whitespace-nowrap tabular-nums ${pctTextClass} ${pctClass}`}
          >
            {pctLabel}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function SortableBuyerSummaryTh({
  label,
  sortKey,
  sort,
  onSortKey,
  disabled,
  relaxed,
  widthClass,
}: {
  label: string
  sortKey: BuyerSummarySortKey
  sort: BuyerSummarySort | null
  onSortKey: (key: BuyerSummarySortKey) => void
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
      className={`${thPad} pl-2 text-kj-secondary ${widthClass}`}
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
        className={`inline-flex max-w-full items-center gap-1 rounded-lg py-0.5 pr-1 text-left font-medium text-kj-secondary transition-colors hover:bg-kj-hover hover:text-kj-primary disabled:pointer-events-none disabled:opacity-40 ${relaxed ? 'text-sm' : 'text-xs'}`}
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

function BuyerSummaryTable({
  buyerFieldName,
  rows,
  amountId,
  totalJin,
  qtyUnitLabel = BASE_STAT_UNIT,
  totalAmt,
  totalOutstanding,
  maxJin,
  maxAmt,
  maxOutstanding,
  sort,
  onSortKey,
  onBuyerClick,
  relaxed,
}: {
  buyerFieldName: string
  rows: BuyerSummaryRow[]
  amountId: string | null | undefined
  totalJin: number
  qtyUnitLabel?: string
  totalAmt: number
  totalOutstanding: number
  maxJin: number
  maxAmt: number
  maxOutstanding: number
  sort: BuyerSummarySort | null
  onSortKey: (key: BuyerSummarySortKey) => void
  onBuyerClick?: (buyer: string) => void
  relaxed?: boolean
}) {
  const th = relaxed
    ? 'px-2 py-2.5 text-left text-xs font-medium text-kj-secondary sm:px-3 sm:py-3 sm:text-sm'
    : 'px-1.5 py-2 text-left text-xs font-medium text-kj-secondary sm:px-2'
  const tdText = relaxed
    ? 'break-words px-1.5 py-2 text-xs font-semibold text-kj-primary sm:px-2 sm:py-2.5 sm:text-sm'
    : 'break-words px-1 py-2 text-xs font-semibold text-kj-primary sm:px-1.5'
  const valLine = relaxed
    ? 'text-sm tabular-nums text-kj-primary'
    : 'text-xs tabular-nums text-kj-primary sm:text-[13px]'
  const pctText = relaxed ? 'text-xs' : 'text-[11px]'
  const metricTd = relaxed ? 'px-1 py-2 align-top sm:px-1.5' : 'px-0.5 py-2 align-top sm:px-1'

  const hasOutCol = Boolean(amountId)
  const metricW = hasOutCol ? 'w-[22%]' : 'w-[28%]'

  return (
    <table className="w-full table-fixed text-left text-xs sm:text-sm">
      <thead className="sticky top-0 z-[1] bg-kj-surface shadow-[0_1px_0_0_rgb(245_245_244)]">
        <tr>
          <th className={`${th} ${hasOutCol ? 'w-[22%]' : 'w-[28%]'}`}>
            {buyerFieldName}
          </th>
          {hasOutCol ? (
            <SortableBuyerSummaryTh
              label="未核账"
              sortKey="outstanding"
              sort={sort}
              onSortKey={onSortKey}
              relaxed={relaxed}
              widthClass={metricW}
            />
          ) : null}
          <SortableBuyerSummaryTh
            label="总金额"
            sortKey="amount"
            sort={sort}
            onSortKey={onSortKey}
            disabled={!amountId}
            relaxed={relaxed}
            widthClass={metricW}
          />
          <SortableBuyerSummaryTh
            label={`总${qtyUnitLabel}`}
            sortKey="jin"
            sort={sort}
            onSortKey={onSortKey}
            relaxed={relaxed}
            widthClass={metricW}
          />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const jinPct = totalJin > 0 ? (row.jin / totalJin) * 100 : 0
          const amtPct = totalAmt > 0 ? (row.amount / totalAmt) * 100 : 0
          const outPct =
            totalOutstanding > 0 ? (row.outstanding / totalOutstanding) * 100 : 0
          const jinBar = Math.round((row.jin / maxJin) * 100)
          const amtBar = Math.round((row.amount / maxAmt) * 100)
          const outBar = Math.round((row.outstanding / maxOutstanding) * 100)
          const buyerCell = onBuyerClick ? (
            <button
              type="button"
              onClick={() => onBuyerClick(row.buyer)}
              className={`${tdText} w-full cursor-pointer text-left text-[#1a7f4c] underline decoration-[#1a7f4c]/30 underline-offset-2 hover:decoration-[#1a7f4c]`}
            >
              {row.buyer}
            </button>
          ) : (
            row.buyer
          )
          return (
            <tr
              key={row.buyer}
              className="border-b border-stone-50 last:border-0"
            >
              <td className={onBuyerClick ? 'p-0' : tdText}>{buyerCell}</td>
              {hasOutCol ? (
                <td className={metricTd}>
                  {row.outstanding > 0.005 ? (
                    <StatsShareMetricCell
                      valueLine={`¥${fmtMoney(row.outstanding)}`}
                      pct={outPct}
                      barPct={outBar}
                      barClassName="bg-amber-500"
                      valLineClass={valLine}
                      pctTextClass={pctText}
                      relaxed={relaxed}
                    />
                  ) : (
                    <span className="text-kj-muted">—</span>
                  )}
                </td>
              ) : null}
              <td className={metricTd}>
                {amountId ? (
                  row.amount > 0.005 ? (
                    <StatsShareMetricCell
                      valueLine={`${fmtMoney(row.amount)} 元`}
                      pct={amtPct}
                      barPct={amtBar}
                      barClassName="bg-[#1a7f4c]"
                      valLineClass={valLine}
                      pctTextClass={pctText}
                      relaxed={relaxed}
                    />
                  ) : (
                    <span className="text-kj-muted">—</span>
                  )
                ) : (
                  <span className="text-kj-muted">—</span>
                )}
              </td>
              <td className={metricTd}>
                {row.jin > 0 ? (
                  <StatsShareMetricCell
                    valueLine={`${fmtNum(row.jin)} ${qtyUnitLabel}`}
                    pct={jinPct}
                    barPct={jinBar}
                    barClassName="bg-teal-500"
                    valLineClass={valLine}
                    pctTextClass={pctText}
                    relaxed={relaxed}
                  />
                ) : (
                  <span className="text-kj-muted">—</span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ProductSalesShareTable({
  products,
  productCatalog = [],
  totalJin,
  qtyUnitLabel = BASE_STAT_UNIT,
  rowDisplayQty,
  totalProductAmt,
  amountId,
  maxJinBar,
  maxAmtBar,
  sort,
  onSortKey,
  onProductClick,
  relaxed,
}: {
  products: ProductSalesRow[]
  productCatalog?: ProductCatalogEntry[]
  totalJin: number
  qtyUnitLabel?: string
  rowDisplayQty?: (row: ProductSalesRow) => number
  totalProductAmt: number
  amountId: string | null | undefined
  maxJinBar: number
  maxAmtBar: number
  sort: StatsJinAmtSort | null
  onSortKey: (key: StatsJinAmtSortKey) => void
  onProductClick?: (name: string) => void
  relaxed?: boolean
}) {
  const th = relaxed
    ? 'px-3 py-3 text-left text-sm font-medium text-kj-secondary'
    : 'px-3 py-2.5 text-left text-xs font-medium text-kj-secondary'
  const tdName = relaxed
    ? 'max-w-[42vw] truncate px-3 py-3 text-base font-medium text-kj-primary sm:max-w-none'
    : 'max-w-[36vw] truncate px-3 py-2.5 text-sm font-medium text-kj-primary sm:max-w-none'
  const valLine = relaxed
    ? 'text-sm tabular-nums text-kj-secondary'
    : 'text-[11px] tabular-nums text-kj-secondary'
  const pctText = relaxed ? 'text-sm' : 'text-xs'
  const qtyOf = rowDisplayQty ?? ((row: ProductSalesRow) => row.jin)

  return (
    <table className="w-full text-left text-sm">
      <thead className="sticky top-0 z-[1] bg-kj-surface shadow-[0_1px_0_0_rgb(245_245_244)]">
        <tr>
          <th className={th}>商品</th>
          <SortableShareMetricTh
            label={`${qtyUnitLabel}占比`}
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
        {products.map((row, rowIndex) => {
          const rowQty = qtyOf(row)
          const jinPct = totalJin > 0 ? (rowQty / totalJin) * 100 : 0
          const amtPct =
            amountId && totalProductAmt > 0
              ? (row.amount / totalProductAmt) * 100
              : 0
          const jinBar = Math.round((rowQty / maxJinBar) * 100)
          const amtBar = Math.round((row.amount / maxAmtBar) * 100)
          const barColor = getProductChartColor(
            row.name,
            productCatalog,
            rowIndex,
          )
          const nameCell = onProductClick ? (
            <button
              type="button"
              onClick={() => onProductClick(row.name)}
              className={`${tdName} block w-full cursor-pointer truncate text-left text-[#1a7f4c] underline decoration-[#1a7f4c]/30 underline-offset-2 hover:decoration-[#1a7f4c]`}
            >
              {row.name}
            </button>
          ) : (
            row.name
          )
          return (
            <tr
              key={row.name}
              className="border-b border-stone-50 last:border-0"
            >
              <td className={onProductClick ? 'py-2 pl-3 pr-1' : tdName}>
                {nameCell}
              </td>
              <td className="py-2 pl-2 align-top">
                <div className="space-y-1">
                  <div className={valLine}>
                    {fmtNum(rowQty)} {qtyUnitLabel}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-kj-raised">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${jinBar}%`,
                          backgroundColor: barColor,
                        }}
                      />
                    </div>
                    <span
                      className={`w-12 shrink-0 text-right tabular-nums text-kj-muted ${pctText}`}
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
                      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-kj-raised">
                        <div
                          className="h-full rounded-full opacity-85"
                          style={{
                            width: `${amtBar}%`,
                            backgroundColor: barColor,
                          }}
                        />
                      </div>
                      <span
                        className={`w-12 shrink-0 text-right tabular-nums text-kj-muted ${pctText}`}
                      >
                        {amtPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="text-kj-muted">—</span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function StatsChartsFilter({
  filterRef,
  open,
  onOpenChange,
  filtered,
  buyerFieldName,
  productFieldName,
  buyer,
  product,
  onBuyerChange,
  onProductChange,
  buyerOptions,
  productOptions,
  onClear,
}: {
  filterRef: RefObject<HTMLDivElement | null>
  open: boolean
  onOpenChange: (open: boolean) => void
  filtered: boolean
  buyerFieldName: string
  productFieldName: string
  buyer: string
  product: string
  onBuyerChange: (value: string) => void
  onProductChange: (value: string) => void
  buyerOptions: string[]
  productOptions: string[]
  onClear: () => void
}) {
  return (
    <div ref={filterRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-semibold shadow-sm transition-colors ${
          filtered
            ? 'border-[#2ecc71] bg-emerald-50 text-[#1a7f4c] hover:bg-emerald-100'
            : 'border-kj-border bg-kj-surface text-kj-secondary hover:bg-kj-hover'
        }`}
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
        筛选
        {filtered ? (
          <span className="h-1.5 w-1.5 rounded-full bg-[#2ecc71]" />
        ) : null}
      </button>
      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(calc(100vw-2rem),18rem)] rounded-2xl border border-kj-border bg-kj-surface p-3 shadow-lg"
          role="dialog"
          aria-label="筛选条件"
        >
          <p className="mb-3 text-[11px] leading-relaxed text-kj-secondary">
            下方图表共用;两条件为「且」。筛{productFieldName}时,未核账仍按整单计。
          </p>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-kj-secondary">
                {buyerFieldName}
              </span>
              <select
                value={buyer}
                onChange={(e) => onBuyerChange(e.target.value)}
                className="w-full rounded-xl border border-kj-border bg-kj-raised px-3 py-2.5 text-sm text-kj-primary"
              >
                <option value="">全部</option>
                {buyerOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-kj-secondary">
                {productFieldName}
              </span>
              <select
                value={product}
                onChange={(e) => onProductChange(e.target.value)}
                className="w-full rounded-xl border border-kj-border bg-kj-raised px-3 py-2.5 text-sm text-kj-primary"
              >
                <option value="">全部</option>
                {productOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {filtered ? (
            <button
              type="button"
              onClick={onClear}
              className="mt-3 w-full rounded-lg border border-kj-border py-2 text-xs font-medium text-kj-secondary hover:bg-kj-hover"
            >
              清除筛选
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mt-2 w-full rounded-lg bg-[#2ecc71] py-2 text-xs font-semibold text-white hover:bg-[#27ae60]"
          >
            完成
          </button>
        </div>
      ) : null}
    </div>
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
        className="flex max-h-[min(92dvh,40rem)] w-full max-w-lg flex-col rounded-t-2xl bg-kj-surface shadow-2xl sm:max-h-[85vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-kj-border px-4 py-3">
          <h3
            id="stats-detail-modal-title"
            className="min-w-0 flex-1 text-base font-semibold text-kj-primary"
          >
            {title}
          </h3>
          <button
            type="button"
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-kj-secondary hover:bg-kj-hover"
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
