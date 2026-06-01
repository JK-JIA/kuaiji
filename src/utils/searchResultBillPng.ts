import { format } from 'date-fns'
import type { FieldDef, LedgerRecord, ProductCatalogEntry } from '../types'
import { html2canvasReceiptElement } from './receiptCapture'
import { getReceiptCaptureScale } from './receiptExport'
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
const MAX_CHART_PRODUCTS = 8

/** html2canvas 安全色：仅 hex/rgb */
const PAGE_BG = '#f7f4ef'
const CARD_BG = '#ffffff'
const SUMMARY_BG = '#f0ebe3'
const TEXT = '#1c1917'
const MUTED = '#78716c'
const BRAND = '#1a7f4c'
const AMOUNT_GREEN = '#16a34a'

const PRODUCT_PALETTE = [
  { tagBg: '#ffedd5', tagText: '#c2410c', bar: '#f97316' },
  { tagBg: '#ede9fe', tagText: '#6d28d9', bar: '#8b5cf6' },
  { tagBg: '#f3f4f6', tagText: '#374151', bar: '#9ca3af' },
  { tagBg: '#fce7f3', tagText: '#be185d', bar: '#ec4899' },
  { tagBg: '#dcfce7', tagText: '#15803d', bar: '#22c55e' },
  { tagBg: '#dbeafe', tagText: '#1d4ed8', bar: '#3b82f6' },
]

export type SearchResultBillPngOptions = {
  records: LedgerRecord[]
  fields: FieldDef[]
  productCatalog?: ProductCatalogEntry[]
  /** 统计下钻购买方（用于副标题） */
  drillPlate?: string
}

function assignStyle(el: HTMLElement, styles: Record<string, string>) {
  for (const [k, v] of Object.entries(styles)) {
    ;(el.style as unknown as Record<string, string>)[k] = v
  }
}

function createEl(
  tag: keyof HTMLElementTagNameMap,
  styles: Record<string, string> = {},
  text?: string,
): HTMLElement {
  const el = document.createElement(tag)
  assignStyle(el, styles)
  if (text !== undefined) el.textContent = text
  return el
}

function fmtMoney(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2)
}

const TAG_HEIGHT = 28
const TAG_FONT_SIZE = 13
const TAG_PAD_X = 10

function estimateProductTagWidth(text: string): number {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.font = `600 ${TAG_FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      return Math.ceil(ctx.measureText(text).width) + TAG_PAD_X * 2
    }
  }
  let w = 0
  for (const ch of text) {
    w += ch.charCodeAt(0) > 127 ? TAG_FONT_SIZE : 8
  }
  return w + TAG_PAD_X * 2
}

/** SVG 标签：html2canvas 对 HTML 行高垂直居中不可靠 */
function createProductTagSvg(
  productName: string,
  colors: { tagBg: string; tagText: string },
): SVGSVGElement {
  const width = Math.max(40, estimateProductTagWidth(productName))
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(TAG_HEIGHT))
  svg.style.display = 'block'
  svg.style.flexShrink = '0'

  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  rect.setAttribute('width', String(width))
  rect.setAttribute('height', String(TAG_HEIGHT))
  rect.setAttribute('rx', '8')
  rect.setAttribute('fill', colors.tagBg)

  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  label.setAttribute('x', String(width / 2))
  label.setAttribute('y', String(TAG_HEIGHT / 2))
  label.setAttribute('dominant-baseline', 'central')
  label.setAttribute('text-anchor', 'middle')
  label.setAttribute('fill', colors.tagText)
  label.setAttribute('font-size', String(TAG_FONT_SIZE))
  label.setAttribute('font-weight', '600')
  label.setAttribute(
    'font-family',
    '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  )
  label.textContent = productName

  svg.appendChild(rect)
  svg.appendChild(label)
  return svg
}

function buildSubtitle(
  records: LedgerRecord[],
  fields: FieldDef[],
  drillPlate?: string,
): string {
  const parts: string[] = []
  const plateTrim = drillPlate?.trim()
  if (plateTrim) {
    parts.push(`购买方 ${plateTrim}`)
  } else {
    const plates = new Set<string>()
    for (const r of records) {
      const p = getPlateValue(r, fields).trim()
      if (p) plates.add(p)
    }
    if (plates.size === 1) {
      parts.push(`购买方 ${[...plates][0]}`)
    } else if (plates.size > 1) {
      parts.push(`购买方 ${plates.size} 个`)
    }
  }
  if (records.length > 0) {
    const dates = records.map((r) => r.date).sort()
    parts.push(`${dates[0]} — ${dates[dates.length - 1]}`)
  }
  parts.push(`共${records.length}笔`)
  return parts.join(' · ')
}

function productColorMap(productRows: { name: string }[]): Map<string, (typeof PRODUCT_PALETTE)[0]> {
  const map = new Map<string, (typeof PRODUCT_PALETTE)[0]>()
  productRows.forEach((row, i) => {
    map.set(row.name, PRODUCT_PALETTE[i % PRODUCT_PALETTE.length])
  })
  return map
}

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']

function orderLabelOnDate(indexOnDate: number): string {
  if (indexOnDate <= 0) return ''
  return `单号${CIRCLED[indexOnDate - 1] ?? String(indexOnDate)}`
}

export async function renderSearchResultBillPngBlob(
  options: SearchResultBillPngOptions,
): Promise<Blob> {
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
  ).slice(0, MAX_CHART_PRODUCTS)
  const colorByProduct = productColorMap(productRows)
  const maxProductAmount = Math.max(...productRows.map((p) => p.amount), 1)

  const host = createEl('div', {
    position: 'fixed',
    left: '-9999px',
    top: '0',
    width: '390px',
    boxSizing: 'border-box',
    backgroundColor: PAGE_BG,
    padding: '20px 16px 24px',
    fontFamily:
      '-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
    color: TEXT,
    lineHeight: '1.4',
  })

  const brand = createEl('div', {
    fontSize: '22px',
    fontWeight: '600',
    letterSpacing: '0.2em',
    color: BRAND,
    marginBottom: '8px',
  }, 'kuaiji')

  const title = createEl('div', {
    fontSize: '26px',
    fontWeight: '700',
    marginBottom: '6px',
  }, '账单明细')

  const subtitle = createEl('div', {
    fontSize: '13px',
    color: MUTED,
    marginBottom: '14px',
    lineHeight: '1.5',
  }, buildSubtitle(list, fields, drillPlate))

  host.appendChild(brand)
  host.appendChild(title)
  host.appendChild(subtitle)

  const summaryRow = createEl('div', {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
  })

  const summaryItems = [
    { label: '合计金额', value: `¥${fmtMoney(totalAmount)}`, green: true },
    { label: '订单数', value: String(list.length), green: false },
    {
      label: '品类数',
      value: String(productRows.length),
      green: false,
    },
  ]

  for (const item of summaryItems) {
    const card = createEl('div', {
      flex: '1',
      minWidth: '0',
      backgroundColor: SUMMARY_BG,
      borderRadius: '14px',
      padding: '12px 10px',
      textAlign: 'center',
    })
    card.appendChild(
      createEl('div', {
        fontSize: '11px',
        color: MUTED,
        marginBottom: '4px',
      }, item.label),
    )
    card.appendChild(
      createEl('div', {
        fontSize: item.green ? '18px' : '20px',
        fontWeight: '700',
        color: item.green ? AMOUNT_GREEN : TEXT,
        fontVariantNumeric: 'tabular-nums',
      }, item.value),
    )
    summaryRow.appendChild(card)
  }
  host.appendChild(summaryRow)

  if (productRows.length > 0) {
    host.appendChild(
      createEl('div', {
        fontSize: '15px',
        fontWeight: '700',
        marginBottom: '10px',
      }, '品类采购金额分布'),
    )

    const chart = createEl('div', {
      backgroundColor: CARD_BG,
      borderRadius: '16px',
      padding: '14px 14px 10px',
      marginBottom: '16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    })

    for (const row of productRows) {
      const colors = colorByProduct.get(row.name) ?? PRODUCT_PALETTE[0]
      const rowEl = createEl('div', {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '10px',
      })
      rowEl.appendChild(
        createEl('div', {
          width: '52px',
          flexShrink: '0',
          fontSize: '13px',
          fontWeight: '600',
          color: TEXT,
        }, row.name),
      )
      const barTrack = createEl('div', {
        flex: '1',
        height: '10px',
        backgroundColor: '#f5f5f4',
        borderRadius: '999px',
        overflow: 'hidden',
      })
      const barFill = createEl('div', {
        height: '100%',
        width: `${Math.max(4, (row.amount / maxProductAmount) * 100)}%`,
        backgroundColor: colors.bar,
        borderRadius: '999px',
      })
      barTrack.appendChild(barFill)
      rowEl.appendChild(barTrack)
      rowEl.appendChild(
        createEl('div', {
          width: '64px',
          flexShrink: '0',
          textAlign: 'right',
          fontSize: '13px',
          fontWeight: '600',
          fontVariantNumeric: 'tabular-nums',
        }, `¥${fmtMoney(row.amount)}`),
      )
      chart.appendChild(rowEl)
    }
    host.appendChild(chart)
  }

  const countByDate = new Map<string, number>()
  for (const r of list) {
    countByDate.set(r.date, (countByDate.get(r.date) ?? 0) + 1)
  }
  const dateOrderSeen = new Map<string, number>()

  for (const rec of list) {
    const seen = (dateOrderSeen.get(rec.date) ?? 0) + 1
    dateOrderSeen.set(rec.date, seen)
    const showOrder = (countByDate.get(rec.date) ?? 1) > 1

    const card = createEl('div', {
      backgroundColor: CARD_BG,
      borderRadius: '16px',
      padding: '14px',
      marginBottom: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    })

    const recordTotal = getExpectedAmount(rec, amountId)
    const head = createEl('div', {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '10px',
      gap: '8px',
    })

    const headLeft = createEl('div', {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      minWidth: '0',
      flex: '1',
    })
    headLeft.appendChild(
      createEl('span', { fontSize: '14px', flexShrink: '0' }, '📅'),
    )
    const dateLabel = rec.date
    const orderSuffix = showOrder ? ` ${orderLabelOnDate(seen)}` : ''
    headLeft.appendChild(
      createEl('span', {
        fontSize: '14px',
        fontWeight: '600',
        color: TEXT,
      }, `${dateLabel}${orderSuffix}`),
    )
    head.appendChild(headLeft)
    head.appendChild(
      createEl('span', {
        fontSize: '16px',
        fontWeight: '700',
        fontVariantNumeric: 'tabular-nums',
        flexShrink: '0',
      }, `¥${fmtMoney(recordTotal)}`),
    )
    card.appendChild(head)

    const lines = expandProductLines(rec, fields)
    const renderLines =
      lines.length > 0
        ? lines
        : [{ product: '未填写商品', unitPriceStr: '', quantity: '', lineAmountStr: '' }]

    for (const line of renderLines) {
      const productName = line.product.trim() || '未填写商品'
      const colors = colorByProduct.get(productName) ?? PRODUCT_PALETTE[0]
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

      const lineRow = createEl('div', {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        marginBottom: '8px',
      })

      const left = createEl('div', {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flex: '1',
        flexWrap: 'wrap',
      })

      left.appendChild(createProductTagSvg(productName, colors))

      const detailParts: string[] = []
      if (unitVal > 0) detailParts.push(`¥${fmtMoney(unitVal)}`)
      if (qtyRaw) detailParts.push(`× ${qtyDisplay}`)
      left.appendChild(
        createEl('span', {
          fontSize: '12px',
          color: MUTED,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }, detailParts.join(' ') || '—'),
      )

      lineRow.appendChild(left)
      lineRow.appendChild(
        createEl('span', {
          fontSize: '14px',
          fontWeight: '700',
          fontVariantNumeric: 'tabular-nums',
          flexShrink: '0',
        }, lineAmt > 0 ? `¥${fmtMoney(lineAmt)}` : '—'),
      )
      card.appendChild(lineRow)
    }

    host.appendChild(card)
  }

  if (sorted.length > list.length) {
    host.appendChild(
      createEl('div', {
        textAlign: 'center',
        fontSize: '12px',
        color: MUTED,
        marginTop: '4px',
      }, `其余 ${sorted.length - list.length} 笔未展示`),
    )
  }

  host.appendChild(
    createEl('div', {
      textAlign: 'center',
      fontSize: '11px',
      color: MUTED,
      marginTop: '12px',
    }, `由 kuaiji 生成 · ${format(new Date(), 'yyyy-MM-dd HH:mm')}`),
  )

  document.body.appendChild(host)
  try {
    const canvas = await html2canvasReceiptElement(host, {
      scale: getReceiptCaptureScale(),
      backgroundColor: PAGE_BG,
    })
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/png')
    })
    if (!blob) throw new Error('生成 PNG 账单失败')
    return blob
  } finally {
    host.remove()
  }
}
