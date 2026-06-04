import { format } from 'date-fns'
import type { FieldDef, LedgerRecord, ProductCatalogEntry } from '../types'
import { canvasToJpegBlob } from './receiptCapture'
import {
  billImageQuality,
  getSingleReceiptCaptureScale,
} from './receiptExport'
import {
  buildProductReceiptColorMap,
  getProductReceiptColor,
} from './productColors'
import {
  expandProductLines,
  formatQuantityWithUnit,
  getAmountFieldId,
  getExpectedAmount,
  getPlateValue,
  getReceivedAmount,
  parseMoney,
} from './recordHelpers'
import {
  RECEIPT_AMOUNT_GREEN as AMOUNT_GREEN,
  RECEIPT_AMOUNT_RED as AMOUNT_RED,
  RECEIPT_BANNER_H as BANNER_H,
  RECEIPT_BORDER as BORDER,
  RECEIPT_FONT as FONT,
  RECEIPT_FOOTER_H as FOOTER_H,
  RECEIPT_FOOTER_GAP,
  RECEIPT_FOOTER_TAIL_GAP,
  RECEIPT_SUMMARY_TABLE_GAP,
  RECEIPT_HEADER_H as HEADER_H,
  RECEIPT_INFO_ROW_H as INFO_ROW_H,
  RECEIPT_MUTED as MUTED,
  RECEIPT_PAGE_BG as PAGE_BG,
  RECEIPT_PX as PX,
  RECEIPT_SUMMARY_BG as SUMMARY_BG,
  RECEIPT_SUMMARY_H as SUMMARY_H,
  RECEIPT_TABLE_HEAD_H as TABLE_HEAD_H,
  RECEIPT_TABLE_ROW_H as TABLE_ROW_H,
  RECEIPT_TEXT as TEXT,
  RECEIPT_TITLE_H as TITLE_H,
  RECEIPT_W as W,
  type ReceiptProductColor,
  receiptDrawBanner,
  receiptDrawCenterTitle,
  RECEIPT_TITLE_BODY_GAP,
  receiptDrawFooter,
  receiptDrawHeader,
  receiptDrawInfoField,
} from './receiptCanvasShared'

const BOTTOM_PAD = 0

export type SingleReceiptBillOptions = {
  record: LedgerRecord
  fields: FieldDef[]
  productCatalog?: ProductCatalogEntry[]
}

type ReceiptTableLine = {
  productName: string
  colors: ReceiptProductColor
  unitPrice: string
  quantity: string
  lineAmt: string
}

type PreparedWholesaleReceipt = {
  customer: string
  orderNo: string
  datetime: string
  expected: number
  received: number
  owed: number
  lines: ReceiptTableLine[]
}

function fmtMoney(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2)
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 0 && ctx.measureText(`${t}…`).width > maxW) {
    t = t.slice(0, -1)
  }
  return `${t}…`
}

function drawDottedLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.setLineDash([])
}

function drawSolidLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  stroke: string,
  lineWidth = 1,
) {
  roundRectPath(ctx, x, y, w, h, r)
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.stroke()
}

function buildOrderNo(record: LedgerRecord): string {
  const day = record.date.replace(/-/g, '')
  const tail = String(Math.abs(record.createdAt) % 10000).padStart(4, '0')
  return `NO.${day}${tail}`
}

function prepareSingleReceipt(
  options: SingleReceiptBillOptions,
): PreparedWholesaleReceipt {
  const { record, fields, productCatalog = [] } = options
  const amountId = getAmountFieldId(fields)
  const plate = getPlateValue(record, fields).trim() || '—'

  const rawLines = expandProductLines(record, fields)
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

  const productNames = [
    ...new Set(
      renderLines.map((line) => line.product.trim() || '未填写商品'),
    ),
  ]
  const colorByProduct = buildProductReceiptColorMap(
    productNames,
    productCatalog,
  )

  const lines: ReceiptTableLine[] = renderLines.map((line) => {
    const productName = line.product.trim() || '未填写商品'
    const colors =
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
      unitPrice: unitVal > 0 ? fmtMoney(unitVal) : '—',
      quantity: qtyDisplay,
      lineAmt: lineAmt > 0 ? fmtMoney(lineAmt) : '—',
    }
  })

  const expected = getExpectedAmount(record, amountId)
  const received = getReceivedAmount(record, expected)
  const owed = Math.max(0, Math.round((expected - received) * 100) / 100)

  return {
    customer: plate,
    orderNo: buildOrderNo(record),
    datetime: `${record.date} ${format(new Date(record.createdAt), 'HH:mm')}`,
    expected,
    received,
    owed,
    lines,
  }
}

function measureReceiptHeight(bill: PreparedWholesaleReceipt): number {
  return (
    PX +
    HEADER_H +
    TITLE_H +
    RECEIPT_TITLE_BODY_GAP +
    INFO_ROW_H * 2 +
    10 +
    SUMMARY_H +
    RECEIPT_SUMMARY_TABLE_GAP +
    TABLE_HEAD_H +
    bill.lines.length * TABLE_ROW_H +
    TABLE_ROW_H +
    RECEIPT_FOOTER_GAP +
    FOOTER_H +
    RECEIPT_FOOTER_TAIL_GAP +
    BANNER_H +
    BOTTOM_PAD
  )
}

function drawProductTagCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  colors: ReceiptProductColor,
  maxW: number,
): void {
  ctx.font = `600 12px ${FONT}`
  const text = truncateText(ctx, name, maxW - 16)
  const tw = ctx.measureText(text).width
  const tagW = Math.min(maxW, tw + 16)
  const tagH = 22
  roundRectPath(ctx, x, y + 6, tagW, tagH, 11)
  ctx.fillStyle = colors.tagBg
  ctx.fill()
  ctx.fillStyle = colors.tagText
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 8, y + 6 + tagH / 2)
  ctx.textBaseline = 'alphabetic'
}

async function drawSingleReceiptToCanvas(
  bill: PreparedWholesaleReceipt,
): Promise<HTMLCanvasElement> {
  const H = measureReceiptHeight(bill)
  const scale = getSingleReceiptCaptureScale()
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(W * scale)
  canvas.height = Math.round(H * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 不可用')

  ctx.scale(scale, scale)
  ctx.fillStyle = PAGE_BG
  ctx.fillRect(0, 0, W, H)

  let y = PX

  y = await receiptDrawHeader(ctx, y)
  y = receiptDrawCenterTitle(ctx, y, '记账小票')
  y += RECEIPT_TITLE_BODY_GAP

  const midX = W / 2 + 4
  receiptDrawInfoField(ctx, PX, y, 'person', '客户', bill.customer, midX - PX - 8)
  receiptDrawInfoField(ctx, midX, y, 'doc', '单号', bill.orderNo, W - PX - midX)
  y += INFO_ROW_H
  receiptDrawInfoField(ctx, PX, y, 'clock', '时间', bill.datetime, W - PX * 2)
  y += INFO_ROW_H + 10

  const sumX = PX
  const sumW = W - PX * 2
  roundRectPath(ctx, sumX, y, sumW, SUMMARY_H, 12)
  ctx.fillStyle = SUMMARY_BG
  ctx.fill()
  strokeRoundRect(ctx, sumX, y, sumW, SUMMARY_H, 12, BORDER)

  const colW = sumW / 3
  drawDottedLine(ctx, sumX + colW, y + 12, sumX + colW, y + SUMMARY_H - 12)
  drawDottedLine(ctx, sumX + colW * 2, y + 12, sumX + colW * 2, y + SUMMARY_H - 12)

  const summaryItems = [
    { label: '应收金额', value: fmtMoney(bill.expected), color: AMOUNT_GREEN },
    { label: '已收金额', value: fmtMoney(bill.received), color: TEXT },
    { label: '欠款金额', value: fmtMoney(bill.owed), color: AMOUNT_RED },
  ]
  summaryItems.forEach((item, i) => {
    const cx = sumX + colW * i + colW / 2
    ctx.fillStyle = MUTED
    ctx.font = `11px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(item.label, cx, y + 22)
    ctx.fillStyle = item.color
    ctx.font = `700 20px ${FONT}`
    ctx.fillText(`¥${item.value}`, cx, y + 54)
  })
  ctx.textAlign = 'left'
  y += SUMMARY_H + RECEIPT_SUMMARY_TABLE_GAP

  const tableX = PX
  const tableW = W - PX * 2
  const cols = [
    { label: '商品名称', w: tableW * 0.34, align: 'left' as const },
    { label: '单价', w: tableW * 0.2, align: 'center' as const },
    { label: '数量', w: tableW * 0.22, align: 'center' as const },
    { label: '金额', w: tableW * 0.24, align: 'right' as const },
  ]

  ctx.fillStyle = MUTED
  ctx.font = `600 11px ${FONT}`
  let colX = tableX + 8
  for (const col of cols) {
    if (col.align === 'center') {
      ctx.textAlign = 'center'
      ctx.fillText(col.label, colX + col.w / 2 - 4, y + 18)
    } else if (col.align === 'right') {
      ctx.textAlign = 'right'
      ctx.fillText(col.label, colX + col.w - 8, y + 18)
    } else {
      ctx.textAlign = 'left'
      ctx.fillText(col.label, colX, y + 18)
    }
    colX += col.w
  }
  ctx.textAlign = 'left'
  drawSolidLine(ctx, tableX, y + TABLE_HEAD_H, tableX + tableW, y + TABLE_HEAD_H)
  y += TABLE_HEAD_H

  for (const line of bill.lines) {
    colX = tableX + 8
    drawProductTagCell(ctx, colX, y, line.productName, line.colors, cols[0].w - 8)
    ctx.fillStyle = TEXT
    ctx.font = `13px ${FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(line.unitPrice, colX + cols[0].w + cols[1].w / 2 - 4, y + 22)
    ctx.fillText(
      truncateText(ctx, line.quantity, cols[2].w - 8),
      colX + cols[0].w + cols[1].w + cols[2].w / 2 - 4,
      y + 22,
    )
    ctx.textAlign = 'right'
    ctx.font = `600 13px ${FONT}`
    ctx.fillText(
      line.lineAmt === '—' ? '—' : `¥${line.lineAmt}`,
      tableX + tableW - 8,
      y + 22,
    )
    ctx.textAlign = 'left'
    drawSolidLine(ctx, tableX, y + TABLE_ROW_H, tableX + tableW, y + TABLE_ROW_H)
    y += TABLE_ROW_H
  }

  drawDottedLine(ctx, tableX, y, tableX + tableW, y)
  ctx.fillStyle = TEXT
  ctx.font = `600 13px ${FONT}`
  ctx.fillText('合计', tableX + 8, y + 22)
  ctx.fillStyle = AMOUNT_GREEN
  ctx.font = `700 16px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText(`¥${fmtMoney(bill.expected)}`, tableX + tableW - 8, y + 22)
  ctx.textAlign = 'left'
  y += TABLE_ROW_H + RECEIPT_FOOTER_GAP

  y = await receiptDrawFooter(ctx, y)
  receiptDrawBanner(ctx, y)

  return canvas
}

export async function renderSingleReceiptBillBlob(
  options: SingleReceiptBillOptions,
): Promise<Blob> {
  const bill = prepareSingleReceipt(options)
  const canvas = await drawSingleReceiptToCanvas(bill)
  const blob = await canvasToJpegBlob(canvas, billImageQuality)
  if (!blob) throw new Error('生成图片失败')
  return blob
}
