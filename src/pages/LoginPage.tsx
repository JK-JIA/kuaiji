import { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchApiHealth, getStoredPhone } from '../api/ledgerClient'
import { CtAccountLegalMenuModal } from '../components/CtAccountLegalMenuModal'
import {
  CT_ACCOUNT_PRIVACY_POLICY,
  CT_ACCOUNT_SERVICE_AGREEMENT,
} from '../constants/ctAccountLegalTexts'
import { PRIVACY_POLICY, USER_AGREEMENT } from '../constants/legalTexts'
import { isNumberAuthNative, NumberAuth } from '../plugins/numberAuth'

/** 展示用脱敏：前三位 + **** + 后四位，如 191****7776 */
function maskPhoneDisplay(phone: string): string {
  const s = phone.replace(/\s/g, '')
  const digits = s.replace(/\D/g, '')
  if (/^1\d{10}$/.test(digits)) {
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`
  }
  const masked = s.match(/^(\d{3})\*+(\d{4})$/)
  if (masked) return `${masked[1]}****${masked[2]}`
  return ''
}

function applyMaskFromNative(
  raw: string | undefined,
  setMaskedPhone: (v: string) => void,
) {
  if (!raw) return
  const shown = maskPhoneDisplay(raw) || raw
  if (shown) setMaskedPhone(shown)
}

const inputCls =
  'w-full rounded-xl border-0 bg-white/60 px-3.5 py-3 text-[14px] text-kj-primary shadow-inner ring-1 ring-white/40 transition-shadow placeholder:text-stone-400 focus:bg-white/80 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 backdrop-blur-sm dark:bg-zinc-700/60 dark:text-white dark:placeholder:text-zinc-500 dark:ring-white/10 dark:focus:bg-zinc-700/80'

const primaryBtn =
  'w-full rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-emerald-500/30 transition-opacity hover:opacity-95 active:opacity-90 disabled:cursor-not-allowed disabled:opacity-45'

function LegalModal({
  title,
  content,
  onClose,
}: {
  title: string
  content: string
  onClose: () => void
}) {
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

/** 本机号码一键登录面板（Android App 可用；浏览器仅展示样式并引导短信） */
function OneClickLoginPanel({
  busy,
  phoneLoading,
  sdkReady,
  nativeAvailable,
  serverOneClickReady,
  oneClickReady,
  displayPhone,
  carrierHint,
  onLogin,
  onEditPhone,
  onSmsFallback,
  onOpenLegal,
}: {
  busy: boolean
  phoneLoading: boolean
  sdkReady: boolean
  oneClickReady: boolean
  nativeAvailable: boolean
  serverOneClickReady: boolean
  displayPhone: string
  carrierHint: string
  onLogin: () => void
  onEditPhone: () => void
  onSmsFallback: () => void
  onOpenLegal: (key: 'agreement' | 'privacy' | 'numberAuth') => void
}) {
  const btnDisabled =
    busy ||
    (nativeAvailable && !sdkReady) ||
    (nativeAvailable && !oneClickReady) ||
    (nativeAvailable && !serverOneClickReady)

  return (
    <div className="flex flex-col py-2">
      <div className="mb-6 w-full text-center">
        <div className="flex w-full justify-center">
          <span className="relative inline-block">
            <span className="block font-mono text-[22px] font-semibold tabular-nums tracking-wide text-stone-900 dark:text-white">
              {displayPhone || (phoneLoading ? '······' : (oneClickReady ? '本机号码' : '未获取到号码'))}
            </span>
            {displayPhone && !phoneLoading ? (
              <button
                type="button"
                onClick={onEditPhone}
                aria-label="更换手机号"
                className="absolute top-1/2 left-full ml-1.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-emerald-600 dark:hover:bg-zinc-700 dark:hover:text-emerald-400"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
                  <path
                    d="M16.862 3.487a2.1 2.1 0 0 1 2.97 2.97L7.5 18.79l-4.01 1.004 1.004-4.01 12.368-12.297Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M14.5 6.5l3 3"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : null}
          </span>
        </div>
        {carrierHint ? (
          <p className="mt-2 text-[12px] text-stone-400 dark:text-zinc-500">{carrierHint}</p>
        ) : phoneLoading ? (
          <p className="mt-2 text-[12px] text-stone-400 dark:text-zinc-500">正在识别本机号码…</p>
        ) : null}
        {nativeAvailable && !serverOneClickReady ? (
          <p className="mt-2 text-[12px] text-amber-600 dark:text-amber-400">
            服务端需更新后才可使用一键登录，请先用短信验证码登录
          </p>
        ) : null}
      </div>

      <button
        type="button"
        disabled={btnDisabled}
        onClick={onLogin}
        className={primaryBtn}
      >
        {busy ? '登录中…' : '本机号码一键登录'}
      </button>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-stone-500 dark:text-zinc-400">
        登录即表示同意
        <button
          type="button"
          onClick={() => onOpenLegal('numberAuth')}
          className="text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400"
        >
          《天翼账号认证服务条款》
        </button>
        、
        <button
          type="button"
          onClick={() => onOpenLegal('agreement')}
          className="text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400"
        >
          《用户协议》
        </button>
        和
        <button
          type="button"
          onClick={() => onOpenLegal('privacy')}
          className="text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400"
        >
          《隐私政策》
        </button>
      </p>

      <button
        type="button"
        className="mt-5 w-full py-2 text-center text-[13px] text-stone-500 transition-colors hover:text-emerald-600 dark:text-zinc-400 dark:hover:text-emerald-400"
        onClick={onSmsFallback}
      >
        使用短信验证码登录
      </button>
    </div>
  )
}

function AdminLoginLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="mt-3 w-full text-center text-[12px] text-stone-400 hover:text-stone-600 dark:text-zinc-500 dark:hover:text-zinc-300"
      onClick={onClick}
    >
      管理员登录
    </button>
  )
}

export function LoginPage() {
  const {
    token,
    apiBase,
    login,
    smsLogin,
    oneClickLogin,
    sendSms,
    refreshProfile,
  } = useAuth()
  const navigate = useNavigate()

  const nativeOneClick = isNumberAuthNative()
  const storedPhone = getStoredPhone() ?? ''

  const [authMode, setAuthMode] = useState<'phone' | 'admin'>('phone')
  const [phone, setPhone] = useState(storedPhone)
  const [smsCode, setSmsCode] = useState('')
  const [smsWaitSec, setSmsWaitSec] = useState(0)
  const [authEmail, setAuthEmail] = useState('')
  const [authPw, setAuthPw] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [legalModal, setLegalModal] = useState<
    'agreement' | 'privacy' | 'numberAuth' | 'ctService' | 'ctPrivacy' | null
  >(null)
  const [showSmsFallback, setShowSmsFallback] = useState(false)
  const [oneClickReady, setOneClickReady] = useState(!nativeOneClick)
  const [sdkReady, setSdkReady] = useState(!nativeOneClick)
  const [phoneLoading, setPhoneLoading] = useState(nativeOneClick)
  const [carrierHint, setCarrierHint] = useState('')
  const [maskedPhone, setMaskedPhone] = useState('')
  const [serverOneClick, setServerOneClick] = useState(true)
  const displayPhone =
    maskedPhone ||
    (storedPhone ? maskPhoneDisplay(storedPhone) : '') ||
    ''

  useEffect(() => {
    if (token) navigate('/', { replace: true })
  }, [token, navigate])

  useEffect(() => {
    if (smsWaitSec <= 0) return
    const id = window.setTimeout(() => setSmsWaitSec((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [smsWaitSec])

  useEffect(() => {
    if (!apiBase) return
    let cancelled = false
    void fetchApiHealth(apiBase).then((h) => {
      if (!cancelled) setServerOneClick(h.oneClickLogin === true)
    })
    return () => {
      cancelled = true
    }
  }, [apiBase])

  useEffect(() => {
    if (!nativeOneClick) return
    let cancelled = false
    let maskListener: { remove: () => void } | null = null

    void NumberAuth.addListener('maskPhoneUpdate', (data) => {
      if (cancelled) return
      applyMaskFromNative(data.maskedPhone, setMaskedPhone)
      if (data.carrierHint) setCarrierHint(data.carrierHint)
      setPhoneLoading(false)
    }).then((h) => {
      maskListener = h
    })

    void NumberAuth.getCachedMask()
      .then((cached) => {
        if (cancelled) return
        applyMaskFromNative(cached.maskedPhone, setMaskedPhone)
        if (cached.carrierHint) setCarrierHint(cached.carrierHint)
        if (cached.maskedPhone) setPhoneLoading(false)
      })
      .catch(() => {})

    ;(async () => {
      setPhoneLoading(true)
      setErrorMsg('')
      try {
        const healthP =
          apiBase != null
            ? fetchApiHealth(apiBase)
            : Promise.resolve({ oneClickLogin: true as boolean })

        const [h] = await Promise.all([
          healthP.catch(() => ({ oneClickLogin: false as boolean })),
          NumberAuth.initialize(),
        ])
        if (cancelled) return
        if (apiBase) {
          setServerOneClick(h.oneClickLogin === true)
          if (!h.oneClickLogin) {
            setOneClickReady(false)
            setSdkReady(true)
            setPhoneLoading(false)
            return
          }
        }
        setSdkReady(true)

        const pre = await NumberAuth.preLogin()
        if (cancelled) return
        setOneClickReady(pre.available)
        setCarrierHint(pre.carrierHint || pre.carrier || '')
        applyMaskFromNative(pre.maskedPhone, setMaskedPhone)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) {
          setOneClickReady(false)
          setSdkReady(true)
          setShowSmsFallback(true)
          setErrorMsg(msg || '一键登录环境不可用，请用短信登录')
        }
      } finally {
        if (!cancelled) setPhoneLoading(false)
      }
    })()

    return () => {
      cancelled = true
      maskListener?.remove()
    }
  }, [nativeOneClick, apiBase])

  function handleEditPhone() {
    setShowSmsFallback(true)
    setErrorMsg('')
  }

  async function finishLogin() {
    navigate('/', { replace: true })
    try {
      await refreshProfile()
    } catch {
      /* 进入首页后再同步资料，避免登录后黑屏等待 */
    }
  }

  async function handleOneClickLogin() {
    if (!nativeOneClick) {
      setErrorMsg('')
      setShowSmsFallback(true)
      return
    }
    if (!serverOneClick) {
      setErrorMsg(
        '服务端尚未开通一键登录，请在服务器更新 API 后重试，或改用短信验证码登录',
      )
      setShowSmsFallback(true)
      return
    }
    setAuthBusy(true)
    setErrorMsg('')
    try {
      let accessToken: string
      try {
        ;({ accessToken } = await NumberAuth.loginSilent())
      } catch {
        ;({ accessToken } = await NumberAuth.login())
      }
      await oneClickLogin(accessToken)
      await finishLogin()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '一键登录失败'
      if (msg.includes('USER_CANCEL')) {
        setErrorMsg('')
      } else {
        setErrorMsg(msg)
        setShowSmsFallback(true)
      }
    } finally {
      setAuthBusy(false)
    }
  }

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
      await finishLogin()
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
      await finishLogin()
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '登录失败')
    } finally {
      setAuthBusy(false)
    }
  }

  if (!apiBase) return null

  const showOneClickPanel = authMode === 'phone' && !showSmsFallback

  const carrierHintDisplay = nativeOneClick
    ? carrierHint
    : '网页版请使用短信验证码登录'

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden overflow-y-auto bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-500/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-teal-300/20 blur-3xl dark:bg-teal-500/10"
      />

      <div className="relative z-10 mx-auto flex w-[92%] max-w-[520px] flex-1 flex-col justify-center px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(2.75rem,calc(env(safe-area-inset-top,0px)+1.25rem))] sm:w-[90%]">
        <div className="mb-5 flex flex-col items-center text-center">
          <img
            src="/app-icon.png"
            alt=""
            className="mb-3 h-16 w-16 rounded-[22px] object-cover shadow-lg shadow-emerald-500/25"
            width={64}
            height={64}
          />
          <h1 className="text-[30px] font-bold tracking-tight text-stone-800 dark:text-white">
            kuaiji
          </h1>
          <p className="mt-1.5 text-[15px] font-semibold text-emerald-600 dark:text-emerald-400">
            批发场景随时记
          </p>
          {!showOneClickPanel ? (
            <p className="mt-1 text-[12px] text-stone-400 dark:text-stone-500">
              语音记账 · 云端同步 · 一键对账
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl bg-white/80 p-5 shadow-xl shadow-stone-200/70 ring-1 ring-white/80 backdrop-blur-md dark:bg-zinc-800/80 dark:shadow-black/40 dark:ring-white/10">
          {!showOneClickPanel ? (
            <div
              className="mb-4 flex rounded-xl bg-stone-100/80 p-1 dark:bg-zinc-700/60"
              role="tablist"
              aria-label="登录方式"
            >
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'phone'}
                onClick={() => {
                  setAuthMode('phone')
                  setErrorMsg('')
                }}
                className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-all ${
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
                onClick={() => {
                  setAuthMode('admin')
                  setErrorMsg('')
                }}
                className={`flex-1 rounded-lg py-2 text-[13px] font-semibold transition-all ${
                  authMode === 'admin'
                    ? 'bg-white text-stone-800 shadow-sm dark:bg-zinc-600 dark:text-white'
                    : 'text-stone-400 dark:text-stone-500'
                }`}
              >
                管理员登录
              </button>
            </div>
          ) : null}

          {authMode === 'phone' ? (
            showOneClickPanel ? (
              <>
                <OneClickLoginPanel
                  busy={authBusy}
                  phoneLoading={nativeOneClick && phoneLoading && !displayPhone}
                  sdkReady={sdkReady}
                  oneClickReady={oneClickReady}
                  nativeAvailable={nativeOneClick}
                  displayPhone={displayPhone}
                  carrierHint={carrierHintDisplay}
                  onLogin={() => void handleOneClickLogin()}
                  onEditPhone={handleEditPhone}
                  onSmsFallback={() => {
                    setShowSmsFallback(true)
                    setErrorMsg('')
                  }}
                  serverOneClickReady={serverOneClick}
                  onOpenLegal={setLegalModal}
                />
                <AdminLoginLink
                  onClick={() => {
                    setAuthMode('admin')
                    setErrorMsg('')
                  }}
                />
              </>
            ) : (
              <div className="space-y-2.5">
                <button
                  type="button"
                  className="mb-1 w-full text-center text-[13px] font-medium text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400"
                  onClick={() => {
                    setShowSmsFallback(false)
                    setErrorMsg('')
                  }}
                >
                  ← 返回本机号码一键登录
                </button>
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-stone-500 dark:text-zinc-400">
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
                    disabled={
                      authBusy || phone.replace(/\s/g, '').length < 11 || smsWaitSec > 0
                    }
                    onClick={() => void handleSendSms()}
                    className="shrink-0 self-center rounded-xl border border-stone-200/80 bg-white/80 px-3 py-3 text-[13px] font-semibold text-stone-700 transition-colors hover:bg-white disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-700/80 dark:text-zinc-200"
                  >
                    {smsWaitSec > 0 ? `${smsWaitSec}s` : '获取验证码'}
                  </button>
                </div>
                <button
                  type="button"
                  disabled={
                    authBusy ||
                    phone.replace(/\s/g, '').length < 11 ||
                    smsCode.trim().length < 4
                  }
                  onClick={() => void handleSmsLogin()}
                  className={primaryBtn}
                >
                  {authBusy ? '登录中…' : '登录'}
                </button>
              </div>
            )
          ) : (
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-stone-500 dark:text-zinc-400">
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
                <label className="mb-1 block text-[12px] font-medium text-stone-500 dark:text-zinc-400">
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

          {errorMsg ? (
            <p className="mt-3 text-center text-[13px] text-rose-500">{errorMsg}</p>
          ) : null}
        </div>

        {!showOneClickPanel ? (
          <p className="mt-4 shrink-0 text-center text-[11px] leading-relaxed text-stone-400 dark:text-stone-600">
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
        ) : null}
      </div>

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
      {legalModal === 'numberAuth' && (
        <CtAccountLegalMenuModal
          onSelect={(key) => setLegalModal(key)}
          onClose={() => setLegalModal(null)}
        />
      )}
      {legalModal === 'ctService' && (
        <LegalModal
          title="天翼账号服务协议"
          content={CT_ACCOUNT_SERVICE_AGREEMENT}
          onClose={() => setLegalModal(null)}
        />
      )}
      {legalModal === 'ctPrivacy' && (
        <LegalModal
          title="天翼账号隐私政策"
          content={CT_ACCOUNT_PRIVACY_POLICY}
          onClose={() => setLegalModal(null)}
        />
      )}

    </div>
  )
}
