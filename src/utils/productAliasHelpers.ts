import type { ProductCatalogEntry } from '../types'
import {
  fuzzyScore,
  normalizeToken,
  scoreAliasLearnPotential,
} from './voiceHistoryFuzzy'

export const MAX_ALIASES_PER_PRODUCT = 8
/** fuzzy 自动写入别名时的最低相似度（与规范名） */
export const ALIAS_AUTO_MIN_SCORE = 0.68

/** 勿把「烟薯（鼹鼠）」这类 prompt 展示格式当作别名 */
export function isPlausibleProductAlias(
  alias: string,
  canonicalName: string,
): boolean {
  const a = alias.normalize('NFKC').trim()
  const c = canonicalName.normalize('NFKC').trim()
  if (!a || !c) return false
  const an = normalizeToken(a)
  const cn = normalizeToken(c)
  if (!an || an === cn) return false
  if (a.length > 24) return false
  /** 含规范名且带括号，多为 AI 复述候选列表格式 */
  if (/[（(]/.test(a) && an.includes(cn)) return false
  if (a.startsWith(c) && a.length > c.length + 1) return false
  return true
}

/**
 * 别名不得占用：① 其它商品的规范名；② 其它商品已登记的别名。
 */
export function isAliasAllowedInCatalog(
  catalog: ProductCatalogEntry[],
  canonicalName: string,
  alias: string,
): boolean {
  if (!isPlausibleProductAlias(alias, canonicalName)) return false
  const aliasKey = normalizeToken(alias)
  const selfKey = normalizeToken(canonicalName)
  if (!aliasKey || !selfKey) return false

  for (const e of catalog) {
    const nameKey = normalizeToken(e.name)
    if (!nameKey) continue
    const isSelf = nameKey === selfKey
    if (!isSelf && nameKey === aliasKey) return false
    if (!isSelf) {
      for (const a of e.aliases ?? []) {
        if (normalizeToken(a) === aliasKey) return false
      }
    }
  }
  return true
}

/**
 * 清洗别名列表：去掉无效项；将「烟薯(鼹鼠)」拆成只保留「鼹鼠」
 */
export function sanitizeAliasesForProduct(
  canonicalName: string,
  rawAliases: string[],
  catalog?: ProductCatalogEntry[],
): string[] {
  const canonKey = normalizeToken(canonicalName)
  const seen = new Set<string>()
  const out: string[] = []

  const push = (t: string) => {
    const s = t.normalize('NFKC').trim()
    if (!s || !isPlausibleProductAlias(s, canonicalName)) return
    if (catalog?.length && !isAliasAllowedInCatalog(catalog, canonicalName, s)) {
      return
    }
    const k = normalizeToken(s)
    if (!k || seen.has(k)) return
    seen.add(k)
    out.push(s)
  }

  for (const raw of rawAliases) {
    const t = String(raw ?? '').normalize('NFKC').trim()
    if (!t) continue
    const wrapped = t.match(/^(.+?)\s*[（(]\s*(.+?)\s*[）)]\s*$/)
    if (wrapped) {
      const outerKey = normalizeToken(wrapped[1]!)
      const inner = wrapped[2]!.trim()
      if (outerKey === canonKey && inner) {
        push(inner)
        continue
      }
    }
    push(t)
    if (out.length >= MAX_ALIASES_PER_PRODUCT) break
  }
  return out
}

/** 按全目录规则清洗每个商品的别名（加载/同步后去重、去冲突） */
export function sanitizeAllCatalogAliases(
  catalog: ProductCatalogEntry[],
): ProductCatalogEntry[] {
  return catalog.map((e) => {
    const cleaned = sanitizeAliasesForProduct(
      e.name,
      e.aliases ?? [],
      catalog,
    )
    if (cleaned.length === 0) {
      const { aliases: _a, ...rest } = e
      return rest
    }
    return { ...e, aliases: cleaned }
  })
}

export function normalizeAliasList(
  raw: unknown,
  canonicalName?: string,
): string[] {
  if (!Array.isArray(raw)) return []
  const items = raw.filter((x): x is string => typeof x === 'string')
  if (canonicalName?.trim()) {
    return sanitizeAliasesForProduct(canonicalName, items, undefined)
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of items) {
    const s = t.normalize('NFKC').trim()
    if (!s || s.length > 24) continue
    const k = normalizeToken(s)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(s)
    if (out.length >= MAX_ALIASES_PER_PRODUCT) break
  }
  return out
}

/** 别名/规范名 → 规范商品名 */
export function buildAliasToCanonicalMap(
  catalog: ProductCatalogEntry[],
): Map<string, string> {
  const m = new Map<string, string>()
  for (const e of catalog) {
    const canon = e.name.trim()
    if (!canon) continue
    const canonKey = normalizeToken(canon)
    if (canonKey && !m.has(canonKey)) m.set(canonKey, canon)
    for (const a of e.aliases ?? []) {
      const k = normalizeToken(a)
      if (k && !m.has(k)) m.set(k, canon)
    }
  }
  return m
}

export function resolveProductViaAlias(
  product: string,
  catalog: ProductCatalogEntry[],
): string | null {
  const k = normalizeToken(product)
  if (!k) return null
  return buildAliasToCanonicalMap(catalog).get(k) ?? null
}

/** 去掉 AI 复述的「烟薯(鼹鼠、烟书)」等污染 */
export function normalizeAiProductField(raw: string): string {
  const t = raw.normalize('NFKC').trim()
  if (!t) return t
  const wrapped = t.match(/^(.+?)\s*[（(]\s*.+\s*[）)]\s*$/)
  if (wrapped) return wrapped[1]!.trim()
  const idx = t.search(/[（(]/)
  if (idx > 0) return t.slice(0, idx).trim()
  return t
}

/** 豆包 prompt：规范名列表 + 误识别参考（禁止 AI 把格式写进商品字段） */
export function buildAiProductCatalogPromptSection(
  catalog: ProductCatalogEntry[],
): string {
  const names: string[] = []
  const hintParts: string[] = []
  const seen = new Set<string>()
  for (const e of catalog) {
    const name = e.name.trim()
    if (!name) continue
    const k = normalizeToken(name)
    if (!k || seen.has(k)) continue
    seen.add(k)
    names.push(name)
    const als = sanitizeAliasesForProduct(name, e.aliases ?? [], catalog)
    if (als.length) {
      hintParts.push(`「${als.join('」「')}」→${name}`)
    }
    if (names.length >= 120) break
  }
  if (!names.length) return ''
  const aliasBlock = hintParts.length
    ? `\n【误识别参考】用户可能说：${hintParts.join('；')}。仅帮助理解，**商品字段禁止输出括号、别名或箭头左侧文字**。\n- 例：原话「红书」读音近「红薯」时应填「红薯」，勿因其他商品有别名「烟书」就填「烟薯」。\n`
    : ''
  return `\n【候选商品】「商品」字段只能填下列规范名之一（不得加括号、顿号、别名）：\n${names.join('、')}\n- 按用户原话读音/字形匹配最接近的规范名；无法匹配时才保留原话。\n${aliasBlock}`
}

/** 根据原话中的商品词优先于 AI 误匹配（如 红书→红薯） */
export function pickUtteranceProductOverride(
  utterance: string,
  catalog: ProductCatalogEntry[],
): { canonicalName: string; token: string; score: number } | null {
  const tokens = extractProductLikeTokensFromUtterance(utterance)
  let best: { canonicalName: string; token: string; score: number } | null =
    null
  for (const token of tokens) {
    if (/买$/.test(token) || token.length > 6) continue
    for (const e of catalog) {
      const name = e.name.trim()
      if (!name) continue
      const sc = scoreAliasLearnPotential(token, name)
      if (sc >= 0.94 && (!best || sc > best.score)) {
        best = { canonicalName: name, token, score: sc }
      }
    }
  }
  return best
}

/** 供 ASR 热词、豆包 prompt：规范名(别名1、别名2) */
export function buildProductCatalogPromptLines(
  catalog: ProductCatalogEntry[],
  maxItems = 120,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const e of catalog) {
    const name = e.name.trim()
    if (!name) continue
    const key = normalizeToken(name)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const aliases = sanitizeAliasesForProduct(name, e.aliases ?? [], catalog).filter(
      (a) => {
        const ak = normalizeToken(a)
        return ak && ak !== key
      },
    )
    const line =
      aliases.length > 0
        ? `${name}（${aliases.slice(0, MAX_ALIASES_PER_PRODUCT).join('、')}）`
        : name
    out.push(line)
    if (out.length >= maxItems) break
  }
  return out
}

/** 两字商品名无共同汉字时（如 白薯 vs 紫薯）不自动记别名，避免误学 */
function shareHanCharacters(a: string, b: string): boolean {
  for (const ch of a) {
    if (/\p{Script=Han}/u.test(ch) && b.includes(ch)) return true
  }
  return false
}

export function removeAliasFromCatalog(
  catalog: ProductCatalogEntry[],
  productId: string,
  aliasToRemove: string,
): ProductCatalogEntry[] {
  const key = normalizeToken(aliasToRemove)
  if (!key) return catalog
  const next = catalog.map((e) => {
    if (e.id !== productId) return e
    const nextAliases = (e.aliases ?? []).filter(
      (a) => normalizeToken(a) !== key,
    )
    const cleaned = sanitizeAliasesForProduct(e.name, nextAliases, catalog)
    if (cleaned.length === 0) {
      const { aliases: _a, ...rest } = e
      return rest
    }
    return { ...e, aliases: cleaned }
  })
  return sanitizeAllCatalogAliases(next)
}

export function shouldAutoLearnAlias(
  aliasCandidate: string,
  canonicalName: string,
): boolean {
  const a = normalizeToken(aliasCandidate)
  const c = normalizeToken(canonicalName)
  if (!a || !c || a === c) return false
  if (aliasCandidate.trim().length > 20) return false
  const rawA = aliasCandidate.normalize('NFKC').trim()
  const rawC = canonicalName.normalize('NFKC').trim()
  if (
    rawA.length <= 4 &&
    rawC.length <= 4 &&
    !shareHanCharacters(rawA, rawC)
  ) {
    return false
  }
  return fuzzyScore(aliasCandidate, canonicalName) >= ALIAS_AUTO_MIN_SCORE
}

/** 拼音层纠正：字形可完全不同，凭读音相似度写入别名 */
export function shouldAutoLearnAliasFromPinyin(
  aliasCandidate: string,
  canonicalName: string,
  pinyinScore: number,
): boolean {
  const a = normalizeToken(aliasCandidate)
  const c = normalizeToken(canonicalName)
  if (!a || !c || a === c) return false
  if (aliasCandidate.trim().length > 20) return false
  return pinyinScore >= 0.94
}

export type AliasAttachCandidate = {
  canonicalName: string
  alias: string
  /** 来自拼音纠正时传入，用于允许「鼹鼠→烟薯」这类字形差异大的别名 */
  pinyinScore?: number
}

const UTTERANCE_STOPWORDS = new Set([
  '今天',
  '昨天',
  '明天',
  '客户',
  '买家',
  '对方',
  '一共',
  '合计',
  '总共',
  '实收',
  '货款',
  '金额',
  '块钱',
  '人民币',
  '孙悟空',
  '孙悟空买的',
  '唐僧',
])

/** 从用户原话里提取可能是商品名的中文片段 */
export function extractProductLikeTokensFromUtterance(text: string): string[] {
  const parts = text.match(/[\u4e00-\u9fff]{2,8}/g) ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of parts) {
    const t = p.trim()
    if (!t || UTTERANCE_STOPWORDS.has(t)) continue
    const k = normalizeToken(t)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

/**
 * AI 已直接输出规范名、或 fuzzy 未记录步骤时：从原话 + 草稿对比补充别名候选
 */
export function collectAliasCandidatesFromUtterance(input: {
  utterance: string
  draftProducts: string[]
  finalProducts: string[]
  productCatalog?: ProductCatalogEntry[]
}): AliasAttachCandidate[] {
  const { utterance, draftProducts, finalProducts, productCatalog } = input
  const out: AliasAttachCandidate[] = []
  const seen = new Set<string>()

  const push = (canonicalName: string, alias: string, pinyinScore: number) => {
    if (productCatalog?.length) {
      if (!isAliasAllowedInCatalog(productCatalog, canonicalName, alias)) return
    } else if (!isPlausibleProductAlias(alias, canonicalName)) {
      return
    }
    const key = `${normalizeToken(canonicalName)}|${normalizeToken(alias)}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ canonicalName, alias, pinyinScore })
  }

  const lineCount = Math.max(draftProducts.length, finalProducts.length, 1)
  for (let i = 0; i < lineCount; i++) {
    const final = (finalProducts[i] ?? finalProducts[0] ?? '').trim()
    const draft = (draftProducts[i] ?? '').trim()
    if (!final) continue
    if (draft && normalizeToken(draft) !== normalizeToken(final)) {
      const sc = scoreAliasLearnPotential(draft, final)
      if (sc > 0) push(final, draft, sc)
    }
  }

  const tokens = extractProductLikeTokensFromUtterance(utterance)
  for (const final of finalProducts) {
    const f = final.trim()
    if (!f) continue
    for (const token of tokens) {
      if (normalizeToken(token) === normalizeToken(f)) continue
      const sc = scoreAliasLearnPotential(token, f)
      if (sc > 0) push(f, token, sc)
    }
  }

  return out
}

/** 静默维护别名表（不展示在设置 UI） */
export function attachAliasesToCatalog(
  catalog: ProductCatalogEntry[],
  candidates: AliasAttachCandidate[],
): { catalog: ProductCatalogEntry[]; changed: boolean } {
  if (!candidates.length) return { catalog, changed: false }
  let changed = false
  const next = catalog.map((e) => ({
    ...e,
    aliases: [...(e.aliases ?? [])],
  }))
  const byNorm = new Map<string, ProductCatalogEntry>()
  for (const e of next) {
    const k = normalizeToken(e.name)
    if (k) byNorm.set(k, e)
  }

  for (const { canonicalName, alias, pinyinScore } of candidates) {
    if (!isAliasAllowedInCatalog(next, canonicalName, alias)) continue
    const ok =
      pinyinScore != null
        ? shouldAutoLearnAliasFromPinyin(alias, canonicalName, pinyinScore)
        : shouldAutoLearnAlias(alias, canonicalName)
    if (!ok) continue
    const entry =
      byNorm.get(normalizeToken(canonicalName)) ??
      next.find((e) => e.name === canonicalName)
    if (!entry) continue
    const aliasNorm = normalizeToken(alias)
    const canonNorm = normalizeToken(entry.name)
    if (!aliasNorm || aliasNorm === canonNorm) continue
    const existing = new Set(
      [entry.name, ...(entry.aliases ?? [])].map((x) => normalizeToken(x)),
    )
    if (existing.has(aliasNorm)) continue
    if ((entry.aliases ?? []).length >= MAX_ALIASES_PER_PRODUCT) continue
    entry.aliases = [...(entry.aliases ?? []), alias.trim()]
    changed = true
  }

  const sanitized = sanitizeAllCatalogAliases(next)
  return { catalog: sanitized, changed: changed || !catalogsAliasEqual(catalog, sanitized) }
}

function catalogsAliasEqual(
  a: ProductCatalogEntry[],
  b: ProductCatalogEntry[],
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ea = a[i]!
    const eb = b.find((x) => x.id === ea.id)
    if (!eb) return false
    const aa = (ea.aliases ?? []).map(normalizeToken).join('|')
    const ab = (eb.aliases ?? []).map(normalizeToken).join('|')
    if (aa !== ab) return false
  }
  return true
}
