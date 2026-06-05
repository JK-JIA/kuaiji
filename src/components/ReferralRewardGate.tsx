import { useCallback, useEffect, useState } from 'react'
import { REFERRAL_INVITEE_TOAST_KEY } from '../api/ledgerClient'

/** 被邀请人首笔记账奖励提示 */
export function ReferralRewardGate() {
  const [inviteeToast, setInviteeToast] = useState<string | null>(null)

  const readInviteeToast = useCallback(() => {
    try {
      const msg = sessionStorage.getItem(REFERRAL_INVITEE_TOAST_KEY)
      if (msg) {
        setInviteeToast(msg)
        sessionStorage.removeItem(REFERRAL_INVITEE_TOAST_KEY)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    readInviteeToast()
    const onToast = () => readInviteeToast()
    window.addEventListener('kuaiji-referral-toast', onToast)
    return () => window.removeEventListener('kuaiji-referral-toast', onToast)
  }, [readInviteeToast])

  if (!inviteeToast) return null

  return (
    <div
      className="fixed inset-x-4 top-4 z-[200] mx-auto max-w-lg rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-lg dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
      role="status"
    >
      <div className="flex items-start justify-between gap-3">
        <p>{inviteeToast}</p>
        <button
          type="button"
          className="shrink-0 text-emerald-700 dark:text-emerald-300"
          onClick={() => setInviteeToast(null)}
        >
          知道了
        </button>
      </div>
    </div>
  )
}
