import { useEffect, useMemo, useState } from 'react'
import type { FieldDef } from '../types'
import { useLedger } from '../context/LedgerContext'
import { exportCsv, exportJson } from '../utils/exportData'

export function SettingsPage() {
  const { ready, fields, records, saveFields } = useLedger()
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
      alert('默认字段（商品 / 数量 / 车牌号）不能删除，可改名。')
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
          默认含商品、数量、车牌号；可新增金额、备注等。
        </p>
      </header>

      <section className="mx-4 mb-8 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-medium text-stone-800">导出备份</p>
        <p className="mb-3 text-xs text-stone-500">
          导出当前本地全部账单与字段定义，便于留存或迁移。
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
