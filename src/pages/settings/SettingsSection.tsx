import type { ReactNode } from 'react'

/** 设置页内白卡片样式（与原先 section 一致） */
export const SETTINGS_CARD_CLASS =
  'rounded-2xl border border-kj-border-strong/80 bg-kj-surface p-4 shadow-sm'

type Props = {
  title: string
  description?: ReactNode
  children: ReactNode
}

/**
 * 设置页分区：统一标题与外边距，子元素一般为白卡片（使用 {@link SETTINGS_CARD_CLASS}）。
 */
export function SettingsSection({ title, description, children }: Props) {
  return (
    <section className="mx-4 mb-8">
      <h2 className="text-sm font-semibold text-kj-primary">{title}</h2>
      {description != null && description !== '' ? (
        <p className="mb-3 mt-1.5 text-xs leading-relaxed text-kj-secondary">
          {description}
        </p>
      ) : null}
      <div className="space-y-3">{children}</div>
    </section>
  )
}
