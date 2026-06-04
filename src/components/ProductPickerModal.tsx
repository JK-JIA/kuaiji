import { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom'
import type { ProductCatalogEntry } from '../types'

type Props = {
  open: boolean
  onClose: () => void
  onSelect: (name: string) => void
  productCatalog: ProductCatalogEntry[]
  title?: string
}

export function ProductPickerModal({
  open,
  onClose,
  onSelect,
  productCatalog,
  title = '选择商品',
}: Props) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const names = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const e of productCatalog) {
      const t = e.name.trim()
      if (!t || seen.has(t)) continue
      seen.add(t)
      out.push(t)
    }
    return out.sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [productCatalog])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return names
    return names.filter((n) => n.toLowerCase().includes(q))
  }, [names, query])

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
        aria-labelledby="product-picker-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-kj-border/80 px-4 py-3">
          <h2
            id="product-picker-title"
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

        <div className="shrink-0 border-b border-kj-border/60 px-4 py-2.5">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索商品"
            className="w-full rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-2.5 text-sm text-kj-primary placeholder:text-kj-muted"
            autoComplete="off"
          />
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-kj-muted">
              {names.length === 0
                ? '暂无商品，请先在设置中添加商品目录'
                : '没有匹配的商品'}
            </li>
          ) : (
            filtered.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(name)
                    setQuery('')
                    onClose()
                  }}
                  className="flex w-full items-center rounded-xl px-3 py-3 text-left text-base text-kj-primary active:bg-kj-hover hover:bg-kj-hover"
                >
                  {name}
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

export function ProductNamePickerField({
  value,
  placeholder = '请选择商品',
  onClick,
  className = '',
  'aria-label': ariaLabel,
}: FieldProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? '选择商品'}
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
