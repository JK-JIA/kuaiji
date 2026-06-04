import type { FieldDef, LedgerRecord, ProductCatalogEntry } from '../types'
import { canvasToJpegBlob } from './receiptCapture'
import {
  RECEIPT_AMOUNT_GREEN,
  RECEIPT_BANNER_H,
  RECEIPT_FONT,
  RECEIPT_FOOTER_H,
  RECEIPT_FOOTER_TAIL_GAP,
  RECEIPT_SUMMARY_TABLE_GAP,
  RECEIPT_HEADER_H,
  RECEIPT_INFO_ROW_H,
  RECEIPT_MUTED,
  RECEIPT_PAGE_BG,
  RECEIPT_PX,
  RECEIPT_SUMMARY_H,
  RECEIPT_TABLE_HEAD_H,
  RECEIPT_TABLE_ROW_H,
  RECEIPT_TEXT,
  RECEIPT_TITLE_H,
  RECEIPT_TITLE_BODY_GAP,
  RECEIPT_W,
  type ReceiptProductColor,
  type ReceiptSummaryItem,
  type ReceiptTableLine,
  receiptDrawBanner,
  receiptDrawCenterTitle,
  receiptDrawDottedLine,
  receiptDrawFooter,
  receiptDrawHeader,
  receiptDrawInfoField,
  receiptDrawSummaryBox,
  receiptDrawTableHead,
  receiptDrawTableRow,
  receiptFmtMoney,
} from './receiptCanvasShared'
import {
  buildProductReceiptColorMap,
  getProductReceiptColor,
} from './productColors'
import { billImageQuality, getBillExportCaptureScale } from './receiptExport'
import {
  expandProductLines,
  formatQuantityWithUnit,
  getAmountFieldId,
  getExpectedAmount,
  getPlateValue,
  parseMoney,
} from './recordHelpers'
import { aggregateProductSales } from './stats'

const MAX_RECORDS = 50
const RECORD_SECTION_GAP = 10
const RECORD_HEAD_H = 28

export type SearchResultBillPngOptions = {
  records: LedgerRecord[]
  fields: FieldDef[]
  productCatalog?: ProductCatalogEntry[]
  drillPlate?: string
}

type PreparedRecord = {
  dateLabel: string
  recordTotal: string
  lines: ReceiptTableLine[]
}

type PreparedBill = {
  buyerLine: string
  dateRangeLine: string
  totalAmount: number
  listLen: number
  productCount: number
  records: PreparedRecord[]
  truncatedNote: string | null
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']

function orderLabelOnDate(indexOnDate: number): string {
  if (indexOnDate <= 0) return ''
  return ` ${CIRCLED[indexOnDate - 1] ?? String(indexOnDate)}`
}

function buildBuyerLine(
  records: LedgerRecord[],
  fields: FieldDef[],
  drillPlate?: string,
): string {
  const plateTrim = drillPlate?.trim()
  if (plateTrim) return plateTrim
  const plates = new Set<string>()
  for (const r of records) {
    const p = getPlateValue(r, fields).trim()
    if (p) plates.add(p)
  }
  if (plates.size === 1) return [...plates][0]!
  if (plates.size > 1) return `${plates.size} 个购买方`
  return '—'
}

function buildDateRangeLine(records: LedgerRecord[]): string {
  if (records.length === 0) return '—'
  const dates = records.map((r) => r.date).sort()
  if (dates[0] === dates[dates.length - 1]) return dates[0]!
  return `${dates[0]} — ${dates[dates.length - 1]}`
}

function prepareBill(options: SearchResultBillPngOptions): PreparedBill {
  const { records, fields, productCatalog = [], drillPlate } = options
  const amountId = getAmountFieldId(fields)
  const sorted = [...records].sort((a, b) => {
    const d = b.date.localeCompare(a.date)
    if (d !== 0) return d
    return b.createdAt - a.createdAt
  })
  const list = sorted.slice(0, MAX_RECORDS)

  let totalAmount = 0
  for (const r of list) {
    totalAmount += getExpectedAmount(r, amountId)
  }
  totalAmount = Math.round(totalAmount * 100) / 100

  const productRows = aggregateProductSales(
    list,
    fields,
    amountId,
    null,
    productCatalog,
  )

  const allProductNames = new Set<string>()
  for (const rec of list) {
    for (const line of expandProductLines(rec, fields)) {
      allProductNames.add(line.product.trim() || '未填写商品')
    }
  }
  const colorByProduct = buildProductReceiptColorMap(
    [...allProductNames],
    productCatalog,
  )

  const countByDate = new Map<string, number>()
  for (const r of list) {
    countByDate.set(r.date, (countByDate.get(r.date) ?? 0) + 1)
  }
  const dateOrderSeen = new Map<string, number>()

  const preparedRecords: PreparedRecord[] = []
  for (const rec of list) {
    const seen = (dateOrderSeen.get(rec.date) ?? 0) + 1
    dateOrderSeen.set(rec.date, seen)
    const showOrder = (countByDate.get(rec.date) ?? 1) > 1
    const dateLabel = `${rec.date}${showOrder ? orderLabelOnDate(seen) : ''}`
    const recordTotal = receiptFmtMoney(getExpectedAmount(rec, amountId))

    const rawLines = expandProductLines(rec, fields)
    const renderLines =
      rawLines.length > 0
        ? rawLines
        : [
            {
              product: '未填写商品',
              unitPriceStr: '',
              quantity: '',
              lineAmountStr: '',
              lineValues: {},
            },
          ]

    const lines: ReceiptTableLine[] = renderLines.map((line) => {
      const productName = line.product.trim() || '未填写商品'
      const colors: ReceiptProductColor =
        colorByProduct.get(productName) ??
        getProductReceiptColor(productName, productCatalog, 0)
      const unitRaw = line.unitPriceStr.trim()
      const qtyRaw = line.quantity.trim()
      const lineAmtRaw = line.lineAmountStr.trim()
      const unitVal = unitRaw ? parseMoney(unitRaw) : 0
      const lineAmt = lineAmtRaw ? parseMoney(lineAmtRaw) : 0
      const qtyDisplay = qtyRaw
        ? formatQuantityWithUnit(
            qtyRaw,
            productName,
            productCatalog,
            line.lineValues,
          )
        : '—'
      return {
        productName,
        colors,
        unitPrice: unitVal > 0 ? receiptFmtMoney(unitVal) : '—',
        quantity: qtyDisplay,
        lineAmt: lineAmt > 0 ? receiptFmtMoney(lineAmt) : '—',
      }
    })

    preparedRecords.push({ dateLabel, recordTotal, lines })
  }

  return {
    buyerLine: buildBuyerLine(list, fields, drillPlate),
    dateRangeLine: buildDateRangeLine(list),
    totalAmount,
    listLen: list.length,
    productCount: productRows.length,
    records: preparedRecords,
    truncatedNote:
      sorted.length > list.length
        ? `其余 ${sorted.length - list.length} 笔未展示`
        : null,
  }
}

function measureRecordSectionHeight(rec: PreparedRecord): number {
  /** 与 drawRecordSection 逐步一致 */
  return (
    RECORD_SECTION_GAP +
    12 +
    RECORD_HEAD_H +
    RECEIPT_TABLE_HEAD_H +
    rec.lines.length * RECEIPT_TABLE_ROW_H +
    RECEIPT_TABLE_ROW_H +
    14
  )
}

function measureBillHeight(bill: PreparedBill): number {
  /** 与 drawBillToCanvas 逐步一致 */
  let y = RECEIPT_PX
  y +=
    RECEIPT_HEADER_H +
    RECEIPT_TITLE_H +
    RECEIPT_TITLE_BODY_GAP +
    RECEIPT_INFO_ROW_H * 2 +
    10 +
    RECEIPT_SUMMARY_H +
    RECEIPT_SUMMARY_TABLE_GAP
  for (const rec of bill.records) {
    y += measureRecordSectionHeight(rec)
  }
  if (bill.truncatedNote) y += 22
  y += RECEIPT_FOOTER_H + RECEIPT_FOOTER_TAIL_GAP + RECEIPT_BANNER_H
  return y + RECEIPT_PX
}

function drawRecordSection(
  ctx: CanvasRenderingContext2D,
  y: number,
  rec: PreparedRecord,
): number {
  y += RECORD_SECTION_GAP
  receiptDrawDottedLine(ctx, RECEIPT_PX, y, RECEIPT_W - RECEIPT_PX, y)
  y += 12

  ctx.fillStyle = RECEIPT_TEXT
  ctx.font = `600 14px ${RECEIPT_FONT}`
  ctx.fillText(rec.dateLabel, RECEIPT_PX + 4, y + 16)
  y += RECORD_HEAD_H

  y = receiptDrawTableHead(ctx, y)
  for (const line of rec.lines) {
    y = receiptDrawTableRow(ctx, y, line)
  }

  receiptDrawDottedLine(ctx, RECEIPT_PX, y, RECEIPT_W - RECEIPT_PX, y)
  ctx.fillStyle = RECEIPT_TEXT
  ctx.font = `600 13px ${RECEIPT_FONT}`
  ctx.fillText('小计', RECEIPT_PX + 8, y + 22)
  ctx.fillStyle = RECEIPT_AMOUNT_GREEN
  ctx.font = `700 16px ${RECEIPT_FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(`¥${rec.recordTotal}`, RECEIPT_W - RECEIPT_PX - 8, y + 22)
  ctx.textAlign = 'left'
  y += RECEIPT_TABLE_ROW_H + 14
  return y
}

async function drawBillToCanvas(bill: PreparedBill): Promise<HTMLCanvasElement> {
  const H = measureBillHeight(bill)
  const scale = getBillExportCaptureScale()
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(RECEIPT_W * scale)
  canvas.height = Math.round(H * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 不可用')

  ctx.scale(scale, scale)
  ctx.fillStyle = RECEIPT_PAGE_BG
  ctx.fillRect(0, 0, RECEIPT_W, H)

  let y = RECEIPT_PX
  y = await receiptDrawHeader(ctx, y)
  y = receiptDrawCenterTitle(ctx, y, '账单明细')
  y += RECEIPT_TITLE_BODY_GAP

  const midX = RECEIPT_W / 2 + 4
  receiptDrawInfoField(
    ctx,
    RECEIPT_PX,
    y,
    'person',
    '购买方',
    bill.buyerLine,
    midX - RECEIPT_PX - 8,
  )
  receiptDrawInfoField(
    ctx,
    midX,
    y,
    'doc',
    '笔数',
    `${bill.listLen} 笔`,
    RECEIPT_W - RECEIPT_PX - midX,
  )
  y += 26
  receiptDrawInfoField(
    ctx,
    RECEIPT_PX,
    y,
    'clock',
    '日期',
    bill.dateRangeLine,
    RECEIPT_W - RECEIPT_PX * 2,
  )
  y += 26 + 10

  const summaryItems: ReceiptSummaryItem[] = [
    {
      label: '合计金额',
      value: `¥${receiptFmtMoney(bill.totalAmount)}`,
      color: RECEIPT_AMOUNT_GREEN,
    },
    {
      label: '订单数',
      value: String(bill.listLen),
      color: RECEIPT_TEXT,
    },
    {
      label: '品类数',
      value: String(bill.productCount),
      color: RECEIPT_TEXT,
    },
  ]
  y = receiptDrawSummaryBox(ctx, y, summaryItems)
  y += RECEIPT_SUMMARY_TABLE_GAP

  for (const rec of bill.records) {
    y = drawRecordSection(ctx, y, rec)
  }

  if (bill.truncatedNote) {
    ctx.fillStyle = RECEIPT_MUTED
    ctx.font = `12px ${RECEIPT_FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(bill.truncatedNote, RECEIPT_W / 2, y + 10)
    ctx.textAlign = 'left'
    y += 22
  }

  y = await receiptDrawFooter(ctx, y)
  receiptDrawBanner(ctx, y)

  return canvas
}

let billPrewarmCache: {
  key: string
  blob: Blob
} | null = null
let billPrewarmTask: Promise<Blob | null> | null = null

function billCacheKey(options: SearchResultBillPngOptions): string {
  const ids = options.records
    .map((r) => `${r.id}:${r.createdAt}`)
    .sort()
    .join('|')
  return `${ids}|${options.drillPlate ?? ''}|${options.fields.length}`
}

/** 导出面板打开时可预生成，点击分享时接近秒出 */
export function prewarmSearchResultBillImage(
  options: SearchResultBillPngOptions,
): void {
  const key = billCacheKey(options)
  if (billPrewarmCache?.key === key) return
  if (billPrewarmTask) return

  billPrewarmTask = new Promise<Blob | null>((resolve) => {
    const run = () => {
      void (async () => {
        try {
          const blob = await renderSearchResultBillPngBlob(options)
          billPrewarmCache = { key, blob }
          resolve(blob)
        } catch {
          resolve(null)
        } finally {
          billPrewarmTask = null
        }
      })()
    }
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 800 })
    } else {
      window.setTimeout(run, 0)
    }
  })
}

export function clearSearchResultBillPrewarm(): void {
  billPrewarmCache = null
  billPrewarmTask = null
}

export async function renderSearchResultBillPngBlob(
  options: SearchResultBillPngOptions,
): Promise<Blob> {
  const key = billCacheKey(options)
  const hit = billPrewarmCache
  if (hit?.key === key) {
    billPrewarmCache = null
    return hit.blob
  }

  const bill = prepareBill(options)
  const canvas = await drawBillToCanvas(bill)
  const blob = await canvasToJpegBlob(canvas, billImageQuality)
  if (!blob) throw new Error('生成图片失败')
  return blob
}

export {
  renderSingleReceiptBillBlob,
  type SingleReceiptBillOptions,
} from './singleReceiptCanvas'
