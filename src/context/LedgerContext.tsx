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
  getProductCatalogFromDb,
  getProductCatalogSuppressedFromDb,
  replaceAllData,
  replaceProductCatalogInDb,
  updateFields,
} from '../db/ledgerDb'
import {
  parseProductCatalogEntries,
  parseProductCatalogSuppressed,
} from '../utils/productCatalogHelpers'
import { getAmountFieldId, parseMoney } from '../utils/recordHelpers'
import {
  catalogsEqual,
  mergeAutoProductCatalog,
} from '../utils/productCatalogSync'
import { useAuth } from './AuthContext'

type LedgerContextValue = {
  ready: boolean
  fields: FieldDef[]
  records: LedgerRecord[]
  productCatalog: ProductCatalogEntry[]
  productCatalogSuppressed: string[]
  refresh: () => Promise<void>
  saveRecord: (rec: LedgerRecord) => Promise<void>
  removeRecord: (id: string) => Promise<void>
  setRecordPayment: (id: string, payload: ReconcilePayload) => Promise<void>
  saveFields: (next: FieldDef[]) => Promise<void>
  saveProductCatalog: (
    next: ProductCatalogEntry[],
    nextSuppressed: string[],
  ) => Promise<void>
  restoreFullBackup: (fields: FieldDef[], records: LedgerRecord[]) => Promise<void>
}

const LedgerContext = createContext<LedgerContextValue | null>(null)

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
  const [ready, setReady] = useState(false)

  /**
   * 云端 GET 若缺少 productCatalog 字段（旧服务端 JSON），勿用 [] 误判否则合并会反向 PUT 覆盖掉库里的目录。
   * 同时 saveProductCatalog 在 refresh 前写入，供下一轮兜底。
   */
  const lastRemoteCatalogRef = useRef<ProductCatalogEntry[]>([])
  const lastRemoteSuppressedRef = useRef<string[]>([])

  const refresh = useCallback(async () => {
    if (useRemoteLedger && apiBase && token) {
      const data = await fetchLedger(apiBase, token)
      const raw = data as Record<string, unknown>
      const hasCatalogKey = 'productCatalog' in raw
      const hasSuppressedKey = 'productCatalogSuppressed' in raw

      let fieldsNext = data.fields as FieldDef[]
      let recordsNext = sortRecordsDesc(data.records as LedgerRecord[])
      let catalogNext = hasCatalogKey
        ? parseProductCatalogEntries(raw.productCatalog)
        : [...lastRemoteCatalogRef.current]
      let suppressedNext = hasSuppressedKey
        ? parseProductCatalogSuppressed(raw.productCatalogSuppressed)
        : [...lastRemoteSuppressedRef.current]

      if (hasCatalogKey) lastRemoteCatalogRef.current = catalogNext
      if (hasSuppressedKey) lastRemoteSuppressedRef.current = suppressedNext

      const persistRemote = async (
        f: FieldDef[],
        r: LedgerRecord[],
        c: ProductCatalogEntry[],
        s: string[],
      ) => {
        return putLedger(apiBase, token, {
          fields: f,
          records: r,
          productCatalog: c,
          productCatalogSuppressed: s,
        })
      }

      if (fieldsNext.length === 0) {
        fieldsNext = getDefaultFieldDefs()
        await persistRemote(fieldsNext, recordsNext, catalogNext, suppressedNext)
      } else if (!fieldsNext.some((f) => f.key === 'unitPrice')) {
        fieldsNext = mergeMissingDefaultFields(fieldsNext)
        await persistRemote(fieldsNext, recordsNext, catalogNext, suppressedNext)
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
      lastRemoteCatalogRef.current = catalogNext
      lastRemoteSuppressedRef.current = suppressedNext
      setReady(true)
      return
    }

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
    const prodIdLocal = mergedFields.find((x) => x.key === 'product')?.id
    const mergedLocal = mergeAutoProductCatalog({
      records: r,
      prodId: prodIdLocal,
      existing: catalogLocal,
      suppressedNormalizedNames: suppressedLocal,
    })
    if (!catalogsEqual(mergedLocal, catalogLocal)) {
      await replaceProductCatalogInDb(mergedLocal, suppressedLocal)
      catalogLocal = mergedLocal
    }
    setProductCatalog(catalogLocal)
    setProductCatalogSuppressed(suppressedLocal)
    setReady(true)
  }, [useRemoteLedger, apiBase, token])

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
          productCatalog,
          productCatalogSuppressed,
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
      productCatalog,
      productCatalogSuppressed,
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
          productCatalog,
          productCatalogSuppressed,
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
      productCatalog,
      productCatalogSuppressed,
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
          productCatalog,
          productCatalogSuppressed,
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
      productCatalog,
      productCatalogSuppressed,
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
          productCatalog,
          productCatalogSuppressed,
        })
        await refresh()
        return
      }
      await updateFields(next)
      await refresh()
    },
    [
      records,
      productCatalog,
      productCatalogSuppressed,
      useRemoteLedger,
      apiBase,
      token,
      refresh,
    ],
  )

  const saveProductCatalog = useCallback(
    async (next: ProductCatalogEntry[], nextSuppressed: string[]) => {
      if (useRemoteLedger && apiBase && token) {
        const data = await putLedger(apiBase, token, {
          fields,
          records,
          productCatalog: next,
          productCatalogSuppressed: nextSuppressed,
        })
        const rawPut = data as Record<string, unknown>
        const catParsed =
          'productCatalog' in rawPut
            ? parseProductCatalogEntries(rawPut.productCatalog)
            : next
        const supParsed =
          'productCatalogSuppressed' in rawPut
            ? parseProductCatalogSuppressed(rawPut.productCatalogSuppressed)
            : nextSuppressed
        const catFinal =
          next.length > catParsed.length ? next : catParsed
        const supFinal =
          nextSuppressed.length > supParsed.length ? nextSuppressed : supParsed
        lastRemoteCatalogRef.current = catFinal
        lastRemoteSuppressedRef.current = supFinal
        setProductCatalog(catFinal)
        setProductCatalogSuppressed(supFinal)
        await refresh()
        return
      }
      await replaceProductCatalogInDb(next, nextSuppressed)
      await refresh()
    },
    [fields, records, useRemoteLedger, apiBase, token, refresh],
  )

  const restoreFullBackup = useCallback(
    async (nextFields: FieldDef[], nextRecords: LedgerRecord[]) => {
      if (useRemoteLedger && apiBase && token) {
        await putLedger(apiBase, token, {
          fields: nextFields,
          records: nextRecords,
          productCatalog,
          productCatalogSuppressed,
        })
        await refresh()
        return
      }
      await replaceAllData(nextFields, nextRecords)
      await refresh()
    },
    [
      useRemoteLedger,
      apiBase,
      token,
      refresh,
      productCatalog,
      productCatalogSuppressed,
    ],
  )

  const value = useMemo(
    () => ({
      ready,
      fields,
      records,
      productCatalog,
      productCatalogSuppressed,
      refresh,
      saveRecord,
      removeRecord,
      setRecordPayment,
      saveFields,
      saveProductCatalog,
      restoreFullBackup,
    }),
    [
      ready,
      fields,
      records,
      productCatalog,
      productCatalogSuppressed,
      refresh,
      saveRecord,
      removeRecord,
      setRecordPayment,
      saveFields,
      saveProductCatalog,
      restoreFullBackup,
    ],
  )

  return (
    <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
  )
}

export function useLedger(): LedgerContextValue {
  const ctx = useContext(LedgerContext)
  if (!ctx) {
    throw new Error('useLedger must be used within LedgerProvider')
  }
  return ctx
}
