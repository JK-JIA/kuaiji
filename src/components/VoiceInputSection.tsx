import { useCallback, useMemo, useState } from 'react'
import { useHoldVolcTranscript } from '../hooks/useHoldVolcTranscript'
import { useAuth } from '../context/AuthContext'
import type { DoubaoProductLine } from '../utils/doubaoParser'
import { isDoubaoConfigured } from '../utils/doubaoParser'
import type { LedgerLineForm } from '../utils/ledgerRecordDraft'
import { messageIfPremiumFeatureBlocked } from '../utils/premiumGate'
import { runVoiceParsePipeline } from '../utils/voiceParsePipeline'
import type { FieldDef, LedgerRecord, ProductCatalogEntry } from '../types'
import { useLedger } from '../context/LedgerContext'

function lineFormsToDoubaoLines(lines: LedgerLineForm[]): DoubaoProductLine[] {
  return lines
    .filter((l) => l.product.trim() || l.quantity.trim())
    .map((l) => ({
      product: l.product.trim(),
      quantity: l.quantity.trim(),
      unitPrice: l.unitPrice.trim() || undefined,
      lineAmount: l.lineAmount.trim() || undefined,
    }))
}

type Props = {
  fields: FieldDef[]
  records: LedgerRecord[]
  productCatalog?: ProductCatalogEntry[]
  /** 与首页长按一致：近期账本词作 ASR 热词 */
  asrHotwords?: string[]
  onApplyParsed: (
    data: Record<string, string>,
    productLines?: DoubaoProductLine[],
  ) => void
  onFillFirstLine: (product: string, quantity: string) => void
}

export function VoiceInputSection({
  fields,
  records,
  productCatalog = [],
  asrHotwords,
  onApplyParsed,
  onFillFirstLine,
}: Props) {
  const { apiBase, token, membershipActive } = useAuth()
  const {
    voiceProductCorrections,
    mergeVoiceCatalogAliases,
  } = useLedger()
  const premiumBlocked = useMemo(
    () =>
      messageIfPremiumFeatureBlocked({
        apiBase,
        token,
        membershipActive,
      }),
    [apiBase, token, membershipActive],
  )
  const canUseVoice = premiumBlocked === null

  const [busy, setBusy] = useState(false)

  const {
    micBtnRef,
    transcript,
    setTranscript,
    recording,
    hint,
    setHint,
    handleMicPointerDown,
    handleMicPointerUp,
  } = useHoldVolcTranscript({
    apiBase,
    token,
    membershipActive,
    asrHotwords,
  })

  const handleParse = useCallback(async () => {
    const text = transcript.trim()
    if (!text) {
      setHint('请先完成语音识别或输入文字')
      return
    }
    if (!isDoubaoConfigured({ apiBase })) {
      onFillFirstLine(text, '')
      setHint(null)
      return
    }
    const block = messageIfPremiumFeatureBlocked({
      apiBase,
      token,
      membershipActive,
    })
    if (block) {
      setHint(block)
      return
    }
    setBusy(true)
    setHint(null)
    try {
      const pipeline = await runVoiceParsePipeline({
        asrText: text,
        asrHotwords: asrHotwords ?? [],
        fields,
        records,
        productCatalog,
        productCorrections: voiceProductCorrections,
        apiBase,
        token,
      })
      if (!pipeline.success) {
        setHint(pipeline.error ?? '解析失败')
        return
      }
      onApplyParsed(pipeline.values, lineFormsToDoubaoLines(pipeline.lines))
      if (pipeline.catalogWithAliases) {
        void mergeVoiceCatalogAliases(pipeline.catalogWithAliases)
      }
      if (pipeline.needConfirm) {
        setHint(pipeline.confirmHint ?? '请核对购买方与商品后再保存')
      }
    } finally {
      setBusy(false)
    }
  }, [
    transcript,
    fields,
    records,
    productCatalog,
    asrHotwords,
    voiceProductCorrections,
    mergeVoiceCatalogAliases,
    onApplyParsed,
    onFillFirstLine,
    apiBase,
    token,
    membershipActive,
    setHint,
  ])

  const micIdle = !recording
  const micEnabled = canUseVoice

  return (
    <div className="rounded-2xl border border-kj-border-strong/80 bg-kj-surface p-4 text-left shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-medium text-kj-secondary">语音</span>
          {!micIdle && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
              录音中
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={busy || !transcript.trim()}
          onClick={() => void handleParse()}
          className="shrink-0 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-[#1a7f4c] disabled:opacity-45"
        >
          {isDoubaoConfigured()
            ? busy
              ? '填入中…'
              : '智能填入'
            : '填入首行'}
        </button>
      </div>

      <div className="mt-3 flex gap-3">
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={3}
          className="min-h-[4.25rem] max-h-32 min-w-0 flex-1 resize-y rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-2.5 text-sm leading-relaxed text-kj-primary placeholder:text-kj-muted"
          placeholder="识别文字"
          aria-label="识别文字"
        />
        <div className="flex shrink-0 flex-col justify-end self-stretch pb-0.5">
          <button
            ref={micBtnRef}
            type="button"
            style={{ touchAction: 'none' }}
            onPointerDown={handleMicPointerDown}
            onPointerUp={handleMicPointerUp}
            onPointerCancel={handleMicPointerUp}
            className={
              micIdle
                ? micEnabled
                  ? 'flex h-14 w-14 select-none items-center justify-center rounded-full bg-[#1a7f4c] text-white shadow-md active:scale-95 active:bg-[#166b3c]'
                  : 'flex h-14 w-14 select-none items-center justify-center rounded-full bg-stone-200 text-stone-500'
                : 'flex h-14 w-14 select-none items-center justify-center rounded-full bg-rose-600 text-white shadow-md ring-[3px] ring-rose-200/70'
            }
            title={micIdle ? '长按开始，松手结束' : undefined}
            aria-label={micIdle ? '长按麦克风说话，松手结束' : '录音中，松手结束'}
          >
            <MicIcon className="h-7 w-7" />
          </button>
        </div>
      </div>

      {hint && (
        <p className="mt-2 text-xs leading-snug text-amber-800" role="status">
          {hint}
        </p>
      )}
    </div>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}
