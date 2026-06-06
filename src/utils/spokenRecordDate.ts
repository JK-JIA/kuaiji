import { format, subDays } from 'date-fns'

const CN_DIGIT: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

/** 中文数字转整数（支持 三、十一、二十一、二十） */
function parseCnInt(raw: string): number | undefined {
  const s = raw.trim()
  if (!s) return undefined
  if (/^\d{1,2}$/.test(s)) {
    const n = parseInt(s, 10)
    return n >= 0 && n <= 99 ? n : undefined
  }
  if (s === '十') return 10
  if (s.length === 2 && s[0] === '十') {
    const d = CN_DIGIT[s[1]!]
    return d !== undefined ? 10 + d : undefined
  }
  if (s.length === 2 && s[1] === '十') {
    const d = CN_DIGIT[s[0]!]
    return d !== undefined ? d * 10 : undefined
  }
  if (s.length === 3 && s[1] === '十') {
    const a = CN_DIGIT[s[0]!]
    const b = CN_DIGIT[s[2]!]
    if (a !== undefined && b !== undefined) return a * 10 + b
  }
  if (s.length === 1) {
    const d = CN_DIGIT[s]
    return d !== undefined ? d : undefined
  }
  return undefined
}

function toYmd(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const dt = new Date(year, month - 1, day, 12, 0, 0, 0)
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return undefined
  }
  return format(dt, 'yyyy-MM-dd')
}

function parseMonthDay(
  monthRaw: string,
  dayRaw: string,
  year: number,
): string | undefined {
  const m = parseCnInt(monthRaw) ?? (/^\d{1,2}$/.test(monthRaw) ? parseInt(monthRaw, 10) : undefined)
  const d = parseCnInt(dayRaw) ?? (/^\d{1,2}$/.test(dayRaw) ? parseInt(dayRaw, 10) : undefined)
  if (m === undefined || d === undefined) return undefined
  return toYmd(year, m, d)
}

/**
 * 从口语中提取记账日期 yyyy-MM-dd；未提及日期则返回 undefined。
 * 未说年份时默认 reference 所在年（通常为今年）。
 */
export function parseSpokenRecordDate(
  text: string,
  reference: Date = new Date(),
): string | undefined {
  const t = text.normalize('NFKC').trim()
  if (!t) return undefined

  const year = reference.getFullYear()

  if (/(?:今天|今日)/.test(t)) return format(reference, 'yyyy-MM-dd')
  if (/(?:昨天|昨日)/.test(t)) return format(subDays(reference, 1), 'yyyy-MM-dd')
  if (/前天/.test(t)) return format(subDays(reference, 2), 'yyyy-MM-dd')
  if (/(?:明天|明日)/.test(t)) return format(reference, 'yyyy-MM-dd')

  const skipMonthDay = hasMarketStallLocationPattern(t)

  const full = !skipMonthDay
    ? t.match(
        /(\d{4})\s*年\s*(\d{1,2}|[零〇一二三四五六七八九十两]+)\s*月\s*(\d{1,2}|[零〇一二三四五六七八九十两]+)\s*(?:日|号)?/,
      )
    : null
  if (full) {
    const y = parseInt(full[1]!, 10)
    const md = parseMonthDay(full[2]!, full[3]!, y)
    if (md) return md
  }

  /** 「3月5日」等未说年份 → 今年 reference 年 */
  const mdNum = !skipMonthDay
    ? t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)/)
    : null
  if (mdNum) {
    const md = parseMonthDay(mdNum[1]!, mdNum[2]!, year)
    if (md) return md
  }

  const mdCn = !skipMonthDay
    ? t.match(
        /([零〇一二三四五六七八九十两]+)\s*月\s*([零〇一二三四五六七八九十两]+)\s*(?:日|号)/,
      )
    : null
  if (mdCn) {
    const md = parseMonthDay(mdCn[1]!, mdCn[2]!, year)
    if (md) return md
  }

  /** 仅「5号」「5日」→ 当月 */
  const dayOnly = !skipMonthDay
    ? t.match(/(?<![\d])(\d{1,2})\s*(?:日|号)(?!\s*斤)/)
    : null
  if (dayOnly) {
    const d = parseInt(dayOnly[1]!, 10)
    const md = toYmd(year, reference.getMonth() + 1, d)
    if (md) return md
  }

  return undefined
}

export function isValidRecordDateYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim())
}

/** 记账日期不得超过今天（含语音误把「6排7号」听成「6月7号」的情况） */
export function clampRecordDateToToday(
  ymd: string,
  reference: Date = new Date(),
): string {
  const s = ymd.trim()
  const today = format(reference, 'yyyy-MM-dd')
  if (!isValidRecordDateYmd(s)) return today
  return s > today ? today : s
}

/** 批发市场摊位「几排几号」，不应解析为月日 */
function hasMarketStallLocationPattern(t: string): boolean {
  return (
    /\d+\s*排\s*\d+\s*(?:号|好)?/.test(t) ||
    /[零〇一二三四五六七八九十两]+\s*排\s*(?:[零〇一二三四五六七八九十两]+|\d+)\s*(?:号|好)?/.test(
      t,
    )
  )
}

/** 原话是否只说了月日、未说四位数年份 */
function utteranceHasMonthDayWithoutYear(utterance: string): boolean {
  const t = utterance.normalize('NFKC')
  if (/\d{4}\s*年/.test(t)) return false
  return (
    /\d{1,2}\s*月\s*\d{1,2}\s*(?:日|号)/.test(t) ||
    /[零〇一二三四五六七八九十两]+\s*月\s*[零〇一二三四五六七八九十两]+\s*(?:日|号)/.test(
      t,
    )
  )
}

/** 口语日期优先，其次 AI 返回，否则今天；结果不超过今天 */
export function resolveVoiceRecordDate(
  utterance: string,
  aiDate?: string | null,
  reference: Date = new Date(),
): string {
  const t = utterance.normalize('NFKC')
  const fromSpeech = parseSpokenRecordDate(utterance, reference)
  if (fromSpeech) return clampRecordDateToToday(fromSpeech, reference)

  if (hasMarketStallLocationPattern(t)) {
    return format(reference, 'yyyy-MM-dd')
  }

  const ai = aiDate?.trim()
  if (ai && isValidRecordDateYmd(ai)) {
    if (utteranceHasMonthDayWithoutYear(utterance)) {
      const parts = ai.split('-').map((x) => parseInt(x, 10))
      if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
        const fixed = toYmd(reference.getFullYear(), parts[1]!, parts[2]!)
        if (fixed) return clampRecordDateToToday(fixed, reference)
      }
    }
    return clampRecordDateToToday(ai, reference)
  }
  return format(reference, 'yyyy-MM-dd')
}
