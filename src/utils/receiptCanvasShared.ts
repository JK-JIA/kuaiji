import QRCode from 'qrcode'

export const RECEIPT_W = 390
export const RECEIPT_PX = 20

export const RECEIPT_PAGE_BG = '#ffffff'
export const RECEIPT_TEXT = '#1c1917'
export const RECEIPT_MUTED = '#78716c'
export const RECEIPT_LIGHT_MUTED = '#a8a29e'
export const RECEIPT_BRAND = '#008055'
/** 宣传区用色：弱化品牌绿，避免抢账单主体 */
export const RECEIPT_BRAND_SOFT = '#6b9e88'
export const RECEIPT_AMOUNT_GREEN = '#008055'
export const RECEIPT_AMOUNT_RED = '#dc2626'
export const RECEIPT_SUMMARY_BG = '#fafaf9'
export const RECEIPT_BORDER = '#e7e5e4'
export const RECEIPT_PROMO_BORDER = '#eceae7'
export const RECEIPT_PROMO_BG = '#fafaf9'
export const RECEIPT_BANNER_BG = '#f3faf6'
export const RECEIPT_BANNER_TEXT = '#6b9e88'
export const RECEIPT_FONT =
  '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif'

export const RECEIPT_FOOTER_URL = 'https://kuaijipf.com/'

export const RECEIPT_APP_ICON_URL = '/app-icon.png'
export const RECEIPT_LOGO_SIZE = 24
export const RECEIPT_HEADER_H = 38
export const RECEIPT_TITLE_H = 32
export const RECEIPT_INFO_ROW_H = 26
export const RECEIPT_SUMMARY_H = 78
export const RECEIPT_TABLE_HEAD_H = 28
export const RECEIPT_TABLE_ROW_H = 34
export const RECEIPT_FOOTER_H = 100
export const RECEIPT_FOOTER_GAP = 10
/** 金额汇总区与商品表格之间的间距 */
export const RECEIPT_SUMMARY_TABLE_GAP = 8
/** 页脚推广区与底部绿条之间的间距 */
export const RECEIPT_FOOTER_TAIL_GAP = 6
export const RECEIPT_BANNER_H = 26
export const RECEIPT_QR_SIZE = 62

export type ReceiptProductColor = {
  tagBg: string
  tagText: string
}

export const RECEIPT_PRODUCT_PALETTE: ReceiptProductColor[] = [
  { tagBg: '#ffedd5', tagText: '#c2410c' },
  { tagBg: '#ede9fe', tagText: '#6d28d9' },
  { tagBg: '#dbeafe', tagText: '#1d4ed8' },
  { tagBg: '#dcfce7', tagText: '#15803d' },
  { tagBg: '#fce7f3', tagText: '#be185d' },
  { tagBg: '#f3f4f6', tagText: '#374151' },
]

export function receiptFmtMoney(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2)
}

export function receiptRoundRectPath(
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

export function receiptTruncateText(
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

export function receiptDrawDottedLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  ctx.strokeStyle = RECEIPT_BORDER
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.setLineDash([])
}

export function receiptDrawSolidLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  ctx.strokeStyle = RECEIPT_BORDER
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

export function receiptStrokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  stroke: string,
  lineWidth = 1,
) {
  receiptRoundRectPath(ctx, x, y, w, h, r)
  ctx.strokeStyle = stroke
  ctx.lineWidth = lineWidth
  ctx.stroke()
}

export function receiptProductColorMap(
  names: string[],
): Map<string, ReceiptProductColor> {
  const map = new Map<string, ReceiptProductColor>()
  names.forEach((name, i) => {
    map.set(name, RECEIPT_PRODUCT_PALETTE[i % RECEIPT_PRODUCT_PALETTE.length])
  })
  return map
}

let receiptAppIconPromise: Promise<HTMLImageElement | null> | null = null

export function loadReceiptAppIcon(): Promise<HTMLImageElement | null> {
  if (!receiptAppIconPromise) {
    receiptAppIconPromise = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = RECEIPT_APP_ICON_URL
    })
  }
  return receiptAppIconPromise
}

function drawRoundedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  radius: number,
) {
  ctx.save()
  receiptRoundRectPath(ctx, x, y, size, size, radius)
  ctx.clip()
  ctx.drawImage(img, x, y, size, size)
  ctx.restore()
}

/** 无 PNG 时的简易占位（正常应使用 app-icon.png） */
export function receiptDrawLogoMark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
) {
  const s = RECEIPT_LOGO_SIZE
  receiptRoundRectPath(ctx, x, y, s, s, 6)
  ctx.fillStyle = RECEIPT_BRAND
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${Math.round(s * 0.55)}px ${RECEIPT_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('k', x + s / 2, y + s / 2)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
}

export async function receiptDrawAppIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
): Promise<void> {
  const icon = await loadReceiptAppIcon()
  const s = RECEIPT_LOGO_SIZE
  if (icon) {
    drawRoundedImage(ctx, icon, x, y, s, 6)
  } else {
    receiptDrawLogoMark(ctx, x, y)
  }
}

/** 标题两侧横线：靠文字处实、向外渐淡 */
export function receiptDrawTitleAccentLines(
  ctx: CanvasRenderingContext2D,
  titleX: number,
  titleW: number,
  centerY: number,
) {
  const gap = 12
  const maxLen = 56
  const leftInner = titleX - gap
  const leftOuter = Math.max(RECEIPT_PX + 2, leftInner - maxLen)
  const rightInner = titleX + titleW + gap
  const rightOuter = Math.min(RECEIPT_W - RECEIPT_PX - 2, rightInner + maxLen)

  const strokeLine = (x1: number, x2: number, innerIsX2: boolean) => {
    const grad = ctx.createLinearGradient(x1, 0, x2, 0)
    if (innerIsX2) {
      grad.addColorStop(0, 'rgba(0, 128, 85, 0.12)')
      grad.addColorStop(0.4, 'rgba(0, 128, 85, 0.55)')
      grad.addColorStop(1, RECEIPT_BRAND)
    } else {
      grad.addColorStop(0, RECEIPT_BRAND)
      grad.addColorStop(0.6, 'rgba(0, 128, 85, 0.55)')
      grad.addColorStop(1, 'rgba(0, 128, 85, 0.12)')
    }
    ctx.strokeStyle = grad
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x1, centerY)
    ctx.lineTo(x2, centerY)
    ctx.stroke()
  }

  strokeLine(leftOuter, leftInner, true)
  strokeLine(rightInner, rightOuter, false)
}

function receiptDrawInfoIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: 'person' | 'doc' | 'clock',
) {
  ctx.strokeStyle = RECEIPT_BRAND
  ctx.fillStyle = RECEIPT_BRAND
  ctx.lineWidth = 1.4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  if (kind === 'person') {
    ctx.beginPath()
    ctx.arc(x + 8, y + 5, 3.2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x + 8, y + 16, 5.5, Math.PI * 1.15, Math.PI * 1.85)
    ctx.stroke()
  } else if (kind === 'doc') {
    receiptRoundRectPath(ctx, x + 2, y + 2, 12, 14, 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x + 9, y + 2)
    ctx.lineTo(x + 14, y + 7)
    ctx.lineTo(x + 9, y + 7)
    ctx.closePath()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x + 5, y + 10)
    ctx.lineTo(x + 11, y + 10)
    ctx.moveTo(x + 5, y + 13)
    ctx.lineTo(x + 10, y + 13)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.arc(x + 8, y + 9, 6.5, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x + 8, y + 9)
    ctx.lineTo(x + 8, y + 5.5)
    ctx.moveTo(x + 8, y + 9)
    ctx.lineTo(x + 11, y + 10.5)
    ctx.stroke()
  }
}

export function receiptDrawInfoField(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: 'person' | 'doc' | 'clock',
  label: string,
  value: string,
  maxW: number,
) {
  receiptDrawInfoIcon(ctx, x, y + 1, kind)
  const textX = x + 20
  ctx.fillStyle = RECEIPT_MUTED
  ctx.font = `12px ${RECEIPT_FONT}`
  ctx.fillText(`${label}：`, textX, y + 14)
  const labelW = ctx.measureText(`${label}：`).width
  ctx.fillStyle = RECEIPT_TEXT
  ctx.font = `600 13px ${RECEIPT_FONT}`
  ctx.fillText(
    receiptTruncateText(ctx, value, maxW - 20 - labelW),
    textX + labelW,
    y + 14,
  )
}

export function receiptDrawProductTagCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  colors: ReceiptProductColor,
  maxW: number,
): void {
  ctx.font = `600 12px ${RECEIPT_FONT}`
  const text = receiptTruncateText(ctx, name, maxW - 16)
  const tw = ctx.measureText(text).width
  const tagW = Math.min(maxW, tw + 16)
  const tagH = 22
  receiptRoundRectPath(ctx, x, y + 6, tagW, tagH, 11)
  ctx.fillStyle = colors.tagBg
  ctx.fill()
  ctx.fillStyle = colors.tagText
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + 8, y + 6 + tagH / 2)
  ctx.textBaseline = 'alphabetic'
}

export async function receiptDrawHeader(
  ctx: CanvasRenderingContext2D,
  y: number,
): Promise<number> {
  const logoGap = RECEIPT_LOGO_SIZE + 8
  await receiptDrawAppIcon(ctx, RECEIPT_PX, y + 2)
  ctx.fillStyle = RECEIPT_BRAND
  ctx.font = `700 14px ${RECEIPT_FONT}`
  ctx.fillText('kuaiji', RECEIPT_PX + logoGap, y + 12)
  ctx.fillStyle = RECEIPT_LIGHT_MUTED
  ctx.font = `10px ${RECEIPT_FONT}`
  ctx.fillText('批发记账更简单', RECEIPT_PX + logoGap, y + 26)
  ctx.textAlign = 'right'
  ctx.fillStyle = RECEIPT_BRAND
  ctx.font = `600 10px ${RECEIPT_FONT}`
  ctx.fillText('3秒记一笔账', RECEIPT_W - RECEIPT_PX, y + 12)
  ctx.fillText('欠款自动统计', RECEIPT_W - RECEIPT_PX, y + 26)
  ctx.textAlign = 'left'
  return y + RECEIPT_HEADER_H
}

export function receiptDrawCenterTitle(
  ctx: CanvasRenderingContext2D,
  y: number,
  title: string,
): number {
  ctx.font = `700 20px ${RECEIPT_FONT}`
  const titleW = ctx.measureText(title).width
  const titleX = (RECEIPT_W - titleW) / 2
  const titleCenterY = y + 16
  receiptDrawTitleAccentLines(ctx, titleX, titleW, titleCenterY)
  ctx.fillStyle = RECEIPT_TEXT
  ctx.fillText(title, titleX, y + 20)
  return y + RECEIPT_TITLE_H
}

/** 标题与下方信息区之间的留白（不再画虚线分隔） */
export const RECEIPT_TITLE_BODY_GAP = 10

export type ReceiptSummaryItem = {
  label: string
  value: string
  color: string
}

export function receiptDrawSummaryBox(
  ctx: CanvasRenderingContext2D,
  y: number,
  items: ReceiptSummaryItem[],
): number {
  const sumX = RECEIPT_PX
  const sumW = RECEIPT_W - RECEIPT_PX * 2
  receiptRoundRectPath(ctx, sumX, y, sumW, RECEIPT_SUMMARY_H, 12)
  ctx.fillStyle = RECEIPT_SUMMARY_BG
  ctx.fill()
  receiptStrokeRoundRect(
    ctx,
    sumX,
    y,
    sumW,
    RECEIPT_SUMMARY_H,
    12,
    RECEIPT_BORDER,
  )

  const colW = sumW / items.length
  for (let i = 1; i < items.length; i += 1) {
    receiptDrawDottedLine(
      ctx,
      sumX + colW * i,
      y + 12,
      sumX + colW * i,
      y + RECEIPT_SUMMARY_H - 12,
    )
  }

  items.forEach((item, i) => {
    const cx = sumX + colW * i + colW / 2
    ctx.fillStyle = RECEIPT_MUTED
    ctx.font = `11px ${RECEIPT_FONT}`
    ctx.textAlign = 'center'
    ctx.fillText(item.label, cx, y + 22)
    ctx.fillStyle = item.color
    ctx.font = `700 20px ${RECEIPT_FONT}`
    ctx.fillText(item.value, cx, y + 54)
  })
  ctx.textAlign = 'left'
  return y + RECEIPT_SUMMARY_H
}

export const RECEIPT_TABLE_COLS = [
  { label: '商品名称', w: 0.34, align: 'left' as const },
  { label: '单价', w: 0.2, align: 'center' as const },
  { label: '数量', w: 0.22, align: 'center' as const },
  { label: '金额', w: 0.24, align: 'right' as const },
]

export function receiptDrawTableHead(
  ctx: CanvasRenderingContext2D,
  y: number,
): number {
  const tableX = RECEIPT_PX
  const tableW = RECEIPT_W - RECEIPT_PX * 2
  ctx.fillStyle = RECEIPT_MUTED
  ctx.font = `600 11px ${RECEIPT_FONT}`
  let colX = tableX + 8
  for (const col of RECEIPT_TABLE_COLS) {
    const colW = tableW * col.w
    if (col.align === 'center') {
      ctx.textAlign = 'center'
      ctx.fillText(col.label, colX + colW / 2 - 4, y + 18)
    } else if (col.align === 'right') {
      ctx.textAlign = 'right'
      ctx.fillText(col.label, colX + colW - 8, y + 18)
    } else {
      ctx.textAlign = 'left'
      ctx.fillText(col.label, colX, y + 18)
    }
    colX += colW
  }
  ctx.textAlign = 'left'
  receiptDrawSolidLine(
    ctx,
    tableX,
    y + RECEIPT_TABLE_HEAD_H,
    tableX + tableW,
    y + RECEIPT_TABLE_HEAD_H,
  )
  return y + RECEIPT_TABLE_HEAD_H
}

export type ReceiptTableLine = {
  productName: string
  colors: ReceiptProductColor
  unitPrice: string
  quantity: string
  lineAmt: string
}

export function receiptDrawTableRow(
  ctx: CanvasRenderingContext2D,
  y: number,
  line: ReceiptTableLine,
): number {
  const tableX = RECEIPT_PX
  const tableW = RECEIPT_W - RECEIPT_PX * 2
  let colX = tableX + 8
  const cols = RECEIPT_TABLE_COLS

  receiptDrawProductTagCell(
    ctx,
    colX,
    y,
    line.productName,
    line.colors,
    tableW * cols[0].w - 8,
  )
  ctx.fillStyle = RECEIPT_TEXT
  ctx.font = `13px ${RECEIPT_FONT}`
  ctx.textAlign = 'center'
  ctx.fillText(
    line.unitPrice,
    colX + tableW * cols[0].w + (tableW * cols[1].w) / 2 - 4,
    y + 22,
  )
  ctx.fillText(
    receiptTruncateText(ctx, line.quantity, tableW * cols[2].w - 8),
    colX +
      tableW * cols[0].w +
      tableW * cols[1].w +
      (tableW * cols[2].w) / 2 -
      4,
    y + 22,
  )
  ctx.textAlign = 'right'
  ctx.font = `600 13px ${RECEIPT_FONT}`
  ctx.fillText(
    line.lineAmt === '—' ? '—' : `¥${line.lineAmt}`,
    tableX + tableW - 8,
    y + 22,
  )
  ctx.textAlign = 'left'
  receiptDrawSolidLine(
    ctx,
    tableX,
    y + RECEIPT_TABLE_ROW_H,
    tableX + tableW,
    y + RECEIPT_TABLE_ROW_H,
  )
  return y + RECEIPT_TABLE_ROW_H
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('二维码加载失败'))
    img.src = url
  })
}

async function createQrImage(url: string, size: number): Promise<HTMLImageElement> {
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: size,
    color: { dark: '#111111', light: '#ffffff' },
  })
  return loadImage(dataUrl)
}

async function drawQrWithLogo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  qrImg: HTMLImageElement,
) {
  ctx.drawImage(qrImg, x, y, size, size)

  const logoS = Math.round(size * 0.22)
  const lx = x + (size - logoS) / 2
  const ly = y + (size - logoS) / 2
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(lx - 4, ly - 4, logoS + 8, logoS + 8)
  const icon = await loadReceiptAppIcon()
  if (icon) {
    drawRoundedImage(ctx, icon, lx, ly, logoS, 4)
  } else {
    receiptRoundRectPath(ctx, lx, ly, logoS, logoS, 5)
    ctx.fillStyle = RECEIPT_BRAND
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.font = `700 ${Math.round(logoS * 0.58)}px ${RECEIPT_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('k', lx + logoS / 2, ly + logoS / 2 + 1)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
  }
}

/** 居中绘制带 logo 的二维码（邀请海报、宣传图等） */
export async function receiptDrawCenterQr(
  ctx: CanvasRenderingContext2D,
  y: number,
  size: number,
  url: string,
): Promise<number> {
  const qrX = (RECEIPT_W - size) / 2
  const qrImg = await createQrImage(url, size * 3)
  await drawQrWithLogo(ctx, qrX, y, size, qrImg)
  return y + size
}

export async function receiptDrawFooter(
  ctx: CanvasRenderingContext2D,
  y: number,
): Promise<number> {
  const footerX = RECEIPT_PX
  const footerW = RECEIPT_W - RECEIPT_PX * 2
  receiptRoundRectPath(ctx, footerX, y, footerW, RECEIPT_FOOTER_H, 8)
  ctx.fillStyle = RECEIPT_PROMO_BG
  ctx.fill()
  receiptStrokeRoundRect(
    ctx,
    footerX,
    y,
    footerW,
    RECEIPT_FOOTER_H,
    8,
    RECEIPT_PROMO_BORDER,
    0.75,
  )

  const splitX = footerX + footerW * 0.58
  receiptDrawDottedLine(ctx, splitX, y + 10, splitX, y + RECEIPT_FOOTER_H - 10)

  ctx.fillStyle = RECEIPT_BRAND
  ctx.font = `700 11px ${RECEIPT_FONT}`
  ctx.fillText('本账单由 kuaiji 生成', footerX + 12, y + 18)

  ctx.fillStyle = RECEIPT_MUTED
  ctx.font = `10px ${RECEIPT_FONT}`
  ctx.fillText('专为批发场景打造的记账软件', footerX + 12, y + 34)
  ctx.fillText('记账快 · 欠款清晰 · 小票分享', footerX + 12, y + 50)

  const qrSize = RECEIPT_QR_SIZE
  const qrX = splitX + (footerX + footerW - splitX - qrSize) / 2
  const qrY = y + 28
  const qrImg = await createQrImage(RECEIPT_FOOTER_URL, qrSize * 3)
  await drawQrWithLogo(ctx, qrX, qrY, qrSize, qrImg)

  ctx.textAlign = 'center'
  ctx.fillStyle = RECEIPT_BRAND
  ctx.font = `600 10px ${RECEIPT_FONT}`
  ctx.fillText('扫码免费使用', qrX + qrSize / 2, y + 16)
  ctx.fillStyle = RECEIPT_MUTED
  ctx.font = `10px ${RECEIPT_FONT}`
  ctx.fillText('kuaijipf.com', qrX + qrSize / 2, qrY + qrSize + 12)
  ctx.textAlign = 'left'
  return y + RECEIPT_FOOTER_H + RECEIPT_FOOTER_TAIL_GAP
}

export function receiptDrawBanner(ctx: CanvasRenderingContext2D, y: number): number {
  ctx.fillStyle = RECEIPT_BRAND
  ctx.fillRect(0, y, RECEIPT_W, RECEIPT_BANNER_H)
  ctx.fillStyle = '#ffffff'
  ctx.font = `600 10px ${RECEIPT_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('让批发记账快一点', RECEIPT_W / 2, y + RECEIPT_BANNER_H / 2)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  return y + RECEIPT_BANNER_H
}
