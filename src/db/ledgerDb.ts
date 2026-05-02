import Dexie, { type Table } from 'dexie'
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
  }
}

export const db = new LedgerDatabase()

const DEFAULT_FIELD_ROWS: FieldDef[] = [
  {
    id: DEFAULT_FIELD_KEYS.product,
    name: '商品',
    type: 'text',
    key: 'product',
    order: 0,
  },
  {
    id: DEFAULT_FIELD_KEYS.quantity,
    name: '数量（斤）',
    type: 'number',
    key: 'quantity',
    order: 1,
  },
  {
    id: DEFAULT_FIELD_KEYS.plate,
    name: '车牌号',
    type: 'text',
    key: 'plate',
    order: 2,
  },
  {
    id: DEFAULT_FIELD_KEYS.amount,
    name: '金额',
    type: 'number',
    key: 'amount',
    order: 3,
  },
]

export async function ensureDefaultFields(): Promise<FieldDef[]> {
  await db.transaction('rw', db.fields, async () => {
    for (const row of DEFAULT_FIELD_ROWS) {
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
