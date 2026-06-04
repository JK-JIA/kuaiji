import { App } from '@capacitor/app'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isAppTutorialSeen } from '../utils/appTutorial'

const SESSION_DISMISS_KEY = 'kuaiji_welcome_offer_dismiss_session'

/** 设置页打开「升级专业版」弹层（含新用户免费领取） */
export const SETTINGS_OPEN_PRO_REDEEM_STATE = {
  openProRedeem: true,
} as const

function isSessionDismissed(): boolean {
  try {
    return sessionStorage.getItem(SESSION_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function setSessionDismissed() {
  try {
    sessionStorage.setItem(SESSION_DISMISS_KEY, '1')
  } catch {
    /* ignore */
  }
}

/** 已登录且未领取新用户会员时，启动后提示并可跳转领取 */
export function WelcomeOfferGate() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    apiBase,
    token,
    profileLoaded,
    welcomeMembershipClaimed,
  } = useAuth()
  const [open, setOpen] = useState(false)
  const sessionDismissedRef = useRef(isSessionDismissed())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const eligible = Boolean(
    apiBase &&
      token &&
      profileLoaded &&
      !welcomeMembershipClaimed &&
      !sessionDismissedRef.current &&
      location.pathname !== '/login' &&
      isAppTutorialSeen(),
  )

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const tryShow = useCallback(() => {
    if (!eligible) {
      setOpen(false)
      return
    }
    clearTimer()
    timerRef.current = setTimeout(() => {
      if (!sessionDismissedRef.current) setOpen(true)
    }, 1500)
  }, [eligible, clearTimer])

  useEffect(() => {
    tryShow()
    return clearTimer
  }, [tryShow, clearTimer])

  useEffect(() => {
    if (welcomeMembershipClaimed) setOpen(false)
  }, [welcomeMembershipClaimed])

  useEffect(() => {
    let handle: { remove: () => void } | undefined
    void App.addListener('resume', () => {
      if (!sessionDismissedRef.current) tryShow()
    }).then((h) => {
      handle = h
    })
    return () => {
      void handle?.remove()
    }
  }, [tryShow])

  const dismiss = () => {
    sessionDismissedRef.current = true
    setSessionDismissed()
    setOpen(false)
    clearTimer()
  }

  const goClaim = () => {
    setOpen(false)
    clearTimer()
    navigate('/settings', { state: SETTINGS_OPEN_PRO_REDEEM_STATE })
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[99] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-offer-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-amber-400/30 bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 p-5 shadow-xl">
        <p className="text-xs font-medium uppercase tracking-wide text-amber-400/90">
          新用户优惠
        </p>
        <h2
          id="welcome-offer-title"
          className="mt-1 text-lg font-semibold text-amber-100"
        >
          免费领取 1 个月专业版
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-300">
          登录用户可领取 1 个月专业版会员，含云端同步、语音记账等权益，每账号限领一次。
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="min-h-[44px] rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-stone-300 transition-colors hover:bg-white/5"
          >
            稍后
          </button>
          <button
            type="button"
            onClick={goClaim}
            className="kuaiji-pro-cta-btn min-h-[44px] px-4 py-2.5 text-sm font-semibold"
          >
            去领取
          </button>
        </div>
      </div>
    </div>
  )
}
