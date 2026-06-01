import type { FieldDef, LedgerRecord } from '../types'
import {
  expandProductLines,
  getAmountFieldId,
  getExpectedAmount,
  getOutstanding,
  getPlateValue,
  getReceivedAmount,
  parseMoney,
} from './recordHelpers'
import { SIMPLE_CSV_HEADERS } from './exportData'

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const STYLE = {
  headerBg: 'FF4472C4',
  headerFg: 'FFFFFFFF',
  rowAlt: 'FFE9EDF4',
  rowWhite: 'FFFFFFFF',
  subtotalBg: 'FFD9E1F2',
  grandBg: 'FFE7E6E6',
  border: 'FFB4C6E7',
} as const

const COL = {
  plate: 1,
  date: 2,
  product: 3,
  unitPrice: 4,
  amount: 5,
  total: 6,
  outstanding: 7,
  received: 8,
} as const

const COL_COUNT = 8

function formatExportDate(dateYmd: string): string {
  const parts = dateYmd.split('-').map((x) => parseInt(x, 10))
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return dateYmd
  return `${parts[0]}/${parts[1]}/${parts[2]}`
}

function moneyCellValue(n: number, useDashWhenZero: boolean): number | string {
  const v = Math.round(n * 100) / 100
  if (useDashWhenZero && v <= 0.005) return '-'
  return v
}

function parseOptionalNum(s: string): number | string {
  const t = String(s).trim()
  if (!t) return ''
  const n = parseMoney(t)
  return Number.isFinite(n) && n !== 0 ? n : t
}

type ExcelCell = import('exceljs').Cell
type ExcelRow = import('exceljs').Row

function applyBorder(cell: ExcelCell) {
  cell.border = {
    top: { style: 'thin', color: { argb: STYLE.border } },
    left: { style: 'thin', color: { argb: STYLE.border } },
    bottom: { style: 'thin', color: { argb: STYLE.border } },
    right: { style: 'thin', color: { argb: STYLE.border } },
  }
}

function styleRow(row: ExcelRow, fillArgb: string, bold = false) {
  row.height = 22
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber > COL_COUNT) return
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: fillArgb },
    }
    cell.font = { bold, size: 11, color: { argb: 'FF000000' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    applyBorder(cell)
  })
}

export async function buildLedgerExcelBlob(
  records: LedgerRecord[],
  fields: FieldDef[],
): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('账单', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  ws.columns = [
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 10 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
  ]

  const headerRow = ws.addRow([...SIMPLE_CSV_HEADERS])
  styleRow(headerRow, STYLE.headerBg, true)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: STYLE.headerFg } }
  })

  const amountId = getAmountFieldId(fields)
  let sumOutstanding = 0
  let sumReceived = 0
  let dataRowIndex = 0

  for (const r of records) {
    const plate = getPlateValue(r, fields)
    const expected = getExpectedAmount(r, amountId)
    const received = getReceivedAmount(r, expected)
    const outstanding = getOutstanding(expected, received)
    sumOutstanding += outstanding
    sumReceived += received

    const lines = expandProductLines(r, fields)
    const lineRows =
      lines.length > 0
        ? lines
        : [
            {
              product: '',
              unitPriceStr: '',
              quantity: '',
              lineAmountStr: '',
            },
          ]

    for (const line of lineRows) {
      const fill = dataRowIndex % 2 === 0 ? STYLE.rowWhite : STYLE.rowAlt
      dataRowIndex++

      const row = ws.addRow([
        plate,
        formatExportDate(r.date),
        line.product,
        parseOptionalNum(line.unitPriceStr),
        parseOptionalNum(line.lineAmountStr),
        expected > 0 ? Math.round(expected * 100) / 100 : '',
        moneyCellValue(outstanding, true),
        moneyCellValue(received, true),
      ])
      styleRow(row, fill)
      row.getCell(COL.date).numFmt = '@'
    }
  }

  sumOutstanding = Math.round(sumOutstanding * 100) / 100
  sumReceived = Math.round(sumReceived * 100) / 100
  const sumGrand = Math.round((sumOutstanding + sumReceived) * 100) / 100

  const subRow = ws.addRow(['', '', '总金额', '', '', '', sumOutstanding, sumReceived])
  styleRow(subRow, STYLE.subtotalBg, true)

  const grandRow = ws.addRow(['总计', '', '', '', '', '', sumGrand, ''])
  styleRow(grandRow, STYLE.grandBg, true)
  const grandRowNum = grandRow.number
  ws.mergeCells(grandRowNum, COL.plate, grandRowNum, COL.total)
  ws.mergeCells(grandRowNum, COL.outstanding, grandRowNum, COL.received)
  const grandLabel = grandRow.getCell(COL.plate)
  grandLabel.value = '总计'
  grandLabel.alignment = { horizontal: 'center', vertical: 'middle' }
  const grandSum = grandRow.getCell(COL.outstanding)
  grandSum.value = sumGrand
  grandSum.alignment = { horizontal: 'center', vertical: 'middle' }

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], { type: XLSX_MIME })
}

export function defaultExportXlsxFilename(
  baseName: string,
  dateFrom?: string,
  dateTo?: string,
): string {
  if (baseName.trim()) {
    return baseName.trim().replace(/\.csv$/i, '.xlsx')
  }
  if (dateFrom || dateTo) {
    const lo = (dateFrom ?? '0000-01-01').replace(/-/g, '')
    const hi = (dateTo ?? '9999-12-31').replace(/-/g, '')
    return `个人记账_${lo}_${hi}.xlsx`
  }
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `ledger-export-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.xlsx`
}

export { XLSX_MIME }
