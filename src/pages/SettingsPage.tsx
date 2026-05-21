import { useEffect, useMemo, useState } from 'react'
import type { FieldDef, ProductCatalogEntry } from '../types'
import { useAuth } from '../context/AuthContext'
import { useLedger } from '../context/LedgerContext'
import { TRIGGER_ANDROID_UPDATE_CHECK } from '../components/AppUpdateGate'
import { APP_VERSION } from '../version'
import { getStoredPhone } from '../api/ledgerClient'
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  fontSizePresetLabel,
  persistFontSizePercent,
  readFontSizePercent,
} from '../utils/appFontSize'
import {
  cycleThemeMode,
  persistThemeMode,
  readThemeMode,
  themeModeLabel,
  type ThemeMode,
} from '../utils/appTheme'
import { displayNickname, readUserProfile } from '../utils/userProfile'
import {
  persistReceiptExportHd,
  readReceiptExportHd,
} from '../utils/receiptExport'
import { collectAsrHotwordsFromLedger } from '../utils/asrHotwordsFromLedger'
import { normalizeToken } from '../utils/voiceHistoryFuzzy'
import { SETTINGS_CARD_CLASS } from './settings/SettingsSection'
import { SettingsAboutYouScreen } from './settings/SettingsAboutYouScreen'
import { AsrProviderSettingsScreen } from './settings/AsrProviderSettingsScreen'
import { VoiceLexiconSettingsScreen } from './settings/VoiceLexiconSettingsScreen'
import { asrProviderLabel, readAsrProvider } from '../utils/asrProvider'
import { ProBenefitsSheet, ProRedeemSheet } from './settings/ProMembershipSheets'
import { SettingsProfileCard } from './settings/SettingsProfileCard'
import {
  IconBell,
  IconBox,
  IconMic,
  IconFields,
  IconFontSize,
  IconImportExport,
  IconMoon,
  IconScan,
} from './settings/settingsIcons'
import {
  SETTINGS_SHELL_BG,
  SettingsGroupLabel,
  SettingsHeaderIconButton,
  SettingsInsetList,
  SettingsMainHeader,
  SettingsNavRowButton,
  SettingsNavRowLink,
  SettingsPanelBody,
  SettingsScrollBody,
  SettingsSubHeader,
} from './settings/settingsShell'

function maskPhone(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '')
  if (d.length >= 11) return `${d.slice(0, 3)} **** ${d.slice(-4)}`
  if (raw?.trim()) return raw.trim()
  return '未绑定'
}

function SettingsHomeAccountSection({
  onLoginSuccess,
}: {
  onLoginSuccess?: () => void
}) {
  const {
    apiBase,
    token,
    email: cloudEmail,
    membershipActive,
    useRemoteLedger,
    login,
    smsLogin,
    sendSms,
    redeem,
    refreshProfile,
    logout,
  } = useAuth()
  const [authMode, setAuthMode] = useState<'phone' | 'admin'>('phone')
  const [authEmail, setAuthEmail] = useState('')
  const [authPw, setAuthPw] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [phone, setPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [smsWaitSec, setSmsWaitSec] = useState(0)
  const [redeemCode, setRedeemCode] = useState('')

  useEffect(() => {
    if (smsWaitSec <= 0) return
    const id = window.setTimeout(() => setSmsWaitSec((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [smsWaitSec])

  const inputCls =
    'w-full rounded-2xl border-0 bg-stone-50 bg-kj-raised px-4 py-3.5 text-[15px] text-kj-primary shadow-inner ring-1 ring-stone-200/80 transition-shadow placeholder:text-kj-muted focus:bg-kj-surface focus:outline-none focus:ring-2 focus:ring-emerald-500/35'

  const primaryBtn =
    'w-full rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-600 py-3.5 text-[15px] font-semibold text-white shadow-md shadow-emerald-500/20 transition-opacity hover:opacity-95 active:opacity-90 disabled:cursor-not-allowed disabled:opacity-45'

  const ghostBtn =
    'w-full rounded-2xl border border-kj-border-strong bg-kj-surface py-3 text-[15px] font-medium text-stone-700 transition-colors hover:bg-kj-hover active:bg-stone-100'

  return (
    <section className="rounded-2xl border border-kj-border-strong/70 bg-kj-surface p-5 shadow-[0_2px_16px_rgba(15,23,42,0.05)]">
      <div className="border-b border-kj-border pb-4">
        <h3 className="text-[17px] font-semibold tracking-tight text-kj-primary">
          账号
        </h3>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-500">
          登录后可同步与备份账单数据
        </p>
      </div>

      <div className="pt-4">
        {!apiBase && (
          <div className="rounded-2xl bg-stone-50 bg-kj-raised px-4 py-4 text-center">
            <p className="text-[14px] font-medium text-stone-800">当前为离线使用</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-stone-500">
              数据仅保存在本设备。若需云端备份，请使用已配置服务的安装包。
            </p>
          </div>
        )}

        {apiBase && token && useRemoteLedger && (
          <div className="space-y-4">
            <div>
              <p className="text-[12px] font-medium uppercase tracking-wide text-kj-muted">
                已登录
              </p>
              <p className="mt-1 truncate text-[16px] font-semibold text-kj-primary">
                {cloudEmail ?? '—'}
              </p>
              <p className="mt-2 text-[13px] text-emerald-600">云端同步已开启</p>
            </div>
            <button type="button" onClick={() => logout()} className={ghostBtn}>
              退出登录
            </button>
          </div>
        )}

        {apiBase && token && !useRemoteLedger && !membershipActive && (
          <div className="space-y-5">
            <div>
              <p className="text-[12px] font-medium uppercase tracking-wide text-kj-muted">
                已登录
              </p>
              <p className="mt-1 truncate text-[16px] font-semibold text-kj-primary">
                {cloudEmail ?? '—'}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-stone-500">
                开通会员后即可使用云端自动备份与相关功能。
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-[12px] font-medium text-stone-500">
                会员兑换码
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <input
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value)}
                  placeholder="请输入兑换码"
                  className={`${inputCls} sm:min-w-0 sm:flex-1`}
                />
                <button
                  type="button"
                  disabled={authBusy || !redeemCode.trim()}
                  onClick={() => {
                    void (async () => {
                      setAuthBusy(true)
                      try {
                        await redeem(redeemCode.trim())
                        setRedeemCode('')
                        await refreshProfile()
                        alert('兑换成功')
                      } catch (e) {
                        alert(e instanceof Error ? e.message : '兑换失败')
                      } finally {
                        setAuthBusy(false)
                      }
                    })()
                  }}
                  className="shrink-0 rounded-2xl bg-stone-900 px-6 py-3.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40 sm:self-stretch"
                >
                  兑换
                </button>
              </div>
            </div>
            <button type="button" onClick={() => logout()} className={ghostBtn}>
              退出登录
            </button>
          </div>
        )}

        {apiBase && token && !useRemoteLedger && membershipActive && (
          <div className="space-y-4">
            <div>
              <p className="text-[12px] font-medium uppercase tracking-wide text-kj-muted">
                已登录
              </p>
              <p className="mt-1 truncate text-[16px] font-semibold text-kj-primary">
                {cloudEmail ?? '—'}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-stone-500">
                会员已开通。数据同步将在联网后自动进行。
              </p>
            </div>
            <button type="button" onClick={() => logout()} className={ghostBtn}>
              退出登录
            </button>
          </div>
        )}

        {apiBase && !token && (
          <div className="space-y-5">
            <p className="text-[13px] leading-relaxed text-stone-500">
              使用手机号验证码或管理员账号登录。
            </p>

            <div
              className="flex rounded-2xl bg-stone-100 p-1"
              role="tablist"
              aria-label="登录方式"
            >
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'phone'}
                onClick={() => setAuthMode('phone')}
                className={`flex-1 rounded-xl py-2.5 text-[14px] font-semibold transition-all ${
                  authMode === 'phone'
                    ? 'bg-kj-surface text-kj-primary shadow-sm'
                    : 'text-stone-500'
                }`}
              >
                手机号
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'admin'}
                onClick={() => setAuthMode('admin')}
                className={`flex-1 rounded-xl py-2.5 text-[14px] font-semibold transition-all ${
                  authMode === 'admin'
                    ? 'bg-kj-surface text-kj-primary shadow-sm'
                    : 'text-stone-500'
                }`}
              >
                管理员
              </button>
            </div>

            {authMode === 'admin' ? (
              <div className="space-y-3">
                <p className="text-[12px] leading-relaxed text-kj-muted">
                  供部署方或管理员使用账号密码登录后台账号。
                </p>
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-stone-500">
                    管理员账号
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
                  <label className="mb-1.5 block text-[12px] font-medium text-stone-500">
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
                  onClick={() => {
                    void (async () => {
                      setAuthBusy(true)
                      try {
                        await login(authEmail.trim(), authPw)
                        setAuthPw('')
                        await refreshProfile()
                        onLoginSuccess?.()
                      } catch (e) {
                        alert(e instanceof Error ? e.message : '登录失败')
                      } finally {
                        setAuthBusy(false)
                      }
                    })()
                  }}
                  className={primaryBtn}
                >
                  管理员登录
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-stone-500">
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
                      authBusy ||
                      phone.replace(/\s/g, '').length < 11 ||
                      smsWaitSec > 0
                    }
                    onClick={() => {
                      void (async () => {
                        setAuthBusy(true)
                        try {
                          await sendSms(phone)
                          setSmsWaitSec(60)
                        } catch (e) {
                          alert(e instanceof Error ? e.message : '发送失败')
                        } finally {
                          setAuthBusy(false)
                        }
                      })()
                    }}
                    className="shrink-0 self-center rounded-2xl border border-kj-border-strong bg-kj-surface px-4 py-3 text-[14px] font-semibold text-stone-800 transition-colors hover:bg-kj-hover disabled:opacity-40"
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
                  onClick={() => {
                    void (async () => {
                      setAuthBusy(true)
                      try {
                        await smsLogin(phone, smsCode.trim())
                        setSmsCode('')
                        await refreshProfile()
                        onLoginSuccess?.()
                      } catch (e) {
                        alert(e instanceof Error ? e.message : '登录失败')
                      } finally {
                        setAuthBusy(false)
                      }
                    })()
                  }}
                  className={primaryBtn}
                >
                  手机号登录
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function newCatalogEntryId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* ignore */
  }
  return `cat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

type SettingsPanel =
  | 'main'
  | 'profile'
  | 'account'
  | 'display'
  | 'catalog'
  | 'voiceLexicon'
  | 'asrProvider'
  | 'fields'

export function SettingsPage() {
  const {
    token,
    apiBase,
    membershipActive,
    email: cloudEmail,
    membershipExpiresAt,
    redeem,
    refreshProfile,
  } = useAuth()
  const [fontPct, setFontPct] = useState(() => readFontSizePercent())
  const [receiptExportHd, setReceiptExportHd] = useState(() =>
    readReceiptExportHd(),
  )
  const {
    ready,
    fields,
    records,
    saveFields,
    productCatalog,
    productCatalogSuppressed,
    asrHotwordsSuppressed,
    saveProductCatalog,
  } = useLedger()
  const [name, setName] = useState('')
  const [type, setType] = useState<'text' | 'number'>('text')
  const [busy, setBusy] = useState(false)
  const [panel, setPanel] = useState<SettingsPanel>('main')
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readThemeMode())
  const [userProfile, setUserProfile] = useState(() => readUserProfile())
  const [proBenefitsOpen, setProBenefitsOpen] = useState(false)
  const [proRedeemOpen, setProRedeemOpen] = useState(false)
  const [newProductName, setNewProductName] = useState('')
  const [newProductUnit, setNewProductUnit] = useState('斤')
  const sorted = useMemo(
    () => [...fields].sort((a, b) => a.order - b.order),
    [fields],
  )

  const sortedProductCatalog = useMemo(
    () =>
      [...productCatalog].sort((a, b) =>
        a.name.localeCompare(b.name, 'zh-CN'),
      ),
    [productCatalog],
  )

  const catalogRowSubtitle = useMemo(
    () =>
      sortedProductCatalog.length === 0
        ? '管理商品与库存'
        : `共 ${sortedProductCatalog.length} 条 · 管理商品与库存`,
    [sortedProductCatalog.length],
  )

  const voiceLexiconSubtitle = useMemo(() => {
    const hotwords = collectAsrHotwordsFromLedger(records, fields, {
      productCatalog,
      asrHotwordsSuppressed,
    })
    const aliasCount = productCatalog.reduce(
      (n, e) => n + (e.aliases?.length ?? 0),
      0,
    )
    return `热词 ${hotwords.length} 个 · 别名 ${aliasCount} 条`
  }, [records, fields, productCatalog, asrHotwordsSuppressed])

  const asrProviderSubtitle = useMemo(
    () => `当前：${asrProviderLabel(readAsrProvider())}`,
    [panel],
  )

  const fieldsRowSubtitle = useMemo(
    () => `${sorted.length} 个字段 · 支持自定义`,
    [sorted.length],
  )

  const accountLine = useMemo(() => {
    const phone = maskPhone(getStoredPhone())
    if (phone !== '未绑定') return `账号：${phone}`
    if (cloudEmail) return `账号：${cloudEmail}`
    return '账号：未登录'
  }, [token, cloudEmail])

  const fontSizeLabel = useMemo(() => fontSizePresetLabel(fontPct), [fontPct])
  const profileNickname = useMemo(() => displayNickname(userProfile), [userProfile])
  const needsAccountLogin = Boolean(apiBase && !token)

  useEffect(() => {
    if (panel === 'main') setUserProfile(readUserProfile())
  }, [panel])

  const addField = async () => {
    const n = name.trim()
    if (!n) return
    setBusy(true)
    try {
      const maxOrder = sorted.reduce((m, f) => Math.max(m, f.order), 0)
      const next: FieldDef[] = [
        ...sorted,
        {
          id: `field_${crypto.randomUUID()}`,
          name: n,
          type,
          order: maxOrder + 1,
          required: false,
        },
      ]
      await saveFields(next)
      setName('')
    } finally {
      setBusy(false)
    }
  }

  const removeField = async (id: string) => {
    const target = sorted.find((f) => f.id === id)
    if (target?.key) {
      alert('默认字段（商品 / 单价 / 斤数 / 购买方 / 金额）不能删除，可改名。')
      return
    }
    setBusy(true)
    try {
      await saveFields(sorted.filter((f) => f.id !== id))
    } finally {
      setBusy(false)
    }
  }

  const renameField = async (id: string, newName: string) => {
    const next = sorted.map((f) =>
      f.id === id ? { ...f, name: newName } : f,
    )
    await saveFields(next)
  }

  const addProductCatalogEntry = async () => {
    const n = newProductName.trim()
    const u = newProductUnit.trim() || '斤'
    if (!n) {
      alert('请输入商品名称')
      return
    }
    const nk = normalizeToken(n)
    const dupIdx = productCatalog.findIndex((e) => normalizeToken(e.name) === nk)

    if (dupIdx >= 0) {
      const dup = productCatalog[dupIdx]!
      if (dup.source === 'manual') {
        alert('已有同名商品（忽略空格后相同）')
        return
      }
      setBusy(true)
      try {
        await saveProductCatalog(
          productCatalog.map((e) =>
            e.id === dup.id
              ? { ...dup, name: n, unit: u, source: 'manual' as const }
              : e,
          ),
          productCatalogSuppressed,
          asrHotwordsSuppressed,
        )
        setNewProductName('')
        setNewProductUnit('斤')
      } catch (err) {
        console.error(err)
        alert(err instanceof Error ? err.message : '保存失败')
      } finally {
        setBusy(false)
      }
      return
    }

    setBusy(true)
    try {
      await saveProductCatalog(
        [
          ...productCatalog,
          {
            id: newCatalogEntryId(),
            name: n,
            unit: u,
            source: 'manual',
          },
        ],
        productCatalogSuppressed,
        asrHotwordsSuppressed,
      )
      setNewProductName('')
      setNewProductUnit('斤')
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const removeProductCatalogEntry = async (e: ProductCatalogEntry) => {
    setBusy(true)
    try {
      const next = productCatalog.filter((x) => x.id !== e.id)
      let suppressed = productCatalogSuppressed
      if (e.source === 'auto') {
        const k = normalizeToken(e.name)
        if (k && !suppressed.includes(k)) suppressed = [...suppressed, k]
      }
      await saveProductCatalog(next, suppressed, asrHotwordsSuppressed)
    } finally {
      setBusy(false)
    }
  }

  const updateProductCatalogUnit = async (id: string, unitRaw: string) => {
    const u = unitRaw.trim() || '斤'
    setBusy(true)
    try {
      const next = productCatalog.map((x) =>
        x.id === id
          ? {
              ...x,
              unit: u,
              source: x.source === 'auto' ? ('manual' as const) : x.source,
            }
          : x,
      )
      await saveProductCatalog(next, productCatalogSuppressed, asrHotwordsSuppressed)
    } finally {
      setBusy(false)
    }
  }

  const setFieldRequired = async (id: string, required: boolean) => {
    setBusy(true)
    try {
      const next = sorted.map((f) =>
        f.id === id ? { ...f, required } : f,
      )
      await saveFields(next)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (panel === 'main') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanel('main')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel])

  if (!ready) {
    return (
      <div
        className={`${SETTINGS_SHELL_BG} flex min-h-[50vh] items-center justify-center text-kj-muted`}
      >
        加载中…
      </div>
    )
  }

  if (panel === 'account' || (panel === 'profile' && needsAccountLogin)) {
    return (
      <div className={SETTINGS_SHELL_BG}>
        <SettingsSubHeader title="账号与安全" onBack={() => setPanel('main')} />
        <SettingsPanelBody>
          <SettingsHomeAccountSection onLoginSuccess={() => setPanel('main')} />
        </SettingsPanelBody>
      </div>
    )
  }

  if (panel === 'profile') {
    return (
      <SettingsAboutYouScreen
        onBack={() => setPanel('main')}
        onOpenAccount={() => setPanel('account')}
      />
    )
  }

  if (panel === 'fields') {
    return (
      <LedgerFieldsSubScreen
        onBack={() => setPanel('main')}
        sorted={sorted}
        name={name}
        setName={setName}
        type={type}
        setType={setType}
        busy={busy}
        addField={addField}
        renameField={renameField}
        setFieldRequired={setFieldRequired}
        removeField={removeField}
      />
    )
  }

  if (panel === 'display') {
    return (
      <div className={SETTINGS_SHELL_BG}>
        <SettingsSubHeader title="外观与显示" onBack={() => setPanel('main')} />
        <SettingsPanelBody>
          <div className={SETTINGS_CARD_CLASS}>
            <p className="mb-1 text-sm font-semibold text-kj-primary">
              字体大小
            </p>
            <p className="mb-3 text-xs leading-relaxed text-kj-secondary">
              仅本应用内生效。
            </p>
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs tabular-nums text-neutral-600">
                {FONT_SIZE_MIN}%
              </span>
              <output
                className="text-sm font-semibold tabular-nums text-kj-primary"
                htmlFor="kuaiji-font-slider"
              >
                {fontPct}%
              </output>
              <span className="text-xs tabular-nums text-neutral-600">
                {FONT_SIZE_MAX}%
              </span>
            </div>
            <input
              id="kuaiji-font-slider"
              type="range"
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              step={FONT_SIZE_STEP}
              value={fontPct}
              onChange={(e) => {
                const n = Number(e.target.value)
                setFontPct(n)
                persistFontSizePercent(n)
              }}
              className="mb-4 h-2 w-full cursor-pointer accent-[#2ecc71]"
            />
            <div className="flex flex-wrap gap-2">
              {[
                { label: '较小', v: 90 },
                { label: '标准', v: FONT_SIZE_DEFAULT },
                { label: '较大', v: 120 },
                { label: '最大', v: FONT_SIZE_MAX },
              ].map(({ label, v }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setFontPct(v)
                    persistFontSizePercent(v)
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    fontPct === v
                      ? 'bg-[#2ecc71] text-white'
                      : 'border border-kj-border-strong bg-kj-raised text-kj-primary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className={SETTINGS_CARD_CLASS}>
            <p className="mb-1 text-sm font-semibold text-kj-primary">小票导出</p>
            <p className="mb-3 text-xs leading-relaxed text-kj-secondary">
              默认较快；高清更清晰、生成更慢。
            </p>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-kj-primary">
              <input
                type="checkbox"
                checked={receiptExportHd}
                onChange={(e) => {
                  const v = e.target.checked
                  setReceiptExportHd(v)
                  persistReceiptExportHd(v)
                }}
                className="mt-0.5 rounded border-kj-border-strong text-[#2ecc71] focus:ring-[#2ecc71]"
              />
              <span>
                <span className="font-medium">高清导出</span>
                <span className="mt-0.5 block text-xs font-normal text-kj-secondary">
                  开：更清晰，保存更久。
                </span>
              </span>
            </label>
          </div>
        </SettingsPanelBody>
      </div>
    )
  }

  if (panel === 'voiceLexicon') {
    return (
      <VoiceLexiconSettingsScreen
        records={records}
        fields={fields}
        productCatalog={productCatalog}
        asrHotwordsSuppressed={asrHotwordsSuppressed}
        onSaveLexicon={async (catalog, hotwordsSuppressed) => {
          await saveProductCatalog(
            catalog,
            productCatalogSuppressed,
            hotwordsSuppressed,
          )
        }}
        onBack={() => setPanel('main')}
      />
    )
  }

  if (panel === 'asrProvider') {
    return <AsrProviderSettingsScreen onBack={() => setPanel('main')} />
  }

  if (panel === 'catalog') {
    return (
      <div className={SETTINGS_SHELL_BG}>
        <SettingsSubHeader title="商品管理" onBack={() => setPanel('main')} />
        <SettingsPanelBody>
          <p className="px-1 text-[12px] leading-relaxed text-stone-500">
            维护商品名与单位（斤、包等）。语音与录入会优先匹配；常用账单可自动生成条目。删除自动条目后同名不会再自动加入。
          </p>
          <div className={SETTINGS_CARD_CLASS}>
            <div className="mb-4 flex flex-wrap items-end gap-2">
              <label className="min-w-[8rem] flex-1 text-left text-xs font-medium text-kj-secondary">
                商品名称
                <input
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-2 text-sm text-kj-primary"
                  placeholder="如 圆紫薯"
                  autoComplete="off"
                />
              </label>
              <label className="w-[5.5rem] text-left text-xs font-medium text-kj-secondary">
                单位
                <input
                  value={newProductUnit}
                  onChange={(e) => setNewProductUnit(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-kj-border-strong bg-kj-raised px-2 py-2 text-center text-sm text-kj-primary"
                  placeholder="斤"
                  autoComplete="off"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void addProductCatalogEntry()}
                className="shrink-0 rounded-xl border border-[#2ecc71] bg-[#2ecc71] px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
              >
                添加
              </button>
            </div>
            {sortedProductCatalog.length === 0 ? (
              <p className="text-xs text-kj-muted">
                暂无条目；记几笔或在此添加后会显示。
              </p>
            ) : (
              <ul className="max-h-[min(22rem,50vh)] space-y-2 overflow-y-auto pr-1">
                {sortedProductCatalog.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-kj-border bg-kj-raised px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-kj-primary">
                        {row.name}
                      </span>
                      {(row.aliases?.length ?? 0) > 0 ? (
                        <span className="mt-0.5 block truncate text-[10px] text-amber-800/90 dark:text-amber-200/80">
                          别名：{row.aliases!.join('、')}
                        </span>
                      ) : null}
                    </div>
                    <label className="flex w-[4.5rem] shrink-0 items-center gap-1 text-xs text-kj-secondary">
                      <span className="shrink-0">单位</span>
                      <input
                        defaultValue={row.unit}
                        key={`${row.id}-${row.unit}`}
                        onBlur={(e) => {
                          if (e.target.value.trim() === row.unit) return
                          void updateProductCatalogUnit(row.id, e.target.value)
                        }}
                        className="w-full rounded-lg border border-kj-border-strong bg-kj-surface px-1.5 py-1 text-center text-sm text-kj-primary"
                      />
                    </label>
                    <span
                      className={
                        row.source === 'auto'
                          ? 'shrink-0 text-[10px] text-kj-muted'
                          : 'shrink-0 text-[10px] text-kj-secondary'
                      }
                    >
                      {row.source === 'auto' ? '自动' : '手动'}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeProductCatalogEntry(row)}
                      className="ml-auto shrink-0 text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SettingsPanelBody>
      </div>
    )
  }

  const handleUpgradePro = () => {
    setProRedeemOpen(true)
  }

  const handleViewBenefits = () => {
    setProBenefitsOpen(true)
  }

  const handleRedeem = async (code: string) => {
    if (!apiBase) {
      alert('当前为离线使用，无法兑换会员')
      return
    }
    try {
      await redeem(code)
      await refreshProfile()
      alert('兑换成功')
      setProRedeemOpen(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : '兑换失败')
    }
  }

  return (
    <div className={SETTINGS_SHELL_BG}>
      <SettingsMainHeader
        title="设置"
        right={
          <>
            <SettingsHeaderIconButton
              label="通知"
              onClick={() => alert('通知功能即将上线')}
            >
              <IconBell className="h-5 w-5" />
            </SettingsHeaderIconButton>
            <SettingsHeaderIconButton
              label="扫码"
              onClick={() => alert('扫码功能即将上线')}
            >
              <IconScan className="h-5 w-5" />
            </SettingsHeaderIconButton>
          </>
        }
      />
      <SettingsScrollBody>
        <SettingsProfileCard
          displayName={profileNickname}
          avatarUrl={userProfile.avatarDataUrl}
          accountLine={accountLine}
          recordCount={records.length}
          membershipActive={membershipActive}
          onOpenProfile={() => setPanel(needsAccountLogin ? 'account' : 'profile')}
          onUpgradePro={handleUpgradePro}
          onViewBenefits={handleViewBenefits}
        />

        <ProBenefitsSheet
          open={proBenefitsOpen}
          onClose={() => setProBenefitsOpen(false)}
          membershipActive={membershipActive}
          membershipExpiresAt={membershipExpiresAt}
        />
        <ProRedeemSheet
          open={proRedeemOpen}
          onClose={() => setProRedeemOpen(false)}
          apiBase={Boolean(apiBase)}
          hasToken={Boolean(token)}
          membershipActive={membershipActive}
          membershipExpiresAt={membershipExpiresAt}
          onNeedLogin={() => setPanel('account')}
          onRedeem={handleRedeem}
        />

        <section>
          <SettingsGroupLabel>账本与数据</SettingsGroupLabel>
          <SettingsInsetList>
            <SettingsNavRowLink
              first
              icon={<IconImportExport className="h-[18px] w-[18px]" />}
              title="导入导出"
              subtitle="支持 CSV / Excel 文件"
              to="/settings/import-export"
            />
            <SettingsNavRowButton
              icon={<IconFields className="h-[18px] w-[18px]" />}
              title="自定义账本字段"
              subtitle={fieldsRowSubtitle}
              onClick={() => setPanel('fields')}
            />
            <SettingsNavRowButton
              icon={<IconBox className="h-[18px] w-[18px]" />}
              title="商品管理"
              subtitle={catalogRowSubtitle}
              onClick={() => setPanel('catalog')}
            />
            <SettingsNavRowButton
              icon={<IconMic className="h-[18px] w-[18px]" />}
              title="语音热词与别名"
              subtitle={voiceLexiconSubtitle}
              onClick={() => setPanel('voiceLexicon')}
            />
            <SettingsNavRowButton
              last
              icon={<IconMic className="h-[18px] w-[18px]" />}
              title="语音识别引擎"
              subtitle={asrProviderSubtitle}
              onClick={() => setPanel('asrProvider')}
            />
          </SettingsInsetList>
        </section>

        <section>
          <SettingsGroupLabel>外观与显示</SettingsGroupLabel>
          <SettingsInsetList>
            <SettingsNavRowButton
              first
              icon={<IconMoon className="h-[18px] w-[18px]" />}
              title="主题模式"
              value={themeModeLabel(themeMode)}
              onClick={() => {
                const next = cycleThemeMode(themeMode)
                setThemeMode(next)
                persistThemeMode(next)
              }}
            />
            <SettingsNavRowButton
              last
              icon={<IconFontSize className="h-[18px] w-[18px]" />}
              title="字体大小"
              value={fontSizeLabel}
              onClick={() => setPanel('display')}
            />
          </SettingsInsetList>
        </section>

        <footer className="border-t border-kj-border-strong/60 pt-6 text-center">
          <p className="text-[13px] font-medium text-stone-600">
            应用版本 {APP_VERSION}
          </p>
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new Event(TRIGGER_ANDROID_UPDATE_CHECK))
            }
            className="mx-auto mt-3 block w-full max-w-sm rounded-2xl border border-kj-border-strong/80 bg-kj-surface py-3 text-[14px] font-medium text-stone-800 shadow-sm transition-colors hover:bg-kj-hover active:bg-stone-100"
          >
            检查更新（Android）
          </button>
          <p className="mx-auto mt-3 max-w-sm text-[11px] leading-relaxed text-kj-muted">
            若下载站配置了网页 zip，将优先热更新并保留登录；仅壳版本不足时才需整包 APK。
          </p>
        </footer>
      </SettingsScrollBody>
    </div>
  )
}

function LedgerFieldsSubScreen({
  onBack,
  sorted,
  name,
  setName,
  type,
  setType,
  busy,
  addField,
  renameField,
  setFieldRequired,
  removeField,
}: {
  onBack: () => void
  sorted: FieldDef[]
  name: string
  setName: (v: string) => void
  type: 'text' | 'number'
  setType: (t: 'text' | 'number') => void
  busy: boolean
  addField: () => Promise<void>
  renameField: (id: string, newName: string) => Promise<void>
  setFieldRequired: (id: string, required: boolean) => Promise<void>
  removeField: (id: string) => Promise<void>
}) {
  return (
    <div className={SETTINGS_SHELL_BG}>
      <SettingsSubHeader title="自定义账本字段" onBack={onBack} />
      <SettingsPanelBody>
        <p className="px-1 text-[12px] leading-relaxed text-stone-500">
          含商品、单价、斤数、购买方、金额等内置列；可加自定义列。「必填」在记账页标星并校验。
        </p>

        <section>
          <h2 className="mb-2 text-[13px] font-semibold text-stone-700">添加自定义字段</h2>
          <div className={SETTINGS_CARD_CLASS}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="字段名称，例如：备注"
                className="min-h-[44px] flex-1 rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-2.5 text-sm text-kj-primary placeholder:text-kj-muted"
              />
              <select
                value={type}
                onChange={(e) =>
                  setType(e.target.value as 'text' | 'number')
                }
                className="min-h-[44px] rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-2.5 text-sm text-kj-primary sm:w-28"
              >
                <option value="text">文本</option>
                <option value="number">数字</option>
              </select>
              <button
                type="button"
                disabled={busy || !name.trim()}
                onClick={() => void addField()}
                className="min-h-[44px] shrink-0 rounded-xl bg-[#2ecc71] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#27ae60] disabled:opacity-50"
              >
                添加
              </button>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-[13px] font-semibold text-stone-700">当前列</h2>
          <div className={SETTINGS_CARD_CLASS}>
            <ul className="space-y-3">
              {sorted.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-kj-border bg-kj-raised px-3 py-3"
                >
                  <EditableName
                    initial={f.name}
                    onSave={(v) => void renameField(f.id, v)}
                  />
                  <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    {f.type === 'number' ? '数字' : '文本'}
                  </span>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-kj-primary">
                    <input
                      type="checkbox"
                      checked={f.required === true}
                      disabled={busy}
                      onChange={(e) =>
                        void setFieldRequired(f.id, e.target.checked)
                      }
                      className="rounded border-kj-border-strong text-[#2ecc71] focus:ring-[#2ecc71]"
                    />
                    必填
                  </label>
                  {f.key && (
                    <span className="text-xs text-kj-muted">系统默认</span>
                  )}
                  {!f.key && (
                    <button
                      type="button"
                      onClick={() => void removeField(f.id)}
                      className="ml-auto text-sm font-medium text-kj-muted transition-colors hover:text-rose-600"
                    >
                      删除
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </SettingsPanelBody>
    </div>
  )
}

function EditableName({
  initial,
  onSave,
}: {
  initial: string
  onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(initial)

  useEffect(() => {
    setVal(initial)
  }, [initial])

  return editing ? (
    <input
      autoFocus
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        setEditing(false)
        if (val.trim() && val !== initial) onSave(val.trim())
        else setVal(initial)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      className="min-w-[8rem] flex-1 rounded-xl border border-kj-border-strong bg-kj-raised px-2.5 py-1.5 text-sm text-kj-primary"
    />
  ) : (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-left text-base font-semibold text-kj-primary"
    >
      {initial}
    </button>
  )
}
