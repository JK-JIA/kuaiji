import { Link } from 'react-router-dom'

export function ImportHistoryPage() {
  return (
    <div className="kuaiji-settings-shell">
      <header className="kuaiji-sticky-header sticky top-0 z-10 flex items-center px-3 py-3">
        <Link
          to="/settings/import-export"
          className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-kj-secondary hover:bg-kj-hover"
          aria-label="返回"
        >
          ‹
        </Link>
        <h1 className="flex-1 text-center text-[17px] font-semibold text-kj-primary pr-10">
          导入记录
        </h1>
      </header>
      <div className="flex flex-col items-center justify-center px-6 pt-24 text-center">
        <p className="text-[15px] text-kj-secondary">暂无导入记录</p>
        <p className="mt-2 text-[12px] leading-relaxed text-kj-muted">
          后续可在此查看从 CSV 恢复备份的历史摘要。
        </p>
      </div>
    </div>
  )
}
