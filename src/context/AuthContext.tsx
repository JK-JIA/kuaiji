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
  apiLogin,
  apiOneClickLogin,
  apiRegister,
  apiSmsLogin,
  cancelMembership,
  clearSession,
  fetchMe,
  getApiBase,
  getStoredEmail,
  getStoredMembershipExpires,
  getStoredToken,
  membershipActiveFromIso,
  persistSession,
  redeemMembership,
  sendSmsCode,
  setStoredMembershipExpires,
} from '../api/ledgerClient'

type AuthContextValue = {
  apiBase: string | undefined
  token: string | null
  email: string | null
  membershipExpiresAt: string | null
  /** 会员有效期内可使用云端账本 */
  membershipActive: boolean
  /** 已配置 API、已登录且会员有效 */
  useRemoteLedger: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  smsLogin: (phone: string, code: string) => Promise<void>
  oneClickLogin: (accessToken: string) => Promise<void>
  sendSms: (phone: string) => Promise<void>
  redeem: (code: string) => Promise<void>
  cancelMembership: () => Promise<void>
  refreshProfile: () => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const apiBase = getApiBase()
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const [email, setEmail] = useState<string | null>(() => getStoredEmail())
  const [membershipExpiresAt, setMembershipExpiresAt] = useState<
    string | null
  >(() => getStoredMembershipExpires())

  const membershipActive = membershipActiveFromIso(membershipExpiresAt)
  const useRemoteLedger = Boolean(apiBase && token && membershipActive)

  const applySession = useCallback(
    (
      t: string,
      em: string,
      mem: string | null | undefined,
      _phone?: string | null,
    ) => {
      persistSession(t, em, mem ?? null, _phone ?? null)
      setToken(t)
      setEmail(em)
      setMembershipExpiresAt(mem ?? null)
      setStoredMembershipExpires(mem ?? null)
    },
    [],
  )

  const refreshProfile = useCallback(async () => {
    if (!apiBase || !token) return
    const me = await fetchMe(apiBase, token)
    setMembershipExpiresAt(me.membershipExpiresAt)
    setStoredMembershipExpires(me.membershipExpiresAt)
    setEmail(me.email)
  }, [apiBase, token])

  useEffect(() => {
    if (!apiBase || !token) return
    void refreshProfile().catch(() => {
      /* 离线或令牌失效时保留本地缓存 */
    })
  }, [apiBase, token, refreshProfile])

  const login = useCallback(
    async (em: string, pw: string) => {
      if (!apiBase) throw new Error('未配置 VITE_API_URL')
      const r = await apiLogin(apiBase, em.trim(), pw)
      applySession(r.token, r.email, r.membershipExpiresAt, r.phone)
    },
    [apiBase, applySession],
  )

  const register = useCallback(
    async (em: string, pw: string) => {
      if (!apiBase) throw new Error('未配置 VITE_API_URL')
      const r = await apiRegister(apiBase, em.trim(), pw)
      applySession(r.token, r.email, r.membershipExpiresAt, r.phone)
    },
    [apiBase, applySession],
  )

  const smsLogin = useCallback(
    async (phone: string, code: string) => {
      if (!apiBase) throw new Error('未配置 VITE_API_URL')
      const r = await apiSmsLogin(apiBase, phone, code)
      applySession(r.token, r.email, r.membershipExpiresAt, r.phone)
    },
    [apiBase, applySession],
  )

  const oneClickLogin = useCallback(
    async (accessToken: string) => {
      if (!apiBase) throw new Error('未配置 VITE_API_URL')
      const r = await apiOneClickLogin(apiBase, accessToken)
      applySession(r.token, r.email, r.membershipExpiresAt, r.phone)
    },
    [apiBase, applySession],
  )

  const sendSms = useCallback(
    async (phone: string) => {
      if (!apiBase) throw new Error('未配置 VITE_API_URL')
      await sendSmsCode(apiBase, phone)
    },
    [apiBase],
  )

  const redeem = useCallback(
    async (code: string) => {
      if (!apiBase || !token) throw new Error('未登录')
      const me = await redeemMembership(apiBase, token, code)
      setMembershipExpiresAt(me.membershipExpiresAt)
      setStoredMembershipExpires(me.membershipExpiresAt)
    },
    [apiBase, token],
  )

  const cancelMembershipFn = useCallback(async () => {
    if (!apiBase || !token) throw new Error('未登录')
    const me = await cancelMembership(apiBase, token)
    setMembershipExpiresAt(me.membershipExpiresAt)
    setStoredMembershipExpires(me.membershipExpiresAt)
  }, [apiBase, token])

  const logout = useCallback(() => {
    clearSession()
    setToken(null)
    setEmail(null)
    setMembershipExpiresAt(null)
  }, [])

  const value = useMemo(
    () => ({
      apiBase,
      token,
      email,
      membershipExpiresAt,
      membershipActive,
      useRemoteLedger,
      login,
      register,
      smsLogin,
      oneClickLogin,
      sendSms,
      redeem,
      cancelMembership: cancelMembershipFn,
      refreshProfile,
      logout,
    }),
    [
      apiBase,
      token,
      email,
      membershipExpiresAt,
      membershipActive,
      useRemoteLedger,
      login,
      register,
      smsLogin,
      oneClickLogin,
      sendSms,
      redeem,
      cancelMembershipFn,
      refreshProfile,
      logout,
    ],
  )

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
