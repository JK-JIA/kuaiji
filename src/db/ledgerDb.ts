import Dexie, { type Table } from 'dexie'
import { getDefaultFieldDefs } from '../constants/defaultLedgerFields'
import { mergeMissingDefaultFields } from '../constants/mergeBuiltinFields'
import type { FieldDef, LedgerRecord, ProductCatalogEntry } from '../types'
import type { VoiceProductCorrection } from '../utils/voiceProductCorrections'
import { parseVoiceProductCorrections } from '../utils/voiceProductCorrections'
import { DEFAULT_FIELD_KEYS } from '../types'
import { normalizeCatalogEntry } from '../utils/productCatalogHelpers'

export type ProductCatalogSettingsRow = {
  id: 'singleton'
  suppressedNormalizedNames: string[]
}

export type VoiceCorrectionsSettingsRow = {
  id: 'singleton'
  corrections: VoiceProductCorrection[]
}

export class LedgerDatabase extends Dexie {
  fields!: Table<FieldDef>
  records!: Table<LedgerRecord>
  productCatalog!: Table<ProductCatalogEntry>
  productCatalogSettings!: Table<ProductCatalogSettingsRow>
  voiceCorrectionsSettings!: Table<VoiceCorrectionsSettingsRow>

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
    this.version(4).stores({
      fields: '&id, order',
      records: '&id, date, createdAt',
      productCatalog: '&id, name',
      productCatalogSettings: '&id',
    })
    this.version(5).stores({
      fields: '&id, order',
      records: '&id, date, createdAt',
      productCatalog: '&id, name',
      productCatalogSettings: '&id',
      voiceCorrectionsSettings: '&id',
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

const CATALOG_SETTINGS_ID = 'singleton' as const

export async function getProductCatalogFromDb(): Promise<ProductCatalogEntry[]> {
  const rows = await db.productCatalog.toArray()
  const out: ProductCatalogEntry[] = []
  for (const r of rows) {
    const n = normalizeCatalogEntry(r as ProductCatalogEntry)
    if (n) out.push(n)
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export async function getProductCatalogSuppressedFromDb(): Promise<string[]> {
  const row = await db.productCatalogSettings.get(CATALOG_SETTINGS_ID)
  return row?.suppressedNormalizedNames?.length
    ? [...row.suppressedNormalizedNames]
    : []
}

export async function replaceProductCatalogInDb(
  entries: ProductCatalogEntry[],
  suppressedNormalizedNames: string[],
): Promise<void> {
  await db.transaction('rw', db.productCatalog, db.productCatalogSettings, async () => {
    await db.productCatalog.clear()
    if (entries.length) await db.productCatalog.bulkPut(entries)
    await db.productCatalogSettings.put({
      id: CATALOG_SETTINGS_ID,
      suppressedNormalizedNames: [...suppressedNormalizedNames],
    })
  })
}

export async function getVoiceProductCorrectionsFromDb(): Promise<
  VoiceProductCorrection[]
> {
  const row = await db.voiceCorrectionsSettings.get(CATALOG_SETTINGS_ID)
  return parseVoiceProductCorrections(row?.corrections ?? [])
}

export async function replaceVoiceProductCorrectionsInDb(
  corrections: VoiceProductCorrection[],
): Promise<void> {
  await db.voiceCorrectionsSettings.put({
    id: CATALOG_SETTINGS_ID,
    corrections: [...corrections],
  })
}
