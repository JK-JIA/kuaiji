import { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom'
import type { CustomerEntry } from '../types'
import { customerBuyerToken } from '../utils/customerCatalogHelpers'

type Props = {
  open: boolean
  onClose: () => void
  onSelect: (buyerKey: string) => void
  customerCatalog: CustomerEntry[]
  title?: string
  fieldLabel?: string
}

export function CustomerPickerModal({
  open,
  onClose,
  onSelect,
  customerCatalog,
  title = '选择购买方',
  fieldLabel = '购买方',
}: Props) {
  const [manual, setManual] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) {
      setManual('')
      setQuery('')
    }
  }, [open])

  const catalogKeys = useMemo(() => {
    const seen = new Set<string>()
    const out: CustomerEntry[] = []
    for (const e of customerCatalog) {
      const k = customerBuyerToken(e)
      if (!k || seen.has(k)) continue
      seen.add(k)
      out.push(e)
    }
    return out.sort((a, b) =>
      a.buyerKey.localeCompare(b.buyerKey, 'zh-CN'),
    )
  }, [customerCatalog])

  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return catalogKeys
    return catalogKeys.filter((e) => {
      const hay = [e.buyerKey, e.name, e.contact, e.address]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [catalogKeys, query])

  const confirmManual = () => {
    const t = manual.trim()
    if (!t) return
    onSelect(t)
    setManual('')
    onClose()
  }

  if (!open) return null

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[110] flex flex-col justify-end bg-black/45 sm:items-center sm:justify-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="关闭"
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[min(85dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-kj-surface shadow-xl sm:rounded-2xl"
        role="dialog"
        aria-modal
        aria-labelledby="customer-picker-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-kj-border/80 px-4 py-3">
          <h2
            id="customer-picker-title"
            className="text-base font-bold text-kj-primary"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-kj-secondary"
          >
            取消
          </button>
        </div>

        <div className="shrink-0 space-y-2.5 border-b border-kj-border/60 px-4 py-3">
          <p className="text-xs font-medium text-kj-secondary">
            手动输入{fieldLabel}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder={`输入${fieldLabel}`}
              className="min-w-0 flex-1 rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-2.5 text-sm text-kj-primary placeholder:text-kj-muted"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  confirmManual()
                }
              }}
            />
            <button
              type="button"
              disabled={!manual.trim()}
              onClick={confirmManual}
              className="shrink-0 rounded-xl border border-[#2ecc71] bg-[#2ecc71] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              使用
            </button>
          </div>
        </div>

        <div className="shrink-0 border-b border-kj-border/60 px-4 py-2.5">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索已录入客户"
            className="w-full rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-2.5 text-sm text-kj-primary placeholder:text-kj-muted"
            autoComplete="off"
          />
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {filteredCatalog.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-kj-muted">
              {catalogKeys.length === 0
                ? '暂无客户，可在上方手动输入或在设置中添加'
                : '没有匹配的客户'}
            </li>
          ) : (
            filteredCatalog.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(entry.buyerKey)
                    onClose()
                  }}
                  className="flex w-full flex-col rounded-xl px-3 py-3 text-left active:bg-kj-hover hover:bg-kj-hover"
                >
                  <span className="text-base text-kj-primary">
                    {entry.buyerKey}
                  </span>
                  {(entry.name || entry.contact) && (
                    <span className="mt-0.5 truncate text-xs text-kj-muted">
                      {[entry.name, entry.contact].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>,
    document.body,
  )
}

type FieldProps = {
  value: string
  placeholder?: string
  onClick: () => void
  className?: string
  'aria-label'?: string
}

export function CustomerPickerField({
  value,
  placeholder = '请选择购买方',
  onClick,
  className = '',
  'aria-label': ariaLabel,
}: FieldProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? '选择购买方'}
      className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-kj-border-strong bg-kj-surface px-3 py-2.5 text-left text-base ${className}`}
    >
      <span
        className={`min-w-0 truncate ${value.trim() ? 'text-kj-primary' : 'text-kj-muted'}`}
      >
        {value.trim() || placeholder}
      </span>
      <ChevronDownGlyph className="h-4 w-4 shrink-0 text-kj-muted" />
    </button>
  )
}

function ChevronDownGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}
