import {
  addMonths,
  addWeeks,
  addYears,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
  subYears,
} from 'date-fns'

export type ReportKind = 'week' | 'month' | 'year'

/**
 * 相对「今天所在周期」平移后的锚点日期。
 * offset 0 = 本周周一 / 本月1号 / 本年1月1日（依 kind）
 * offset -1 = 上周 / 上月 / 去年对应锚点
 */
export function getAnchorDateForOffset(
  kind: ReportKind,
  offset: number,
  ref: Date = new Date(),
): Date {
  if (kind === 'week') {
    const monday = startOfWeek(ref, { weekStartsOn: 1 })
    return addWeeks(monday, offset)
  }
  if (kind === 'month') {
    return startOfMonth(addMonths(ref, offset))
  }
  return startOfYear(addYears(ref, offset))
}

/** 当前周报 / 月报 / 年报对应的自然区间（周一开始） */
export function getCurrentReportRange(
  kind: ReportKind,
  ref: Date = new Date(),
): { start: Date; end: Date } {
  if (kind === 'week') {
    const start = startOfWeek(ref, { weekStartsOn: 1 })
    const end = endOfWeek(ref, { weekStartsOn: 1 })
    return { start, end }
  }
  if (kind === 'month') {
    return { start: startOfMonth(ref), end: endOfMonth(ref) }
  }
  return { start: startOfYear(ref), end: endOfYear(ref) }
}

/** 紧邻的上一完整周期：上周 / 上月 / 去年 */
export function getPreviousReportRange(
  kind: ReportKind,
  ref: Date = new Date(),
): { start: Date; end: Date } {
  if (kind === 'week') {
    const thisStart = startOfWeek(ref, { weekStartsOn: 1 })
    const prevStart = subWeeks(thisStart, 1)
    const prevEnd = endOfWeek(prevStart, { weekStartsOn: 1 })
    return { start: prevStart, end: prevEnd }
  }
  if (kind === 'month') {
    const prevRef = subMonths(ref, 1)
    return { start: startOfMonth(prevRef), end: endOfMonth(prevRef) }
  }
  const prevRef = subYears(ref, 1)
  return { start: startOfYear(prevRef), end: endOfYear(prevRef) }
}

export function toDateStr(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}
