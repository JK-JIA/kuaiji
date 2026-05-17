import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
  type WheelEvent,
} from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getThemeColors, useThemeColors } from '../utils/themeColors'
import { STATS_CHART_COLORS } from './StatsSharePieChart'

/** 与饼图一致：浅绿 / 深绿 / 橙 */
const METRIC_AMOUNT_COLOR = STATS_CHART_COLORS[0] // #2ecc71
const METRIC_JIN_COLOR = STATS_CHART_COLORS[4] // #3498db，与饼图蓝一致
const METRIC_OUTSTANDING_COLOR = STATS_CHART_COLORS[2] // #f39c12

export type BuyerSummaryChartRow = {
  buyer: string
  jin: number
  amount: number
  outstanding: number
}

type MetricKey = 'amount' | 'outstanding' | 'jin'

const ZOOM_MIN = 0.65
const ZOOM_MAX = 1.2

/** 每组柱顺序：总金额 → 未核账 → 总斤数 */
const METRICS: {
  key: MetricKey
  name: string
  label: string
  color: string
  yAxisId: 'money' | 'jin'
}[] = [
  {
    key: 'amount',
    name: '总金额',
    label: '总金额',
    color: METRIC_AMOUNT_COLOR,
    yAxisId: 'money',
  },
  {
    key: 'outstanding',
    name: '未核账金额',
    label: '未核账',
    color: METRIC_OUTSTANDING_COLOR,
    yAxisId: 'money',
  },
  {
    key: 'jin',
    name: '总斤数',
    label: '总斤数',
    color: METRIC_JIN_COLOR,
    yAxisId: 'jin',
  },
]

const SEGMENT_BTN =
  'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap'
const SEGMENT_ACTIVE = 'bg-[#2ecc71] text-white shadow-sm'
const SEGMENT_IDLE =
  'text-kj-secondary hover:bg-kj-raised hover:text-kj-primary'

function MetricSwitcher({
  metrics,
  active,
  onChange,
}: {
  metrics: typeof METRICS
  active: MetricKey | null
  onChange: (key: MetricKey | null) => void
}) {
  return (
    <div
      className="flex max-w-full gap-0.5 overflow-x-auto rounded-lg border border-kj-border bg-kj-raised p-0.5 [-webkit-overflow-scrolling:touch]"
      role="tablist"
      aria-label="切换统计指标"
    >
      <button
        type="button"
        role="tab"
        aria-selected={active === null}
        onClick={() => onChange(null)}
        className={`${SEGMENT_BTN} ${active === null ? SEGMENT_ACTIVE : SEGMENT_IDLE}`}
      >
        全部
      </button>
      {metrics.map((m) => (
        <button
          key={m.key}
          type="button"
          role="tab"
          aria-selected={active === m.key}
          onClick={() => onChange(m.key)}
          className={`${SEGMENT_BTN} ${active === m.key ? SEGMENT_ACTIVE : SEGMENT_IDLE}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

function fmtMoney(n: number): string {
  const x = Math.round(n * 100) / 100
  return Number.isInteger(x) ? String(x) : x.toFixed(2)
}

function fmtNum(n: number): string {
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n))
  return n.toFixed(1)
}

function fmtAxisMoney(n: number): string {
  const v = Math.abs(n)
  if (v >= 10000) return `${(n / 10000).toFixed(v >= 100000 ? 0 : 1)}万`
  if (v >= 1000) return `${(n / 1000).toFixed(1)}k`
  return fmtMoney(n)
}

function fmtAxisJin(n: number): string {
  const v = Math.abs(n)
  if (v >= 10000) return `${(n / 10000).toFixed(v >= 100000 ? 0 : 1)}万`
  if (v >= 1000) return `${(n / 1000).toFixed(1)}k`
  return fmtNum(n)
}

function formatBarTopLabel(key: MetricKey, value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0.005) return ''
  if (key === 'jin') return `${fmtNum(n)}斤`
  return fmtMoney(n)
}

function clampZoom(z: number): number {
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 100) / 100
}

function touchDistance(
  touches: { length: number; [i: number]: { clientX: number; clientY: number } },
): number {
  if (touches.length < 2) return 0
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  return Math.hypot(dx, dy)
}

type ChartPoint = BuyerSummaryChartRow

function BuyerAxisTick({
  x,
  y,
  payload,
  angle,
  fill,
}: {
  x?: number
  y?: number
  payload?: { value: string }
  angle: number
  fill?: string
}) {
  if (x == null || y == null || !payload?.value) return null
  const text = payload.value
  const anchor = angle < 0 ? 'end' : 'middle'
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={12}
        textAnchor={anchor}
        fill={fill ?? '#1f2937'}
        fontSize={12}
        fontWeight={600}
        transform={`rotate(${angle})`}
      >
        {text.length > 12 ? `${text.slice(0, 11)}…` : text}
      </text>
    </g>
  )
}

function BuyerSummaryTooltip({
  active,
  payload,
  amountId,
}: {
  active?: boolean
  payload?: { payload?: ChartPoint }[]
  amountId?: boolean
}) {
  if (!active || !payload?.[0]?.payload) return null
  const p = payload[0].payload
  const tc = getThemeColors()
  return (
    <div
      className="max-w-[14rem] rounded-lg border px-3 py-2 text-xs shadow-md"
      style={{
        borderColor: tc.tooltipBorder,
        background: tc.tooltipBg,
        color: tc.textPrimary,
      }}
    >
      <p className="mb-1.5 font-semibold">{p.buyer}</p>
      {amountId ? (
        <>
          <p className="tabular-nums" style={{ color: METRIC_AMOUNT_COLOR }}>
            总金额：¥{fmtMoney(p.amount)}
          </p>
          <p className="tabular-nums" style={{ color: METRIC_OUTSTANDING_COLOR }}>
            未核账：¥{fmtMoney(p.outstanding)}
          </p>
        </>
      ) : null}
      <p className="tabular-nums" style={{ color: METRIC_JIN_COLOR }}>
        总斤数：{fmtNum(p.jin)} 斤
      </p>
    </div>
  )
}

function IconExpand({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  )
}

function ChartFullscreenModal({
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
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(94dvh,44rem)] w-full max-w-2xl flex-col rounded-t-2xl bg-kj-surface shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-kj-border px-4 py-3">
          <h3 className="kuaiji-text-title min-w-0 flex-1 text-base">
            {title}
          </h3>
          <button
            type="button"
            className="kuaiji-btn-ghost shrink-0 px-3 py-1.5 text-sm"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-4 sm:pb-4">
          {children}
        </div>
      </div>
    </div>
  )
}

function BuyerSummaryChartBody({
  chartData,
  metrics,
  amountId,
  soloMetric,
  chartSortKey,
  chartWidth,
  chartHeight,
  xAngle,
  xAxisHeight,
  showMoneyAxis,
  showJinAxis,
  isMetricVisible,
  onBuyerClick,
}: {
  chartData: ChartPoint[]
  metrics: typeof METRICS
  amountId?: boolean
  soloMetric: MetricKey | null
  chartSortKey: MetricKey
  chartWidth: number
  chartHeight: number
  xAngle: number
  xAxisHeight: number
  showMoneyAxis: boolean
  showJinAxis: boolean
  isMetricVisible: (key: MetricKey) => boolean
  onBuyerClick?: (buyer: string) => void
}) {
  const showBarLabels = soloMetric !== null
  const theme = useThemeColors()

  return (
    <>
      <div style={{ width: chartWidth, height: chartHeight, minWidth: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{
                top: showBarLabels ? 22 : 8,
                right: showMoneyAxis && showJinAxis ? 44 : 8,
                left: 4,
                bottom: 8,
              }}
              barCategoryGap="18%"
              barGap={2}
              style={onBuyerClick ? { cursor: 'pointer' } : undefined}
              onClick={(state) => {
                const buyer = (state as { activePayload?: { payload?: ChartPoint }[] })
                  ?.activePayload?.[0]?.payload?.buyer
                if (buyer && onBuyerClick) onBuyerClick(buyer)
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
              <XAxis
                dataKey="buyer"
                interval={0}
                height={xAxisHeight}
                tick={<BuyerAxisTick angle={xAngle} fill={theme.textPrimary} />}
              />
              {showJinAxis ? (
                <YAxis
                  yAxisId="jin"
                  orientation="left"
                  tick={{ fontSize: 10, fill: METRIC_JIN_COLOR }}
                  tickFormatter={fmtAxisJin}
                  width={40}
                />
              ) : null}
              {showMoneyAxis ? (
                <YAxis
                  yAxisId="money"
                  orientation={showJinAxis ? 'right' : 'left'}
                  tick={{ fontSize: 10, fill: METRIC_AMOUNT_COLOR }}
                  tickFormatter={fmtAxisMoney}
                  width={44}
                />
              ) : null}
              <Tooltip content={<BuyerSummaryTooltip amountId={amountId} />} />
              {metrics.map((m) =>
                isMetricVisible(m.key) ? (
                  <Bar
                    key={m.key}
                    dataKey={m.key}
                    name={m.name}
                    fill={m.color}
                    yAxisId={m.yAxisId}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={soloMetric ? 40 : 32}
                  >
                    {showBarLabels && soloMetric === m.key ? (
                      <LabelList
                        dataKey={m.key}
                        position="top"
                        offset={4}
                        formatter={(value) => formatBarTopLabel(m.key, value)}
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          fill: theme.textSecondary,
                        }}
                      />
                    ) : null}
                  </Bar>
                ) : null,
              )}
            </BarChart>
          </ResponsiveContainer>
      </div>

      <p className="mt-1 text-center text-[10px] text-kj-muted">
        按
        {METRICS.find((m) => m.key === chartSortKey)?.name ?? '总金额'}
        从高到低排列；双指捏合缩放 {Math.round(ZOOM_MIN * 100)}%–
        {Math.round(ZOOM_MAX * 100)}%
      </p>
    </>
  )
}

export function StatsBuyerSummaryChart({
  rows,
  amountId,
  emptyMessage = '暂无数据',
  fullscreenTitle = '购买方汇总与未核账',
  onBuyerClick,
}: {
  rows: BuyerSummaryChartRow[]
  amountId?: boolean
  emptyMessage?: string
  fullscreenTitle?: string
  onBuyerClick?: (buyer: string) => void
}) {
  const [soloMetric, setSoloMetric] = useState<MetricKey | null>(null)
  const [zoom, setZoom] = useState(1)
  const [isPinching, setIsPinching] = useState(false)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  const metrics = useMemo(
    () => (amountId ? METRICS : METRICS.filter((m) => m.key === 'jin')),
    [amountId],
  )

  const chartSortKey = useMemo<MetricKey>(() => {
    if (soloMetric) return soloMetric
    if (amountId) return 'amount'
    return 'jin'
  }, [soloMetric, amountId])

  const chartData = useMemo<ChartPoint[]>(() => {
    return [...rows].sort((a, b) => {
      const d = b[chartSortKey] - a[chartSortKey]
      if (d !== 0) return d
      return a.buyer.localeCompare(b.buyer, 'zh-CN')
    })
  }, [rows, chartSortKey])

  const maxNameLen = useMemo(
    () => Math.max(...chartData.map((r) => r.buyer.length), 2),
    [chartData],
  )

  const xAngle = chartData.length <= 3 ? -20 : chartData.length <= 8 ? -38 : -52
  const xAxisHeight = chartData.length <= 3 ? 44 : chartData.length <= 8 ? 64 : 76
  const slotWidth = Math.max(80, Math.min(120, maxNameLen * 9))
  const chartWidth = Math.max(320, chartData.length * slotWidth)
  const chartHeight = 280

  const isMetricVisible = (key: MetricKey) =>
    soloMetric === null || soloMetric === key

  const showMoneyAxis = Boolean(
    amountId &&
      metrics.some((m) => m.yAxisId === 'money' && isMetricVisible(m.key)),
  )

  const showJinAxis = metrics.some(
    (m) => m.yAxisId === 'jin' && isMetricVisible(m.key),
  )

  const applyZoom = useCallback((next: number) => {
    setZoom(clampZoom(next))
  }, [])

  const onTouchStart = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length === 2) {
        setIsPinching(true)
        pinchRef.current = {
          dist: touchDistance(e.touches),
          zoom,
        }
      }
    },
    [zoom],
  )

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault()
        const dist = touchDistance(e.touches)
        if (pinchRef.current.dist > 0) {
          const ratio = dist / pinchRef.current.dist
          applyZoom(pinchRef.current.zoom * ratio)
        }
      }
    },
    [applyZoom],
  )

  const onTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (e.touches.length < 2) {
        setIsPinching(false)
        pinchRef.current = { dist: 0, zoom: clampZoom(zoom) }
      }
    },
    [zoom],
  )

  const onWheel = useCallback(
    (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.04 : 0.04
      applyZoom(zoom + delta)
    },
    [applyZoom, zoom],
  )

  const chartBodyProps = {
    chartData,
    metrics,
    amountId,
    soloMetric,
    chartSortKey,
    chartWidth,
    chartHeight: fullscreenOpen ? 360 : chartHeight,
    xAngle,
    xAxisHeight,
    showMoneyAxis,
    showJinAxis,
    isMetricVisible,
    onBuyerClick,
  }

  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-kj-muted">{emptyMessage}</p>
    )
  }

  const zoomLabel = `${Math.round(zoom * 100)}%`

  const chartToolbar = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <MetricSwitcher
        metrics={metrics}
        active={soloMetric}
        onChange={setSoloMetric}
      />
      <span className="text-[11px] tabular-nums text-kj-muted">{zoomLabel}</span>
      {zoom !== 1 ? (
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="text-[11px] text-[#2ecc71] hover:underline"
        >
          重置
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setFullscreenOpen(true)}
        className="kuaiji-btn-ghost inline-flex items-center gap-1 px-2 py-1 text-xs shadow-sm"
        title="大屏查看"
        aria-label="大屏查看图表"
      >
        <IconExpand className="h-4 w-4" />
        <span>大屏</span>
      </button>
    </div>
  )

  return (
    <div className="space-y-2">
      {chartToolbar}

      <div
        ref={viewportRef}
        className="overflow-x-auto overflow-y-hidden rounded-xl bg-kj-bg-subtle [-webkit-overflow-scrolling:touch]"
        style={{ touchAction: 'pan-x pinch-zoom' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onWheel={onWheel}
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'left top',
            width: chartBodyProps.chartWidth,
            transition: isPinching ? 'none' : 'transform 0.12s ease-out',
          }}
        >
          <BuyerSummaryChartBody {...chartBodyProps} />
        </div>
      </div>

      <ChartFullscreenModal
        open={fullscreenOpen}
        title={fullscreenTitle}
        onClose={() => setFullscreenOpen(false)}
      >
        <div
          className="overflow-x-auto overflow-y-hidden [-webkit-overflow-scrolling:touch]"
          style={{ touchAction: 'pan-x pinch-zoom' }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          onWheel={onWheel}
        >
          <div className="mb-2">{chartToolbar}</div>
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'left top',
              width: Math.max(480, chartData.length * slotWidth),
            }}
          >
            <BuyerSummaryChartBody
              {...chartBodyProps}
              chartHeight={400}
              chartWidth={Math.max(480, chartData.length * slotWidth)}
            />
          </div>
        </div>
      </ChartFullscreenModal>
    </div>
  )
}
