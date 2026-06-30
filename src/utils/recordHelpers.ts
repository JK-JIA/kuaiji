import type {
  FieldDef,
  LedgerRecord,
  LineItemRow,
  ProductCatalogEntry,
  ReconcilePayload,
} from '../types'
import { DEFAULT_FIELD_KEYS } from '../types'
import {
  formatQuantityWithResolvedUnit,
  readLineQuantityUnit,
} from './productUnits'

const MONEY_RE = /(\d+(?:\.\d+)?)/

type BuiltinFieldKey = NonNullable<FieldDef['key']>

/** 内置列删除后手加同名列时，用名称 + 旧 field_* id 回退读取账单 */
const BUILTIN_FIELD_FALLBACK_NAMES: Record<BuiltinFieldKey, string[]> = {
  product: ['商品'],
  unitPrice: ['单价'],
  quantity: ['数量', '斤数'],
  plate: ['购买方', '车牌号', '车牌'],
  amount: ['金额'],
}

function trimFieldValue(raw: string | undefined): string {
  return String(raw ?? '').trim()
}

/** 当前配置下的内置列 id（含同名自定义列、历史默认 id） */
export function resolveBuiltinFieldId(
  fields: FieldDef[],
  key: BuiltinFieldKey,
): string {
  const byKey = fields.find((f) => f.key === key)?.id
  if (byKey) return byKey
  for (const name of BUILTIN_FIELD_FALLBACK_NAMES[key]) {
    const byName = fields.find((f) => f.name.trim() === name)?.id
    if (byName) return byName
  }
  return DEFAULT_FIELD_KEYS[key]
}

/** 从一行 values 读取内置列（优先当前 id，再兼容旧默认 id） */
export function readBuiltinFieldValue(
  values: Record<string, string> | undefined,
  fields: FieldDef[],
  key: BuiltinFieldKey,
): string {
  if (!values) return ''
  const currentId = fields.find((f) => f.key === key)?.id
  const legacyId = DEFAULT_FIELD_KEYS[key]
  const tryId = (id: string | undefined) => {
    if (!id) return ''
    return trimFieldValue(values[id])
  }
  const fromCurrent = tryId(currentId)
  if (fromCurrent) return fromCurrent
  for (const name of BUILTIN_FIELD_FALLBACK_NAMES[key]) {
    const fid = fields.find((f) => f.name.trim() === name)?.id
    const v = tryId(fid)
    if (v) return v
  }
  if (legacyId && legacyId !== currentId) {
    const v = tryId(legacyId)
    if (v) return v
  }
  return ''
}

function migrateValuesToCurrentFields(
  values: Record<string, string>,
  fields: FieldDef[],
): { next: Record<string, string>; changed: boolean } {
  let changed = false
  const next = { ...values }
  const keys: BuiltinFieldKey[] = [
    'product',
    'unitPrice',
    'quantity',
    'plate',
    'amount',
  ]
  for (const key of keys) {
    const targetId = resolveBuiltinFieldId(fields, key)
    const legacyId = DEFAULT_FIELD_KEYS[key]
    const existing = trimFieldValue(next[targetId])
    if (existing) continue
    const legacyVal = trimFieldValue(next[legacyId])
    if (legacyVal) {
      next[targetId] = legacyVal
      changed = true
      continue
    }
    for (const name of BUILTIN_FIELD_FALLBACK_NAMES[key]) {
      const fid = fields.find((f) => f.name.trim() === name)?.id
      if (!fid || fid === targetId) continue
      const v = trimFieldValue(next[fid])
      if (v) {
        next[targetId] = v
        changed = true
        break
      }
    }
  }
  return { next, changed }
}

/** 列配置变更后，把旧 field_* 中的数据迁到当前列 id（避免删列再加回后账单空白） */
export function migrateRecordsToCurrentFieldIds(
  records: LedgerRecord[],
  fields: FieldDef[],
): { records: LedgerRecord[]; changed: boolean } {
  let anyChanged = false
  const nextRecords = records.map((rec) => {
    let recChanged = false
    const { next: values, changed: vCh } = migrateValuesToCurrentFields(
      rec.values,
      fields,
    )
    if (vCh) recChanged = true
    let lineItems = rec.lineItems
    if (rec.lineItems?.length) {
      lineItems = rec.lineItems.map((li) => {
        const { next: lv, changed: lCh } = migrateValuesToCurrentFields(
          li.values,
          fields,
        )
        if (lCh) recChanged = true
        return lCh ? { ...li, values: lv } : li
      })
    }
    if (!recChanged) return rec
    anyChanged = true
    return { ...rec, values, lineItems }
  })
  return { records: anyChanged ? nextRecords : records, changed: anyChanged }
}

/** 从「500」「500元」「1,200.5」中解析金额 */
/** 列表展示：数量后带计量单位（目录优先，否则默认斤；已有斤/kg 等单位则不重复加） */
export function formatQuantityWithUnit(
  raw: string,
  productName: string,
  catalog: ProductCatalogEntry[] | undefined,
  lineValues?: Record<string, string>,
): string {
  const recorded = readLineQuantityUnit(lineValues)
  return formatQuantityWithResolvedUnit(
    raw,
    productName,
    catalog ?? [],
    recorded,
  )
}

/** 无商品名上下文时等价于「数量 + 斤」 */
export function formatQuantityWithJin(raw: string): string {
  return formatQuantityWithUnit(raw, '', [])
}

/** 表头/列标题：去掉「数量 (斤)」「数量（斤）」等后缀，单位由各商品与单元格展示 */
export function displayQuantityFieldName(name: string): string {
  const t = String(name ?? '')
    .replace(/\s*[\(（]\s*斤\s*[\)）]\s*$/u, '')
    .trim()
  return t || '数量'
}

/** 购买方（内置 key plate）列为空时的分组键；随字段改名，如「（未填客户）」 */
export function emptyBuyerBucketLabel(fields: FieldDef[]): string {
  const name = fields.find((f) => f.key === 'plate')?.name?.trim() || '购买方'
  return `（未填${name}）`
}

/** 归一化分组键：空值与历史「（未填车牌）」合并为当前空占位 */
export function buyerBucketKey(raw: string | undefined, fields: FieldDef[]): string {
  const t = String(raw ?? '').trim()
  if (!t || t === '（未填车牌）') return emptyBuyerBucketLabel(fields)
  return t
}

export function isEmptyBuyerBucketKey(key: string, fields: FieldDef[]): boolean {
  return key === emptyBuyerBucketLabel(fields) || key === '（未填车牌）'
}

export function plateGroupHeading(plateRaw: string, fields: FieldDef[]): string {
  const label = fields.find((f) => f.key === 'plate')?.name ?? '购买方'
  if (
    !plateRaw.trim() ||
    plateRaw === emptyBuyerBucketLabel(fields) ||
    plateRaw === '（未填车牌）'
  ) {
    return `${label}未填`
  }
  return `${label}${plateRaw}`
}

export function parseMoney(s: string): number {
  const t = String(s).replace(/,/g, '')
  const m = t.match(MONEY_RE)
  if (!m) return 0
  const n = parseFloat(m[1])
  return Number.isNaN(n) ? 0 : Math.round(n * 100) / 100
}

/** 数量、金额等：仅保留数字与最多一个小数点，过滤中文与其它字符 */
export function sanitizeUnsignedDecimalInput(raw: string): string {
  const t = String(raw).replace(/[^\d.]/g, '')
  const dot = t.indexOf('.')
  if (dot === -1) return t
  return t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, '')
}

/**
 * 金额列 id：优先带 `key: 'amount'` 的默认列，否则匹配名称「金额」
 * （旧数据或手加字段可能无 key，避免核账弹窗误认为无应收、不显示输入框）
 */
export function getAmountFieldId(fields: FieldDef[]): string | undefined {
  return (
    fields.find((f) => f.key === 'amount')?.id ??
    fields.find((f) => f.name.trim() === '金额')?.id
  )
}

export function getUnitPriceFieldId(fields: FieldDef[]): string | undefined {
  const byKey = fields.find((f) => f.key === 'unitPrice')?.id
  if (byKey) return byKey
  const byName = fields.find((f) => f.name.trim() === '单价')?.id
  if (byName) return byName
  return DEFAULT_FIELD_KEYS.unitPrice
}

/** 单价×斤数 → 行金额字符串（元，最多两位小数）；任一侧无效或≤0 则空串 */
export function computedLineAmountFromUnitAndQty(
  unitPriceStr: string,
  quantityStr: string,
): string {
  const u = parseFloat(sanitizeUnsignedDecimalInput(unitPriceStr))
  const q = parseFloat(sanitizeUnsignedDecimalInput(quantityStr))
  if (!Number.isFinite(u) || !Number.isFinite(q) || u <= 0 || q <= 0)
    return ''
  const cents = Math.round(u * q * 100)
  const v = cents / 100
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

/** 编辑旧数据：仅有行金额与斤数时反推单价展示 */
export function deriveUnitPriceFromAmountAndQty(
  lineAmountStr: string,
  quantityStr: string,
): string {
  const a = parseMoney(lineAmountStr)
  const q = parseFloat(sanitizeUnsignedDecimalInput(quantityStr))
  if (a <= 0 || !Number.isFinite(q) || q <= 0) return ''
  const u = Math.round((a / q) * 10000) / 10000
  return String(u)
}

/** 行金额÷单价 → 数量（与 deriveUnitPriceFromAmountAndQty 对称） */
export function deriveQuantityFromAmountAndUnit(
  lineAmountStr: string,
  unitPriceStr: string,
): string {
  const a = parseMoney(lineAmountStr)
  const u = parseFloat(sanitizeUnsignedDecimalInput(unitPriceStr))
  if (a <= 0 || !Number.isFinite(u) || u <= 0) return ''
  const q = Math.round((a / u) * 10000) / 10000
  return String(q)
}

export type LineTripleLastEdited = 'unitPrice' | 'quantity' | 'lineAmount' | null

/** 用户是否曾手动输入过非空值（清空后视为未锚定） */
export type LineTripleTouched = {
  unitPrice: boolean
  quantity: boolean
  lineAmount: boolean
  /** 金额锚定后，用户第二个编辑的单价/数量（次高优先级） */
  secondAnchor: 'unitPrice' | 'quantity' | null
}

export function emptyLineTripleTouched(): LineTripleTouched {
  return {
    unitPrice: false,
    quantity: false,
    lineAmount: false,
    secondAnchor: null,
  }
}

/** 记一笔行内：根据本次编辑更新 touched / secondAnchor */
export function patchLineTripleTouched(
  prev: LineTripleTouched | undefined,
  field: Exclude<LineTripleLastEdited, null>,
  hasValue: boolean,
): LineTripleTouched {
  const base = { ...emptyLineTripleTouched(), ...prev }
  if (field === 'lineAmount') {
    base.lineAmount = hasValue
    if (!hasValue) base.secondAnchor = null
    return base
  }
  if (field === 'unitPrice') {
    base.unitPrice = hasValue
    if (base.lineAmount && hasValue) base.secondAnchor = 'unitPrice'
  } else {
    base.quantity = hasValue
    if (base.lineAmount && hasValue) base.secondAnchor = 'quantity'
  }
  if (!base.lineAmount) base.secondAnchor = null
  return base
}

/** 单价 / 数量 / 行金额 中有几项为有效正数 */
export function lineTripleFilledCount(row: {
  unitPrice: string
  quantity: string
  lineAmount: string
}): number {
  const u = sanitizeUnsignedDecimalInput(row.unitPrice)
  const q = sanitizeUnsignedDecimalInput(row.quantity)
  const aRaw = sanitizeUnsignedDecimalInput(row.lineAmount)
  const nu = parseFloat(u)
  const nq = parseFloat(q)
  const na = parseMoney(aRaw)
  const uOk = Number.isFinite(nu) && nu > 0
  const qOk = Number.isFinite(nq) && nq > 0
  const aOk = na > 0
  return (uOk ? 1 : 0) + (qOk ? 1 : 0) + (aOk ? 1 : 0)
}

/**
 * 单价 × 数量 = 行金额：
 * - 默认金额优先级最低，改单价或数量时重算金额；
 * - 用户单独改过金额后金额最高；此后第二个编辑的单价/数量为次高；
 * - 仅锚定金额时：改单价 → 反推数量（斤数），改数量 → 反推单价。
 */
export function reconcileLineTripleByLastEdited(row: {
  unitPrice: string
  quantity: string
  lineAmount: string
  lastEdited: LineTripleLastEdited
  touched?: LineTripleTouched
}): {
  unitPrice: string
  quantity: string
  lineAmount: string
  lastEdited: LineTripleLastEdited
  touched: LineTripleTouched
} {
  const touched: LineTripleTouched = {
    ...emptyLineTripleTouched(),
    ...row.touched,
  }

  const u = sanitizeUnsignedDecimalInput(row.unitPrice)
  const q = sanitizeUnsignedDecimalInput(row.quantity)
  const aRaw = sanitizeUnsignedDecimalInput(row.lineAmount)

  const nu = parseFloat(u)
  const nq = parseFloat(q)
  const na = parseMoney(aRaw)

  const uOk = Number.isFinite(nu) && nu > 0
  const qOk = Number.isFinite(nq) && nq > 0
  const aOk = na > 0

  let unitPrice = u
  let quantity = q
  let lineAmount = aRaw
  const lastEdited = row.lastEdited
  const amountAnchored = touched.lineAmount
  const second = touched.secondAnchor

  if (lastEdited === 'unitPrice' && !u.trim()) {
    return {
      unitPrice: '',
      quantity,
      lineAmount,
      lastEdited: 'unitPrice',
      touched,
    }
  }
  if (lastEdited === 'quantity' && !q.trim()) {
    return {
      unitPrice,
      quantity: '',
      lineAmount,
      lastEdited: 'quantity',
      touched,
    }
  }
  if (lastEdited === 'lineAmount' && !aRaw.trim()) {
    return {
      unitPrice,
      quantity,
      lineAmount: '',
      lastEdited: null,
      touched: { ...touched, lineAmount: false, secondAnchor: null },
    }
  }
  if (lastEdited === null && !aRaw.trim()) {
    return {
      unitPrice,
      quantity,
      lineAmount: '',
      lastEdited: null,
      touched,
    }
  }

  if (!amountAnchored) {
    if (lastEdited === 'unitPrice' || lastEdited === 'quantity') {
      if (uOk && qOk) {
        const c = computedLineAmountFromUnitAndQty(u, q)
        if (c) lineAmount = c
      } else if (lastEdited === 'unitPrice' && uOk && aOk) {
        const qd = deriveQuantityFromAmountAndUnit(aRaw, u)
        if (qd) quantity = sanitizeUnsignedDecimalInput(qd)
      } else if (lastEdited === 'quantity' && qOk && aOk) {
        const ud = deriveUnitPriceFromAmountAndQty(aRaw, q)
        if (ud) unitPrice = sanitizeUnsignedDecimalInput(ud)
      }
    } else if (lastEdited === 'lineAmount') {
      if (uOk && aOk) {
        const qd = deriveQuantityFromAmountAndUnit(aRaw, u)
        if (qd) quantity = sanitizeUnsignedDecimalInput(qd)
      } else if (qOk && aOk) {
        const ud = deriveUnitPriceFromAmountAndQty(aRaw, q)
        if (ud) unitPrice = sanitizeUnsignedDecimalInput(ud)
      }
    } else {
      if (uOk && qOk && !aOk) {
        const c = computedLineAmountFromUnitAndQty(u, q)
        if (c) lineAmount = c
      } else if (uOk && aOk && !qOk) {
        const qd = deriveQuantityFromAmountAndUnit(aRaw, u)
        if (qd) quantity = sanitizeUnsignedDecimalInput(qd)
      } else if (qOk && aOk && !uOk) {
        const ud = deriveUnitPriceFromAmountAndQty(aRaw, q)
        if (ud) unitPrice = sanitizeUnsignedDecimalInput(ud)
      }
    }
    return {
      unitPrice,
      quantity,
      lineAmount,
      lastEdited,
      touched: { ...touched, secondAnchor: null },
    }
  }

  if (lastEdited === 'lineAmount') {
    if (second === 'quantity' && qOk && aOk) {
      const ud = deriveUnitPriceFromAmountAndQty(aRaw, q)
      if (ud) unitPrice = sanitizeUnsignedDecimalInput(ud)
    } else if (uOk && aOk) {
      const qd = deriveQuantityFromAmountAndUnit(aRaw, u)
      if (qd) quantity = sanitizeUnsignedDecimalInput(qd)
    } else if (qOk && aOk) {
      const ud = deriveUnitPriceFromAmountAndQty(aRaw, q)
      if (ud) unitPrice = sanitizeUnsignedDecimalInput(ud)
    }
  } else if (lastEdited === 'unitPrice') {
    if (aOk && uOk) {
      const qd = deriveQuantityFromAmountAndUnit(aRaw, u)
      if (qd) quantity = sanitizeUnsignedDecimalInput(qd)
    }
  } else if (lastEdited === 'quantity') {
    if (aOk && qOk) {
      const ud = deriveUnitPriceFromAmountAndQty(aRaw, q)
      if (ud) unitPrice = sanitizeUnsignedDecimalInput(ud)
    }
  }

  return { unitPrice, quantity, lineAmount, lastEdited, touched }
}

export function getExpectedAmount(
  record: LedgerRecord,
  amountId: string | undefined,
): number {
  if (!amountId) return 0
  return parseMoney(record.values[amountId] ?? '')
}

/**
 * 有效已收：显式 receivedAmount，或旧数据仅 settled 且曾填金额时视为全额
 */
export function getReceivedAmount(
  record: LedgerRecord,
  expected: number,
): number {
  const r = record.receivedAmount
  if (r !== undefined && !Number.isNaN(r)) {
    return Math.max(0, Math.round(r * 100) / 100)
  }
  if (expected > 0 && record.settled === true) return expected
  return 0
}

export function getOutstanding(expected: number, received: number): number {
  return Math.max(0, Math.round((expected - received) * 100) / 100)
}

/** 带符号金额解析（本次收款可填负数冲减） */
/** 非负金额，用于核账本次收款 */
export function parseNonNegativeMoney(s: string): number {
  const t = String(s).trim().replace(/,/g, '')
  if (t === '') return 0
  const n = parseFloat(t)
  if (Number.isNaN(n) || n < 0) return 0
  return Math.round(n * 100) / 100
}

export function parseSignedMoney(s: string): number {
  const t = String(s).trim().replace(/,/g, '')
  if (t === '' || t === '-') return 0
  const n = parseFloat(t)
  return Number.isNaN(n) ? 0 : Math.round(n * 100) / 100
}

/** 周期内所有账单「应收 − 已收」之和（仅应收大于 0） */
export function sumOutstanding(
  records: LedgerRecord[],
  fields: FieldDef[],
): number {
  const aid = getAmountFieldId(fields)
  if (!aid) return 0
  let s = 0
  for (const r of records) {
    const exp = getExpectedAmount(r, aid)
    if (exp <= 0) continue
    const rec = getReceivedAmount(r, exp)
    s += getOutstanding(exp, rec)
  }
  return Math.round(s * 100) / 100
}

/** 整单是否已结清（全额收款，或无金额时人工标记已结清） */
export function isRecordFullyPaid(
  record: LedgerRecord,
  fields: FieldDef[],
): boolean {
  const aid = getAmountFieldId(fields)
  const exp = getExpectedAmount(record, aid)
  const rec = getReceivedAmount(record, exp)
  if (exp > 0) return rec >= exp - 0.005
  return record.settled === true
}

export function getPlateValue(record: LedgerRecord, fields: FieldDef[]): string {
  return readBuiltinFieldValue(record.values, fields, 'plate')
}

export type ExpandedProductLine = {
  product: string
  /** 单价（元/斤），无列或未填则为空 */
  unitPriceStr: string
  quantity: string
  /** 该行小计（元），来自 lineItem.values[金额列] */
  lineAmountStr: string
  /** 行 values（含记账单位元数据） */
  lineValues?: Record<string, string>
}

/** 与 expandProductLines 一致，并保留行号与 lineItem 供统计按行读数字段 */
export type ProductLineContext = {
  product: string
  unitPriceStr: string
  quantity: string
  lineAmountStr: string
  lineIndex: number
  lineItem: LineItemRow | null
}

export function expandProductLineContexts(
  record: LedgerRecord,
  fields: FieldDef[],
): ProductLineContext[] {
  const uid = getUnitPriceFieldId(fields)
  const aid = getAmountFieldId(fields)

  if (record.lineItems && record.lineItems.length > 0) {
    return record.lineItems.map((li, lineIndex) => ({
      product: readBuiltinFieldValue(li.values, fields, 'product'),
      unitPriceStr: uid
        ? readBuiltinFieldValue(li.values, fields, 'unitPrice')
        : '',
      quantity: readBuiltinFieldValue(li.values, fields, 'quantity'),
      lineAmountStr: aid
        ? readBuiltinFieldValue(li.values, fields, 'amount')
        : '',
      lineIndex,
      lineItem: li,
    }))
  }
  return [
    {
      product: readBuiltinFieldValue(record.values, fields, 'product'),
      unitPriceStr: uid
        ? readBuiltinFieldValue(record.values, fields, 'unitPrice')
        : '',
      quantity: readBuiltinFieldValue(record.values, fields, 'quantity'),
      lineAmountStr: aid
        ? readBuiltinFieldValue(record.values, fields, 'amount')
        : '',
      lineIndex: 0,
      lineItem: null,
    },
  ]
}

function lineValuesForContext(
  record: LedgerRecord,
  lineItem: LineItemRow | null,
): Record<string, string> | undefined {
  if (lineItem?.values) return lineItem.values
  return record.values
}

/** 展开为若干 (商品, 数量, 行金额) 行；兼容无 lineItems 的旧数据 */
export function expandProductLines(
  record: LedgerRecord,
  fields: FieldDef[],
): ExpandedProductLine[] {
  return expandProductLineContexts(record, fields).map(
    ({ product, unitPriceStr, quantity, lineAmountStr, lineItem }) => ({
      product,
      unitPriceStr,
      quantity,
      lineAmountStr,
      lineValues: lineValuesForContext(record, lineItem),
    }),
  )
}

/** 是否已有核账记录（含旧数据仅有 settled / receivedAmount） */
export function recordHasReconcileHistory(
  record: LedgerRecord,
  fields: FieldDef[],
): boolean {
  const aid = getAmountFieldId(fields)
  const exp = aid ? getExpectedAmount(record, aid) : 0
  const rec = getReceivedAmount(record, exp)
  return rec > 0 || record.settled === true || record.paymentUpdatedAt != null
}

/** 应用核账结果；仅在实收或结清状态变化时更新 paymentUpdatedAt */
export function applyReconcilePayment(
  record: LedgerRecord,
  fields: FieldDef[],
  payload: ReconcilePayload,
): LedgerRecord {
  if (payload.kind !== 'amount') return record

  const aid = getAmountFieldId(fields)
  const exp = aid ? parseMoney(record.values[aid] ?? '') : 0
  const rounded = Math.round(payload.cumulativeReceived * 100) / 100
  const recv =
    exp > 0
      ? Math.max(0, Math.min(exp, rounded))
      : Math.max(0, rounded)
  const settled =
    exp > 0 ? recv >= exp - 0.005 : payload.markSettled === true
  const prevRecv = getReceivedAmount(record, exp)
  const prevSettled = record.settled === true
  const paymentChanged =
    Math.abs(recv - prevRecv) > 0.005 ||
    (exp <= 0 && settled !== prevSettled)

  return {
    ...record,
    receivedAmount: recv,
    settled,
    paymentUpdatedAt: paymentChanged
      ? Date.now()
      : record.paymentUpdatedAt,
  }
}
