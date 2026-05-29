import type { DoubaoProductLine } from './doubaoParser'
import type {
  FieldDef,
  LedgerRecord,
  LineItemRow,
  ProductCatalogEntry,
} from '../types'
import {
  LINE_QUANTITY_UNIT_KEY,
  splitVoiceQuantityString,
} from './productUnits'
import { defaultUnitForProduct } from './productCatalogHelpers'
import {
  computedLineAmountFromUnitAndQty,
  emptyLineTripleTouched,
  getAmountFieldId,
  parseMoney,
  parseNonNegativeMoney,
  reconcileLineTripleByLastEdited,
  sanitizeUnsignedDecimalInput,
  type LineTripleLastEdited,
  type LineTripleTouched,
} from './recordHelpers'

export type LedgerLineForm = {
  id: string
  product: string
  unitPrice: string
  quantity: string
  /** 本行数量所用单位（与商品目录一致） */
  quantityUnit: string
  lineAmount: string
  lastEdited: LineTripleLastEdited
  touched: LineTripleTouched
}

export type LedgerFormLayout = {
  sortedFields: FieldDef[]
  prodField: FieldDef | undefined
  qtyField: FieldDef | undefined
  unitPriceField: FieldDef | undefined
  canonicalAmountId: string | undefined
  rootFieldIds: string[]
  showDetailAmounts: boolean
  rootFieldIdsForRender: string[]
  prodId: string | undefined
  qtyId: string | undefined
  unitPriceId: string | undefined
}

export function getLedgerFormLayout(fields: FieldDef[]): LedgerFormLayout {
  const sortedFields = [...fields].sort((a, b) => a.order - b.order)
  const prodField = sortedFields.find((f) => f.key === 'product')
  const qtyField = sortedFields.find((f) => f.key === 'quantity')
  const unitPriceField = sortedFields.find((f) => f.key === 'unitPrice')
  const prodId = prodField?.id
  const qtyId = qtyField?.id
  const unitPriceId = unitPriceField?.id

  const canonicalAmountId = getAmountFieldId(sortedFields)
  const rootFieldIds = sortedFields
    .filter(
      (f) =>
        f.key !== 'product' &&
        f.key !== 'quantity' &&
        f.key !== 'unitPrice',
    )
    .filter((f) => {
      if (!canonicalAmountId) return true
      if (f.id === canonicalAmountId) return true
      if (
        f.type === 'number' &&
        f.name.trim() === '金额' &&
        f.id !== canonicalAmountId
      )
        return false
      return true
    })
    .map((f) => f.id)

  const showDetailAmounts = Boolean(
    prodField && qtyField && canonicalAmountId && unitPriceId,
  )

  const rootFieldIdsForRender =
    showDetailAmounts && canonicalAmountId
      ? rootFieldIds.filter((id) => id !== canonicalAmountId)
      : rootFieldIds

  return {
    sortedFields,
    prodField,
    qtyField,
    unitPriceField,
    canonicalAmountId,
    rootFieldIds,
    showDetailAmounts,
    rootFieldIdsForRender,
    prodId,
    qtyId,
    unitPriceId,
  }
}

export function formatLedgerMoneyInput(n: number): string {
  const r = Math.round(n * 100) / 100
  if (!Number.isFinite(r) || r <= 0) return ''
  return Number.isInteger(r) ? String(r) : r.toFixed(2)
}

/** 含任意空白（空格、换行、制表符等）则不允许保存 */
function hasWhitespace(s: string): boolean {
  return /\s/.test(s)
}

export function emptyLedgerFieldValues(fields: FieldDef[]): Record<string, string> {
  const o: Record<string, string> = {}
  for (const f of fields) o[f.id] = ''
  return o
}

export function rootValuesFromRecord(
  fields: FieldDef[],
  raw: Record<string, string>,
): Record<string, string> {
  const o = emptyLedgerFieldValues(fields)
  for (const f of fields) {
    if (f.key === 'product' || f.key === 'quantity' || f.key === 'unitPrice')
      continue
    if (raw[f.id] !== undefined) o[f.id] = raw[f.id]
  }
  return o
}

export function buildMergedValues(
  values: Record<string, string>,
  lines: LedgerLineForm[],
  prodId: string | undefined,
  qtyId: string | undefined,
): Record<string, string> {
  const merged = { ...values }
  if (prodId && qtyId && lines[0]) {
    merged[prodId] = lines[0].product.trim()
    merged[qtyId] = lines[0].quantity.trim()
  }
  return merged
}

export function createEmptyLineForm(quantityUnit = ''): LedgerLineForm {
  return {
    id: crypto.randomUUID(),
    product: '',
    unitPrice: '',
    quantity: '',
    quantityUnit,
    lineAmount: '',
    lastEdited: null,
    touched: emptyLineTripleTouched(),
  }
}

/** 明细行小计同步到「金额」根字段（与 AddRecordModal 内 effect 一致） */
export function syncCanonicalAmountFromLines(
  layout: LedgerFormLayout,
  values: Record<string, string>,
  lines: LedgerLineForm[],
): Record<string, string> {
  const { canonicalAmountId, showDetailAmounts } = layout
  if (!canonicalAmountId || !showDetailAmounts) return values
  const sub = lines.reduce((s, l) => s + parseMoney(l.lineAmount), 0)
  const next = sub > 0 ? formatLedgerMoneyInput(sub) : ''
  if (values[canonicalAmountId] === next) return values
  return { ...values, [canonicalAmountId]: next }
}

export function validateRecordForm(
  layout: LedgerFormLayout,
  input: {
    values: Record<string, string>
    lines: LedgerLineForm[]
    dealInput: string
  },
): string | null {
  const {
    sortedFields,
    prodField,
    qtyField,
    unitPriceField,
    canonicalAmountId,
    rootFieldIdsForRender,
    showDetailAmounts,
    prodId,
    qtyId,
  } = layout
  const { values, lines, dealInput } = input

  const merged = buildMergedValues(values, lines, prodId, qtyId)
  if (!prodId || !qtyId) return '缺少商品或数量字段配置'

  for (const f of sortedFields) {
    if (f.key === 'product' || f.key === 'quantity' || f.key === 'unitPrice')
      continue
    if (
      canonicalAmountId &&
      f.id !== canonicalAmountId &&
      f.type === 'number' &&
      f.name.trim() === '金额'
    ) {
      continue
    }
    if (!f.required) continue
    if (!(merged[f.id] ?? '').trim()) {
      return `请填写「${f.name}」`
    }
  }

  const hasAnyLine =
    lines.some((l) => l.product.trim()) ||
    lines.some((l) => l.quantity.trim())
  if (!hasAnyLine) return '请至少填写一行商品或数量'

  for (let i = 0; i < lines.length; i++) {
    const p = lines[i].product.trim()
    const q = lines[i].quantity.trim()
    if (!p && !q) continue
    if (prodField?.required && !p) {
      return `第 ${i + 1} 行：请填写「${prodField.name}」`
    }
    if (qtyField?.required && !q) {
      return `第 ${i + 1} 行：请填写「${qtyField.name}」`
    }
    if (showDetailAmounts && qtyId) {
      const u = parseFloat(sanitizeUnsignedDecimalInput(lines[i].unitPrice))
      const nq = parseFloat(sanitizeUnsignedDecimalInput(lines[i].quantity))
      const a = parseMoney(lines[i].lineAmount)
      const uOk = Number.isFinite(u) && u > 0
      const qOk = Number.isFinite(nq) && nq > 0
      const aOk = a > 0
      const pairs = (uOk ? 1 : 0) + (qOk ? 1 : 0) + (aOk ? 1 : 0)
      if (p && q && pairs < 2) {
        return `第 ${i + 1} 行：单价、数量、金额至少填两项`
      }
    }
  }

  const spaceIssues: string[] = []
  for (const fid of rootFieldIdsForRender) {
    const f = sortedFields.find((x) => x.id === fid)
    if (!f) continue
    const raw = values[fid] ?? ''
    if (raw && hasWhitespace(raw)) {
      spaceIssues.push(`「${f.name}」中含空格或空白，请删去后再保存`)
    }
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const rowUsed =
      line.product.trim() ||
      line.quantity.trim() ||
      line.unitPrice.trim() ||
      line.lineAmount.trim()
    if (!rowUsed) continue
    if (hasWhitespace(line.product)) {
      spaceIssues.push(
        `第 ${i + 1} 行「${prodField?.name ?? '商品'}」中含空格或空白，请删去后再保存`,
      )
    }
    if (hasWhitespace(line.quantity)) {
      spaceIssues.push(
        `第 ${i + 1} 行「${qtyField?.name ?? '数量'}」中含空格或空白，请删去后再保存`,
      )
    }
    if (showDetailAmounts && line.unitPrice && hasWhitespace(line.unitPrice)) {
      spaceIssues.push(
        `第 ${i + 1} 行「${unitPriceField?.name ?? '单价'}」中含空格或空白，请删去后再保存`,
      )
    }
    if (
      showDetailAmounts &&
      canonicalAmountId &&
      line.lineAmount &&
      hasWhitespace(line.lineAmount)
    ) {
      spaceIssues.push(
        `第 ${i + 1} 行「金额」中含空格或空白，请删去后再保存`,
      )
    }
  }
  if (dealInput && hasWhitespace(dealInput)) {
    spaceIssues.push(
      '「总价（优惠后实收价）」中含空格或空白，请删去后再保存',
    )
  }
  if (spaceIssues.length > 0) {
    return spaceIssues.join('\n')
  }

  return null
}

export function buildLedgerRecordForSave(
  layout: LedgerFormLayout,
  args: {
    values: Record<string, string>
    lines: LedgerLineForm[]
    dealInput: string
    recordDate: string
    recordToEdit: LedgerRecord | null
    liveRecord?: LedgerRecord | null
  },
): LedgerRecord {
  const { canonicalAmountId, prodId, qtyId, unitPriceId } = layout
  const { values, lines, dealInput, recordDate, recordToEdit, liveRecord } =
    args

  if (!prodId || !qtyId) {
    throw new Error('缺少商品或数量字段配置')
  }

  let mergedValues = buildMergedValues(values, lines, prodId, qtyId)

  const shouldPersistLineItems =
    lines.length > 1 ||
    Boolean(
      canonicalAmountId &&
        lines.some(
          (l) => l.lineAmount.trim() !== '' || l.unitPrice.trim() !== '',
        ),
    )

  let lineItems: LineItemRow[] | undefined
  if (shouldPersistLineItems) {
    lineItems = lines.map((l) => {
      const qtyUnit = l.quantityUnit.trim()
      return {
        id: l.id,
        values: {
          [prodId]: l.product.trim(),
          [qtyId]: l.quantity.trim(),
          ...(qtyUnit ? { [LINE_QUANTITY_UNIT_KEY]: qtyUnit } : {}),
          ...(unitPriceId ? { [unitPriceId]: l.unitPrice.trim() } : {}),
          ...(canonicalAmountId
            ? { [canonicalAmountId]: l.lineAmount.trim() }
            : {}),
        },
      }
    })
  } else {
    const qtyUnit = lines[0]?.quantityUnit.trim()
    if (qtyUnit) {
      mergedValues = { ...mergedValues, [LINE_QUANTITY_UNIT_KEY]: qtyUnit }
    } else {
      const { [LINE_QUANTITY_UNIT_KEY]: _removed, ...rest } = mergedValues
      mergedValues = rest
    }
  }

  const dealParsed = parseNonNegativeMoney(dealInput)
  const nextDeal: number | undefined =
    dealInput.trim() === '' ? undefined : dealParsed

  return {
    id: recordToEdit?.id ?? crypto.randomUUID(),
    date: recordDate,
    createdAt: recordToEdit?.createdAt ?? Date.now(),
    values: mergedValues,
    lineItems,
    settled: (liveRecord?.settled ?? recordToEdit?.settled) === true,
    receivedAmount: liveRecord?.receivedAmount ?? recordToEdit?.receivedAmount,
    dealAmount: nextDeal,
  }
}

export function mergeVoiceParsedIntoValues(
  sortedFields: FieldDef[],
  prev: Record<string, string>,
  data: Record<string, string>,
): Record<string, string> {
  const next = { ...prev, ...data }
  for (const k of Object.keys(data)) {
    const f = sortedFields.find((x) => x.id === k)
    if (f?.type === 'number') {
      next[k] = sanitizeUnsignedDecimalInput(String(data[k] ?? ''))
    } else if (data[k] !== undefined) {
      next[k] = String(data[k])
    }
  }
  return next
}

export function mapDoubaoProductLinesToLineForms(
  productLines: DoubaoProductLine[],
  catalog: ProductCatalogEntry[] = [],
): LedgerLineForm[] {
  return productLines.map((l) => {
    const { quantity: q, quantityUnit } = splitVoiceQuantityString(
      l.quantity,
      l.product,
      catalog,
    )
    const u = sanitizeUnsignedDecimalInput((l.unitPrice ?? '').trim())
    const fromAi = sanitizeUnsignedDecimalInput(l.lineAmount?.trim() ?? '')
    const computed = computedLineAmountFromUnitAndQty(u, q)
    const merged = {
      unitPrice: u,
      quantity: q,
      lineAmount: fromAi || computed,
    }
    const lastEdited: LineTripleLastEdited =
      fromAi.trim() !== ''
        ? 'lineAmount'
        : computed
          ? 'quantity'
          : 'unitPrice'
    const r = reconcileLineTripleByLastEdited({
      ...merged,
      lastEdited,
      touched: emptyLineTripleTouched(),
    })
    return {
      id: crypto.randomUUID(),
      product: l.product,
      quantityUnit,
      ...r,
      lastEdited: null,
      touched: emptyLineTripleTouched(),
    }
  })
}

export function lineFormQuantityUnitFromValues(
  values: Record<string, string> | undefined,
  productName: string,
  catalog: ProductCatalogEntry[],
): string {
  const stored = values?.[LINE_QUANTITY_UNIT_KEY]?.trim()
  if (stored) return stored
  return defaultUnitForProduct(productName, catalog)
}

export function applyVoiceFillFirstLine(
  prevLines: LedgerLineForm[],
  product: string,
  quantity: string,
): LedgerLineForm[] {
  return prevLines.map((row, i) => {
    if (i !== 0) return row
    const qSan =
      quantity !== undefined && quantity !== ''
        ? sanitizeUnsignedDecimalInput(quantity)
        : row.quantity
    const touched: LineTripleTouched = {
      ...(row.touched ?? emptyLineTripleTouched()),
      quantity:
        quantity !== undefined && quantity !== ''
          ? qSan.trim() !== ''
          : (row.touched?.quantity ?? false),
    }
    return {
      ...row,
      product: product || row.product,
      quantity: qSan,
      touched,
    }
  })
}

/**
 * 豆包解析结果应用到 values + lines（与 AddRecordModal 内 VoiceInputSection 回调一致）
 */
export function applyVoiceParsedToDraft(
  layout: LedgerFormLayout,
  prevValues: Record<string, string>,
  prevLines: LedgerLineForm[],
  data: Record<string, string>,
  productLines?: DoubaoProductLine[],
  catalog: ProductCatalogEntry[] = [],
): { values: Record<string, string>; lines: LedgerLineForm[] } {
  const { sortedFields, prodId, qtyId } = layout
  let values = mergeVoiceParsedIntoValues(sortedFields, prevValues, data)
  let lines = prevLines
  if (productLines?.length && prodId && qtyId) {
    lines = mapDoubaoProductLinesToLineForms(productLines, catalog)
  }
  values = syncCanonicalAmountFromLines(layout, values, lines)
  return { values, lines }
}
