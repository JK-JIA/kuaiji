import { pinyin } from 'pinyin-pro'
import type { FieldDef, LedgerRecord, ProductCatalogEntry } from '../types'
import type { LedgerFormLayout, LedgerLineForm } from './ledgerRecordDraft'
import {
  resolveProductViaAlias,
  shouldAutoLearnAlias,
} from './productAliasHelpers'
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
/** 拼音纠错词库：全量去重后保留的上限（偏新优先，与计划软上限一致） */
const LEXICON_SOFT_CAP = 5000
/** 拼音层：冠亚军分差过小视为歧义，不自动替换 */
const PY_AMBIGUOUS_GAP = 0.04
/** 拼音层：达到此相似度才允许替换为账本用语 */
const PY_MIN_REPLACE_SCORE = 0.94
/** 商品目录内字形相近（如 榴莲酥→榴莲薯）允许的最低相似度 */
const CATALOG_CHAR_REPLACE = 0.65
/** 与记一笔「最近常用」一致：按出现频次取前 N 个购买方 */
const FREQUENT_BUYER_TOP_N = 3

export function normalizeToken(s: string): string {
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

/** 判断 token 是否可当作 canonical 的别名（读音相近或仅一字之差） */
export function scoreAliasLearnPotential(
  aliasCandidate: string,
  canonicalName: string,
): number {
  const a = normalizeToken(aliasCandidate)
  const c = normalizeToken(canonicalName)
  if (!a || !c || a === c) return 0
  const cache = new Map<string, PinyinSig | null>()
  const { best, score, ambiguous } = bestPinyinLexiconMatch(
    aliasCandidate,
    [canonicalName],
    cache,
  )
  if (!ambiguous && best === canonicalName && score >= PY_MIN_REPLACE_SCORE) {
    return score
  }
  const ch = fuzzyScore(aliasCandidate, canonicalName)
  if (ch >= 0.45 && ch < 0.985 && aliasCandidate.length === canonicalName.length) {
    return 0.95
  }
  return 0
}

export function fuzzyScore(a: string, b: string): number {
  const A = normalizeToken(a)
  const B = normalizeToken(b)
  if (!A || !B) return 0
  if (A === B) return 1
  if (A.includes(B) || B.includes(A)) return 0.9
  const dist = levenshtein(A, B)
  const maxLen = Math.max(A.length, B.length)
  return 1 - dist / maxLen
}

/** 仅一字之差且等长（如 榴莲酥↔榴莲薯），常见于语音识别误字 */
export function isSingleHanCharVariant(a: string, b: string): boolean {
  const A = normalizeToken(a)
  const B = normalizeToken(b)
  if (A.length !== B.length || A.length < 2) return false
  if (A === B) return false
  let diffs = 0
  for (let i = 0; i < A.length; i++) {
    if (A[i] !== B[i]) diffs++
  }
  return diffs === 1
}

function findUniqueCatalogNearMatch(
  raw: string,
  catalog: ProductCatalogEntry[],
): ProductCatalogEntry | null {
  const r = normalizeToken(raw)
  if (!r) return null
  let matched: ProductCatalogEntry | null = null
  for (const e of catalog) {
    const terms = [e.name, ...(e.aliases ?? [])]
    for (const term of terms) {
      const tk = normalizeToken(term)
      if (!tk || tk === r) continue
      if (!isSingleHanCharVariant(raw, term)) continue
      if (matched && normalizeToken(matched.name) !== normalizeToken(e.name)) {
        return null
      }
      matched = e
    }
  }
  return matched
}

function minReplaceScoreForCandidate(
  candidate: string | null,
  catalogNorms: Set<string>,
): number {
  return candidate && catalogNorms.has(normalizeToken(candidate))
    ? CATALOG_CHAR_REPLACE
    : HIGH_REPLACE
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

const CATALOG_MATCH_BOOST = 0.006

function catalogNormSet(catalog: ProductCatalogEntry[]): Set<string> {
  const s = new Set<string>()
  for (const e of catalog) {
    const k = normalizeToken(e.name)
    if (k) s.add(k)
  }
  return s
}

function mergeProductNamesCatalogFirst(
  catalog: ProductCatalogEntry[],
  fromRecords: string[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of catalog) {
    const k = normalizeToken(e.name)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(e.name)
  }
  for (const p of fromRecords) {
    const k = normalizeToken(p)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(p)
  }
  return out
}

function bestMatchWithCatalog(
  input: string,
  candidates: string[],
  catalogNorms: Set<string>,
): { best: string | null; score: number; ambiguous: boolean } {
  const t = normalizeToken(input)
  if (!t || !candidates.length)
    return { best: null, score: 0, ambiguous: false }
  const scored = candidates.map((c) => ({
    c,
    score:
      fuzzyScore(t, c) +
      (catalogNorms.has(normalizeToken(c)) ? CATALOG_MATCH_BOOST : 0),
  }))
  scored.sort(
    (a, b) => b.score - a.score || a.c.localeCompare(b.c, 'zh-CN'),
  )
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

/** 账本中出现最多的购买方名称（与 AddRecordModal 最近常用同源逻辑） */
function topFrequentBuyerNames(
  records: LedgerRecord[],
  fields: FieldDef[],
  limit: number,
): Set<string> {
  if (limit <= 0) return new Set()
  const freq = new Map<string, number>()
  for (const r of records) {
    const t = getPlateValue(r, fields).trim()
    if (!t) continue
    freq.set(t, (freq.get(t) ?? 0) + 1)
  }
  const names = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, limit)
    .map(([n]) => n)
  return new Set(names)
}

/** 解析前原文或纠正后的购买方是否落在「最近常用」内（仅此时强制进表单核对购买方） */
function plateTouchesFrequentBuyer(
  frequent: Set<string>,
  raw: string,
  plateAfter: string,
): boolean {
  const r = raw.trim()
  const p = plateAfter.trim()
  return (r !== '' && frequent.has(r)) || (p !== '' && frequent.has(p))
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

/** 全量购买方词库（去重，偏新优先，软上限 {@link LEXICON_SOFT_CAP}） */
export function collectFullLexiconBuyers(
  records: LedgerRecord[],
  fields: FieldDef[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt)
  for (const r of sorted) {
    if (out.length >= LEXICON_SOFT_CAP) break
    const v = getPlateValue(r, fields).trim()
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

/** 全量商品名词库（去重，偏新优先，软上限 {@link LEXICON_SOFT_CAP}） */
export function collectFullLexiconProducts(
  records: LedgerRecord[],
  prodId: string | undefined,
): string[] {
  if (!prodId) return []
  const seen = new Set<string>()
  const out: string[] = []
  const sorted = [...records].sort((a, b) => b.createdAt - a.createdAt)
  for (const r of sorted) {
    if (out.length >= LEXICON_SOFT_CAP) break
    if (r.lineItems?.length) {
      for (const li of r.lineItems) {
        if (out.length >= LEXICON_SOFT_CAP) break
        const p = String(li.values[prodId] ?? '').trim()
        if (!p || seen.has(p)) continue
        seen.add(p)
        out.push(p)
      }
    } else {
      const p = String(r.values[prodId] ?? '').trim()
      if (p && !seen.has(p)) {
        seen.add(p)
        out.push(p)
      }
    }
  }
  return out
}

type PinyinSig = { full: string; init: string }

function stripAsciiKey(s: string): string {
  return s.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

/** 含至少一个 CJK 才参与拼音纠错（纯数字/字母留给汉字 fuzzy） */
function pinyinSig(text: string): PinyinSig | null {
  const t = normalizeToken(text)
  if (!t || !/[\u4e00-\u9fff]/.test(t)) return null
  const fullRaw = pinyin(t, {
    toneType: 'none',
    type: 'string',
    separator: '',
    nonZh: 'removed',
    v: true,
  })
  const full = stripAsciiKey(fullRaw)
  if (!full) return null
  const initRaw = pinyin(t, {
    pattern: 'first',
    toneType: 'none',
    type: 'string',
    separator: '',
    nonZh: 'removed',
    v: true,
  })
  const init = stripAsciiKey(initRaw)
  if (!init) return null
  return { full, init }
}

function getPinyinSigCached(
  term: string,
  cache: Map<string, PinyinSig | null>,
): PinyinSig | null {
  const key = normalizeToken(term)
  if (!key) return null
  if (cache.has(key)) return cache.get(key)!
  const sig = pinyinSig(term)
  cache.set(key, sig)
  return sig
}

function bestPinyinLexiconMatch(
  rawInput: string,
  lexicon: string[],
  sigCache: Map<string, PinyinSig | null>,
): { best: string | null; score: number; ambiguous: boolean } {
  const raw = normalizeToken(rawInput)
  if (!raw || !lexicon.length) return { best: null, score: 0, ambiguous: false }

  const normLex = new Set(lexicon.map((x) => normalizeToken(x)))
  if (normLex.has(raw)) return { best: null, score: 0, ambiguous: false }

  const inputSig = pinyinSig(raw)
  if (!inputSig) return { best: null, score: 0, ambiguous: false }

  const scored: { term: string; score: number }[] = []
  for (const term of lexicon) {
    if (normalizeToken(term) === raw) continue
    const sig = getPinyinSigCached(term, sigCache)
    if (!sig) continue
    let score = 0
    if (sig.full === inputSig.full) score = 1
    else if (sig.init === inputSig.init) {
      const maxL = Math.max(sig.full.length, inputSig.full.length, 1)
      score = 1 - levenshtein(sig.full, inputSig.full) / maxL
      if (score < 0.82) continue
    } else {
      const maxL = Math.max(sig.full.length, inputSig.full.length, 1)
      const sc = 1 - levenshtein(sig.full, inputSig.full) / maxL
      if (sc < 0.88) continue
      score = sc
    }
    scored.push({ term, score })
  }

  scored.sort(
    (a, b) => b.score - a.score || a.term.localeCompare(b.term, 'zh-CN'),
  )
  const top = scored[0]
  const second = scored[1]
  if (!top) return { best: null, score: 0, ambiguous: false }

  const tiedTop = scored.filter((x) => x.score >= top.score - 1e-9)
  const ambiguous =
    tiedTop.length > 1 ||
    (Boolean(second) &&
      top.score < 0.999 &&
      top.score - second.score < PY_AMBIGUOUS_GAP)

  return {
    best: ambiguous ? null : top.term,
    score: top.score,
    ambiguous,
  }
}

export type VoiceFuzzyProductStep = {
  lineIndex: number
  stage:
    | 'alias'
    | 'catalogExact'
    | 'charFuzzy'
    | 'pinyin'
  raw: string
  result: string
  score?: number
}

export type VoiceAliasAttachCandidate = {
  canonical: string
  alias: string
  pinyinScore?: number
}

export type VoiceHistoryFuzzyResult = {
  values: Record<string, string>
  lines: LedgerLineForm[]
  needConfirm: boolean
  confirmHint?: string
  productSteps?: VoiceFuzzyProductStep[]
  /** fuzzy 后建议静默写入商品 aliases */
  aliasAttachCandidates?: VoiceAliasAttachCandidate[]
}

/**
 * 将解析结果中的购买方、商品名与历史账单做模糊对齐（汉字相似度 + 全量词库拼音相似度）；
 * 低置信度时标记 needConfirm（应打开表单核对）。
 * 购买方：仅当解析原文或纠正结果落在「最近常用 top3 购买方」内时，才因购买方歧义/低置信/自动替换而 needConfirm；非常用购买方直接保存。
 */
export function applyVoiceHistoryFuzzyMatch(input: {
  layout: LedgerFormLayout
  values: Record<string, string>
  lines: LedgerLineForm[]
  records: LedgerRecord[]
  fields: FieldDef[]
  productCatalog?: ProductCatalogEntry[]
}): VoiceHistoryFuzzyResult {
  const { layout, values, lines, records, fields, productCatalog = [] } = input
  const plateId = fields.find((f) => f.key === 'plate')?.id
  const prodId = layout.prodId

  const buyers = collectDistinctBuyers(records, fields)
  const productsDistinct = collectDistinctProducts(records, prodId)
  const productsMerged = mergeProductNamesCatalogFirst(
    productCatalog,
    productsDistinct,
  )
  const buyersLexicon = collectFullLexiconBuyers(records, fields)
  const productsLexicon = collectFullLexiconProducts(records, prodId)
  const productsLexiconMerged = mergeProductNamesCatalogFirst(
    productCatalog,
    productsLexicon,
  )
  const preferredCatalogNorms = catalogNormSet(productCatalog)
  const catalogByNorm = new Map<string, ProductCatalogEntry>()
  for (const e of productCatalog) {
    const k = normalizeToken(e.name)
    if (k && !catalogByNorm.has(k)) catalogByNorm.set(k, e)
    for (const a of e.aliases ?? []) {
      const ak = normalizeToken(a)
      if (ak && !catalogByNorm.has(ak)) catalogByNorm.set(ak, e)
    }
  }
  const productSteps: VoiceFuzzyProductStep[] = []
  const aliasAttachCandidates: VoiceAliasAttachCandidate[] = []
  const pinyinSigCache = new Map<string, PinyinSig | null>()
  const frequentBuyers = topFrequentBuyerNames(
    records,
    fields,
    FREQUENT_BUYER_TOP_N,
  )

  let needConfirm = false
  const hints: string[] = []
  /** 按行记录商品相关提示；拼音高置信纠正后会清除该行，避免误报「需核对」 */
  const productHintsByLine = new Map<number, string[]>()

  const addProductHint = (lineIndex: number, msg: string) => {
    const arr = productHintsByLine.get(lineIndex) ?? []
    arr.push(msg)
    productHintsByLine.set(lineIndex, arr)
  }

  const clearProductHintsForLine = (lineIndex: number) => {
    productHintsByLine.delete(lineIndex)
  }

  const nextValues = { ...values }
  const nextLines = lines.map((l) => ({ ...l }))
  const skipProductFuzzyPinyin = new Set<number>()

  if (plateId) {
    const raw = (nextValues[plateId] ?? '').trim()
    if (raw) {
      const { best, score, ambiguous } = bestMatch(raw, buyers)
      if (ambiguous) {
        if (plateTouchesFrequentBuyer(frequentBuyers, raw, raw)) {
          needConfirm = true
          hints.push('购买方识别结果存在多个相近账本名称，请核对')
        }
      }
      if (buyers.length >= MIN_DISTINCT_BUYERS) {
        if (score >= HIGH_REPLACE && best && best !== raw && !ambiguous) {
          nextValues[plateId] = best
          if (
            score < REPLACE_CONFIRM_BELOW &&
            plateTouchesFrequentBuyer(frequentBuyers, raw, best)
          ) {
            needConfirm = true
            hints.push('购买方已按账本用语修正，请确认')
          }
        } else if (
          score < LOW_CONFIDENCE &&
          plateTouchesFrequentBuyer(frequentBuyers, raw, raw)
        ) {
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
        if (
          score < REPLACE_CONFIRM_BELOW &&
          plateTouchesFrequentBuyer(frequentBuyers, raw, best)
        ) {
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
      const viaAlias = resolveProductViaAlias(raw, productCatalog)
      if (viaAlias && normalizeToken(viaAlias) !== normalizeToken(raw)) {
        nextLines[i]!.product = viaAlias
        if (i === 0) nextValues[prodId] = viaAlias
        skipProductFuzzyPinyin.add(i)
        productSteps.push({
          lineIndex: i,
          stage: 'alias',
          raw,
          result: viaAlias,
        })
        continue
      }
      const hit = catalogByNorm.get(normalizeToken(raw))
      if (hit) {
        nextLines[i]!.product = hit.name
        if (i === 0) nextValues[prodId] = hit.name
        skipProductFuzzyPinyin.add(i)
        if (normalizeToken(hit.name) !== normalizeToken(raw)) {
          productSteps.push({
            lineIndex: i,
            stage: 'catalogExact',
            raw,
            result: hit.name,
          })
        }
        continue
      }
      const near = findUniqueCatalogNearMatch(raw, productCatalog)
      if (near) {
        nextLines[i]!.product = near.name
        if (i === 0) nextValues[prodId] = near.name
        skipProductFuzzyPinyin.add(i)
        productSteps.push({
          lineIndex: i,
          stage: 'charFuzzy',
          raw,
          result: near.name,
          score: fuzzyScore(raw, near.name),
        })
        if (shouldAutoLearnAlias(raw, near.name)) {
          aliasAttachCandidates.push({ canonical: near.name, alias: raw })
        }
        continue
      }
    }

    for (let i = 0; i < nextLines.length; i++) {
      if (skipProductFuzzyPinyin.has(i)) continue
      const raw = nextLines[i]!.product.trim()
      if (!raw) continue
      const { best, score, ambiguous } = bestMatchWithCatalog(
        raw,
        productsMerged,
        preferredCatalogNorms,
      )
      if (ambiguous) {
        addProductHint(
          i,
          `第 ${i + 1} 行商品识别存在多个相近名称，请核对`,
        )
      }
      if (productsMerged.length >= MIN_DISTINCT_PRODUCTS) {
        const minReplace = minReplaceScoreForCandidate(best, preferredCatalogNorms)
        const canReplace =
          score >= minReplace ||
          (best &&
            preferredCatalogNorms.has(normalizeToken(best)) &&
            isSingleHanCharVariant(raw, best))
        if (canReplace && best && best !== raw && !ambiguous) {
          nextLines[i]!.product = best
          if (i === 0) nextValues[prodId] = best
          productSteps.push({
            lineIndex: i,
            stage: 'charFuzzy',
            raw,
            result: best,
            score,
          })
          if (shouldAutoLearnAlias(raw, best)) {
            aliasAttachCandidates.push({ canonical: best, alias: raw })
          }
          if (score < REPLACE_CONFIRM_BELOW) {
            addProductHint(
              i,
              `第 ${i + 1} 行商品已按账本用语修正，请确认`,
            )
          }
        } else if (score < LOW_CONFIDENCE) {
          addProductHint(
            i,
            `第 ${i + 1} 行商品与账本常用名差异较大，请核对`,
          )
        }
      } else if (best && best !== raw && !ambiguous) {
        const minReplace = minReplaceScoreForCandidate(best, preferredCatalogNorms)
        const canReplace =
          score >= minReplace ||
          (preferredCatalogNorms.has(normalizeToken(best)) &&
            isSingleHanCharVariant(raw, best))
        if (canReplace) {
          nextLines[i]!.product = best
          if (i === 0) nextValues[prodId] = best
          productSteps.push({
            lineIndex: i,
            stage: 'charFuzzy',
            raw,
            result: best,
            score,
          })
          if (shouldAutoLearnAlias(raw, best)) {
            aliasAttachCandidates.push({ canonical: best, alias: raw })
          }
          if (score < REPLACE_CONFIRM_BELOW) {
            addProductHint(
              i,
              `第 ${i + 1} 行商品已按账本用语修正，请确认`,
            )
          }
        }
      }
    }
  }

  /** 拼音层：全量词库 + 读音对齐（在汉字 fuzzy 之后执行） */
  if (plateId) {
    const raw = (nextValues[plateId] ?? '').trim()
    if (raw && buyersLexicon.length > 0) {
      const { best, score, ambiguous } = bestPinyinLexiconMatch(
        raw,
        buyersLexicon,
        pinyinSigCache,
      )
      if (ambiguous) {
        needConfirm = true
        hints.push('购买方在历史账单中存在多个读音相同的名称，请核对')
      } else if (
        best &&
        normalizeToken(best) !== normalizeToken(raw) &&
        score >= PY_MIN_REPLACE_SCORE
      ) {
        nextValues[plateId] = best
        hints.push('购买方已按历史账单读音相近用语修正')
        if (
          score < 0.999 &&
          plateTouchesFrequentBuyer(frequentBuyers, raw, best)
        ) {
          needConfirm = true
          hints.push('请确认购买方是否正确')
        }
      }
    }
  }

  if (prodId && productsLexiconMerged.length > 0) {
    for (let i = 0; i < nextLines.length; i++) {
      if (skipProductFuzzyPinyin.has(i)) continue
      const raw = nextLines[i]!.product.trim()
      if (!raw) continue
      const { best, score, ambiguous } = bestPinyinLexiconMatch(
        raw,
        productsLexiconMerged,
        pinyinSigCache,
      )
      if (ambiguous) {
        addProductHint(
          i,
          `第 ${i + 1} 行商品在历史账单中有多个读音相同的名称，请核对`,
        )
        continue
      }
      if (
        best &&
        normalizeToken(best) !== normalizeToken(raw) &&
        score >= PY_MIN_REPLACE_SCORE
      ) {
        nextLines[i]!.product = best
        if (i === 0) nextValues[prodId] = best
        productSteps.push({
          lineIndex: i,
          stage: 'pinyin',
          raw,
          result: best,
          score,
        })
        aliasAttachCandidates.push({
          canonical: best,
          alias: raw,
          pinyinScore: score,
        })
        if (score >= 0.999) {
          /** 读音完全一致（如 鼹鼠→烟薯），清除汉字层误报的「需核对」 */
          clearProductHintsForLine(i)
        } else {
          addProductHint(
            i,
            `第 ${i + 1} 行商品已按历史账单读音相近用语修正，请确认`,
          )
        }
      }
    }
  }

  for (const lineHints of productHintsByLine.values()) {
    hints.push(...lineHints)
  }
  if (productHintsByLine.size > 0) {
    needConfirm = true
  }

  const confirmHint =
    hints.length > 0 ? [...new Set(hints)].join('；') : undefined

  return {
    values: nextValues,
    lines: nextLines,
    needConfirm,
    confirmHint,
    productSteps,
    aliasAttachCandidates:
      aliasAttachCandidates.length > 0 ? aliasAttachCandidates : undefined,
  }
}
