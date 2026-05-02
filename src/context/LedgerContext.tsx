import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { FieldDef, LedgerRecord } from '../types'
import {
  addRecord,
  db,
  deleteRecord,
  ensureDefaultFields,
  updateFields,
} from '../db/ledgerDb'

type LedgerContextValue = {
  ready: boolean
  fields: FieldDef[]
  records: LedgerRecord[]
  refresh: () => Promise<void>
  saveRecord: (rec: LedgerRecord) => Promise<void>
  removeRecord: (id: string) => Promise<void>
  toggleSettled: (id: string, settled: boolean) => Promise<void>
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
      await addRecord(rec)
      await refresh()
    },
    [refresh],
  )

  const removeRecord = useCallback(
    async (id: string) => {
      await deleteRecord(id)
      await refresh()
    },
    [refresh],
  )

  const toggleSettled = useCallback(
    async (id: string, settled: boolean) => {
      const r = await db.records.get(id)
      if (!r) return
      await addRecord({ ...r, settled })
      await refresh()
    },
    [refresh],
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
      toggleSettled,
      saveFields,
    }),
    [
      ready,
      fields,
      records,
      refresh,
      saveRecord,
      removeRecord,
      toggleSettled,
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
