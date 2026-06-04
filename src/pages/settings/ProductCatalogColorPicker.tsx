import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  colorPresetByKey,
  defaultColorKeyForName,
  normalizeProductColorKey,
  PRODUCT_COLOR_COUNT,
  PRODUCT_COLOR_PRESETS,
} from '../../utils/productColors'

type Props = {
  productName: string
  colorKey?: number
  disabled?: boolean
  onChange: (colorKey: number) => void | Promise<void>
}

export function ProductCatalogColorPicker({
  productName,
  colorKey,
  disabled,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const resolved =
    normalizeProductColorKey(colorKey) ?? defaultColorKeyForName(productName)
  const current = colorPresetByKey(resolved)

  const pick = (key: number) => {
    void Promise.resolve(onChange(key)).then(() => setOpen(false))
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-kj-border-strong bg-kj-raised px-2 py-1 text-xs font-medium text-kj-secondary disabled:opacity-50"
        aria-label="选择商品颜色"
      >
        <span
          className="h-5 w-5 rounded-full border border-black/10 shadow-inner"
          style={{ backgroundColor: current.chart }}
          aria-hidden
        />
        颜色
      </button>

      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-4 sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-label="选择商品颜色"
            >
              <button
                type="button"
                className="absolute inset-0"
                aria-label="关闭"
                onClick={() => setOpen(false)}
              />
              <div className="relative z-10 w-full max-w-sm rounded-2xl border border-kj-border-strong bg-kj-surface p-4 shadow-xl">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-kj-primary">
                    商品颜色
                  </p>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="text-sm font-medium text-kj-secondary"
                  >
                    关闭
                  </button>
                </div>
                <p className="mb-3 text-xs leading-relaxed text-kj-muted">
                  用于小票、导出账单图片与统计图表，共 {PRODUCT_COLOR_COUNT}{' '}
                  种常用色。
                </p>
                <div className="grid grid-cols-6 gap-2">
                  {PRODUCT_COLOR_PRESETS.map((preset, i) => {
                    const active = i === resolved
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={disabled}
                        onClick={() => pick(i)}
                        className={`flex aspect-square items-center justify-center rounded-xl border-2 transition-transform active:scale-95 disabled:opacity-50 ${
                          active
                            ? 'border-[#008055] ring-2 ring-[#008055]/30'
                            : 'border-transparent hover:border-kj-border-strong'
                        }`}
                        aria-label={`颜色 ${i + 1}`}
                        aria-pressed={active}
                      >
                        <span
                          className="h-8 w-8 rounded-lg border border-black/10 shadow-sm"
                          style={{ backgroundColor: preset.chart }}
                        />
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
