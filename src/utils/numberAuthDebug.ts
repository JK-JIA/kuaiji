/** 登录页一键登录诊断日志（可复制发给开发排查） */

const MAX_LINES = 300
const lines: string[] = []

export function authDebugLog(message: string): void {
  const ts = new Date().toISOString().slice(11, 23)
  const line = `[${ts}] ${message}`
  lines.push(line)
  if (lines.length > MAX_LINES) lines.shift()
}

export function authDebugLogBlock(title: string, data: unknown): void {
  try {
    const body =
      typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    authDebugLog(`--- ${title} ---\n${body}`)
  } catch {
    authDebugLog(`--- ${title} ---\n${String(data)}`)
  }
}

export function getAuthDebugLogText(): string {
  return lines.join('\n')
}

export function clearAuthDebugLog(): void {
  lines.length = 0
}

export async function copyAuthDebugLog(): Promise<boolean> {
  const text = getAuthDebugLogText()
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
