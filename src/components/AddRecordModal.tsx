import { format, parseISO } from 'date-fns'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FieldDef, LedgerRecord, LineItemRow } from '../types'
import { useLedger } from '../context/LedgerContext'
import {
  getAmountFieldId,
  parseMoney,
  parseNonNegativeMoney,
  sanitizeUnsignedDecimalInput,
} from '../utils/recordHelpers'
import { CalendarPickerModal } from './CalendarPickerModal'
import { VoiceInputSection } from './VoiceInputSection'

type LineForm = { id: string; product: string; quantity: string; lineAmount: string }

function formatMoneyInput(n: number): string {
  const r = Math.round(n * 100) / 100
  if (!Number.isFinite(r) || r <= 0) return ''
  return Number.isInteger(r) ? String(r) : r.toFixed(2)
}

/** 含任意空白（空格、换行、制表符等）则不允许保存 */
function hasWhitespace(s: string): boolean {
  return /\s/.test(s)
}

type Props = {
  open: boolean
  onClose: () => void
  fields: FieldDef[]
  onSave: (rec: LedgerRecord) => Promise<void>
  recordToEdit?: LedgerRecord | null
  recordDates?: Set<string>
}

export function AddRecordModal({
  open,
  onClose,
  fields,
  onSave,
  recordToEdit = null,
  recordDates,
}: Props) {
  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.order - b.order),
    [fields],
  )

  const prodField = sortedFields.find((f) => f.key === 'product')
  const qtyField = sortedFields.find((f) => f.key === 'quantity')
  const prodId = prodField?.id
  const qtyId = qtyField?.id

  const { records } = useLedger()

  /** 只保留一列「金额」输入，避免系统金额 + 自定义同名数字字段出现两个框 */
  const canonicalAmountId = useMemo(
    () => getAmountFieldId(sortedFields),
    [sortedFields],
  )
  const rootFieldIds = useMemo(
    () =>
      sortedFields
        .filter((f) => f.key !== 'product' && f.key !== 'quantity')
        .filter((f) => {
          if (!canonicalAmountId) return true
          if (f.id === canonicalAmountId) return true
          if (
            f.type === 'number' &&
            f.name.trim() === '金额' &&
            f.id !== canonicalAmountId
          )
            return false
          return true
        })
        .map((f) => f.id),
    [sortedFields, canonicalAmountId],
  )

  const showDetailAmounts = Boolean(
    prodField && qtyField && canonicalAmountId,
  )

  const rootFieldIdsForRender = useMemo(() => {
    if (!showDetailAmounts || !canonicalAmountId) return rootFieldIds
    return rootFieldIds.filter((id) => id !== canonicalAmountId)
  }, [rootFieldIds, showDetailAmounts, canonicalAmountId])

  const [recordDate, setRecordDate] = useState(() =>
    format(new Date(), 'yyyy-MM-dd'),
  )
  const [values, setValues] = useState<Record<string, string>>(() =>
    emptyFields(sortedFields),
  )
  const [lines, setLines] = useState<LineForm[]>([
    { id: crypto.randomUUID(), product: '', quantity: '', lineAmount: '' },
  ])
  const [dealInput, setDealInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  /** 校验失败文案（弹窗内展示；避免 WebView / 原生校验拦截导致无提示） */
  const [formError, setFormError] = useState<string | null>(null)

  const lineSubtotal = useMemo(
    () => lines.reduce((s, l) => s + parseMoney(l.lineAmount), 0),
    [lines],
  )

  const dealNum = useMemo(
    () => parseNonNegativeMoney(dealInput),
    [dealInput],
  )

  const discountShown = useMemo(() => {
    if (lineSubtotal <= 0 || dealNum <= 0) return 0
    const d = lineSubtotal - dealNum
    return d > 0.005 ? Math.round(d * 100) / 100 : 0
  }, [lineSubtotal, dealNum])

  const recentProductNames = useMemo(
    () => recentProductNamesFromRecords(records, prodId, 14),
    [records, prodId],
  )

  const dateCompactLabel = useMemo(() => {
    try {
      return format(parseISO(`${recordDate}T12:00:00`), 'M月d日')
    } catch {
      return recordDate
    }
  }, [recordDate])

  const applyRecentProduct = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setLines((prev) => {
      const emptyIdx = prev.findIndex((l) => !l.product.trim())
      if (emptyIdx >= 0) {
        return prev.map((row, i) =>
          i === emptyIdx ? { ...row, product: trimmed } : row,
        )
      }
      return prev.map((row, i) =>
        i === 0 ? { ...row, product: trimmed } : row,
      )
    })
  }, [])

  useEffect(() => {
    if (!open || !canonicalAmountId || !showDetailAmounts) return
    const sub = lines.reduce((s, l) => s + parseMoney(l.lineAmount), 0)
    const next = sub > 0 ? formatMoneyInput(sub) : ''
    setValues((v) =>
      v[canonicalAmountId] === next ? v : { ...v, [canonicalAmountId]: next },
    )
  }, [lines, open, canonicalAmountId, showDetailAmounts])

  useEffect(() => {
    if (open) setFormError(null)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (recordToEdit && prodId && qtyId) {
      setRecordDate(recordToEdit.date)
      setValues(rootValuesFromRecord(sortedFields, recordToEdit.values))
      const da = recordToEdit.dealAmount
      setDealInput(
        da !== undefined && !Number.isNaN(da) ? formatMoneyInput(da) : '',
      )
      if (recordToEdit.lineItems && recordToEdit.lineItems.length > 0) {
        setLines(
          recordToEdit.lineItems.map((li) => ({
            id: li.id,
            product: li.values[prodId] ?? '',
            quantity: li.values[qtyId] ?? '',
            lineAmount:
              canonicalAmountId && li.values[canonicalAmountId] !== undefined
                ? String(li.values[canonicalAmountId])
                : '',
          })),
        )
      } else {
        setLines([
          {
            id: crypto.randomUUID(),
            product: recordToEdit.values[prodId] ?? '',
            quantity: recordToEdit.values[qtyId] ?? '',
            lineAmount: '',
          },
        ])
      }
    } else {
      setRecordDate(format(new Date(), 'yyyy-MM-dd'))
      setValues(emptyFields(sortedFields))
      setDealInput('')
      setLines([
        { id: crypto.randomUUID(), product: '', quantity: '', lineAmount: '' },
      ])
    }
  }, [open, sortedFields, recordToEdit?.id, prodId, qtyId, canonicalAmountId])

  const validate = (): string | null => {
    const merged = buildMergedValues(values, lines, prodId, qtyId)
    if (!prodId || !qtyId) return '缺少商品或数量字段配置'

    for (const f of sortedFields) {
      if (f.key === 'product' || f.key === 'quantity') continue
      if (
        canonicalAmountId &&
        f.id !== canonicalAmountId &&
        f.type === 'number' &&
        f.name.trim() === '金额'
      ) {
        continue
      }
      if (!f.required) continue
      if (!(merged[f.id] ?? '').trim()) {
        return `请填写「${f.name}」`
      }
    }

    const hasAnyLine =
      lines.some((l) => l.product.trim()) ||
      lines.some((l) => l.quantity.trim())
    if (!hasAnyLine) return '请至少填写一行商品或数量'

    for (let i = 0; i < lines.length; i++) {
      const p = lines[i].product.trim()
      const q = lines[i].quantity.trim()
      if (!p && !q) continue
      if (prodField?.required && !p) {
        return `第 ${i + 1} 行：请填写「${prodField.name}」`
      }
      if (qtyField?.required && !q) {
        return `第 ${i + 1} 行：请填写「${qtyField.name}」`
      }
    }

    const spaceIssues: string[] = []
    for (const fid of rootFieldIdsForRender) {
      const f = sortedFields.find((x) => x.id === fid)
      if (!f) continue
      const raw = values[fid] ?? ''
      if (raw && hasWhitespace(raw)) {
        spaceIssues.push(`「${f.name}」中含空格或空白，请删去后再保存`)
      }
    }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const rowUsed =
        line.product.trim() ||
        line.quantity.trim() ||
        line.lineAmount.trim()
      if (!rowUsed) continue
      if (hasWhitespace(line.product)) {
        spaceIssues.push(
          `第 ${i + 1} 行「${prodField?.name ?? '商品'}」中含空格或空白，请删去后再保存`,
        )
      }
      if (hasWhitespace(line.quantity)) {
        spaceIssues.push(
          `第 ${i + 1} 行「${qtyField?.name ?? '数量'}」中含空格或空白，请删去后再保存`,
        )
      }
      if (
        showDetailAmounts &&
        canonicalAmountId &&
        line.lineAmount &&
        hasWhitespace(line.lineAmount)
      ) {
        spaceIssues.push(
          `第 ${i + 1} 行「金额」中含空格或空白，请删去后再保存`,
        )
      }
    }
    if (dealInput && hasWhitespace(dealInput)) {
      spaceIssues.push(
        '「总价（优惠后实收价）」中含空格或空白，请删去后再保存',
      )
    }
    if (spaceIssues.length > 0) {
      return spaceIssues.join('\n')
    }

    return null
  }

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
      const mergedValues = buildMergedValues(values, lines, prodId, qtyId)
      const live = recordToEdit
        ? records.find((r) => r.id === recordToEdit.id)
        : undefined

      const shouldPersistLineItems =
        lines.length > 1 ||
        Boolean(
          canonicalAmountId &&
            lines.some((l) => l.lineAmount.trim() !== ''),
        )

      let lineItems: LineItemRow[] | undefined
      if (shouldPersistLineItems) {
        lineItems = lines.map((l) => ({
          id: l.id,
          values: {
            [prodId]: l.product.trim(),
            [qtyId]: l.quantity.trim(),
            ...(canonicalAmountId
              ? { [canonicalAmountId]: l.lineAmount.trim() }
              : {}),
          },
        }))
      }

      const dealParsed = parseNonNegativeMoney(dealInput)
      const nextDeal: number | undefined =
        dealInput.trim() === '' ? undefined : dealParsed

      const rec: LedgerRecord = {
        id: recordToEdit?.id ?? crypto.randomUUID(),
        date: recordDate,
        createdAt: recordToEdit?.createdAt ?? Date.now(),
        values: mergedValues,
        lineItems,
        settled: (live?.settled ?? recordToEdit?.settled) === true,
        receivedAmount: live?.receivedAmount ?? recordToEdit?.receivedAmount,
        dealAmount: nextDeal,
      }
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
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), product: '', quantity: '', lineAmount: '' },
    ])
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
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-stone-200/90 bg-white shadow-xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-stone-100 bg-white px-4 pb-3 pt-4 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight text-neutral-900">
              {recordToEdit ? '编辑账单' : '记一笔'}
            </h2>
            {recordToEdit && (
              <p className="mt-1 text-xs text-[#999999]">
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#666666] hover:bg-stone-100"
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

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8f9fa] px-4 py-4 sm:px-5">
          <div className="mb-4 flex justify-start">
            <button
              type="button"
              onClick={() => setDatePickerOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-900 shadow-sm active:bg-stone-50"
              aria-label="选择记账日期"
            >
              <CalendarGlyph className="h-4 w-4 text-[#666666]" aria-hidden />
              <span>{dateCompactLabel}</span>
              <ChevronDownGlyph className="h-4 w-4 text-[#999999]" aria-hidden />
            </button>
          </div>
          <div className="mb-4">
            <VoiceInputSection
            fields={sortedFields}
            onApplyParsed={(data, productLines) => {
              setValues((v) => {
                const next = { ...v, ...data }
                for (const k of Object.keys(data)) {
                  const f = sortedFields.find((x) => x.id === k)
                  if (f?.type === 'number') {
                    next[k] = sanitizeUnsignedDecimalInput(
                      String(data[k] ?? ''),
                    )
                  } else if (data[k] !== undefined) {
                    next[k] = String(data[k])
                  }
                }
                return next
              })
              if (productLines?.length && prodId && qtyId) {
                setLines(
                  productLines.map((l) => ({
                    id: crypto.randomUUID(),
                    product: l.product,
                    quantity: sanitizeUnsignedDecimalInput(l.quantity),
                    lineAmount: sanitizeUnsignedDecimalInput(
                      l.lineAmount?.trim() ?? '',
                    ),
                  })),
                )
              }
            }}
            onFillFirstLine={(product, quantity) => {
              setLines((prev) =>
                prev.map((row, i) =>
                  i === 0
                    ? {
                        ...row,
                        product: product || row.product,
                        quantity:
                          quantity !== undefined && quantity !== ''
                            ? sanitizeUnsignedDecimalInput(quantity)
                            : row.quantity,
                      }
                    : row,
                ),
              )
            }}
            />
          </div>

          {rootFieldIdsForRender.length > 0 && (
            <div className="mt-4 space-y-3 rounded-2xl border border-stone-200/90 bg-white p-4 shadow-sm">
              {rootFieldIdsForRender.map((fid) => {
                const f = sortedFields.find((x) => x.id === fid)
                if (!f) return null
                return (
                  <label key={f.id} className="block text-left">
                    <span className="text-sm font-medium text-[#666666]">
                      {f.name}
                      {f.required && (
                        <span className="text-rose-500" aria-hidden>
                          *
                        </span>
                      )}
                    </span>
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
                      className="mt-1.5 w-full rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2.5 text-base text-neutral-900 placeholder:text-[#999999]"
                      placeholder={f.name}
                      autoComplete="off"
                      spellCheck={f.type === 'number' ? false : undefined}
                    />
                  </label>
                )
              })}
            </div>
          )}

          {prodField && qtyField && (
            <div className="mt-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-neutral-900">
                  商品明细
                </p>
                <button
                  type="button"
                  onClick={addLine}
                  className="text-sm font-semibold text-[#2ecc71] hover:text-[#27ae60]"
                >
                  + 一行
                </button>
              </div>
              {recentProductNames.length > 0 && (
                <div className="mb-3">
                  <p className="mb-2 text-xs font-medium text-[#666666]">
                    常用
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {recentProductNames.map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => applyRecentProduct(name)}
                        className="max-w-full truncate rounded-full border border-stone-200/90 bg-stone-100/90 px-3 py-1.5 text-xs font-medium text-neutral-800 active:bg-stone-200"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-2xl border border-stone-200/90 bg-white p-4 shadow-sm">
                {showDetailAmounts && canonicalAmountId && (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_2.5rem] gap-x-2 border-b border-stone-100 pb-2 text-[11px] font-medium text-[#666666]"
                  >
                    <span className="truncate">{prodField.name}</span>
                    <span className="text-center">{qtyField.name}</span>
                    <span className="text-right">金额</span>
                    <span aria-hidden className="w-2" />
                  </div>
                )}
                {!showDetailAmounts || !canonicalAmountId ? (
                  <div className="space-y-3 pt-2">
                    {lines.map((line, idx) => (
                      <div
                        key={line.id}
                        className="flex flex-wrap items-end gap-2 rounded-xl border border-stone-100 bg-[#fafafa] p-3"
                      >
                        <label className="min-w-[120px] flex-[2] text-left text-xs font-medium text-[#666666]">
                          {prodField.name}
                          {prodField.required && (
                            <span className="text-rose-500" aria-hidden>
                              *
                            </span>
                          )}
                          <input
                            value={line.product}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((row, i) =>
                                  i === idx
                                    ? { ...row, product: e.target.value }
                                    : row,
                                ),
                              )
                            }
                            className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-base text-neutral-900"
                            placeholder="商品名称"
                          />
                        </label>
                        <label className="w-[6.5rem] shrink-0 text-left text-xs font-medium text-[#666666]">
                          {qtyField.name}
                          {qtyField.required && (
                            <span className="text-rose-500" aria-hidden>
                              *
                            </span>
                          )}
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
                            className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-2 py-2.5 text-center text-base tabular-nums text-neutral-900"
                            placeholder={qtyField.name}
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </label>
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-[#999999] hover:bg-white hover:text-rose-600"
                          >
                            移除
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="divide-y divide-stone-100 pt-2">
                    {lines.map((line, idx) => (
                      <div
                        key={line.id}
                        className="grid grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_2.5rem] items-center gap-x-2 py-2.5 first:pt-0"
                      >
                        <input
                          value={line.product}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? { ...row, product: e.target.value }
                                  : row,
                              ),
                            )
                          }
                          className="min-w-0 rounded-xl border border-stone-200 bg-[#fafafa] px-2.5 py-2 text-sm text-neutral-900 placeholder:text-[#999999]"
                          placeholder="商品名称"
                          aria-label={prodField.name}
                        />
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
                          className="rounded-xl border border-stone-200 bg-[#fafafa] px-1.5 py-2 text-center text-sm tabular-nums text-neutral-900 placeholder:text-[#999999]"
                          placeholder="斤"
                          aria-label={qtyField.name}
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          value={line.lineAmount}
                          onChange={(e) => {
                            const a = sanitizeUnsignedDecimalInput(
                              e.target.value,
                            )
                            setLines((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, lineAmount: a } : row,
                              ),
                            )
                          }}
                          className="rounded-xl border border-stone-200 bg-[#fafafa] px-1.5 py-2 text-right text-sm font-semibold tabular-nums text-amber-900 placeholder:text-amber-900/50"
                          placeholder="0"
                          autoComplete="off"
                          aria-label="金额"
                          spellCheck={false}
                        />
                        <div className="flex justify-end">
                          {lines.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="rounded-lg p-1 text-xs text-[#999999] hover:bg-stone-100 hover:text-rose-600"
                              aria-label="移除此行"
                            >
                              ×
                            </button>
                          ) : (
                            <span className="w-4" aria-hidden />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {showDetailAmounts && canonicalAmountId && (
                  <>
                    <div className="mt-3 border-t border-stone-100 pt-2 text-right">
                      <div className="flex items-baseline justify-end gap-2">
                        <span className="text-xs leading-none text-neutral-900">
                          应收金额
                        </span>
                        <span className="text-xl font-bold tabular-nums leading-none text-neutral-900">
                          {lineSubtotal > 0
                            ? `¥${formatMoneyInput(lineSubtotal)}`
                            : '¥0'}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] leading-tight text-[#999999]">
                        由各行金额自动合计
                      </p>
                    </div>
                    <div className="mt-4 rounded-xl border border-stone-100 bg-[#f8f9fa] p-3">
                      <label className="block text-left">
                        <span className="text-sm font-medium text-neutral-900">
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
                          className="mt-1.5 block w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-base font-semibold tabular-nums text-neutral-900 placeholder:text-[10px] placeholder:font-normal placeholder:leading-snug placeholder:text-[#a3a3a3]"
                          placeholder="与应收不同填"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </label>
                      {discountShown > 0 && (
                        <p className="mt-2 text-base font-semibold text-[#2ecc71]">
                          已优惠 ¥{formatMoneyInput(discountShown)}
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

        <footer className="flex gap-3 border-t border-stone-100 bg-white px-4 py-4 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-stone-300 bg-white py-3 text-sm font-medium text-neutral-900 shadow-sm hover:bg-stone-50"
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

function recentProductNamesFromRecords(
  list: LedgerRecord[],
  prodFieldId: string | undefined,
  limit: number,
): string[] {
  if (!prodFieldId || limit <= 0) return []
  const freq = new Map<string, number>()
  const bump = (raw: string) => {
    const t = raw.trim()
    if (!t) return
    freq.set(t, (freq.get(t) ?? 0) + 1)
  }
  for (const r of list) {
    if (r.lineItems?.length) {
      for (const li of r.lineItems) bump(li.values[prodFieldId] ?? '')
    } else {
      bump(r.values[prodFieldId] ?? '')
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, limit)
    .map(([name]) => name)
}

function emptyFields(fields: FieldDef[]): Record<string, string> {
  const o: Record<string, string> = {}
  for (const f of fields) o[f.id] = ''
  return o
}

function rootValuesFromRecord(
  fields: FieldDef[],
  raw: Record<string, string>,
): Record<string, string> {
  const o = emptyFields(fields)
  for (const f of fields) {
    if (f.key === 'product' || f.key === 'quantity') continue
    if (raw[f.id] !== undefined) o[f.id] = raw[f.id]
  }
  return o
}

function buildMergedValues(
  values: Record<string, string>,
  lines: LineForm[],
  prodId: string | undefined,
  qtyId: string | undefined,
): Record<string, string> {
  const merged = { ...values }
  if (prodId && qtyId && lines[0]) {
    merged[prodId] = lines[0].product.trim()
    merged[qtyId] = lines[0].quantity.trim()
  }
  return merged
}

