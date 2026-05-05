import { useEffect, useMemo, useRef, useState } from 'react'
import type { FieldDef } from '../types'
import { useAuth } from '../context/AuthContext'
import { useLedger } from '../context/LedgerContext'
import { exportCsv, exportJson, parseLedgerBackupJson } from '../utils/exportData'

export function SettingsPage() {
  const {
    apiBase,
    email: cloudEmail,
    useRemoteLedger,
    login,
    register,
    logout,
  } = useAuth()
  const { ready, fields, records, saveFields, restoreFullBackup } =
    useLedger()
  const importInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState<'text' | 'number'>('text')
  const [busy, setBusy] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authPw, setAuthPw] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

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
      <div className="flex min-h-[50vh] items-center justify-center text-stone-400">
        加载中…
      </div>
    )
  }

  return (
    <div className="pb-28 pt-16">
      <header className="mb-6 px-4">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          自定义字段
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          默认含商品、数量、车牌号、金额（数字）；可新增备注等自定义字段。可为字段勾选「必填」，记账时将标红星并校验。
        </p>
      </header>

      <section className="mx-4 mb-8 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-medium text-stone-800">云端账号</p>
        {!apiBase && (
          <p className="mb-3 text-xs text-stone-500 leading-relaxed">
            构建时在环境变量中设置{' '}
            <code className="rounded bg-stone-100 px-1">VITE_API_URL</code>{' '}
            指向后端（例如 https://你的域名 ），重新打包后即可在此登录；未配置时数据仅存本机。
          </p>
        )}
        {apiBase && (
          <>
            <p className="mb-3 text-xs text-stone-500">
              API：<span className="break-all font-mono">{apiBase}</span>
            </p>
            {useRemoteLedger ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-stone-800">
                  已登录：{cloudEmail ?? '—'}
                </span>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
                >
                  退出登录
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-stone-500 leading-relaxed">
                  默认账号为 <span className="font-mono text-stone-700">admin</span>
                  ，密码 <span className="font-mono text-stone-700">123456</span>
                  （与 docker-compose 首次启动的服务器配套）。新用户请点「注册」并填写有效邮箱。
                </p>
                <input
                  type="text"
                  autoComplete="username"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="账号（默认 admin）或注册邮箱"
                  className="rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2 text-stone-900 placeholder:text-stone-400"
                />
                <input
                  type="password"
                  autoComplete="current-password"
                  value={authPw}
                  onChange={(e) => setAuthPw(e.target.value)}
                  placeholder="密码（至少 6 位）"
                  className="rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2 text-stone-900 placeholder:text-stone-400"
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
                        } catch (e) {
                          alert(
                            e instanceof Error ? e.message : '登录失败',
                          )
                        } finally {
                          setAuthBusy(false)
                        }
                      })()
                    }}
                    className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    登录
                  </button>
                  <button
                    type="button"
                    disabled={
                      authBusy ||
                      !authEmail.trim() ||
                      authPw.length < 6 ||
                      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail.trim())
                    }
                    onClick={() => {
                      void (async () => {
                        setAuthBusy(true)
                        try {
                          await register(authEmail.trim(), authPw)
                          setAuthPw('')
                        } catch (e) {
                          alert(
                            e instanceof Error ? e.message : '注册失败',
                          )
                        } finally {
                          setAuthBusy(false)
                        }
                      })()
                    }}
                    className="rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-800 hover:bg-stone-50"
                  >
                    注册
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="mx-4 mb-8 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-medium text-stone-800">导出 / 恢复备份</p>
        <p className="mb-3 text-xs text-stone-500 leading-relaxed">
          {useRemoteLedger
            ? '当前已登录云端，账单保存在服务器。仍可导出 JSON 作离线存档或多副本备份；从 JSON 恢复会写入云端当前账号。'
            : '未登录云端时，数据保存在本机（IndexedDB）。卸载 App、清理浏览器数据或换设备会清空本地库，请定期导出 JSON。'}
          CSV 仅方便用表格查看，不能完整恢复字段与多商品结构。
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => exportJson(records, fields)}
            className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
          >
            导出 JSON
          </button>
          <button
            type="button"
            onClick={() => exportCsv(records, fields)}
            className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
          >
            导出 CSV
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="rounded-xl border border-stone-300 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-100"
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

      <section className="mx-4 mb-8 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-medium text-stone-800">新增字段</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="字段名称，例如：金额"
            className="flex-1 rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2 text-stone-900 placeholder:text-stone-400"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'text' | 'number')}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-900"
          >
            <option value="text">文本</option>
            <option value="number">数字</option>
          </select>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void addField()}
            className="rounded-xl bg-stone-900 px-5 py-2 font-medium text-white disabled:opacity-50"
          >
            添加
          </button>
        </div>
      </section>

      <ul className="mx-4 space-y-3">
        {sorted.map((f) => (
          <li
            key={f.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm"
          >
            <EditableName
              initial={f.name}
              onSave={(v) => void renameField(f.id, v)}
            />
            <span className="rounded-lg bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
              {f.type === 'number' ? '数字' : '文本'}
            </span>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-stone-700">
              <input
                type="checkbox"
                checked={f.required === true}
                disabled={busy}
                onChange={(e) =>
                  void setFieldRequired(f.id, e.target.checked)
                }
                className="rounded border-stone-300"
              />
              必填
            </label>
            {f.key && (
              <span className="text-xs text-stone-400">系统默认</span>
            )}
            {!f.key && (
              <button
                type="button"
                onClick={() => void removeField(f.id)}
                className="ml-auto text-sm text-stone-400 hover:text-stone-700"
              >
                删除
              </button>
            )}
          </li>
        ))}
      </ul>
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
      className="min-w-[8rem] flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-stone-900"
    />
  ) : (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-left text-lg font-medium text-stone-900"
    >
      {initial}
    </button>
  )
}
