import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** 设置页（含子页）统一背景 */
export const SETTINGS_SHELL_BG = 'kuaiji-settings-shell'

export function SettingsMainHeader({
  title,
  right,
}: {
  title: string
  right?: ReactNode
}) {
  return (
    <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <h1 className="kuaiji-text-title text-[26px] tracking-tight">
        {title}
      </h1>
      {right ? <div className="flex shrink-0 items-center gap-1">{right}</div> : null}
    </header>
  )
}

export function SettingsHeaderIconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full text-kj-secondary transition-colors hover:bg-kj-hover active:bg-kj-surface"
    >
      {children}
    </button>
  )
}

export function SettingsSubHeader({
  title,
  onBack,
  right,
}: {
  title: string
  onBack: () => void
  right?: ReactNode
}) {
  return (
    <header className="kuaiji-sticky-header sticky top-0 z-20">
      <div className="mx-auto flex max-w-lg items-center gap-1 px-2 py-2.5 pt-[max(0.35rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-kj-secondary transition-colors hover:bg-kj-hover active:bg-kj-surface"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={2}
            stroke="currentColor"
            className="h-5 w-5"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="kuaiji-text-title min-w-0 flex-1 truncate text-center text-[17px] font-semibold">
          {title}
        </h1>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center">{right ?? null}</div>
      </div>
    </header>
  )
}

export function SettingsGroupLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 px-1 text-[13px] font-medium text-kj-secondary">
      {children}
    </h2>
  )
}

export function SettingsInsetList({ children }: { children: ReactNode }) {
  return (
    <div className="kuaiji-card overflow-hidden">
      {children}
    </div>
  )
}

function rowDivider(first?: boolean) {
  return !first ? 'border-t border-kj-border' : ''
}

function SettingsIconWrap({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-kj-raised text-kj-secondary">
      {children}
    </span>
  )
}

function SettingsRowContent({
  icon,
  title,
  subtitle,
  value,
}: {
  icon?: ReactNode
  title: string
  subtitle?: string
  value?: string
}) {
  return (
    <>
      {icon ? <SettingsIconWrap>{icon}</SettingsIconWrap> : null}
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-medium text-kj-primary">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-kj-secondary">
            {subtitle}
          </p>
        ) : null}
      </div>
      {value ? (
        <span className="max-w-[45%] shrink-0 truncate text-right text-[14px] text-kj-secondary">
          {value}
        </span>
      ) : null}
      <Chevron />
    </>
  )
}

export function SettingsNavRowButton({
  title,
  subtitle,
  value,
  icon,
  onClick,
  first,
}: {
  title: string
  subtitle?: string
  value?: string
  icon?: ReactNode
  onClick: () => void
  first?: boolean
  last?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-kj-hover ${rowDivider(first)}`}
    >
      <SettingsRowContent icon={icon} title={title} subtitle={subtitle} value={value} />
    </button>
  )
}

export function SettingsNavRowLink({
  title,
  subtitle,
  value,
  icon,
  to,
  first,
}: {
  title: string
  subtitle?: string
  value?: string
  icon?: ReactNode
  to: string
  first?: boolean
  last?: boolean
}) {
  return (
    <Link
      to={to}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-kj-hover ${rowDivider(first)}`}
    >
      <SettingsRowContent icon={icon} title={title} subtitle={subtitle} value={value} />
    </Link>
  )
}

function Chevron() {
  return (
    <span className="shrink-0 text-stone-300" aria-hidden>
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
  )
}

export function SettingsScrollBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-lg space-y-5 px-4 pb-8">{children}</div>
}

export function SettingsPanelBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-lg space-y-5 px-4 pb-10 pt-3">{children}</div>
}
