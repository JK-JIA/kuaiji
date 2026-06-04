import type { ReactNode } from 'react'

/** 教程配图：用界面示意代替截图，风格与 App 一致 */

function MockPhone({
  children,
  compact,
}: {
  children: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={`mx-auto w-full overflow-hidden rounded-2xl border border-kj-border-strong bg-kj-bg shadow-md ${
        compact ? 'max-w-[220px]' : 'max-w-[280px]'
      }`}
    >
      {children}
    </div>
  )
}

function MockHeader({ title = 'kuaiji' }: { title?: string }) {
  return (
    <div className="border-b border-kj-border-strong/60 px-3 py-2">
      <p
        className="text-sm font-semibold italic text-transparent"
        style={{
          background: 'linear-gradient(120deg, #1a7f4c, #2ecc71)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
        }}
      >
        {title}
      </p>
    </div>
  )
}

function HighlightRing({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={`relative inline-flex ring-2 ring-[#2ecc71] ring-offset-2 ring-offset-kj-bg ${className ?? ''}`}
    >
      {children}
      <span
        className="pointer-events-none absolute -inset-1 animate-ping rounded-[inherit] bg-[#2ecc71]/20"
        aria-hidden
      />
    </span>
  )
}

function MockBottomBar({
  active,
  compact,
}: {
  active: 'home' | 'stats' | 'settings'
  compact?: boolean
}) {
  return (
    <div
      className={`flex border-t border-kj-border-strong ${compact ? 'text-[9px]' : 'text-[10px]'}`}
    >
      <span
        className={`flex-1 text-center ${compact ? 'py-1.5' : 'py-2'} ${active === 'home' ? 'font-medium text-kj-primary' : 'text-kj-muted'}`}
      >
        首页
      </span>
      <span
        className={`flex-1 text-center ${compact ? 'py-1.5' : 'py-2'} ${active === 'stats' ? 'font-medium text-kj-primary' : 'text-kj-muted'}`}
      >
        统计
      </span>
      <span
        className={`flex-1 text-center ${compact ? 'py-1.5' : 'py-2'} ${active === 'settings' ? 'font-medium text-kj-primary' : 'text-kj-muted'}`}
      >
        设置
      </span>
    </div>
  )
}

/** 首页：概况 + 记一笔（手动 / 语音 / 拍照） */
export function TutorialIllustHomeOverview() {
  return (
    <MockPhone>
      <MockHeader />
      <div className="space-y-2 p-3">
        <div className="rounded-xl border border-kj-border-strong bg-kj-surface p-2">
          <p className="text-[10px] text-kj-secondary">今日概况</p>
          <div className="mt-1 flex gap-4">
            <div>
              <p className="text-base font-bold text-kj-primary">3</p>
              <p className="text-[9px] text-kj-muted">今日笔数</p>
            </div>
            <div>
              <p className="text-base font-bold text-kj-primary">¥1,280</p>
              <p className="text-[9px] text-kj-muted">今日金额</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-dashed border-kj-border-strong px-2 py-2 text-center text-[10px] text-kj-muted">
          账单按日期分组
        </div>
      </div>
      <div className="border-t border-kj-border-strong bg-kj-bg px-3 py-3">
        <div className="flex justify-center gap-2">
          <HighlightRing className="rounded-full">
            <span className="flex min-w-[6.5rem] items-center justify-center gap-1 rounded-full bg-black px-3 py-2 text-[11px] font-semibold text-white">
              记一笔
              <span className="text-white/70">🎤</span>
            </span>
          </HighlightRing>
          <HighlightRing className="rounded-full">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 7h4l2-3h4l2 3h4v12H4V7z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
            </span>
          </HighlightRing>
        </div>
        <p className="mt-2 text-center text-[10px] leading-snug text-[#1a7f4c]">
          轻点手动 · 长按语音 · 旁侧相机拍照
        </p>
      </div>
    </MockPhone>
  )
}

export function TutorialIllustReconcile() {
  return (
    <MockPhone>
      <MockHeader />
      <div className="space-y-2 p-3">
        <div className="rounded-xl border border-kj-border-strong bg-kj-surface p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-kj-primary">王老板</p>
              <p className="mt-0.5 text-[10px] text-kj-muted">红薯 · 2 件</p>
            </div>
            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-800">
              未结清
            </span>
          </div>
          <p className="mt-2 text-sm font-bold text-kj-primary">¥368.20</p>
          <div className="mt-2 flex justify-end">
            <HighlightRing className="rounded-lg">
              <span className="rounded-lg bg-[#2ecc71] px-3 py-1 text-[10px] font-semibold text-white">
                核账
              </span>
            </HighlightRing>
          </div>
        </div>
      </div>
      <p className="pb-3 text-center text-[10px] text-[#1a7f4c]">点「核账」登记收款</p>
    </MockPhone>
  )
}

export function TutorialIllustSearch() {
  return (
    <MockPhone>
      <MockHeader />
      <div className="p-3">
        <HighlightRing className="block w-full rounded-2xl">
          <div className="flex items-center gap-2 rounded-2xl border border-kj-border-strong bg-kj-surface px-2 py-2">
            <span className="text-kj-muted">⌕</span>
            <span className="text-[11px] text-kj-primary">王老板</span>
            <span className="ml-auto rounded-lg bg-[#2ecc71] px-2 py-0.5 text-[10px] font-semibold text-white">
              搜索
            </span>
          </div>
        </HighlightRing>
        <div className="mt-2 flex gap-1.5">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] text-emerald-800">
            已结清
          </span>
          <span className="rounded-full border border-kj-border-strong px-2 py-0.5 text-[9px] text-kj-muted">
            未结清
          </span>
        </div>
      </div>
      <p className="pb-3 text-center text-[10px] text-[#1a7f4c]">搜关键词、筛日期</p>
    </MockPhone>
  )
}

function SettingsRow({
  title,
  highlight,
  compact,
}: {
  title: string
  highlight?: boolean
  compact?: boolean
}) {
  const row = (
    <div
      className={`flex items-center justify-between rounded-lg border text-kj-secondary ${
        compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-2 text-[11px]'
      } ${
        highlight
          ? 'border-[#2ecc71]/50 bg-[#2ecc71]/5 font-semibold text-kj-primary'
          : 'border-kj-border-strong/60 bg-kj-surface text-kj-secondary'
      }`}
    >
      <span>{title}</span>
      <span className="text-kj-muted">›</span>
    </div>
  )
  return highlight ? <HighlightRing className="block w-full">{row}</HighlightRing> : row
}

export function TutorialIllustProductCatalog() {
  return (
    <MockPhone compact>
      <div className="border-b border-kj-border-strong/60 px-2.5 py-1.5 text-center text-[11px] font-semibold text-kj-primary">
        设置
      </div>
      <div className="space-y-1 p-2">
        <SettingsRow title="导入导出" compact />
        <SettingsRow title="商品管理" highlight compact />
        <SettingsRow title="客户管理" compact />
      </div>
      <p className="px-2 pb-2 text-center text-[9px] text-[#1a7f4c]">
        先录入商品才能记账
      </p>
      <MockBottomBar active="settings" compact />
    </MockPhone>
  )
}

export function TutorialIllustCustomerCatalog() {
  return (
    <MockPhone compact>
      <div className="border-b border-kj-border-strong/60 px-2.5 py-1.5 text-center text-[11px] font-semibold text-kj-primary">
        设置
      </div>
      <div className="space-y-1 p-2">
        <SettingsRow title="商品管理" compact />
        <SettingsRow title="客户管理" highlight compact />
      </div>
      <div className="mx-2 mb-1.5 rounded-lg border border-kj-border-strong bg-kj-surface p-1.5 text-[9px]">
        <p className="font-semibold text-kj-primary">王老板</p>
        <p className="text-kj-muted">138****0000</p>
      </div>
      <p className="px-2 pb-2 text-center text-[9px] text-[#1a7f4c]">
        维护购买方
      </p>
      <MockBottomBar active="settings" compact />
    </MockPhone>
  )
}
