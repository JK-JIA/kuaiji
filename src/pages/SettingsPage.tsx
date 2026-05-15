import { useEffect, useMemo, useRef, useState } from 'react'
import type { FieldDef, ProductCatalogEntry } from '../types'
import { getApiBase } from '../api/ledgerClient'
import { useAuth } from '../context/AuthContext'
import { useLedger } from '../context/LedgerContext'
import { exportCsv, parseLedgerImportCsv } from '../utils/exportData'
import { TRIGGER_ANDROID_UPDATE_CHECK } from '../components/AppUpdateGate'
import { APP_VERSION } from '../version'
import {
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_SIZE_STEP,
  persistFontSizePercent,
  readFontSizePercent,
} from '../utils/appFontSize'
import {
  persistReceiptExportHd,
  readReceiptExportHd,
} from '../utils/receiptExport'
import { normalizeToken } from '../utils/voiceHistoryFuzzy'
import {
  SETTINGS_CARD_CLASS,
  SettingsSection,
} from './settings/SettingsSection'

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

export function SettingsPage() {
  const {
    apiBase,
    token,
    email: cloudEmail,
    membershipActive,
    useRemoteLedger,
    login,
    register,
    smsLogin,
    sendSms,
    redeem,
    refreshProfile,
    logout,
  } = useAuth()
  const [authMode, setAuthMode] = useState<'password' | 'phone'>('password')
  const [authEmail, setAuthEmail] = useState(() =>
    getApiBase() ? 'admin' : '',
  )
  const [authPw, setAuthPw] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [phone, setPhone] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [smsWaitSec, setSmsWaitSec] = useState(0)
  const [redeemCode, setRedeemCode] = useState('')
  const [fontPct, setFontPct] = useState(() => readFontSizePercent())
  const [receiptExportHd, setReceiptExportHd] = useState(() =>
    readReceiptExportHd(),
  )
  const {
    ready,
    fields,
    records,
    saveFields,
    restoreFullBackup,
    productCatalog,
    productCatalogSuppressed,
    saveProductCatalog,
  } = useLedger()
  const importInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState<'text' | 'number'>('text')
  const [busy, setBusy] = useState(false)
  const [ledgerFieldsSubOpen, setLedgerFieldsSubOpen] = useState(false)
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
      await saveProductCatalog(next, suppressed)
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
      await saveProductCatalog(next, productCatalogSuppressed)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (smsWaitSec <= 0) return
    const id = window.setTimeout(() => setSmsWaitSec((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [smsWaitSec])

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

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-[#f8f9fa] text-[#999999]">
        加载中…
      </div>
    )
  }

  if (ledgerFieldsSubOpen) {
    return (
      <LedgerFieldsSubScreen
        onBack={() => setLedgerFieldsSubOpen(false)}
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

  return (
    <div className="min-h-dvh bg-[#f8f9fa] pb-28 pt-12">
      <header className="mb-6 px-4">
        <h1 className="text-[22px] font-bold tracking-tight text-neutral-900">
          设置
        </h1>
        <p className="mt-0.5 text-xs leading-relaxed text-[#666666]">
          账号、显示、备份与字段。
        </p>
      </header>

      <SettingsSection title="账号">
        <div className={SETTINGS_CARD_CLASS}>
          <p className="mb-3 text-sm font-semibold text-neutral-900">云端同步</p>
          {!apiBase && (
            <>
              <p className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
                未配置云端 API，数据仅在本机。
              </p>
              <details className="mt-3 rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2 text-[11px] leading-relaxed text-neutral-800">
                <summary className="cursor-pointer font-medium text-neutral-900 select-none">
                  如何配置 API（开发者）
                </summary>
                <p className="mt-2 text-amber-900">
                  根目录配置{' '}
                  <code className="rounded-md bg-amber-100/90 px-1.5 py-0.5 font-mono text-[11px]">
                    VITE_API_URL
                  </code>
                  ，再 <code className="rounded-md bg-amber-100/90 px-1.5 py-0.5 font-mono text-[11px]">npm run build</code> 打包。
                </p>
              </details>
            </>
          )}
          {apiBase && (
            <>
              <p className="mb-3 text-[11px] leading-relaxed text-[#666666]">
                API：
                <span className="break-all font-mono text-neutral-800">
                  {apiBase}
                </span>
              </p>
              {useRemoteLedger ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-neutral-900">
                    已登录
                    <span className="font-medium"> {cloudEmail ?? '—'}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="w-fit rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#666666] shadow-sm transition-colors hover:bg-stone-50"
                  >
                    退出登录
                  </button>
                </div>
              ) : token && !membershipActive ? (
                <div className="space-y-4">
                  <p className="text-sm text-neutral-900">
                    已登录：
                    <span className="font-medium">{cloudEmail ?? '—'}</span>
                  </p>
                  <p className="text-[11px] leading-relaxed text-amber-900">
                    未开通会员，不同步云端。下方兑换。
                  </p>
                  <details className="rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2 text-[11px] leading-relaxed text-neutral-800">
                    <summary className="cursor-pointer font-medium text-neutral-900 select-none">
                      部署与兑换码说明（Docker）
                    </summary>
                    <p className="mt-2 text-amber-900">
                      <code className="rounded bg-amber-100 px-1 font-mono text-[10px]">redeem-daily</code> 每日写入{' '}
                      <code className="rounded bg-amber-100 px-1 font-mono text-[10px]">redeem-codes.txt</code>。
                    </p>
                  </details>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={redeemCode}
                      onChange={(e) => setRedeemCode(e.target.value)}
                      placeholder="兑换码"
                      className="min-h-[44px] flex-1 rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2.5 text-sm text-neutral-900 placeholder:text-[#999999]"
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
                            alert('兑换成功，云备份已开通')
                          } catch (e) {
                            alert(e instanceof Error ? e.message : '兑换失败')
                          } finally {
                            setAuthBusy(false)
                          }
                        })()
                      }}
                      className="min-h-[44px] shrink-0 rounded-xl bg-[#2ecc71] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#27ae60] disabled:opacity-50"
                    >
                      兑换会员
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="w-fit rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#666666] shadow-sm hover:bg-stone-50"
                  >
                    退出登录
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-[11px] leading-relaxed text-[#666666]">
                    Docker 默认{' '}
                    <span className="font-mono text-neutral-800">admin</span> /{' '}
                    <span className="font-mono text-neutral-800">123456</span>
                    。手机号为短信验证码登录。
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAuthMode('password')}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        authMode === 'password'
                          ? 'bg-[#2ecc71] text-white'
                          : 'bg-stone-100 text-neutral-700'
                      }`}
                    >
                      邮箱 / 账号
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('phone')}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        authMode === 'phone'
                          ? 'bg-[#2ecc71] text-white'
                          : 'bg-stone-100 text-neutral-700'
                      }`}
                    >
                      手机号
                    </button>
                  </div>
                  {authMode === 'password' ? (
                    <>
                      <input
                        type="text"
                        autoComplete="username"
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="账号（默认 admin）或注册邮箱"
                        className="w-full rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2.5 text-sm text-neutral-900 placeholder:text-[#999999]"
                      />
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={authPw}
                        onChange={(e) => setAuthPw(e.target.value)}
                        placeholder="密码（至少 6 位）"
                        className="w-full rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2.5 text-sm text-neutral-900 placeholder:text-[#999999]"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={
                            authBusy || !authEmail.trim() || authPw.length < 6
                          }
                          onClick={() => {
                            void (async () => {
                              setAuthBusy(true)
                              try {
                                await login(authEmail.trim(), authPw)
                                setAuthPw('')
                                await refreshProfile()
                              } catch (e) {
                                alert(
                                  e instanceof Error ? e.message : '登录失败',
                                )
                              } finally {
                                setAuthBusy(false)
                              }
                            })()
                          }}
                          className="rounded-xl bg-[#2ecc71] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#27ae60] disabled:opacity-50"
                        >
                          登录
                        </button>
                        <button
                          type="button"
                          disabled={
                            authBusy ||
                            !authEmail.trim() ||
                            authPw.length < 6 ||
                            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                              authEmail.trim(),
                            )
                          }
                          onClick={() => {
                            void (async () => {
                              setAuthBusy(true)
                              try {
                                await register(authEmail.trim(), authPw)
                                setAuthPw('')
                                await refreshProfile()
                              } catch (e) {
                                alert(
                                  e instanceof Error ? e.message : '注册失败',
                                )
                              } finally {
                                setAuthBusy(false)
                              }
                            })()
                          }}
                          className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm transition-colors hover:bg-stone-50 disabled:opacity-50"
                        >
                          注册
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="11 位手机号"
                        className="w-full rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2.5 text-sm text-neutral-900 placeholder:text-[#999999]"
                      />
                      <div className="flex gap-2">
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
                                alert('验证码已发送，请查收短信')
                              } catch (e) {
                                alert(
                                  e instanceof Error ? e.message : '发送失败',
                                )
                              } finally {
                                setAuthBusy(false)
                              }
                            })()
                          }}
                          className="shrink-0 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-50"
                        >
                          {smsWaitSec > 0 ? `${smsWaitSec}s` : '获取验证码'}
                        </button>
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={smsCode}
                        onChange={(e) => setSmsCode(e.target.value)}
                        placeholder="短信验证码"
                        className="w-full rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2.5 text-sm text-neutral-900 placeholder:text-[#999999]"
                      />
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
                            } catch (e) {
                              alert(
                                e instanceof Error ? e.message : '登录失败',
                              )
                            } finally {
                              setAuthBusy(false)
                            }
                          })()
                        }}
                        className="rounded-xl bg-[#2ecc71] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#27ae60] disabled:opacity-50"
                      >
                        手机号登录
                      </button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="字体大小">
        <div className="overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm">
          <div className="p-4">
            <p className="mb-3 text-xs leading-relaxed text-[#666666]">
              仅本应用内生效，拖动即更新。
            </p>
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs tabular-nums text-neutral-600">
                {FONT_SIZE_MIN}%
              </span>
              <output
                className="text-sm font-semibold tabular-nums text-neutral-900"
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
                      : 'border border-stone-200 bg-[#fafafa] text-neutral-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-stone-100 p-4">
            <p className="mb-1 text-sm font-semibold text-neutral-900">小票导出</p>
            <p className="mb-3 text-xs leading-relaxed text-[#666666]">
              小票图：默认较快；高清更清晰、更慢。
            </p>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-neutral-900">
              <input
                type="checkbox"
                checked={receiptExportHd}
                onChange={(e) => {
                  const v = e.target.checked
                  setReceiptExportHd(v)
                  persistReceiptExportHd(v)
                }}
                className="mt-0.5 rounded border-stone-300 text-[#2ecc71] focus:ring-[#2ecc71]"
              />
              <span>
                <span className="font-medium">高清导出</span>
                <span className="mt-0.5 block text-xs font-normal text-[#666666]">
                  开：更清晰，保存更久。
                </span>
              </span>
            </label>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="导出备份">
        <div className={SETTINGS_CARD_CLASS}>
          <p className="mb-3 text-sm font-semibold text-neutral-900">
            导出 / 恢复备份
          </p>
          <p className="mb-3 text-[11px] leading-relaxed text-[#666666]">
            {useRemoteLedger
              ? '已同步云端。导出 CSV 仅含账单；「商品维护」目录随账号云端同步，不含在 CSV 内。导入会替换当前全部账单。'
              : token && apiBase && !membershipActive
                ? '未开会员，数据在本机。CSV 仅账单；商品目录存本机 IndexedDB。导入规则同上。'
                : '数据在本机，换机前请导出。CSV 仅账单；商品目录在本机库。导入须与当前字段、列名一致。'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportCsv(records, fields)}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm transition-colors hover:bg-stone-50"
            >
              导出 CSV
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="rounded-xl border border-stone-300 bg-[#fafafa] px-4 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm transition-colors hover:bg-stone-100"
            >
              从 CSV 恢复…
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                void (async () => {
                  try {
                    const text = await file.text()
                    const parsed = parseLedgerImportCsv(text, fields)
                    if (!parsed.ok) {
                      alert(parsed.error)
                      return
                    }
                    const { records: r } = parsed
                    const ok = window.confirm(
                      `用 CSV 替换全部 ${r.length} 条账单，不可撤销，继续？`,
                    )
                    if (!ok) return
                    await restoreFullBackup(fields, r)
                    alert('恢复完成')
                  } catch (err) {
                    console.error(err)
                    alert(
                      err instanceof Error ? err.message : '读取备份失败',
                    )
                  }
                })()
              }}
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="商品维护"
        description="维护商品名与计量单位（斤、包等）。语音与录入会优先匹配此处；常用账单商品可自动生成条目（默认斤）。删除自动条目后不会再自动加入同名。"
      >
        <div className={SETTINGS_CARD_CLASS}>
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <label className="min-w-[8rem] flex-1 text-left text-xs font-medium text-[#666666]">
              商品名称
              <input
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2 text-sm text-neutral-900"
                placeholder="如 圆紫薯"
                autoComplete="off"
              />
            </label>
            <label className="w-[5.5rem] text-left text-xs font-medium text-[#666666]">
              单位
              <input
                value={newProductUnit}
                onChange={(e) => setNewProductUnit(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 bg-[#fafafa] px-2 py-2 text-center text-sm text-neutral-900"
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
            <p className="text-xs text-[#999999]">暂无条目；记几笔或在此添加后会显示。</p>
          ) : (
            <ul className="max-h-[min(22rem,50vh)] space-y-2 overflow-y-auto pr-1">
              {sortedProductCatalog.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-100 bg-[#fafafa] px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-medium text-neutral-900">
                    {row.name}
                  </span>
                  <label className="flex w-[4.5rem] shrink-0 items-center gap-1 text-xs text-[#666666]">
                    <span className="shrink-0">单位</span>
                    <input
                      defaultValue={row.unit}
                      key={`${row.id}-${row.unit}`}
                      onBlur={(e) => {
                        if (e.target.value.trim() === row.unit) return
                        void updateProductCatalogUnit(row.id, e.target.value)
                      }}
                      className="w-full rounded-lg border border-stone-200 bg-white px-1.5 py-1 text-center text-sm text-neutral-900"
                    />
                  </label>
                  <span
                    className={
                      row.source === 'auto'
                        ? 'shrink-0 text-[10px] text-[#999999]'
                        : 'shrink-0 text-[10px] text-[#666666]'
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
      </SettingsSection>

      <SettingsSection title="账本字段">
        <button
          type="button"
          onClick={() => setLedgerFieldsSubOpen(true)}
          className={`${SETTINGS_CARD_CLASS} flex w-full max-w-full items-center justify-between gap-3 text-left transition-colors hover:bg-stone-50/80 active:bg-stone-50`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-900">管理字段</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#666666]">
              加列、改名、必填、删自定义列
            </p>
          </div>
          <SettingsChevronRight className="h-5 w-5 shrink-0 text-[#bbbbbb]" />
        </button>
      </SettingsSection>

      <SettingsSection title="关于">
        <footer className={`${SETTINGS_CARD_CLASS} mb-10`}>
          <p className="font-semibold text-neutral-900">应用版本 {APP_VERSION}</p>
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new Event(TRIGGER_ANDROID_UPDATE_CHECK))
            }
            className="mt-2 min-h-[40px] w-full rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2 text-sm font-medium text-neutral-800 transition-colors hover:bg-stone-100"
          >
            检查更新（Android）
          </button>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[#666666]">
            若下载站配置了网页 zip（见官网说明），将优先热更新并保留登录；仅壳版本不足时才需整包 APK。
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[#666666]">
            记账以手动填写为主；同步见「账号」。
          </p>
        </footer>
      </SettingsSection>
    </div>
  )
}

function SettingsChevronRight({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={2}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  return (
    <div className="min-h-dvh bg-[#f8f9fa] pb-28 pt-12">
      <header className="mb-4 px-4">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="返回设置"
            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-[#666666] shadow-sm transition-colors hover:bg-stone-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth={2}
              stroke="currentColor"
              className="h-5 w-5"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold tracking-tight text-neutral-900">
              账本字段
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-[#666666]">
              含商品、单价、斤数、购买方、金额等内置列；可加自定义列。「必填」在记账页标星并校验。
            </p>
          </div>
        </div>
      </header>

      <div className="mx-4 space-y-6">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">
            添加字段
          </h2>
          <div className={SETTINGS_CARD_CLASS}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="字段名称，例如：备注"
                className="min-h-[44px] flex-1 rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2.5 text-sm text-neutral-900 placeholder:text-[#999999]"
              />
              <select
                value={type}
                onChange={(e) =>
                  setType(e.target.value as 'text' | 'number')
                }
                className="min-h-[44px] rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2.5 text-sm text-neutral-900 sm:w-28"
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
          <h2 className="mb-2 text-sm font-semibold text-neutral-900">
            当前字段
          </h2>
          <div className={SETTINGS_CARD_CLASS}>
            <ul className="space-y-3">
              {sorted.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-100 bg-[#fafafa] px-3 py-3"
                >
                  <EditableName
                    initial={f.name}
                    onSave={(v) => void renameField(f.id, v)}
                  />
                  <span className="rounded-lg bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    {f.type === 'number' ? '数字' : '文本'}
                  </span>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-800">
                    <input
                      type="checkbox"
                      checked={f.required === true}
                      disabled={busy}
                      onChange={(e) =>
                        void setFieldRequired(f.id, e.target.checked)
                      }
                      className="rounded border-stone-300 text-[#2ecc71] focus:ring-[#2ecc71]"
                    />
                    必填
                  </label>
                  {f.key && (
                    <span className="text-xs text-[#999999]">系统默认</span>
                  )}
                  {!f.key && (
                    <button
                      type="button"
                      onClick={() => void removeField(f.id)}
                      className="ml-auto text-sm font-medium text-[#999999] transition-colors hover:text-rose-600"
                    >
                      删除
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
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
      className="min-w-[8rem] flex-1 rounded-xl border border-stone-200 bg-[#fafafa] px-2.5 py-1.5 text-sm text-neutral-900"
    />
  ) : (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-left text-base font-semibold text-neutral-900"
    >
      {initial}
    </button>
  )
}
