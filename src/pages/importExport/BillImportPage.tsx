import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { useLedger } from '../../context/LedgerContext'
import { parseLedgerImportCsv } from '../../utils/exportData'

export function BillImportPage() {
  const { ready, fields, restoreFullBackup } = useLedger()
  const importInputRef = useRef<HTMLInputElement>(null)

  if (!ready) {
    return (
      <div className="kuaiji-settings-shell flex min-h-dvh items-center justify-center text-kj-muted">
        加载中…
      </div>
    )
  }

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
          账单导入
        </h1>
      </header>

      <div className="p-4">
        <div className="kuaiji-card p-4">
          <p className="text-[13px] leading-relaxed text-kj-secondary">
            选择此前在本应用导出的 CSV 文件。导入将
            <span className="font-semibold text-kj-primary">替换当前全部账单</span>
            ，且须与当前账本字段、列名一致；商品目录不会随 CSV 写入，仍以当前数据为准。
          </p>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="kuaiji-btn-primary mt-4 w-full py-3.5 text-[16px]"
          >
            选择 CSV 文件
          </button>
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            void (async () => {
              try {
                const text = await file.text()
                const parsed = parseLedgerImportCsv(text, fields)
                if (!parsed.ok) {
                  alert(parsed.error)
                  return
                }
                const { records: r } = parsed
                const ok = window.confirm(
                  `用 CSV 替换全部 ${r.length} 条账单，不可撤销，继续？`,
                )
                if (!ok) return
                await restoreFullBackup(fields, r)
                alert('恢复完成')
              } catch (err) {
                console.error(err)
                alert(err instanceof Error ? err.message : '读取备份失败')
              }
            })()
          }}
        />
      </div>
    </div>
  )
}
