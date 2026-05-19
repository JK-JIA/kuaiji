import type { DoubaoParseResult } from '../types/voiceParse'
import type { LedgerLineForm } from './ledgerRecordDraft'
import type { VoiceFuzzyProductStep } from './voiceHistoryFuzzy'

export type VoiceParseDebugTrace = {
  at: number
  /** 一句话说明本次走了哪条纠正路径 */
  pipelineSummary?: string
  asrRawText: string
  asrHotwords: string[]
  productCatalogPrompt: string[]
  aiRaw: DoubaoParseResult | null
  afterDraft: { values: Record<string, string>; lines: LedgerLineForm[] } | null
  afterUserCorrections: { lines: LedgerLineForm[] } | null
  fuzzyProductSteps: VoiceFuzzyProductStep[]
  afterFuzzy: { values: Record<string, string>; lines: LedgerLineForm[] } | null
  needConfirm: boolean
  confirmHint?: string
  aliasAutoAttached: string[]
  correctionsApplied: string[]
}

/** 供保存时对比：语音管线写入表单后的商品名快照 */
let lastPipelineProducts: string[] = []

export function setLastVoicePipelineProducts(names: string[]): void {
  lastPipelineProducts = names.map((n) => n.trim()).filter(Boolean)
}

export function getLastVoicePipelineProducts(): string[] {
  return [...lastPipelineProducts]
}

export function clearLastVoicePipelineProducts(): void {
  lastPipelineProducts = []
}
