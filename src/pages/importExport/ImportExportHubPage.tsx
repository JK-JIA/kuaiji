import { Link } from 'react-router-dom'

function Chevron() {
  return (
    <span className="text-kj-muted" aria-hidden>
      ›
    </span>
  )
}

export function ImportExportHubPage() {
  return (
    <div className="kuaiji-settings-shell">
      <header className="kuaiji-sticky-header sticky top-0 z-10 flex items-center justify-between px-3 py-3">
        <Link
          to="/settings"
          className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-kj-secondary hover:bg-kj-hover"
          aria-label="返回"
        >
          ‹
        </Link>
        <h1 className="text-[17px] font-semibold text-kj-primary">导入导出</h1>
        <Link
          to="/settings/import-export/history"
          className="shrink-0 px-2 py-1.5 text-[13px] font-medium text-kj-secondary hover:text-kj-primary"
        >
          导入记录
        </Link>
      </header>

      <div className="space-y-3 p-4">
        <Link
          to="/settings/import-export/import"
          className="kuaiji-card flex items-center gap-4 p-4 transition-colors active:bg-kj-hover"
        >
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-kj-brand-muted text-2xl"
            aria-hidden
          >
            📥
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold text-kj-primary">账单导入</p>
            <p className="mt-0.5 text-[12px] leading-snug text-kj-secondary">
              从 CSV 恢复备份，将替换当前全部账单
            </p>
          </div>
          <Chevron />
        </Link>

        <Link
          to="/settings/import-export/export"
          className="kuaiji-card flex items-center gap-4 p-4 transition-colors active:bg-kj-hover"
        >
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-kj-warning-bg text-2xl"
            aria-hidden
          >
            📤
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold text-kj-primary">账单导出</p>
            <p className="mt-0.5 text-[12px] leading-snug text-kj-secondary">
              选择日期范围，一键分享 CSV（不经手存本地目录）
            </p>
          </div>
          <Chevron />
        </Link>
      </div>
    </div>
  )
}
