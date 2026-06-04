import { useState } from 'react'
import { normalizeInviteCode } from '../utils/referralInvite'

type Props = {
  open: boolean
  onClose: () => void
  onBind: (code: string) => Promise<void>
  onScan: () => void
}

export function InviteCodeBindSheet({ open, onClose, onBind, onScan }: Props) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/50 p-4 backdrop-blur-[2px] sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-kj-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-kj-primary">填写邀请码</h2>
        <p className="mt-2 text-xs leading-relaxed text-kj-secondary">
          下载后首次使用可填写好友邀请码。每位用户仅可被邀请一次，绑定后不可更换。
        </p>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(normalizeInviteCode(e.target.value))}
          placeholder="请输入 8 位邀请码"
          className="mt-4 w-full rounded-xl border border-kj-border-strong bg-kj-bg px-3 py-2.5 text-sm text-kj-primary"
          autoCapitalize="characters"
        />
        {error ? (
          <p className="mt-2 text-xs text-red-600">{error}</p>
        ) : null}
        <button
          type="button"
          onClick={onScan}
          className="mt-3 w-full rounded-xl border border-kj-border-strong py-2.5 text-sm font-semibold text-kj-primary"
        >
          扫码填写
        </button>
        <button
          type="button"
          disabled={busy || code.length < 4}
          onClick={() => {
            setBusy(true)
            setError(null)
            void onBind(code)
              .then(() => {
                setCode('')
                onClose()
              })
              .catch((e) => {
                setError(e instanceof Error ? e.message : '绑定失败')
              })
              .finally(() => setBusy(false))
          }}
          className="mt-2 w-full rounded-xl bg-[#2ecc71] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? '提交中…' : '确认绑定'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full py-2 text-sm text-kj-muted"
        >
          暂不填写
        </button>
      </div>
    </div>
  )
}
