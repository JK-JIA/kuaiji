import type { ProductCatalogEntry, ProductUnitDef } from '../types'
import {
  normalizeAliasList,
  sanitizeAliasesForProduct,
  sanitizeAllCatalogAliases,
} from './productAliasHelpers'
import { defaultUnitDef, normalizeProductUnits } from './productUnits'
import { normalizeProductColorKey } from './productColors'
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
  const colorKey = normalizeProductColorKey(
    (raw as ProductCatalogEntry).colorKey,
  )
  return {
    id,
    name,
    unit,
    units,
    source,
    ...(aliases.length > 0 ? { aliases } : {}),
    ...(colorKey != null ? { colorKey } : {}),
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
  const byName = catalogByNormalizedName(catalog).get(k)
  if (byName) return byName
  for (const e of catalog) {
    for (const a of e.aliases ?? []) {
      if (normalizeToken(a) === k) return e
    }
  }
  return undefined
}

/** 首页 / 记一笔：商品目录为空时的提示 */
export const CATALOG_EMPTY_HINT =
  '请先在「设置 → 商品管理」中录入商品，再填写账单。'

export function hasProductCatalog(
  catalog: ProductCatalogEntry[] | undefined | null,
): boolean {
  return (catalog?.length ?? 0) > 0
}

/** 命中目录（含别名）时返回规范商品名，否则 null */
export function canonicalProductNameFromCatalog(
  productName: string,
  catalog: ProductCatalogEntry[],
): string | null {
  const entry = lookupCatalogEntryForProduct(productName, catalog)
  const name = entry?.name.trim()
  return name || null
}

/** 表单保存：校验各行商品均在目录中（编辑旧账单时可保留原商品名） */
export function validateLineProductsInCatalog(
  lines: Array<{ product: string }>,
  catalog: ProductCatalogEntry[],
  prodLabel = '商品',
  legacyProductNames?: ReadonlySet<string>,
): string | null {
  const legacy = legacyProductNames ?? new Set<string>()
  if (!hasProductCatalog(catalog)) {
    const needsCatalog = lines.some((l) => {
      const p = l.product.trim()
      return p && !legacy.has(p)
    })
    if (needsCatalog) return CATALOG_EMPTY_HINT
    return null
  }
  const issues: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const p = lines[i].product.trim()
    if (!p) continue
    if (legacy.has(p)) continue
    if (!lookupCatalogEntryForProduct(p, catalog)) {
      issues.push(
        `第 ${i + 1} 行：「${p}」不在商品目录中，请从${prodLabel}列表中选择`,
      )
    }
  }
  return issues.length > 0 ? issues.join('\n') : null
}

/** 语音 / 识图：目录为空或存在未收录商品名 */
export function validateVoiceLinesInCatalog(
  lines: Array<{ product: string }>,
  catalog: ProductCatalogEntry[],
): string | null {
  if (!hasProductCatalog(catalog)) {
    return '商品目录为空，请先在「设置 → 商品管理」中添加商品后再识别记账。'
  }
  const bad = [
    ...new Set(
      lines
        .map((l) => l.product.trim())
        .filter((p) => p && !lookupCatalogEntryForProduct(p, catalog)),
    ),
  ]
  if (bad.length === 0) return null
  return `以下商品不在目录中：${bad.join('、')}。请先在商品管理中添加，或重新说明商品名称。`
}

export function defaultUnitForProduct(
  productName: string,
  catalog: ProductCatalogEntry[],
): string {
  const entry = lookupCatalogEntryForProduct(productName, catalog)
  return defaultUnitDef(entry).name
}

export { getCatalogUnits, unitsForProduct } from './productUnits'
