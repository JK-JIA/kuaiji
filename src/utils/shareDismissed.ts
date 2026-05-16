/** 用户在系统分享面板点「取消/关闭」时，Web / Capacitor 会抛错，不应当失败提示 */
export function isShareDismissedByUser(e: unknown): boolean {
  if (
    e &&
    typeof e === 'object' &&
    'name' in e &&
    (e as { name: string }).name === 'AbortError'
  ) {
    return true
  }
  const msg = e instanceof Error ? e.message : String(e)
  const lower = msg.toLowerCase()
  return (
    lower.includes('abort') ||
    lower.includes('cancel') ||
    lower.includes('cancelled') ||
    lower.includes('canceled') ||
    lower.includes('dismiss') ||
    lower.includes('user canceled')
  )
}
