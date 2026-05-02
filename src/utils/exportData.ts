import type { FieldDef, LedgerRecord } from '../types'
import { expandProductLines } from './recordHelpers'

function downloadBlob(filename: string, blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

export function exportJson(records: LedgerRecord[], fields: FieldDef[]) {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    fields,
    records,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  downloadBlob(`ledger-export-${formatTs()}.json`, blob)
}

/** CSV：每条商品一行；多商品订单拆多行 */
export function exportCsv(records: LedgerRecord[], fields: FieldDef[]) {
  const plateId = fields.find((f) => f.key === 'plate')?.id
  const headers = [
    'recordId',
    'date',
    'createdAt',
    'settled',
    'plate',
    'product',
    'quantity',
    ...fields
      .filter((f) => !f.key || !['plate', 'product', 'quantity'].includes(f.key))
      .map((f) => f.name),
  ]
  const extraIds = fields
    .filter((f) => !f.key || !['plate', 'product', 'quantity'].includes(f.key))
    .map((f) => f.id)

  const rows: string[][] = [headers]

  for (const r of records) {
    const plate = plateId ? (r.values[plateId] ?? '') : ''
    const lines = expandProductLines(r, fields)
    const pid = fields.find((f) => f.key === 'product')?.id
    const qid = fields.find((f) => f.key === 'quantity')?.id
    const lineRows =
      lines.length > 0
        ? lines
        : [{ product: pid ? r.values[pid] ?? '' : '', quantity: qid ? r.values[qid] ?? '' : '' }]

    for (const line of lineRows) {
      const cells = [
        r.id,
        r.date,
        String(r.createdAt),
        r.settled ? '1' : '0',
        escapeCsv(plate),
        escapeCsv(line.product),
        escapeCsv(line.quantity),
        ...extraIds.map((id) => escapeCsv(r.values[id] ?? '')),
      ]
      rows.push(cells)
    }
  }

  const csv = rows.map((row) => row.join(',')).join('\r\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  downloadBlob(`ledger-export-${formatTs()}.csv`, blob)
}

function escapeCsv(s: string): string {
  const t = String(s).replace(/"/g, '""')
  if (/[",\r\n]/.test(t)) return `"${t}"`
  return t
}

function formatTs() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}
