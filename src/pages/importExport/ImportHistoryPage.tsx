import { Link } from 'react-router-dom'

export function ImportHistoryPage() {
  return (
    <div className="min-h-dvh bg-[#f5f5f7] pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-10 flex items-center border-b border-stone-200/80 bg-white/95 px-3 py-3 backdrop-blur-md">
        <Link
          to="/settings/import-export"
          className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-stone-700 hover:bg-stone-100"
          aria-label="返回"
        >
          ‹
        </Link>
        <h1 className="flex-1 text-center text-[17px] font-semibold text-stone-900 pr-10">
          导入记录
        </h1>
      </header>
      <div className="flex flex-col items-center justify-center px-6 pt-24 text-center">
        <p className="text-[15px] text-stone-600">暂无导入记录</p>
        <p className="mt-2 text-[12px] leading-relaxed text-stone-400">
          后续可在此查看从 CSV 恢复备份的历史摘要。
        </p>
      </div>
    </div>
  )
}
