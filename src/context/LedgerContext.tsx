import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  fetchLedger,
  putLedger,
} from '../api/ledgerClient'
import { getDefaultFieldDefs } from '../constants/defaultLedgerFields'
import {
  mergeMissingDefaultFields,
  normalizeBuiltinFieldLabels,
} from '../constants/mergeBuiltinFields'
import type {
  FieldDef,
  LedgerRecord,
  ProductCatalogEntry,
  ReconcilePayload,
} from '../types'
import {
  addRecord,
  db,
  deleteRecord,
  ensureDefaultFields,
  getAsrHotwordsSuppressedFromDb,
  getProductCatalogFromDb,
  getProductCatalogSuppressedFromDb,
  getVoiceProductCorrectionsFromDb,
  replaceAllData,
  replaceProductCatalogInDb,
  replaceVoiceProductCorrectionsInDb,
  updateFields,
} from '../db/ledgerDb'
import {
  parseAsrHotwordsSuppressed,
  parseProductCatalogEntries,
  parseProductCatalogSuppressed,
} from '../utils/productCatalogHelpers'
import { catalogsEqual } from '../utils/productCatalogSync'
import { getAmountFieldId, parseMoney } from '../utils/recordHelpers'
import {
  learnFromProductLineEdits,
  parseVoiceProductCorrections,
  type VoiceProductCorrection,
} from '../utils/voiceProductCorrections'
import { sanitizeAllCatalogAliases } from '../utils/productAliasHelpers'
import { mergeAutoProductCatalog } from '../utils/productCatalogSync'
import { useAuth } from './AuthContext'

type FieldsContextValue = {
  fields: FieldDef[]
  saveFields: (next: FieldDef[]) => Promise<void>
}

type RecordsContextValue = {
  ready: boolean
  records: LedgerRecord[]
  refresh: () => Promise<void>
  saveRecord: (rec: LedgerRecord) => Promise<void>
  removeRecord: (id: string) => Promise<void>
  setRecordPayment: (id: string, payload: ReconcilePayload) => Promise<void>
  restoreFullBackup: (fields: FieldDef[], records: LedgerRecord[]) => Promise<void>
}

type CatalogContextValue = {
  productCatalog: ProductCatalogEntry[]
  productCatalogSuppressed: string[]
  asrHotwordsSuppressed: string[]
  voiceProductCorrections: VoiceProductCorrection[]
  saveProductCatalog: (
    next: ProductCatalogEntry[],
    nextSuppressed: string[],
    nextAsrHotwordsSuppressed: string[],
  ) => Promise<void>
  /** 用户保存时：对比语音填入与最终商品名，写入纠错表 */
  learnVoiceProductFromSave: (
    beforeProducts: string[],
    afterProducts: string[],
  ) => Promise<void>
  /** 语音 fuzzy 后静默合并商品别名 */
  mergeVoiceCatalogAliases: (
    nextCatalog: ProductCatalogEntry[],
  ) => Promise<void>
}

type LedgerContextValue = FieldsContextValue & RecordsContextValue & CatalogContextValue

const FieldsContext = createContext<FieldsContextValue | null>(null)
const RecordsContext = createContext<RecordsContextValue | null>(null)
const CatalogContext = createContext<CatalogContextValue | null>(null)

function sortRecordsDesc(recs: LedgerRecord[]): LedgerRecord[] {
  return [...recs].sort((a, b) => b.createdAt - a.createdAt)
}

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { useRemoteLedger, apiBase, token } = useAuth()
  const [fields, setFields] = useState<FieldDef[]>([])
  const [records, setRecords] = useState<LedgerRecord[]>([])
  const [productCatalog, setProductCatalog] = useState<ProductCatalogEntry[]>(
    [],
  )
  const [productCatalogSuppressed, setProductCatalogSuppressed] = useState<
    string[]
  >([])
  const [asrHotwordsSuppressed, setAsrHotwordsSuppressed] = useState<string[]>(
    [],
  )
  const [voiceProductCorrections, setVoiceProductCorrections] = useState<
    VoiceProductCorrection[]
  >([])
  const [ready, setReady] = useState(false)

  /**
   * 云端 GET 若缺少 productCatalog 字段（旧服务端 JSON），勿用 [] 误判否则合并会反向 PUT 覆盖掉库里的目录。
   * 同时 saveProductCatalog 在 refresh 前写入，供下一轮兜底。
   */
  const lastRemoteCatalogRef = useRef<ProductCatalogEntry[]>([])
  const lastRemoteSuppressedRef = useRef<string[]>([])
  const lastRemoteAsrHotwordsSuppressedRef = useRef<string[]>([])
  const lastRemoteCorrectionsRef = useRef<VoiceProductCorrection[]>([])

  const ledgerExtras = useCallback(
    () => ({
      productCatalog,
      productCatalogSuppressed,
      asrHotwordsSuppressed,
      voiceProductCorrections,
    }),
    [
      productCatalog,
      productCatalogSuppressed,
      asrHotwordsSuppressed,
      voiceProductCorrections,
    ],
  )

  const loadLocalSnapshot = useCallback(async () => {
    const f = await ensureDefaultFields()
    const mergedFields = mergeMissingDefaultFields(f)
    const needsLocalPersist = mergedFields.some((nf) => {
      const of = f.find((x) => x.id === nf.id)
      return of && of.name !== nf.name
    })
    if (needsLocalPersist) {
      await updateFields(mergedFields)
    }
    setFields(mergedFields)
    const r = await db.records.orderBy('createdAt').reverse().toArray()
    setRecords(r)

    let catalogLocal = await getProductCatalogFromDb()
    let suppressedLocal = await getProductCatalogSuppressedFromDb()
    const asrHotwordsLocal = await getAsrHotwordsSuppressedFromDb()
    const prodIdLocal = mergedFields.find((x) => x.key === 'product')?.id
    const mergedLocal = mergeAutoProductCatalog({
      records: r,
      prodId: prodIdLocal,
      existing: catalogLocal,
      suppressedNormalizedNames: suppressedLocal,
    })
    if (!catalogsEqual(mergedLocal, catalogLocal)) {
      await replaceProductCatalogInDb(
        mergedLocal,
        suppressedLocal,
        asrHotwordsLocal,
      )
      catalogLocal = mergedLocal
    }
    setProductCatalog(catalogLocal)
    setProductCatalogSuppressed(suppressedLocal)
    setAsrHotwordsSuppressed(asrHotwordsLocal)
    const correctionsLocal = await getVoiceProductCorrectionsFromDb()
    setVoiceProductCorrections(correctionsLocal)
    setReady(true)
  }, [])

  const refresh = useCallback(async () => {
    try {
    if (useRemoteLedger && apiBase && token) {
      const data = await fetchLedger(apiBase, token)
      const raw = data as Record<string, unknown>
      const hasCatalogKey = 'productCatalog' in raw
      const hasSuppressedKey = 'productCatalogSuppressed' in raw
      const hasAsrHotwordsKey = 'asrHotwordsSuppressed' in raw
      const hasCorrectionsKey = 'voiceProductCorrections' in raw

      let fieldsNext = data.fields as FieldDef[]
      let recordsNext = sortRecordsDesc(data.records as LedgerRecord[])
      let catalogNext = hasCatalogKey
        ? parseProductCatalogEntries(raw.productCatalog)
        : [...lastRemoteCatalogRef.current]
      let suppressedNext = hasSuppressedKey
        ? parseProductCatalogSuppressed(raw.productCatalogSuppressed)
        : [...lastRemoteSuppressedRef.current]
      let asrHotwordsNext = hasAsrHotwordsKey
        ? parseAsrHotwordsSuppressed(raw.asrHotwordsSuppressed)
        : [...lastRemoteAsrHotwordsSuppressedRef.current]
      let correctionsNext = hasCorrectionsKey
        ? parseVoiceProductCorrections(raw.voiceProductCorrections)
        : [...lastRemoteCorrectionsRef.current]

      if (hasCatalogKey) lastRemoteCatalogRef.current = catalogNext
      if (hasSuppressedKey) lastRemoteSuppressedRef.current = suppressedNext
      if (hasAsrHotwordsKey) {
        lastRemoteAsrHotwordsSuppressedRef.current = asrHotwordsNext
      }
      if (hasCorrectionsKey) lastRemoteCorrectionsRef.current = correctionsNext

      const persistRemote = async (
        f: FieldDef[],
        r: LedgerRecord[],
        c: ProductCatalogEntry[],
        s: string[],
        hw: string[],
        vc: VoiceProductCorrection[],
      ) => {
        return putLedger(apiBase, token, {
          fields: f,
          records: r,
          productCatalog: c,
          productCatalogSuppressed: s,
          asrHotwordsSuppressed: hw,
          voiceProductCorrections: vc,
        })
      }

      if (fieldsNext.length === 0) {
        fieldsNext = getDefaultFieldDefs()
        await persistRemote(
          fieldsNext,
          recordsNext,
          catalogNext,
          suppressedNext,
          asrHotwordsNext,
          correctionsNext,
        )
      } else if (!fieldsNext.some((f) => f.key === 'unitPrice')) {
        fieldsNext = mergeMissingDefaultFields(fieldsNext)
        await persistRemote(
          fieldsNext,
          recordsNext,
          catalogNext,
          suppressedNext,
          asrHotwordsNext,
          correctionsNext,
        )
      }
      const normalized = normalizeBuiltinFieldLabels(fieldsNext)
      const needsPersist = normalized.some((nf) => {
        const of = fieldsNext.find((x) => x.id === nf.id)
        return of && of.name !== nf.name
      })
      if (needsPersist && normalized.length > 0) {
        await persistRemote(
          normalized,
          recordsNext,
          catalogNext,
          suppressedNext,
          asrHotwordsNext,
          correctionsNext,
        )
        fieldsNext = normalized
      } else {
        fieldsNext = normalized
      }

      const prodId = fieldsNext.find((f) => f.key === 'product')?.id
      const mergedCatalog = mergeAutoProductCatalog({
        records: recordsNext,
        prodId,
        existing: catalogNext,
        suppressedNormalizedNames: suppressedNext,
      })
      if (!catalogsEqual(mergedCatalog, catalogNext)) {
        const wouldShrink = mergedCatalog.length < catalogNext.length
        if (hasCatalogKey && !wouldShrink) {
          await persistRemote(
            fieldsNext,
            recordsNext,
            mergedCatalog,
            suppressedNext,
            asrHotwordsNext,
            correctionsNext,
          )
          catalogNext = mergedCatalog
          lastRemoteCatalogRef.current = catalogNext
        } else if (!hasCatalogKey && !wouldShrink) {
          catalogNext = mergedCatalog
        }
      }

      setFields(fieldsNext)
      setRecords(recordsNext)
      setProductCatalog(catalogNext)
      setProductCatalogSuppressed(suppressedNext)
      setAsrHotwordsSuppressed(asrHotwordsNext)
      setVoiceProductCorrections(correctionsNext)
      lastRemoteCatalogRef.current = catalogNext
      lastRemoteSuppressedRef.current = suppressedNext
      lastRemoteAsrHotwordsSuppressedRef.current = asrHotwordsNext
      lastRemoteCorrectionsRef.current = correctionsNext
      setReady(true)
      return
    }

    await loadLocalSnapshot()
    } catch (err) {
      console.error('[LedgerContext] refresh failed, fallback to local', err)
      try {
        await loadLocalSnapshot()
      } catch (fallbackErr) {
        console.error('[LedgerContext] local fallback failed', fallbackErr)
        setFields(getDefaultFieldDefs())
        setRecords([])
        setProductCatalog([])
        setProductCatalogSuppressed([])
        setAsrHotwordsSuppressed([])
        setReady(true)
      }
    }
  }, [useRemoteLedger, apiBase, token, loadLocalSnapshot])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const saveRecord = useCallback(
    async (rec: LedgerRecord) => {
      const aid = getAmountFieldId(fields)
      const exp = aid ? parseMoney(rec.values[aid] ?? '') : 0
      let next = rec
      if (
        exp > 0 &&
        rec.receivedAmount !== undefined &&
        !Number.isNaN(rec.receivedAmount) &&
        rec.receivedAmount > exp + 0.005
      ) {
        next = {
          ...rec,
          receivedAmount: Math.round(exp * 100) / 100,
          settled: true,
        }
      }

      if (useRemoteLedger && apiBase && token) {
        const list = records.filter((x) => x.id !== next.id)
        list.push(next)
        await putLedger(apiBase, token, {
          fields,
          records: sortRecordsDesc(list),
          ...ledgerExtras(),
        })
        await refresh()
        return
      }

      await addRecord(next)
      await refresh()
    },
    [
      fields,
      records,
      ledgerExtras,
      useRemoteLedger,
      apiBase,
      token,
      refresh,
    ],
  )

  const removeRecord = useCallback(
    async (id: string) => {
      if (useRemoteLedger && apiBase && token) {
        const list = records.filter((x) => x.id !== id)
        await putLedger(apiBase, token, {
          fields,
          records: list,
          ...ledgerExtras(),
        })
        await refresh()
        return
      }
      await deleteRecord(id)
      await refresh()
    },
    [
      fields,
      records,
      ledgerExtras,
      useRemoteLedger,
      apiBase,
      token,
      refresh,
    ],
  )

  const setRecordPayment = useCallback(
    async (id: string, payload: ReconcilePayload) => {
      const aid = getAmountFieldId(fields)

      if (useRemoteLedger && apiBase && token) {
        if (payload.kind !== 'amount') return
        const r = records.find((x) => x.id === id)
        if (!r) return
        const exp = aid ? parseMoney(r.values[aid] ?? '') : 0
        const rounded = Math.round(payload.cumulativeReceived * 100) / 100
        const recv =
          exp > 0
            ? Math.max(0, Math.min(exp, rounded))
            : Math.max(0, rounded)
        const settled =
          exp > 0
            ? recv >= exp - 0.005
            : payload.markSettled === true
        const updated: LedgerRecord = {
          ...r,
          receivedAmount: recv,
          settled,
        }
        const list = records.map((x) => (x.id === id ? updated : x))
        await putLedger(apiBase, token, {
          fields,
          records: list,
          ...ledgerExtras(),
        })
        await refresh()
        return
      }

      const r = await db.records.get(id)
      if (!r) return
      const exp = aid ? parseMoney(r.values[aid] ?? '') : 0

      if (payload.kind === 'amount') {
        const rounded = Math.round(payload.cumulativeReceived * 100) / 100
        const recv =
          exp > 0
            ? Math.max(0, Math.min(exp, rounded))
            : Math.max(0, rounded)
        const settled =
          exp > 0
            ? recv >= exp - 0.005
            : payload.markSettled === true
        await addRecord({
          ...r,
          receivedAmount: recv,
          settled,
        })
      }
      await refresh()
    },
    [
      fields,
      records,
      ledgerExtras,
      useRemoteLedger,
      apiBase,
      token,
      refresh,
    ],
  )

  const saveFields = useCallback(
    async (next: FieldDef[]) => {
      if (useRemoteLedger && apiBase && token) {
        await putLedger(apiBase, token, {
          fields: next,
          records,
          ...ledgerExtras(),
        })
        await refresh()
        return
      }
      await updateFields(next)
      await refresh()
    },
    [
      records,
      ledgerExtras,
      useRemoteLedger,
      apiBase,
      token,
      refresh,
    ],
  )

  const saveProductCatalog = useCallback(
    async (
      next: ProductCatalogEntry[],
      nextSuppressed: string[],
      nextAsrHotwordsSuppressed: string[],
    ) => {
      const catalogSanitized = sanitizeAllCatalogAliases(next)
      if (useRemoteLedger && apiBase && token) {
        const data = await putLedger(apiBase, token, {
          fields,
          records,
          productCatalog: catalogSanitized,
          productCatalogSuppressed: nextSuppressed,
          asrHotwordsSuppressed: nextAsrHotwordsSuppressed,
          voiceProductCorrections,
        })
        const rawPut = data as Record<string, unknown>
        const catParsed =
          'productCatalog' in rawPut
            ? parseProductCatalogEntries(rawPut.productCatalog)
            : catalogSanitized
        const supParsed =
          'productCatalogSuppressed' in rawPut
            ? parseProductCatalogSuppressed(rawPut.productCatalogSuppressed)
            : nextSuppressed
        const hwParsed =
          'asrHotwordsSuppressed' in rawPut
            ? parseAsrHotwordsSuppressed(rawPut.asrHotwordsSuppressed)
            : nextAsrHotwordsSuppressed
        const catFinal =
          catalogSanitized.length > catParsed.length
            ? catalogSanitized
            : catParsed
        const supFinal =
          nextSuppressed.length > supParsed.length ? nextSuppressed : supParsed
        const hwFinal =
          nextAsrHotwordsSuppressed.length > hwParsed.length
            ? nextAsrHotwordsSuppressed
            : hwParsed
        lastRemoteCatalogRef.current = catFinal
        lastRemoteSuppressedRef.current = supFinal
        lastRemoteAsrHotwordsSuppressedRef.current = hwFinal
        setProductCatalog(catFinal)
        setProductCatalogSuppressed(supFinal)
        setAsrHotwordsSuppressed(hwFinal)
        return
      }
      await replaceProductCatalogInDb(
        catalogSanitized,
        nextSuppressed,
        nextAsrHotwordsSuppressed,
      )
      setProductCatalog(catalogSanitized)
      setProductCatalogSuppressed(nextSuppressed)
      setAsrHotwordsSuppressed(nextAsrHotwordsSuppressed)
    },
    [
      fields,
      records,
      voiceProductCorrections,
      useRemoteLedger,
      apiBase,
      token,
    ],
  )

  const persistVoiceCorrections = useCallback(
    async (next: VoiceProductCorrection[]) => {
      setVoiceProductCorrections(next)
      if (useRemoteLedger && apiBase && token) {
        await putLedger(apiBase, token, {
          fields,
          records,
          productCatalog,
          productCatalogSuppressed,
          asrHotwordsSuppressed,
          voiceProductCorrections: next,
        })
        lastRemoteCorrectionsRef.current = next
        return
      }
      await replaceVoiceProductCorrectionsInDb(next)
    },
    [
      fields,
      records,
      productCatalog,
      productCatalogSuppressed,
      asrHotwordsSuppressed,
      useRemoteLedger,
      apiBase,
      token,
    ],
  )

  const learnVoiceProductFromSave = useCallback(
    async (beforeProducts: string[], afterProducts: string[]) => {
      const next = learnFromProductLineEdits(
        beforeProducts,
        afterProducts,
        voiceProductCorrections,
      )
      if (JSON.stringify(next) === JSON.stringify(voiceProductCorrections)) {
        return
      }
      await persistVoiceCorrections(next)
    },
    [voiceProductCorrections, persistVoiceCorrections],
  )

  const mergeVoiceCatalogAliases = useCallback(
    async (nextCatalog: ProductCatalogEntry[]) => {
      if (catalogsEqual(nextCatalog, productCatalog)) return
      await saveProductCatalog(
        nextCatalog,
        productCatalogSuppressed,
        asrHotwordsSuppressed,
      )
    },
    [
      productCatalog,
      productCatalogSuppressed,
      asrHotwordsSuppressed,
      saveProductCatalog,
    ],
  )

  const restoreFullBackup = useCallback(
    async (nextFields: FieldDef[], nextRecords: LedgerRecord[]) => {
      if (useRemoteLedger && apiBase && token) {
        await putLedger(apiBase, token, {
          fields: nextFields,
          records: nextRecords,
          ...ledgerExtras(),
        })
        await refresh()
        return
      }
      await replaceAllData(nextFields, nextRecords)
      await refresh()
    },
    [useRemoteLedger, apiBase, token, refresh, ledgerExtras],
  )

  const fieldsValue = useMemo(
    () => ({ fields, saveFields }),
    [fields, saveFields],
  )

  const recordsValue = useMemo(
    () => ({ ready, records, refresh, saveRecord, removeRecord, setRecordPayment, restoreFullBackup }),
    [ready, records, refresh, saveRecord, removeRecord, setRecordPayment, restoreFullBackup],
  )

  const catalogValue = useMemo(
    () => ({
      productCatalog,
      productCatalogSuppressed,
      asrHotwordsSuppressed,
      voiceProductCorrections,
      saveProductCatalog,
      learnVoiceProductFromSave,
      mergeVoiceCatalogAliases,
    }),
    [
      productCatalog,
      productCatalogSuppressed,
      asrHotwordsSuppressed,
      voiceProductCorrections,
      saveProductCatalog,
      learnVoiceProductFromSave,
      mergeVoiceCatalogAliases,
    ],
  )

  return (
    <FieldsContext.Provider value={fieldsValue}>
      <RecordsContext.Provider value={recordsValue}>
        <CatalogContext.Provider value={catalogValue}>
          {children}
        </CatalogContext.Provider>
      </RecordsContext.Provider>
    </FieldsContext.Provider>
  )
}

export function useFields(): FieldsContextValue {
  const ctx = useContext(FieldsContext)
  if (!ctx) throw new Error('useFields must be used within LedgerProvider')
  return ctx
}

export function useRecords(): RecordsContextValue {
  const ctx = useContext(RecordsContext)
  if (!ctx) throw new Error('useRecords must be used within LedgerProvider')
  return ctx
}

export function useCatalog(): CatalogContextValue {
  const ctx = useContext(CatalogContext)
  if (!ctx) throw new Error('useCatalog must be used within LedgerProvider')
  return ctx
}

export function useLedger(): LedgerContextValue {
  return { ...useFields(), ...useRecords(), ...useCatalog() }
}
