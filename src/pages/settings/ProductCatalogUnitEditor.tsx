import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ProductCatalogEntry, ProductUnitDef } from '../../types'
import { catalogEntryWithUnits } from '../../utils/productCatalogHelpers'
import { BASE_STAT_UNIT, normalizeProductUnits } from '../../utils/productUnits'

const CHIP_CLASS =
  'inline-flex shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-[#1a7f4c] dark:border-emerald-900/40 dark:bg-emerald-950/40'

type Props = {
  entry: ProductCatalogEntry
  disabled?: boolean
  onSave: (next: ProductCatalogEntry) => void | Promise<void>
  onOpenChange?: (open: boolean) => void
  /** 其它商品正在编辑时关闭本面板 */
  activeEditorId?: string | null
}

function draftFromEntry(entry: ProductCatalogEntry): ProductUnitDef[] {
  return normalizeProductUnits(entry.units, entry.unit).map((u) => ({ ...u }))
}

function isSimpleJinUnit(u: ProductUnitDef): boolean {
  return u.name.trim() === BASE_STAT_UNIT && u.factorToJin === 1
}

/** 除「斤」外：包（=50斤）；斤单独显示「斤」 */
export function formatUnitValueChipLabel(u: ProductUnitDef): string {
  if (isSimpleJinUnit(u)) return BASE_STAT_UNIT
  const name = u.name.trim() || '—'
  return `${name}（=${u.factorToJin}斤）`
}

function sortUnitsForDisplay(units: ProductUnitDef[]): ProductUnitDef[] {
  const normalized = normalizeProductUnits(units)
  const jin = normalized.find((u) => u.name.trim() === BASE_STAT_UNIT)
  const others = jin ? normalized.filter((u) => u !== jin) : normalized

  if (!jin) {
    const def = others.find((u) => u.isDefault) ?? others[0]
    const rest = others.filter((u) => u !== def)
    return def ? [def, ...rest] : rest
  }

  const def = others.find((u) => u.isDefault) ?? others[0]
  const rest = others.filter((u) => u !== def)
  return def ? [jin, def, ...rest] : [jin, ...others]
}

type UnitEditorModalProps = {
  entry: ProductCatalogEntry
  draft: ProductUnitDef[]
  disabled?: boolean
  onClose: () => void
  onDraftChange: (next: ProductUnitDef[]) => void
  onSave: () => void | Promise<void>
}

function UnitEditorModal({
  entry,
  draft,
  disabled,
  onClose,
  onDraftChange,
  onSave,
}: UnitEditorModalProps) {
  const setDefault = (index: number) => {
    onDraftChange(draft.map((row, j) => ({ ...row, isDefault: j === index })))
  }

  const updateName = (index: number, name: string) => {
    onDraftChange(draft.map((row, j) => (j === index ? { ...row, name } : row)))
  }

  const updateFactor = (index: number, raw: string) => {
    const v = parseFloat(raw.replace(/[^\d.]/g, ''))
    onDraftChange(
      draft.map((row, j) =>
        j === index
          ? {
              ...row,
              factorToJin: Number.isFinite(v) && v > 0 ? v : row.factorToJin,
            }
          : row,
      ),
    )
  }

  const addUnit = () => {
    onDraftChange([
      ...draft,
      { name: '', factorToJin: 1, isDefault: false },
    ])
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="absolute inset-0" aria-hidden onClick={onClose} />
      <div
        className="relative z-10 flex max-h-[min(88vh,640px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-kj-border-strong bg-kj-surface shadow-2xl sm:max-w-lg sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`unit-editor-title-${entry.id}`}
      >
        <div className="border-b border-kj-border px-5 py-4">
          <p
            id={`unit-editor-title-${entry.id}`}
            className="text-center text-base font-bold text-kj-primary"
          >
            {entry.name} · 计量单位
          </p>
          <p className="mt-1 text-center text-xs text-kj-muted">
            记账可选；统计按斤换算。选默认单位用于新账单。
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <ul className="space-y-2">
            {draft.map((u, i) => {
              const isJin = u.name.trim() === BASE_STAT_UNIT
              const unitLabel = u.name.trim()
              const nameEmpty = !unitLabel
              return (
                <li
                  key={`${entry.id}-unit-row-${i}`}
                  className="flex items-center gap-3 rounded-xl border border-kj-border bg-kj-raised px-3 py-3"
                >
                  <input
                    type="radio"
                    name={`default-${entry.id}`}
                    checked={Boolean(u.isDefault)}
                    onChange={() => setDefault(i)}
                    aria-label={
                      nameEmpty
                        ? '设为记账默认'
                        : `将 ${unitLabel} 设为记账默认`
                    }
                    className="h-4 w-4 shrink-0"
                  />
                  <input
                    value={u.name}
                    onChange={(e) => updateName(i, e.target.value)}
                    onCompositionEnd={(e) =>
                      updateName(i, e.currentTarget.value)
                    }
                    className="w-20 shrink-0 rounded-lg border border-kj-border-strong bg-kj-surface px-2 py-2 text-center text-base font-medium text-kj-primary"
                    placeholder="单位"
                    aria-label="单位名称"
                    autoComplete="off"
                  />
                  <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-kj-secondary">
                    {nameEmpty ? (
                      <span className="shrink-0 text-kj-muted">1单位=</span>
                    ) : (
                      <span className="shrink-0">1{unitLabel}=</span>
                    )}
                    {isJin ? (
                      <span className="font-medium text-kj-primary">1斤</span>
                    ) : (
                      <>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={String(u.factorToJin)}
                          onChange={(e) => updateFactor(i, e.target.value)}
                          className="w-16 rounded-lg border border-kj-border-strong bg-kj-surface px-2 py-2 text-center text-base tabular-nums text-kj-primary"
                          aria-label={
                            nameEmpty
                              ? '1单位等于多少斤'
                              : `1${unitLabel}等于多少斤`
                          }
                        />
                        <span className="shrink-0">斤</span>
                      </>
                    )}
                  </div>
                  {draft.length > 1 && !isJin ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-lg p-2 text-kj-muted hover:bg-rose-50 hover:text-rose-600"
                      onClick={() =>
                        onDraftChange(draft.filter((_, j) => j !== i))
                      }
                      aria-label="移除此单位"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  ) : (
                    <span className="w-9 shrink-0" aria-hidden />
                  )}
                </li>
              )
            })}
          </ul>

          <button
            type="button"
            className="mt-3 w-full rounded-xl border border-dashed border-kj-border-strong py-3 text-sm font-semibold text-[#1a7f4c] hover:bg-emerald-50/80"
            onClick={addUnit}
          >
            + 添加单位
          </button>
        </div>

        <div className="flex gap-3 border-t border-kj-border px-4 py-4">
          <button
            type="button"
            className="flex-1 rounded-xl border border-kj-border-strong py-3 text-base font-semibold text-kj-secondary hover:bg-kj-hover"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            disabled={disabled}
            className="flex-1 rounded-xl bg-[#2ecc71] py-3 text-base font-semibold text-white disabled:opacity-50"
            onClick={() => void onSave()}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

export function ProductCatalogUnitEditor({
  entry,
  disabled,
  onSave,
  onOpenChange,
  activeEditorId = null,
}: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ProductUnitDef[]>(() => draftFromEntry(entry))

  useEffect(() => {
    if (!open) setDraft(draftFromEntry(entry))
  }, [entry, open])

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  useEffect(() => {
    if (activeEditorId != null && activeEditorId !== entry.id && open) {
      setOpen(false)
    }
  }, [activeEditorId, entry.id, open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const setPanelOpen = (next: boolean) => {
    setOpen(next)
    if (!next) setDraft(draftFromEntry(entry))
  }

  const persist = async (units: ProductUnitDef[]) => {
    const normalized = normalizeProductUnits(units, entry.unit)
    await onSave(catalogEntryWithUnits(entry, normalized))
  }

  const displayUnits = sortUnitsForDisplay(
    normalizeProductUnits(entry.units, entry.unit),
  )

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {displayUnits.map((u, i) => (
            <span key={`${u.name}-${i}`} className={CHIP_CLASS}>
              {formatUnitValueChipLabel(u)}
            </span>
          ))}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPanelOpen(true)}
          className="ml-auto shrink-0 rounded-xl border border-kj-border-strong bg-kj-surface px-3 py-1.5 text-xs font-semibold text-kj-primary hover:bg-kj-hover disabled:opacity-50"
        >
          新增计量单位
        </button>
      </div>

      {open
        ? createPortal(
            <UnitEditorModal
              entry={entry}
              draft={draft}
              disabled={disabled}
              onClose={() => setPanelOpen(false)}
              onDraftChange={setDraft}
              onSave={async () => {
                await persist(draft)
                setPanelOpen(false)
              }}
            />,
            document.body,
          )
        : null}
    </>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  )
}
