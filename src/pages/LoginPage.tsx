import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getStoredPhone } from '../api/ledgerClient'
import { USER_AGREEMENT, PRIVACY_POLICY } from '../constants/legalTexts'

const inputCls =
  'w-full rounded-2xl border-0 bg-white/60 px-4 py-3.5 text-[15px] text-kj-primary shadow-inner ring-1 ring-white/40 transition-shadow placeholder:text-stone-400 focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 backdrop-blur-sm dark:bg-zinc-700/60 dark:text-white dark:placeholder:text-zinc-500 dark:ring-white/10 dark:focus:bg-zinc-700/80'

const primaryBtn =
  'w-full rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-emerald-500/30 transition-opacity hover:opacity-95 active:opacity-90 disabled:cursor-not-allowed disabled:opacity-45'

function LegalModal({ title, content, onClose }: { title: string; content: string; onClose: () => void }) {
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl dark:bg-zinc-900 sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-[16px] font-bold text-stone-800 dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition-colors hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-stone-600 dark:text-zinc-400">
            {content}
          </pre>
        </div>
        <div className="border-t border-stone-100 px-5 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-stone-100 py-3 text-[14px] font-semibold text-stone-700 transition-colors hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            我已阅读
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function LoginPage() {
  const { token, apiBase, login, smsLogin, sendSms, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [authMode, setAuthMode] = useState<'phone' | 'admin'>('phone')
  const [phone, setPhone] = useState(() => getStoredPhone() ?? '')
  const [smsCode, setSmsCode] = useState('')
  const [smsWaitSec, setSmsWaitSec] = useState(0)
  const [authEmail, setAuthEmail] = useState('')
  const [authPw, setAuthPw] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [legalModal, setLegalModal] = useState<'agreement' | 'privacy' | null>(null)

  useEffect(() => {
    if (token) navigate('/', { replace: true })
  }, [token, navigate])

  useEffect(() => {
    if (smsWaitSec <= 0) return
    const id = window.setTimeout(() => setSmsWaitSec((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [smsWaitSec])

  async function handleSendSms() {
    setAuthBusy(true)
    setErrorMsg('')
    try {
      await sendSms(phone)
      setSmsWaitSec(60)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '发送失败')
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleSmsLogin() {
    setAuthBusy(true)
    setErrorMsg('')
    try {
      await smsLogin(phone, smsCode.trim())
      setSmsCode('')
      await refreshProfile()
      navigate('/', { replace: true })
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '登录失败')
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleAdminLogin() {
    setAuthBusy(true)
    setErrorMsg('')
    try {
      await login(authEmail.trim(), authPw)
      setAuthPw('')
      await refreshProfile()
      navigate('/', { replace: true })
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '登录失败')
    } finally {
      setAuthBusy(false)
    }
  }

  if (!apiBase) return null

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950">
      {/* 背景装饰 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-500/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-teal-300/20 blur-3xl dark:bg-teal-500/10"
      />

      <div className="relative z-10 flex flex-1 flex-col justify-between px-6 pb-10 pt-16">
        {/* 品牌区 */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-xl shadow-emerald-500/30">
            <svg viewBox="0 0 48 48" fill="none" className="h-11 w-11" aria-hidden>
              <rect x="8" y="11" width="32" height="4.5" rx="2.25" fill="white" fillOpacity="0.95" />
              <rect x="8" y="21.5" width="22" height="4.5" rx="2.25" fill="white" fillOpacity="0.7" />
              <rect x="8" y="32" width="14" height="4.5" rx="2.25" fill="white" fillOpacity="0.45" />
              <circle cx="38" cy="35" r="7.5" fill="white" fillOpacity="0.95" />
              <path d="M35 35l2.2 2.2 4.3-4.3" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <h1 className="text-[38px] font-bold tracking-tight text-stone-800 dark:text-white">
            kuaiji
          </h1>
          <p className="mt-2 text-[17px] font-semibold text-emerald-600 dark:text-emerald-400">
            批发场景随时记
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-stone-400 dark:text-stone-500">
            语音记账 · 云端同步 · 一键对账
          </p>
        </div>

        {/* 登录卡片 */}
        <div className="rounded-3xl bg-white/75 p-6 shadow-2xl shadow-stone-200/80 ring-1 ring-white/80 backdrop-blur-md dark:bg-zinc-800/75 dark:shadow-black/40 dark:ring-white/10">
          {/* Tab */}
          <div
            className="mb-5 flex rounded-2xl bg-stone-100/80 p-1 dark:bg-zinc-700/60"
            role="tablist"
            aria-label="登录方式"
          >
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'phone'}
              onClick={() => { setAuthMode('phone'); setErrorMsg('') }}
              className={`flex-1 rounded-xl py-2.5 text-[14px] font-semibold transition-all ${
                authMode === 'phone'
                  ? 'bg-white text-stone-800 shadow-sm dark:bg-zinc-600 dark:text-white'
                  : 'text-stone-400 dark:text-stone-500'
              }`}
            >
              手机号登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'admin'}
              onClick={() => { setAuthMode('admin'); setErrorMsg('') }}
              className={`flex-1 rounded-xl py-2.5 text-[14px] font-semibold transition-all ${
                authMode === 'admin'
                  ? 'bg-white text-stone-800 shadow-sm dark:bg-zinc-600 dark:text-white'
                  : 'text-stone-400 dark:text-stone-500'
              }`}
            >
              管理员登录
            </button>
          </div>

          {authMode === 'phone' ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-stone-500 dark:text-zinc-400">
                  手机号
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="11 位中国大陆手机号"
                  className={inputCls}
                />
              </div>
              <div className="flex items-stretch gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value)}
                  placeholder="验证码"
                  className={`${inputCls} flex-1`}
                />
                <button
                  type="button"
                  disabled={authBusy || phone.replace(/\s/g, '').length < 11 || smsWaitSec > 0}
                  onClick={() => void handleSendSms()}
                  className="shrink-0 self-center rounded-2xl border border-stone-200/80 bg-white/80 px-4 py-3 text-[14px] font-semibold text-stone-700 transition-colors hover:bg-white disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-700/80 dark:text-zinc-200"
                >
                  {smsWaitSec > 0 ? `${smsWaitSec}s` : '获取验证码'}
                </button>
              </div>
              <button
                type="button"
                disabled={authBusy || phone.replace(/\s/g, '').length < 11 || smsCode.trim().length < 4}
                onClick={() => void handleSmsLogin()}
                className={primaryBtn}
              >
                {authBusy ? '登录中…' : '登录'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-stone-500 dark:text-zinc-400">
                  账号
                </label>
                <input
                  type="text"
                  autoComplete="username"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="用户名或邮箱"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-stone-500 dark:text-zinc-400">
                  密码
                </label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={authPw}
                  onChange={(e) => setAuthPw(e.target.value)}
                  placeholder="至少 6 位"
                  className={inputCls}
                />
              </div>
              <button
                type="button"
                disabled={authBusy || !authEmail.trim() || authPw.length < 6}
                onClick={() => void handleAdminLogin()}
                className={primaryBtn}
              >
                {authBusy ? '登录中…' : '登录'}
              </button>
            </div>
          )}

          {/* 错误提示 */}
          {errorMsg && (
            <p className="mt-3 text-center text-[13px] text-rose-500">{errorMsg}</p>
          )}
        </div>

        {/* 底部协议说明 */}
        <p className="mt-6 text-center text-[12px] leading-relaxed text-stone-400 dark:text-stone-600">
          登录即代表你同意{' '}
          <button
            type="button"
            onClick={() => setLegalModal('agreement')}
            className="text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-500"
          >
            《用户协议》
          </button>
          {' '}和{' '}
          <button
            type="button"
            onClick={() => setLegalModal('privacy')}
            className="text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-500"
          >
            《隐私政策》
          </button>
        </p>
      </div>

      {/* 协议弹窗 */}
      {legalModal === 'agreement' && (
        <LegalModal
          title="用户协议"
          content={USER_AGREEMENT}
          onClose={() => setLegalModal(null)}
        />
      )}
      {legalModal === 'privacy' && (
        <LegalModal
          title="隐私政策"
          content={PRIVACY_POLICY}
          onClose={() => setLegalModal(null)}
        />
      )}
    </div>
  )
}
