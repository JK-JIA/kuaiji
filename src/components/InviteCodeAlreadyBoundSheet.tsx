type Props = {
  open: boolean
  onClose: () => void
}

export function InviteCodeAlreadyBoundSheet({ open, onClose }: Props) {
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
        className="relative w-full max-w-md rounded-2xl bg-kj-surface p-5 pt-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-kj-muted transition-colors hover:bg-kj-bg hover:text-kj-secondary"
        >
          <span className="text-lg leading-none" aria-hidden>
            ×
          </span>
        </button>
        <h2 className="pr-8 text-base font-bold text-kj-primary">填写邀请码</h2>
        <p className="mt-4 text-sm leading-relaxed text-kj-primary">
          您已被好友邀请，并已获得
          <span className="font-semibold text-[#008055]"> 1 个月 </span>
          会员体验。
        </p>
        <p className="mt-2 text-xs leading-relaxed text-kj-muted">
          每位用户仅可被邀请一次，无法重复填写或更换邀请码。
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-[#2ecc71] py-2.5 text-sm font-semibold text-white"
        >
          知道了
        </button>
      </div>
    </div>
  )
}
