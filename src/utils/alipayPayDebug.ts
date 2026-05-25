/** 支付宝会员支付诊断日志（设置页可复制发给开发排查） */

const MAX_LINES = 400
const lines: string[] = []

export function alipayDebugLog(message: string): void {
  const ts = new Date().toISOString().slice(11, 23)
  const line = `[${ts}] ${message}`
  lines.push(line)
  if (lines.length > MAX_LINES) lines.shift()
}

export function alipayDebugLogBlock(title: string, data: unknown): void {
  try {
    const body =
      typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    alipayDebugLog(`--- ${title} ---\n${body}`)
  } catch {
    alipayDebugLog(`--- ${title} ---\n${String(data)}`)
  }
}

export function getAlipayPayDebugLogText(): string {
  return lines.join('\n')
}

export function clearAlipayPayDebugLog(): void {
  lines.length = 0
}

export async function copyAlipayPayDebugLog(): Promise<boolean> {
  const text = getAlipayPayDebugLogText()
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}
