import type { ReconcileFilter } from './homeFilters'

export type HomeSearchSummaryInput = {
  /** 从统计页下钻而来 */
  fromStats?: boolean
  plate?: string
  product?: string
  keyword?: string
  dateFrom?: string
  dateTo?: string
  reconcile?: ReconcileFilter
}

function formatDateRange(from: string, to: string): string {
  const f = from.trim()
  const t = to.trim()
  if (f && t && f === t) return f
  if (f || t) return `${f || '不限'}～${t || '不限'}`
  return ''
}

/** 首页搜索结果区：去重、短句展示当前筛选 */
export function buildHomeSearchSummary(input: HomeSearchSummaryInput): string {
  const parts: string[] = []

  if (input.fromStats) parts.push('来自统计')

  const plate = input.plate?.trim()
  if (plate) parts.push(plate)

  const product = input.product?.trim()
  if (product) parts.push(`商品「${product}」`)

  const kw = input.keyword?.trim()
  if (kw) {
    const short = kw.length > 24 ? `${kw.slice(0, 24)}…` : kw
    parts.push(`关键词「${short}」`)
  }

  const range = formatDateRange(input.dateFrom ?? '', input.dateTo ?? '')
  if (range) parts.push(`记账日 ${range}`)

  if (input.reconcile === 'settled') parts.push('已结清')
  else if (input.reconcile === 'pending') parts.push('未结清')

  return parts.join(' · ')
}
