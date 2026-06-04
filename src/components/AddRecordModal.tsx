import { format, parseISO } from 'date-fns'
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { FieldDef, LedgerRecord } from '../types'
import { useLedger } from '../context/LedgerContext'
import {
  computedLineAmountFromUnitAndQty,
  deriveUnitPriceFromAmountAndQty,
  emptyLineTripleTouched,
  parseMoney,
  parseNonNegativeMoney,
  patchLineTripleTouched,
  reconcileLineTripleByLastEdited,
  sanitizeUnsignedDecimalInput,
  displayQuantityFieldName,
  type LineTripleLastEdited,
} from '../utils/recordHelpers'
import {
  CATALOG_EMPTY_HINT,
  canonicalProductNameFromCatalog,
  defaultUnitForProduct,
  hasProductCatalog,
} from '../utils/productCatalogHelpers'
import { QuantityUnitSelect } from './QuantityUnitSelect'
import {
  applyVoiceFillFirstLine,
  buildLedgerRecordForSave,
  createEmptyLineForm,
  lineFormQuantityUnitFromValues,
  emptyLedgerFieldValues,
  formatLedgerMoneyInput,
  getLedgerFormLayout,
  mapDoubaoProductLinesToLineForms,
  mergeVoiceParsedIntoValues,
  rootValuesFromRecord,
  legacyProductNamesFromRecord,
  validateRecordForm,
  type LedgerLineForm,
} from '../utils/ledgerRecordDraft'
import { collectAsrHotwordsFromLedger } from '../utils/asrHotwordsFromLedger'
import {
  clearLastVoicePipelineProducts,
  getLastVoicePipelineProducts,
} from '../utils/voiceParseDebug'
import { CalendarPickerModal } from './CalendarPickerModal'
import { VoiceInputSection } from './VoiceInputSection'
import {
  ProductNamePickerField,
  ProductPickerModal,
} from './ProductPickerModal'
import {
  CustomerPickerField,
  CustomerPickerModal,
} from './CustomerPickerModal'

/** 首页语音低置信度或校验失败时预填「记一笔」 */
export type VoiceFormPrefillPayload = {
  values: Record<string, string>
  lines: Array<{
    product: string
    quantity: string
    quantityUnit?: string
    unitPrice: string
    lineAmount: string
  }>
  recordDate?: string
  dealInput?: string
  formError?: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  fields: FieldDef[]
  onSave: (rec: LedgerRecord) => Promise<void>
  recordToEdit?: LedgerRecord | null
  recordDates?: Set<string>
  voiceFormPrefill?: VoiceFormPrefillPayload | null
  /** 递增则重新应用 voiceFormPrefill（与 recordToEdit 互斥） */
  voiceFormPrefillKey?: number
}

export function AddRecordModal({
  open,
  onClose,
  fields,
  onSave,
  recordToEdit = null,
  recordDates,
  voiceFormPrefill = null,
  voiceFormPrefillKey = 0,
}: Props) {
  const layout = useMemo(() => getLedgerFormLayout(fields), [fields])
  const {
    sortedFields,
    prodField,
    qtyField,
    unitPriceField,
    canonicalAmountId,
    showDetailAmounts,
    rootFieldIdsForRender,
    prodId,
    qtyId,
    unitPriceId,
  } = layout
  const amountField = sortedFields.find((f) => f.key === 'amount')

  const qtyFieldDisplayName = useMemo(
    () => (qtyField ? displayQuantityFieldName(qtyField.name) : '数量'),
    [qtyField],
  )

  const {
    records,
    productCatalog,
    customerCatalog,
    asrHotwordsSuppressed,
    learnVoiceProductFromSave,
  } = useLedger()

  const [recordDate, setRecordDate] = useState(() =>
    format(new Date(), 'yyyy-MM-dd'),
  )
  const [values, setValues] = useState<Record<string, string>>(() =>
    emptyLedgerFieldValues(sortedFields),
  )
  const [lines, setLines] = useState<LedgerLineForm[]>([createEmptyLineForm()])
  const [dealInput, setDealInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  /** 语音 / 智能填入区域，默认收起以节省屏高 */
  const [voicePanelOpen, setVoicePanelOpen] = useState(false)
  /** 校验失败文案（弹窗内展示；避免 WebView / 原生校验拦截导致无提示） */
  const [formError, setFormError] = useState<string | null>(null)
  const [productPickerLineIdx, setProductPickerLineIdx] = useState<
    number | null
  >(null)
  const [buyerPickerOpen, setBuyerPickerOpen] = useState(false)
  const lineSubtotal = useMemo(
    () => lines.reduce((s, l) => s + parseMoney(l.lineAmount), 0),
    [lines],
  )

  const lastVoicePrefillKeyRef = useRef(0)

  const dealNum = useMemo(
    () => parseNonNegativeMoney(dealInput),
    [dealInput],
  )

  const discountShown = useMemo(() => {
    if (lineSubtotal <= 0 || dealNum <= 0) return 0
    const d = lineSubtotal - dealNum
    return d > 0.005 ? Math.round(d * 100) / 100 : 0
  }, [lineSubtotal, dealNum])

  const catalogReady = hasProductCatalog(productCatalog)

  const legacyProductNames = useMemo(() => {
    if (!recordToEdit || !prodId) return undefined
    return legacyProductNamesFromRecord(recordToEdit, prodId)
  }, [recordToEdit, prodId])

  const selectProductForLine = useCallback(
    (idx: number, name: string) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const canonical =
        canonicalProductNameFromCatalog(trimmed, productCatalog) ?? trimmed
      const unit = defaultUnitForProduct(canonical, productCatalog)
      setLines((prev) =>
        prev.map((row, i) =>
          i === idx
            ? { ...row, product: canonical, quantityUnit: unit }
            : row,
        ),
      )
    },
    [productCatalog],
  )

  const plateFieldId = sortedFields.find((f) => f.key === 'plate')?.id
  const plateFieldName =
    sortedFields.find((f) => f.key === 'plate')?.name ?? '购买方'

  const modalAsrHotwords = useMemo(
    () =>
      collectAsrHotwordsFromLedger(records, fields, {
        productCatalog,
        asrHotwordsSuppressed,
      }),
    [records, fields, productCatalog, asrHotwordsSuppressed],
  )

  const dateCompactLabel = useMemo(() => {
    try {
      return format(parseISO(`${recordDate}T12:00:00`), 'M月d日')
    } catch {
      return recordDate
    }
  }, [recordDate])

  const applyBuyerKey = useCallback(
    (name: string) => {
      const trimmed = name.trim()
      if (!trimmed || !plateFieldId) return
      setValues((v) => ({ ...v, [plateFieldId]: trimmed }))
    },
    [plateFieldId],
  )

  useEffect(() => {
    if (!open || !canonicalAmountId || !showDetailAmounts) return
    const sub = lines.reduce((s, l) => s + parseMoney(l.lineAmount), 0)
    const next = sub > 0 ? formatLedgerMoneyInput(sub) : ''
    setValues((v) =>
      v[canonicalAmountId] === next ? v : { ...v, [canonicalAmountId]: next },
    )
  }, [lines, open, canonicalAmountId, showDetailAmounts])

  useEffect(() => {
    if (open) setFormError(null)
    else {
      setVoicePanelOpen(false)
      setProductPickerLineIdx(null)
    }
  }, [open])

  /** 防止保存别名目录 refresh 时因 sortedFields 引用变化而清空已填入的表单 */
  const modalSessionKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) {
      modalSessionKeyRef.current = null
      return
    }
    const sessionKey = recordToEdit?.id ?? `new:${voiceFormPrefillKey}`
    if (modalSessionKeyRef.current === sessionKey) {
      return
    }
    modalSessionKeyRef.current = sessionKey

    if (recordToEdit && prodId && qtyId) {
      lastVoicePrefillKeyRef.current = 0
      setRecordDate(recordToEdit.date)
      setValues(rootValuesFromRecord(sortedFields, recordToEdit.values))
      const da = recordToEdit.dealAmount
      setDealInput(
        da !== undefined && !Number.isNaN(da) ? formatLedgerMoneyInput(da) : '',
      )
      if (recordToEdit.lineItems && recordToEdit.lineItems.length > 0) {
        setLines(
          recordToEdit.lineItems.map((li) => {
            const storedAmt =
              canonicalAmountId &&
              li.values[canonicalAmountId] !== undefined
                ? String(li.values[canonicalAmountId]).trim()
                : ''
            const qStr = String(li.values[qtyId] ?? '')
            const upStored =
              unitPriceId && li.values[unitPriceId]?.toString().trim()
                ? String(li.values[unitPriceId]).trim()
                : ''
            const unitPrice =
              upStored ||
              deriveUnitPriceFromAmountAndQty(storedAmt, qStr)
            const computed = computedLineAmountFromUnitAndQty(unitPrice, qStr)
            const lineAmount = computed || storedAmt
            const product = String(li.values[prodId] ?? '')
            return {
              id: li.id,
              product,
              unitPrice,
              quantity: qStr,
              quantityUnit: lineFormQuantityUnitFromValues(
                li.values,
                product,
                productCatalog,
              ),
              lineAmount,
              lastEdited: null,
              touched: emptyLineTripleTouched(),
            }
          }),
        )
      } else {
        setLines([
          {
            id: crypto.randomUUID(),
            product: String(recordToEdit.values[prodId] ?? ''),
            unitPrice: '',
            quantity: recordToEdit.values[qtyId] ?? '',
            quantityUnit: lineFormQuantityUnitFromValues(
              recordToEdit.values,
              String(recordToEdit.values[prodId] ?? ''),
              productCatalog,
            ),
            lineAmount: '',
            lastEdited: null,
            touched: emptyLineTripleTouched(),
          },
        ])
      }
    } else if (
      voiceFormPrefill &&
      voiceFormPrefillKey > 0 &&
      lastVoicePrefillKeyRef.current !== voiceFormPrefillKey
    ) {
      lastVoicePrefillKeyRef.current = voiceFormPrefillKey
      setVoicePanelOpen(true)
      setRecordDate(
        voiceFormPrefill.recordDate ?? format(new Date(), 'yyyy-MM-dd'),
      )
      setValues({
        ...emptyLedgerFieldValues(sortedFields),
        ...voiceFormPrefill.values,
      })
      setDealInput(voiceFormPrefill.dealInput ?? '')
      setFormError(voiceFormPrefill.formError ?? null)
      setLines(
        voiceFormPrefill.lines.length > 0
          ? voiceFormPrefill.lines.map((row) => ({
              id: crypto.randomUUID(),
              product: row.product,
              unitPrice: row.unitPrice,
              quantity: row.quantity,
              quantityUnit:
                row.quantityUnit?.trim() ||
                defaultUnitForProduct(row.product, productCatalog),
              lineAmount: row.lineAmount,
              lastEdited: null,
              touched: emptyLineTripleTouched(),
            }))
          : [createEmptyLineForm()],
      )
    } else if (
      !recordToEdit &&
      (!voiceFormPrefill || voiceFormPrefillKey === 0)
    ) {
      lastVoicePrefillKeyRef.current = 0
      setRecordDate(format(new Date(), 'yyyy-MM-dd'))
      setValues(emptyLedgerFieldValues(sortedFields))
      setDealInput('')
      setLines([createEmptyLineForm()])
    }
  }, [
    open,
    recordToEdit?.id,
    prodId,
    qtyId,
    unitPriceId,
    canonicalAmountId,
    voiceFormPrefill,
    voiceFormPrefillKey,
    sortedFields,
    productCatalog,
    recordToEdit,
  ])

  const validate = (): string | null =>
    validateRecordForm(layout, {
      values,
      lines,
      dealInput,
      productCatalog,
      legacyProductNames,
    })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const err = validate()
    if (err) {
      setFormError(err)
      return
    }
    if (!prodId || !qtyId) return

    setSaving(true)
    try {
      const live = recordToEdit
        ? records.find((r) => r.id === recordToEdit.id)
        : undefined

      const rec = buildLedgerRecordForSave(layout, {
        values,
        lines,
        dealInput,
        recordDate,
        recordToEdit,
        liveRecord: live,
      })
      const beforeVoice = getLastVoicePipelineProducts()
      const afterProducts = lines.map((l) => l.product.trim()).filter(Boolean)
      if (beforeVoice.length > 0 && afterProducts.length > 0) {
        await learnVoiceProductFromSave(beforeVoice, afterProducts)
      }
      clearLastVoicePipelineProducts()
      await onSave(rec)
      onClose()
    } catch (saveErr) {
      setFormError(
        saveErr instanceof Error ? saveErr.message : '保存失败，请重试',
      )
    } finally {
      setSaving(false)
    }
  }

  const addLine = () => {
    setLines((prev) => [...prev, createEmptyLineForm()])
  }

  const removeLine = (index: number) => {
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
    )
  }

  if (!open) return null

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/25 sm:items-center">
      <div
        className="absolute inset-0"
        aria-hidden
        onClick={() => !saving && onClose()}
      />
      <form
        noValidate
        onSubmit={handleSubmit}
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-kj-border-strong/80 bg-kj-surface shadow-xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-kj-border bg-kj-surface px-4 pb-3 pt-4 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight text-kj-primary">
              {recordToEdit ? '编辑账单' : '记一笔'}
            </h2>
            {recordToEdit && (
              <p className="mt-1 text-xs text-kj-muted">
                创建于{' '}
                {new Date(recordToEdit.createdAt).toLocaleString('zh-CN', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-kj-secondary hover:bg-stone-100"
            aria-label="关闭"
          >
            <CloseGlyph className="h-5 w-5" />
          </button>
        </header>

        {formError && (
          <div
            role="alert"
            className="shrink-0 border-b border-rose-200 bg-rose-50 px-4 py-2.5 text-sm leading-snug text-rose-900 whitespace-pre-line sm:px-5"
          >
            {formError}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto bg-kj-bg px-4 py-4 sm:px-5">
          {!catalogReady && (
            <div className="mb-4 rounded-2xl border border-amber-200/90 bg-amber-50 px-3.5 py-3 text-sm leading-relaxed text-amber-950">
              {CATALOG_EMPTY_HINT}
            </div>
          )}
          <div className="mb-4 flex justify-start">
            <button
              type="button"
              onClick={() => setDatePickerOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-kj-border-strong bg-kj-surface px-3.5 py-2 text-sm font-medium text-kj-primary shadow-sm active:bg-stone-50 bg-kj-raised"
              aria-label="选择记账日期"
            >
              <CalendarGlyph className="h-4 w-4 text-kj-secondary" aria-hidden />
              <span>{dateCompactLabel}</span>
              <ChevronDownGlyph className="h-4 w-4 text-kj-muted" aria-hidden />
            </button>
          </div>
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setVoicePanelOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 rounded-2xl border border-kj-border-strong/80 bg-kj-surface px-4 py-3 text-left shadow-sm active:bg-kj-hover"
              aria-expanded={voicePanelOpen}
            >
              <span className="text-sm font-medium text-kj-primary">
                智能识别
              </span>
              <ChevronDownGlyph
                className={`h-4 w-4 shrink-0 text-kj-muted transition-transform duration-200 ${voicePanelOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            {voicePanelOpen ? (
              <div className="mt-3">
                {!catalogReady ? (
                  <p className="rounded-xl border border-dashed border-kj-border-strong bg-kj-surface px-3 py-3 text-sm text-kj-secondary">
                    {CATALOG_EMPTY_HINT}
                  </p>
                ) : (
                <VoiceInputSection
                  fields={sortedFields}
                  records={records}
                  productCatalog={productCatalog}
                  asrHotwords={modalAsrHotwords}
                  onApplyParsed={(data, productLines, recordDate) => {
                    setValues((v) =>
                      mergeVoiceParsedIntoValues(sortedFields, v, data),
                    )
                    if (productLines?.length && prodId && qtyId) {
                      setLines(
                        mapDoubaoProductLinesToLineForms(
                          productLines,
                          productCatalog,
                        ),
                      )
                    }
                    if (recordDate) setRecordDate(recordDate)
                    setFormError(null)
                  }}
                  onFillFirstLine={(product, quantity) => {
                    const canonical =
                      canonicalProductNameFromCatalog(
                        product,
                        productCatalog,
                      )
                    if (!canonical) {
                      setFormError(
                        product.trim()
                          ? `「${product.trim()}」不在商品目录中，请从列表选择`
                          : CATALOG_EMPTY_HINT,
                      )
                      return
                    }
                    setLines((prev) =>
                      applyVoiceFillFirstLine(prev, canonical, quantity),
                    )
                  }}
                />
                )}
              </div>
            ) : null}
          </div>

          {rootFieldIdsForRender.length > 0 && (
            <div className="mt-4 space-y-3 rounded-2xl border border-kj-border-strong/80 bg-kj-surface p-4 shadow-sm">
              {rootFieldIdsForRender.map((fid) => {
                const f = sortedFields.find((x) => x.id === fid)
                if (!f) return null
                const isBuyerField = f.key === 'plate'
                return (
                  <label key={f.id} className="block text-left">
                    {isBuyerField ? (
                      <div className="mb-2 flex items-center gap-2.5">
                        <span
                          className="h-4 w-0.5 shrink-0 rounded-full bg-gradient-to-b from-emerald-400 to-[#1a7f4c] shadow-[0_0_4px_rgba(26,127,76,0.3)]"
                          aria-hidden
                        />
                        <span className="text-base font-bold tracking-wide text-kj-primary">
                          {f.name}
                          {f.required && (
                            <span className="text-rose-500" aria-hidden>
                              *
                            </span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm font-semibold text-kj-primary">
                        {f.name}
                        {f.required && (
                          <span className="text-rose-500" aria-hidden>
                            *
                          </span>
                        )}
                      </span>
                    )}
                    {f.key === 'plate' ? (
                      <CustomerPickerField
                        value={values[f.id] ?? ''}
                        placeholder={`请选择${f.name}`}
                        onClick={() => setBuyerPickerOpen(true)}
                        className="mt-1.5"
                        aria-label={`选择${f.name}`}
                      />
                    ) : (
                      <>
                        <input
                          type="text"
                          inputMode={f.type === 'number' ? 'decimal' : 'text'}
                          value={values[f.id] ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value
                            const next =
                              f.type === 'number'
                                ? sanitizeUnsignedDecimalInput(raw)
                                : raw
                            setValues((v) => ({ ...v, [f.id]: next }))
                          }}
                          className="mt-1.5 w-full rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-2.5 text-base text-kj-primary placeholder:text-kj-muted"
                          placeholder={f.name}
                          autoComplete="off"
                          spellCheck={f.type === 'number' ? false : undefined}
                        />
                      </>
                    )}
                  </label>
                )
              })}
            </div>
          )}

          {prodField && qtyField && (
            <div className="mt-4">
              <div className="mb-3 flex items-center gap-2.5">
                <span
                  className="h-4 w-0.5 shrink-0 rounded-full bg-gradient-to-b from-emerald-400 to-[#1a7f4c] shadow-[0_0_4px_rgba(26,127,76,0.3)]"
                  aria-hidden
                />
                <p className="text-base font-bold tracking-wide text-kj-primary">
                  商品明细
                </p>
              </div>
              <div className="rounded-2xl border border-kj-border-strong/80 bg-kj-surface p-4 shadow-sm">
                {!showDetailAmounts || !canonicalAmountId ? (
                  <div className="space-y-3 pt-2">
                    {lines.map((line, idx) => {
                      const lineUnit =
                        line.quantityUnit ||
                        defaultUnitForProduct(line.product, productCatalog)
                      return (
                      <div
                        key={line.id}
                        className="flex flex-wrap items-end gap-2 rounded-xl border border-kj-border bg-kj-raised p-3"
                      >
                        <label className="min-w-[120px] flex-[2] text-left text-xs font-medium text-kj-secondary">
                          {prodField.name}
                          {prodField.required && (
                            <span className="text-rose-500" aria-hidden>
                              *
                            </span>
                          )}
                          <div className="mt-1">
                            <ProductNamePickerField
                              value={line.product}
                              onClick={() => {
                                if (!catalogReady) {
                                  setFormError(CATALOG_EMPTY_HINT)
                                  return
                                }
                                setProductPickerLineIdx(idx)
                              }}
                              aria-label={prodField.name}
                            />
                          </div>
                        </label>
                        <label className="w-[6.5rem] shrink-0 text-left text-xs font-medium text-kj-secondary">
                          {qtyFieldDisplayName}
                          {qtyField.required && (
                            <span className="text-rose-500" aria-hidden>
                              *
                            </span>
                          )}
                          <div className="mt-1 flex gap-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={line.quantity}
                              onChange={(e) => {
                                const q = sanitizeUnsignedDecimalInput(
                                  e.target.value,
                                )
                                setLines((prev) =>
                                  prev.map((row, i) =>
                                    i === idx ? { ...row, quantity: q } : row,
                                  ),
                                )
                              }}
                              className="min-w-0 flex-1 rounded-xl border border-kj-border-strong bg-kj-surface px-2 py-2.5 text-center text-base tabular-nums text-kj-primary"
                              placeholder="数"
                              autoComplete="off"
                              spellCheck={false}
                            />
                            <QuantityUnitSelect
                              productName={line.product}
                              catalog={productCatalog}
                              value={lineUnit}
                              onChange={(unit) =>
                                setLines((prev) =>
                                  prev.map((row, i) =>
                                    i === idx
                                      ? { ...row, quantityUnit: unit }
                                      : row,
                                  ),
                                )
                              }
                            />
                          </div>
                        </label>
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-kj-muted hover:bg-white hover:bg-kj-hover hover:text-rose-600"
                          >
                            移除
                          </button>
                        )}
                      </div>
                      )
                    })}
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={addLine}
                        className="text-sm font-semibold text-[#2ecc71] hover:text-[#27ae60]"
                      >
                        + 一行
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="min-w-0 pt-2">
                    <div
                      className="grid w-full grid-cols-[minmax(4rem,1.2fr)_minmax(2.25rem,0.72fr)_minmax(2.25rem,0.72fr)_minmax(1.75rem,0.5fr)_minmax(3.75rem,0.88fr)] items-center gap-x-2 gap-y-2.5"
                      role="table"
                    >
                      <span
                        className="border-b border-kj-border pb-2 text-xs font-medium text-kj-secondary"
                        role="columnheader"
                      >
                        {prodField.name}
                      </span>
                      <span
                        className="border-b border-kj-border pb-2 text-center text-xs font-medium text-kj-secondary"
                        role="columnheader"
                      >
                        {unitPriceField?.name ?? '单价'}
                      </span>
                      <span
                        className="border-b border-kj-border pb-2 text-center text-xs font-medium text-kj-secondary"
                        role="columnheader"
                      >
                        {qtyFieldDisplayName}
                      </span>
                      <span
                        className="border-b border-kj-border pb-2 text-center text-xs font-medium text-kj-secondary"
                        role="columnheader"
                      >
                        单位
                      </span>
                      <span
                        className="border-b border-kj-border pb-2 text-right text-xs font-medium text-kj-secondary"
                        role="columnheader"
                      >
                        {amountField?.name ?? '金额'}
                      </span>
                      {lines.map((line, idx) => {
                        const lineUnit =
                          line.quantityUnit ||
                          defaultUnitForProduct(line.product, productCatalog)
                        const rowBorder =
                          idx > 0 ? 'border-t border-stone-100 pt-2.5' : ''
                        const cell = `min-w-0 ${rowBorder}`
                        const fieldBox =
                          'w-full min-w-0 rounded-xl border border-kj-border-strong bg-kj-raised px-1.5 py-2 text-sm tabular-nums text-kj-primary placeholder:text-kj-muted'
                        return (
                          <Fragment key={line.id}>
                            <div className={cell}>
                              <ProductNamePickerField
                                value={line.product}
                                onClick={() => {
                                if (!catalogReady) {
                                  setFormError(CATALOG_EMPTY_HINT)
                                  return
                                }
                                setProductPickerLineIdx(idx)
                              }}
                                className={`${fieldBox} text-left`}
                                aria-label={prodField.name}
                              />
                            </div>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={line.unitPrice}
                              onChange={(e) => {
                                const raw = e.target.value
                                const u =
                                  raw === ''
                                    ? ''
                                    : sanitizeUnsignedDecimalInput(raw)
                                const lastEdited: LineTripleLastEdited =
                                  'unitPrice'
                                setLines((prev) =>
                                  prev.map((row, i) => {
                                    if (i !== idx) return row
                                    const touched = patchLineTripleTouched(
                                      row.touched,
                                      'unitPrice',
                                      u.trim() !== '',
                                    )
                                    return {
                                      ...row,
                                      ...reconcileLineTripleByLastEdited({
                                        ...row,
                                        unitPrice: u,
                                        lastEdited,
                                        touched,
                                      }),
                                    }
                                  }),
                                )
                              }}
                              className={`${cell} ${fieldBox} px-1 text-center`}
                              placeholder={`元/${lineUnit}`}
                              aria-label={unitPriceField?.name ?? '单价'}
                              autoComplete="off"
                              spellCheck={false}
                            />
                            <input
                              type="text"
                              inputMode="decimal"
                              value={line.quantity}
                              onChange={(e) => {
                                const raw = e.target.value
                                const q =
                                  raw === ''
                                    ? ''
                                    : sanitizeUnsignedDecimalInput(raw)
                                const lastEdited: LineTripleLastEdited =
                                  'quantity'
                                setLines((prev) =>
                                  prev.map((row, i) => {
                                    if (i !== idx) return row
                                    const touched = patchLineTripleTouched(
                                      row.touched,
                                      'quantity',
                                      q.trim() !== '',
                                    )
                                    return {
                                      ...row,
                                      ...reconcileLineTripleByLastEdited({
                                        ...row,
                                        quantity: q,
                                        lastEdited,
                                        touched,
                                      }),
                                    }
                                  }),
                                )
                              }}
                              className={`${cell} ${fieldBox} px-1 text-center`}
                              placeholder="数"
                              aria-label={qtyFieldDisplayName}
                              autoComplete="off"
                              spellCheck={false}
                            />
                            <QuantityUnitSelect
                              productName={line.product}
                              catalog={productCatalog}
                              value={lineUnit}
                              onChange={(unit) =>
                                setLines((prev) =>
                                  prev.map((row, i) =>
                                    i === idx
                                      ? { ...row, quantityUnit: unit }
                                      : row,
                                  ),
                                )
                              }
                              className={`${cell} w-full min-w-0 rounded-xl border border-kj-border-strong bg-kj-raised px-0.5 py-2 text-center text-xs font-medium`}
                            />
                            <div className={`${cell} relative min-w-0`}>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={line.lineAmount}
                                onChange={(e) => {
                                  const raw = e.target.value
                                  const a =
                                    raw === ''
                                      ? ''
                                      : sanitizeUnsignedDecimalInput(raw)
                                  const lastEdited: LineTripleLastEdited =
                                    'lineAmount'
                                  setLines((prev) =>
                                    prev.map((row, i) => {
                                      if (i !== idx) return row
                                      const touched = patchLineTripleTouched(
                                        row.touched,
                                        'lineAmount',
                                        a.trim() !== '',
                                      )
                                      return {
                                        ...row,
                                        ...reconcileLineTripleByLastEdited({
                                          ...row,
                                          lineAmount: a,
                                          lastEdited,
                                          touched,
                                        }),
                                      }
                                    }),
                                  )
                                }}
                                className={`${fieldBox} w-full pr-5 text-right font-semibold text-amber-900 placeholder:font-normal`}
                                placeholder="金额"
                                aria-label={amountField?.name ?? '金额'}
                                title="默认改单价或数量会重算金额；单独改金额后以金额为准"
                                autoComplete="off"
                                spellCheck={false}
                              />
                              {lines.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => removeLine(idx)}
                                  className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded p-1 text-xs leading-none text-kj-muted hover:text-rose-600"
                                  aria-label="移除此行"
                                >
                                  ×
                                </button>
                              ) : null}
                            </div>
                          </Fragment>
                        )
                      })}
                    </div>
                      <div className="flex justify-end border-t border-stone-100 pt-2.5">
                        <button
                          type="button"
                          onClick={addLine}
                          className="text-sm font-semibold text-[#2ecc71] hover:text-[#27ae60]"
                        >
                          + 一行
                        </button>
                      </div>
                  </div>
                )}

                {showDetailAmounts && canonicalAmountId && (
                  <>
                    <div className="mt-3 border-t border-kj-border pt-2 text-right">
                      <div className="flex items-baseline justify-end gap-2">
                        <span className="text-xs leading-none text-kj-primary">
                          应收金额
                        </span>
                        <span className="text-xl font-bold tabular-nums leading-none text-kj-primary">
                          {lineSubtotal > 0
                            ? `¥${formatLedgerMoneyInput(lineSubtotal)}`
                            : '¥0'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-tight text-kj-muted">
                        各行：改单价或{qtyFieldDisplayName}会重算金额；单独改金额后以金额为准，再改单价则反推
                        {qtyFieldDisplayName}并合计为应收
                      </p>
                    </div>
                    <div className="mt-4 w-full rounded-xl border border-kj-border bg-kj-bg p-3">
                      <label className="block text-left">
                        <span className="text-sm font-medium text-kj-primary">
                          总价（优惠后实收价）
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={dealInput}
                          onChange={(e) =>
                            setDealInput(
                              sanitizeUnsignedDecimalInput(e.target.value),
                            )
                          }
                          className="mt-1.5 block w-full rounded-lg border border-kj-border-strong bg-kj-surface px-3 py-1.5 text-base font-semibold tabular-nums text-kj-primary placeholder:text-xs placeholder:font-normal placeholder:leading-snug placeholder:text-[#a3a3a3]"
                          placeholder="与应收不同填"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </label>
                      {discountShown > 0 && (
                        <p className="mt-2 text-base font-semibold text-[#2ecc71]">
                          已优惠 ¥{formatLedgerMoneyInput(discountShown)}
                        </p>
                      )}
                      {lineSubtotal > 0 &&
                        dealNum > 0 &&
                        dealNum > lineSubtotal + 0.005 && (
                          <p className="mt-2 text-sm text-amber-800" role="status">
                            总价高于应收，请核对是否填反
                          </p>
                        )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="flex gap-3 border-t border-kj-border bg-kj-surface px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-kj-border-strong bg-kj-surface py-3 text-sm font-medium text-kj-primary shadow-sm hover:bg-kj-hover"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-[#2ecc71] py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#27ae60] disabled:opacity-60"
          >
            {saving ? '保存中…' : recordToEdit ? '保存修改' : '保存'}
          </button>
        </footer>
      </form>
    </div>
    <ProductPickerModal
      open={productPickerLineIdx !== null}
      onClose={() => setProductPickerLineIdx(null)}
      productCatalog={productCatalog}
      title={prodField?.name ? `选择${prodField.name}` : '选择商品'}
      onSelect={(name) => {
        if (productPickerLineIdx === null) return
        selectProductForLine(productPickerLineIdx, name)
      }}
    />
    <CustomerPickerModal
      open={buyerPickerOpen}
      onClose={() => setBuyerPickerOpen(false)}
      customerCatalog={customerCatalog}
      title={`选择${plateFieldName}`}
      fieldLabel={plateFieldName}
      onSelect={applyBuyerKey}
    />
    <CalendarPickerModal
      open={datePickerOpen}
      onClose={() => setDatePickerOpen(false)}
      value={recordDate}
      onChangeValue={setRecordDate}
      recordDates={recordDates}
      onConfirm={() => {}}
      confirmLabel="完成"
      overlayZClass="z-[100]"
    />
    </>
  )
}

function CalendarGlyph({ className }: { className?: string }) {
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
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ChevronDownGlyph({ className }: { className?: string }) {
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
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function CloseGlyph({ className }: { className?: string }) {
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
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}
