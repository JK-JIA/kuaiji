import type { ProductCatalogEntry, ProductUnitDef } from '../types'
import {
  normalizeAliasList,
  sanitizeAliasesForProduct,
  sanitizeAllCatalogAliases,
} from './productAliasHelpers'
import { defaultUnitDef, normalizeProductUnits } from './productUnits'
import { normalizeToken } from './voiceHistoryFuzzy'

/**
 * 统一目录条目：修复缺省 source、非法字段，避免合并逻辑把「手动」误丢。
 */
export function normalizeCatalogEntry(
  raw: Partial<ProductCatalogEntry> & { id?: unknown; name?: unknown },
): ProductCatalogEntry | null {
  const id = String(raw.id ?? '').trim()
  const name = String(raw.name ?? '').trim()
  if (!id || !name) return null
  const unitRaw = String(raw.unit ?? '斤').trim()
  const units = normalizeProductUnits(
    (raw as ProductCatalogEntry).units,
    unitRaw || '斤',
  )
  const unit = defaultUnitDef({ id, name, unit: unitRaw, units, source: 'manual' }).name
  const inferredAuto =
    raw.source === 'auto' || (typeof id === 'string' && id.startsWith('auto_'))
  const source: 'manual' | 'auto' = inferredAuto ? 'auto' : 'manual'
  const aliases = sanitizeAliasesForProduct(
    name,
    normalizeAliasList((raw as ProductCatalogEntry).aliases, name),
  )
  return {
    id,
    name,
    unit,
    units,
    source,
    ...(aliases.length > 0 ? { aliases } : {}),
  }
}

export function catalogEntryWithUnits(
  entry: ProductCatalogEntry,
  units: ProductUnitDef[],
): ProductCatalogEntry {
  const normalized = normalizeProductUnits(units, entry.unit)
  const unit = defaultUnitDef({ ...entry, units: normalized }).name
  return { ...entry, unit, units: normalized }
}

export function parseProductCatalogEntries(raw: unknown): ProductCatalogEntry[] {
  if (!Array.isArray(raw)) return []
  const out: ProductCatalogEntry[] = []
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const n = normalizeCatalogEntry(x as ProductCatalogEntry)
    if (n) out.push(n)
  }
  return sanitizeAllCatalogAliases(out)
}

export function parseProductCatalogSuppressed(raw: unknown): string[] {
  return parseNormalizedStringList(raw)
}

/** 用户手动排除的 ASR 热词（存归一化 token，展示时仍用原文） */
export function parseAsrHotwordsSuppressed(raw: unknown): string[] {
  return parseNormalizedStringList(raw)
}

function parseNormalizedStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of raw) {
    if (typeof x !== 'string') continue
    const k = normalizeToken(x)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

/** 归一化名 → 目录条目（同名归一命中第一条） */
export function catalogByNormalizedName(
  catalog: ProductCatalogEntry[],
): Map<string, ProductCatalogEntry> {
  const m = new Map<string, ProductCatalogEntry>()
  for (const e of catalog) {
    const k = normalizeToken(e.name)
    if (!k) continue
    if (!m.has(k)) m.set(k, e)
  }
  return m
}

export function lookupCatalogEntryForProduct(
  productName: string,
  catalog: ProductCatalogEntry[],
): ProductCatalogEntry | undefined {
  const k = normalizeToken(productName)
  if (!k) return undefined
  return catalogByNormalizedName(catalog).get(k)
}

export function defaultUnitForProduct(
  productName: string,
  catalog: ProductCatalogEntry[],
): string {
  const entry = lookupCatalogEntryForProduct(productName, catalog)
  return defaultUnitDef(entry).name
}

export { getCatalogUnits, unitsForProduct } from './productUnits'
