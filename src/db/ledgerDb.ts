import Dexie, { type Table } from 'dexie'
import { getDefaultFieldDefs } from '../constants/defaultLedgerFields'
import { mergeMissingDefaultFields } from '../constants/mergeBuiltinFields'
import type { FieldDef, LedgerRecord } from '../types'
import { DEFAULT_FIELD_KEYS } from '../types'

export class LedgerDatabase extends Dexie {
  fields!: Table<FieldDef>
  records!: Table<LedgerRecord>

  constructor() {
    super('personal_ledger_db')
    this.version(1).stores({
      fields: '&id, order',
      records: '&id, date, createdAt',
    })
    this.version(2)
      .stores({
        fields: '&id, order',
        records: '&id, date, createdAt',
      })
      .upgrade(async (tx) => {
        const id = DEFAULT_FIELD_KEYS.quantity
        const row = await tx.table('fields').get(id)
        if (!row) return
        const f = row as FieldDef
        if (f.key === 'quantity' && f.type === 'text') {
          await tx.table('fields').put({ ...f, type: 'number' })
        }
      })
    this.version(3)
      .stores({
        fields: '&id, order',
        records: '&id, date, createdAt',
      })
      .upgrade(async (tx) => {
        const all = (await tx.table('fields').toArray()) as FieldDef[]
        if (all.some((f) => f.key === 'unitPrice')) return
        const merged = mergeMissingDefaultFields(all)
        await tx.table('fields').clear()
        await tx.table('fields').bulkPut(merged)
      })
  }
}

export const db = new LedgerDatabase()

export async function ensureDefaultFields(): Promise<FieldDef[]> {
  const defaults = getDefaultFieldDefs()
  await db.transaction('rw', db.fields, async () => {
    for (const row of defaults) {
      try {
        await db.fields.add(row)
      } catch (e: unknown) {
        const name = e instanceof Error ? e.name : ''
        /** 已存在（并发 / StrictMode 重复初始化） */
        if (name !== 'ConstraintError') throw e
      }
    }
  })
  return db.fields.orderBy('order').toArray()
}

export async function addRecord(rec: LedgerRecord): Promise<void> {
  await db.records.put(rec)
}

export async function deleteRecord(id: string): Promise<void> {
  await db.records.delete(id)
}

export async function updateFields(fields: FieldDef[]): Promise<void> {
  await db.transaction('rw', db.fields, async () => {
    await db.fields.clear()
    await db.fields.bulkAdd(fields)
  })
}

/** 用备份文件整体替换本地库（卸载重装后可用 JSON 恢复） */
export async function replaceAllData(
  fields: FieldDef[],
  records: LedgerRecord[],
): Promise<void> {
  await db.transaction('rw', db.fields, db.records, async () => {
    await db.fields.clear()
    await db.records.clear()
    if (fields.length > 0) await db.fields.bulkAdd(fields)
    if (records.length > 0) await db.records.bulkPut(records)
  })
}
