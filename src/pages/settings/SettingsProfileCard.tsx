type Props = {
  displayName: string
  avatarUrl: string | null
  accountLine: string
  recordCount: number
  membershipActive: boolean
  onOpenProfile: () => void
  onUpgradePro: () => void
  onViewBenefits: () => void
}

export function SettingsProfileCard({
  displayName,
  avatarUrl,
  accountLine,
  recordCount,
  membershipActive,
  onOpenProfile,
  onUpgradePro,
  onViewBenefits,
}: Props) {
  const initial = displayName.trim().charAt(0).toUpperCase() || 'K'

  return (
    <div className="overflow-hidden rounded-3xl bg-kj-surface shadow-[0_2px_16px_rgba(15,23,42,0.06)] ">
      <button
        type="button"
        onClick={onOpenProfile}
        className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors active:bg-stone-50 bg-kj-raised active:bg-kj-hover"
      >
        <span className="relative flex h-14 w-14 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 shadow-inner ring-2 ring-white">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xl font-bold text-white">
              {initial}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[18px] font-bold text-kj-primary">
              {displayName}
            </span>
            {membershipActive ? (
              <span className="kuaiji-pro-badge">Pro</span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-kj-secondary">
            {accountLine}
          </p>
        </div>
        <span className="shrink-0 text-kj-muted" aria-hidden>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={2}
            stroke="currentColor"
            className="h-5 w-5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </button>

      <div className="kuaiji-banner-pro mx-3 mb-3 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onUpgradePro}
            className="min-w-0 flex-1 text-left transition-opacity active:opacity-80"
          >
            <p className="kuaiji-banner-pro-title text-[15px] font-semibold">
              {membershipActive ? '专业版' : '升级专业版'}
            </p>
            <p className="mt-0.5 text-[12px] text-kj-muted">
              {membershipActive
                ? `已为您保存 ${recordCount} 条数据`
                : `本机已保存 ${recordCount} 条数据 · 开通可云同步`}
            </p>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onViewBenefits()
            }}
            className="kuaiji-pro-cta-btn"
          >
            查看权益
          </button>
        </div>
      </div>
    </div>
  )
}
