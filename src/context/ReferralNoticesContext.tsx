import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  ackReferralNotices,
  fetchReferralMe,
  REFERRAL_NOTICES_CHANGED_EVENT,
  type ReferralNotice,
} from '../api/ledgerClient'
import { useAuth } from './AuthContext'

type ReferralNoticesContextValue = {
  notices: ReferralNotice[]
  unreadCount: number
  loading: boolean
  refresh: () => Promise<void>
  ackIds: (ids: string[]) => Promise<void>
  ackAll: () => Promise<void>
}

const ReferralNoticesContext = createContext<ReferralNoticesContextValue | null>(
  null,
)

export function ReferralNoticesProvider({ children }: { children: ReactNode }) {
  const { apiBase, token } = useAuth()
  const [notices, setNotices] = useState<ReferralNotice[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!apiBase || !token) {
      setNotices([])
      return
    }
    setLoading(true)
    try {
      const me = await fetchReferralMe(apiBase, token)
      setNotices(me.notices ?? [])
      window.dispatchEvent(new Event(REFERRAL_NOTICES_CHANGED_EVENT))
    } catch {
      setNotices([])
    } finally {
      setLoading(false)
    }
  }, [apiBase, token])

  const ackIds = useCallback(
    async (ids: string[]) => {
      if (!apiBase || !token || !ids.length) return
      await ackReferralNotices(apiBase, token, ids)
      await refresh()
    },
    [apiBase, token, refresh],
  )

  const ackAll = useCallback(async () => {
    if (!notices.length) return
    await ackIds(notices.map((n) => n.id))
  }, [notices, ackIds])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onNoticesChanged = () => void refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(REFERRAL_NOTICES_CHANGED_EVENT, onNoticesChanged)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(REFERRAL_NOTICES_CHANGED_EVENT, onNoticesChanged)
    }
  }, [refresh])

  const value = useMemo(
    () => ({
      notices,
      unreadCount: notices.length,
      loading,
      refresh,
      ackIds,
      ackAll,
    }),
    [notices, loading, refresh, ackIds, ackAll],
  )

  return (
    <ReferralNoticesContext.Provider value={value}>
      {children}
    </ReferralNoticesContext.Provider>
  )
}

export function useReferralNotices(): ReferralNoticesContextValue {
  const ctx = useContext(ReferralNoticesContext)
  if (!ctx) {
    throw new Error('useReferralNotices must be used within ReferralNoticesProvider')
  }
  return ctx
}
