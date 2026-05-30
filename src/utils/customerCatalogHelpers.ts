import type { CustomerEntry } from '../types'
import { normalizeToken } from './voiceHistoryFuzzy'

export function normalizeCustomerEntry(raw: unknown): CustomerEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id.trim() : ''
  const buyerKey = typeof o.buyerKey === 'string' ? o.buyerKey.trim() : ''
  if (!id || !buyerKey) return null
  const name = typeof o.name === 'string' ? o.name.trim() : undefined
  const address = typeof o.address === 'string' ? o.address.trim() : undefined
  const contact = typeof o.contact === 'string' ? o.contact.trim() : undefined
  const source = o.source === 'auto' ? 'auto' : 'manual'
  return {
    id,
    buyerKey,
    name: name || undefined,
    address: address || undefined,
    contact: contact || undefined,
    source,
  }
}

export function parseCustomerEntries(raw: unknown): CustomerEntry[] {
  if (!Array.isArray(raw)) return []
  const out: CustomerEntry[] = []
  for (const item of raw) {
    const n = normalizeCustomerEntry(item)
    if (n) out.push(n)
  }
  return out
}

export function parseCustomerCatalogSuppressed(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
}

export function customerBuyerToken(entry: CustomerEntry): string {
  return normalizeToken(entry.buyerKey)
}

export function customersEqual(a: CustomerEntry[], b: CustomerEntry[]): boolean {
  if (a.length !== b.length) return false
  const ser = (x: CustomerEntry[]) =>
    JSON.stringify([...x].sort((p, q) => p.id.localeCompare(q.id)))
  return ser(a) === ser(b)
}
