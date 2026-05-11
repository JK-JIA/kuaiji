import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  fetchLedger,
  putLedger,
} from '../api/ledgerClient'
import { getDefaultFieldDefs } from '../constants/defaultLedgerFields'
import { mergeMissingDefaultFields, normalizeBuiltinFieldLabels } from '../constants/mergeBuiltinFields'
import type { FieldDef, LedgerRecord, ReconcilePayload } from '../types'
import {
  addRecord,
  db,
  deleteRecord,
  ensureDefaultFields,
  replaceAllData,
  updateFields,
} from '../db/ledgerDb'
import { getAmountFieldId, parseMoney } from '../utils/recordHelpers'
import { useAuth } from './AuthContext'

type LedgerContextValue = {
  ready: boolean
  fields: FieldDef[]
  records: LedgerRecord[]
  refresh: () => Promise<void>
  saveRecord: (rec: LedgerRecord) => Promise<void>
  removeRecord: (id: string) => Promise<void>
  setRecordPayment: (id: string, payload: ReconcilePayload) => Promise<void>
  saveFields: (next: FieldDef[]) => Promise<void>
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
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    if (useRemoteLedger && apiBase && token) {
      const data = await fetchLedger(apiBase, token)
      let fieldsNext = data.fields as FieldDef[]
      let recordsNext = sortRecordsDesc(data.records as LedgerRecord[])
      if (fieldsNext.length === 0) {
        fieldsNext = getDefaultFieldDefs()
        await putLedger(apiBase, token, {
          fields: fieldsNext,
          records: recordsNext,
        })
      } else if (!fieldsNext.some((f) => f.key === 'unitPrice')) {
        fieldsNext = mergeMissingDefaultFields(fieldsNext)
        await putLedger(apiBase, token, {
          fields: fieldsNext,
          records: recordsNext,
        })
      }
      const normalized = normalizeBuiltinFieldLabels(fieldsNext)
      const needsPersist = normalized.some((nf) => {
        const of = fieldsNext.find((x) => x.id === nf.id)
        return of && of.name !== nf.name
      })
      if (needsPersist && normalized.length > 0) {
        await putLedger(apiBase, token, {
          fields: normalized,
          records: recordsNext,
        })
      }
      setFields(normalized)
      setRecords(recordsNext)
      setReady(true)
      return
    }

    const f = await ensureDefaultFields()
    const merged = mergeMissingDefaultFields(f)
    const needsLocalPersist = merged.some((nf) => {
      const of = f.find((x) => x.id === nf.id)
      return of && of.name !== nf.name
    })
    if (needsLocalPersist) {
      await updateFields(merged)
    }
    setFields(merged)
    const r = await db.records.orderBy('createdAt').reverse().toArray()
    setRecords(r)
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
        })
        await refresh()
        return
      }

      await addRecord(next)
      await refresh()
    },
    [fields, records, useRemoteLedger, apiBase, token, refresh],
  )

  const removeRecord = useCallback(
    async (id: string) => {
      if (useRemoteLedger && apiBase && token) {
        const list = records.filter((x) => x.id !== id)
        await putLedger(apiBase, token, { fields, records: list })
        await refresh()
        return
      }
      await deleteRecord(id)
      await refresh()
    },
    [fields, records, useRemoteLedger, apiBase, token, refresh],
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
        await putLedger(apiBase, token, { fields, records: list })
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
    [fields, records, useRemoteLedger, apiBase, token, refresh],
  )

  const saveFields = useCallback(
    async (next: FieldDef[]) => {
      if (useRemoteLedger && apiBase && token) {
        await putLedger(apiBase, token, { fields: next, records })
        await refresh()
        return
      }
      await updateFields(next)
      await refresh()
    },
    [records, useRemoteLedger, apiBase, token, refresh],
  )

  const restoreFullBackup = useCallback(
    async (nextFields: FieldDef[], nextRecords: LedgerRecord[]) => {
      if (useRemoteLedger && apiBase && token) {
        await putLedger(apiBase, token, {
          fields: nextFields,
          records: nextRecords,
        })
        await refresh()
        return
      }
      await replaceAllData(nextFields, nextRecords)
      await refresh()
    },
    [useRemoteLedger, apiBase, token, refresh],
  )

  const value = useMemo(
    () => ({
      ready,
      fields,
      records,
      refresh,
      saveRecord,
      removeRecord,
      setRecordPayment,
      saveFields,
      restoreFullBackup,
    }),
    [
      ready,
      fields,
      records,
      refresh,
      saveRecord,
      removeRecord,
      setRecordPayment,
      saveFields,
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
