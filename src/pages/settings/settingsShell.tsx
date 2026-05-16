import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** 设置页（含子页）统一背景 */
export const SETTINGS_SHELL_BG =
  'min-h-dvh bg-[#f0f0f3] pb-[calc(5.5rem+env(safe-area-inset-bottom))]'

export function SettingsMainHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <header className="px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <h1 className="text-[26px] font-bold tracking-tight text-stone-900">{title}</h1>
      {subtitle ? (
        <p className="mt-1 text-[13px] leading-relaxed text-stone-500">{subtitle}</p>
      ) : null}
    </header>
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
    <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-lg items-center gap-1 px-2 py-2.5 pt-[max(0.35rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-600 transition-colors hover:bg-stone-100 active:bg-stone-200"
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
        <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold text-stone-900">
          {title}
        </h1>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center">{right ?? null}</div>
      </div>
    </header>
  )
}

export function SettingsGroupLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 px-1 text-[13px] font-semibold text-stone-500">
      {children}
    </h2>
  )
}

export function SettingsInsetList({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200/70 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
      {children}
    </div>
  )
}

function rowBase(pressed: boolean) {
  return `flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${
    pressed ? 'active:bg-stone-50' : ''
  }`
}

export function SettingsNavRowButton({
  title,
  subtitle,
  onClick,
  first,
  last,
}: {
  title: string
  subtitle?: string
  onClick: () => void
  first?: boolean
  last?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${rowBase(true)} ${!first ? 'border-t border-stone-100' : ''} ${last ? 'rounded-b-2xl' : ''} ${first ? 'rounded-t-2xl' : ''}`}
    >
      <SettingsRowInner title={title} subtitle={subtitle} />
    </button>
  )
}

export function SettingsNavRowLink({
  title,
  subtitle,
  to,
  first,
  last,
}: {
  title: string
  subtitle?: string
  to: string
  first?: boolean
  last?: boolean
}) {
  return (
    <Link
      to={to}
      className={`${rowBase(true)} ${!first ? 'border-t border-stone-100' : ''} ${last ? 'rounded-b-2xl' : ''} ${first ? 'rounded-t-2xl' : ''}`}
    >
      <SettingsRowInner title={title} subtitle={subtitle} />
    </Link>
  )
}

function SettingsRowInner({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-medium text-stone-900">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-stone-500">{subtitle}</p>
        ) : null}
      </div>
      <Chevron />
    </>
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
  return <div className="mx-auto max-w-lg space-y-6 px-4 pb-8 pt-2">{children}</div>
}

export function SettingsPanelBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-lg space-y-5 px-4 pb-10 pt-3">{children}</div>
}
