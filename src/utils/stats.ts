import type { FieldDef, LedgerRecord } from '../types'
import { expandProductLines, parseMoney } from './recordHelpers'

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
  plate: string
  count: number
  amount: number
}

export function aggregatePlateSales(
  records: LedgerRecord[],
  fields: FieldDef[],
  amountFieldId: string | undefined,
): PlateSalesRow[] {
  const pid = fields.find((f) => f.key === 'plate')?.id
  const map = new Map<string, { count: number; amount: number }>()
  for (const r of records) {
    const plate = pid ? (r.values[pid] || '（未填车牌）').trim() : '（未填车牌）'
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
