import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { FieldDef, LedgerRecord } from '../types'
import { getAmountFieldId, getUnitPriceFieldId } from './recordHelpers'
import { isShareDismissedByUser } from './shareDismissed'

export const LAST_BACKUP_KEY = 'kuaiji_last_backup_at'

export function markBackupNow(): void {
  try {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    localStorage.setItem(
      LAST_BACKUP_KEY,
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    )
  } catch {
    /* ignore */
  }
}

export function readLastBackupDate(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY)
  } catch {
    return null
  }
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const s = reader.result as string
      const i = s.indexOf(',')
      resolve(i >= 0 ? s.slice(i + 1) : s)
    }
    reader.onerror = () => reject(new Error('读取导出内容失败'))
    reader.readAsDataURL(blob)
  })
}

type ShareBlobOptions = {
  filename: string
  blob: Blob
  mimeType: string
  title: string
  text: string
  dialogTitle: string
}

async function shareBlobWithMobileFallback(options: ShareBlobOptions) {
  const { filename, blob, mimeType, title, text, dialogTitle } = options
  const file = new File([blob], filename, { type: mimeType })

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title,
      })
      return
    } catch (e) {
      if (isShareDismissedByUser(e)) return
      /* 继续尝试其它方式 */
    }
  }

  if (Capacitor.isNativePlatform()) {
    const base64 = await blobToBase64(blob)
    await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
    })
    const uriResult = await Filesystem.getUri({
      directory: Directory.Cache,
      path: filename,
    })
    try {
      await Share.share({
        title,
        text,
        url: uriResult.uri,
        dialogTitle,
      })
    } catch (shareErr) {
      if (!isShareDismissedByUser(shareErr)) throw shareErr
    }
    return
  }

  downloadBlob(filename, blob)
}

async function saveXlsxBlobWithMobileFallback(filename: string, blob: Blob) {
  await shareBlobWithMobileFallback({
    filename,
    blob,
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    title: '记账 Excel 账单',
    text: '在分享面板选择微信或保存到文件',
    dialogTitle: '导出 Excel',
  })
}

export async function sharePngBlobWithMobileFallback(
  filename: string,
  blob: Blob,
) {
  await shareBlobWithMobileFallback({
    filename,
    blob,
    mimeType: 'image/png',
    title: '账单小票 PNG',
    text: '在分享面板选择微信或保存到相册',
    dialogTitle: '导出 PNG 小票',
  })
}

/** 解析含引号与逗号的 CSV 全文为二维数组 */
export function parseCsvRows(content: string): string[][] {
  const t = content.replace(/^\ufeff/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    if (row.length > 1 || row.some((cell) => cell !== '')) {
      rows.push(row)
    }
    row = []
  }
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      pushField()
    } else if (c === '\r' || c === '\n') {
      pushField()
      pushRow()
      if (c === '\r' && t[i + 1] === '\n') i++
    } else {
      field += c
    }
  }
  pushField()
  if (row.length > 1 || row.some((cell) => cell !== '')) {
    rows.push(row)
  }
  return rows
}

/** 固定列：导出用首项为中文表头；数组含旧版英文以便导入兼容 */
function csvMetaHeaders(fields: FieldDef[]) {
  const plateName = fields.find((f) => f.key === 'plate')?.name.trim() || '购买方'
  const productName =
    fields.find((f) => f.key === 'product')?.name.trim() || '商品'
  const quantityName =
    fields.find((f) => f.key === 'quantity')?.name.trim() || '斤数'
  const amountId = getAmountFieldId(fields)
  const amountName = amountId
    ? fields.find((f) => f.id === amountId)?.name.trim() || '金额'
    : '金额'
  const lineAmountHeader = amountId ? `${amountName}（行）` : '行金额'
  const recordTotalHeader = amountId ? `${amountName}（整单）` : '整单金额'

  return {
    recordId: ['账单ID', 'recordId'],
    date: ['日期', 'date'],
    createdAt: ['创建时间戳', 'createdAt'],
    settled: ['已结清', 'settled'],
    receivedAmount: ['累计实收', 'receivedAmount'],
    dealAmount: ['成交价', 'dealAmount'],
    plate: [plateName, 'plate'],
    product: [productName, 'product'],
    quantity: [quantityName, 'quantity'],
    lineAmount: [lineAmountHeader, 'lineAmount'],
    recordTotalAmount: [recordTotalHeader, 'recordTotalAmount'],
  } as const
}

function colByAliases(headers: string[], aliases: readonly string[]): number {
  const norm = headers.map((h) => h.trim())
  for (const a of aliases) {
    const i = norm.indexOf(a)
    if (i >= 0) return i
  }
  return -1
}

function allFixedHeaderStrings(meta: ReturnType<typeof csvMetaHeaders>): Set<string> {
  const s = new Set<string>()
  for (const arr of Object.values(meta)) {
    for (const h of arr) s.add(h)
  }
  return s
}

function parseNumLoose(s: string): number | undefined {
  const x = String(s).trim().replace(/,/g, '')
  if (x === '') return undefined
  const n = parseFloat(x)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined
}

function newLineItemId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `li_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/** 简洁导出列（导入 CSV 仍使用；导出为 Excel 表格） */
export const SIMPLE_CSV_HEADERS = [
  '购买方',
  '日期',
  '商品',
  '单价',
  '金额',
  '总金额',
  '未核账',
  '已核账',
] as const

function fmtCsvMoney(n: number): string {
  if (!Number.isFinite(n)) return ''
  return (Math.round(n * 100) / 100).toFixed(2)
}

function isSimpleExportCsvHeaders(headers: string[]): boolean {
  const norm = new Set(headers.map((h) => h.trim()))
  return SIMPLE_CSV_HEADERS.every((h) => norm.has(h))
}

function parseSimpleLedgerImportCsv(
  rows: string[][],
  fields: FieldDef[],
): { ok: true; records: LedgerRecord[] } | { ok: false; error: string } {
  const headers = rows[0].map((h) => h.trim())
  const col = (name: string) => headers.indexOf(name)
  const iPlate = col('购买方')
  const iDate = col('日期')
  const iProduct = col('商品')
  const iUnit = col('单价')
  const iLineAmt = col('金额')
  const iTotal = col('总金额')
  const iOut = col('未核账')
  const iRec = col('已核账')
  if (
    iPlate < 0 ||
    iDate < 0 ||
    iProduct < 0 ||
    iLineAmt < 0 ||
    iTotal < 0 ||
    iOut < 0 ||
    iRec < 0
  ) {
    return { ok: false, error: 'CSV 表头不完整，需包含：购买方、日期、商品、金额、总金额、未核账、已核账' }
  }

  const plateId = fields.find((f) => f.key === 'plate')?.id
  const productId = fields.find((f) => f.key === 'product')?.id
  const quantityId = fields.find((f) => f.key === 'quantity')?.id
  const unitPriceId = getUnitPriceFieldId(fields)
  const amountId = getAmountFieldId(fields)

  type Group = {
    date: string
    plate: string
    total: number
    outstanding: number
    received: number
    lines: Array<{
      product: string
      unitPrice: string
      lineAmount: string
    }>
  }

  const groups = new Map<string, Group>()

  for (let r = 1; r < rows.length; r++) {
    const line = rows[r]
    if (line.every((c) => String(c).trim() === '')) continue
    const date = String(line[iDate] ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return {
        ok: false,
        error: `第 ${r + 1} 行：日期格式应为 YYYY-MM-DD`,
      }
    }
    const plate = String(line[iPlate] ?? '').trim()
    if (
      plate === '未核账合计' ||
      plate === '已核账合计' ||
      plate === '总计'
    ) {
      continue
    }
    const product = String(line[iProduct] ?? '').trim()
    if (product === '总金额' || product === '总计') continue
    const unitPrice = iUnit >= 0 ? String(line[iUnit] ?? '').trim() : ''
    const lineAmt = String(line[iLineAmt] ?? '').trim()
    const total = parseNumLoose(String(line[iTotal] ?? '')) ?? 0
    const outstanding = parseNumLoose(String(line[iOut] ?? '')) ?? 0
    const received = parseNumLoose(String(line[iRec] ?? '')) ?? 0
    if (!product && !lineAmt) continue

    const key = `${date}\t${plate}\t${total}\t${outstanding}\t${received}`
    const g = groups.get(key) ?? {
      date,
      plate,
      total,
      outstanding,
      received,
      lines: [],
    }
    g.lines.push({ product, unitPrice, lineAmount: lineAmt })
    groups.set(key, g)
  }

  if (groups.size === 0) {
    return { ok: false, error: 'CSV 没有可导入的数据行' }
  }

  const records: LedgerRecord[] = []
  for (const g of groups.values()) {
    const createdAt = Date.parse(`${g.date}T12:00:00`)
    const rec: LedgerRecord = {
      id: newLineItemId(),
      date: g.date,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      values: {},
    }
    if (plateId) rec.values[plateId] = g.plate
    if (amountId && g.total > 0) {
      rec.values[amountId] = fmtCsvMoney(g.total)
    }
    if (g.received > 0) rec.receivedAmount = g.received
    if (g.total > 0 && g.received >= g.total - 0.005) rec.settled = true

    const lineItems: NonNullable<LedgerRecord['lineItems']> = []
    for (const ln of g.lines) {
      const lineVals: Record<string, string> = {}
      if (productId) lineVals[productId] = ln.product
      if (quantityId) lineVals[quantityId] = ''
      if (unitPriceId && ln.unitPrice) lineVals[unitPriceId] = ln.unitPrice
      if (amountId && ln.lineAmount) lineVals[amountId] = ln.lineAmount
      lineItems.push({ id: newLineItemId(), values: lineVals })
    }
    if (lineItems.length > 0) rec.lineItems = lineItems
    else if (productId && g.lines[0]) {
      rec.values[productId] = g.lines[0].product
    }

    records.push(rec)
  }

  records.sort((a, b) => b.createdAt - a.createdAt)
  return { ok: true, records }
}

/**
 * 从本应用导出的 CSV 还原账单（字段定义以当前 settings 为准，表头需与导出一致）。
 */
export function parseLedgerImportCsv(
  text: string,
  fields: FieldDef[],
): { ok: true; records: LedgerRecord[] } | { ok: false; error: string } {
  const rows = parseCsvRows(text)
  if (rows.length < 2) {
    return { ok: false, error: 'CSV 无有效数据（至少需表头与一行数据）' }
  }
  const headers = rows[0].map((h) => h.trim())
  if (isSimpleExportCsvHeaders(headers)) {
    return parseSimpleLedgerImportCsv(rows, fields)
  }
  const meta = csvMetaHeaders(fields)
  const fixedSet = allFixedHeaderStrings(meta)

  const iRecordId = colByAliases(headers, meta.recordId)
  const iDate = colByAliases(headers, meta.date)
  const iCreatedAt = colByAliases(headers, meta.createdAt)
  if (iRecordId < 0 || iDate < 0 || iCreatedAt < 0) {
    const miss: string[] = []
    if (iRecordId < 0) miss.push(meta.recordId[0])
    if (iDate < 0) miss.push(meta.date[0])
    if (iCreatedAt < 0) miss.push(meta.createdAt[0])
    return {
      ok: false,
      error: `CSV 缺少必需列：${miss.join('、')}（可与旧版英文表头混用）`,
    }
  }

  const amountId = getAmountFieldId(fields)
  const plateId = fields.find((f) => f.key === 'plate')?.id
  const productId = fields.find((f) => f.key === 'product')?.id
  const quantityId = fields.find((f) => f.key === 'quantity')?.id

  const extraFieldByCol: { col: number; id: string }[] = []
  headers.forEach((h, i) => {
    const t = h.trim()
    if (!t || fixedSet.has(t)) return
    const f = fields.find((x) => x.name.trim() === t)
    if (f) extraFieldByCol.push({ col: i, id: f.id })
  })

  const iSettled = colByAliases(headers, meta.settled)
  const iReceived = colByAliases(headers, meta.receivedAmount)
  const iDeal = colByAliases(headers, meta.dealAmount)
  const iPlate = colByAliases(headers, meta.plate)
  const iProduct = colByAliases(headers, meta.product)
  const iQuantity = colByAliases(headers, meta.quantity)
  const iLineAmt = colByAliases(headers, meta.lineAmount)
  const iRecTotal = colByAliases(headers, meta.recordTotalAmount)

  const groups = new Map<string, string[][]>()
  for (let r = 1; r < rows.length; r++) {
    const line = rows[r]
    if (line.every((c) => String(c).trim() === '')) continue
    const rid = String(line[iRecordId] ?? '').trim()
    if (!rid) {
      return { ok: false, error: `第 ${r + 1} 行：账单ID 为空` }
    }
    const g = groups.get(rid) ?? []
    g.push(line)
    groups.set(rid, g)
  }

  if (groups.size === 0) {
    return { ok: false, error: 'CSV 没有可导入的数据行' }
  }

  const records: LedgerRecord[] = []

  for (const [recordId, lines] of groups) {
    const first = lines[0]
    const date = String(first[iDate] ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return {
        ok: false,
        error: `订单 ${recordId}：日期格式应为 YYYY-MM-DD，当前为「${date}」`,
      }
    }
    const createdAt = parseNumLoose(String(first[iCreatedAt] ?? ''))
    if (createdAt === undefined || !Number.isFinite(createdAt)) {
      return {
        ok: false,
        error: `订单 ${recordId}：创建时间戳无效`,
      }
    }
    const createdAtInt = Math.round(createdAt)

    const settledStr =
      iSettled >= 0 ? String(first[iSettled] ?? '').trim() : '0'
    const settled = settledStr === '1' || settledStr.toLowerCase() === 'true'

    const received =
      iReceived >= 0 ? parseNumLoose(String(first[iReceived] ?? '')) : undefined
    const deal =
      iDeal >= 0 ? parseNumLoose(String(first[iDeal] ?? '')) : undefined

    const values: Record<string, string> = {}
    if (plateId && iPlate >= 0) {
      values[plateId] = String(first[iPlate] ?? '').trim()
    }
    if (amountId && iRecTotal >= 0) {
      const tot = String(first[iRecTotal] ?? '').trim()
      if (tot) values[amountId] = tot
    }

    for (const { col: ci, id: fid } of extraFieldByCol) {
      values[fid] = String(first[ci] ?? '').trim()
    }

    const rec: LedgerRecord = {
      id: recordId,
      date,
      createdAt: createdAtInt,
      values: { ...values },
    }
    if (settled) rec.settled = true
    if (received !== undefined && !Number.isNaN(received)) {
      rec.receivedAmount = received
    }
    if (deal !== undefined && !Number.isNaN(deal)) {
      rec.dealAmount = deal
    }

    const hasLineCols =
      iProduct >= 0 &&
      iQuantity >= 0 &&
      iLineAmt >= 0 &&
      productId &&
      quantityId

    const lineItems: NonNullable<LedgerRecord['lineItems']> = []
    if (hasLineCols) {
      for (const ln of lines) {
        const prod = String(ln[iProduct] ?? '').trim()
        const qty = String(ln[iQuantity] ?? '').trim()
        const lam = String(ln[iLineAmt] ?? '').trim()
        if (!prod && !qty && !lam) continue
        const lineVals: Record<string, string> = {
          [productId]: prod,
          [quantityId]: qty,
        }
        if (amountId) lineVals[amountId] = lam
        lineItems.push({
          id: newLineItemId(),
          values: lineVals,
        })
      }
    }

    if (lineItems.length > 0) {
      rec.lineItems = lineItems
    } else if (productId && quantityId) {
      const prod = String(first[iProduct] ?? '').trim()
      const qty = String(first[iQuantity] ?? '').trim()
      if (prod || qty) {
        rec.values[productId] = prod
        rec.values[quantityId] = qty
      }
    }

    for (let li = 1; li < lines.length; li++) {
      const ln = lines[li]
      if (String(ln[iDate] ?? '').trim() !== date) {
        return {
          ok: false,
          error: `订单 ${recordId}：多行日期不一致`,
        }
      }
      if (String(ln[iCreatedAt] ?? '').trim() !== String(first[iCreatedAt] ?? '').trim()) {
        return {
          ok: false,
          error: `订单 ${recordId}：多行「创建时间戳」不一致`,
        }
      }
    }

    records.push(rec)
  }

  records.sort((a, b) => b.createdAt - a.createdAt)
  return { ok: true, records }
}

/** 与 index.html 标题一致，用于导出文件名 */
const CSV_EXPORT_BRAND = '个人记账'

export type ExportCsvOptions = {
  /** yyyy-MM-dd，含当日；可与 dateTo 同时省略表示全部账单 */
  dateFrom?: string
  dateTo?: string
  /** 自定义文件名（须含 .csv）；省略时按日期范围或时间戳生成 */
  filename?: string
}

function orderedDateRange(
  dateFrom?: string,
  dateTo?: string,
): { lo: string; hi: string } | null {
  if (dateFrom == null && dateTo == null) return null
  const a = dateFrom ?? '0000-01-01'
  const b = dateTo ?? '9999-12-31'
  return a <= b ? { lo: a, hi: b } : { lo: b, hi: a }
}

function defaultExportCsvFilename(options?: ExportCsvOptions): string {
  if (options?.filename?.trim()) {
    return options.filename.trim().replace(/\.csv$/i, '.xlsx')
  }
  const range = orderedDateRange(options?.dateFrom, options?.dateTo)
  if (range) {
    return `${CSV_EXPORT_BRAND}_${range.lo.replace(/-/g, '')}_${range.hi.replace(/-/g, '')}.xlsx`
  }
  return `ledger-export-${formatTs()}.xlsx`
}

export async function exportCsv(
  records: LedgerRecord[],
  fields: FieldDef[],
  options?: ExportCsvOptions,
) {
  const range = orderedDateRange(options?.dateFrom, options?.dateTo)
  let list = records
  if (range) {
    list = records.filter((r) => r.date >= range.lo && r.date <= range.hi)
    if (list.length === 0) {
      alert('所选日期范围内没有账单')
      return
    }
  }

  const { buildLedgerExcelBlob } = await import('./ledgerExcelExport')
  const blob = await buildLedgerExcelBlob(list, fields)
  const filename = defaultExportCsvFilename(options)
  try {
    await saveXlsxBlobWithMobileFallback(filename, blob)
    markBackupNow()
  } catch (e) {
    if (!isShareDismissedByUser(e)) {
      alert(e instanceof Error ? e.message : '导出失败')
    }
  }
}

function formatTs() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}
