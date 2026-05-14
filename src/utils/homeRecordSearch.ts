import type { FieldDef, LedgerRecord } from '../types'

/** 汇总单条账单内可检索文本（小写），含日期、各字段值与字段名、行明细、核账相关 */
export function buildRecordSearchBlob(
  record: LedgerRecord,
  fields: FieldDef[],
): string {
  const parts: string[] = [record.date, record.id]
  const idToName = new Map(fields.map((f) => [f.id, f.name]))

  const pushVals = (vals: Record<string, string>) => {
    for (const [id, val] of Object.entries(vals)) {
      parts.push(String(val))
      const n = idToName.get(id)
      if (n) parts.push(n)
    }
  }

  pushVals(record.values)
  if (record.lineItems?.length) {
    for (const line of record.lineItems) {
      pushVals(line.values)
    }
  }

  if (record.receivedAmount != null) parts.push(String(record.receivedAmount))
  if (record.dealAmount != null) parts.push(String(record.dealAmount))
  if (record.settled === true) {
    parts.push('已结清', '结清')
  } else if (record.settled === false) {
    parts.push('未结清')
  }

  return parts.join('\n').toLowerCase()
}

export function recordMatchesHomeSearch(
  record: LedgerRecord,
  fields: FieldDef[],
  queryLower: string,
): boolean {
  const q = queryLower.trim()
  if (!q) return true
  return buildRecordSearchBlob(record, fields).includes(q)
}
