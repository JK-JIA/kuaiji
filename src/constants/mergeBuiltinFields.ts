import type { FieldDef } from '../types'
import { getDefaultFieldDefs } from './defaultLedgerFields'

/** 为旧数据补上「单价」内置列，并把数量/车牌/金额顺序后移 */
export function mergeMissingDefaultFields(fields: FieldDef[]): FieldDef[] {
  if (fields.some((f) => f.key === 'unitPrice')) return fields
  const unitDef = getDefaultFieldDefs().find((f) => f.key === 'unitPrice')
  if (!unitDef) return fields
  const bumped = fields.map((f) => {
    if (f.key === 'quantity' || f.key === 'plate' || f.key === 'amount')
      return { ...f, order: f.order + 1 }
    return f
  })
  return [...bumped, { ...unitDef, order: 1 }].sort((a, b) => a.order - b.order)
}
