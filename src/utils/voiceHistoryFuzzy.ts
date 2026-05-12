import type { FieldDef, LedgerRecord } from '../types'
import type { LedgerFormLayout, LedgerLineForm } from './ledgerRecordDraft'
import { getPlateValue } from './recordHelpers'

/** 低于此相似度且已有足够历史样本时，要求用户进表单确认 */
const LOW_CONFIDENCE = 0.56
/** 高于此相似度则允许替换为账本里的规范写法 */
const HIGH_REPLACE = 0.74
/** 非精确命中但做了替换时，低于此分须强制进表单确认 */
const REPLACE_CONFIRM_BELOW = 0.88
/** 冠亚军分差过小视为歧义，须确认 */
const AMBIGUOUS_GAP = 0.038
const MIN_DISTINCT_BUYERS = 3
const MIN_DISTINCT_PRODUCTS = 4
const MAX_CANDIDATES = 400

function normalizeToken(s: string): string {
  return s.normalize('NFKC').trim().replace(/\s+/g, '')
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  const dp = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) dp[j] = j
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost)
      prev = tmp
    }
  }
  return dp[n]!
}

function fuzzyScore(a: string, b: string): number {
  const A = normalizeToken(a)
  const B = normalizeToken(b)
  if (!A || !B) return 0
  if (A === B) return 1
  if (A.includes(B) || B.includes(A)) return 0.9
  const dist = levenshtein(A, B)
  const maxLen = Math.max(A.length, B.length)
  return 1 - dist / maxLen
}

function bestMatch(
  input: string,
  candidates: string[],
): { best: string | null; score: number; ambiguous: boolean } {
  const t = normalizeToken(input)
  if (!t) return { best: null, score: 0, ambiguous: false }
  const scored = candidates.map((c) => ({
    c,
    score: fuzzyScore(t, c),
  }))
  scored.sort((a, b) => b.score - a.score || a.c.localeCompare(b.c, 'zh-CN'))
  const top = scored[0]
  const second = scored[1]
  if (!top) return { best: null, score: 0, ambiguous: false }
  const ambiguous =
    Boolean(second) &&
    top.score < 0.985 &&
    top.score - second.score < AMBIGUOUS_GAP
  return { best: top.c, score: top.score, ambiguous }
}

export function collectDistinctBuyers(
  records: LedgerRecord[],
  fields: FieldDef[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt)
  for (const r of sorted) {
    const v = getPlateValue(r, fields)
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= MAX_CANDIDATES) break
  }
  return out
}

export function collectDistinctProducts(
  records: LedgerRecord[],
  prodId: string | undefined,
): string[] {
  if (!prodId) return []
  const seen = new Set<string>()
  const out: string[] = []
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt)
  for (const r of sorted) {
    if (r.lineItems?.length) {
      for (const li of r.lineItems) {
        const p = String(li.values[prodId] ?? '').trim()
        if (!p || seen.has(p)) continue
        seen.add(p)
        out.push(p)
        if (out.length >= MAX_CANDIDATES) break
      }
    } else {
      const p = String(r.values[prodId] ?? '').trim()
      if (p && !seen.has(p)) {
        seen.add(p)
        out.push(p)
      }
    }
    if (out.length >= MAX_CANDIDATES) break
  }
  return out
}

export type VoiceHistoryFuzzyResult = {
  values: Record<string, string>
  lines: LedgerLineForm[]
  needConfirm: boolean
  confirmHint?: string
}

/**
 * 将解析结果中的购买方、商品名与历史账单做模糊对齐；低置信度时标记 needConfirm（应打开表单核对）。
 */
export function applyVoiceHistoryFuzzyMatch(input: {
  layout: LedgerFormLayout
  values: Record<string, string>
  lines: LedgerLineForm[]
  records: LedgerRecord[]
  fields: FieldDef[]
}): VoiceHistoryFuzzyResult {
  const { layout, values, lines, records, fields } = input
  const plateId = fields.find((f) => f.key === 'plate')?.id
  const prodId = layout.prodId

  const buyers = collectDistinctBuyers(records, fields)
  const products = collectDistinctProducts(records, prodId)

  let needConfirm = false
  const hints: string[] = []

  const nextValues = { ...values }
  const nextLines = lines.map((l) => ({ ...l }))

  if (plateId) {
    const raw = (nextValues[plateId] ?? '').trim()
    if (raw) {
      const { best, score, ambiguous } = bestMatch(raw, buyers)
      if (ambiguous) {
        needConfirm = true
        hints.push('购买方识别结果存在多个相近账本名称，请核对')
      }
      if (buyers.length >= MIN_DISTINCT_BUYERS) {
        if (score >= HIGH_REPLACE && best && best !== raw && !ambiguous) {
          nextValues[plateId] = best
          if (score < REPLACE_CONFIRM_BELOW) {
            needConfirm = true
            hints.push('购买方已按账本用语修正，请确认')
          }
        } else if (score < LOW_CONFIDENCE) {
          needConfirm = true
          hints.push('购买方与账本常用名差异较大，请核对')
        }
      } else if (
        best &&
        best !== raw &&
        score >= HIGH_REPLACE &&
        !ambiguous
      ) {
        nextValues[plateId] = best
        if (score < REPLACE_CONFIRM_BELOW) {
          needConfirm = true
          hints.push('购买方已按账本用语修正，请确认')
        }
      }
    } else {
      const plateField = fields.find((f) => f.key === 'plate')
      if (plateField?.required && buyers.length > 0) {
        needConfirm = true
        hints.push('未填写购买方，请在表单中补全或核对')
      }
    }
  }

  if (prodId) {
    for (let i = 0; i < nextLines.length; i++) {
      const raw = nextLines[i]!.product.trim()
      if (!raw) continue
      const { best, score, ambiguous } = bestMatch(raw, products)
      if (ambiguous) {
        needConfirm = true
        hints.push(`第 ${i + 1} 行商品识别存在多个相近名称，请核对`)
      }
      if (products.length >= MIN_DISTINCT_PRODUCTS) {
        if (score >= HIGH_REPLACE && best && best !== raw && !ambiguous) {
          nextLines[i]!.product = best
          if (i === 0) nextValues[prodId] = best
          if (score < REPLACE_CONFIRM_BELOW) {
            needConfirm = true
            hints.push(`第 ${i + 1} 行商品已按账本用语修正，请确认`)
          }
        } else if (score < LOW_CONFIDENCE) {
          needConfirm = true
          hints.push(`第 ${i + 1} 行商品与账本常用名差异较大，请核对`)
        }
      } else if (
        best &&
        best !== raw &&
        score >= HIGH_REPLACE &&
        !ambiguous
      ) {
        nextLines[i]!.product = best
        if (i === 0) nextValues[prodId] = best
        if (score < REPLACE_CONFIRM_BELOW) {
          needConfirm = true
          hints.push(`第 ${i + 1} 行商品已按账本用语修正，请确认`)
        }
      }
    }
  }

  const confirmHint =
    hints.length > 0 ? [...new Set(hints)].join('；') : undefined

  return {
    values: nextValues,
    lines: nextLines,
    needConfirm,
    confirmHint,
  }
}
