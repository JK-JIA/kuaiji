import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useThemeColors } from '../utils/themeColors'

export const STATS_CHART_COLORS = [
  '#2ecc71',
  '#1a7f4c',
  '#f39c12',
  '#e74c3c',
  '#3498db',
  '#9b59b6',
  '#1abc9c',
  '#34495e',
  '#d35400',
  '#7f8c8d',
  '#95a5a6',
]

/** 薯类商品饼图固定色；其余用默认色板按序号取色 */
const SLICE_COLOR_BY_KEYWORD: { keyword: string; color: string }[] = [
  { keyword: '圆紫薯', color: '#3498db' },
  { keyword: '紫薯', color: '#9b59b6' },
  { keyword: '烟薯', color: '#2ecc71' },
  { keyword: '白薯', color: '#b0bec5' },
  { keyword: '红薯', color: '#e74c3c' },
]

export function getStatsSliceColor(name: string, fallbackIndex: number): string {
  const n = name.trim()
  for (const { keyword, color } of SLICE_COLOR_BY_KEYWORD) {
    if (n.includes(keyword)) return color
  }
  return STATS_CHART_COLORS[fallbackIndex % STATS_CHART_COLORS.length]
}

export type StatsPieDatum = { name: string; value: number }

export type StatsShareViewMode = 'chart' | 'list'

const SEGMENT_BTN =
  'rounded-md px-3 py-1 text-xs font-semibold transition-colors'
const SEGMENT_ACTIVE = 'bg-[#2ecc71] text-white'
const SEGMENT_IDLE = 'text-kj-secondary hover:bg-kj-raised hover:text-kj-primary'

export function StatsShareViewModeSwitch({
  mode,
  onChange,
  chartLabel = '饼图',
  listLabel = '列表',
}: {
  mode: StatsShareViewMode
  onChange: (m: StatsShareViewMode) => void
  chartLabel?: string
  listLabel?: string
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-kj-border bg-kj-raised p-0.5">
      <button
        type="button"
        onClick={() => onChange('chart')}
        className={`${SEGMENT_BTN} ${mode === 'chart' ? SEGMENT_ACTIVE : SEGMENT_IDLE}`}
      >
        {chartLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        className={`${SEGMENT_BTN} ${mode === 'list' ? SEGMENT_ACTIVE : SEGMENT_IDLE}`}
      >
        {listLabel}
      </button>
    </div>
  )
}

/** 扇区外侧显示占比，细引导线 + 柔和字号 */
function renderSlicePercentLabel(
  props: {
    cx?: number
    cy?: number
    midAngle?: number
    outerRadius?: number
    percent?: number
  },
  mutedColor: string,
  lineColor: string,
) {
  const { cx, cy, midAngle, outerRadius, percent } = props
  if (
    cx == null ||
    cy == null ||
    midAngle == null ||
    outerRadius == null ||
    percent == null ||
    percent < 0.035
  ) {
    return null
  }
  const RADIAN = Math.PI / 180
  const cos = Math.cos(-midAngle * RADIAN)
  const sin = Math.sin(-midAngle * RADIAN)
  const sx = cx + (outerRadius + 1) * cos
  const sy = cy + (outerRadius + 1) * sin
  const mx = cx + (outerRadius + 10) * cos
  const my = cy + (outerRadius + 10) * sin
  const ex = mx + (cos >= 0 ? 1 : -1) * 5
  const ey = my
  const pctText =
    percent >= 0.1
      ? `${Math.round(percent * 100)}%`
      : `${(percent * 100).toFixed(1)}%`
  const textX = ex + (cos >= 0 ? 4 : -4)
  const textAnchor = cos >= 0 ? 'start' : 'end'

  return (
    <g style={{ pointerEvents: 'none' }}>
      <path
        d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
        stroke={lineColor}
        fill="none"
        strokeWidth={1}
      />
      <text
        x={textX}
        y={ey}
        fill={mutedColor}
        textAnchor={textAnchor}
        dominantBaseline="central"
        fontSize={10}
        fontWeight={500}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {pctText}
      </text>
    </g>
  )
}

type StatsSharePieChartProps = {
  data: StatsPieDatum[]
  formatValue: (n: number) => string
  emptyMessage?: string
  /** 点击扇区或图例项 */
  onItemClick?: (name: string) => void
  /** 不可下钻的名称（如「其他」） */
  nonClickableNames?: string[]
}

export function StatsSharePieChart({
  data,
  formatValue,
  emptyMessage = '暂无数据',
  onItemClick,
  nonClickableNames = [],
}: StatsSharePieChartProps) {
  const theme = useThemeColors()
  const total = data.reduce((s, d) => s + d.value, 0)
  const sliceLabel = (props: Parameters<typeof renderSlicePercentLabel>[0]) =>
    renderSlicePercentLabel(props, theme.textMuted, theme.chartGrid)

  if (data.length === 0 || total <= 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-kj-muted">
        {emptyMessage}
      </div>
    )
  }

  const nonClickable = new Set(nonClickableNames)
  const canClick = (name: string) =>
    Boolean(onItemClick) && !nonClickable.has(name)

  const handleItemClick = (name: string) => {
    if (!canClick(name)) return
    onItemClick?.(name)
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
      <div className="mx-auto h-[220px] w-full max-w-[200px] shrink-0 sm:mx-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 6, right: 32, bottom: 6, left: 32 }}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={42}
              outerRadius={64}
              paddingAngle={1}
              label={sliceLabel}
              labelLine={false}
              isAnimationActive={false}
              style={onItemClick ? { cursor: 'pointer' } : undefined}
            >
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={getStatsSliceColor(d.name, i)}
                  stroke={theme.surface}
                  strokeWidth={2}
                  style={canClick(d.name) ? { cursor: 'pointer' } : undefined}
                  onClick={
                    canClick(d.name)
                      ? () => handleItemClick(d.name)
                      : undefined
                  }
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: theme.tooltipBg,
                borderColor: theme.tooltipBorder,
                color: theme.textPrimary,
                fontSize: 12,
              }}
              formatter={(value: unknown, _name, item) => {
                const n =
                  typeof value === 'number' && Number.isFinite(value)
                    ? value
                    : Number(value ?? 0) || 0
                const pct = total > 0 ? ((n / total) * 100).toFixed(1) : '0'
                const label =
                  item && typeof item === 'object' && 'payload' in item
                    ? String(
                        (item as { payload?: { name?: string } }).payload
                          ?.name ?? '',
                      )
                    : ''
                return [`${formatValue(n)}（${pct}%）`, label || '占比']
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="min-w-0 flex-1 space-y-2.5 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] sm:max-h-[220px] sm:py-1">
        {data.map((d, i) => {
          const color = getStatsSliceColor(d.name, i)
          const clickable = canClick(d.name)
          return (
            <li key={`${d.name}-${i}`}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => handleItemClick(d.name)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-1 py-0.5 text-left text-xs leading-snug transition-colors ${
                  clickable
                    ? 'cursor-pointer hover:bg-kj-surface-muted active:bg-kj-surface-muted'
                    : 'cursor-default'
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-kj-primary">
                  {d.name}
                </span>
                <span className="shrink-0 text-[12px] font-medium tabular-nums text-kj-secondary">
                  {formatValue(d.value)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
