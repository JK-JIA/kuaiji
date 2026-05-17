import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { FieldDef, LedgerRecord } from '../types'
import {
  StatsSharePieChart,
  getStatsSliceColor,
} from './StatsSharePieChart'
import {
  aggregateCustomStats,
  chartDataWithOther,
  CUSTOM_STATS_CHART_TOP_N,
  isProductLineDimension,
  type StatsMeasure,
} from '../utils/stats'
import { useThemeColors } from '../utils/themeColors'

const STORAGE_KEY = 'kuaiji.stats.custom.v2'

export type CustomStatViewType = 'pie' | 'bar' | 'list'

export type CustomStatWidget = {
  id: string
  viewType: CustomStatViewType
  dimensionFieldId: string
  measureKind: 'count' | 'amount' | 'sumField'
  sumFieldId?: string
}

type PersistedV2 = {
  version: 2
  widgets: CustomStatWidget[]
}

const VIEW_LABEL: Record<CustomStatViewType, string> = {
  pie: '饼图',
  bar: '柱状图',
  list: '列表',
}

function fmtMoney(n: number): string {
  const x = Math.round(n * 100) / 100
  return Number.isInteger(x) ? String(x) : x.toFixed(2)
}

function newWidgetId(): string {
  return `cw_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function loadWidgets(): CustomStatWidget[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const p = JSON.parse(raw) as PersistedV2
    if (p.version !== 2 || !Array.isArray(p.widgets)) return []
    return p.widgets
  } catch {
    return []
  }
}

function saveWidgets(widgets: CustomStatWidget[]) {
  try {
    const payload: PersistedV2 = { version: 2, widgets }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

function sanitizeWidgets(
  widgets: CustomStatWidget[],
  fields: FieldDef[],
  amountFieldId: string | undefined,
): CustomStatWidget[] {
  const sorted = [...fields].sort((a, b) => a.order - b.order)
  const defaultDim = sorted[0]?.id ?? ''
  const numberFields = fields.filter((f) => f.type === 'number')
  const defaultSum = numberFields[0]?.id

  return widgets
    .filter((w) => w.id && VIEW_LABEL[w.viewType])
    .map((w) => {
      const dimensionFieldId = fields.some((f) => f.id === w.dimensionFieldId)
        ? w.dimensionFieldId
        : defaultDim
      let measureKind = w.measureKind
      if (measureKind === 'amount' && !amountFieldId) measureKind = 'count'
      if (measureKind === 'sumField' && numberFields.length === 0) {
        measureKind = 'count'
      }
      const sumFieldId =
        measureKind === 'sumField'
          ? fields.some((f) => f.id === w.sumFieldId && f.type === 'number')
            ? w.sumFieldId
            : defaultSum
          : undefined
      return {
        ...w,
        dimensionFieldId,
        measureKind,
        sumFieldId,
      }
    })
}

function createWidget(
  viewType: CustomStatViewType,
  fields: FieldDef[],
  amountFieldId: string | undefined,
): CustomStatWidget {
  const sorted = [...fields].sort((a, b) => a.order - b.order)
  const numberFields = fields.filter((f) => f.type === 'number')
  return {
    id: newWidgetId(),
    viewType,
    dimensionFieldId: sorted[0]?.id ?? '',
    measureKind: amountFieldId ? 'amount' : 'count',
    sumFieldId: numberFields[0]?.id,
  }
}

function buildMeasure(
  widget: CustomStatWidget,
  numberFields: FieldDef[],
): StatsMeasure {
  if (widget.measureKind === 'sumField') {
    const id = widget.sumFieldId || numberFields[0]?.id
    if (!id) return { kind: 'count' }
    return { kind: 'sumField', fieldId: id }
  }
  if (widget.measureKind === 'amount') return { kind: 'amount' }
  return { kind: 'count' }
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length || from === to) return arr
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export type StatsCustomSectionProps = {
  fields: FieldDef[]
  records: LedgerRecord[]
  amountFieldId: string | undefined
}

function CustomStatBarChart({
  data,
  formatValue,
}: {
  data: { name: string; value: number }[]
  formatValue: (n: number) => string
}) {
  const theme = useThemeColors()
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-kj-muted">
        暂无数据
      </div>
    )
  }
  const chartWidth = Math.max(280, data.length * 52)
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <div style={{ width: chartWidth, height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: 4, bottom: data.length > 5 ? 56 : 32 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={theme.chartGrid} />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: theme.chartAxis }}
              interval={0}
              angle={data.length > 4 ? -32 : 0}
              textAnchor={data.length > 4 ? 'end' : 'middle'}
              height={data.length > 4 ? 52 : 28}
            />
            <YAxis tick={{ fontSize: 10, fill: theme.textMuted }} width={36} />
            <Tooltip
              contentStyle={{
                background: theme.tooltipBg,
                borderColor: theme.tooltipBorder,
                color: theme.textPrimary,
                fontSize: 12,
              }}
              formatter={(value: unknown) =>
                formatValue(
                  typeof value === 'number' && Number.isFinite(value)
                    ? value
                    : Number(value ?? 0) || 0,
                )
              }
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36}>
              {data.map((d, i) => (
                <Cell key={i} fill={getStatsSliceColor(d.name, i)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function CustomStatListTable({
  rows,
  total,
  maxBar,
  dimName,
  formatValue,
}: {
  rows: { key: string; value: number }[]
  total: number
  maxBar: number
  dimName: string
  formatValue: (n: number) => string
}) {
  return (
    <div className="max-h-[min(50vh,360px)] overflow-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="sticky top-0 z-[1] border-b border-kj-border bg-kj-surface text-xs font-medium text-kj-secondary">
            <th className="px-3 py-2.5 font-medium">{dimName}</th>
            <th className="w-24 py-2.5 text-right font-medium tabular-nums">
              数值
            </th>
            <th className="min-w-[100px] py-2.5 pl-2 font-medium">占比</th>
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
                <td className="max-w-[40vw] truncate px-3 py-2.5 font-medium text-kj-primary sm:max-w-none">
                  {row.key}
                </td>
                <td className="py-2.5 text-right tabular-nums text-kj-primary">
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
                    <span className="w-12 shrink-0 text-right text-xs tabular-nums text-kj-muted">
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
  )
}

function CustomStatWidgetCard({
  widget,
  index,
  totalCount,
  fields,
  records,
  amountFieldId,
  sortedFields,
  numberFields,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  widget: CustomStatWidget
  index: number
  totalCount: number
  fields: FieldDef[]
  records: LedgerRecord[]
  amountFieldId: string | undefined
  sortedFields: FieldDef[]
  numberFields: FieldDef[]
  onUpdate: (patch: Partial<CustomStatWidget>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const measure = useMemo(
    () => buildMeasure(widget, numberFields),
    [widget, numberFields],
  )

  const rows = useMemo(() => {
    if (!widget.dimensionFieldId) return []
    return aggregateCustomStats(
      records,
      fields,
      widget.dimensionFieldId,
      measure,
      amountFieldId,
    )
  }, [records, fields, widget.dimensionFieldId, measure, amountFieldId])

  const total = useMemo(
    () => Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100,
    [rows],
  )

  const chartRows = useMemo(() => chartDataWithOther(rows), [rows])

  const maxBar = useMemo(
    () => (rows.length > 0 ? Math.max(...rows.map((r) => r.value), 1e-9) : 1),
    [rows],
  )

  const lineMode = isProductLineDimension(fields, widget.dimensionFieldId)
  const dimField = fields.find((f) => f.id === widget.dimensionFieldId)
  const measureLabel =
    measure.kind === 'count'
      ? '成交笔数'
      : measure.kind === 'amount'
        ? '金额合计'
        : `「${fields.find((f) => f.id === measure.fieldId)?.name ?? '?'}」合计`

  const formatValue = (v: number) => {
    if (measure.kind === 'count') return String(Math.round(v))
    return fmtMoney(v)
  }

  const noAmount = measure.kind === 'amount' && !amountFieldId
  const noNumberForSum =
    measure.kind === 'sumField' && numberFields.length === 0

  return (
    <article className="kuaiji-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-kj-border bg-kj-raised px-3 py-2">
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            disabled={index === 0}
            onClick={onMoveUp}
            className="rounded-md px-2 py-1 text-xs text-kj-secondary hover:bg-kj-hover disabled:opacity-30"
            title="上移"
            aria-label="上移"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={index >= totalCount - 1}
            onClick={onMoveDown}
            className="rounded-md px-2 py-1 text-xs text-kj-secondary hover:bg-kj-hover disabled:opacity-30"
            title="下移"
            aria-label="下移"
          >
            ↓
          </button>
        </div>
        <span className="rounded-md bg-[#2ecc71]/15 px-2 py-0.5 text-xs font-semibold text-[#1a7f4c]">
          {VIEW_LABEL[widget.viewType]}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-kj-secondary">
          {dimField?.name ?? '维度'} · {measureLabel}
          {total > 0 ? (
            <span className="tabular-nums text-kj-primary">
              {' '}
              · {formatValue(total)}
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          删除
        </button>
      </div>

      <div className="flex flex-col gap-3 border-b border-kj-border p-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-[120px] flex-1 flex-col gap-1">
          <span className="text-[11px] font-medium text-kj-secondary">分组维度</span>
          <select
            value={widget.dimensionFieldId}
            onChange={(e) => onUpdate({ dimensionFieldId: e.target.value })}
            className="rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-2 text-sm text-kj-primary outline-none focus:border-[#2ecc71]"
          >
            {sortedFields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[120px] flex-1 flex-col gap-1">
          <span className="text-[11px] font-medium text-kj-secondary">统计指标</span>
          <select
            value={widget.measureKind}
            onChange={(e) =>
              onUpdate({
                measureKind: e.target.value as CustomStatWidget['measureKind'],
              })
            }
            className="rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-2 text-sm text-kj-primary outline-none focus:border-[#2ecc71]"
          >
            <option value="count">成交笔数</option>
            <option value="amount" disabled={!amountFieldId}>
              金额合计{!amountFieldId ? '（需金额列）' : ''}
            </option>
            <option value="sumField" disabled={numberFields.length === 0}>
              数字列求和
            </option>
          </select>
        </label>
        {widget.measureKind === 'sumField' && numberFields.length > 0 && (
          <label className="flex min-w-[120px] flex-1 flex-col gap-1">
            <span className="text-[11px] font-medium text-kj-secondary">数字列</span>
            <select
              value={widget.sumFieldId || numberFields[0]?.id}
              onChange={(e) => onUpdate({ sumFieldId: e.target.value })}
              className="rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-2 text-sm text-kj-primary outline-none focus:border-[#2ecc71]"
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
        <div className="mx-3 mt-3 rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {noAmount && '无金额列，请换指标。'}
          {noNumberForSum && '无数字列，无法求和。'}
        </div>
      )}

      <div className="p-3">
        {records.length === 0 && (
          <p className="py-8 text-center text-sm text-kj-muted">暂无数据</p>
        )}
        {records.length > 0 && rows.length === 0 && (
          <p className="py-8 text-center text-sm text-kj-muted">无汇总结果</p>
        )}
        {records.length > 0 && rows.length > 0 && (
          <>
            {lineMode && widget.viewType !== 'list' ? (
              <p className="mb-2 text-center text-[10px] text-kj-muted">
                按商品行统计；图仅显示前 {CUSTOM_STATS_CHART_TOP_N} 项
              </p>
            ) : widget.viewType !== 'list' ? (
              <p className="mb-2 text-center text-[10px] text-kj-muted">
                图仅显示前 {CUSTOM_STATS_CHART_TOP_N} 项，其余合并为「其他」
              </p>
            ) : null}
            {widget.viewType === 'pie' && (
              <StatsSharePieChart
                data={chartRows}
                formatValue={formatValue}
                emptyMessage="暂无数据"
              />
            )}
            {widget.viewType === 'bar' && (
              <CustomStatBarChart data={chartRows} formatValue={formatValue} />
            )}
            {widget.viewType === 'list' && (
              <CustomStatListTable
                rows={rows}
                total={total}
                maxBar={maxBar}
                dimName={dimField?.name ?? '分类'}
                formatValue={formatValue}
              />
            )}
          </>
        )}
      </div>
    </article>
  )
}

function AddWidgetBar({
  onAdd,
  disabled,
}: {
  onAdd: (type: CustomStatViewType) => void
  disabled?: boolean
}) {
  const btn =
    'rounded-lg border border-kj-border-strong bg-kj-surface px-3 py-2 text-xs font-semibold text-kj-primary shadow-sm transition-colors hover:border-[#2ecc71] hover:bg-emerald-50 disabled:opacity-40'
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="text-xs text-kj-secondary">添加</span>
      {(['pie', 'bar', 'list'] as const).map((t) => (
        <button
          key={t}
          type="button"
          disabled={disabled}
          onClick={() => onAdd(t)}
          className={btn}
        >
          + {VIEW_LABEL[t]}
        </button>
      ))}
    </div>
  )
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

  const [widgets, setWidgets] = useState<CustomStatWidget[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setWidgets(sanitizeWidgets(loadWidgets(), fields, amountFieldId))
    setHydrated(true)
  }, [fields, amountFieldId])

  useEffect(() => {
    if (!hydrated) return
    saveWidgets(widgets)
  }, [widgets, hydrated])

  const updateWidget = useCallback((id: string, patch: Partial<CustomStatWidget>) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    )
  }, [])

  const removeWidget = useCallback((id: string) => {
    setWidgets((prev) => prev.filter((w) => w.id !== id))
  }, [])

  const addWidget = useCallback(
    (viewType: CustomStatViewType) => {
      if (fields.length === 0) return
      setWidgets((prev) => [
        ...prev,
        createWidget(viewType, fields, amountFieldId),
      ])
    },
    [fields, amountFieldId],
  )

  const moveUp = useCallback((index: number) => {
    setWidgets((prev) => moveItem(prev, index, index - 1))
  }, [])

  const moveDown = useCallback((index: number) => {
    setWidgets((prev) => moveItem(prev, index, index + 1))
  }, [])

  if (fields.length === 0) {
    return (
      <section className="mx-4 mb-10">
        <h2 className="text-sm font-semibold text-kj-primary">自定义统计</h2>
        <p className="mt-6 text-center text-sm text-kj-muted">暂无字段配置</p>
      </section>
    )
  }

  return (
    <section className="mx-4 mb-10">
      <h2 className="text-sm font-semibold text-kj-primary">自定义统计</h2>
      <p className="mb-3 mt-1 text-[11px] leading-relaxed text-kj-secondary">
        自由添加饼图、柱状图或列表，自选维度与指标；可上下调整顺序，默认无内容。
      </p>

      {widgets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-kj-border-strong bg-kj-surface py-10 text-center">
          <p className="text-sm text-kj-secondary">还没有自定义统计</p>
          <p className="mt-1 text-xs text-kj-muted">点击下方按钮添加</p>
          <div className="mt-5">
            <AddWidgetBar onAdd={addWidget} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {widgets.map((w, i) => (
            <CustomStatWidgetCard
              key={w.id}
              widget={w}
              index={i}
              totalCount={widgets.length}
              fields={fields}
              records={records}
              amountFieldId={amountFieldId}
              sortedFields={sortedFields}
              numberFields={numberFields}
              onUpdate={(patch) => updateWidget(w.id, patch)}
              onRemove={() => removeWidget(w.id)}
              onMoveUp={() => moveUp(i)}
              onMoveDown={() => moveDown(i)}
            />
          ))}
          <AddWidgetBar onAdd={addWidget} />
        </div>
      )}
    </section>
  )
}
