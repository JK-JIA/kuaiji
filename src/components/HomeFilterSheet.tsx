import type { HomeFilterState, ReconcileFilter } from '../utils/homeFilters'
import { countActiveFilters, defaultHomeFilter } from '../utils/homeFilters'

type Props = {
  open: boolean
  onClose: () => void
  value: HomeFilterState
  onChange: (next: HomeFilterState) => void
}

export function HomeFilterSheet({ open, onClose, value, onChange }: Props) {
  if (!open) return null

  const n = countActiveFilters(value)

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="关闭筛选"
        onClick={onClose}
      />
      <div
        className="relative max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-stone-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-xl"
        role="dialog"
        aria-modal
        aria-labelledby="home-filter-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="home-filter-title"
            className="text-base font-bold text-neutral-900"
          >
            筛选账单
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-medium text-[#2ecc71]"
          >
            完成
          </button>
        </div>

        <label className="mb-3 block">
          <span className="mb-1.5 block text-xs font-medium text-[#666666]">
            购买方（包含匹配）
          </span>
          <input
            value={value.plate}
            onChange={(e) => onChange({ ...value, plate: e.target.value })}
            placeholder="姓名、手机尾号、简称等"
            className="w-full rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2.5 text-sm text-neutral-900 placeholder:text-[#999999]"
          />
        </label>

        <label className="mb-3 block">
          <span className="mb-1.5 block text-xs font-medium text-[#666666]">
            商品（任一行包含）
          </span>
          <input
            value={value.product}
            onChange={(e) => onChange({ ...value, product: e.target.value })}
            placeholder="关键词"
            className="w-full rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2.5 text-sm text-neutral-900 placeholder:text-[#999999]"
          />
        </label>

        <fieldset className="mb-4">
          <legend className="mb-1.5 text-xs font-medium text-[#666666]">
            核账状态
          </legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['all', '全部'],
                ['settled', '已核清'],
                ['pending', '待核账'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() =>
                  onChange({ ...value, reconcile: k as ReconcileFilter })
                }
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  value.reconcile === k
                    ? 'bg-[#2ecc71] text-white'
                    : 'border border-stone-200 bg-stone-50 text-neutral-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          onClick={() => {
            onChange({ ...defaultHomeFilter })
          }}
          className="mb-2 w-full rounded-xl border border-stone-200 py-2.5 text-sm font-semibold text-[#666666]"
        >
          清除筛选{n > 0 ? `（${n} 项）` : ''}
        </button>
      </div>
    </div>
  )
}
