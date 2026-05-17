/** 统计页点击图表/列表项后，跳转首页查看对应账单 */
export type StatsDrillDownPayload = {
  dateFrom: string
  dateTo: string
  /** 购买方（精确包含匹配，与首页筛选一致） */
  plate?: string
  /** 商品（任一行包含，与首页筛选一致） */
  product?: string
  /** 首页顶部提示文案 */
  hint?: string
}

/** React Router location.state 键名 */
export const STATS_DRILL_DOWN_STATE_KEY = 'statsDrillDown' as const

export type StatsDrillDownLocationState = {
  [STATS_DRILL_DOWN_STATE_KEY]?: StatsDrillDownPayload
}

export function buildStatsDrillDownHint(payload: StatsDrillDownPayload): string {
  const parts: string[] = []
  if (payload.product) parts.push(`商品「${payload.product}」`)
  if (payload.plate) parts.push(`${payload.plate}`)
  const range =
    payload.dateFrom === payload.dateTo
      ? payload.dateFrom
      : `${payload.dateFrom} — ${payload.dateTo}`
  if (parts.length > 0) {
    return `来自统计 · ${parts.join(' · ')} · ${range}`
  }
  return `来自统计 · ${range}`
}
