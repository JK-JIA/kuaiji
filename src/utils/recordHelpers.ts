import type { FieldDef, LedgerRecord } from '../types'

export function getPlateValue(record: LedgerRecord, fields: FieldDef[]): string {
  const pid = fields.find((f) => f.key === 'plate')?.id
  return pid ? (record.values[pid] || '').trim() : ''
}

/** 展开为若干 (商品, 数量) 行；兼容无 lineItems 的旧数据 */
export function expandProductLines(
  record: LedgerRecord,
  fields: FieldDef[],
): { product: string; quantity: string }[] {
  const pid = fields.find((f) => f.key === 'product')?.id
  const qid = fields.find((f) => f.key === 'quantity')?.id
  if (!pid || !qid) return []

  if (record.lineItems && record.lineItems.length > 0) {
    return record.lineItems.map((li) => ({
      product: (li.values[pid] || '').trim(),
      quantity: (li.values[qid] || '').trim(),
    }))
  }
  return [
    {
      product: (record.values[pid] || '').trim(),
      quantity: (record.values[qid] || '').trim(),
    },
  ]
}
