import { normalizeToken } from './voiceHistoryFuzzy'

/** 每用户纠错词库条目（本地 Dexie + 云端 JSON） */
export type VoiceProductCorrection = {
  /** 归一化后的错误写法，兼作主键 */
  wrongText: string
  correctProductName: string
  count: number
  lastUsedAt: number
}

export const MAX_CORRECTIONS_STORED = 48
const MAX_WRONG_LEN = 16

export function parseVoiceProductCorrections(
  raw: unknown,
): VoiceProductCorrection[] {
  if (!Array.isArray(raw)) return []
  const byWrong = new Map<string, VoiceProductCorrection>()
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue
    const o = x as Record<string, unknown>
    const wrongRaw =
      typeof o.wrongText === 'string'
        ? o.wrongText
        : typeof o.wrong === 'string'
          ? o.wrong
          : ''
    const correct =
      typeof o.correctProductName === 'string'
        ? o.correctProductName
        : typeof o.correct === 'string'
          ? o.correct
          : ''
    const wrongText = normalizeToken(wrongRaw)
    const correctProductName = correct.normalize('NFKC').trim()
    if (!wrongText || !correctProductName) continue
    if (wrongText === normalizeToken(correctProductName)) continue
    const count =
      typeof o.count === 'number' && o.count > 0 ? Math.floor(o.count) : 1
    const lastUsedAt =
      typeof o.lastUsedAt === 'number' && o.lastUsedAt > 0
        ? o.lastUsedAt
        : Date.now()
    const prev = byWrong.get(wrongText)
    if (!prev || count > prev.count || lastUsedAt > prev.lastUsedAt) {
      byWrong.set(wrongText, {
        wrongText,
        correctProductName,
        count,
        lastUsedAt,
      })
    }
  }
  return pruneVoiceProductCorrections([...byWrong.values()])
}

export function pruneVoiceProductCorrections(
  list: VoiceProductCorrection[],
): VoiceProductCorrection[] {
  return [...list]
    .sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_CORRECTIONS_STORED)
}

const correctionMapCache = new WeakMap<
  VoiceProductCorrection[],
  Map<string, string>
>()

function correctionMap(
  corrections: VoiceProductCorrection[],
): Map<string, string> {
  let m = correctionMapCache.get(corrections)
  if (!m) {
    m = new Map()
    for (const c of corrections) {
      m.set(c.wrongText, c.correctProductName)
    }
    correctionMapCache.set(corrections, m)
  }
  return m
}

/** 将单行商品名按用户纠错表替换（不发给 AI，零 token） */
export function applyCorrectionToProductName(
  product: string,
  corrections: VoiceProductCorrection[],
): { name: string; applied: boolean } {
  const raw = product.trim()
  if (!raw || !corrections.length) return { name: product, applied: false }
  const key = normalizeToken(raw)
  const hit = correctionMap(corrections).get(key)
  if (!hit) return { name: product, applied: false }
  return { name: hit, applied: true }
}

export function learnProductCorrection(
  wrongProduct: string,
  correctProductName: string,
  existing: VoiceProductCorrection[],
): VoiceProductCorrection[] {
  const wrongText = normalizeToken(wrongProduct)
  const correct = correctProductName.normalize('NFKC').trim()
  if (!wrongText || !correct || wrongText.length > MAX_WRONG_LEN) {
    return existing
  }
  if (wrongText === normalizeToken(correct)) return existing

  const now = Date.now()
  const idx = existing.findIndex((c) => c.wrongText === wrongText)
  const next = [...existing]
  if (idx >= 0) {
    const prev = next[idx]!
    next[idx] = {
      wrongText,
      correctProductName: correct,
      count: prev.count + 1,
      lastUsedAt: now,
    }
  } else {
    next.push({
      wrongText,
      correctProductName: correct,
      count: 1,
      lastUsedAt: now,
    })
  }
  return pruneVoiceProductCorrections(next)
}

/** 用户保存前：对比语音填入与最终商品名，写入纠错表 */
export function learnFromProductLineEdits(
  beforeProducts: string[],
  afterProducts: string[],
  existing: VoiceProductCorrection[],
): VoiceProductCorrection[] {
  let next = existing
  const len = Math.max(beforeProducts.length, afterProducts.length)
  for (let i = 0; i < len; i++) {
    const before = (beforeProducts[i] ?? '').trim()
    const after = (afterProducts[i] ?? '').trim()
    if (!before || !after) continue
    if (normalizeToken(before) === normalizeToken(after)) continue
    next = learnProductCorrection(before, after, next)
  }
  return next
}
