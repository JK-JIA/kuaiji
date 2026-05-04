import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import {
  apiLogin,
  apiRegister,
  clearSession,
  getApiBase,
  getStoredEmail,
  getStoredToken,
  persistSession,
} from '../api/ledgerClient'

type AuthContextValue = {
  /** 来自 VITE_API_URL，未配置则无云端 */
  apiBase: string | undefined
  token: string | null
  email: string | null
  /** 已配置 API 且已登录，账本读写走服务端 */
  useRemoteLedger: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const apiBase = getApiBase()
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const [email, setEmail] = useState<string | null>(() => getStoredEmail())

  const useRemoteLedger = Boolean(apiBase && token)

  const login = useCallback(
    async (em: string, pw: string) => {
      if (!apiBase) throw new Error('未配置 VITE_API_URL')
      const r = await apiLogin(apiBase, em.trim(), pw)
      persistSession(r.token, r.email)
      setToken(r.token)
      setEmail(r.email)
    },
    [apiBase],
  )

  const register = useCallback(
    async (em: string, pw: string) => {
      if (!apiBase) throw new Error('未配置 VITE_API_URL')
      const r = await apiRegister(apiBase, em.trim(), pw)
      persistSession(r.token, r.email)
      setToken(r.token)
      setEmail(r.email)
    },
    [apiBase],
  )

  const logout = useCallback(() => {
    clearSession()
    setToken(null)
    setEmail(null)
  }, [])

  const value = useMemo(
    () => ({
      apiBase,
      token,
      email,
      useRemoteLedger,
      login,
      register,
      logout,
    }),
    [apiBase, token, email, useRemoteLedger, login, register, logout],
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
