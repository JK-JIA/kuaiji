import type { FieldDef, LedgerRecord } from '../types'
import {
  buyerBucketKey,
  emptyBuyerBucketLabel,
  expandProductLineContexts,
  expandProductLines,
  type ProductLineContext,
  getAmountFieldId,
  getExpectedAmount,
  getOutstanding,
  getReceivedAmount,
  parseMoney,
} from './recordHelpers'

export function parseNumericHint(s: string): number {
  const m = String(s).match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : 0
}

export function findFieldIdByName(fields: FieldDef[], name: string): string | undefined {
  return fields.find((f) => f.name === name)?.id
}

/**
 * 各行对应金额：优先用行上填写的「行金额」；未填写的行用「应收 − 已填行合计」按斤数占比分摊；全无行金额时整单按斤数分摊。
 */
function distributeRecordAmount(
  record: LedgerRecord,
  lines: { quantity: string; lineAmountStr: string }[],
  amountFieldId: string | undefined,
): number[] {
  if (!amountFieldId || lines.length === 0) return lines.map(() => 0)
  const total = parseFloat(record.values[amountFieldId] || '')
  const ta = Number.isNaN(total) ? 0 : Math.round(total * 100) / 100

  const explicit = lines.map((l) => parseMoney(l.lineAmountStr))
  const sumExp = Math.round(explicit.reduce((a, b) => a + b, 0) * 100) / 100

  if (sumExp <= 0) {
    const jins = lines.map((l) => parseJinFromQuantity(l.quantity))
    const sum = jins.reduce((a, b) => a + b, 0)
    if (sum <= 0) return lines.map(() => ta / lines.length)
    return jins.map((j) => Math.round(ta * (j / sum) * 100) / 100)
  }

  const out = [...explicit]
  const rem = Math.round((ta - sumExp) * 100) / 100
  if (rem <= 0.005) return out

  const needIdx = explicit
    .map((e, i) => (e <= 0 ? i : -1))
    .filter((i) => i >= 0)
  if (needIdx.length === 0) return out

  const jins = needIdx.map((i) => parseJinFromQuantity(lines[i].quantity))
  const jsum = jins.reduce((a, b) => a + b, 0)
  if (jsum <= 0) {
    const each = rem / needIdx.length
    needIdx.forEach((i) => {
      out[i] = Math.round((out[i] + each) * 100) / 100
    })
    return out
  }
  needIdx.forEach((i, k) => {
    const j = jins[k]
    out[i] = Math.round((out[i] + rem * (j / jsum)) * 100) / 100
  })
  return out
}

export function sumAmount(
  records: LedgerRecord[],
  amountFieldId: string | undefined,
): number {
  if (!amountFieldId) return 0
  let s = 0
  for (const r of records) {
    const v = parseFloat(r.values[amountFieldId] || '')
    if (!Number.isNaN(v)) s += v
  }
  return Math.round(s * 100) / 100
}

export function dailyAmountSeries(
  records: LedgerRecord[],
  amountFieldId: string | undefined,
): { date: string; amount: number }[] {
  if (!amountFieldId) return []
  const m = new Map<string, number>()
  for (const r of records) {
    const v = parseFloat(r.values[amountFieldId] || '')
    if (Number.isNaN(v)) continue
    m.set(r.date, (m.get(r.date) || 0) + v)
  }
  return [...m.entries()]
    .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** 从数量字段估算斤数 */
export function parseJinFromQuantity(q: string): number {
  const s = String(q).trim()
  if (!s) return 0
  const jin = s.match(/(\d+(?:\.\d+)?)\s*斤/)
  if (jin) return parseFloat(jin[1])
  const kg = s.match(/(\d+(?:\.\d+)?)\s*(千克|公斤|kg)/i)
  if (kg) return parseFloat(kg[1]) * 2
  const m = s.match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : 0
}

export type ProductSalesRow = {
  name: string
  count: number
  jin: number
  amount: number
}

/** 按商品汇总：支持一单多商品（lineItems） */
export function aggregateProductSales(
  records: LedgerRecord[],
  fields: FieldDef[],
  amountFieldId: string | undefined,
): ProductSalesRow[] {
  const map = new Map<string, { count: number; jin: number; amount: number }>()
  for (const r of records) {
    const lines = expandProductLines(r, fields)
    const amounts = distributeRecordAmount(r, lines, amountFieldId)
    lines.forEach((line, i) => {
      const name = line.product.trim() || '（未填商品）'
      const jin = parseJinFromQuantity(line.quantity)
      const amt = amounts[i] ?? 0
      const cur = map.get(name) || { count: 0, jin: 0, amount: 0 }
      cur.count += 1
      cur.jin += jin
      cur.amount += amt
      map.set(name, cur)
    })
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.amount - a.amount || b.jin - a.jin)
}

export type PlateSalesRow = {
  /** 购买方分组键（沿用 plate 内置 key） */
  plate: string
  count: number
  amount: number
}

/** 按购买方汇总成交笔数与整单金额（每单一条） */
export function aggregatePlateSales(
  records: LedgerRecord[],
  fields: FieldDef[],
  amountFieldId: string | undefined,
): PlateSalesRow[] {
  const pid = fields.find((f) => f.key === 'plate')?.id
  const empty = emptyBuyerBucketLabel(fields)
  const map = new Map<string, { count: number; amount: number }>()
  for (const r of records) {
    const plate = pid ? buyerBucketKey(r.values[pid], fields) : empty
    let amt = 0
    if (amountFieldId) {
      const v = parseFloat(r.values[amountFieldId] || '')
      if (!Number.isNaN(v)) amt = v
    }
    const cur = map.get(plate) || { count: 0, amount: 0 }
    cur.count += 1
    cur.amount += amt
    map.set(plate, cur)
  }
  return [...map.entries()]
    .map(([plate, v]) => ({ plate, ...v }))
    .sort((a, b) => b.amount - a.amount || b.count - a.count)
}

export type BuyerProductRow = {
  buyer: string
  product: string
  jin: number
  amount: number
}

/** 按购买方 × 商品汇总斤数与行分摊金额（仅有多商品行结构时才有明细；否则可能无行） */
export function aggregateBuyerProductRows(
  records: LedgerRecord[],
  fields: FieldDef[],
  amountFieldId: string | undefined,
): BuyerProductRow[] {
  const plateId = fields.find((f) => f.key === 'plate')?.id
  const map = new Map<string, { jin: number; amount: number }>()
  for (const r of records) {
    const buyer = plateId ? buyerBucketKey(r.values[plateId], fields) : emptyBuyerBucketLabel(fields)
    const lines = expandProductLines(r, fields)
    if (lines.length === 0) continue
    const amounts = distributeRecordAmount(r, lines, amountFieldId)
    lines.forEach((line, i) => {
      const product = line.product.trim() || '（未填商品）'
      const jin = parseJinFromQuantity(line.quantity)
      const amt = amounts[i] ?? 0
      const key = `${buyer}\t${product}`
      const cur = map.get(key) || { jin: 0, amount: 0 }
      cur.jin += jin
      cur.amount += amt
      map.set(key, cur)
    })
  }
  return [...map.entries()]
    .map(([k, v]) => {
      const tab = k.indexOf('\t')
      const buyer = tab >= 0 ? k.slice(0, tab) : k
      const product = tab >= 0 ? k.slice(tab + 1) : ''
      return { buyer, product, jin: v.jin, amount: v.amount }
    })
    .sort((a, b) => {
      if (a.buyer !== b.buyer) return a.buyer.localeCompare(b.buyer, 'zh')
      return b.amount - a.amount || b.jin - a.jin
    })
}

export type BuyerOutstandingRow = {
  buyer: string
  outstanding: number
}

/** 按购买方汇总未核账金额（应收>0 且 应收−已收>0），从高到低 */
export function aggregateBuyerOutstanding(
  records: LedgerRecord[],
  fields: FieldDef[],
): BuyerOutstandingRow[] {
  const plateId = fields.find((f) => f.key === 'plate')?.id
  const aid = getAmountFieldId(fields)
  const map = new Map<string, number>()
  for (const r of records) {
    const buyer = plateId ? buyerBucketKey(r.values[plateId], fields) : emptyBuyerBucketLabel(fields)
    if (!aid) continue
    const exp = getExpectedAmount(r, aid)
    if (exp <= 0) continue
    const rec = getReceivedAmount(r, exp)
    const out = getOutstanding(exp, rec)
    if (out <= 0.005) continue
    map.set(buyer, round2((map.get(buyer) || 0) + out))
  }
  return [...map.entries()]
    .map(([buyer, outstanding]) => ({ buyer, outstanding }))
    .sort((a, b) => b.outstanding - a.outstanding)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function parseNumberFromValue(s: string | undefined): number {
  if (s == null || String(s).trim() === '') return 0
  const n = parseFloat(String(s).replace(/,/g, '').trim())
  return Number.isFinite(n) ? round2(n) : 0
}

/** 饼图 / Treemap：仅取前 N 类，其余合并为「其他」 */
export const CUSTOM_STATS_CHART_TOP_N = 10

export const CUSTOM_STATS_CHART_OTHER = '其他'

export type StatsMeasure =
  | { kind: 'count' }
  | { kind: 'amount' }
  | { kind: 'sumField'; fieldId: string }

export type CustomStatsRow = {
  key: string
  value: number
}

/** 维度为内置「商品」列且存在商品+数量字段时，按商品行聚合；否则按整单聚合 */
export function isProductLineDimension(
  fields: FieldDef[],
  dimensionFieldId: string,
): boolean {
  const pid = fields.find((f) => f.key === 'product')?.id
  const qid = fields.find((f) => f.key === 'quantity')?.id
  return Boolean(pid && qid && dimensionFieldId === pid)
}

/**
 * 按行读数字列：优先 lineItem.values；行上为空时仅在首行（lineIndex===0）回退到主单 values，避免整单数字在多行上重复加总。
 */
function sumFieldValueOnProductLine(
  record: LedgerRecord,
  ctx: ProductLineContext,
  sumFieldId: string,
): number {
  if (ctx.lineItem) {
    const raw = ctx.lineItem.values[sumFieldId]
    if (raw != null && String(raw).trim() !== '') return parseNumberFromValue(raw)
  }
  if (ctx.lineIndex === 0) return parseNumberFromValue(record.values[sumFieldId])
  return 0
}

function addRecordLevelMeasure(
  map: Map<string, number>,
  record: LedgerRecord,
  key: string,
  measure: StatsMeasure,
  amountFieldId: string | undefined,
): void {
  switch (measure.kind) {
    case 'count':
      map.set(key, round2((map.get(key) || 0) + 1))
      break
    case 'amount': {
      if (!amountFieldId) break
      const a = parseNumberFromValue(record.values[amountFieldId])
      map.set(key, round2((map.get(key) || 0) + a))
      break
    }
    case 'sumField': {
      const n = parseNumberFromValue(record.values[measure.fieldId])
      map.set(key, round2((map.get(key) || 0) + n))
      break
    }
    default:
      break
  }
}

function productLineMeasureDelta(
  record: LedgerRecord,
  ctx: ProductLineContext,
  measure: StatsMeasure,
  lineAmount: number,
): number {
  switch (measure.kind) {
    case 'count':
      return 1
    case 'amount':
      return round2(lineAmount)
    case 'sumField':
      return sumFieldValueOnProductLine(record, ctx, measure.fieldId)
    default:
      return 0
  }
}

/**
 * 按所选维度与指标聚合；金额语义与 aggregateProductSales 一致（行分摊）。
 */
export function aggregateCustomStats(
  records: LedgerRecord[],
  fields: FieldDef[],
  dimensionFieldId: string,
  measure: StatsMeasure,
  amountFieldId: string | undefined,
): CustomStatsRow[] {
  const map = new Map<string, number>()
  const lineMode = isProductLineDimension(fields, dimensionFieldId)

  if (lineMode) {
    for (const r of records) {
      const contexts = expandProductLineContexts(r, fields)
      if (contexts.length === 0) {
        const key = (r.values[dimensionFieldId] || '').trim() || '（空）'
        addRecordLevelMeasure(map, r, key, measure, amountFieldId)
        continue
      }
      const lines = contexts.map((c) => ({
        quantity: c.quantity,
        lineAmountStr: c.lineAmountStr,
      }))
      const amounts = distributeRecordAmount(r, lines, amountFieldId)
      for (let i = 0; i < contexts.length; i++) {
        const ctx = contexts[i]
        const bucket = ctx.product.trim() || '（未填商品）'
        const d = productLineMeasureDelta(r, ctx, measure, amounts[i] ?? 0)
        map.set(bucket, round2((map.get(bucket) || 0) + d))
      }
    }
  } else {
    for (const r of records) {
      const key = (r.values[dimensionFieldId] || '').trim() || '（空）'
      addRecordLevelMeasure(map, r, key, measure, amountFieldId)
    }
  }

  return [...map.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))
}

export function chartDataWithOther(
  rows: CustomStatsRow[],
  topN: number = CUSTOM_STATS_CHART_TOP_N,
): { name: string; value: number }[] {
  if (rows.length === 0) return []
  const sorted = [...rows].sort((a, b) => b.value - a.value)
  if (sorted.length <= topN) {
    return sorted.map((r) => ({ name: r.key, value: r.value }))
  }
  const head = sorted.slice(0, topN)
  const tail = sorted.slice(topN)
  const otherSum = round2(tail.reduce((s, r) => s + r.value, 0))
  const out = head.map((r) => ({ name: r.key, value: r.value }))
  if (otherSum > 0) out.push({ name: CUSTOM_STATS_CHART_OTHER, value: otherSum })
  return out
}
