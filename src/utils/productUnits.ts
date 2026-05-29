import type { LineItemRow, ProductCatalogEntry, ProductUnitDef } from '../types'
import { lookupCatalogEntryForProduct } from './productCatalogHelpers'
import { sanitizeUnsignedDecimalInput } from './recordHelpers'

/** 行内数量所用单位（存于 lineItem.values / record.values，非 FieldDef） */
export const LINE_QUANTITY_UNIT_KEY = '__line_qty_unit__'

export const BASE_STAT_UNIT = '斤'

const UNIT_IN_QUANTITY_RE =
  /(\d+(?:\.\d+)?)\s*(斤|千克|公斤|kg|吨|包|箱|袋|框|个|两)/i

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** 规范化单位列表：至少一项、唯一默认、同步默认单位名 */
export function normalizeProductUnits(
  unitsRaw: ProductUnitDef[] | undefined,
  legacyUnit?: string,
): ProductUnitDef[] {
  const legacy = String(legacyUnit ?? BASE_STAT_UNIT).trim() || BASE_STAT_UNIT
  const raw = Array.isArray(unitsRaw) ? unitsRaw : []
  const seen = new Set<string>()
  const out: ProductUnitDef[] = []

  for (const u of raw) {
    const name = String(u?.name ?? '').trim()
    if (!name) continue
    const k = name.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    const factor = Number(u.factorToJin)
    out.push({
      name,
      factorToJin:
        Number.isFinite(factor) && factor > 0 ? round4(factor) : 1,
      isDefault: Boolean(u.isDefault),
    })
  }

  if (out.length === 0) {
    out.push({
      name: legacy,
      factorToJin: legacy === BASE_STAT_UNIT ? 1 : 1,
      isDefault: true,
    })
  }

  const defaultIdx = out.findIndex((u) => u.isDefault)
  const di = defaultIdx >= 0 ? defaultIdx : 0
  return out.map((u, i) => ({ ...u, isDefault: i === di }))
}

export function getCatalogUnits(
  entry: ProductCatalogEntry | undefined,
): ProductUnitDef[] {
  if (!entry) {
    return [{ name: BASE_STAT_UNIT, factorToJin: 1, isDefault: true }]
  }
  return normalizeProductUnits(entry.units, entry.unit)
}

export function defaultUnitDef(
  entry: ProductCatalogEntry | undefined,
): ProductUnitDef {
  const units = getCatalogUnits(entry)
  return units.find((u) => u.isDefault) ?? units[0]!
}

export function unitsForProduct(
  productName: string,
  catalog: ProductCatalogEntry[],
): ProductUnitDef[] {
  return getCatalogUnits(lookupCatalogEntryForProduct(productName, catalog))
}

export function factorForProductUnit(
  productName: string,
  unitName: string,
  catalog: ProductCatalogEntry[],
): number | undefined {
  const u = unitsForProduct(productName, catalog).find(
    (x) => x.name === unitName,
  )
  return u?.factorToJin
}

export function parseQuantityNumeric(raw: string): number {
  const s = String(raw).trim()
  if (!s) return 0
  const embedded = s.match(UNIT_IN_QUANTITY_RE)
  if (embedded) return parseFloat(embedded[1]) || 0
  const n = parseFloat(sanitizeUnsignedDecimalInput(s))
  return Number.isFinite(n) ? n : 0
}

/** 从数量字符串解析嵌入单位（无则 undefined） */
export function parseEmbeddedUnit(raw: string): string | undefined {
  const s = String(raw).trim()
  const m = s.match(UNIT_IN_QUANTITY_RE)
  if (!m) return undefined
  const u = m[2]
  if (/kg/i.test(u)) return '公斤'
  return u
}

function normalizeSpokenUnitToken(raw: string): string {
  const u = String(raw ?? '').trim()
  if (/kg/i.test(u)) return '公斤'
  if (/千克/.test(u)) return '公斤'
  return u
}

/** 口语单位名对齐商品目录中的规范单位名 */
export function resolveCatalogUnitName(
  productName: string,
  unitToken: string,
  catalog: ProductCatalogEntry[],
): string {
  const token = normalizeSpokenUnitToken(unitToken)
  const units = unitsForProduct(productName, catalog)
  const exact = units.find((u) => u.name === token)
  if (exact) return exact.name
  const starts = units.find((u) => u.name.startsWith(token))
  if (starts) return starts.name
  return token
}

/**
 * 智能解析数量字段 → 纯数字 + 单位（勿先 strip 非数字，否则会丢掉「包」等）
 */
export function splitVoiceQuantityString(
  rawQty: string,
  productName: string,
  catalog: ProductCatalogEntry[] = [],
): { quantity: string; quantityUnit: string } {
  const trimmed = String(rawQty ?? '').trim()
  const fallbackUnit = defaultUnitDef(
    lookupCatalogEntryForProduct(productName, catalog),
  ).name
  if (!trimmed) {
    return { quantity: '', quantityUnit: fallbackUnit }
  }
  const embedded = parseEmbeddedUnit(trimmed)
  const num = parseQuantityNumeric(trimmed)
  const qtyStr =
    num > 0
      ? String(num)
      : sanitizeUnsignedDecimalInput(trimmed) || trimmed
  if (embedded) {
    return {
      quantity: qtyStr,
      quantityUnit: resolveCatalogUnitName(productName, embedded, catalog),
    }
  }
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return { quantity: trimmed, quantityUnit: fallbackUnit }
  }
  return { quantity: qtyStr, quantityUnit: fallbackUnit }
}

export function readLineQuantityUnit(
  values: Record<string, string> | undefined,
): string | undefined {
  const u = values?.[LINE_QUANTITY_UNIT_KEY]?.trim()
  return u || undefined
}

export function resolveLineQuantityUnit(input: {
  quantity: string
  values?: Record<string, string>
  productName: string
  catalog: ProductCatalogEntry[]
}): string {
  const stored = readLineQuantityUnit(input.values)
  if (stored) return stored
  const embedded = parseEmbeddedUnit(input.quantity)
  if (embedded) return embedded
  const entry = lookupCatalogEntryForProduct(input.productName, input.catalog)
  return defaultUnitDef(entry).name
}

export function quantityToJin(
  numericQty: number,
  unitName: string,
  productName: string,
  catalog: ProductCatalogEntry[],
): number {
  if (!Number.isFinite(numericQty) || numericQty <= 0) return 0
  const factor =
    factorForProductUnit(productName, unitName, catalog) ??
    (unitName === BASE_STAT_UNIT ? 1 : undefined)
  if (!factor) {
    if (unitName === BASE_STAT_UNIT) return round4(numericQty)
    const kg = unitName.match(/千克|公斤|kg/i)
    if (kg) return round4(numericQty * 2)
    return round4(numericQty)
  }
  return round4(numericQty * factor)
}

export function lineQuantityToJin(input: {
  product: string
  quantity: string
  lineItem?: LineItemRow | null
  recordValues?: Record<string, string>
  catalog: ProductCatalogEntry[]
}): number {
  const values = input.lineItem?.values ?? input.recordValues
  const unit = resolveLineQuantityUnit({
    quantity: input.quantity,
    values,
    productName: input.product,
    catalog: input.catalog,
  })
  const num = parseQuantityNumeric(input.quantity)
  return quantityToJin(num, unit, input.product, input.catalog)
}

export function jinToUnitQuantity(
  jin: number,
  targetUnit: string,
  productName: string,
  catalog: ProductCatalogEntry[],
): number {
  if (!Number.isFinite(jin) || jin <= 0) return 0
  if (targetUnit === BASE_STAT_UNIT) return round4(jin)
  const factor = factorForProductUnit(productName, targetUnit, catalog)
  if (!factor || factor <= 0) return 0
  return round4(jin / factor)
}

/** 统计页可选单位：斤 + 目录中出现的全部单位名 */
export function collectDistinctStatUnits(
  catalog: ProductCatalogEntry[],
): string[] {
  const seen = new Set<string>([BASE_STAT_UNIT])
  const out = [BASE_STAT_UNIT]
  for (const e of catalog) {
    for (const u of getCatalogUnits(e)) {
      if (!seen.has(u.name)) {
        seen.add(u.name)
        out.push(u.name)
      }
    }
  }
  return out
}

export function formatQuantityWithResolvedUnit(
  raw: string,
  productName: string,
  catalog: ProductCatalogEntry[],
  recordedUnit?: string,
): string {
  const s = String(raw).trim()
  if (!s) return '—'
  if (parseEmbeddedUnit(s)) return s
  const unit =
    recordedUnit?.trim() ||
    resolveLineQuantityUnit({
      quantity: s,
      productName,
      catalog,
    })
  const num = parseQuantityNumeric(s)
  if (!num) return '—'
  const displayNum =
    Number.isInteger(num) || Math.abs(num - Math.round(num * 100) / 100) < 1e-6
      ? String(Number.isInteger(num) ? num : num.toFixed(2).replace(/\.?0+$/, ''))
      : String(num)
  return `${displayNum}${unit}`
}
