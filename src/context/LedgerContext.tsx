import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { FieldDef, LedgerRecord, ReconcilePayload } from '../types'
import {
  addRecord,
  db,
  deleteRecord,
  ensureDefaultFields,
  updateFields,
} from '../db/ledgerDb'
import { getAmountFieldId, parseMoney } from '../utils/recordHelpers'

type LedgerContextValue = {
  ready: boolean
  fields: FieldDef[]
  records: LedgerRecord[]
  refresh: () => Promise<void>
  saveRecord: (rec: LedgerRecord) => Promise<void>
  removeRecord: (id: string) => Promise<void>
  setRecordPayment: (id: string, payload: ReconcilePayload) => Promise<void>
  saveFields: (next: FieldDef[]) => Promise<void>
}

const LedgerContext = createContext<LedgerContextValue | null>(null)

export function LedgerProvider({ children }: { children: ReactNode }) {
  const [fields, setFields] = useState<FieldDef[]>([])
  const [records, setRecords] = useState<LedgerRecord[]>([])
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    const f = await ensureDefaultFields()
    setFields(f)
    const r = await db.records.orderBy('createdAt').reverse().toArray()
    setRecords(r)
    setReady(true)
  }, [])

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
      await addRecord(next)
      await refresh()
    },
    [fields, refresh],
  )

  const removeRecord = useCallback(
    async (id: string) => {
      await deleteRecord(id)
      await refresh()
    },
    [refresh],
  )

  const setRecordPayment = useCallback(
    async (id: string, payload: ReconcilePayload) => {
      const r = await db.records.get(id)
      if (!r) return
      const aid = getAmountFieldId(fields)
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
    [fields, refresh],
  )

  const saveFields = useCallback(
    async (next: FieldDef[]) => {
      await updateFields(next)
      await refresh()
    },
    [refresh],
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
