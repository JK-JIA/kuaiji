import { useEffect, useMemo, useRef, useState } from 'react'
import type { FieldDef } from '../types'
import { getApiBase } from '../api/ledgerClient'
import { useAuth } from '../context/AuthContext'
import { useLedger } from '../context/LedgerContext'
import { exportCsv, exportJson, parseLedgerBackupJson } from '../utils/exportData'
import { APP_VERSION } from '../version'

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
  const { ready, fields, records, saveFields, restoreFullBackup } =
    useLedger()
  const importInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState<'text' | 'number'>('text')
  const [busy, setBusy] = useState(false)
  const sorted = useMemo(
    () => [...fields].sort((a, b) => a.order - b.order),
    [fields],
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
      alert('默认字段（商品 / 数量 / 车牌号 / 金额）不能删除，可改名。')
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

  return (
    <div className="min-h-dvh bg-[#f8f9fa] pb-28 pt-12">
      <header className="mb-4 px-4">
        <h1 className="text-[22px] font-bold tracking-tight text-neutral-900">
          设置
        </h1>
        <p className="mt-0.5 text-xs leading-relaxed text-[#666666]">
          管理字段、备份与云端账号登录。
        </p>
      </header>

      <section className="mx-4 mb-6 rounded-2xl border border-stone-200/90 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-neutral-900">云端同步</p>
        {!apiBase && (
          <p className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
            当前构建未包含可用的 API 地址，无法登录云端。请在源码根目录配置{' '}
            <code className="rounded-md bg-amber-100/90 px-1.5 py-0.5 font-mono text-[11px]">
              VITE_API_URL
            </code>{' '}
            后重新执行{' '}
            <code className="rounded-md bg-amber-100/90 px-1.5 py-0.5 font-mono text-[11px]">
              npm run build
            </code>{' '}
            再打 APK；未登录时数据仅存本机。
          </p>
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
                  已登录且云备份已开通：
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
                  已登录：<span className="font-medium">{cloudEmail ?? '—'}</span>
                </p>
                <p className="text-[11px] leading-relaxed text-amber-900">
                  当前账号尚未兑换会员，云端账本不会同步。请在下方输入兑换码（Docker
                  部署时可通过{' '}
                  <code className="rounded bg-amber-100 px-1 font-mono text-[10px]">
                    redeem-daily
                  </code>{' '}
                  服务日志获取每日码）。
                </p>
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
                  登录后可兑换会员并开启云端备份。默认账号{' '}
                  <span className="font-mono text-neutral-800">admin</span> /{' '}
                  <span className="font-mono text-neutral-800">123456</span>
                  （docker 首次启动）。手机号登录由服务端通过阿里云发送短信验证码。
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
      </section>

      <header className="mb-3 px-4">
        <h2 className="text-sm font-semibold text-neutral-900">自定义字段</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-[#666666]">
          默认含商品、数量、车牌号、金额（数字）；可新增备注等自定义字段。可为字段勾选「必填」，记账时将标红星并校验。
        </p>
      </header>

      <section className="mx-4 mb-6 rounded-2xl border border-stone-200/90 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-neutral-900">
          导出 / 恢复备份
        </p>
        <p className="mb-3 text-[11px] leading-relaxed text-[#666666]">
          {useRemoteLedger
            ? '当前已开通云备份，账单保存在服务器。仍可导出 JSON 作离线存档；从 JSON 恢复会写入云端当前账号。'
            : token && apiBase && !membershipActive
              ? '已登录但未开通云备份，数据仍仅存本机；兑换会员后才会同步到服务器。请定期导出 JSON。'
              : '数据保存在本机（IndexedDB）。卸载 App、清理数据或换设备会清空本地库，请定期导出 JSON。'}
          CSV 仅方便用表格查看，不能完整恢复字段与多商品结构。
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => exportJson(records, fields)}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm transition-colors hover:bg-stone-50"
          >
            导出 JSON
          </button>
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
            从 JSON 恢复…
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              void (async () => {
                try {
                  const text = await file.text()
                  const parsed = parseLedgerBackupJson(text)
                  if (!parsed.ok) {
                    alert(parsed.error)
                    return
                  }
                  const { fields: f, records: r } = parsed.data
                  const ok = window.confirm(
                    `将用备份替换当前全部数据（共 ${r.length} 条账单）。此操作不可撤销，确定继续？`,
                  )
                  if (!ok) return
                  await restoreFullBackup(f, r)
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
      </section>

      <section className="mx-4 mb-6 rounded-2xl border border-stone-200/90 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-neutral-900">新增字段</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="字段名称，例如：金额"
            className="min-h-[44px] flex-1 rounded-xl border border-stone-200 bg-[#fafafa] px-3 py-2.5 text-sm text-neutral-900 placeholder:text-[#999999]"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'text' | 'number')}
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
      </section>

      <ul className="mx-4 space-y-3">
        {sorted.map((f) => (
          <li
            key={f.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200/90 bg-white px-4 py-3.5 shadow-sm"
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

      <footer className="mx-4 mb-10 mt-6 rounded-2xl border border-stone-200/90 bg-white px-4 py-3.5 text-[11px] leading-relaxed text-[#666666] shadow-sm">
        <p className="font-semibold text-neutral-900">应用版本 {APP_VERSION}</p>
        <p className="mt-1.5">
          本版为<strong className="font-medium text-neutral-800">纯手动录入</strong>
          ：在记账页逐项填写或粘贴；无应用内语音解析。配置{' '}
          <code className="rounded-md bg-[#f8f9fa] px-1.5 py-0.5 font-mono text-[11px] text-neutral-800">
            VITE_API_URL
          </code>{' '}
          后，可在「云端同步」使用邮箱或手机号登录，兑换会员后数据同步至自建后端。
        </p>
      </footer>
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
