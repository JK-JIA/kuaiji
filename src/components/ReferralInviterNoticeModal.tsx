import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useReferralNotices } from '../context/ReferralNoticesContext'

const POPUP_SEEN_SESSION_KEY = 'kuaiji_inviter_notice_popup_seen'

/** 下次打开 App 时，若有未读邀请通知则弹窗（本会话仅弹一次） */
export function ReferralInviterNoticeModal() {
  const { token } = useAuth()
  const { notices, unreadCount } = useReferralNotices()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!token || unreadCount === 0) {
      setOpen(false)
      return
    }
    try {
      if (sessionStorage.getItem(POPUP_SEEN_SESSION_KEY) === '1') return
    } catch {
      /* ignore */
    }
    setOpen(true)
  }, [token, unreadCount])

  const dismiss = () => {
    try {
      sessionStorage.setItem(POPUP_SEEN_SESSION_KEY, '1')
    } catch {
      /* ignore */
    }
    setOpen(false)
  }

  if (!open || notices.length === 0) return null

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 p-6 backdrop-blur-[2px]"
      role="presentation"
      onClick={dismiss}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="inviter-notice-title"
        className="w-full max-w-sm rounded-2xl bg-kj-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <span className="text-xl" aria-hidden>
            🎉
          </span>
        </div>
        <h2
          id="inviter-notice-title"
          className="text-base font-bold text-kj-primary"
        >
          邀请好消息
        </h2>
        <p className="mt-1 text-xs text-kj-muted">
          您有 {unreadCount} 条未读消息
        </p>
        <ul className="mt-4 max-h-[40vh] space-y-2 overflow-y-auto">
          {notices.map((n) => (
            <li
              key={n.id}
              className="rounded-xl bg-kj-bg px-3 py-2.5 text-sm leading-relaxed text-kj-primary"
            >
              {n.message}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-kj-muted">
          可在设置页右上角「通知」中随时查看
        </p>
        <button
          type="button"
          className="mt-4 w-full rounded-xl bg-[#2ecc71] py-2.5 text-sm font-semibold text-white"
          onClick={dismiss}
        >
          知道了
        </button>
      </div>
    </div>
  )
}
