import ReactDOM from 'react-dom'

export function CtAccountLegalMenuModal({
  onSelect,
  onClose,
}: {
  onSelect: (key: 'ctService' | 'ctPrivacy') => void
  onClose: () => void
}) {
  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg rounded-t-3xl bg-white shadow-2xl dark:bg-zinc-900 sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-[16px] font-bold text-stone-800 dark:text-white">
            天翼账号认证服务条款
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition-colors hover:bg-stone-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col gap-2 px-5 py-4">
          <button
            type="button"
            onClick={() => onSelect('ctService')}
            className="rounded-xl bg-stone-50 px-4 py-3.5 text-left text-[14px] font-medium text-stone-800 transition-colors hover:bg-stone-100 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            天翼账号服务协议
          </button>
          <button
            type="button"
            onClick={() => onSelect('ctPrivacy')}
            className="rounded-xl bg-stone-50 px-4 py-3.5 text-left text-[14px] font-medium text-stone-800 transition-colors hover:bg-stone-100 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          >
            天翼账号隐私政策
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
