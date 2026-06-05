import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import type { FeedbackCategory } from '../api/ledgerClient'
import { APP_VERSION } from '../version'

type Props = {
  open: boolean
  onClose: () => void
  onSubmit: (payload: {
    category: FeedbackCategory
    content: string
    contact?: string
    appVersion: string
    platform: string
  }) => Promise<void>
}

const CATEGORY_OPTIONS: { value: FeedbackCategory; label: string }[] = [
  { value: 'feature', label: '功能建议' },
  { value: 'bug', label: '问题反馈' },
  { value: 'other', label: '其他' },
]

export function FeedbackSheet({ open, onClose, onSubmit }: Props) {
  const [category, setCategory] = useState<FeedbackCategory>('feature')
  const [content, setContent] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (!open) return null

  const resetAndClose = () => {
    setCategory('feature')
    setContent('')
    setContact('')
    setError(null)
    setDone(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/50 p-4 backdrop-blur-[2px] sm:items-center"
      role="presentation"
      onClick={resetAndClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        className="relative max-h-[min(88vh,640px)] w-full max-w-md overflow-y-auto rounded-2xl bg-kj-surface p-5 pt-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={resetAndClose}
          aria-label="关闭"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-kj-muted transition-colors hover:bg-kj-bg hover:text-kj-secondary"
        >
          <span className="text-lg leading-none" aria-hidden>
            ×
          </span>
        </button>
        <h2 id="feedback-title" className="pr-8 text-base font-bold text-kj-primary">
          意见反馈
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-kj-secondary">
          欢迎提出功能建议或问题反馈，我们会认真阅读并在管理后台查看处理。
        </p>

        {done ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-center">
            <p className="text-sm font-semibold text-emerald-800">感谢反馈，已提交成功</p>
            <button
              type="button"
              onClick={resetAndClose}
              className="mt-4 w-full rounded-xl bg-[#2ecc71] py-2.5 text-sm font-semibold text-white"
            >
              关闭
            </button>
          </div>
        ) : (
          <>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-medium text-kj-secondary">
                反馈类型
              </span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                className="w-full rounded-xl border border-kj-border-strong bg-kj-bg px-3 py-2.5 text-sm text-kj-primary"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-medium text-kj-secondary">
                反馈内容
              </span>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                maxLength={5000}
                placeholder="请描述您的建议或遇到的问题（至少 5 字）"
                className="w-full resize-y rounded-xl border border-kj-border-strong bg-kj-bg px-3 py-2.5 text-sm text-kj-primary"
              />
            </label>

            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-medium text-kj-secondary">
                联系方式（选填）
              </span>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                maxLength={120}
                placeholder="手机号或邮箱，便于回复"
                className="w-full rounded-xl border border-kj-border-strong bg-kj-bg px-3 py-2.5 text-sm text-kj-primary"
              />
            </label>

            {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

            <button
              type="button"
              disabled={busy || content.trim().length < 5}
              onClick={() => {
                setBusy(true)
                setError(null)
                void onSubmit({
                  category,
                  content: content.trim(),
                  contact: contact.trim() || undefined,
                  appVersion: APP_VERSION,
                  platform: Capacitor.isNativePlatform()
                    ? Capacitor.getPlatform()
                    : 'web',
                })
                  .then(() => {
                    setDone(true)
                  })
                  .catch((e) => {
                    setError(e instanceof Error ? e.message : '提交失败')
                  })
                  .finally(() => setBusy(false))
              }}
              className="mt-4 w-full rounded-xl bg-[#2ecc71] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? '提交中…' : '提交反馈'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
