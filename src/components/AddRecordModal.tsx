import { format } from 'date-fns'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FieldDef, LedgerRecord, LineItemRow } from '../types'
import { useLedger } from '../context/LedgerContext'
import { mergeParsedIntoForm } from '../parser/nlParse'
import { getAmountFieldId } from '../utils/recordHelpers'
import { MonthCalendar } from './MonthCalendar'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { parseWithDoubao, isDoubaoConfigured } from '../utils/doubaoParser'

type LineForm = { id: string; product: string; quantity: string }

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

  const [recordDate, setRecordDate] = useState(() =>
    format(new Date(), 'yyyy-MM-dd'),
  )
  const [values, setValues] = useState<Record<string, string>>(() =>
    emptyFields(sortedFields),
  )
  const [lines, setLines] = useState<LineForm[]>([
    { id: crypto.randomUUID(), product: '', quantity: '' },
  ])
  const [rawSpeech, setRawSpeech] = useState('')
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)

  const getBaseForSpeech = useCallback(() => rawSpeech, [rawSpeech])
  const speech = useSpeechRecognition({
    getBaseText: getBaseForSpeech,
    onText: setRawSpeech,
  })

  useEffect(() => {
    if (!open) speech.abort()
  }, [open, speech.abort])

  useEffect(() => {
    if (!open) return
    if (recordToEdit && prodId && qtyId) {
      setRecordDate(recordToEdit.date)
      setValues(rootValuesFromRecord(sortedFields, recordToEdit.values))
      if (recordToEdit.lineItems && recordToEdit.lineItems.length > 0) {
        setLines(
          recordToEdit.lineItems.map((li) => ({
            id: li.id,
            product: li.values[prodId] ?? '',
            quantity: li.values[qtyId] ?? '',
          })),
        )
      } else {
        setLines([
          {
            id: crypto.randomUUID(),
            product: recordToEdit.values[prodId] ?? '',
            quantity: recordToEdit.values[qtyId] ?? '',
          },
        ])
      }
    } else {
      setRecordDate(format(new Date(), 'yyyy-MM-dd'))
      setValues(emptyFields(sortedFields))
      setLines([{ id: crypto.randomUUID(), product: '', quantity: '' }])
    }
    setRawSpeech('')
  }, [open, sortedFields, recordToEdit?.id, prodId, qtyId])

  const applyParse = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        alert('请输入内容')
        return
      }

      setParsing(true)
      try {
        const result = await parseWithDoubao(text, sortedFields)
        
        if (!result.success) {
          alert(result.error || '解析失败')
          return
        }

        const hasLines =
          result.productLines &&
          result.productLines.length > 0 &&
          result.productLines.some((r) => r.product.trim() || r.quantity.trim())
        const hasOther =
          result.data && Object.keys(result.data).some((k) => String(result.data![k] ?? '').trim())

        if (!hasLines && !hasOther) {
          alert('未能识别到有效信息，请重新输入')
          return
        }

        // 合并解析结果到表单（车牌、金额等）
        if (result.data && Object.keys(result.data).length > 0) {
          setValues((prev) => mergeParsedIntoForm(prev, result.data!))
        }

        // 多商品：一行一项；否则写入第一行
        if (prodId && qtyId) {
          if (result.productLines && result.productLines.length > 0) {
            setLines(
              result.productLines.map((row) => ({
                id: crypto.randomUUID(),
                product: row.product.trim(),
                quantity: row.quantity.trim(),
              })),
            )
          } else {
            setLines((prev) => {
              const first = prev[0] ?? {
                id: crypto.randomUUID(),
                product: '',
                quantity: '',
              }
              const rest = prev.slice(1)
              return [
                {
                  ...first,
                  product:
                    (result.data?.[prodId] &&
                      String(result.data[prodId]).trim()) ||
                    first.product,
                  quantity:
                    (result.data?.[qtyId] &&
                      String(result.data[qtyId]).trim()) ||
                    first.quantity,
                },
                ...rest,
              ]
            })
          }
        }

        // 清空输入框
        setRawSpeech('')
      } catch (error: any) {
        console.error('解析错误:', error)
        alert('解析失败: ' + (error.message || '未知错误'))
      } finally {
        setParsing(false)
      }
    },
    [sortedFields, prodId, qtyId],
  )

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
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = validate()
    if (err) {
      alert(err)
      return
    }
    if (!prodId || !qtyId) return

    setSaving(true)
    try {
      const mergedValues = buildMergedValues(values, lines, prodId, qtyId)
      const live = recordToEdit
        ? records.find((r) => r.id === recordToEdit.id)
        : undefined

      let lineItems: LineItemRow[] | undefined
      if (lines.length > 1) {
        lineItems = lines.map((l) => ({
          id: l.id,
          values: {
            [prodId]: l.product.trim(),
            [qtyId]: l.quantity.trim(),
          },
        }))
      }

      const rec: LedgerRecord = {
        id: recordToEdit?.id ?? crypto.randomUUID(),
        date: recordDate,
        createdAt: recordToEdit?.createdAt ?? Date.now(),
        values: mergedValues,
        lineItems,
        settled: (live?.settled ?? recordToEdit?.settled) === true,
        receivedAmount: live?.receivedAmount ?? recordToEdit?.receivedAmount,
      }
      await onSave(rec)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), product: '', quantity: '' },
    ])
  }

  const removeLine = (index: number) => {
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== index),
    )
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/20 sm:items-center">
      <div
        className="absolute inset-0"
        aria-hidden
        onClick={() => !saving && onClose()}
      />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-stone-200 bg-white shadow-xl sm:rounded-3xl"
      >
        <header className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">
              {recordToEdit ? '编辑账单' : '记一笔'}
            </h2>
            {recordToEdit && (
              <p className="mt-0.5 text-xs text-stone-400">
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
            className="rounded-lg px-3 py-1 text-sm text-stone-500 hover:bg-stone-50"
          >
            关闭
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4">
            <p className="mb-2 text-left text-sm font-medium text-stone-800">
              记账日期
            </p>
            <div className="rounded-2xl border border-stone-200 bg-stone-50/80 px-3 pb-3 pt-3">
              <MonthCalendar
                value={recordDate}
                onChange={setRecordDate}
                recordDates={recordDates}
                compact
                showQuickToday
              />
            </div>
          </div>

          <div className="mb-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <p className="mb-2 text-left text-sm font-medium text-stone-800">
              智能快速录入
            </p>
            <p className="mb-3 text-left text-xs text-stone-500">
              {isDoubaoConfigured()
                ? '可点「语音输入」说话，或手动输入后再「智能识别」。念车牌时尽量按字念清（如京、A、八、八、九、九），白薯/红薯等同音字已做常见纠错。'
                : '请先配置豆包 API Key 以使用智能解析功能。'}
            </p>
            <div className="space-y-2">
              <textarea
                value={rawSpeech}
                onChange={(e) => setRawSpeech(e.target.value)}
                placeholder="例如：今天卖了5斤苹果给川A12345，收了50块钱"
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 resize-none"
                rows={3}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    speech.listening ? speech.stop() : speech.start()
                  }
                  disabled={!speech.supported || parsing}
                  className={`flex-1 min-w-[8rem] rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                    speech.listening
                      ? 'border-rose-300 bg-rose-50 text-rose-800 ring-2 ring-rose-200'
                      : 'border-stone-200 bg-white text-stone-800 hover:bg-stone-50'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {speech.listening ? '结束说话' : '语音输入'}
                </button>
                <button
                  type="button"
                  onClick={() => applyParse(rawSpeech)}
                  disabled={!rawSpeech.trim() || parsing || !isDoubaoConfigured()}
                  className="flex-[2] min-w-[10rem] rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {parsing ? '智能识别中...' : '智能识别并填入'}
                </button>
              </div>
              {!speech.supported && (
                <p className="text-xs text-stone-400">
                  当前浏览器不支持网页语音识别，请改用键盘输入或手机输入法自带的语音。
                </p>
              )}
              {speech.error && (
                <p className="text-xs text-rose-600">{speech.error}</p>
              )}
            </div>
            {!isDoubaoConfigured() && (
              <p className="mt-2 text-xs text-amber-600">
                💡 提示：配置豆包 API Key 后可使用 AI 智能解析
              </p>
            )}
          </div>

          {rootFieldIds.map((fid) => {
            const f = sortedFields.find((x) => x.id === fid)
            if (!f) return null
            return (
              <label
                key={f.id}
                className="mb-3 block text-left text-sm text-stone-600"
              >
                {f.name}
                {f.required && (
                  <span className="text-rose-500" aria-hidden>
                    *
                  </span>
                )}
                <input
                  type={f.type === 'number' ? 'number' : 'text'}
                  inputMode={f.type === 'number' ? 'decimal' : 'text'}
                  value={values[f.id] ?? ''}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.id]: e.target.value }))
                  }
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900 placeholder:text-stone-400"
                  placeholder={`填写${f.name}`}
                  autoComplete="off"
                />
              </label>
            )
          })}

          {prodField && qtyField && (
            <div className="mb-2 mt-4 border-t border-stone-100 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-stone-800">
                  商品明细（同一车牌可添加多行）
                </p>
                <button
                  type="button"
                  onClick={addLine}
                  className="text-sm font-medium text-stone-700 underline decoration-stone-300 underline-offset-2"
                >
                  + 添加商品
                </button>
              </div>
              <div className="space-y-2">
                {lines.map((line, idx) => (
                  <div
                    key={line.id}
                    className="flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 bg-white p-2"
                  >
                    <label className="min-w-[120px] flex-1 text-left text-xs text-stone-600">
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
                        className="mt-0.5 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm text-stone-900"
                        placeholder={prodField.name}
                      />
                    </label>
                    <label className="min-w-[100px] flex-1 text-left text-xs text-stone-600">
                      {qtyField.name}
                      {qtyField.required && (
                        <span className="text-rose-500" aria-hidden>
                          *
                        </span>
                      )}
                      <input
                        type={
                          qtyField.type === 'number' ? 'number' : 'text'
                        }
                        inputMode={
                          qtyField.type === 'number' ? 'decimal' : 'text'
                        }
                        step={qtyField.type === 'number' ? 'any' : undefined}
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((prev) =>
                            prev.map((row, i) =>
                              i === idx
                                ? { ...row, quantity: e.target.value }
                                : row,
                            ),
                          )
                        }
                        className="mt-0.5 w-full rounded-lg border border-stone-200 px-2 py-1.5 text-sm text-stone-900"
                        placeholder={qtyField.name}
                      />
                    </label>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="mb-0.5 shrink-0 rounded-lg px-2 py-1 text-xs text-stone-400 hover:bg-stone-100 hover:text-rose-600"
                      >
                        移除
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="flex gap-3 border-t border-stone-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-stone-200 py-3 text-stone-700"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-stone-900 py-3 font-medium text-white disabled:opacity-60"
          >
            {saving ? '保存中…' : recordToEdit ? '保存修改' : '保存'}
          </button>
        </footer>
      </form>
    </div>
  )
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

