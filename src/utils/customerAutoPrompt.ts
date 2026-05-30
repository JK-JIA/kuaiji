const QUEUE_KEY = 'kuaiji_customer_auto_prompt_queue'

export type CustomerAutoPromptItem = {
  id: string
  buyerKey: string
}

function readRaw(): CustomerAutoPromptItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: CustomerAutoPromptItem[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const id = typeof o.id === 'string' ? o.id : ''
      const buyerKey = typeof o.buyerKey === 'string' ? o.buyerKey : ''
      if (id && buyerKey) out.push({ id, buyerKey })
    }
    return out
  } catch {
    return []
  }
}

function writeRaw(items: CustomerAutoPromptItem[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(QUEUE_KEY)
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
  } catch {
    /* ignore */
  }
}

export function readCustomerAutoPromptQueue(): CustomerAutoPromptItem[] {
  return readRaw()
}

export function queueCustomerAutoPrompts(
  entries: Array<{ id: string; buyerKey: string }>,
): void {
  if (entries.length === 0) return
  const existing = readRaw()
  const seen = new Set(existing.map((e) => e.id))
  const merged = [...existing]
  for (const e of entries) {
    if (!e.id || !e.buyerKey.trim() || seen.has(e.id)) continue
    merged.push({ id: e.id, buyerKey: e.buyerKey.trim() })
    seen.add(e.id)
  }
  writeRaw(merged)
}

export function clearCustomerAutoPromptQueue(): void {
  writeRaw([])
}

export function dequeueCustomerAutoPrompt(id: string): void {
  writeRaw(readRaw().filter((e) => e.id !== id))
}

export function peekCustomerAutoPrompt(): CustomerAutoPromptItem | null {
  const q = readRaw()
  return q[0] ?? null
}
