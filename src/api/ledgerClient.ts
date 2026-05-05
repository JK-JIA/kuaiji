import type { FieldDef, LedgerRecord } from '../types'

const TOKEN_KEY = 'ledger_auth_token'
const EMAIL_KEY = 'ledger_auth_email'

/** 生产构建未注入 VITE_API_URL 时使用，避免 APK 内看不到登录入口 */
const DEFAULT_PUBLIC_API = 'http://8.153.12.131:3001'

export function getApiBase(): string | undefined {
  const v = import.meta.env.VITE_API_URL?.trim()
  if (v) return v
  if (import.meta.env.PROD) return DEFAULT_PUBLIC_API
  return undefined
}

/** 与账本 API 同源的语音识别 WebSocket（需后端配置火山 ASR 环境变量） */
export function getAsrWebSocketUrl(base: string): string {
  const b = base.replace(/\/$/, '')
  if (b.startsWith('https://')) return `wss://${b.slice(8)}/api/asr/stream`
  return `ws://${b.replace(/^http:\/\//, '')}/api/asr/stream`
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getStoredEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY)
  } catch {
    return null
  }
}

export function persistSession(token: string, email: string) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(EMAIL_KEY, email)
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EMAIL_KEY)
}

export type LedgerPayload = {
  fields: FieldDef[]
  records: LedgerRecord[]
}

export type LedgerApiResponse = LedgerPayload & {
  updatedAt?: string
}

async function parseErr(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string }
    return j.error ?? `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

export async function apiLogin(
  base: string,
  email: string,
  password: string,
): Promise<{ token: string; email: string }> {
  const res = await fetch(`${base.replace(/\/$/, '')}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  const j = (await res.json()) as {
    token: string
    user: { email: string }
  }
  return { token: j.token, email: j.user.email }
}

export async function apiRegister(
  base: string,
  email: string,
  password: string,
): Promise<{ token: string; email: string }> {
  const res = await fetch(`${base.replace(/\/$/, '')}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  const j = (await res.json()) as {
    token: string
    user: { email: string }
  }
  return { token: j.token, email: j.user.email }
}

export async function fetchLedger(
  base: string,
  token: string,
): Promise<LedgerApiResponse> {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/ledger`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as LedgerApiResponse
}

export async function putLedger(
  base: string,
  token: string,
  payload: LedgerPayload,
): Promise<LedgerApiResponse> {
  const res = await fetch(`${base.replace(/\/$/, '')}/api/ledger`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await parseErr(res))
  return (await res.json()) as LedgerApiResponse
}
