import type { CustomerEntry, FieldDef, LedgerRecord } from '../types'
import {
  customerBuyerToken,
  customersEqual,
  normalizeCustomerEntry,
} from './customerCatalogHelpers'
import { getPlateValue } from './recordHelpers'
import { normalizeToken } from './voiceHistoryFuzzy'

/** 出现次数 ≥ 此值且未在目录、未屏蔽时自动加入客户列表 */
export const CUSTOMER_AUTO_MIN_OCCURRENCES = 5

type Agg = { count: number; display: string }

function bumpBuyerMap(map: Map<string, Agg>, rawName: string): void {
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

/**
 * 根据账单频次合并自动客户；保留全部手动条目；丢弃旧 auto 后按当前频次重建 auto。
 */
export function mergeAutoCustomerCatalog(input: {
  records: LedgerRecord[]
  fields: FieldDef[]
  existing: CustomerEntry[]
  suppressedNormalizedKeys: string[]
}): CustomerEntry[] {
  const { records, fields, existing, suppressedNormalizedKeys } = input
  const plateField = fields.find((f) => f.key === 'plate')
  if (!plateField) return [...existing]

  const normalizedExisting: CustomerEntry[] = []
  for (const e of existing) {
    const n = normalizeCustomerEntry(e)
    if (n) normalizedExisting.push(n)
  }

  const suppressed = new Set(suppressedNormalizedKeys)
  const manual = normalizedExisting.filter((e) => e.source === 'manual')
  const manualKeys = new Set(
    manual.map((e) => customerBuyerToken(e)).filter(Boolean),
  )

  const freq = new Map<string, Agg>()
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt)
  for (const r of sorted) {
    bumpBuyerMap(freq, getPlateValue(r, fields))
  }

  const prevAutoByKey = new Map<string, CustomerEntry>()
  for (const e of normalizedExisting) {
    if (e.source !== 'auto') continue
    const k = customerBuyerToken(e)
    if (k) prevAutoByKey.set(k, e)
  }

  const autoOut: CustomerEntry[] = []
  for (const [k, { count, display }] of freq) {
    if (count < CUSTOMER_AUTO_MIN_OCCURRENCES) continue
    if (suppressed.has(k)) continue
    if (manualKeys.has(k)) continue
    const prev = prevAutoByKey.get(k)
    if (prev) {
      autoOut.push({ ...prev, buyerKey: display })
      continue
    }
    autoOut.push({
      id: `auto_customer_${k}`,
      buyerKey: display,
      source: 'auto',
    })
  }

  autoOut.sort((a, b) =>
    customerBuyerToken(a).localeCompare(customerBuyerToken(b), 'zh-CN'),
  )

  return [...manual, ...autoOut]
}

/** 合并后新出现的自动客户（用于弹窗提醒） */
export function newlyAutoAddedCustomers(
  before: CustomerEntry[],
  after: CustomerEntry[],
): CustomerEntry[] {
  const beforeKeys = new Set(
    before.map((e) => customerBuyerToken(e)).filter(Boolean),
  )
  return after.filter((e) => {
    if (e.source !== 'auto') return false
    const k = customerBuyerToken(e)
    return k.length > 0 && !beforeKeys.has(k)
  })
}

/** 按账单频次合并客户目录，并返回是否有变更、新增的自动客户 */
export function tryMergeCustomerCatalogFromRecords(input: {
  records: LedgerRecord[]
  fields: FieldDef[]
  existing: CustomerEntry[]
  suppressedNormalizedKeys: string[]
}): {
  merged: CustomerEntry[]
  changed: boolean
  newAuto: CustomerEntry[]
} {
  const merged = mergeAutoCustomerCatalog(input)
  const changed = !customersEqual(merged, input.existing)
  const newAuto = changed
    ? newlyAutoAddedCustomers(input.existing, merged)
    : []
  return { merged, changed, newAuto }
}

/** 仅当本次保存的购买方刚被自动加入时，才需要弹窗提醒 */
export function filterNewAutoForSavedBuyer(
  newAuto: CustomerEntry[],
  savedRecord: LedgerRecord,
  fields: FieldDef[],
): CustomerEntry[] {
  const token = normalizeToken(getPlateValue(savedRecord, fields))
  if (!token) return []
  return newAuto.filter((e) => customerBuyerToken(e) === token)
}
