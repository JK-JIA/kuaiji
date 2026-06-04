export const PENDING_INVITE_CODE_KEY = 'kuaiji_pending_invite_code'

/** 从扫码内容或链接中解析邀请码 */
export function parseInviteCodeFromText(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null

  try {
    if (/^https?:\/\//i.test(s)) {
      const url = new URL(s)
      const fromQuery =
        url.searchParams.get('invite') ??
        url.searchParams.get('ref') ??
        url.searchParams.get('code')
      if (fromQuery) return normalizeInviteCode(fromQuery)
      const parts = url.pathname.split('/').filter(Boolean)
      const inviteIdx = parts.findIndex((p) => p === 'invite' || p === 'ref')
      if (inviteIdx >= 0 && parts[inviteIdx + 1]) {
        return normalizeInviteCode(parts[inviteIdx + 1]!)
      }
    }
  } catch {
    /* not a url */
  }

  const normalized = normalizeInviteCode(s)
  return normalized.length >= 4 ? normalized : null
}

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function readPendingInviteCode(): string | null {
  try {
    const v = localStorage.getItem(PENDING_INVITE_CODE_KEY)?.trim()
    return v ? normalizeInviteCode(v) : null
  } catch {
    return null
  }
}

export function writePendingInviteCode(code: string | null) {
  try {
    if (!code) localStorage.removeItem(PENDING_INVITE_CODE_KEY)
    else localStorage.setItem(PENDING_INVITE_CODE_KEY, normalizeInviteCode(code))
  } catch {
    /* ignore */
  }
}

export function captureInviteCodeFromLocation() {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const code =
    params.get('invite') ?? params.get('ref') ?? params.get('code')
  if (code) writePendingInviteCode(code)
}
