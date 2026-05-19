import { useMemo } from 'react'
import type { FieldDef, LedgerRecord, ProductCatalogEntry } from '../../types'
import { collectAsrHotwordsFromLedger } from '../../utils/asrHotwordsFromLedger'
import { sanitizeAliasesForProduct } from '../../utils/productAliasHelpers'
import { SETTINGS_CARD_CLASS } from './SettingsSection'
import {
  SETTINGS_SHELL_BG,
  SettingsPanelBody,
  SettingsSubHeader,
} from './settingsShell'

type Props = {
  records: LedgerRecord[]
  fields: FieldDef[]
  productCatalog: ProductCatalogEntry[]
  onBack: () => void
}

export function VoiceLexiconSettingsScreen({
  records,
  fields,
  productCatalog,
  onBack,
}: Props) {
  const hotwords = useMemo(
    () => collectAsrHotwordsFromLedger(records, fields, { productCatalog }),
    [records, fields, productCatalog],
  )

  const aliasRows = useMemo(() => {
    return [...productCatalog]
      .filter((e) => (e.aliases?.length ?? 0) > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      .map((e) => ({
        id: e.id,
        name: e.name,
        aliases: sanitizeAliasesForProduct(e.name, e.aliases ?? []),
      }))
  }, [productCatalog])

  const aliasTermCount = useMemo(
    () => aliasRows.reduce((n, r) => n + r.aliases.length, 0),
    [aliasRows],
  )

  return (
    <div className={SETTINGS_SHELL_BG}>
      <SettingsSubHeader title="语音热词与别名" onBack={onBack} />
      <SettingsPanelBody>
        <p className="px-1 text-[12px] leading-relaxed text-stone-500">
          热词只含规范商品名与近期账单用语，提交给语音识别引擎，帮助听清正确字形。别名是误识别写法（如鼹鼠→烟薯），仅用于智能解析纠正，不会当作热词。
        </p>

        <section className="mt-4">
          <h2 className="px-1 text-[13px] font-semibold text-kj-primary">
            ASR 热词
            <span className="ml-1.5 font-normal text-kj-muted">
              （{hotwords.length} 个，长按语音时提交给识别引擎）
            </span>
          </h2>
          <div className={`mt-2 ${SETTINGS_CARD_CLASS}`}>
            {hotwords.length === 0 ? (
              <p className="text-xs text-kj-muted">
                暂无热词；添加商品或记几笔账单后会自动生成。
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {hotwords.map((w) => (
                  <li
                    key={w}
                    className="rounded-lg border border-kj-border-strong/80 bg-kj-raised px-2 py-1 text-xs text-kj-primary"
                  >
                    {w}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="px-1 text-[13px] font-semibold text-kj-primary">
            商品别名
            <span className="ml-1.5 font-normal text-kj-muted">
              （{aliasRows.length} 个商品 · {aliasTermCount} 个别名）
            </span>
          </h2>
          <div className={`mt-2 ${SETTINGS_CARD_CLASS}`}>
            {aliasRows.length === 0 ? (
              <p className="text-xs text-kj-muted">
                暂无别名。语音解析将「误识别写法」纠正为规范商品名后，会自动记在这里。
              </p>
            ) : (
              <ul className="max-h-[min(22rem,50vh)] space-y-2 overflow-y-auto pr-1">
                {aliasRows.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-xl border border-kj-border bg-kj-raised px-3 py-2.5 text-sm"
                  >
                    <div className="font-medium text-kj-primary">{row.name}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {row.aliases.map((a) => (
                        <span
                          key={`${row.id}-${a}`}
                          className="rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                        >
                          {a}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </SettingsPanelBody>
    </div>
  )
}
