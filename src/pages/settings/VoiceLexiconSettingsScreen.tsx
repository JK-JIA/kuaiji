import { useMemo, useState } from 'react'
import type { FieldDef, LedgerRecord, ProductCatalogEntry } from '../../types'
import { collectAsrHotwordsFromLedger } from '../../utils/asrHotwordsFromLedger'
import {
  removeAliasFromCatalog,
  sanitizeAliasesForProduct,
} from '../../utils/productAliasHelpers'
import { normalizeToken } from '../../utils/voiceHistoryFuzzy'
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
  asrHotwordsSuppressed: string[]
  onSaveLexicon: (
    catalog: ProductCatalogEntry[],
    suppressedHotwords: string[],
  ) => Promise<void>
  onBack: () => void
}

function addSuppressedHotword(list: string[], term: string): string[] {
  const k = normalizeToken(term)
  if (!k || list.includes(k)) return list
  return [...list, k]
}

export function VoiceLexiconSettingsScreen({
  records,
  fields,
  productCatalog,
  asrHotwordsSuppressed,
  onSaveLexicon,
  onBack,
}: Props) {
  const [busy, setBusy] = useState(false)

  const hotwords = useMemo(
    () =>
      collectAsrHotwordsFromLedger(records, fields, {
        productCatalog,
        asrHotwordsSuppressed,
      }),
    [records, fields, productCatalog, asrHotwordsSuppressed],
  )

  const aliasRows = useMemo(() => {
    return [...productCatalog]
      .filter((e) => (e.aliases?.length ?? 0) > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      .map((e) => ({
        id: e.id,
        name: e.name,
        aliases: sanitizeAliasesForProduct(
          e.name,
          e.aliases ?? [],
          productCatalog,
        ),
      }))
  }, [productCatalog])

  const aliasTermCount = useMemo(
    () => aliasRows.reduce((n, r) => n + r.aliases.length, 0),
    [aliasRows],
  )

  const runSave = async (
    nextCatalog: ProductCatalogEntry[],
    nextHotwordsSuppressed: string[],
  ) => {
    setBusy(true)
    try {
      await onSaveLexicon(nextCatalog, nextHotwordsSuppressed)
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  const removeAlias = (productId: string, alias: string) => {
    void runSave(
      removeAliasFromCatalog(productCatalog, productId, alias),
      asrHotwordsSuppressed,
    )
  }

  const removeHotword = (term: string) => {
    void runSave(
      productCatalog,
      addSuppressedHotword(asrHotwordsSuppressed, term),
    )
  }

  return (
    <div className={SETTINGS_SHELL_BG}>
      <SettingsSubHeader title="语音热词与别名" onBack={onBack} />
      <SettingsPanelBody>
        <p className="px-1 text-[12px] leading-relaxed text-stone-500">
          热词来自商品目录与近期账单，提交给语音识别引擎。别名在语音记账后可能自动学习（如听错写法），仅用于智能解析纠正；别名不能与其它商品的规范名或别名重复。点 × 可删除错误项。
        </p>

        <section className="mt-4">
          <h2 className="px-1 text-[13px] font-semibold text-kj-primary">
            ASR 热词
            <span className="ml-1.5 font-normal text-kj-muted">
              （{hotwords.length} 个，长按语音时提交）
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
                  <li key={w}>
                    <span className="inline-flex items-center gap-0.5 rounded-lg border border-kj-border-strong/80 bg-kj-raised pl-2 pr-1 py-1 text-xs text-kj-primary">
                      {w}
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`删除热词 ${w}`}
                        onClick={() => removeHotword(w)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-stone-400 hover:bg-stone-200/80 hover:text-rose-600 disabled:opacity-40"
                      >
                        ×
                      </button>
                    </span>
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
                暂无别名。语音解析纠正后会自动记录，也可在此删除错误别名。
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
                          className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 pl-2 pr-1 py-0.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                        >
                          {a}
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={`删除别名 ${a}`}
                            onClick={() => removeAlias(row.id, a)}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-amber-700/70 hover:bg-amber-100 hover:text-rose-700 disabled:opacity-40 dark:hover:bg-amber-900/60"
                          >
                            ×
                          </button>
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
