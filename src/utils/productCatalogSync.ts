import type { LedgerRecord, ProductCatalogEntry } from '../types'
import { normalizeCatalogEntry } from './productCatalogHelpers'
import { normalizeToken } from './voiceHistoryFuzzy'

/** 出现次数 ≥ 此值且未在目录、未屏蔽时自动加入目录（默认单位 斤） */
const AUTO_MIN_OCCURRENCES = 3

type Agg = { count: number; display: string }

function bumpProductMap(
  map: Map<string, Agg>,
  rawName: string,
): void {
  const display = rawName.trim()
  const k = normalizeToken(display)
  if (!k) return
  const cur = map.get(k)
  if (cur) {
    cur.count += 1
    return
  }
  map.set(k, { count: 1, display })
}

function collectFromRecord(
  map: Map<string, Agg>,
  r: LedgerRecord,
  prodId: string,
): void {
  if (r.lineItems?.length) {
    for (const li of r.lineItems) {
      bumpProductMap(map, String(li.values[prodId] ?? ''))
    }
  } else {
    bumpProductMap(map, String(r.values[prodId] ?? ''))
  }
}

/**
 * 根据账单频次合并自动商品；保留全部手动条目；丢弃旧 auto 后按当前频次重建 auto。
 */
export function mergeAutoProductCatalog(input: {
  records: LedgerRecord[]
  prodId: string | undefined
  existing: ProductCatalogEntry[]
  suppressedNormalizedNames: string[]
}): ProductCatalogEntry[] {
  const { records, prodId, existing, suppressedNormalizedNames } = input
  if (!prodId) return [...existing]

  const normalizedExisting: ProductCatalogEntry[] = []
  for (const e of existing) {
    const n = normalizeCatalogEntry(e)
    if (n) normalizedExisting.push(n)
  }

  const suppressed = new Set(suppressedNormalizedNames)
  const manual = normalizedExisting.filter((e) => e.source === 'manual')
  const manualKeys = new Set(manual.map((e) => normalizeToken(e.name)).filter(Boolean))

  const freq = new Map<string, Agg>()
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt)
  for (const r of sorted) {
    collectFromRecord(freq, r, prodId)
  }

  const prevAutoByKey = new Map<string, ProductCatalogEntry>()
  for (const e of normalizedExisting) {
    if (e.source !== 'auto') continue
    const k = normalizeToken(e.name)
    if (k) prevAutoByKey.set(k, e)
  }

  const autoOut: ProductCatalogEntry[] = []
  for (const [k, { count, display }] of freq) {
    if (count < AUTO_MIN_OCCURRENCES) continue
    if (suppressed.has(k)) continue
    if (manualKeys.has(k)) continue
    const prev = prevAutoByKey.get(k)
    if (prev) {
      autoOut.push({
        ...prev,
        name: display,
      })
      continue
    }
    autoOut.push({
      id: `auto_${k}`,
      name: display,
      unit: '斤',
      source: 'auto',
    })
  }

  autoOut.sort((a, b) =>
    normalizeToken(a.name).localeCompare(normalizeToken(b.name), 'zh-CN'),
  )

  return [...manual, ...autoOut]
}

export function catalogsEqual(
  a: ProductCatalogEntry[],
  b: ProductCatalogEntry[],
): boolean {
  if (a.length !== b.length) return false
  const ser = (x: ProductCatalogEntry[]) =>
    JSON.stringify(
      [...x].sort((p, q) => p.id.localeCompare(q.id)),
    )
  return ser(a) === ser(b)
}
