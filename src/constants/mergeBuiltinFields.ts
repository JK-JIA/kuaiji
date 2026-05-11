import type { FieldDef } from '../types'
import { getDefaultFieldDefs } from './defaultLedgerFields'

/** 将旧版内置列显示名「车牌号」「车牌」统一为「购买方」（不改 key，兼容数据） */
export function normalizeBuiltinFieldLabels(fields: FieldDef[]): FieldDef[] {
  return fields.map((f) => {
    if (f.key === 'plate') {
      const n = f.name.trim()
      if (n === '车牌号' || n === '车牌') return { ...f, name: '购买方' }
    }
    return f
  })
}

/** 为旧数据补上「单价」内置列，并把数量/购买方/金额顺序后移 */
export function mergeMissingDefaultFields(fields: FieldDef[]): FieldDef[] {
  const next = normalizeBuiltinFieldLabels(fields)
  if (next.some((f) => f.key === 'unitPrice')) return next
  const unitDef = getDefaultFieldDefs().find((f) => f.key === 'unitPrice')
  if (!unitDef) return next
  const bumped = next.map((f) => {
    if (f.key === 'quantity' || f.key === 'plate' || f.key === 'amount')
      return { ...f, order: f.order + 1 }
    return f
  })
  return [...bumped, { ...unitDef, order: 1 }].sort((a, b) => a.order - b.order)
}
