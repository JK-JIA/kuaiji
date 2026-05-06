/**
 * 语音 WebSocket 诊断日志：可一键复制发给开发者排查（如 Unexpected server response: 400）。
 * 不记录 JWT / 密钥内容。
 */

const MAX_LINES = 300
let lines: string[] = []
const listeners = new Set<() => void>()

function notify() {
  for (const fn of listeners) fn()
}

export function subscribeAsrDiag(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => listeners.delete(onStoreChange)
}

export function getAsrDiagSnapshot(): string {
  return lines.join('\n')
}

export function clearAsrDiag(): void {
  lines = []
  notify()
}

export function asrDiagLog(message: string): void {
  const ts = new Date().toISOString()
  const row = `[${ts}] ${message}`
  const next =
    lines.length >= MAX_LINES
      ? [...lines.slice(-(MAX_LINES - 1)), row]
      : [...lines, row]
  lines = next
  console.info('[ASR-DIAG]', row)
  notify()
}
