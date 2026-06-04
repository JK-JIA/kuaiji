/**
 * 与前端 src/utils/spokenRecordDate.ts 逻辑保持一致（服务端语音解析补全日期）
 */

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

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function addCalendarDays(d: Date, delta: number): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta, 12, 0, 0, 0)
  return next
}

function parseCnInt(raw: string): number | undefined {
  const s = raw.trim()
  if (!s) return undefined
  if (/^\d{1,2}$/.test(s)) {
    const n = parseInt(s, 10)
    return n >= 0 && n <= 99 ? n : undefined
  }
  if (s === '十') return 10
  if (s.length === 2 && s[0] === '十') {
    const digit = CN_DIGIT[s[1]!]
    return digit !== undefined ? 10 + digit : undefined
  }
  if (s.length === 2 && s[1] === '十') {
    const digit = CN_DIGIT[s[0]!]
    return digit !== undefined ? digit * 10 : undefined
  }
  if (s.length === 3 && s[1] === '十') {
    const a = CN_DIGIT[s[0]!]
    const b = CN_DIGIT[s[2]!]
    if (a !== undefined && b !== undefined) return a * 10 + b
  }
  if (s.length === 1) {
    const digit = CN_DIGIT[s]
    return digit !== undefined ? digit : undefined
  }
  return undefined
}

function toYmd(year: number, month: number, day: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const dt = new Date(year, month - 1, day, 12, 0, 0, 0)
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return undefined
  }
  return formatYmd(dt)
}

function parseMonthDay(
  monthRaw: string,
  dayRaw: string,
  year: number,
): string | undefined {
  const m =
    parseCnInt(monthRaw) ??
    (/^\d{1,2}$/.test(monthRaw) ? parseInt(monthRaw, 10) : undefined)
  const d =
    parseCnInt(dayRaw) ??
    (/^\d{1,2}$/.test(dayRaw) ? parseInt(dayRaw, 10) : undefined)
  if (m === undefined || d === undefined) return undefined
  return toYmd(year, m, d)
}

export function parseSpokenRecordDate(
  text: string,
  reference: Date = new Date(),
): string | undefined {
  const t = text.normalize('NFKC').trim()
  if (!t) return undefined

  const year = reference.getFullYear()

  if (/(?:今天|今日)/.test(t)) return formatYmd(reference)
  if (/(?:昨天|昨日)/.test(t)) return formatYmd(addCalendarDays(reference, -1))
  if (/前天/.test(t)) return formatYmd(addCalendarDays(reference, -2))
  if (/(?:明天|明日)/.test(t)) return formatYmd(addCalendarDays(reference, 1))

  const full = t.match(
    /(\d{4})\s*年\s*(\d{1,2}|[零〇一二三四五六七八九十两]+)\s*月\s*(\d{1,2}|[零〇一二三四五六七八九十两]+)\s*(?:日|号)?/,
  )
  if (full) {
    const y = parseInt(full[1]!, 10)
    const md = parseMonthDay(full[2]!, full[3]!, y)
    if (md) return md
  }

  const mdNum = t.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)/)
  if (mdNum) {
    const md = parseMonthDay(mdNum[1]!, mdNum[2]!, year)
    if (md) return md
  }

  const mdCn = t.match(
    /([零〇一二三四五六七八九十两]+)\s*月\s*([零〇一二三四五六七八九十两]+)\s*(?:日|号)/,
  )
  if (mdCn) {
    const md = parseMonthDay(mdCn[1]!, mdCn[2]!, year)
    if (md) return md
  }

  const dayOnly = t.match(/(?<![\d])(\d{1,2})\s*(?:日|号)(?!\s*斤)/)
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

export function resolveVoiceRecordDate(
  utterance: string,
  aiDate?: string | null,
  reference: Date = new Date(),
): string {
  const fromSpeech = parseSpokenRecordDate(utterance, reference)
  if (fromSpeech) return fromSpeech
  const ai = aiDate?.trim()
  if (ai && isValidRecordDateYmd(ai)) {
    if (utteranceHasMonthDayWithoutYear(utterance)) {
      const parts = ai.split('-').map((x) => parseInt(x, 10))
      if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
        const fixed = toYmd(reference.getFullYear(), parts[1]!, parts[2]!)
        if (fixed) return fixed
      }
    }
    return ai
  }
  return formatYmd(reference)
}

function pickAiRecordDate(parsed: Record<string, unknown>): string | undefined {
  const raw =
    parsed['记账日期'] ?? parsed['日期'] ?? parsed['recordDate'] ?? parsed['date']
  if (raw === undefined || raw === null) return undefined
  const s = String(raw).trim()
  if (!isValidRecordDateYmd(s)) return undefined
  return s
}

export function resolveRecordDateFromParse(
  utterance: string,
  parsed: Record<string, unknown>,
  reference: Date = new Date(),
): string {
  return resolveVoiceRecordDate(utterance, pickAiRecordDate(parsed), reference)
}
