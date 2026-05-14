import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
} from 'recharts'
import type { FieldDef, LedgerRecord } from '../types'
import {
  aggregateCustomStats,
  chartDataWithOther,
  CUSTOM_STATS_CHART_TOP_N,
  isProductLineDimension,
  type StatsMeasure,
} from '../utils/stats'

const STORAGE_KEY = 'kuaiji.stats.custom.v1'

type Persisted = {
  dimensionFieldId: string
  measureKind: StatsMeasure['kind']
  sumFieldId?: string
}

const CHART_COLORS = [
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

function loadPersisted(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Persisted
  } catch {
    return {}
  }
}

function savePersisted(p: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

function readInitialFromStorage(
  fields: FieldDef[],
  amountFieldId: string | undefined,
): {
  dimensionFieldId: string
  measureKind: 'count' | 'amount' | 'sumField'
  sumFieldId: string
} {
  const sorted = [...fields].sort((a, b) => a.order - b.order)
  const defaultDim = sorted[0]?.id ?? ''
  const numberFields = fields.filter((f) => f.type === 'number')
  const p = loadPersisted()
  const dim =
    p.dimensionFieldId && fields.some((f) => f.id === p.dimensionFieldId)
      ? p.dimensionFieldId
      : defaultDim
  let mk: 'count' | 'amount' | 'sumField' =
    p.measureKind === 'count' ||
    p.measureKind === 'amount' ||
    p.measureKind === 'sumField'
      ? p.measureKind
      : 'amount'
  if (mk === 'amount' && !amountFieldId) mk = 'count'
  if (mk === 'sumField' && numberFields.length === 0) mk = 'count'
  const sum =
    p.sumFieldId &&
    fields.some((f) => f.id === p.sumFieldId && f.type === 'number')
      ? p.sumFieldId
      : (numberFields[0]?.id ?? '')
  return { dimensionFieldId: dim, measureKind: mk, sumFieldId: sum }
}

function fmtMoney(n: number): string {
  const x = Math.round(n * 100) / 100
  return Number.isInteger(x) ? String(x) : x.toFixed(2)
}

export type StatsCustomSectionProps = {
  fields: FieldDef[]
  records: LedgerRecord[]
  amountFieldId: string | undefined
}

export function StatsCustomSection({
  fields,
  records,
  amountFieldId,
}: StatsCustomSectionProps) {
  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.order - b.order),
    [fields],
  )
  const numberFields = useMemo(
    () => fields.filter((f) => f.type === 'number'),
    [fields],
  )

  const [dimensionFieldId, setDimensionFieldId] = useState('')
  const [measureKind, setMeasureKind] = useState<'count' | 'amount' | 'sumField'>(
    'amount',
  )
  const [sumFieldId, setSumFieldId] = useState('')

  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current || fields.length === 0) return
    didInit.current = true
    const cfg = readInitialFromStorage(fields, amountFieldId)
    setDimensionFieldId(cfg.dimensionFieldId)
    setMeasureKind(cfg.measureKind)
    setSumFieldId(cfg.sumFieldId)
  }, [fields, amountFieldId])

  useEffect(() => {
    if (!dimensionFieldId || fields.some((f) => f.id === dimensionFieldId)) return
    setDimensionFieldId(sortedFields[0]?.id ?? '')
  }, [fields, dimensionFieldId, sortedFields])

  const measure: StatsMeasure = useMemo(() => {
    if (measureKind === 'sumField') {
      const id = sumFieldId || numberFields[0]?.id
      if (!id) return { kind: 'count' }
      return { kind: 'sumField', fieldId: id }
    }
    if (measureKind === 'amount') return { kind: 'amount' }
    return { kind: 'count' }
  }, [measureKind, sumFieldId, numberFields])

  useEffect(() => {
    if (!dimensionFieldId || !didInit.current) return
    const payload: Persisted = {
      dimensionFieldId,
      measureKind: measure.kind,
      ...(measure.kind === 'sumField' ? { sumFieldId: measure.fieldId } : {}),
    }
    savePersisted(payload)
  }, [dimensionFieldId, measure])

  const rows = useMemo(() => {
    if (!dimensionFieldId) return []
    return aggregateCustomStats(
      records,
      fields,
      dimensionFieldId,
      measure,
      amountFieldId,
    )
  }, [records, fields, dimensionFieldId, measure, amountFieldId])

  const total = useMemo(
    () => Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100,
    [rows],
  )

  const chartRows = useMemo(() => chartDataWithOther(rows), [rows])

  const maxBar = useMemo(
    () => (rows.length > 0 ? Math.max(...rows.map((r) => r.value), 1e-9) : 1),
    [rows],
  )

  const lineMode = isProductLineDimension(fields, dimensionFieldId)

  const formatValue = (v: number) => {
    if (measure.kind === 'count') return String(Math.round(v))
    return fmtMoney(v)
  }

  const dimField = fields.find((f) => f.id === dimensionFieldId)
  const measureLabel =
    measure.kind === 'count'
      ? '成交笔数'
      : measure.kind === 'amount'
        ? '金额合计（元）'
        : `「${fields.find((f) => f.id === measure.fieldId)?.name ?? '?'}」合计`

  const noAmount = measure.kind === 'amount' && !amountFieldId
  const noNumberForSum =
    measure.kind === 'sumField' && numberFields.length === 0

  return (
    <section className="mx-4 mb-10">
      <h2 className="text-sm font-semibold text-neutral-900">自定义统计</h2>
      <p className="mb-3 mt-1 text-[11px] leading-relaxed text-[#666666]">
        选维度与指标。图只显示前 {CUSTOM_STATS_CHART_TOP_N} 项，其余合并为「其他」。
        {lineMode
          ? ' 按商品行统计；数字优先读行内。'
          : ' 非商品维度按单计。'}
      </p>

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-stone-200/90 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-[140px] flex-1 flex-col gap-1">
          <span className="text-[11px] font-medium text-[#666666]">分组维度</span>
          <select
            value={dimensionFieldId}
            onChange={(e) => setDimensionFieldId(e.target.value)}
            className="rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2 text-sm text-neutral-900 outline-none focus:border-[#2ecc71]"
          >
            {sortedFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.type === 'number' ? '（数字）' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[140px] flex-1 flex-col gap-1">
          <span className="text-[11px] font-medium text-[#666666]">统计指标</span>
          <select
            value={measureKind}
            onChange={(e) =>
              setMeasureKind(e.target.value as 'count' | 'amount' | 'sumField')
            }
            className="rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2 text-sm text-neutral-900 outline-none focus:border-[#2ecc71]"
          >
            <option value="count">成交笔数</option>
            <option value="amount" disabled={!amountFieldId}>
              金额合计{!amountFieldId ? '（需金额列）' : ''}
            </option>
            <option value="sumField" disabled={numberFields.length === 0}>
              数字列求和{numberFields.length === 0 ? '（无数字列）' : ''}
            </option>
          </select>
        </label>

        {measureKind === 'sumField' && numberFields.length > 0 && (
          <label className="flex min-w-[140px] flex-1 flex-col gap-1">
            <span className="text-[11px] font-medium text-[#666666]">数字列</span>
            <select
              value={sumFieldId || numberFields[0]?.id}
              onChange={(e) => setSumFieldId(e.target.value)}
              className="rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2 text-sm text-neutral-900 outline-none focus:border-[#2ecc71]"
            >
              {numberFields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {(noAmount || noNumberForSum) && (
        <div className="mb-4 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {noAmount && '无金额列，请添加或换指标。'}
          {noNumberForSum && '无数字列，无法求和。'}
        </div>
      )}

      {records.length === 0 && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white py-10 text-sm text-[#666666]">
          暂无数据
        </div>
      )}

      {records.length > 0 && rows.length === 0 && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white py-10 text-sm text-[#666666]">
          无汇总
        </div>
      )}

      {records.length > 0 && rows.length > 0 && (
        <>
          <div className="mb-4 overflow-hidden rounded-2xl border border-stone-200/90 bg-white px-2 shadow-sm sm:px-3">
            <div className="border-b border-stone-100 bg-white px-3 py-2 text-xs text-[#666666]">
              {dimField?.name ?? '?'} · {measureLabel}
              <span className="tabular-nums text-neutral-800">
                {' '}
                · {formatValue(total)}
              </span>
            </div>
            <div className="max-h-[min(55vh,420px)] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="sticky top-0 z-[1] border-b border-stone-100 bg-white text-xs font-medium text-[#666666]">
                    <th className="px-3 py-2.5 font-medium">{dimField?.name ?? '分类'}</th>
                    <th className="w-24 py-2.5 text-right font-medium tabular-nums">
                      数值
                    </th>
                    <th className="min-w-[120px] py-2.5 pl-2 font-medium">占比</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const pct = total > 0 ? (row.value / total) * 100 : 0
                    const bar = Math.round((row.value / maxBar) * 100)
                    return (
                      <tr
                        key={`${row.key}-${i}`}
                        className="border-b border-stone-50 last:border-0"
                      >
                        <td className="max-w-[40vw] truncate px-3 py-2.5 font-medium text-neutral-900 sm:max-w-none">
                          {row.key}
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-neutral-800">
                          {formatValue(row.value)}
                        </td>
                        <td className="py-2 pl-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100">
                              <div
                                className="h-full rounded-full bg-[#2ecc71]"
                                style={{ width: `${bar}%` }}
                              />
                            </div>
                            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-[#999999]">
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-stone-200/90 bg-white p-3 shadow-sm">
              <p className="mb-2 text-center text-xs font-medium text-[#666666]">
                饼图（前 {CUSTOM_STATS_CHART_TOP_N} 项）
              </p>
              <div className="h-[260px] w-full min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartRows}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={0}
                      outerRadius={88}
                      paddingAngle={0.5}
                      labelLine={false}
                      isAnimationActive={false}
                    >
                      {chartRows.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                          stroke="#fff"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: unknown) =>
                        formatValue(
                          typeof value === 'number' && Number.isFinite(value)
                            ? value
                            : Number(value ?? 0) || 0,
                        )
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200/90 bg-white p-3 shadow-sm">
              <p className="mb-2 text-center text-xs font-medium text-[#666666]">
                树图
              </p>
              <div className="h-[260px] w-full min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <Treemap
                    type="flat"
                    data={chartRows}
                    dataKey="value"
                    nameKey="name"
                    stroke="#fff"
                    fill="#2ecc71"
                    colorPanel={CHART_COLORS}
                    aspectRatio={4 / 3}
                    isAnimationActive={false}
                  >
                    <Tooltip
                      formatter={(value: unknown) =>
                        formatValue(
                          typeof value === 'number' && Number.isFinite(value)
                            ? value
                            : Number(value ?? 0) || 0,
                        )
                      }
                    />
                  </Treemap>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
