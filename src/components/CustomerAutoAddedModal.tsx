import ReactDOM from 'react-dom'

type Props = {
  open: boolean
  buyerKey: string
  onView: () => void
  onDismiss: () => void
}

export function CustomerAutoAddedModal({
  open,
  buyerKey,
  onView,
  onDismiss,
}: Props) {
  if (!open) return null

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-sm rounded-2xl bg-kj-surface p-5 shadow-xl"
        role="dialog"
        aria-modal
        aria-labelledby="customer-auto-added-title"
      >
        <h2
          id="customer-auto-added-title"
          className="text-base font-bold text-kj-primary"
        >
          客户已自动加入
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-kj-secondary">
          已将客户「
          <span className="font-medium text-kj-primary">{buyerKey}</span>
          」自动加入客户列表。
        </p>
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onDismiss}
            className="w-full rounded-xl border border-[#2ecc71] bg-[#2ecc71] py-3 text-sm font-semibold text-white"
          >
            知道了
          </button>
          <button
            type="button"
            onClick={onView}
            className="w-full rounded-xl border border-kj-border-strong bg-kj-raised py-3 text-sm font-medium text-kj-secondary"
          >
            查看
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
