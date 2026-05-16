import type { FieldDef, LedgerRecord } from '../types'
import { expandProductLines, getPlateValue, isRecordFullyPaid } from './recordHelpers'

export type ReconcileFilter = 'all' | 'settled' | 'pending'

export type HomeFilterState = {
  plate: string
  product: string
  reconcile: ReconcileFilter
}

export const defaultHomeFilter: HomeFilterState = {
  plate: '',
  product: '',
  reconcile: 'all',
}

export function recordMatchesHomeFilters(
  record: LedgerRecord,
  fields: FieldDef[],
  f: HomeFilterState,
): boolean {
  const plateQ = f.plate.trim()
  if (plateQ) {
    const plate = getPlateValue(record, fields) || ''
    if (!plate.includes(plateQ)) return false
  }
  const prodQ = f.product.trim()
  if (prodQ) {
    const lines = expandProductLines(record, fields)
    const kw = prodQ.toLowerCase()
    const hit = lines.some((l) =>
      (l.product || '').toLowerCase().includes(kw),
    )
    if (!hit) return false
  }
  if (f.reconcile !== 'all') {
    const fully = isRecordFullyPaid(record, fields)
    if (f.reconcile === 'settled' && !fully) return false
    if (f.reconcile === 'pending' && fully) return false
  }
  return true
}

export function recordMatchesReconcileFilter(
  record: LedgerRecord,
  fields: FieldDef[],
  reconcile: ReconcileFilter,
): boolean {
  if (reconcile === 'all') return true
  const fully = isRecordFullyPaid(record, fields)
  if (reconcile === 'settled') return fully
  return !fully
}

export function countActiveFilters(f: HomeFilterState): number {
  let n = 0
  if (f.plate.trim()) n++
  if (f.product.trim()) n++
  if (f.reconcile !== 'all') n++
  return n
}
