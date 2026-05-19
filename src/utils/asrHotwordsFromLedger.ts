import type { FieldDef, LedgerRecord, ProductCatalogEntry } from '../types'
import { getPlateValue } from './recordHelpers'

const DEFAULT_MAX_TERMS = 40
const MAX_RECORDS_SCAN = 250

/**
 * 从近期账单收集购买方、商品名，供语音识别热词（经服务端合并与截断）。
 * 目录**规范商品名**优先；**勿把别名写入热词**（别名是误识别写法，只用于解析纠正）。
 */
export function collectAsrHotwordsFromLedger(
  records: LedgerRecord[],
  fields: FieldDef[],
  options?: { maxTerms?: number; productCatalog?: ProductCatalogEntry[] },
): string[] {
  const maxTerms = options?.maxTerms ?? DEFAULT_MAX_TERMS
  const prodId = fields.find((f) => f.key === 'product')?.id
  const catalog = options?.productCatalog ?? []

  const seen = new Set<string>()
  const out: string[] = []
  const push = (raw: string) => {
    const t = raw.normalize('NFKC').trim()
    if (!t || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }

  for (const e of catalog) {
    push(e.name)
    if (out.length >= maxTerms) return out.slice(0, maxTerms)
  }

  const sorted = [...records]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_RECORDS_SCAN)

  for (const r of sorted) {
    push(getPlateValue(r, fields))
    if (prodId) {
      if (r.lineItems?.length) {
        for (const li of r.lineItems) {
          push(String(li.values[prodId] ?? ''))
        }
      } else {
        push(String(r.values[prodId] ?? ''))
      }
    }
    if (out.length >= maxTerms) break
  }

  return out.slice(0, maxTerms)
}
