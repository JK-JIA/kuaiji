import { useMemo, useState } from 'react'
import type { CustomerEntry } from '../../types'
import { SwipeDeleteRow } from '../../components/SwipeDeleteRow'
import {
  customerBuyerToken,
  normalizeCustomerEntry,
} from '../../utils/customerCatalogHelpers'
import { normalizeToken } from '../../utils/voiceHistoryFuzzy'
import {
  SettingsPanelBody,
  SettingsSubHeader,
} from './settingsShell'
import { SETTINGS_CARD_CLASS } from './SettingsSection'

const SETTINGS_SHELL_BG = 'min-h-dvh bg-kj-canvas pb-8'

function newCustomerId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    /* ignore */
  }
  return `customer_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

type Props = {
  customerCatalog: CustomerEntry[]
  customerCatalogSuppressed: string[]
  onSave: (next: CustomerEntry[], suppressed: string[]) => Promise<void>
  onBack: () => void
}

export function CustomerCatalogSettingsScreen({
  customerCatalog,
  customerCatalogSuppressed,
  onSave,
  onBack,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [newBuyerKey, setNewBuyerKey] = useState('')
  const [newName, setNewName] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newContact, setNewContact] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<CustomerEntry | null>(null)

  const sorted = useMemo(
    () =>
      [...customerCatalog].sort((a, b) =>
        a.buyerKey.localeCompare(b.buyerKey, 'zh-CN'),
      ),
    [customerCatalog],
  )

  const addCustomer = async () => {
    const buyerKey = newBuyerKey.trim()
    if (!buyerKey) {
      alert('请输入购买方')
      return
    }
    const nk = normalizeToken(buyerKey)
    const dupIdx = customerCatalog.findIndex(
      (e) => customerBuyerToken(e) === nk,
    )
    if (dupIdx >= 0) {
      const dup = customerCatalog[dupIdx]!
      if (dup.source === 'manual') {
        alert('已有相同购买方（忽略空格后相同）')
        return
      }
      setBusy(true)
      try {
        const updated: CustomerEntry = {
          ...dup,
          buyerKey,
          name: newName.trim() || undefined,
          address: newAddress.trim() || undefined,
          contact: newContact.trim() || undefined,
          source: 'manual',
        }
        await onSave(
          customerCatalog.map((e) => (e.id === dup.id ? updated : e)),
          customerCatalogSuppressed,
        )
        setNewBuyerKey('')
        setNewName('')
        setNewAddress('')
        setNewContact('')
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
      const entry: CustomerEntry = {
        id: newCustomerId(),
        buyerKey,
        name: newName.trim() || undefined,
        address: newAddress.trim() || undefined,
        contact: newContact.trim() || undefined,
        source: 'manual',
      }
      await onSave([...customerCatalog, entry], customerCatalogSuppressed)
      setNewBuyerKey('')
      setNewName('')
      setNewAddress('')
      setNewContact('')
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const removeCustomer = async (entry: CustomerEntry) => {
    setBusy(true)
    try {
      const next = customerCatalog.filter((x) => x.id !== entry.id)
      let suppressed = customerCatalogSuppressed
      const k = customerBuyerToken(entry)
      if (k && !suppressed.includes(k)) suppressed = [...suppressed, k]
      await onSave(next, suppressed)
      if (editingId === entry.id) {
        setEditingId(null)
        setEditDraft(null)
      }
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (entry: CustomerEntry) => {
    setEditingId(entry.id)
    setEditDraft({ ...entry })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft(null)
  }

  const saveEdit = async () => {
    if (!editDraft) return
    const normalized = normalizeCustomerEntry(editDraft)
    if (!normalized) {
      alert('购买方不能为空')
      return
    }
    const nk = customerBuyerToken(normalized)
    const dup = customerCatalog.find(
      (e) => e.id !== normalized.id && customerBuyerToken(e) === nk,
    )
    if (dup) {
      alert('已有相同购买方（忽略空格后相同）')
      return
    }
    setBusy(true)
    try {
      const next = customerCatalog.map((e) =>
        e.id === normalized.id
          ? {
              ...normalized,
              source: e.source === 'auto' ? ('manual' as const) : e.source,
            }
          : e,
      )
      await onSave(next, customerCatalogSuppressed)
      cancelEdit()
    } catch (err) {
      console.error(err)
      alert(err instanceof Error ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={SETTINGS_SHELL_BG}>
      <SettingsSubHeader title="客户管理" onBack={onBack} />
      <SettingsPanelBody>
        <p className="px-1 text-sm leading-relaxed text-stone-500">
          维护购买方及联系信息；记一笔时可快速选择。出现 5 次以上的常购方会自动加入列表。
        </p>
        <div className={SETTINGS_CARD_CLASS}>
          <p className="mb-3 text-sm font-semibold text-kj-primary">添加客户</p>
          <div className="space-y-3">
            <label className="block text-left text-sm font-medium text-kj-secondary">
              购买方
              <input
                value={newBuyerKey}
                onChange={(e) => setNewBuyerKey(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-3 text-base text-kj-primary"
                placeholder="与记账时一致"
                autoComplete="off"
              />
            </label>
            <label className="block text-left text-sm font-medium text-kj-secondary">
              姓名
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-3 text-base text-kj-primary"
                placeholder="可选"
                autoComplete="off"
              />
            </label>
            <label className="block text-left text-sm font-medium text-kj-secondary">
              地址
              <input
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-3 text-base text-kj-primary"
                placeholder="可选"
                autoComplete="off"
              />
            </label>
            <label className="block text-left text-sm font-medium text-kj-secondary">
              联系方式
              <input
                value={newContact}
                onChange={(e) => setNewContact(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-kj-border-strong bg-kj-raised px-3 py-3 text-base text-kj-primary"
                placeholder="电话 / 微信等"
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void addCustomer()}
              className="w-full rounded-xl border border-[#2ecc71] bg-[#2ecc71] py-3 text-base font-semibold text-white shadow-sm disabled:opacity-50"
            >
              添加
            </button>
          </div>
        </div>

        <div className={`mt-4 ${SETTINGS_CARD_CLASS}`}>
          {sorted.length === 0 ? (
            <p className="text-sm text-kj-muted">
              暂无客户；在此添加或记几笔后常购方会自动出现。
            </p>
          ) : (
            <ul className="space-y-3">
              {sorted.map((row) => {
                const isEditing = editingId === row.id && editDraft
                return (
                  <li key={row.id}>
                    <SwipeDeleteRow
                      disabled={busy}
                      confirmTitle="删除客户？"
                      confirmMessage="删除后无法恢复；该购买方将不再自动加入列表。"
                      onDelete={() => void removeCustomer(row)}
                      className="border border-kj-border"
                    >
                      <div className="px-4 py-4">
                        {isEditing ? (
                          <div className="space-y-3">
                            <label className="block text-left text-xs font-medium text-kj-secondary">
                              购买方
                              <input
                                value={editDraft.buyerKey}
                                onChange={(e) =>
                                  setEditDraft((d) =>
                                    d ? { ...d, buyerKey: e.target.value } : d,
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-kj-border-strong bg-kj-raised px-3 py-2 text-sm text-kj-primary"
                              />
                            </label>
                            <label className="block text-left text-xs font-medium text-kj-secondary">
                              姓名
                              <input
                                value={editDraft.name ?? ''}
                                onChange={(e) =>
                                  setEditDraft((d) =>
                                    d ? { ...d, name: e.target.value } : d,
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-kj-border-strong bg-kj-raised px-3 py-2 text-sm text-kj-primary"
                              />
                            </label>
                            <label className="block text-left text-xs font-medium text-kj-secondary">
                              地址
                              <input
                                value={editDraft.address ?? ''}
                                onChange={(e) =>
                                  setEditDraft((d) =>
                                    d ? { ...d, address: e.target.value } : d,
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-kj-border-strong bg-kj-raised px-3 py-2 text-sm text-kj-primary"
                              />
                            </label>
                            <label className="block text-left text-xs font-medium text-kj-secondary">
                              联系方式
                              <input
                                value={editDraft.contact ?? ''}
                                onChange={(e) =>
                                  setEditDraft((d) =>
                                    d ? { ...d, contact: e.target.value } : d,
                                  )
                                }
                                className="mt-1 w-full rounded-lg border border-kj-border-strong bg-kj-raised px-3 py-2 text-sm text-kj-primary"
                              />
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void saveEdit()}
                                className="flex-1 rounded-lg bg-[#2ecc71] py-2 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                保存
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="flex-1 rounded-lg border border-kj-border-strong py-2 text-sm text-kj-secondary"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            className="w-full text-left"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-base font-semibold text-kj-primary">
                                {row.buyerKey}
                              </span>
                              {row.source === 'auto' && (
                                <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">
                                  自动
                                </span>
                              )}
                            </div>
                            {row.name && (
                              <p className="mt-1 text-sm text-kj-secondary">
                                姓名：{row.name}
                              </p>
                            )}
                            {row.address && (
                              <p className="mt-0.5 truncate text-sm text-kj-muted">
                                地址：{row.address}
                              </p>
                            )}
                            {row.contact && (
                              <p className="mt-0.5 text-sm text-kj-muted">
                                联系：{row.contact}
                              </p>
                            )}
                            {!row.name && !row.address && !row.contact && (
                              <p className="mt-1 text-xs text-kj-muted">
                                点击补充姓名、地址与联系方式
                              </p>
                            )}
                          </button>
                        )}
                      </div>
                    </SwipeDeleteRow>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </SettingsPanelBody>
    </div>
  )
}
