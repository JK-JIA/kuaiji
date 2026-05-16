import { Link } from 'react-router-dom'

function Chevron() {
  return (
    <span className="text-stone-300" aria-hidden>
      ›
    </span>
  )
}

export function ImportExportHubPage() {
  return (
    <div className="min-h-dvh bg-[#f5f5f7] pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200/80 bg-white/95 px-3 py-3 backdrop-blur-md">
        <Link
          to="/settings"
          className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-stone-700 hover:bg-stone-100"
          aria-label="返回"
        >
          ‹
        </Link>
        <h1 className="text-[17px] font-semibold text-stone-900">导入导出</h1>
        <Link
          to="/settings/import-export/history"
          className="shrink-0 px-2 py-1.5 text-[13px] font-medium text-stone-600 hover:text-stone-900"
        >
          导入记录
        </Link>
      </header>

      <div className="space-y-3 p-4">
        <Link
          to="/settings/import-export/import"
          className="flex items-center gap-4 rounded-2xl border border-stone-100 bg-white p-4 shadow-sm transition-colors active:bg-stone-50"
        >
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
            style={{ background: 'linear-gradient(145deg, #e8f8ef 0%, #d4f0e0 100%)' }}
            aria-hidden
          >
            📥
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold text-stone-900">账单导入</p>
            <p className="mt-0.5 text-[12px] leading-snug text-stone-500">
              从 CSV 恢复备份，将替换当前全部账单
            </p>
          </div>
          <Chevron />
        </Link>

        <Link
          to="/settings/import-export/export"
          className="flex items-center gap-4 rounded-2xl border border-stone-100 bg-white p-4 shadow-sm transition-colors active:bg-stone-50"
        >
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl"
            style={{ background: 'linear-gradient(145deg, #fff8e6 0%, #ffefc2 100%)' }}
            aria-hidden
          >
            📤
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-semibold text-stone-900">账单导出</p>
            <p className="mt-0.5 text-[12px] leading-snug text-stone-500">
              选择日期范围，一键分享 CSV（不经手存本地目录）
            </p>
          </div>
          <Chevron />
        </Link>
      </div>
    </div>
  )
}
