import { useReferralNotices } from '../context/ReferralNoticesContext'

type Props = {
  open: boolean
  onClose: () => void
}

function formatNoticeTime(iso: string | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const d = new Date(t)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function AppNotificationsSheet({ open, onClose }: Props) {
  const { notices, loading, ackAll } = useReferralNotices()

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-4 backdrop-blur-[2px] sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-notifications-title"
        className="relative flex max-h-[min(80dvh,520px)] w-full max-w-md flex-col rounded-2xl bg-kj-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full text-kj-muted hover:bg-kj-bg"
        >
          <span className="text-lg leading-none" aria-hidden>
            ×
          </span>
        </button>

        <div className="border-b border-kj-border/80 px-5 pb-3 pt-4 pr-10">
          <h2
            id="app-notifications-title"
            className="text-base font-bold text-kj-primary"
          >
            消息通知
          </h2>
          <p className="mt-1 text-xs text-kj-muted">邀请好友相关动态</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading && notices.length === 0 ? (
            <p className="py-8 text-center text-sm text-kj-muted">加载中…</p>
          ) : notices.length === 0 ? (
            <p className="py-8 text-center text-sm text-kj-muted">暂无消息</p>
          ) : (
            <ul className="space-y-2">
              {notices.map((n) => (
                <li
                  key={n.id}
                  className="rounded-xl border border-kj-border/80 bg-kj-bg px-3 py-3"
                >
                  <p className="text-sm leading-relaxed text-kj-primary">
                    {n.message}
                  </p>
                  {n.createdAt ? (
                    <p className="mt-1 text-[11px] text-kj-muted">
                      {formatNoticeTime(n.createdAt)}
                      {n.kind === 'registered'
                        ? ' · 好友注册'
                        : n.kind === 'completed'
                          ? ' · 邀请奖励'
                          : ''}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {notices.length > 0 ? (
          <div className="border-t border-kj-border/80 px-4 py-3">
            <button
              type="button"
              className="w-full rounded-xl bg-[#2ecc71] py-2.5 text-sm font-semibold text-white"
              onClick={() => {
                void ackAll().then(onClose)
              }}
            >
              全部标为已读
            </button>
          </div>
        ) : (
          <div className="px-4 pb-4">
            <button
              type="button"
              className="w-full rounded-xl border border-kj-border-strong py-2.5 text-sm font-semibold text-kj-secondary"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
