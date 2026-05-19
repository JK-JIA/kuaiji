import type { FieldDef, LedgerRecord, ProductCatalogEntry } from '../types'
import type { DoubaoParseResult } from '../types/voiceParse'
import { parseWithDoubao } from './doubaoParser'
import {
  applyVoiceParsedToDraft,
  createEmptyLineForm,
  emptyLedgerFieldValues,
  getLedgerFormLayout,
  type LedgerFormLayout,
  type LedgerLineForm,
} from './ledgerRecordDraft'
import {
  attachAliasesToCatalog,
  buildAiProductCatalogPromptSection,
  collectAliasCandidatesFromUtterance,
  normalizeAiProductField,
  pickUtteranceProductOverride,
  type AliasAttachCandidate,
} from './productAliasHelpers'
import {
  applyCorrectionToProductName,
  type VoiceProductCorrection,
} from './voiceProductCorrections'
import {
  setLastVoicePipelineProducts,
  type VoiceParseDebugTrace,
} from './voiceParseDebug'
import {
  applyVoiceHistoryFuzzyMatch,
  normalizeToken,
  type VoiceHistoryFuzzyResult,
} from './voiceHistoryFuzzy'

export type VoiceParsePipelineInput = {
  asrText: string
  asrHotwords: string[]
  fields: FieldDef[]
  records: LedgerRecord[]
  productCatalog: ProductCatalogEntry[]
  productCorrections: VoiceProductCorrection[]
  apiBase?: string | null
  token?: string | null
}

export type VoiceParsePipelineResult = VoiceHistoryFuzzyResult & {
  success: boolean
  error?: string
  /** 若别名表有静默更新，返回新目录供调用方持久化 */
  catalogWithAliases?: ProductCatalogEntry[]
  debug: VoiceParseDebugTrace
}

function applyUserCorrectionsToLines(
  lines: LedgerLineForm[],
  corrections: VoiceProductCorrection[],
): { lines: LedgerLineForm[]; applied: string[] } {
  const applied: string[] = []
  const next = lines.map((l) => {
    const { name, applied: hit } = applyCorrectionToProductName(
      l.product,
      corrections,
    )
    if (hit) applied.push(`${l.product.trim()}→${name}`)
    return hit ? { ...l, product: name } : l
  })
  return { lines: next, applied }
}

function buildPipelineSummary(
  fuzzy: VoiceHistoryFuzzyResult,
  correctionsApplied: string[],
  aiProduct?: string,
): string {
  const parts: string[] = []
  if (correctionsApplied.length > 0) {
    parts.push(`用户纠错表: ${correctionsApplied.join('、')}`)
  }
  const step = fuzzy.productSteps?.[0]
  if (step) {
    const stageLabel: Record<string, string> = {
      alias: '别名表',
      catalogExact: '商品目录',
      charFuzzy: '字形相似',
      pinyin: '读音相同',
    }
    parts.push(
      `商品 ${step.raw}→${step.result}（${stageLabel[step.stage] ?? step.stage}${step.score != null ? ` ${(step.score * 100).toFixed(0)}%` : ''}）`,
    )
  } else if (aiProduct) {
    parts.push(`商品保持 AI 结果「${aiProduct}」`)
  }
  if (fuzzy.needConfirm) {
    parts.push('建议进表单核对')
  } else {
    parts.push('可直接入账')
  }
  return parts.join(' · ')
}

function collectAliasCandidates(
  fuzzy: VoiceHistoryFuzzyResult,
): AliasAttachCandidate[] {
  return (fuzzy.aliasAttachCandidates ?? []).map((c) => ({
    canonicalName: c.canonical,
    alias: c.alias,
    pinyinScore: c.pinyinScore,
  }))
}

export async function runVoiceParsePipeline(
  input: VoiceParsePipelineInput,
): Promise<VoiceParsePipelineResult> {
  const {
    asrText,
    asrHotwords,
    fields,
    records,
    productCatalog,
    productCorrections,
    apiBase,
    token,
  } = input

  const text = asrText.trim()
  const layout: LedgerFormLayout = getLedgerFormLayout(fields)
  const debug: VoiceParseDebugTrace = {
    at: Date.now(),
    asrRawText: text,
    asrHotwords: [...asrHotwords],
    productCatalogPrompt: [
      buildAiProductCatalogPromptSection(productCatalog),
    ],
    aiRaw: null,
    afterDraft: null,
    afterUserCorrections: null,
    fuzzyProductSteps: [],
    afterFuzzy: null,
    needConfirm: false,
    aliasAutoAttached: [],
    correctionsApplied: [],
  }

  if (!text) {
    return {
      success: false,
      error: '没有识别到语音内容',
      values: emptyLedgerFieldValues(layout.sortedFields),
      lines: [createEmptyLineForm()],
      needConfirm: false,
      debug,
    }
  }

  const aiRaw: DoubaoParseResult = await parseWithDoubao(text, fields, {
    apiBase,
    token,
    productCatalogPromptSection:
      buildAiProductCatalogPromptSection(productCatalog),
  })
  debug.aiRaw = aiRaw

  if (!aiRaw.success || !aiRaw.data) {
    return {
      success: false,
      error: aiRaw.error ?? '解析失败',
      values: emptyLedgerFieldValues(layout.sortedFields),
      lines: [createEmptyLineForm()],
      needConfirm: false,
      debug,
    }
  }

  const emptyVals = emptyLedgerFieldValues(layout.sortedFields)
  const emptyLines = [createEmptyLineForm()]
  let { values, lines } = applyVoiceParsedToDraft(
    layout,
    emptyVals,
    emptyLines,
    aiRaw.data,
    aiRaw.productLines,
  )
  lines = lines.map((l) => ({
    ...l,
    product: normalizeAiProductField(l.product),
  }))
  const utterProduct = pickUtteranceProductOverride(text, productCatalog)
  if (utterProduct && lines[0]?.product.trim()) {
    const prodId = layout.prodId
    const cur = lines[0]!.product.trim()
    if (
      normalizeToken(cur) !== normalizeToken(utterProduct.canonicalName) &&
      normalizeToken(utterProduct.token) !== normalizeToken(cur)
    ) {
      lines[0]!.product = utterProduct.canonicalName
      if (prodId) values[prodId] = utterProduct.canonicalName
    }
  }
  debug.afterDraft = {
    values: { ...values },
    lines: lines.map((l) => ({ ...l })),
  }

  const corrected = applyUserCorrectionsToLines(lines, productCorrections)
  lines = corrected.lines
  debug.correctionsApplied = corrected.applied
  debug.afterUserCorrections = { lines: lines.map((l) => ({ ...l })) }

  const fuzzy = applyVoiceHistoryFuzzyMatch({
    layout,
    values,
    lines,
    records,
    fields,
    productCatalog,
  })
  debug.fuzzyProductSteps = fuzzy.productSteps ?? []
  debug.afterFuzzy = {
    values: { ...fuzzy.values },
    lines: fuzzy.lines.map((l) => ({ ...l })),
  }
  debug.needConfirm = fuzzy.needConfirm
  debug.confirmHint = fuzzy.confirmHint
  debug.pipelineSummary = buildPipelineSummary(
    fuzzy,
    corrected.applied,
    debug.aiRaw?.productLines?.[0]?.product,
  )

  const aliasFromFuzzy = collectAliasCandidates(fuzzy)
  const aliasFromUtterance = collectAliasCandidatesFromUtterance({
    utterance: text,
    draftProducts:
      debug.afterDraft?.lines.map((l) => l.product) ??
      lines.map((l) => l.product),
    finalProducts: fuzzy.lines.map((l) => l.product),
  })
  const aliasCandidates: AliasAttachCandidate[] = [
    ...aliasFromFuzzy,
    ...aliasFromUtterance,
  ]
  let catalogWithAliases: ProductCatalogEntry[] | undefined
  if (aliasCandidates.length > 0) {
    const { catalog, changed } = attachAliasesToCatalog(
      productCatalog,
      aliasCandidates,
    )
    if (changed) {
      catalogWithAliases = catalog
      debug.aliasAutoAttached = [
        ...new Set(
          aliasCandidates.map((c) => `${c.alias}→${c.canonicalName}`),
        ),
      ]
    }
  }

  /** 保存前对比用：记 fuzzy 纠正前的商品名（如 鼹鼠），保存时若表单为 烟薯 可写入用户纠错表 */
  const preFuzzyProducts =
    debug.afterDraft?.lines.map((l) => l.product.trim()).filter(Boolean) ??
    fuzzy.lines.map((l) => l.product).filter(Boolean)
  setLastVoicePipelineProducts(preFuzzyProducts)
  return {
    success: true,
    values: fuzzy.values,
    lines: fuzzy.lines,
    needConfirm: fuzzy.needConfirm,
    confirmHint: fuzzy.confirmHint,
    catalogWithAliases,
    debug,
  }
}
