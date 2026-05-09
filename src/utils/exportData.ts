import type { FieldDef, LedgerRecord } from '../types'
import { expandProductLines } from './recordHelpers'

/** 与 exportJson 写入格式一致，便于校验与恢复 */
export type LedgerBackupPayload = {
  exportedAt?: string
  version: number
  fields: FieldDef[]
  records: LedgerRecord[]
}

export function parseLedgerBackupJson(text: string):
  | { ok: true; data: LedgerBackupPayload }
  | { ok: false; error: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: '不是合法的 JSON 文件' }
  }
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: '备份格式无效' }
  }
  const o = raw as Record<string, unknown>
  const ver = typeof o.version === 'number' ? o.version : 1
  if (ver !== 1) {
    return { ok: false, error: `不支持的备份版本：${ver}` }
  }
  if (!Array.isArray(o.fields) || !Array.isArray(o.records)) {
    return { ok: false, error: '备份中缺少 fields 或 records 数组' }
  }

  const fields: FieldDef[] = []
  for (const item of o.fields) {
    if (!item || typeof item !== 'object') continue
    const f = item as Record<string, unknown>
    const id = String(f.id ?? '')
    const name = String(f.name ?? '')
    const type = f.type === 'number' ? 'number' : 'text'
    const order = Number(f.order)
    if (!id || !name || !Number.isFinite(order)) continue
    const row: FieldDef = { id, name, type, order }
    if (typeof f.key === 'string') {
      const k = f.key as FieldDef['key']
      if (
        k === 'product' ||
        k === 'quantity' ||
        k === 'plate' ||
        k === 'amount'
      ) {
        row.key = k
      }
    }
    if (f.required === true) row.required = true
    fields.push(row)
  }

  const records: LedgerRecord[] = []
  for (const item of o.records) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const id = String(r.id ?? '')
    const date = String(r.date ?? '')
    const createdAt = Number(r.createdAt)
    const values = r.values
    if (!id || !date || !Number.isFinite(createdAt)) continue
    if (!values || typeof values !== 'object' || Array.isArray(values)) continue

    const rec: LedgerRecord = {
      id,
      date,
      createdAt,
      values: { ...(values as Record<string, string>) },
    }
    if (Array.isArray(r.lineItems)) {
      const lis: LedgerRecord['lineItems'] = []
      for (const li of r.lineItems) {
        if (!li || typeof li !== 'object') continue
        const x = li as Record<string, unknown>
        const lid = String(x.id ?? '')
        const lv = x.values
        if (
          !lid ||
          !lv ||
          typeof lv !== 'object' ||
          Array.isArray(lv)
        )
          continue
        lis.push({
          id: lid,
          values: { ...(lv as Record<string, string>) },
        })
      }
      if (lis.length > 0) rec.lineItems = lis
    }
    if (r.settled === true) rec.settled = true
    const ra = r.receivedAmount
    if (typeof ra === 'number' && !Number.isNaN(ra)) {
      rec.receivedAmount = ra
    }
    const da = r.dealAmount
    if (typeof da === 'number' && !Number.isNaN(da)) {
      rec.dealAmount = da
    }
    records.push(rec)
  }

  if (fields.length === 0) {
    return { ok: false, error: '备份中没有有效的字段定义' }
  }

  return {
    ok: true,
    data: {
      exportedAt:
        typeof o.exportedAt === 'string' ? o.exportedAt : undefined,
      version: 1,
      fields,
      records,
    },
  }
}

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
    'receivedAmount',
    'dealAmount',
    'plate',
    'product',
    'quantity',
    'lineAmount',
    ...fields
      .filter(
        (f) =>
          !f.key ||
          !['plate', 'product', 'quantity', 'amount'].includes(f.key),
      )
      .map((f) => f.name),
  ]
  const extraIds = fields
    .filter(
      (f) =>
        !f.key || !['plate', 'product', 'quantity', 'amount'].includes(f.key),
    )
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
        : [
            {
              product: pid ? r.values[pid] ?? '' : '',
              quantity: qid ? r.values[qid] ?? '' : '',
              lineAmountStr: '',
            },
          ]

    for (const line of lineRows) {
      const cells = [
        r.id,
        r.date,
        String(r.createdAt),
        r.settled ? '1' : '0',
        escapeCsv(
          r.receivedAmount !== undefined && !Number.isNaN(r.receivedAmount)
            ? String(r.receivedAmount)
            : '',
        ),
        escapeCsv(
          r.dealAmount !== undefined && !Number.isNaN(r.dealAmount)
            ? String(r.dealAmount)
            : '',
        ),
        escapeCsv(plate),
        escapeCsv(line.product),
        escapeCsv(line.quantity),
        escapeCsv(line.lineAmountStr),
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
