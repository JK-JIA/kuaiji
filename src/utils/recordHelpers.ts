import type { FieldDef, LedgerRecord } from '../types'

const MONEY_RE = /(\d+(?:\.\d+)?)/

/** 从「500」「500元」「1,200.5」中解析金额 */
/** 列表展示：数量后默认带「斤」（已有斤/kg 等单位则不重复加） */
export function formatQuantityWithJin(raw: string): string {
  const s = String(raw).trim()
  if (!s) return '—'
  if (/斤|千克|公斤|吨|包|箱|袋|个|两|[kK][gG]|[Gg]\b/.test(s)) {
    return s
  }
  return `${s}斤`
}

export function plateGroupHeading(plateRaw: string, fields: FieldDef[]): string {
  if (plateRaw === '（未填车牌）') return plateRaw
  const label = fields.find((f) => f.key === 'plate')?.name ?? '车牌'
  return `${label}${plateRaw}`
}

export function parseMoney(s: string): number {
  const t = String(s).replace(/,/g, '')
  const m = t.match(MONEY_RE)
  if (!m) return 0
  const n = parseFloat(m[1])
  return Number.isNaN(n) ? 0 : Math.round(n * 100) / 100
}

/** 数量、金额等：仅保留数字与最多一个小数点，过滤中文与其它字符 */
export function sanitizeUnsignedDecimalInput(raw: string): string {
  const t = String(raw).replace(/[^\d.]/g, '')
  const dot = t.indexOf('.')
  if (dot === -1) return t
  return t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, '')
}

/**
 * 金额列 id：优先带 `key: 'amount'` 的默认列，否则匹配名称「金额」
 * （旧数据或手加字段可能无 key，避免核账弹窗误认为无应收、不显示输入框）
 */
export function getAmountFieldId(fields: FieldDef[]): string | undefined {
  return (
    fields.find((f) => f.key === 'amount')?.id ??
    fields.find((f) => f.name.trim() === '金额')?.id
  )
}

export function getExpectedAmount(
  record: LedgerRecord,
  amountId: string | undefined,
): number {
  if (!amountId) return 0
  return parseMoney(record.values[amountId] ?? '')
}

/**
 * 有效已收：显式 receivedAmount，或旧数据仅 settled 且曾填金额时视为全额
 */
export function getReceivedAmount(
  record: LedgerRecord,
  expected: number,
): number {
  const r = record.receivedAmount
  if (r !== undefined && !Number.isNaN(r)) {
    return Math.max(0, Math.round(r * 100) / 100)
  }
  if (expected > 0 && record.settled === true) return expected
  return 0
}

export function getOutstanding(expected: number, received: number): number {
  return Math.max(0, Math.round((expected - received) * 100) / 100)
}

/** 带符号金额解析（本次收款可填负数冲减） */
/** 非负金额，用于核账本次收款 */
export function parseNonNegativeMoney(s: string): number {
  const t = String(s).trim().replace(/,/g, '')
  if (t === '') return 0
  const n = parseFloat(t)
  if (Number.isNaN(n) || n < 0) return 0
  return Math.round(n * 100) / 100
}

export function parseSignedMoney(s: string): number {
  const t = String(s).trim().replace(/,/g, '')
  if (t === '' || t === '-') return 0
  const n = parseFloat(t)
  return Number.isNaN(n) ? 0 : Math.round(n * 100) / 100
}

/** 周期内所有账单「应收 − 已收」之和（仅应收大于 0） */
export function sumOutstanding(
  records: LedgerRecord[],
  fields: FieldDef[],
): number {
  const aid = getAmountFieldId(fields)
  if (!aid) return 0
  let s = 0
  for (const r of records) {
    const exp = getExpectedAmount(r, aid)
    if (exp <= 0) continue
    const rec = getReceivedAmount(r, exp)
    s += getOutstanding(exp, rec)
  }
  return Math.round(s * 100) / 100
}

/** 整单是否已结清（全额收款，或无金额时人工标记已结清） */
export function isRecordFullyPaid(
  record: LedgerRecord,
  fields: FieldDef[],
): boolean {
  const aid = getAmountFieldId(fields)
  const exp = getExpectedAmount(record, aid)
  const rec = getReceivedAmount(record, exp)
  if (exp > 0) return rec >= exp - 0.005
  return record.settled === true
}

export function getPlateValue(record: LedgerRecord, fields: FieldDef[]): string {
  const pid = fields.find((f) => f.key === 'plate')?.id
  return pid ? (record.values[pid] || '').trim() : ''
}

export type ExpandedProductLine = {
  product: string
  quantity: string
  /** 该行小计（元），来自 lineItem.values[金额列] */
  lineAmountStr: string
}

/** 展开为若干 (商品, 数量, 行金额) 行；兼容无 lineItems 的旧数据 */
export function expandProductLines(
  record: LedgerRecord,
  fields: FieldDef[],
): ExpandedProductLine[] {
  const pid = fields.find((f) => f.key === 'product')?.id
  const qid = fields.find((f) => f.key === 'quantity')?.id
  const aid = getAmountFieldId(fields)
  if (!pid || !qid) return []

  if (record.lineItems && record.lineItems.length > 0) {
    return record.lineItems.map((li) => ({
      product: (li.values[pid] || '').trim(),
      quantity: (li.values[qid] || '').trim(),
      lineAmountStr: aid ? (li.values[aid] || '').trim() : '',
    }))
  }
  return [
    {
      product: (record.values[pid] || '').trim(),
      quantity: (record.values[qid] || '').trim(),
      lineAmountStr: '',
    },
  ]
}
