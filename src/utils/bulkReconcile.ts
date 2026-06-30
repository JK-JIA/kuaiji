import type { FieldDef, LedgerRecord } from '../types'
import {
  buyerBucketKey,
  getAmountFieldId,
  getExpectedAmount,
  getOutstanding,
  getPlateValue,
  getReceivedAmount,
  sumOutstanding,
} from './recordHelpers'

export type BulkReconcileTarget = {
  buyerKey: string
  buyerLabel: string
  pendingRecords: LedgerRecord[]
  pendingCount: number
  totalOutstanding: number
}

export type BulkReconcileAllocation = {
  recordId: string
  date: string
  expected: number
  previousReceived: number
  allocated: number
  nextReceived: number
  fullySettled: boolean
}

/** 账单按记账日从早到晚；同日按创建时间从早到晚 */
export function sortRecordsOldestFirst(records: LedgerRecord[]): LedgerRecord[] {
  return [...records].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return a.createdAt - b.createdAt
  })
}

/** 当前筛选结果中若仅有一位客户仍有欠款，则可用于批量核账 */
export function resolveBulkReconcileCustomer(
  records: LedgerRecord[],
  fields: FieldDef[],
): BulkReconcileTarget | null {
  const amountId = getAmountFieldId(fields)
  if (!amountId) return null

  const pending = records.filter((r) => {
    const expected = getExpectedAmount(r, amountId)
    if (expected <= 0) return false
    const received = getReceivedAmount(r, expected)
    return getOutstanding(expected, received) > 0
  })
  if (pending.length === 0) return null

  const buyerKeys = new Set(
    pending.map((r) => buyerBucketKey(getPlateValue(r, fields), fields)),
  )
  if (buyerKeys.size !== 1) return null

  const buyerKey = [...buyerKeys][0]!
  return {
    buyerKey,
    buyerLabel: buyerKey,
    pendingRecords: sortRecordsOldestFirst(pending),
    pendingCount: pending.length,
    totalOutstanding: sumOutstanding(pending, fields),
  }
}

/** 按最早账单起依次分配收款；余款不足时最后一单部分核账 */
export function allocateBulkReconcilePayment(
  records: LedgerRecord[],
  fields: FieldDef[],
  paymentAmount: number,
): BulkReconcileAllocation[] {
  const amountId = getAmountFieldId(fields)
  if (!amountId) return []

  const pay = Math.round(Math.max(0, paymentAmount) * 100) / 100
  if (pay <= 0) return []

  let remaining = pay
  const items: BulkReconcileAllocation[] = []

  for (const record of sortRecordsOldestFirst(records)) {
    if (remaining <= 0) break

    const expected = getExpectedAmount(record, amountId)
    if (expected <= 0) continue

    const previousReceived = getReceivedAmount(record, expected)
    const outstanding = getOutstanding(expected, previousReceived)
    if (outstanding <= 0) continue

    const allocated = Math.min(outstanding, remaining)
    const nextReceived = Math.round((previousReceived + allocated) * 100) / 100
    remaining = Math.round((remaining - allocated) * 100) / 100

    items.push({
      recordId: record.id,
      date: record.date,
      expected,
      previousReceived,
      allocated,
      nextReceived,
      fullySettled: nextReceived >= expected - 0.005,
    })
  }

  return items
}
